# Acquirium GUI

A web interface for [Acquirium](https://github.com/DataDrivenCPS/acquirium), laid out for an
operator: live streams and the drivers feeding them, with places reserved for a graph and a query
builder that are not implemented yet.

## Repository layout

| Folder | What it is | Docs |
| --- | --- | --- |
| [`frontend/`](frontend/) | React + TypeScript + Vite page, and the launcher that starts everything | [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | FastAPI server that owns one Acquirium instance and serves the page's data | [backend/README.md](backend/README.md) |
| [`query_builder/`](query_builder/) | Python package meant to turn query builder steps into an Acquirium query and the matching Python. **Currently a stub.** | [query_builder/README.md](query_builder/README.md) |

Each folder has its own `tests/`. The backend installs `query_builder` from this repo.

## Prerequisites

- [Node.js](https://nodejs.org) 20.19+ or 22.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/), which also installs Python 3.13

## Setup

Run once, and again whenever dependencies change:

```bash
cd frontend
npm install
```

This installs the frontend's packages, then (in its `postinstall` step) the Python environments of
`backend/` and `query_builder/`.

## Run

From `frontend/`:

```bash
npm run dev
```

Open <http://localhost:5173>. This starts the backend on port 8000 and the page on port 5173; the
page's `/api/*` requests are proxied to the backend. The backend starts Acquirium before it accepts
requests (about 20 s the first time, a few seconds after that).

Press **Ctrl+C once** to stop both. In PowerShell the prompt can come back a moment before the last
shutdown lines print; the servers are already stopping, so there's no need to press Ctrl+C again.
If either side fails to start, the other is stopped too.

## The page

A grid of plain data windows. Click a window's title to collapse it to its title bar, and click
again to expand it.

- **Streams**: every stream (measurement point) Acquirium records, with its newest reading, unit,
  quantity kind and source. Refreshes every 3 seconds; the filter box narrows the list.
- **Graph** (right of Streams): a placeholder; nothing is plotted yet.
- **Query builder**, **Python** and **Query results**: placeholders saying "Not implemented yet".
  They're meant to build an Acquirium query step by step, show it as Python, and show its results;
  see [query_builder/README.md](query_builder/README.md).
- **Drivers** (bottom): the drivers feeding data into Acquirium, with their status and poll interval.
- **Status** (right): each part of the system, re-checked every 3 seconds: the frontend, the
  backend, the Acquirium server, its embedding indexes and graph, the config in use, and Acquirium's
  address. Click its title to collapse it to a narrow strip.

While Acquirium has no streams or drivers, the Streams and Drivers windows show made-up sample rows,
marked **Sample data**. As soon as Acquirium has live data, it replaces the samples on the next
refresh.

## Configuring Acquirium

By default the backend uses `backend/acquirium.toml` if it exists, otherwise Acquirium's built-in
local defaults, with data stored in `backend/.acquirium/`. To use another config, set
`ACQUIRIUM_GUI_CONFIG` to its path (absolute, or relative to `backend/`) before `npm run dev`. The
status panel's Config row shows which one was loaded.

```bash
ACQUIRIUM_GUI_CONFIG=/path/to/acquirium.toml npm run dev
```

```powershell
$env:ACQUIRIUM_GUI_CONFIG="C:\path\to\acquirium.toml"; npm run dev
```

To see live data, give Acquirium a driver, for example its built-in system-metrics driver:

```toml
[[drivers]]
spec = "acquirium.Drivers.BuiltInDrivers.system_metrics:SystemMetricsDriver"
interval = 2
```

- Don't set Acquirium's `[server] port` to 8000; the backend uses that port.
- With `exact_only = false`, the first start builds text-matching indexes, which takes up to 15 minutes.

## Tests

From `frontend/`:

```bash
npm test
```

This runs the fast backend tests, the `query_builder` tests, and the frontend tests, in that order.
`npm run test:backend`, `npm run test:query` and `npm run test:frontend` run one suite. Each
folder's README covers its own tests, including the backend's slow integration tests.
