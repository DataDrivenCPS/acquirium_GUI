import time
from datetime import datetime, timezone
import polars as pl
import pytest
from acq_repo import WATERTAP_DATA_DIR, find_acquirium_repo

# The driver names every stream "wbs:" + the parquet column it came from
POINT_PREFIX = "wbs:"
TIME_COLUMN = "timestamp"

# Reads the WaterTAP parquet file(s) the driver replays, oldest row first
def read_source_rows() -> pl.DataFrame:
    files = sorted((find_acquirium_repo() / WATERTAP_DATA_DIR).glob("*.parquet"))
    return pl.concat([pl.read_parquet(file) for file in files]).sort(TIME_COLUMN)

# The source writes times without a zone; Acquirium reports them as UTC
def as_utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)

# Polls /streams until every stream has a reading at the source's last time, then returns the streams by point.
# The driver replays the file in the background, so the newest reading is not there right away.
def wait_for_last_readings(api, last_time: datetime, count: int, timeout=300.0, interval=3.0) -> dict:
    deadline = time.time() + timeout
    streams = {}
    while time.time() < deadline:
        body = api.get("/streams").json()
        streams = {stream["point"]: stream for stream in body["streams"]}
        if body["source"] == "live" and len(streams) == count and all(
                stream["latest_time"] and datetime.fromisoformat(stream["latest_time"]) == last_time
                for stream in streams.values()):
            return streams
        time.sleep(interval)
    pytest.fail(f"streams never all reached {last_time} after {timeout:.0f}s; last response: {streams}")

# The query the Query window would send to list every stream with its metadata
ALL_STREAMS_QUERY = {"steps": [
    {"kind": "measurement", "alias": "point"},
    {"kind": "include", "names": ["label", "unit", "quantity_kind"]},
]}

# The server in this class loads the WaterTAP parquet data, so it needs an
# Acquirium checkout and is skipped without one.
@pytest.mark.usefixtures("watertap_server")
class TestWatertapValuesReachTheApi:

    @pytest.fixture(scope="class")
    @classmethod
    def source(cls):
        return read_source_rows()

    @pytest.fixture(scope="class")
    @classmethod
    def streams(cls, watertap_server, source):
        columns = [name for name in source.columns if name != TIME_COLUMN]
        last_time = as_utc(source[TIME_COLUMN][-1])
        return wait_for_last_readings(watertap_server, last_time, count=len(columns))

    # Runs ALL_STREAMS_QUERY through the route and returns its rows as dicts keyed by column name.
    # Depends on `streams` so the driver has finished loading before the query runs.
    @pytest.fixture(scope="class")
    @classmethod
    def query_rows(cls, watertap_server, streams):
        body = watertap_server.post("/query/run", json=ALL_STREAMS_QUERY).json()
        assert body["source"] == "live" and not body["truncated"]
        assert body["total_rows"] == len(body["rows"])
        return [dict(zip(body["columns"], row)) for row in body["rows"]]

    # Asserts there is one stream per parquet column, and none left over
    @pytest.mark.slow
    def test_every_source_column_is_a_stream(self, source, streams):
        columns = {POINT_PREFIX + name for name in source.columns if name != TIME_COLUMN}
        assert set(streams) == columns

    # Asserts each stream's newest reading is the last value in its parquet column
    @pytest.mark.slow
    def test_latest_value_is_the_last_source_value(self, source, streams):
        last_row = source.row(-1, named=True)
        wrong = {
            point: (stream["latest_value"], last_row[point.removeprefix(POINT_PREFIX)])
            for point, stream in streams.items()
            if stream["latest_value"] != pytest.approx(last_row[point.removeprefix(POINT_PREFIX)])
        }
        assert not wrong, f"(api value, source value) differs for: {wrong}"

    # Asserts every stream carries the label and quantity kind the Streams window shows
    @pytest.mark.slow
    def test_every_stream_has_a_label_and_quantity_kind(self, streams):
        incomplete = [point for point, stream in streams.items() if not (stream["label"] and stream["quantity_kind"])]
        assert not incomplete

    # Asserts every stream has a unit. Ten pressure, temperature and flow-rate streams have none in
    # Acquirium's WaterTAP model data, so this is a known gap (it passes, and flags XPASS, once fixed).
    @pytest.mark.slow
    @pytest.mark.xfail(reason="WaterTAP model.ttl gives pressure, temperature and volume flow rate streams no unit")
    def test_every_stream_has_a_unit(self, streams):
        unitless = [point for point, stream in streams.items() if not stream["unit"]]
        assert not unitless

    # Asserts a query for every measurement point finds exactly the parquet columns, once each
    @pytest.mark.slow
    def test_query_finds_every_source_column_once(self, source, query_rows):
        columns = [POINT_PREFIX + name for name in source.columns if name != TIME_COLUMN]
        points = [row["point"] for row in query_rows]
        assert sorted(points) == sorted(columns)

    # Asserts the query and /streams agree on each point's label, unit and quantity kind
    @pytest.mark.slow
    def test_query_metadata_matches_streams(self, streams, query_rows):
        disagree = {}
        for row in query_rows:
            stream = streams[row["point"]]
            for field in ("label", "unit", "quantity_kind"):
                if row[f"point.{field}"] != stream[field]:
                    disagree[(row["point"], field)] = (row[f"point.{field}"], stream[field])
        assert not disagree, f"(query value, /streams value) differs for: {disagree}"
