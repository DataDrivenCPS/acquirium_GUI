import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import acquirium as acquirium_lib
from src.config import load_config
from src.drivers import live_drivers
from src.query_builder import QuerySpec, ResolveRequest, ResultOptions, query_attributes, resolve_text, run_query, run_streams, to_python
from src.sample_data import SAMPLE_DRIVERS, SAMPLE_QUERY_RESULT, SAMPLE_STREAMS, live_or_sample
from src.streams import has_streams, live_streams

logger = logging.getLogger(__name__)

# Path to an Acquirium TOML config, relative to the server's working directory (backend/) or absolute.
CONFIG_ENV_VAR = "ACQUIRIUM_GUI_CONFIG"
# Used when CONFIG_ENV_VAR is unset and this file exists; otherwise Acquirium's built-in defaults apply.
LOCAL_CONFIG_FILE = "acquirium.toml"
# Address of an already running Acquirium server. When set, the GUI attaches to it instead of starting its own,
# and any config is ignored. The GUI never stops a server it did not start.
ADDRESS_ENV_VAR = "ACQUIRIUM_GUI_ADDRESS"

acq = None
config = None
attached = False

# Reads the startup source from the environment: (address, config_path). The address wins when both are set.
def resolve_startup(environ):
    address = environ.get(ADDRESS_ENV_VAR)
    if address:
        if environ.get(CONFIG_ENV_VAR):
            logger.warning("%s is set, ignoring %s", ADDRESS_ENV_VAR, CONFIG_ENV_VAR)
        return address, None
    config_path = environ.get(CONFIG_ENV_VAR)
    if not config_path and Path(LOCAL_CONFIG_FILE).is_file():
        config_path = LOCAL_CONFIG_FILE
    return None, config_path

@asynccontextmanager
async def lifespan(app: FastAPI):
    global acq, config, attached
    address, config_path = resolve_startup(os.environ)
    if address:
        config = None
        acq = acquirium_lib.init(address=address)
    else:
        config = load_config(config_path) if config_path else None
        acq = acquirium_lib.init(config=config['path'] if config else None)
    attached = bool(address)
    try:
        yield
    finally:
        # Acquirium stops only a server it started, so an attached server keeps running
        acquirium_lib.shutdown()
        acq = None
        config = None
        attached = False

app = FastAPI(lifespan=lifespan)

# Code that isn't written yet raises NotImplementedError; report it as 501, not a crash
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
        "mode": "attached" if attached else "managed",
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
    try:
        return {"python": to_python(spec, acq.address)}
    except ValueError as error: # ValueError whenever there are no steps in the query 
        return rejected(error)

# A rejected query or text (Acquirium's ValueError: unknown alias, unresolvable text, ...) is a 400 with the
# message and, for text that did not match confidently, that text, where it was typed, and the closest candidates to pick from
def rejected(error: ValueError):
    return JSONResponse(status_code=400, content={
        "detail": str(error),
        "candidates": getattr(error, "candidates", []),
        "text": getattr(error, "text", None),
        "field": getattr(error, "field", None),
    })

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
    # sample rows stand in only for the metadata table; an empty readings pull is shown as it is
    if spec.options.view == "metadata" and not result["rows"] and not has_streams(acq):
        return {"source": "sample", **SAMPLE_QUERY_RESULT}
    return {"source": "live", **result}

# The streams picked in the streams window (their point identifiers) and how to shape the answer
class StreamsRequest(BaseModel):
    points: list[str]
    options: ResultOptions = ResultOptions()

# Metadata (or, for the readings view, readings) of the chosen streams; the sample table while Acquirium has no
# streams, because the streams window then lists sample streams that Acquirium does not know
@app.post("/query/streams")
def query_streams(request: StreamsRequest):
    try:
        result = run_streams(acq, request.points, request.options)
    except ValueError as error:
        if request.options.view == "metadata" and not has_streams(acq):
            return {"source": "sample", **SAMPLE_QUERY_RESULT}
        return rejected(error)
    return {"source": "live", **result}
