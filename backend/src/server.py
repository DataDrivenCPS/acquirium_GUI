import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
import acquirium as acquirium_lib
from src.config import load_config

acq = None
config = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global acq, config
    # TODO: fix when backend is connected to frontend
    # config path is piped through stdin until the GUI provides one
    config = load_config(sys.stdin.readline().strip())
    acq = acquirium_lib.init(config=config['path'])
    try:
        yield
    finally:
        acquirium_lib.shutdown()

app = FastAPI(lifespan=lifespan)

# Returns plain description for root
@app.get("/")
def root():
    return {"description": "Acquirium GUI Backend"}

# Defines Acquirium sub-process server health
@app.get("/server-health")
def server_health():
    return acq.client.health()