import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import acquirium as acquirium_lib
from src.config import load_config
from src.drivers import live_drivers
from src.query_builder import QuerySpec, ResolveRequest, query_attributes, resolve_text, run_query, to_python
from src.sample_data import SAMPLE_DRIVERS, SAMPLE_QUERY_RESULT, SAMPLE_STREAMS, live_or_sample
from src.streams import has_streams, live_streams

# Path to an Acquirium TOML config, relative to the server's working directory (backend/) or absolute.
CONFIG_ENV_VAR = "ACQUIRIUM_GUI_CONFIG"
# Used when CONFIG_ENV_VAR is unset and this file exists; otherwise Acquirium's built-in defaults apply.
LOCAL_CONFIG_FILE = "acquirium.toml"

acq = None
config = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global acq, config
    config_path = os.environ.get(CONFIG_ENV_VAR)
    if not config_path and Path(LOCAL_CONFIG_FILE).is_file():
        config_path = LOCAL_CONFIG_FILE
    config = load_config(config_path) if config_path else None
    acq = acquirium_lib.init(config=config['path'] if config else None)
    try:
        yield
    finally:
        acquirium_lib.shutdown()

app = FastAPI(lifespan=lifespan)

# Code that isn't written yet (the query_builder stub) raises NotImplementedError; report it as 501, not a crash
@app.exception_handler(NotImplementedError)
def not_implemented(request: Request, error: NotImplementedError):
    return JSONResponse(status_code=501, content={"detail": str(error)})

# Returns plain description for root
@app.get("/")
def root():
    return {"description": "Acquirium GUI Backend"}

# Defines Acquirium sub-process server health
@app.get("/server-health")
def server_health():
    return acq.client.health()

# Reports the state of Acquirium's text-matching (embedding) indexes
@app.get("/embedding-status")
def embedding_status():
    return acq.client.embedding_status()

# Reports Acquirium's graph data version and whether its query cache has caught up
@app.get("/graph-status")
def graph_status():
    return acq.graph_status()

# Reports which config file was loaded (None means Acquirium's built-in defaults) and where Acquirium runs
@app.get("/runtime-info")
def runtime_info():
    return {
        "config": str(config['path'].resolve()) if config else None,
        "acquirium_address": acq.address,
    }

# Lists every stream with its newest reading; sample streams while Acquirium has none
@app.get("/streams")
def streams():
    return live_or_sample("streams", live_streams(acq), SAMPLE_STREAMS)

# Lists the drivers Acquirium is running; sample drivers while it runs none
@app.get("/drivers")
def drivers():
    return live_or_sample("drivers", live_drivers(acq.address), SAMPLE_DRIVERS)

# Lists the attributes query builder steps can filter on
@app.get("/query/attributes")
def get_query_attributes():
    return query_attributes()

# Translates query builder steps into a Python script that runs the same query
@app.post("/query/python")
def query_python(spec: QuerySpec):
    return {"python": to_python(spec, acq.address)}

# A rejected query or text (Acquirium's ValueError: unknown alias, unresolvable text, ...) is a 400 with the
# message and, for text that did not match confidently, the closest candidates for the user to pick from
def rejected(error: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(error), "candidates": getattr(error, "candidates", [])})

# Matches typed text to one node, or reports the closest candidates; never runs a query
@app.post("/query/resolve")
def query_resolve(request: ResolveRequest):
    try:
        return resolve_text(acq, request.text, request.kind)
    except ValueError as error:
        return rejected(error)

# Runs query builder steps on Acquirium; a sample result when it matches nothing and Acquirium has no streams
@app.post("/query/run")
def query_run(spec: QuerySpec):
    try:
        result = run_query(acq, spec)
    except ValueError as error:
        return rejected(error)
    if not result["rows"] and not has_streams(acq):
        return {"source": "sample", **SAMPLE_QUERY_RESULT}
    return {"source": "live", **result}
