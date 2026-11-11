"""Result options: how a query run is shaped before it goes back to the page.

A run returns one of two tables. The metadata table says which nodes and streams the query matched (no
values) and is never shaped. The readings table holds the timeseries values of the matched streams. The
options pick between them and, for readings, set a limit, an order, a wide or narrow layout and an optional
group-by.

Acquirium does the limiting and ordering of readings itself (Query.data). The readings arrive one row per
reading (the narrow layout), with a column for each entity the stream belongs to (see readings.py). The wide
layout and the grouping are polars calls made here after the pull.
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
VALUE_COLUMN = "value_numeric"
# Every column Acquirium's narrow readings layout has. Any other column of a readings table names an entity
# (the alias of an entity or related step) and holds the label of the entity a stream belongs to.
NARROW_COLUMNS = ["data_alias", "point_id", "time", VALUE_COLUMN, "value_text"]
# Between the entities and the stream in a wide column name: 'Pump 1 | intake in flow rate'
ENTITY_SEPARATOR = " | "

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
    shape: readings only: "wide" is one column per stream, "narrow" one row per reading. Either way every
    stream says which entity it belongs to: a column per entity (narrow) or the entity in the column name (wide).
    group_by, aggregate: readings only: one row per stream, with the values aggregated. A stream is told apart
    per entity, so two pumps' streams with the same name stay two rows. That needs the narrow layout, so a
    grouped run ignores `shape`.

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
    """The keywords for Query.data(): how many readings per stream to fetch and in which direction."""
    return {"limit": options.limit or DEFAULT_READINGS_LIMIT, "order": options.order}

def _check_columns(names: list[str], allowed: list[str]) -> None:
    unknown = [name for name in names if name not in allowed]
    if unknown:
        raise ValueError(f"Cannot group by {', '.join(unknown)}; available: {', '.join(allowed)}")

def entity_columns(table: pl.DataFrame) -> list[str]:
    """The columns of a readings table that name entities: everything the narrow layout does not have."""
    return [column for column in table.columns if column not in NARROW_COLUMNS]

def widen(table: pl.DataFrame, order: str) -> pl.DataFrame:
    """Narrow readings as one column per stream: 'time' and then 'Pump 1 | intake in flow rate', the columns of
    one entity together and sorted by entity and then stream. A stream with no entity keeps its plain name. If two streams would get the same name (one point under two entities with
    the same label), their point_id is added so no reading is dropped."""
    entities = entity_columns(table)
    owner = pl.concat_list([pl.col(column) for column in entities]).list.drop_nulls().list.join(", ").fill_null("") if entities else pl.lit("")
    keyed = table.with_columns(owner.alias("_owner")).with_columns(
        pl.when(pl.col("_owner") != "")
        .then(pl.concat_str([pl.col("_owner"), pl.lit(ENTITY_SEPARATOR), pl.col("data_alias")]))
        .otherwise(pl.col("data_alias"))
        .alias("_column")
    )
    clashing = keyed.group_by("_column").agg(pl.col("point_id").n_unique().alias("points")).filter(pl.col("points") > 1)["_column"]
    keyed = keyed.with_columns(
        pl.when(pl.col("_column").is_in(clashing))
        .then(pl.concat_str([pl.col("_column"), pl.lit(" ["), pl.col("point_id"), pl.lit("]")]))
        .otherwise(pl.col("_column"))
        .alias("_column"),
        pl.coalesce(pl.col(VALUE_COLUMN).cast(pl.String), pl.col("value_text")).alias("_value"),
    )
    wide = keyed.pivot(on="_column", index="time", values="_value", aggregate_function="first")
    # the pivot orders columns by when each stream first has data, which scatters an entity's streams; put them
    # together, entity by entity (so a heading over them spans them all), each entity's streams by name
    columns = keyed.select("_owner", "_column").unique().sort("_owner", "_column")["_column"].to_list()
    return wide.select(["time", *columns]).sort("time", descending=order == "desc")

def shape_readings(table: pl.DataFrame, options: ResultOptions) -> pl.DataFrame:
    """The pulled readings (narrow, with their entity columns) as the user asked: grouped per entity and stream
    when group_by is set, else one column per stream (wide) or as pulled (narrow)."""
    if options.group_by:
        _check_columns(options.group_by, STREAM_COLUMNS)
    name = "count" if options.aggregate == "count" else f"{options.aggregate}(value)"
    if table.height == 0:
        if options.group_by:
            return pl.DataFrame({column: [] for column in [*options.group_by, name]})
        return pl.DataFrame({"time": []}) if options.shape == "wide" else pl.DataFrame({column: [] for column in NARROW_COLUMNS})
    if not options.group_by:
        return widen(table, options.order) if options.shape == "wide" else table
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
    keys = [*entity_columns(table), *options.group_by]
    return chronological.group_by(keys, maintain_order=True).agg(aggregates[options.aggregate].alias(name))
