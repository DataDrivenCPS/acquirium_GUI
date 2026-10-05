import io
import socket
import sys
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

# Asserts that a missing config path piped through stdin aborts server startup
@pytest.mark.fast
def test_fastapi_startup_bad_config(monkeypatch):
    monkeypatch.setattr(sys, "stdin", io.StringIO("FakeDirectory/missing.toml\n"))
    with pytest.raises(ConfigError, match="The config file specified does not exist."):
        with TestClient(app=app):
            pass

class TestServerClass:

    test_client = None

    @classmethod
    def setup_class(self):

        # pipes a valid config path through stdin for the server lifespan to read
        self.tmp_dir = tempfile.TemporaryDirectory()
        config_path = Path(self.tmp_dir.name) / "acquirium.toml"

        # asks the OS for a free port to configure the server with
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        config_path.write_text(PORTED.format(port=self.port))
        self.real_stdin = sys.stdin
        sys.stdin = io.StringIO(f"{config_path}\n")

        # Defines the FastAPI TestClient
        self.test_client = TestClient(app=app)
        self.test_client.__enter__() 

    @classmethod
    def teardown_class(self):
        self.test_client.__exit__(None, None, None)
        sys.stdin = self.real_stdin
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