# Acquirium GUI

A web interface for [Acquirium](https://github.com/DataDrivenCPS/acquirium): live streams and the drivers feeding them, with places reserved for a graph and a query
builder that are not implemented yet.

## Repository layout

| Folder | What it is | Docs |
| --- | --- | --- |
| [`frontend/`](frontend/) | React + TypeScript + Vite page, and the launcher that starts everything | [frontend/README.md](frontend/README.md) |
| [`backend/`](backend/) | FastAPI server that owns one Acquirium instance and serves the page's data | [backend/README.md](backend/README.md) |

Each folder has its own `tests/`. The query builder lives inside the backend, in
[`backend/src/query_builder/`](backend/src/query_builder/).

## Prerequisites

- [Node.js](https://nodejs.org) 20.19+ or 22.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/), which also installs Python 3.13

## Setup

Run once, and again whenever dependencies change:

```bash
cd frontend
npm install
```

This installs the frontend's packages, then (in its `postinstall` step) the Python environment of
`backend/`.

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
- **Query builder** and **Query results**: build an Acquirium query step by step (entity, related
  entity, measurements, filter, refocus), press Run, and see the metadata table it returns. Typed
  class names that don't match confidently list the closest nodes to pick from. **View readings** (enabled once the query has a measurements step) shows the matched
  streams' values with a data aggregation panel below them: readings per stream, order, layout, and group by
  stream with count, mean, min, max, sum, first or last. Apply re-runs with them. See
  [backend/src/query_builder/README.md](backend/src/query_builder/README.md).
- **Python**: still a placeholder; it will show the query as a Python script.
- **Drivers** (bottom): the drivers feeding data into Acquirium, with their status and poll interval.
- **Status** (right): each part of the system, re-checked every 3 seconds: the frontend, the
  backend, the Acquirium server, its embedding indexes and graph, the config in use, and Acquirium's
  address. Click its title to collapse it to a narrow strip.

While Acquirium has no streams or drivers, the Streams and Drivers windows show made-up sample rows,
marked **Sample data**. As soon as Acquirium has live data, it replaces the samples on the next
refresh.

## Aggregating readings

A query first shows its **metadata**: which streams matched, with no values. To see and summarize the
values, use the readings view.

1. **Build a query with a measurements step.** Only measurements have readings. For example, press
   *Use measurements*, press *Add filter*, and filter `quantity_kind` = `mass concentration`.
2. **Press Run** and check the metadata: these are the streams you will get values for.
3. **Press View readings** in the Query results window. The button is greyed out until the query has a
   measurements step. The table now shows each stream's newest readings, one column per stream, and the
   **Data aggregation** panel appears below it. Every stream says which entity it belongs to, so you can tell
   which pump a reading came from: wide columns have the entity on top (`Pump 1`, spanning its streams) and each stream's name under it (`Intake In (Flow Rate)`), and the narrow and
   grouped tables have a column named after the entity step (for example `Pump`).
4. **Shape the readings** in the panel, then press **Apply** to run the query again with your choices:

   | Control | What it does |
   | --- | --- |
   | Readings per stream | How many readings to pull for each stream. Blank means 100; the most allowed is 100,000. |
   | Order | *Newest first* (default) keeps the newest readings when there is a limit; *Oldest first* keeps the oldest. |
   | Layout | *Wide* is one column per stream. *Narrow* is one row per reading (Stream, Stream Identifier, Time, Value). |
   | Group by | *No grouping*, or *Stream* / *Stream Identifier* to get one row per entity and stream. |
   | Summarize with | Appears once you group: count, mean, min, max, sum, first or last of each stream's values. |

5. **Press Back to metadata** to return to the matched streams.

Things to know:

- A grouped table always has one row per entity and stream, so Layout is fixed while you group. Two pumps that
  both have a stream called "intake flow rate" get a row each, never one mean over both. Streams are the only
  thing readings can be grouped by, because each stream has its own unit and averaging different units
  would mean nothing.
- *First* and *last* mean the earliest and latest reading in time, whichever order you chose.
- *Readings per stream* limits what is pulled before summarizing, so *mean* with a limit of 10 is the mean of
  the 10 readings you asked for, not of the stream's whole history.
- Changing a step while readings are showing clears them, so old values are never read as the new query's.
- An empty readings result is shown as empty; the made-up sample rows only stand in for an empty metadata table.
- Column names are shown in plain words ("Intake In (Flow Rate)"); hover a header for the full name.

## Exporting results

The **Export** buttons above the Query results table save what the table shows as a file:

| Button | File | Good for |
| --- | --- | --- |
| CSV | `query-readings-2026-11-08.csv` | Excel and other spreadsheets (comma-separated, opens with accents intact) |
| JSON | `query-readings-2026-11-08.json` | Programs: a list with one object per row, keyed by column name |
| TXT | `query-readings-2026-11-08.txt` | A quick look or pasting: tab-separated, one line per row |

- The file is named after the table (`metadata` or `readings`) and the day, and your browser saves it where it
  saves downloads.
- The file has the same column names and values as the page, so a wide readings column is `Pump 1 | Intake In (Flow Rate)`
  (entity, then stream) in one header. An empty value is an empty field in CSV and TXT and `null` in JSON.
  JSON values are text, as on the page.
- Only the rows the page holds are exported: at most 1,000. When a result is longer, the page says "Showing the first
  1,000 of N rows" and the buttons say "Only the rows shown are exported."; set a smaller *Readings per stream* or group
  the readings to bring the table under that.
- The buttons are disabled until a query has run and matched something.

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

This runs the fast backend tests (including the query builder's) and the frontend tests, in that order.
`npm run test:backend` and `npm run test:frontend` run one suite. Each
folder's README covers its own tests, including the backend's slow integration tests.
