import json
import pytest
from fastapi.testclient import TestClient
import src.server as server
import src.settings as settings
from src.settings import DEFAULTS, Settings

CHANGED = {"resolution": {"min_score": 0.7, "margin": 0.2, "candidate_count": 8}, "results": {"max_rows": 50}}

@pytest.fixture
def api(tmp_path, monkeypatch):
    """A TestClient whose settings file is in a temporary folder. The lifespan never runs, so no real server starts."""
    monkeypatch.setattr(server, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.setattr(settings, "_current", DEFAULTS)
    return TestClient(app=server.app)

# Asserts that the window gets the current values, the defaults to reset to, and each range
@pytest.mark.fast
def test_get_settings(api):
    body = api.get("/settings").json()
    assert body["values"] == DEFAULTS.model_dump()
    assert body["defaults"] == DEFAULTS.model_dump()
    assert body["limits"] == settings.limits()

# Asserts that a change is validated, applied to the running server, and written to the file
@pytest.mark.fast
def test_put_applies_and_saves(api, tmp_path):
    response = api.put("/settings", json=CHANGED)
    assert response.status_code == 200
    assert response.json()["values"] == CHANGED
    assert settings.get() == Settings.model_validate(CHANGED)
    assert json.loads((tmp_path / "settings.json").read_text()) == CHANGED

# Asserts that an out-of-range value is refused and nothing changes or is written
@pytest.mark.fast
def test_put_rejects_invalid(api, tmp_path):
    bad = {"resolution": {"min_score": 5, "margin": 0.1, "candidate_count": 5}, "results": {"max_rows": 1000}}
    assert api.put("/settings", json=bad).status_code == 422
    assert settings.get() == DEFAULTS
    assert not (tmp_path / "settings.json").exists()

# Asserts that reset puts every setting back to its default and saves that
@pytest.mark.fast
def test_reset(api, tmp_path):
    api.put("/settings", json=CHANGED)
    response = api.post("/settings/reset")
    assert response.json()["values"] == DEFAULTS.model_dump()
    assert settings.get() == DEFAULTS
    assert json.loads((tmp_path / "settings.json").read_text()) == DEFAULTS.model_dump()

# Asserts that settings survive a restart: what startup loads is what shutdown saved
@pytest.mark.fast
def test_settings_survive_restart(api, monkeypatch):
    api.put("/settings", json=CHANGED)
    monkeypatch.setattr(settings, "_current", DEFAULTS)  # a fresh server process
    server.load_settings()
    assert settings.get() == Settings.model_validate(CHANGED)

# Asserts that shutdown writes the current values even if no change was made this run
@pytest.mark.fast
def test_shutdown_saves(api, tmp_path):
    server.save_settings()
    assert json.loads((tmp_path / "settings.json").read_text()) == DEFAULTS.model_dump()

# Asserts that when the file cannot be written the change is refused and the running settings stay as they were
@pytest.mark.fast
def test_put_that_cannot_save_changes_nothing(api, monkeypatch):
    monkeypatch.setattr(server.settings_store, "save", lambda *a: (_ for _ in ()).throw(OSError("disk")))
    client = TestClient(app=server.app, raise_server_exceptions=False)
    assert client.put("/settings", json=CHANGED).status_code == 500
    assert settings.get() == DEFAULTS
