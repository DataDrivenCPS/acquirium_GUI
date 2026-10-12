from datetime import datetime, timezone
from types import SimpleNamespace
import polars as pl
import pytest
from src.streams import has_streams, live_streams
from fakes import STREAM_KEYS

T1 = datetime(2026, 10, 11, 19, 52, 41, tzinfo=timezone.utc)

class FakeStreamQuery:
    """Stands in for acq.query(): returns `table` from metadata() and `latest` from data().dataframe()."""

    def __init__(self, table, latest=None):
        self.table = table
        self.latest = latest
        self.calls = []

    def measurement(self, **kwargs):
        self.calls.append(("measurement", kwargs))
        return self

    def include(self, *names):
        self.calls.append(("include", names))
        return self

    def metadata(self):
        return self.table

    def data(self, **kwargs):
        self.calls.append(("data", kwargs))
        return SimpleNamespace(dataframe=self._dataframe)

    def _dataframe(self, **kwargs):
        self.calls.append(("dataframe", kwargs))
        return self.latest

def fake_acq(query):
    return SimpleNamespace(query=lambda: query)

# Metadata in the shape Acquirium 0.4.0a8 returns for measurement(alias="point").include(...)
METADATA = pl.DataFrame({
    "point": ["ns1:cpu_percent", "ns1:pump_state", "ns1:spare"],
    "point.label": ["CPU usage", "Pump state", None],
    "point.quantity_kind": ["quantitykind:DimensionlessRatio", None, None],
    "point.unit": ["unit:PERCENT", None, None],
    "point.data_source": [None, "SCADA", None],
})
# Newest reading per stream, in the shape of DataObject.dataframe(shape="narrow")
LATEST = pl.DataFrame({
    "data_alias": ["point__CPU usage", "point__Pump state"],
    "point_id": ["ns1:cpu_percent", "ns1:pump_state"],
    "time": [T1, T1],
    "value_numeric": [15.5, None],
    "value_text": [None, "running"],
})

# Asserts that each stream joins its metadata with its newest reading, sorted by label
@pytest.mark.fast
def test_live_streams_joins_metadata_and_latest_reading():
    streams = live_streams(fake_acq(FakeStreamQuery(METADATA, LATEST)))
    assert streams == [
        {"point": "ns1:cpu_percent", "label": "CPU usage", "quantity_kind": "quantitykind:DimensionlessRatio",
         "unit": "unit:PERCENT", "data_source": None, "latest_time": T1.isoformat(), "latest_value": 15.5},
        # no label sorts by its point name; no readings yet means no latest value
        {"point": "ns1:spare", "label": None, "quantity_kind": None,
         "unit": None, "data_source": None, "latest_time": None, "latest_value": None},
        {"point": "ns1:pump_state", "label": "Pump state", "quantity_kind": None,
         "unit": None, "data_source": "SCADA", "latest_time": T1.isoformat(), "latest_value": "running"},
    ]
    assert all(stream.keys() == STREAM_KEYS for stream in streams)

# Asserts that the query asks for every stream's attributes and only its newest reading
@pytest.mark.fast
def test_live_streams_query_shape():
    query = FakeStreamQuery(METADATA, LATEST)
    live_streams(fake_acq(query))
    assert query.calls == [
        ("measurement", {"alias": "point"}),
        ("include", ("quantity_kind", "unit", "data_source")),
        ("data", {"limit": 1, "order": "desc"}),
        ("dataframe", {"shape": "narrow"}),
    ]

# Asserts that with no streams registered nothing is fetched and the list is empty
@pytest.mark.fast
def test_live_streams_empty():
    query = FakeStreamQuery(pl.DataFrame({"point": []}))
    assert live_streams(fake_acq(query)) == []
    assert ("data", {"limit": 1, "order": "desc"}) not in query.calls

# Asserts that has_streams is a cheap check on whether any measurement point exists
@pytest.mark.fast
@pytest.mark.parametrize("points, expected", [([], False), (["urn:host:x:cpu_percent"], True)])
def test_has_streams(points, expected):
    calls = []
    query = SimpleNamespace(
        measurement=lambda: query,
        resolved_nodes=lambda **kwargs: calls.append(kwargs) or points,
    )
    assert has_streams(fake_acq(query)) is expected
    assert calls == [{"only_data_nodes": True}]
