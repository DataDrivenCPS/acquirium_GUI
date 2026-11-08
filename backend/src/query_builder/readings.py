"""Pulls the readings of a query's streams and says which entities each stream belongs to.

Acquirium's readings table names a stream (data_alias, point_id) but not the entity it hangs off, so on its
own it cannot say which pump a flow reading came from. The metadata table can: each of its rows pairs the
entities of a match with the measurement point (the "High-pressure pump P1" / "P1-Out pressure" table the page
shows first). pull_readings joins that onto the readings on the point: the narrow readings come back with one
column per entity step, named by the step's alias and holding the entity's label (the metadata table's
<alias>.label, else its identifier), in front of the usual narrow columns. A stream with several entities gets
one row per entity. A query with no entity step (only measurements) has no entity columns.

Acquirium names a stream by the alias of its measurement node ("Pump_data"), which says nothing about what is
measured when each node has one stream. So the data_alias column holds the stream's own label (the metadata
table's <alias>.label of the measurement node, "intake in flow rate") whenever there is one.
"""
from typing import Any
import polars as pl
from src.query_builder.shaping import NARROW_COLUMNS, ResultOptions, readings_arguments

def _node_columns(metadata: pl.DataFrame) -> list[str]:
    """The columns of the metadata table that hold a node (an entity or a measurement point), not one of its
    attributes: '<alias>.label' is an attribute because the table has an '<alias>' column it is named after."""
    return [column for column in metadata.columns if not any(column.startswith(f"{other}.") for other in metadata.columns)]

def _labels(metadata: pl.DataFrame, node: str) -> dict[str, str]:
    """Identifier -> label for the nodes of one column (empty when the column has no labels)."""
    label_column = f"{node}.label"
    if label_column not in metadata.columns:
        return {}
    return {uri: label for uri, label in metadata.select(node, label_column).unique().iter_rows() if uri and label}

def pull_readings(query: Any, options: ResultOptions) -> pl.DataFrame:
    """The query's readings in the narrow layout, with the entity columns described above in front. Limit and
    order are Acquirium's, per stream."""
    narrow = query.data(cast_value="str", **readings_arguments(options)).dataframe(shape="narrow")
    if narrow.height == 0:
        return narrow
    metadata = query.metadata()
    nodes = _node_columns(metadata)
    points = set(narrow["point_id"].to_list())
    # a measurement node is the one whose values are the readings' points
    data_nodes = [node for node in nodes if points & set(metadata[node].drop_nulls().to_list())]
    entity_nodes = [node for node in nodes if node not in data_nodes]
    if not data_nodes:
        return narrow

    stream_labels: dict[str, str] = {}
    for node in data_nodes:
        stream_labels.update(_labels(metadata, node))
    streams = pl.DataFrame(
        {"point_id": list(stream_labels), "_stream": list(stream_labels.values())},
        schema={"point_id": pl.String, "_stream": pl.String},
    )
    narrow = (
        narrow.join(streams, on="point_id", how="left")
        .with_columns(pl.coalesce("_stream", "data_alias").alias("data_alias"))
        .select(NARROW_COLUMNS)
    )
    if not entity_nodes:
        return narrow

    labels = {node: _labels(metadata, node) for node in entity_nodes}
    owners = []
    for row in metadata.iter_rows(named=True):
        owned = {node: (None if row[node] is None else labels[node].get(row[node], row[node])) for node in entity_nodes}
        owners += [{"point_id": row[node], **owned} for node in data_nodes if row[node] is not None]
    entities = pl.DataFrame(owners, schema={"point_id": pl.String, **{node: pl.String for node in entity_nodes}}).unique(maintain_order=True)
    return narrow.join(entities, on="point_id", how="left").select([*entity_nodes, *NARROW_COLUMNS])
