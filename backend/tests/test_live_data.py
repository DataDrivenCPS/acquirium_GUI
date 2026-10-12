import socket
import time
from urllib.parse import urlsplit
import pytest
from fastapi.testclient import TestClient
from src.server import app
from config_stubs import METRICS

CONFIG_ENV = "ACQUIRIUM_GUI_CONFIG"
# Acquirium's system-metrics driver registers these streams (labels from its source)
METRIC_LABELS = {"CPU usage", "RAM usage", "RAM used", "Disk usage (root)", "Network bytes sent", "Network bytes received"}

@pytest.fixture(scope="module")
def live_api(tmp_path_factory):
    """A real Acquirium running the system-metrics driver, behind our FastAPI app."""
    config_path = tmp_path_factory.mktemp("live") / "acquirium.toml"
    with socket.socket() as sock:  # asks the OS for a free port
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    config_path.write_text(METRICS.format(port=port))
    env = pytest.MonkeyPatch()
    env.setenv(CONFIG_ENV, str(config_path))
    try:
        with TestClient(app=app) as client:
            yield client
    finally:
        env.undo()

def wait_for_readings(api, timeout=60.0):
    """Polls /streams until every metric stream has a reading, and returns the response JSON."""
    deadline = time.time() + timeout
    while True:
        body = api.get("/streams").json()
        if body["source"] == "live" and len(body["streams"]) == len(METRIC_LABELS) \
                and all(s["latest_value"] is not None for s in body["streams"]):
            return body
        if time.time() > deadline:
            pytest.fail(f"metric streams never all had readings; last response: {body}")
        time.sleep(1.0)

# Asserts that the driver's streams show up live, each with a numeric reading and a time
@pytest.mark.slow
def test_streams_are_live(live_api):
    body = wait_for_readings(live_api)
    assert {s["label"] for s in body["streams"]} == METRIC_LABELS
    cpu = next(s for s in body["streams"] if s["label"] == "CPU usage")
    assert cpu["unit"] == "unit:PERCENT"
    assert isinstance(cpu["latest_value"], float)
    assert cpu["latest_time"] is not None

# Asserts that the running driver is listed live
@pytest.mark.slow
def test_drivers_are_live(live_api):
    body = live_api.get("/drivers").json()
    assert body["source"] == "live"
    [driver] = body["drivers"]
    assert driver["name"] == "SystemMetricsDriver"
    assert driver["status"] == "running"

# Asserts that a built query runs against the real graph and finds the metric streams
@pytest.mark.slow
def test_query_run_is_live(live_api):
    wait_for_readings(live_api)
    response = live_api.post("/query/run", json={"steps": [
        {"kind": "measurement", "alias": "m"},
        {"kind": "include", "names": ["unit"]},
    ]})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "live"
    assert body["columns"][:3] == ["m", "m.label", "m.unit"]
    assert {row[1] for row in body["rows"]} == METRIC_LABELS

# Asserts that Acquirium's own errors for an unresolvable class come back as a 400 with its message
@pytest.mark.slow
def test_query_run_unresolvable_class(live_api):
    response = live_api.post("/query/run", json={"steps": [{"kind": "entity", "cls": "NotARealClassXYZ"}]})
    assert response.status_code == 400
    assert "Could not resolve" in response.json()["detail"]

# Asserts that the Python shown connects to the running Acquirium's port
@pytest.mark.slow
def test_query_python_targets_running_server(live_api):
    address = live_api.get("/runtime-info").json()["acquirium_address"]
    python = live_api.post("/query/python", json={"steps": [{"kind": "measurement"}]}).json()["python"]
    assert f"server_port={urlsplit(address).port}" in python
