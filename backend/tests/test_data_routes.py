from types import SimpleNamespace
import polars as pl
import pytest
from fastapi.testclient import TestClient
import src.server as server
from query_builder import QuerySpec, query_attributes, to_python
from src.sample_data import SAMPLE_DRIVERS, SAMPLE_QUERY_RESULT, SAMPLE_STREAMS
from src.server import app
from fakes import DRIVER, RecordingQuery

ACQUIRIUM_ADDRESS = "http://127.0.0.1:9999"
STREAM = {"point": "ns1:cpu_percent", "label": "CPU usage", "quantity_kind": None, "unit": "unit:PERCENT",
          "data_source": None, "latest_time": "2026-10-11T19:52:41+00:00", "latest_value": 15.5}
MEASUREMENT = {"steps": [{"kind": "measurement"}]}

@pytest.fixture
def fake_query():
    """The query the fake Acquirium hands out; tests set its table or error."""
    return RecordingQuery()

@pytest.fixture
def api(monkeypatch, fake_query):
    """A TestClient against a stand-in Acquirium. The lifespan never runs, so no real server starts."""
    monkeypatch.setattr(server, "acq", SimpleNamespace(address=ACQUIRIUM_ADDRESS, query=lambda: fake_query))
    return TestClient(app=app)

# ---------- /streams ----------

# Asserts that live streams are returned and flagged live
@pytest.mark.fast
def test_streams_live(api, monkeypatch):
    monkeypatch.setattr(server, "live_streams", lambda acq: [STREAM] if acq is server.acq else [])
    assert api.get("/streams").json() == {"source": "live", "streams": [STREAM]}

# Asserts that sample streams, flagged sample, stand in when Acquirium has none
@pytest.mark.fast
def test_streams_sample(api, monkeypatch):
    monkeypatch.setattr(server, "live_streams", lambda acq: [])
    assert api.get("/streams").json() == {"source": "sample", "streams": SAMPLE_STREAMS}

# ---------- /drivers ----------

# Asserts that the drivers Acquirium runs are returned and flagged live
@pytest.mark.fast
def test_drivers_live(api, monkeypatch):
    monkeypatch.setattr(server, "live_drivers", lambda address: [DRIVER] if address == ACQUIRIUM_ADDRESS else [])
    assert api.get("/drivers").json() == {"source": "live", "drivers": [DRIVER]}

# Asserts that sample drivers, flagged sample, stand in when Acquirium runs none
@pytest.mark.fast
def test_drivers_sample(api, monkeypatch):
    monkeypatch.setattr(server, "live_drivers", lambda address: [])
    assert api.get("/drivers").json() == {"source": "sample", "drivers": SAMPLE_DRIVERS}

# ---------- /query/* ----------

# Asserts that the attribute list is served for the builder's filter menus
@pytest.mark.fast
def test_query_attributes(api):
    assert api.get("/query/attributes").json() == query_attributes()

# Asserts that the builder's steps come back as Python that connects to this Acquirium
@pytest.mark.fast
def test_query_python(api):
    response = api.post("/query/python", json=MEASUREMENT)
    assert response.status_code == 200
    assert response.json() == {"python": to_python(QuerySpec.model_validate(MEASUREMENT), ACQUIRIUM_ADDRESS)}

# Asserts that malformed steps are rejected before anything is translated
@pytest.mark.fast
def test_query_python_invalid_step(api):
    response = api.post("/query/python", json={"steps": [{"kind": "entity", "filters": [{"attr": "colour", "value": "red"}]}]})
    assert response.status_code == 422

# Asserts that a run returns Acquirium's table, flagged live
@pytest.mark.fast
def test_query_run_live(api, fake_query):
    fake_query.table = pl.DataFrame({"data": ["ns1:cpu_percent"]})
    response = api.post("/query/run", json=MEASUREMENT)
    assert response.status_code == 200
    assert response.json() == {"source": "live", "columns": ["data"], "rows": [["ns1:cpu_percent"]],
                               "total_rows": 1, "truncated": False}

# Asserts that an empty result is shown as-is when Acquirium has streams: the query simply matched nothing
@pytest.mark.fast
def test_query_run_empty_with_live_data(api, monkeypatch, fake_query):
    fake_query.table = pl.DataFrame({"data": []})
    monkeypatch.setattr(server, "has_streams", lambda acq: True)
    assert api.post("/query/run", json=MEASUREMENT).json() == {
        "source": "live", "columns": ["data"], "rows": [], "total_rows": 0, "truncated": False}

# Asserts that an empty result is replaced by the flagged sample when Acquirium has no streams at all
@pytest.mark.fast
def test_query_run_sample_without_live_data(api, monkeypatch, fake_query):
    fake_query.table = pl.DataFrame({"data": []})
    monkeypatch.setattr(server, "has_streams", lambda acq: False)
    assert api.post("/query/run", json=MEASUREMENT).json() == {"source": "sample", **SAMPLE_QUERY_RESULT}

# Asserts that Acquirium's ValueErrors (unresolvable text, unknown alias, ...) come back as 400s with their message
@pytest.mark.fast
def test_query_run_acquirium_error(api, fake_query):
    fake_query.error = ValueError("Could not resolve 'pmup' as class")
    response = api.post("/query/run", json={"steps": [{"kind": "entity", "cls": "pmup"}]})
    assert response.status_code == 400
    assert response.json() == {"detail": "Could not resolve 'pmup' as class"}

# Asserts that running an empty query is a 400, not a server error
@pytest.mark.fast
def test_query_run_without_steps(api):
    response = api.post("/query/run", json={"steps": []})
    assert response.status_code == 400
    assert "at least one step" in response.json()["detail"]
