from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
import src.server as server
from query_builder import QuerySpec
from src.sample_data import SAMPLE_DRIVERS, SAMPLE_QUERY_RESULT, SAMPLE_STREAMS
from src.server import app
from fakes import DRIVER

ACQUIRIUM_ADDRESS = "http://127.0.0.1:9999"
STREAM = {"point": "ns1:cpu_percent", "label": "CPU usage", "quantity_kind": None, "unit": "unit:PERCENT",
          "data_source": None, "latest_time": "2026-10-11T19:52:41+00:00", "latest_value": 15.5}
MEASUREMENT = {"steps": [{"kind": "measurement"}]}
ATTRIBUTE = {"name": "medium", "roles": ["data", "entity"], "doc": "carried medium"}
TABLE = {"columns": ["data"], "rows": [["ns1:cpu_percent"]], "total_rows": 1, "truncated": False}
EMPTY_TABLE = {"columns": ["data"], "rows": [], "total_rows": 0, "truncated": False}

@pytest.fixture
def api(monkeypatch):
    """A TestClient against a stand-in Acquirium. The lifespan never runs, so no real server starts."""
    monkeypatch.setattr(server, "acq", SimpleNamespace(address=ACQUIRIUM_ADDRESS))
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
# query_builder is a stub for now, so most of these tests swap its functions for fakes and check only
# what the routes themselves do. The last test checks how the routes behave with the real stub.

# Asserts that the attribute list is passed through for the builder's filter menus
@pytest.mark.fast
def test_query_attributes(api, monkeypatch):
    monkeypatch.setattr(server, "query_attributes", lambda: [ATTRIBUTE])
    assert api.get("/query/attributes").json() == [ATTRIBUTE]

# Asserts that the steps are translated for this Acquirium's address
@pytest.mark.fast
def test_query_python(api, monkeypatch):
    calls = []
    monkeypatch.setattr(server, "to_python", lambda spec, address: calls.append((spec, address)) or "print(1)")
    response = api.post("/query/python", json=MEASUREMENT)
    assert response.status_code == 200
    assert response.json() == {"python": "print(1)"}
    assert calls == [(QuerySpec.model_validate(MEASUREMENT), ACQUIRIUM_ADDRESS)]

# Asserts that malformed steps are rejected before anything is translated
@pytest.mark.fast
def test_query_python_invalid_step(api):
    response = api.post("/query/python", json={"steps": [{"kind": "entity", "filters": [{"attr": "colour", "value": "red"}]}]})
    assert response.status_code == 422

# Asserts that a run returns the query's table, flagged live
@pytest.mark.fast
def test_query_run_live(api, monkeypatch):
    monkeypatch.setattr(server, "run_query", lambda acq, spec: TABLE if acq is server.acq else None)
    response = api.post("/query/run", json=MEASUREMENT)
    assert response.status_code == 200
    assert response.json() == {"source": "live", **TABLE}

# Asserts that an empty result is shown as-is when Acquirium has streams: the query simply matched nothing
@pytest.mark.fast
def test_query_run_empty_with_live_data(api, monkeypatch):
    monkeypatch.setattr(server, "run_query", lambda acq, spec: EMPTY_TABLE)
    monkeypatch.setattr(server, "has_streams", lambda acq: True)
    assert api.post("/query/run", json=MEASUREMENT).json() == {"source": "live", **EMPTY_TABLE}

# Asserts that an empty result is replaced by the flagged sample when Acquirium has no streams at all
@pytest.mark.fast
def test_query_run_sample_without_live_data(api, monkeypatch):
    monkeypatch.setattr(server, "run_query", lambda acq, spec: EMPTY_TABLE)
    monkeypatch.setattr(server, "has_streams", lambda acq: False)
    assert api.post("/query/run", json=MEASUREMENT).json() == {"source": "sample", **SAMPLE_QUERY_RESULT}

# Asserts that a rejected query (a ValueError: unknown alias, unresolvable text, ...) comes back as a 400 with its message
@pytest.mark.fast
def test_query_run_rejected_query(api, monkeypatch):
    def reject(acq, spec):
        raise ValueError("Could not resolve 'pmup' as class")
    monkeypatch.setattr(server, "run_query", reject)
    response = api.post("/query/run", json={"steps": [{"kind": "entity", "cls": "pmup"}]})
    assert response.status_code == 400
    assert response.json() == {"detail": "Could not resolve 'pmup' as class"}

# Asserts that while query_builder is a stub, each query route answers 501 Not Implemented with the stub's message
@pytest.mark.fast
@pytest.mark.parametrize("method, path", [("GET", "/query/attributes"), ("POST", "/query/python"), ("POST", "/query/run")])
def test_query_routes_report_the_stub(api, method, path):
    response = api.request(method, path, json=MEASUREMENT if method == "POST" else None)
    assert response.status_code == 501
    assert "not implemented yet" in response.json()["detail"]
