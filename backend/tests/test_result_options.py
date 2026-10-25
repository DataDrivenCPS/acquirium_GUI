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
WIDE = pl.DataFrame({"time": [datetime(2026, 1, 1, 0), datetime(2026, 1, 1, 1)], "flow": [1.0, 3.0], "temp": [10.0, 20.0]})

class FakeQuery:
    """An Acquirium Query that records dataframe() calls and answers metadata() and dataframe() with fixed tables."""
    def __init__(self, narrow=NARROW, wide=WIDE):
        self.dataframe_calls = []
        self.narrow, self.wide = narrow, wide
    def __getattr__(self, method):
        return lambda *args, **kwargs: self  # entity(), measurement(), include(), ... chain
    def metadata(self):
        return METADATA
    def dataframe(self, **kwargs):
        self.dataframe_calls.append(kwargs)
        return self.narrow if kwargs.get("shape") == "narrow" else self.wide

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

# Asserts that without a group-by the readings come back as pulled, in the requested layout
@pytest.mark.fast
def test_readings_without_group_by_are_returned_as_pulled():
    assert shape_readings(WIDE, ResultOptions(view="readings")).equals(WIDE)

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

# Asserts that the readings view pulls data with the limit, order and shape that were asked for
@pytest.mark.fast
def test_run_query_readings_passes_limit_order_and_shape():
    query = FakeQuery()
    result = run_query(acquirium(query), spec({"view": "readings", "limit": 50, "order": "asc", "shape": "wide"}))
    assert query.dataframe_calls == [{"limit": 50, "order": "asc", "shape": "wide"}]
    assert result["columns"] == ["time", "flow", "temp"]
    assert result["rows"][0] == ["2026-01-01 00:00:00", "1.0", "10.0"]  # every cell is text, like the metadata table
    assert result["total_rows"] == 2 and result["truncated"] is False

# Asserts that a readings pull is bounded even when the user set no limit
@pytest.mark.fast
def test_run_query_readings_default_limit():
    query = FakeQuery()
    run_query(acquirium(query), spec({"view": "readings"}))
    assert query.dataframe_calls[0]["limit"] == DEFAULT_READINGS_LIMIT

# Asserts that the newest readings come first unless the user says otherwise
@pytest.mark.fast
def test_run_query_readings_default_order_is_newest_first():
    query = FakeQuery()
    run_query(acquirium(query), spec({"view": "readings"}))
    assert query.dataframe_calls[0]["order"] == "desc"

# Asserts that grouping readings pulls the narrow layout whatever shape was chosen, since only it can be grouped
@pytest.mark.fast
def test_run_query_readings_group_by_pulls_narrow():
    query = FakeQuery()
    result = run_query(acquirium(query), spec({"view": "readings", "shape": "wide", "group_by": ["data_alias"], "aggregate": "mean"}))
    assert query.dataframe_calls[0]["shape"] == "narrow"
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
    assert query.dataframe_calls == []
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
