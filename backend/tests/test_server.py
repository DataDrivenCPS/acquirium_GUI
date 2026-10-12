import json
import polars as pl

# import the module, not `acq`: acq is reassigned in the lifespan
import src.server as server
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

# Asserts that the ACQUIRIUM_GUI_CONFIG env var is preferred over stdin for the config path
@pytest.mark.fast
def test_fastapi_startup_prefers_env_config(monkeypatch):
    seen = []

    # stands in for load_config so only the path handed to it is observed
    def fake_load_config(path):
        seen.append(path)
        raise ConfigError("stop before Acquirium starts")

    monkeypatch.setattr(server, "load_config", fake_load_config)
    monkeypatch.setenv("ACQUIRIUM_GUI_CONFIG", "from/env.toml")
    monkeypatch.setattr(sys, "stdin", io.StringIO("from/stdin.toml\n"))
    with pytest.raises(ConfigError, match="stop before Acquirium starts"):
        with TestClient(app=app):
            pass
    assert seen == ["from/env.toml"]


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
        
    @staticmethod
    def _wait_for_rows(build_frame, timeout=60.0, interval=3.0):
        """Poll until build_frame() returns a non-empty DataFrame.

        What data exists depends on which config the runtime was started with, so:
          - if the call keeps raising, the backend is broken -> fail with the error
          - if it works but only ever returns empty frames, no data is loaded -> skip
        """
        deadline = time.time() + timeout
        got_frame, last_error = False, None
        while time.time() < deadline:
            try:
                df = build_frame()
                got_frame = True
                if df.height > 0:
                    return df
            except Exception as exc:
                last_error = exc
            time.sleep(interval)
        if not got_frame:
            raise AssertionError(
                f"query never succeeded; last error: {last_error!r}")
        pytest.skip(
            f"query returned no rows after {timeout:.0f}s: the runtime has no data loaded. "
            "Start it with a config that loads data."
        )


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


# Polls until build_frame() returns a non-empty DataFrame, then returns it.
# Unlike TestServerClass._wait_for_rows this never skips: the WaterTAP server
# must load data, so no rows by the deadline is a failure.
def wait_for_rows(build_frame, timeout=300.0, interval=3.0):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            df = build_frame()
            if df.height > 0:
                return df
        except Exception as exc:
            last_error = exc
        time.sleep(interval)
    raise AssertionError(f"no rows after {timeout:.0f}s; last error: {last_error!r}")


# The server in this class loads the WaterTAP parquet data, so it needs an
# Acquirium checkout; the watertap_server fixture skips the class without one
class TestWatertapServer:

    # Asserts the server started from the WaterTAP config reports healthy
    @pytest.mark.slow
    def test_watertap_server_is_healthy(self, watertap_server):
        response = watertap_server.get("/server-health")
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    # Asserts the parquet driver loaded the 32 WaterTAP streams with their metadata
    @pytest.mark.slow
    def test_watertap_streams_are_loaded(self, watertap_server):
        df = wait_for_rows(
            lambda: server.acq.query().measurement(alias="streams").include("all").metadata())
        assert df.height == 32
        for column in ("streams.label", "streams.medium", "streams.quantity_kind", "streams.unit"):
            assert column in df.columns

    @pytest.mark.slow
    def test_metadata_returns_a_dataframe(self, watertap_server):
        # column names depend on the query (e.g. entity("Pump") yields "Pump_data"),
        # so only the structure is checked: at least one row and one column
        df = wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        assert isinstance(df, pl.DataFrame)
        assert df.height > 0
        assert df.width > 0

    @pytest.mark.slow
    def test_metadata_columns_are_strings(self, watertap_server):
        df = wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        assert all(dtype == pl.String for dtype in df.schema.values())

    @pytest.mark.slow
    def test_metadata_is_json_serializable(self, watertap_server):
        # the frontend receives JSON, so everything metadata() returns must survive it
        df = wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        rows = df.to_dicts()
        assert json.loads(json.dumps(rows)) == rows

    @pytest.mark.slow
    def test_dataframe_limit_is_respected(self, watertap_server):
        # same call shape as the notebook's q.dataframe(limit=1, order="desc", shape="wide")
        q = server.acq.query().measurement()
        df = wait_for_rows(lambda: q.dataframe(
            limit=1, order="desc", shape="wide"))
        assert isinstance(df, pl.DataFrame)
        assert df.height <= 1

    # "streams" = measurement() on an empty query, which matches every registered
    # stream in the plant, with all of their attributes added via include("all").

    @staticmethod
    def _streams_query():
        return server.acq.query().measurement(alias="streams").include("all")

    @pytest.mark.slow
    def test_streams_query_returns_a_dataframe(self, watertap_server):
        df = wait_for_rows(lambda: self._streams_query().metadata())
        assert isinstance(df, pl.DataFrame)
        assert df.height > 0
        assert df.width > 0

    @pytest.mark.slow
    def test_streams_alias_prefixes_columns(self, watertap_server):
        # the alias is set explicitly, so the attribute columns are named "streams.<attr>"
        df = wait_for_rows(lambda: self._streams_query().metadata())
        assert any(column.startswith("streams.") for column in df.columns)

    @pytest.mark.slow
    def test_streams_include_all_adds_columns(self, watertap_server):
        # include("all") should only add attribute columns, never remove any
        base = wait_for_rows(
            lambda: server.acq.query().measurement(alias="streams").metadata()
        )
        full = wait_for_rows(lambda: self._streams_query().metadata())
        assert full.width >= base.width

    @pytest.mark.slow
    def test_streams_is_json_serializable(self, watertap_server):
        # the frontend receives JSON, so every column include("all") adds must survive it
        df = wait_for_rows(lambda: self._streams_query().metadata())
        rows = df.to_dicts()
        assert json.loads(json.dumps(rows)) == rows
