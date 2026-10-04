import time

import polars as pl
import pytest
from fastapi.testclient import TestClient
from polars.testing import assert_frame_equal

# import the module, not `acq`: acq is reassigned in the lifespan
import src.server as server
from src.server import app


# (query builder, expected DataFrame), transcribed from the notebook outputs.
# Row order is ignored by the test.
METADATA_CASES = [
    pytest.param(
        lambda acq: acq.query().measurement().where(
            substance="constituent salt",
            quantity_kind="mass_concentration",
        ),
        pl.DataFrame(
            {
                "data": [
                    "wbs:PXR-brine-out-tds-concentration",
                    "wbs:storage-tank-3-out-tds-concentration",
                    "wbs:intake-in-tds-concentration",
                ],
                "data.label": [
                    "PXR brine out tds concentration",
                    "storage tank 3 out tds concentration",
                    "intake in tds concentration",
                ],
            }
        ),
        id="salt_mass_concentration_measurements",
    ),
    pytest.param(
        lambda acq: acq.query()
        .entity("reverse osmosis membrane")
        .related("pump", direction="upstream"),
        pl.DataFrame(
            {
                "reverse osmosis membrane": ["wbs:RO", "wbs:RO"],
                "pump": ["wbs:P1", "wbs:P2"],
            }
        ),
        id="ro_membrane_upstream_pumps",
    ),
    pytest.param(
        lambda acq: acq.query().entity("Pump").measurement(),
        pl.DataFrame(
            {
                "Pump": [
                    "wbs:P2", "wbs:intake", "wbs:intake", "wbs:intake", "wbs:intake",
                    "wbs:P1", "wbs:P2", "wbs:P1", "wbs:P1",
                ],
                # The toc and tss URIs were truncated in the notebook display and are
                # inferred from the tds one. If this case fails on those two values,
                # check them with print(df["Pump_data"].to_list()).
                "Pump_data": [
                    "wbs:P2-mechanical-power",
                    "wbs:intake-in-toc-concentration",
                    "wbs:intake-in-tss-concentration",
                    "wbs:intake-in-flow-rate",
                    "wbs:intake-in-tds-concentration",
                    "wbs:P1-efficiency",
                    "wbs:P2-efficiency",
                    "wbs:P1-mechanical-power",
                    "wbs:P1-out-pressure",
                ],
                "Pump_data.label": [
                    "P2 mechanical power",
                    "intake in toc concentration",
                    "intake in tss concentration",
                    "intake in flow rate",
                    "intake in tds concentration",
                    "P1 efficiency",
                    "P2 efficiency",
                    "P1 mechanical power",
                    "P1 out pressure",
                ],
            }
        ),
        id="pump_measurements",
    ),
]

# (query builder, expected number of rows) for cases where recording the
# full frame is impractical.
METADATA_COUNT_CASES = [
    pytest.param(
        lambda acq: acq.query().measurement(),
        32,
        id="all_measurements_row_count",
    ),
    pytest.param(
        lambda acq: acq.query().measurement().where(unit="kg/s"),
        10,
        id="measurements_unit_kg_per_s_row_count",
    ),
    pytest.param(
        lambda acq: acq.query().measurement().where(
            unit="kg/s", substance="constituent salt"
        ),
        5,
        id="measurements_kg_per_s_constituent_salt_row_count",
    ),
]


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
    def _poll_metadata(build_query, expected_rows=None, timeout=600.0, interval=5.0):
        """Retry until .metadata() returns the expected number of rows (or any rows,
        if expected_rows is None). The runtime reports healthy before the WaterTAP
        driver has loaded the plant graph, so early calls can be empty or raise.
        On timeout, return the last frame so the test's own assertions report
        what was actually returned."""
        deadline = time.time() + timeout
        df, last_error = None, None
        while time.time() < deadline:
            try:
                df = build_query().metadata()
                if expected_rows is None:
                    if df.height > 0:
                        return df
                elif df.height == expected_rows:
                    return df
            except Exception as exc:
                last_error = exc
            time.sleep(interval)
        if df is not None:
            return df
        raise AssertionError(
            f"metadata never succeeded; last error: {last_error!r}")

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

    # ---- metadata tests --------------------------------------------------

    @pytest.mark.parametrize("build_query, expected", METADATA_CASES)
    def test_metadata_matches_expected(self, build_query, expected):
        actual = self._poll_metadata(
            lambda: build_query(server.acq),
            expected_rows=expected.height,
        )

        # row count first, so a wrong count fails with a clear message
        assert actual.height == expected.height, (
            f"expected {expected.height} rows, got {actual.height}"
        )

        # then shape, column names, dtypes and values (row order ignored)
        assert_frame_equal(actual, expected, check_row_order=False)

    @pytest.mark.parametrize("build_query, expected_rows", METADATA_COUNT_CASES)
    def test_metadata_row_count(self, build_query, expected_rows):
        actual = self._poll_metadata(
            lambda: build_query(server.acq),
            expected_rows=expected_rows,
        )
        assert actual.height == expected_rows, (
            f"expected {expected_rows} rows, got {actual.height}"
        )

    def test_salt_filtered_metadata_is_subset_of_unit_filtered(self):
        # Adding a filter can only narrow the result, so every point matched by
        # unit="kg/s" + substance="constituent salt" must also be matched by
        # unit="kg/s" alone.
        unit_df = self._poll_metadata(
            lambda: server.acq.query().measurement().where(unit="kg/s"),
            expected_rows=10,
        )
        salt_df = self._poll_metadata(
            lambda: server.acq.query().measurement().where(
                unit="kg/s", substance="constituent salt"
            ),
            expected_rows=5,
        )
        assert set(salt_df["data"]) <= set(unit_df["data"])
        assert salt_df.height <= unit_df.height
