"""Reads the streams (measurement points) Acquirium knows about, with each one's newest reading."""
from typing import Any

# Alias for the measurement node in the streams query; metadata columns are named after it
POINT = "point"
# Attributes shown for each stream (its label is always part of Acquirium's metadata)
STREAM_ATTRIBUTES = ("quantity_kind", "unit", "data_source")

def live_streams(acq: Any) -> list[dict]:
    """Every registered stream with its attributes and newest reading, sorted by label. [] when there are none."""
    query = acq.query().measurement(alias=POINT).include(*STREAM_ATTRIBUTES)
    table = query.metadata()
    if table.is_empty():
        return []

    # limit=1 + order="desc" fetches only the newest row of each stream
    newest = query.data(limit=1, order="desc").dataframe(shape="narrow")
    readings = {row["point_id"]: row for row in newest.to_dicts()}

    streams = [_stream(row, readings.get(row[POINT])) for row in table.to_dicts()]
    return sorted(streams, key=lambda s: (s["label"] or s["point"]).lower())

def _stream(row: dict, reading: dict | None) -> dict:
    value = None
    if reading is not None:
        value = reading["value_numeric"] if reading["value_numeric"] is not None else reading["value_text"]
    return {
        "point": row[POINT],
        "label": row.get(f"{POINT}.label"),  # Acquirium drops the label column when no stream has one
        **{attr: row.get(f"{POINT}.{attr}") for attr in STREAM_ATTRIBUTES},
        "latest_time": reading["time"].isoformat() if reading is not None else None,
        "latest_value": value,
    }

def has_streams(acq: Any) -> bool:
    """Whether Acquirium has any measurement point at all; one graph query, no readings fetched."""
    return bool(acq.query().measurement().resolved_nodes(only_data_nodes=True))
