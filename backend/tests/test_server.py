import socket
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit
from fastapi.testclient import TestClient
from src.config import ConfigError
from src.server import app
from config_stubs import PORTED
import pytest
import src.server as server

# Environment variable the launcher uses to hand the server a config path
CONFIG_ENV = "ACQUIRIUM_GUI_CONFIG"

@pytest.fixture
def fake_acquirium(monkeypatch):
    """Records the config passed to acquirium's runtime instead of starting a real server."""
    calls = []
    monkeypatch.setattr(server.acquirium_lib, "init", lambda config=None: calls.append(config))
    monkeypatch.setattr(server.acquirium_lib, "shutdown", lambda: None)
    return calls

# Asserts that a missing config path in the environment aborts server startup
@pytest.mark.fast
def test_fastapi_startup_bad_config(monkeypatch):
    monkeypatch.setenv(CONFIG_ENV, "FakeDirectory/missing.toml")
    with pytest.raises(ConfigError, match="The config file specified does not exist."):
        with TestClient(app=app):
            pass

# Asserts that a valid config path in the environment is handed to Acquirium
@pytest.mark.fast
def test_fastapi_startup_with_config(monkeypatch, tmp_path, fake_acquirium):
    config_path = tmp_path / "acquirium.toml"
    config_path.write_text(PORTED.format(port=0))
    monkeypatch.setenv(CONFIG_ENV, str(config_path))
    with TestClient(app=app):
        pass
    assert fake_acquirium == [config_path]

# Asserts that with no config path set and no ./acquirium.toml, Acquirium uses its built-in defaults
@pytest.mark.fast
def test_fastapi_startup_without_config(monkeypatch, tmp_path, fake_acquirium):
    monkeypatch.chdir(tmp_path)  # an empty working directory has no acquirium.toml to find
    monkeypatch.delenv(CONFIG_ENV, raising=False)
    with TestClient(app=app):
        pass
    assert fake_acquirium == [None]

# Asserts that with no config path set, a ./acquirium.toml in the working directory is loaded
@pytest.mark.fast
def test_fastapi_startup_finds_local_config(monkeypatch, tmp_path, fake_acquirium):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "acquirium.toml").write_text(PORTED.format(port=0))
    monkeypatch.delenv(CONFIG_ENV, raising=False)
    with TestClient(app=app):
        pass
    assert fake_acquirium == [Path("acquirium.toml")]

class TestServerClass:

    test_client = None

    @classmethod
    def setup_class(self):

        # hands the server lifespan a valid config path through the environment
        # On Windows, Acquirium's stopped server can briefly keep its database lock files open
        self.tmp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        config_path = Path(self.tmp_dir.name) / "acquirium.toml"

        # asks the OS for a free port to configure the server with
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        config_path.write_text(PORTED.format(port=self.port))
        self.env = pytest.MonkeyPatch()
        self.env.setenv(CONFIG_ENV, str(config_path))

        # Defines the FastAPI TestClient
        self.test_client = TestClient(app=app)
        self.test_client.__enter__() 

    @classmethod
    def teardown_class(self):
        self.test_client.__exit__(None, None, None)
        self.env.undo()
        self.tmp_dir.cleanup()

    # Assert that we can access the FastAPI root endpoint at least 5 seconds after it is started
    @pytest.mark.slow
    def test_fastapi_server_start(self):

        time.sleep(5.0)
        response = self.test_client.get("/")
        assert response.status_code == 200
        assert response.json() == {"description": "Acquirium GUI Backend"}

    # Assert that we can reach the Acquirium Server through the FastAPI Server
    # at least 5 minutes after starting the FastAPI server via polling a health endpoint
    @pytest.mark.slow
    def test_fastapi_acquirium_integration(self):

        timeout = 300.0  # 5 minute timeout
        start_time = time.time()
        response = None

        # polling health endpoint for response
        while time.time() - start_time < timeout:
            try:
                response = self.test_client.get("/server-health")
                if response.status_code == 200:
                    break
            except Exception:
                pass  # continue to wait for response
            time.sleep(5.0)

        assert response is not None
        assert response.status_code == 200
        assert response.json() == {"ok": True}

        # the Acquirium server must be listening on the port from the config
        assert urlsplit(server.acq.address).port == self.port

    # Assert that the status routes report on the running Acquirium server
    @pytest.mark.slow
    def test_fastapi_status_routes(self):

        embedding = self.test_client.get("/embedding-status")
        assert embedding.status_code == 200
        assert {"graph", "qudt"} <= embedding.json().keys()

        graph = self.test_client.get("/graph-status")
        assert graph.status_code == 200
        assert "is_current" in graph.json()

        info = self.test_client.get("/runtime-info")
        assert info.status_code == 200
        assert urlsplit(info.json()["acquirium_address"]).port == self.port