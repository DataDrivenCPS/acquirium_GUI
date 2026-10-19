# Backend

A FastAPI server that owns one Acquirium instance and serves the data the operator page shows. On
startup it picks a config, starts Acquirium (`acquirium.init()`, which launches a separate Acquirium
server process and waits until it answers), and stops it again on shutdown.

Normally started with `npm run dev` from `frontend/` (see the [root README](../README.md)). To run
it alone, from this folder:

```bash
uv run uvicorn src.server:app --port 8000
```

## Config

1. `ACQUIRIUM_GUI_CONFIG`, if set: a path to an Acquirium TOML, absolute or relative to `backend/`.
2. Otherwise `backend/acquirium.toml`, if it exists.
3. Otherwise Acquirium's built-in defaults (127.0.0.1 on a random port, data in `backend/.acquirium/`).

`src/config.py` only checks that the file exists, ends in `.toml` and parses; Acquirium reads its
contents. Don't set Acquirium's `[server] port` to 8000, which this server uses.

## Routes

| Route | Returns |
| --- | --- |
| `GET /` | a description, so you can see the server is up |
| `GET /server-health` | Acquirium's own health check |
| `GET /embedding-status` | state of Acquirium's text-matching indexes |
| `GET /graph-status` | graph data version and whether the query cache has caught up |
| `GET /runtime-info` | the config file in use and Acquirium's address |
| `GET /streams` | every stream with its newest reading; `source: "sample"` rows while there are none |
| `GET /drivers` | the drivers Acquirium runs; sample rows while it runs none |
| `GET /query/attributes` | attributes query steps can filter on |
| `POST /query/python` | query builder steps as a Python script |
| `POST /query/run` | query builder steps run on Acquirium; a sample table if nothing matches and there are no streams |

The query routes delegate to the [`query_builder`](../query_builder/) package, which this project
installs from `../query_builder` (see `[tool.uv.sources]` in `pyproject.toml`).

## Layout

```
src/server.py        app, lifespan (config + Acquirium start/stop) and the routes above, kept thin
src/config.py        load_config(path) -> {"path": Path}; raises ConfigError
src/streams.py       live_streams(acq), has_streams(acq)
src/drivers.py       live_drivers(address): Acquirium's GET /drivers/list (its Python client has no call for it)
src/sample_data.py   sample rows and live_or_sample()
tests/               see tests/README.md
```

## Tests

See [tests/README.md](tests/README.md). Short version, from this folder:

```bash
uv run --extra dev python -m pytest -m fast   # unit tests, about a second
uv run --extra dev python -m pytest -m slow   # start real Acquirium servers, 30–90 s
```
