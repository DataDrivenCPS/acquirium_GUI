from contextlib import asynccontextmanager
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"description": "Acquirium GUI Backend"}

@app.get("/server-health")
def server_health():
    return {"status": None}