import socket
import time
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
