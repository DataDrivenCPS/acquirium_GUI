"""Runs a query for streams chosen in the streams window, instead of for the query builder's steps.

Acquirium cannot pin a measurement to an identifier, so the whole streams table is read (the same query the
streams window uses) and the chosen points are picked out of it with polars. A point is therefore only ever
compared with Acquirium's own answers and is never written into a query.

Readings are pulled and shaped by the same code the query builder uses (readings.py, shaping.py), so the
layout, the limit and the grouping behave the same whichever way the streams were chosen.
"""
from typing import Any
import polars as pl
from src.query_builder.query_spec import table_result
from src.query_builder.readings import pull_readings
from src.query_builder.shaping import ResultOptions, shape_readings
from src.streams import POINT, STREAM_ATTRIBUTES

def _chosen_metadata(acq: Any, points: list[str]) -> pl.DataFrame:
    """The streams table cut down to the chosen points, in the order they were chosen. Raises ValueError for a point that is not a stream."""
    table = acq.query().measurement(alias=POINT).include(*STREAM_ATTRIBUTES).metadata()
    known = set(table[POINT]) if POINT in table.columns else set()
    missing = [point for point in points if point not in known]
    if missing:
        raise ValueError(f"No stream found for {', '.join(repr(point) for point in missing)}")
    rows = {row[POINT]: row for row in table.filter(pl.col(POINT).is_in(points)).to_dicts()}
    return pl.DataFrame([rows[point] for point in points], schema=table.schema)

def run_streams(acq: Any, points: list[str], options: ResultOptions) -> dict:
    """The metadata (or, for the readings view, the readings) of the streams named by `points`, shaped like run_query's answer.

    Raises ValueError for an empty selection or a point that is not a stream; the backend turns that into HTTP 400.
    """
    points = list(dict.fromkeys(points))
    if not points:
        raise ValueError("Select at least one stream")
    metadata = _chosen_metadata(acq, points)
    if options.view == "metadata":
        return table_result(metadata)
    pulled = pull_readings(acq.query().measurement(alias=POINT), options)
    chosen = pulled.filter(pl.col("point_id").is_in(points)) if "point_id" in pulled.columns else pulled.clear()
    return table_result(shape_readings(chosen, options))
