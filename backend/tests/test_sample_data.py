import pytest
from src.sample_data import SAMPLE_DRIVERS, SAMPLE_QUERY_RESULT, SAMPLE_STREAMS, live_or_sample
from fakes import DRIVER, STREAM_KEYS

# Asserts that live rows are used whenever there are any
@pytest.mark.fast
def test_live_or_sample_prefers_live():
    assert live_or_sample("streams", [{"point": "a"}], SAMPLE_STREAMS) == {"source": "live", "streams": [{"point": "a"}]}

# Asserts that the sample rows stand in, flagged, when there is no live data
@pytest.mark.fast
def test_live_or_sample_falls_back_to_sample():
    assert live_or_sample("drivers", [], SAMPLE_DRIVERS) == {"source": "sample", "drivers": SAMPLE_DRIVERS}

# Asserts that sample rows have exactly the fields live rows have, so the frontend treats them alike
@pytest.mark.fast
def test_sample_rows_match_live_shapes():
    assert SAMPLE_STREAMS and all(stream.keys() == STREAM_KEYS for stream in SAMPLE_STREAMS)
    assert SAMPLE_DRIVERS and all(driver.keys() == DRIVER.keys() for driver in SAMPLE_DRIVERS)

# Asserts that the sample query result is a well-formed table in the run_query shape
@pytest.mark.fast
def test_sample_query_result_shape():
    assert SAMPLE_QUERY_RESULT.keys() == {"columns", "rows", "total_rows", "truncated"}
    assert all(len(row) == len(SAMPLE_QUERY_RESULT["columns"]) for row in SAMPLE_QUERY_RESULT["rows"])
    assert SAMPLE_QUERY_RESULT["total_rows"] == len(SAMPLE_QUERY_RESULT["rows"])
