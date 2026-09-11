"""The FastAPI application.

Two ways to run it:

* **Development** -- this app alone on :5002, with Vite serving the UI on
  :5001 and proxying ``/api`` here. ``npm run dev`` in ../frontend.
* **Packaged** -- this app alone, serving the built frontend from
  ``acquirium_gui/static`` at the same origin. One process, one port, no Node
  runtime, which is what lets the UI ship inside a wheel.

Both are wired by :mod:`acquirium_gui.__main__`.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from acquirium_gui.adapters import AdapterError
from acquirium_gui.routes import graph, llm, meta, query, resolve

# Where `npm run build` writes. Absent until the frontend has been built,
# which is fine in development.
STATIC_DIR = Path(__file__).parent / "static"

API_PREFIX = "/api"

# Vite's dev server. Only needed in development, where the UI is served from a
# different port than the API; in the packaged layout both are same-origin and
# this allowance is never exercised.
DEV_ORIGINS = [
    "http://localhost:5001",
    "http://127.0.0.1:5001",
]


def create_app(*, serve_static: bool = True) -> FastAPI:
    app = FastAPI(
        title="Acquirium GUI",
        version="0.1.0",
        description="A no-code query interface for Acquirium.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=DEV_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AdapterError)
    def _adapter_error(request: Request, exc: AdapterError) -> JSONResponse:
        """Turn a query that cannot be answered into a readable message.

        The brief is explicit that a query with no answer must explain itself
        rather than crash, so adapters raise AdapterError with user-facing
        wording and it lands here.
        """
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    for module in (meta, graph, query, resolve, llm):
        app.include_router(module.router, prefix=API_PREFIX)

    if serve_static and STATIC_DIR.is_dir():
        _mount_frontend(app)

    return app


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built UI, with client-side routing falling back to index.html."""
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )

    index = STATIC_DIR / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # Any non-/api path is a UI route; hand back the shell and let the
        # frontend router sort it out.
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
