# acquirium-GUI

A no-code query interface for [Acquirium](https://github.com/DataDrivenCPS/acquirium), so a
water treatment operator can ask the plant a question without opening Python — or seeing RDF.

This branch (`react+typescript_Liam`) is the **React + TypeScript** proof-of-concept.
`origin/svelte-frontend` is a deliberate parallel take on the same product, and carries the
shared planning docs (`design.md`, `requirements.md`, `tasks.md`).

## Status

A working skeleton. Every panel is wired end to end and every endpoint returns real data —
but that data comes from **built-in sample fixtures**, not a live plant. The header says
"Sample data" whenever that is the case.

Implemented:

- The plant graph is the workspace and fills the window, drawn with a glyph per kind of
  unit and how many of each the plant has. Everything else lives in a collapsible dock over
  it: **Query**, **Python**, **Ask**.
- The Query tab is one place, three bands: build a question, see what it matches, read the
  data. They are one task -- change a step and watch the rows change -- so they are not
  split across tabs.
- Readings arrive on their own once the query settles, with no Execute step. Retrieval is
  the expensive half of a query, so it is debounced and can be switched back to manual in
  Settings for a plant with large histories.
- The builder is a canvas of connected cards, with the query read back in plain English in
  a bar above the plant. Branching is clicking the card to branch from -- there are no
  aliases, `from`/`target` pickers or "go back to" steps anywhere in the interface.
- Clicking the plant builds the query: the first click starts it, later ones follow a
  connection from the selected card. Hovering focuses a unit and its neighbours; connection
  labels stay off until the query matches one or you ask for them.
- Free-text resolution with a disambiguation picker when a match is ambiguous, plus a
  browsable list of what is actually installed in this plant.
- Class-to-instance graph relabeling ("Cartridge Filter" becomes "CF1" once a query pins it).
- Runtime-configurable confidence threshold and graph size limit, persisted to a TOML file.
- A collapsed "generated query" view for technical users.
- No URIs, CURIEs or SPARQL anywhere else, enforced by a test that sweeps every response.

Not implemented:

- **The live Acquirium adapter.** `backend/acquirium_gui/adapters/live.py` is a stub with a
  written checklist. This is the next real piece of work.
- **Natural-language querying.** A placeholder panel and a 501 route mark the seam; nothing
  calls a model.

## Running it

One command, one terminal, one URL.

Windows:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -e "backend[dev]"
.venv\Scripts\python.exe -m acquirium_gui
```

macOS / Linux:

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install -e "backend[dev]"
.venv/bin/python -m acquirium_gui
```

Run the three lines **in that order**, and only the third one after the first time — the
venv has to exist before anything is installed into it, and re-running the first line is
not the harmless no-op it looks like (see below).

Two Windows details, each of which produces an error that does not look like its cause:

- **`py`, not `python`.** Windows ships an app-execution alias for `python.exe` that is a
  zero-byte stub pointing at the Microsoft Store, so on a machine where Python came from
  python.org and the alias was never turned off, `python -m venv` fails with `The system
  cannot find the path specified` even though Python is installed and working. `py`, the
  launcher bundled with the python.org installer, is not affected. (`Get-Command python`
  tells you which one you have: a path under `WindowsApps` is the stub.)
- **The version is pinned on purpose.** Bare `py` means "whichever Python is newest here",
  and pointing that at a venv that already exists *replaces its interpreter while leaving
  the installed packages alone*. Compiled wheels are built per Python version, so the venv
  then fails on import with something like `No module named
  'pydantic_core._pydantic_core'` — a missing-module error whose real cause is a
  version mismatch. Pinning `-3.13` makes re-running the line a no-op instead.

If a venv does end up in that state, rebuild rather than repair it:

```powershell
py -3.13 -m venv .venv --clear
.venv\Scripts\python.exe -m pip install -e "backend[dev]"
```

Installing the package also puts an `acquirium-gui` command on the PATH, so after the
install the launch line is just `acquirium-gui`.

Open <http://127.0.0.1:5001>. That is the whole app: the API and the user interface from a
single process on a single port, no Node runtime involved.

The first run builds the interface, which takes a few seconds and needs
[Node.js](https://nodejs.org) present; later runs start immediately, and it rebuilds only
when a frontend source file is newer than the last build. `--no-build` skips the check.

If port 5001 is already taken — almost always this app still running in another terminal —
it says so in one line and stops, rather than printing the URL and then failing to bind.
That matters more than it sounds: the browser at that URL keeps working, because the
*earlier* instance is answering it, so a launch that errored can easily look like one that
succeeded. Use `--port` to run a second copy alongside the first.

### While editing the frontend

```bash
.venv/Scripts/python.exe -m acquirium_gui --dev
```

Same one terminal and the same URL, with hot module reload: it starts Vite on **5001** and
moves the API to **5002** behind Vite's `/api` proxy, so the browser still only ever sees
one origin and CORS stays a development-only concern. Ctrl+C stops both. If something else
is already on 5001 — usually a dev server left over from last time — it says so and stops
rather than leaving you on a URL that serves nothing.

### Other flags

```bash
acquirium-gui --adapter live   # against a real Acquirium server, once live.py is written
acquirium-gui --port 8000      # a different URL
acquirium-gui --reload         # restart the API on backend changes
```

### How the packaging works

`npm run build` writes to `backend/acquirium_gui/static/`, which FastAPI serves directly —
that is what lets the UI ship inside a wheel with no Node runtime at deploy time. It is
deliberately not `dist/`, because this repo's Python `.gitignore` ignores that path. An
installed wheel has no frontend sources to compare against, so it simply serves what
shipped.

## Tests

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest
```

```bash
cd frontend && npm test
```

The backend suite pins the API contract — response shapes, the no-URI rule, the
metadata/execute split, config persistence — against the fixture adapter. The acceptance
checks in `requirements.md` ("the UI produces the same rows as `acq.query()…metadata()`")
need a live WaterTAP server and belong with the live adapter when it lands.

UI flows that are awkward to unit test have a written checklist in
[docs/manual-checks.md](docs/manual-checks.md).

## Layout

```
backend/
  acquirium_gui/
    models.py         wire schemas; the frontend mirrors these
    adapters/         the ONE seam to Acquirium
      base.py         the interface every route goes through
      stub.py         fixture-backed, used today
      live.py         real Acquirium — not implemented
    fixtures/         a small seawater-RO plant
    routes/           health, config, graph, query, resolve, llm
    static/           built frontend (generated)
frontend/
  src/
    api/              typed client + the wire types
    state/            the query reducer — pure, tested, no query semantics
    panels/           the four quadrants, plus settings and the placeholders
    components/       resolution field, tables, attribute filters
```

Two things to preserve when extending this:

1. **The frontend never reimplements query semantics.** It records what the user clicked and
   asks the server what that matches. Laziness, aliasing, `via=` and `direction=` belong to
   Acquirium's real `Query`.
2. **Metadata is automatic, data is not.** Timeseries retrieval only happens on an explicit
   Execute. Never call `/api/query/execute` from an effect.
