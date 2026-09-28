from contextlib import asynccontextmanager
from fastapi import FastAPI
import acquirium as acquirium_lib

acq = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global acq
    acq = acquirium_lib.init()
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