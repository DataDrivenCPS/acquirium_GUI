from datetime import datetime
from types import SimpleNamespace
import polars as pl
import pytest
from src.query_builder import ResultOptions, run_streams

# run_streams answers a click in the streams window: the metadata of the chosen streams, or their readings.
# The chosen points are matched against Acquirium's tables and never written into a query.

METADATA = pl.DataFrame({
    "point": ["ns1:flow", "ns1:temp", "ns1:other"],
    "point.label": ["Flow", "Temperature", "Other"],
    "point.quantity_kind": ["flow", "temperature", "ph"],
})
NARROW = pl.DataFrame({
    "data_alias": ["flow", "flow", "temp", "temp", "other"],
    "point_id": ["ns1:flow", "ns1:flow", "ns1:temp", "ns1:temp", "ns1:other"],
    "time": [datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1), datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1), datetime(2026, 1, 1, 0)],
    "value_numeric": [1.0, 3.0, 10.0, 20.0, 7.0],
    "value_text": [None, None, None, None, None],
})

class FakeQuery:
    """An Acquirium Query that records every method call and answers metadata() and dataframe() with fixed tables."""
    def __init__(self):
        self.calls = []
        self.dataframe_calls = []
    def __getattr__(self, method):
        def record(*args, **kwargs):
            self.calls.append((method, args, kwargs))
            return self
        return record
    def metadata(self):
        return METADATA
    def dataframe(self, **kwargs):
        self.dataframe_calls.append(kwargs)
        return NARROW

def acquirium(query):
    return SimpleNamespace(query=lambda: query)

def readings(**changes):
    return ResultOptions(view="readings", **changes)

# ---------- validation ----------

# Asserts that an empty selection is rejected before any query is built
@pytest.mark.fast
def test_no_points_is_rejected():
    query = FakeQuery()
    with pytest.raises(ValueError, match="Select at least one stream"):
        run_streams(acquirium(query), [], ResultOptions())
    assert query.calls == []

# Asserts that a point that is not a stream is rejected by name
@pytest.mark.fast
def test_unknown_point_is_rejected():
    with pytest.raises(ValueError, match="ns1:missing"):
        run_streams(acquirium(FakeQuery()), ["ns1:flow", "ns1:missing"], ResultOptions())

# Asserts that a point is only compared with Acquirium's tables, so odd text cannot reach the query
@pytest.mark.fast
def test_points_are_never_written_into_the_query():
    query = FakeQuery()
    with pytest.raises(ValueError):
        run_streams(acquirium(query), ["ns1:x> } DROP <"], ResultOptions())
    assert "DROP" not in repr(query.calls)

# ---------- metadata view ----------

# Asserts that the metadata of exactly the chosen streams comes back, in the order they were chosen
@pytest.mark.fast
def test_metadata_has_one_row_per_chosen_stream():
    result = run_streams(acquirium(FakeQuery()), ["ns1:temp", "ns1:flow"], ResultOptions())
    assert result["columns"] == ["point", "point.label", "point.quantity_kind"]
    assert [row[0] for row in result["rows"]] == ["ns1:temp", "ns1:flow"]
    assert result["total_rows"] == 2 and result["truncated"] is False

# Asserts that a stream chosen twice is returned once
@pytest.mark.fast
def test_a_repeated_point_is_one_row():
    result = run_streams(acquirium(FakeQuery()), ["ns1:flow", "ns1:flow"], ResultOptions())
    assert result["total_rows"] == 1

# Asserts that the metadata view pulls no readings
@pytest.mark.fast
def test_metadata_pulls_no_readings():
    query = FakeQuery()
    run_streams(acquirium(query), ["ns1:flow"], ResultOptions())
    assert query.dataframe_calls == []

# ---------- readings view ----------

# Asserts that only the chosen streams' readings come back, one column per stream named by its label
@pytest.mark.fast
def test_readings_are_wide_with_a_column_per_chosen_stream():
    result = run_streams(acquirium(FakeQuery()), ["ns1:flow", "ns1:temp"], readings())
    assert result["columns"] == ["time", "Flow", "Temperature"]
    assert result["total_rows"] == 2

# Asserts that a stream that was not chosen does not appear in the readings
@pytest.mark.fast
def test_readings_leave_out_streams_that_were_not_chosen():
    result = run_streams(acquirium(FakeQuery()), ["ns1:flow"], readings())
    assert result["columns"] == ["time", "Flow"]

# Asserts that the narrow layout keeps one row per reading
@pytest.mark.fast
def test_narrow_readings_have_a_row_per_reading():
    result = run_streams(acquirium(FakeQuery()), ["ns1:flow"], readings(shape="narrow"))
    assert result["columns"] == ["data_alias", "point_id", "time", "value_numeric", "value_text"]
    assert result["total_rows"] == 2

# Asserts that grouping and aggregating work on the chosen streams like they do for the builder
@pytest.mark.fast
def test_readings_can_be_grouped_and_aggregated():
    result = run_streams(acquirium(FakeQuery()), ["ns1:flow", "ns1:temp"], readings(group_by=["data_alias"], aggregate="mean"))
    assert result["columns"] == ["data_alias", "mean(value)"]
    assert dict(result["rows"]) == {"Flow": "2.0", "Temperature": "15.0"}

# Asserts that the limit and order are handed to Acquirium, which does the limiting per stream
@pytest.mark.fast
def test_limit_and_order_go_to_acquirium():
    query = FakeQuery()
    run_streams(acquirium(query), ["ns1:flow"], readings(limit=5, order="asc"))
    data = [kwargs for method, _, kwargs in query.calls if method == "data"]
    assert data and data[0]["limit"] == 5 and data[0]["order"] == "asc"
