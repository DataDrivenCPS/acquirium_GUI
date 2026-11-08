from datetime import datetime
from types import SimpleNamespace
import polars as pl
import pytest
from pydantic import ValidationError
from src.query_builder import QuerySpec, run_query
from src.query_builder.shaping import DEFAULT_READINGS_LIMIT, MAX_READINGS_LIMIT, ResultOptions, shape_readings

# Result options shape what a run returns: the metadata table (default) or the readings (timeseries values)
# of the matched streams, with a row limit, an order, a wide or narrow layout and an optional group-by.

def spec(options=None, *steps):
    return QuerySpec.model_validate({"steps": list(steps) or [{"kind": "measurement"}], **({"options": options} if options else {})})

METADATA = pl.DataFrame({"pump": ["a", "b", "c", "d"], "medium": ["water", "brine", "water", "water"]})
NARROW = pl.DataFrame({
    "data_alias": ["flow", "flow", "temp", "temp"],
    "point_id": ["ns:flow", "ns:flow", "ns:temp", "ns:temp"],
    "time": [datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1), datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1)],
    "value_numeric": [1.0, 3.0, 10.0, 20.0],
    "value_text": [None, None, None, None],
})
class FakeData:
    """What Query.data() returns: answers dataframe() with the narrow readings."""
    def __init__(self, query):
        self.query = query
    def dataframe(self, shape="wide", **kwargs):
        self.query.dataframe_calls.append({"shape": shape, **kwargs})
        return self.query.narrow

class FakeQuery:
    """An Acquirium Query that records data() and dataframe() calls and answers metadata() and the readings with fixed tables."""
    def __init__(self, narrow=NARROW, metadata=METADATA):
        self.data_calls, self.dataframe_calls = [], []
        self.narrow, self.metadata_table = narrow, metadata
    def __getattr__(self, method):
        return lambda *args, **kwargs: self  # entity(), measurement(), include(), ... chain
    def metadata(self):
        return self.metadata_table
    def data(self, **kwargs):
        self.data_calls.append(kwargs)
        return FakeData(self)

def acquirium(query):
    client = SimpleNamespace(resolve=lambda text, kind=None, **kw: [{"uri": f"ns1:{text}", "label": text, "score": 1.0}])
    return SimpleNamespace(query=lambda: query, client=client)

# ---------- the options themselves ----------

# Asserts that a spec without options behaves as before: the metadata table, nothing limited or grouped
@pytest.mark.fast
def test_default_options_are_the_plain_metadata_view():
    options = spec().options
    assert (options.view, options.limit, options.group_by) == ("metadata", None, [])

# Asserts that a limit below one or above the cap is rejected, since a pull without bounds could be enormous
@pytest.mark.fast
@pytest.mark.parametrize("limit", [0, -5, MAX_READINGS_LIMIT + 1])
def test_limit_out_of_range_is_rejected(limit):
    with pytest.raises(ValidationError):
        ResultOptions(limit=limit)

# Asserts that unknown views, orders, shapes and aggregates are rejected
@pytest.mark.fast
@pytest.mark.parametrize("field,value", [("view", "chart"), ("order", "random"), ("shape", "tall"), ("aggregate", "median")])
def test_unknown_option_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        ResultOptions(**{field: value})

# Asserts that blank group-by names are dropped and repeated ones rejected
@pytest.mark.fast
def test_group_by_is_cleaned_and_unique():
    assert ResultOptions(view="readings", group_by=[" data_alias ", ""]).group_by == ["data_alias"]
    with pytest.raises(ValidationError, match="data_alias"):
        ResultOptions(view="readings", group_by=["data_alias", "data_alias"])

# Asserts that the metadata table takes no options: a limit or group-by without readings is rejected, not ignored
@pytest.mark.fast
@pytest.mark.parametrize("change", [{"limit": 5}, {"group_by": ["data_alias"]}])
def test_metadata_view_rejects_shaping(change):
    with pytest.raises(ValidationError, match="readings"):
        ResultOptions(**change)

# ---------- readings view ----------

# Asserts that narrow readings without a group-by come back as pulled
@pytest.mark.fast
def test_readings_narrow_without_group_by_are_returned_as_pulled():
    assert shape_readings(NARROW, ResultOptions(view="readings", shape="narrow")).equals(NARROW)

# Asserts that wide readings are one column per stream, newest first when asked, with the values as text
@pytest.mark.fast
def test_readings_wide_is_one_column_per_stream():
    wide = shape_readings(NARROW, ResultOptions(view="readings", shape="wide", order="desc"))
    assert wide.columns == ["time", "flow", "temp"]
    assert wide.rows() == [(datetime(2026, 1, 1, 1), "3.0", "20.0"), (datetime(2026, 1, 1, 0), "1.0", "10.0")]

# Asserts that grouping readings aggregates value_numeric per stream
@pytest.mark.fast
@pytest.mark.parametrize("aggregate,expected", [
    ("mean", [2.0, 15.0]), ("min", [1.0, 10.0]), ("max", [3.0, 20.0]), ("sum", [4.0, 30.0]),
    ("first", [1.0, 10.0]), ("last", [3.0, 20.0]),
])
def test_readings_group_by_stream_aggregates(aggregate, expected):
    shaped = shape_readings(NARROW, ResultOptions(view="readings", group_by=["data_alias"], aggregate=aggregate))
    assert shaped.columns == ["data_alias", f"{aggregate}(value)"]
    assert shaped.rows() == [("flow", expected[0]), ("temp", expected[1])]

# Asserts that count over readings counts observations per stream
@pytest.mark.fast
def test_readings_group_by_count():
    shaped = shape_readings(NARROW, ResultOptions(view="readings", group_by=["data_alias"], aggregate="count"))
    assert shaped.columns == ["data_alias", "count"]
    assert shaped.rows() == [("flow", 2), ("temp", 2)]

# Asserts that readings can only be grouped by the columns of the narrow layout that identify a stream
@pytest.mark.fast
def test_readings_group_by_unknown_column_is_rejected():
    with pytest.raises(ValueError, match="data_alias, point_id"):
        shape_readings(NARROW, ResultOptions(view="readings", group_by=["time"]))

# Asserts that an empty pull stays an empty table instead of failing on missing columns
@pytest.mark.fast
def test_readings_empty_pull_with_group_by_is_empty():
    shaped = shape_readings(pl.DataFrame(), ResultOptions(view="readings", group_by=["data_alias"]))
    assert shaped.height == 0

# ---------- run_query ----------

# Asserts that the readings view pulls data with the limit and order that were asked for and lays it out wide
@pytest.mark.fast
def test_run_query_readings_passes_limit_and_order():
    query = FakeQuery()
    result = run_query(acquirium(query), spec({"view": "readings", "limit": 50, "order": "asc", "shape": "wide"}))
    assert query.data_calls == [{"cast_value": "str", "limit": 50, "order": "asc"}]
    assert result["columns"] == ["time", "flow", "temp"]
    assert result["rows"][0] == ["2026-01-01 00:00:00", "1.0", "10.0"]  # every cell is text, like the metadata table
    assert result["total_rows"] == 2 and result["truncated"] is False

# Asserts that a readings pull is bounded even when the user set no limit
@pytest.mark.fast
def test_run_query_readings_default_limit():
    query = FakeQuery()
    run_query(acquirium(query), spec({"view": "readings"}))
    assert query.data_calls[0]["limit"] == DEFAULT_READINGS_LIMIT

# Asserts that the newest readings come first unless the user says otherwise
@pytest.mark.fast
def test_run_query_readings_default_order_is_newest_first():
    query = FakeQuery()
    run_query(acquirium(query), spec({"view": "readings"}))
    assert query.data_calls[0]["order"] == "desc"

# Asserts that the narrow layout is one row per reading
@pytest.mark.fast
def test_run_query_readings_narrow_has_a_row_per_reading():
    result = run_query(acquirium(FakeQuery()), spec({"view": "readings", "shape": "narrow"}))
    assert result["columns"] == ["data_alias", "point_id", "time", "value_numeric", "value_text"]
    assert result["total_rows"] == 4

# Asserts that grouping readings works whatever shape was chosen, since only the narrow layout can be grouped
@pytest.mark.fast
def test_run_query_readings_group_by_ignores_shape():
    result = run_query(acquirium(FakeQuery()), spec({"view": "readings", "shape": "wide", "group_by": ["data_alias"], "aggregate": "mean"}))
    assert result["columns"] == ["data_alias", "mean(value)"]
    assert result["rows"] == [["flow", "2.0"], ["temp", "15.0"]]

# Asserts that readings need a measurements step, because only measurements have readings
@pytest.mark.fast
def test_run_query_readings_without_measurements_is_rejected():
    with pytest.raises(ValueError, match="measurement"):
        run_query(acquirium(FakeQuery()), spec({"view": "readings"}, {"kind": "entity", "cls": "Pump"}))

# Asserts that the metadata view never pulls readings
@pytest.mark.fast
def test_run_query_metadata_view_does_not_pull_readings():
    query = FakeQuery()
    result = run_query(acquirium(query), spec())
    assert query.data_calls == [] and query.dataframe_calls == []
    assert result["rows"] == [["a", "water"], ["b", "brine"], ["c", "water"], ["d", "water"]]
    assert result["total_rows"] == 4

# Asserts that first and last mean earliest and latest in time even when the readings were pulled newest first
@pytest.mark.fast
def test_readings_first_and_last_follow_time_not_pull_order():
    newest_first = NARROW.sort("time", descending=True)
    first = shape_readings(newest_first, ResultOptions(view="readings", group_by=["data_alias"], aggregate="first"))
    last = shape_readings(newest_first, ResultOptions(view="readings", group_by=["data_alias"], aggregate="last"))
    assert dict(first.rows()) == {"flow": 1.0, "temp": 10.0}
    assert dict(last.rows()) == {"flow": 3.0, "temp": 20.0}

# ---------- which entity a reading belongs to ----------

# Two pumps that each have a stream with the same name: without the entity their readings cannot be told apart
PUMP_NARROW = pl.DataFrame({
    "data_alias": ["flow", "flow", "flow", "flow"],
    "point_id": ["ns:flow-1", "ns:flow-2", "ns:flow-1", "ns:flow-2"],
    "time": [datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1), datetime(2026, 1, 1, 1)],
    "value_numeric": [1.0, 100.0, 3.0, 300.0],
    "value_text": [None, None, None, None],
})
# the metadata table of that query: a row per match, pairing each pump with its flow stream
PUMP_METADATA = pl.DataFrame({
    "Pump": ["ns:p1", "ns:p2"], "Pump.label": ["Pump 1", "Pump 2"],
    "Pump_data": ["ns:flow-1", "ns:flow-2"],
})

def pump_query(**overrides):
    return FakeQuery(**{"narrow": PUMP_NARROW, "metadata": PUMP_METADATA, **overrides})

# Asserts that each reading gets a column holding the label of the entity its stream belongs to, in front of the stream
@pytest.mark.fast
def test_run_query_narrow_readings_name_their_entity():
    result = run_query(acquirium(pump_query()), spec({"view": "readings", "shape": "narrow", "order": "asc"}))
    assert result["columns"] == ["Pump", "data_alias", "point_id", "time", "value_numeric", "value_text"]
    assert [row[:3] for row in result["rows"]] == [["Pump 1", "flow", "ns:flow-1"], ["Pump 2", "flow", "ns:flow-2"]] * 2

# Asserts that an entity without a label is shown by its readable identifier instead of being left blank
@pytest.mark.fast
def test_entity_without_a_label_shows_its_identifier():
    unlabelled = PUMP_METADATA.select("Pump", "Pump_data")
    result = run_query(acquirium(pump_query(metadata=unlabelled)), spec({"view": "readings", "shape": "narrow"}))
    assert {row[0] for row in result["rows"]} == {"ns:p1", "ns:p2"}

# Asserts that wide columns say which entity each stream belongs to, so the two pumps' flows are two columns
@pytest.mark.fast
def test_run_query_wide_readings_put_the_entity_in_the_column_name():
    result = run_query(acquirium(pump_query()), spec({"view": "readings", "shape": "wide", "order": "asc"}))
    assert result["columns"] == ["time", "Pump 1 | flow", "Pump 2 | flow"]
    assert result["rows"] == [["2026-01-01 00:00:00", "1.0", "100.0"], ["2026-01-01 01:00:00", "3.0", "300.0"]]

# Asserts that grouping by stream keeps the entities apart: one row per pump, not one mean over both pumps
@pytest.mark.fast
def test_run_query_group_by_stream_keeps_entities_apart():
    result = run_query(acquirium(pump_query()), spec({"view": "readings", "group_by": ["data_alias"], "aggregate": "mean"}))
    assert result["columns"] == ["Pump", "data_alias", "mean(value)"]
    assert sorted(result["rows"]) == [["Pump 1", "flow", "2.0"], ["Pump 2", "flow", "200.0"]]

# Asserts that a stream under two entities shows up once for each of them
@pytest.mark.fast
def test_stream_under_two_entities_appears_for_each():
    shared = PUMP_METADATA.with_columns(pl.Series("Pump_data", ["ns:flow-1", "ns:flow-1"]))
    narrow = PUMP_NARROW.filter(pl.col("point_id") == "ns:flow-1")
    result = run_query(acquirium(pump_query(narrow=narrow, metadata=shared)), spec({"view": "readings", "shape": "narrow"}))
    assert sorted({row[0] for row in result["rows"]}) == ["Pump 1", "Pump 2"]
    assert result["total_rows"] == 4

# Asserts that two different streams that would get the same wide column name are kept apart by their point id
@pytest.mark.fast
def test_wide_columns_with_the_same_name_keep_their_point_id():
    twins = PUMP_METADATA.with_columns(pl.Series("Pump.label", ["Pump 1", "Pump 1"]))
    result = run_query(acquirium(pump_query(metadata=twins)), spec({"view": "readings", "shape": "wide", "order": "asc"}))
    assert result["columns"] == ["time", "Pump 1 | flow [ns:flow-1]", "Pump 1 | flow [ns:flow-2]"]

# Asserts that a query with no entity step has no entity columns and plain stream names
@pytest.mark.fast
def test_readings_without_an_entity_step_have_no_entity_columns():
    result = run_query(acquirium(FakeQuery()), spec({"view": "readings", "shape": "narrow"}))
    assert result["columns"] == ["data_alias", "point_id", "time", "value_numeric", "value_text"]

# Asserts that a stream is named by its own label, not by the alias of its measurement node, in the wide and narrow layouts
@pytest.mark.fast
def test_streams_are_named_by_their_label():
    labelled = PUMP_METADATA.with_columns(pl.Series("Pump_data.label", ["intake in flow rate", "intake in flow rate"]))
    wide = run_query(acquirium(pump_query(metadata=labelled)), spec({"view": "readings", "shape": "wide", "order": "asc"}))
    assert wide["columns"] == ["time", "Pump 1 | intake in flow rate", "Pump 2 | intake in flow rate"]
    narrow = run_query(acquirium(pump_query(metadata=labelled)), spec({"view": "readings", "shape": "narrow"}))
    assert {row[1] for row in narrow["rows"]} == {"intake in flow rate"}

# Asserts that a stream with no label keeps the alias Acquirium gave it, so the column is never nameless
@pytest.mark.fast
def test_stream_without_a_label_keeps_its_alias():
    result = run_query(acquirium(pump_query()), spec({"view": "readings", "shape": "narrow"}))
    assert {row[1] for row in result["rows"]} == {"flow"}

# Asserts that the wide columns of one entity sit together, even when the streams first have data in an interleaved order
@pytest.mark.fast
def test_wide_columns_are_grouped_by_entity():
    points = ["ns:a", "ns:x", "ns:b", "ns:y"]  # pump 1 stream a, pump 2 stream x, pump 1 stream b, pump 2 stream y
    narrow = pl.DataFrame({
        "data_alias": ["Pump_data"] * 4, "point_id": points,
        "time": [datetime(2026, 1, 1)] * 4, "value_numeric": [1.0, 2.0, 3.0, 4.0], "value_text": [None] * 4,
    })
    metadata = pl.DataFrame({
        "Pump": ["ns:p1", "ns:p1", "ns:p2", "ns:p2"], "Pump.label": ["Pump 1", "Pump 1", "Pump 2", "Pump 2"],
        "Pump_data": ["ns:a", "ns:b", "ns:x", "ns:y"], "Pump_data.label": ["a", "b", "x", "y"],
    })
    result = run_query(acquirium(FakeQuery(narrow=narrow, metadata=metadata)), spec({"view": "readings", "shape": "wide"}))
    assert result["columns"] == ["time", "Pump 1 | a", "Pump 1 | b", "Pump 2 | x", "Pump 2 | y"]
    assert result["rows"] == [["2026-01-01 00:00:00", "1.0", "3.0", "2.0", "4.0"]]
