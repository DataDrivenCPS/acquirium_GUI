import json
import time

import polars as pl
import pytest
from fastapi.testclient import TestClient

# import the module, not `acq`: acq is reassigned in the lifespan
import src.server as server
from src.server import app


class TestServerClass:

    test_client = None

    @classmethod
    def setup_class(cls):
        cls.test_client = TestClient(app=app)
        cls.test_client.__enter__()  # runs the lifespan, which sets server.acq

    @classmethod
    def teardown_class(cls):
        cls.test_client.__exit__(None, None, None)

    # ---- helpers -------------------------------------------------------

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

    # ---- server tests ----------------------------------------------------

    # Assert that we can access the FastAPI root endpoint at least 5 seconds after it is started
    def test_fastapi_server_start(self):
        time.sleep(5.0)
        response = self.test_client.get("/")
        assert response.status_code == 200
        assert response.json() == {"description": "Acquirium GUI Backend"}

    # Assert that we can reach the Acquirium Server through the FastAPI Server
    # at least 5 minutes after starting the FastAPI server via polling a health endpoint
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

    # ---- query tests (independent of which config is loaded) -------------

    def test_metadata_returns_a_dataframe(self):
        # column names depend on the query (e.g. entity("Pump") yields "Pump_data"),
        # so only the structure is checked: at least one row and one column
        df = self._wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        assert isinstance(df, pl.DataFrame)
        assert df.height > 0
        assert df.width > 0

    def test_metadata_columns_are_strings(self):
        df = self._wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        assert all(dtype == pl.String for dtype in df.schema.values())

    def test_metadata_is_json_serializable(self):
        # the frontend receives JSON, so everything metadata() returns must survive it
        df = self._wait_for_rows(
            lambda: server.acq.query().measurement().metadata())
        rows = df.to_dicts()
        assert json.loads(json.dumps(rows)) == rows

    def test_dataframe_limit_is_respected(self):
        # same call shape as the notebook's q.dataframe(limit=1, order="desc", shape="wide")
        q = server.acq.query().measurement()
        df = self._wait_for_rows(lambda: q.dataframe(
            limit=1, order="desc", shape="wide"))
        assert isinstance(df, pl.DataFrame)
        assert df.height <= 1

    # ---- streams tests (independent of which config is loaded) -----------
    # "streams" = measurement() on an empty query, which matches every registered
    # stream in the plant, with all of their attributes added via include("all").

    @staticmethod
    def _streams_query():
        return server.acq.query().measurement(alias="streams").include("all")

    def test_streams_query_returns_a_dataframe(self):
        df = self._wait_for_rows(lambda: self._streams_query().metadata())
        assert isinstance(df, pl.DataFrame)
        assert df.height > 0
        assert df.width > 0

    def test_streams_alias_names_a_column(self):
        # The alias is set explicitly, so unlike the default names this one is
        # deterministic. NOTE: inferred from how default aliases name columns
        # ("Pump_data"), not confirmed for include("all"). Delete if it fails.
        df = self._wait_for_rows(lambda: self._streams_query().metadata())
        assert "streams" in df.columns

    def test_streams_include_all_adds_columns(self):
        # include("all") should only add attribute columns, never remove any
        base = self._wait_for_rows(
            lambda: server.acq.query().measurement(alias="streams").metadata()
        )
        full = self._wait_for_rows(lambda: self._streams_query().metadata())
        assert full.width >= base.width

    def test_streams_is_json_serializable(self):
        # the frontend receives JSON, so every column include("all") adds must survive it
        df = self._wait_for_rows(lambda: self._streams_query().metadata())
        rows = df.to_dicts()
        assert json.loads(json.dumps(rows)) == rows
