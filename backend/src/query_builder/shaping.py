"""Result options: how a query run is shaped before it goes back to the page.

A run returns one of two tables. The metadata table says which nodes and streams the query matched (no
values) and is never shaped. The readings table holds the timeseries values of the matched streams. The
options pick between them and, for readings, set a limit, an order, a wide or narrow layout and an optional
group-by.

Acquirium does the limiting, ordering and layout of readings itself (Query.dataframe). Grouping is not
an Acquirium option, so it is a polars call made here after the pull.
"""
from typing import Annotated, Literal, Optional
import polars as pl
from pydantic import BaseModel, BeforeValidator, Field, field_validator, model_validator

# Readings pulled per stream when the user set no limit, so a run never pulls a stream's whole history
DEFAULT_READINGS_LIMIT = 100
# Most readings per stream a run may ask for
MAX_READINGS_LIMIT = 100_000

# Columns of the narrow readings layout that identify a stream; the only ones readings can be grouped by
STREAM_COLUMNS = ["data_alias", "point_id"]
# The column of the narrow readings layout that holds the numbers an aggregate works on
VALUE_COLUMN = "value (numeric)"

Aggregate = Literal["count", "mean", "min", "max", "sum", "first", "last"]

def _strip_names(value):
    """Trims each group-by name and drops blank ones, so the page can send its form fields as-is."""
    if isinstance(value, list):
        return [name.strip() for name in value if isinstance(name, str) and name.strip()]
    return value

class ResultOptions(BaseModel):
    """What a run returns. The defaults are the plain metadata table.

    view: "metadata" (which nodes and streams matched) or "readings" (their timeseries values).
    limit: readings only: most readings per stream (DEFAULT_READINGS_LIMIT when unset).
    order: readings only: "desc" is newest first, which with a limit keeps the newest readings.
    shape: readings only: "wide" is one column per stream, "narrow" one row per reading.
    group_by, aggregate: readings only: one row per stream, with the values aggregated. That needs the narrow
    layout, so it is pulled narrow whatever `shape` says.

    The metadata table has no options: a limit or group-by with view "metadata" is rejected, not ignored.
    """
    view: Literal["metadata", "readings"] = "metadata"
    limit: Optional[int] = Field(default=None, ge=1, le=MAX_READINGS_LIMIT)
    order: Literal["asc", "desc"] = "desc"
    shape: Literal["wide", "narrow"] = "wide"
    group_by: Annotated[list[str], BeforeValidator(_strip_names)] = []
    aggregate: Aggregate = "count"

    @model_validator(mode="after")
    def _only_readings_are_shaped(self) -> "ResultOptions":
        if self.view == "metadata" and (self.limit is not None or self.group_by):
            raise ValueError('limit and group_by shape readings: set view to "readings"')
        return self

    @field_validator("group_by")
    @classmethod
    def _group_each_column_once(cls, names: list[str]) -> list[str]:
        repeated = sorted({name for name in names if names.count(name) > 1})
        if repeated:
            raise ValueError(f"group by each column at most once (repeated: {', '.join(repeated)})")
        return names

def readings_arguments(options: ResultOptions) -> dict:
    """The keywords for Query.dataframe(). Grouping needs one row per reading, so it forces the narrow layout."""
    return {
        "limit": options.limit or DEFAULT_READINGS_LIMIT,
        "order": options.order,
        "shape": "narrow" if options.group_by else options.shape,
    }

def _check_columns(names: list[str], allowed: list[str]) -> None:
    unknown = [name for name in names if name not in allowed]
    if unknown:
        raise ValueError(f"Cannot group by {', '.join(unknown)}; available: {', '.join(allowed)}")

def shape_readings(table: pl.DataFrame, options: ResultOptions) -> pl.DataFrame:
    """The pulled readings, grouped per stream when asked. Without a group-by they are returned as pulled."""
    if not options.group_by:
        return table
    _check_columns(options.group_by, STREAM_COLUMNS)
    name = "count" if options.aggregate == "count" else f"{options.aggregate}(value)"
    if table.height == 0:
        return pl.DataFrame({column: [] for column in [*options.group_by, name]})
    value = pl.col(VALUE_COLUMN)
    aggregates = {
        "count": pl.len(),
        "mean": value.mean(),
        "min": value.min(),
        "max": value.max(),
        "sum": value.sum(),
        "first": value.first(),
        "last": value.last(),
    }
    # oldest to newest, so "first" and "last" mean earliest and latest in time whatever order was pulled
    chronological = table.sort("time", maintain_order=True)
    return chronological.group_by(options.group_by, maintain_order=True).agg(aggregates[options.aggregate].alias(name))
