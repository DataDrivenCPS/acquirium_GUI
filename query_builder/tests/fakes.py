"""Stand-ins for Acquirium objects, so unit tests never start a real server."""
import polars as pl
from query_builder import Call

class RecordingQuery:
    """Stands in for Acquirium's Query: records every builder call and returns itself.

    metadata() returns `table`.
    """

    def __init__(self, table=None):
        self.calls = []
        self.table = table if table is not None else pl.DataFrame()

    def __getattr__(self, method):
        def record(*args, **kwargs):
            self.calls.append(Call(method, args, kwargs))
            return self
        return record

    def metadata(self):
        return self.table

class RecordingAcquirium:
    """Stands in for acquirium.Acquirium: records how it was connected and hands out one RecordingQuery."""
    instances = []

    def __init__(self, **connection):
        self.connection = connection
        self.recorder = RecordingQuery()
        RecordingAcquirium.instances.append(self)

    def query(self):
        return self.recorder
