# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This branch carries a **working skeleton**: FastAPI backend in `backend/`, React + TypeScript
frontend in `frontend/`, both running and tested. Every panel is wired end to end, but
against **fixture data** — the live Acquirium adapter
(`backend/acquirium_gui/adapters/live.py`) is a documented stub and is the next real piece of
work. See [README.md](README.md) for what is and is not implemented.

Branch layout matters more than usual here:

| Branch | Contents |
|---|---|
| `main` | `.gitignore` + `LICENSE` only. |
| `origin/svelte-frontend` | The **planning work**: `overview.md`, `design.md`, `requirements.md`, `tasks.md`, plus Acquirium reference docs under `.claude/ref/`. No implementation. |
| `react+typescript_Liam` | This branch. A parallel **React + TypeScript** take on the same product, scaffolded and running. |

The client asked for multiple framework proof-of-concepts, so `svelte-frontend` and this
branch are deliberate alternatives, not a migration. The design/requirements/tasks docs on
`svelte-frontend` are framework-agnostic except for the Svelte/Vite specifics — treat them
as the spec for this branch too.

Read them without switching branches:

```bash
git show origin/svelte-frontend:design.md
git show origin/svelte-frontend:requirements.md   # 14 user stories, each with an acceptance check
git show origin/svelte-frontend:tasks.md          # test-first task breakdown
git show "origin/svelte-frontend:.claude/ref/client-api.md"   # full Acquirium Python client reference
git show "origin/svelte-frontend:.claude/ref/query-cookbook.md"
```

In Git Bash, prefix with `export MSYS_NO_PATHCONV=1;` or the `:` in the revspec gets mangled
into a Windows path.

## What this project is

A no-code query editor for [Acquirium](https://github.com/DataDrivenCPS/acquirium), a
knowledge-graph system that runs locally on a water treatment operator's server and
continuously validates a plant model. Acquirium's query interface is a Python API; this GUI
exists so a plant operator never has to open a Python environment — or see RDF.

The UI is a **skin over Acquirium's existing lazy `Query` builder**, not a second query
engine. Every panel maps onto real verbs and terminals:

| Surface | Backed by |
|---|---|
| The plant graph — the workspace, filling the window | `GET /graph/model` once, `POST /graph/subgraph` per step |
| **Build** tab — the query builder | `entity()`, `related()`, `measurement()`, `where()`, `refocus()` |
| **Matches** tab — metadata preview | `.metadata()`, re-run automatically after every builder step (cheap, lazy) |
| **Data** tab — dataframe | `.dataframe(shape="wide")`, only on explicit **Execute** click |
| **Query** / **Ask** tabs | the read-only generated query, and the LLM placeholder |

The wireframe (`.claude/ref/Acquirium Initial QI Design.png` on `svelte-frontend`) shows
these as four fixed quadrants. This branch instead makes the graph the workspace and docks
the rest behind tabs, at the client's request — the mapping of surface to verb is unchanged.
The builder draws the query as nested cards (`frontend/src/state/queryTree.ts` derives the
tree from the flat step list); aliases, `frm`/`target` pickers and `refocus()` rows appear
nowhere in the UI, and neither do they in the results columns
(`backend/acquirium_gui/naming.py`).

Metadata is cheap and timeseries retrieval is not — that asymmetry is real and mirrors
`Query`'s lazy `metadata()` / `data()` split, so it still shapes the code. What changed at
the user's request is the default: **readings are now retrieved automatically**, but only
after a debounce (`RETRIEVE_DEBOUNCE_MS` in `QueryContext`), only when the query actually
contains a measurement, and only while `auto_retrieve_data` is on. That setting is the
escape hatch for a plant with large histories — turn it off and the refresh button in the
Readings band becomes the only way to fetch. Never fetch timeseries *eagerly and
undebounced*: a user typing a class name must not cost four retrievals.

## Architecture

```
acquirium-GUI (this repo)                    acquirium (dependency, unmodified)
┌────────────────────────────┐               ┌──────────────────────────┐
│ our FastAPI app            │               │ their FastAPI server     │
│  GET  /api/graph/model     │               │  :8000                   │
│  POST /api/graph/subgraph  │               │  graph DB + timeseries   │
│  POST /api/query/metadata  │   Adapter     └──────────────────────────┘
│  POST /api/query/execute   │  ───────────▶  stub.py  → fixtures (today)
│  POST /api/query/generated │  (the ONE     live.py   → Acquirium client
│  POST /api/resolve         │   seam)                   API (not built)
│  GET  /api/attributes/…    │
│  GET/PUT /api/config       │
│  GET/POST /api/llm/…       │  placeholder, returns 501
│  StaticFiles → built UI    │
└────────────────────────────┘
```

Every route goes through `AcquiriumAdapter` (`backend/acquirium_gui/adapters/base.py`).
Routes never import `acquirium`, and nothing but an adapter ever sees a URI. Adding an
endpoint means adding a method there and implementing it in both adapters.

- **Frontend builds to static assets.** No Node runtime at deploy time; FastAPI serves the
  built bundle via `StaticFiles`. This is what lets `pip install` ship the UI.
- **Backend depends on `acquirium` as a library**, through its public `Acquirium` /
  `AcquiriumClient` API only — never Acquirium internals, and no upstream PR is needed.
- **Frontend state is a serializable query description** (the shape of `Query.to_dict()`),
  replayed against the backend after each edit. The frontend must not reimplement query
  semantics (laziness, aliasing, `via=`, `direction=`) — drive the real `Query` and reflect
  its state back.
- Acquirium has **no endpoint that returns a renderable topology graph**. `to_dict()`
  describes the query pattern, `resolved_nodes()` returns URIs with no edges. That gap is
  why `/graph/model` and `/graph/subgraph` exist and must be built on `sparql_query()` +
  `resolve()`.

### Graph node labeling rule

`/graph/model` starts class-level ("Pump", "Tank") for the empty-query state. Once a query
matches real equipment or a system, that node **renames to the matched instance label**
("P1", "RO"). Highlighting and relabeling both come from `/graph/subgraph`.

## Non-negotiable constraints

These come from the client brief and shape most implementation choices:

1. **No URIs, CURIEs, or SPARQL text anywhere in the default UI** — including API payloads
   the frontend renders. An opaque internal id is fine; a URI string is not. There is one
   exception: a deliberate read-only "view generated query" panel for technical users.
2. **Fully offline.** No CDN fetches, no external database, no Docker at runtime. Bundle the
   graph library (Cytoscape.js was chosen on the Svelte branch) rather than linking it.
3. **One command, one URL.** Installing the package installs the UI; a single launch command
   serves it at `localhost:8000`.
4. **Single-user, no auth, localhost-only** for this iteration.
5. **Cross-platform** (macOS, Linux, Windows).

## Free-text resolution UX

Every free-text slot (entity class, predicate, attribute value) follows one pattern:
type → debounced `resolve(text, kind, top_k=3)` → if the top candidate clears the configured
confidence threshold with no close runner-up, accept silently and show its label; otherwise
show a picker of the top 3 **labels**.

This is a safety net, not polish. Acquirium's resolver returns the closest candidate above
`min_score` (0.5 default), so *a bad input yields a wrong answer rather than an error*. The
disambiguation picker is the only thing standing between a typo and a confidently wrong query.

The confidence threshold and the graph-size simplification limit are **runtime-configurable**
(config file + in-UI settings icon, backed by `GET`/`PUT /config`) — never hardcoded in the
frontend. Config file format and location are still undecided; match `acquirium.toml`'s
convention.

## Development setup

Paths below are Windows (`.venv/Scripts/`); on macOS/Linux that is `.venv/bin/`.

```bash
# once. Two Windows traps, both documented in README.md: `py` rather than
# `python` (the bare name is usually the Store alias stub, which fails with
# "The system cannot find the path specified"), and the version pinned rather
# than bare `py` -- bare `py` re-points an *existing* venv at whatever Python
# is newest and leaves its 3.13-built wheels behind, which surfaces later as
# "No module named 'pydantic_core._pydantic_core'".
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -e "backend[dev]"

# the app: one command, one terminal, http://127.0.0.1:5001
.venv/Scripts/python.exe -m acquirium_gui

# the app, with hot reload while editing the frontend
.venv/Scripts/python.exe -m acquirium_gui --dev

# tests
cd backend && ../.venv/Scripts/python.exe -m pytest
cd frontend && npm test          # vitest
cd frontend && npm run typecheck # tsc --noEmit
```

`acquirium_gui/launcher.py` is what makes that one command enough: in a checkout it notices
the built UI is missing or older than `frontend/src` and runs `npm install`/`npm run build`
itself; in an installed wheel there are no sources to compare against, so it serves what
shipped. A **stale bundle is the failure it exists to prevent** — the app runs, looks right,
and serves last week's UI. `--no-build` opts out.

`--dev` is the one mode that still runs two processes, started and stopped from the single
terminal: Vite owns **5001** and proxies `/api` to the API on **5002**, so the browser only
ever sees one origin and CORS stays a development-only concern. Vite exiting immediately
(port already held by a leftover dev server) is reported rather than leaving the user on a
URL that serves nothing. `npm run build` writes to `backend/acquirium_gui/static/`,
deliberately **not** `dist/` — see the Gotchas section.

Which backend the app talks to is one environment variable: `ACQUIRIUM_GUI_ADAPTER=stub`
(the default, fixture data) or `live` (not implemented yet). Everything goes through
`backend/acquirium_gui/adapters/base.py`; nothing else in the codebase knows Acquirium
exists.

The stub is scaffolding, not a destination. Real work still needs a **live local Acquirium
server** — the acceptance checks in `requirements.md` compare against it, not against mocks.
Note it needs Python 3.12, which the current `.venv` (3.13) is not.

```bash
# Python 3.12 required
pip install acquirium[watertap]
acquirium server --config deployments/WATERTAP/models/seawater-ro/acquirium.toml
curl http://localhost:8000/health
```

First start builds the text-resolution embedding indexes and takes 5–10 minutes; later
starts reuse `data_dir/embedding_cache`. The WaterTAP seawater-ro model from the
[acquirium repo](https://github.com/DataDrivenCPS/acquirium/blob/main/deployments/WATERTAP/readme.md)
is the fixture every example and acceptance check in `requirements.md` was captured against.

Sanity check from Python:

```python
from acquirium import Acquirium
acq = Acquirium(server_url="localhost", server_port=8000)
acq.query().entity("pump").metadata()
```

## Working style

- **Test-driven, by the user's explicit preference** — not just for the planning pass. A task
  isn't started until its failing test exists. `tasks.md` is sequenced this way; keep it so.
  UI flows too awkward to unit test get a written manual verification checklist instead, so
  "done" always has a check attached rather than being judged by eye.
- **Acceptance checks are written against the live server.** Most stories in
  `requirements.md` are phrased as "the UI produces the same rows as
  `acq.query()....metadata()` run directly" — verify that way rather than eyeballing.
- **Don't commit the planning docs on the user's behalf.** They review and commit
  `design.md` / `requirements.md` / `tasks.md` themselves.

## Open questions (still unresolved)

- **In-process vs. companion-process backend**: can our router mount onto `acquirium server`'s
  own FastAPI app (one port), or do we run a second local process that talks to it over HTTP?
  Answering it needs a look at Acquirium's server startup code, not just its client API. This
  blocks how the single launch command is wired (packaging, §8), not the endpoints themselves.
  Still open — the scaffold runs as a companion process because that is what works without
  Acquirium installed, not because the question was answered.

**Config file format/location** is now settled in code, ahead of the planning docs: TOML, one
`[acquirium_gui]` table, at `./acquirium-gui.toml`, overridable with `ACQUIRIUM_GUI_CONFIG`
(`backend/acquirium_gui/config.py`). Matches `acquirium.toml`'s convention. Raise it with the
user before changing, and fold it into `design.md` when they next touch that file.

Resolved questions are recorded in `design.md`'s "Resolved questions" section — check there
before re-litigating graph scope, the confidence threshold, upstream contribution, or graph
size limits.

## Gotchas

- `.gitignore` started as GitHub's **Python** template. Node/frontend ignores were appended
  in a marked block at the bottom; keep additions there rather than editing the template.
- That template ignores `dist/`, which collided with shipping the Vite build inside the
  wheel. **Resolved by building elsewhere**: Vite writes to
  `backend/acquirium_gui/static/`, which is gitignored as build output but included in the
  wheel via `artifacts` in `backend/pyproject.toml`. Don't move the build back to `dist/`.
- `backend/pyproject.toml` has no `readme`/`license = {file=...}`: hatchling refuses paths
  outside the project directory, and both files live at the repo root.
- The `--adapter live` flag and `ACQUIRIUM_GUI_ADAPTER=live` both select an adapter that
  raises on every call. That's intentional — it fails loudly with a message naming what to
  implement, rather than silently serving fixtures.

## Out of scope this iteration

Embedded Grafana-style dashboards and an LLM chat query builder are the client's bonus goals,
not deliverables. Both are architecturally compatible (a dashboard consumes the same
`.dataframe()` calls; chat emits the same query-description JSON), but don't build them.

The LLM seam is marked but empty: `frontend/src/panels/LlmPanel.tsx` (disabled input) and
`backend/acquirium_gui/routes/llm.py` (`/status` reports unavailable, `/translate` returns
501). The constraint recorded there is the one to preserve — the LLM must emit the same
`QueryDescription` the buttons produce and load it into the ordinary builder, so its output
stays editable and every other panel works untouched. It gets no query path of its own.
