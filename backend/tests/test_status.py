from pathlib import Path
from types import SimpleNamespace
from fastapi.testclient import TestClient
from src.server import app
import pytest
import src.server as server

# Sample payloads in the shapes Acquirium 0.4.0a8 returns
EMBEDDING_STATUS = {
    "semantic": False,
    "graph": {"state": "ready", "concepts": 1380, "surfaces": 2289, "error": None},
    "qudt": {"state": "ready", "concepts": 4144, "surfaces": 13467, "error": None},
}
GRAPH_STATUS = {"source_version": 3, "published_version": 3, "is_current": True, "rebuild_in_progress": False}
ACQUIRIUM_ADDRESS = "http://127.0.0.1:9999"

@pytest.fixture
def api(monkeypatch):
    """A TestClient against a stand-in Acquirium. The lifespan never runs, so no real server starts."""
    fake_acq = SimpleNamespace(
        address=ACQUIRIUM_ADDRESS,
        graph_status=lambda: GRAPH_STATUS,
        client=SimpleNamespace(embedding_status=lambda: EMBEDDING_STATUS),
    )
    monkeypatch.setattr(server, "acq", fake_acq)
    monkeypatch.setattr(server, "config", None)
    return TestClient(app=app)

# Asserts that the embedding index status is passed through from Acquirium unchanged
@pytest.mark.fast
def test_embedding_status(api):
    response = api.get("/embedding-status")
    assert response.status_code == 200
    assert response.json() == EMBEDDING_STATUS

# Asserts that the graph version/cache status is passed through from Acquirium unchanged
@pytest.mark.fast
def test_graph_status(api):
    response = api.get("/graph-status")
    assert response.status_code == 200
    assert response.json() == GRAPH_STATUS

# Asserts that runtime info reports no config (Acquirium's built-in defaults) and Acquirium's address
@pytest.mark.fast
def test_runtime_info_without_config(api):
    response = api.get("/runtime-info")
    assert response.status_code == 200
    assert response.json() == {"config": None, "acquirium_address": ACQUIRIUM_ADDRESS}

# Asserts that runtime info reports the loaded config as an absolute path
@pytest.mark.fast
def test_runtime_info_with_config(api, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(server, "config", {"path": Path("acquirium.toml")})
    response = api.get("/runtime-info")
    assert response.status_code == 200
    assert response.json()["config"] == str((tmp_path / "acquirium.toml").resolve())
