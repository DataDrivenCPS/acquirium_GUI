"""Stand-ins for Acquirium objects and payloads, so unit tests never start a real server."""
import polars as pl
from query_builder import Call

# Keys every stream row has, live or sample (the frontend's Stream type)
STREAM_KEYS = {"point", "label", "quantity_kind", "unit", "data_source", "latest_time", "latest_value"}

# One entry in the shape Acquirium 0.4.0a8's GET /drivers/list returns
DRIVER = {
    "name": "SystemMetricsDriver",
    "spec": "acquirium.Drivers.BuiltInDrivers.system_metrics:SystemMetricsDriver",
    "interval": 2.0,
    "started_at": "2026-10-11T19:51:29.977660+00:00",
    "status": "running",
}

class RecordingQuery:
    """Stands in for Acquirium's Query: records every builder call and returns itself.

    metadata() returns `table`; if `error` is set, the first builder call raises it instead.
    """

    def __init__(self, table=None, error=None):
        self.calls = []
        self.table = table if table is not None else pl.DataFrame()
        self.error = error

    def __getattr__(self, method):
        def record(*args, **kwargs):
            if self.error is not None:
                raise self.error
            self.calls.append(Call(method, args, kwargs))
            return self
        return record

    def metadata(self):
        return self.table
