import io
import json
import pytest
import src.drivers as drivers
from src.drivers import live_drivers
from fakes import DRIVER

# Asserts that the drivers come from Acquirium's /drivers/list route, with a timeout
@pytest.mark.fast
def test_live_drivers_reads_acquirium_route(monkeypatch):
    requests = []

    def fake_urlopen(url, timeout):
        requests.append((url, timeout))
        return io.BytesIO(json.dumps({"ok": True, "drivers": [DRIVER]}).encode())

    monkeypatch.setattr(drivers, "urlopen", fake_urlopen)
    assert live_drivers("http://127.0.0.1:9999") == [DRIVER]
    assert requests == [("http://127.0.0.1:9999/drivers/list", drivers.REQUEST_TIMEOUT_S)]
