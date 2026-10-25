# Frontend

The operator page: a React + TypeScript + Vite app. It reads everything from the backend through
relative `/api/...` URLs, which Vite's dev server proxies to `http://127.0.0.1:8000` with the `/api`
prefix removed (see `vite.config.ts`).

This folder's `package.json` is also the project's launcher: `npm install` here sets up the Python
environments too, and `npm run dev` starts the backend along with the page. See the
[root README](../README.md) for the full setup.

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Installs packages, then runs `uv sync` for `../backend` |
| `npm run dev` | Backend on :8000 and the page on :5173 together; Ctrl+C once stops both |
| `npm run dev:web` / `npm run dev:api` | Only the page / only the backend |
| `npm test` | Backend (fast), then frontend tests |
| `npm run test:frontend` | Frontend tests once (Vitest) |
| `npm run test:watch` | Frontend tests, re-run on every save |
| `npm run test:backend` | The fast Python tests |
| `npm run build` | Type-checks the app and the tests (`tsc -b`), then builds `dist/` |
| `npm run lint` | oxlint |

`npm run dev` starts Vite with `node node_modules/vite/bin/vite.js` rather than `vite`. On Windows
the `vite` command is a batch file, and Ctrl+C makes `cmd.exe` stop to ask "Terminate batch job
(Y/N)?", which made it look as if one Ctrl+C wasn't enough.

## Layout

```
src/
  App.tsx, App.css        the operator grid (left) + status panel (right). Grid rows (App.css):
                          streams | graph, builder | python, results, drivers
  api/types.ts            shapes of the backend's JSON; keep in sync with backend/src/server.py
  api/http.ts             postJson(): POST helper with readable errors (ApiError)
  format.ts               formatValue, formatTime
  hooks/                  usePolledJson (GET every 3 s), useDebouncedPost (POST once edits pause)
  components/layout/      Window (titled, collapsible panel; flags sample data), DataTable,
                          PolledBody, CollapseToggle
  components/streams/     Streams window and its filter
  components/graph/       Graph window (placeholder)
  components/drivers/     Drivers window
  components/query/       QueryWorkspace owns the steps and result options -> builder (StepEditor, steps.ts) and results windows
                          (ResultOptionsPanel, options.ts: view, limit, order, layout, group-by);
                          the Python window is still a stub that says "Not implemented yet"
  components/status/      status panel (collapsible)
tests/                    mirrors src/; support/ has the test setup, mockFetch and fixtures
```

## Conventions

- Function components and hooks; string-union types for state (`PollResult`, `RunState`, `Tone`).
- Code carries beginner-friendly comments that explain React and TypeScript ideas. Keep that style.
- Every panel is a `Window`: pass `title`, `area` (its cell in `.operator-grid`) and `source`, so
  sample data is flagged the same way everywhere. A new window also needs a cell in
  `grid-template-areas` in `App.css`, and its place in `App.tsx` should match its place on screen
  (that's the Tab key order; `tests/App.test.tsx` checks it).
- The backend decides whether data is live or sample (`source: 'live' | 'sample'`); the frontend
  only displays that.

## Tests

Vitest with React Testing Library in a simulated browser (jsdom). Tests live in `tests/`, one file
per source file or component, in the same folders as `src/`.

- `tests/support/mockFetch.ts` replaces `fetch` with a fake backend:
  `mockFetch({ 'GET /api/streams': { body: { ... } } })`. A request with no matching route fails
  like a network error, which is how a stopped backend looks.
- Find windows by their title: `screen.getByRole('region', { name: 'Streams' })`.
- Hooks that poll or wait use fake timers (`vi.useFakeTimers()`); see `tests/hooks/`.
- `npm run build` type-checks the tests too (`tsconfig.test.json`).

Test packages are pinned to versions that still run on Node 20.19 (Vitest 4, jsdom 28,
jest-dom 6). Install packages with npm 11 (`npx npm@11 install ...`): npm 10 removes the `libc`
fields from `package-lock.json`.

### Result options tests

How the readings view and its aggregation panel are covered (see the root README, "Aggregating readings").

`tests/components/query/ResultOptions.test.tsx` renders the query windows against a fake backend:

| Test | What it checks |
| --- | --- |
| starts with the metadata and no aggregation panel | A fresh page shows no Data aggregation panel and no Back to metadata button. |
| disables View readings until the query has a measurements step, and says why | The button is disabled with an explanation, then enabled once a measurements step exists. |
| sends only the steps for a plain run | A normal Run sends no options, so it is the request it always was. |
| runs the same steps for readings, shows them as returned and opens the aggregation panel below them | View readings re-sends the same steps with the readings options; times are not shortened like identifiers. |
| shows a stream as where and what, keeping the full name on hover | A long stream name is shortened in the header and the original is the hover text. |
| applies a limit, an order and a layout from the panel | Apply sends the readings per stream, order and layout chosen. |
| groups readings by stream with every aggregate, and fixes the layout while grouped | Summarize with offers all seven aggregates, Layout is disabled, and Apply sends the group-by and aggregate. |
| goes back to the metadata, and the panel goes away | Back to metadata re-runs without options and hides the panel. |
| drops the stale readings when a step is edited, back to an empty metadata view | Editing a step clears the readings so they are not read as the new query's. |
| shows a rejected option as the builder error, like any rejected query | A 422 for a bad option appears as a readable message in the builder. |

`tests/components/query/options.test.ts` (the request the options become):

| Test | What it checks |
| --- | --- |
| sends nothing for the metadata table | The default options produce no `options` field. |
| sends the newest readings in the wide layout for View readings | View readings sends readings, newest first, wide, with no limit so the backend default applies. |
| sends the limit, order and layout that were chosen | Chosen values are sent as they are. |
| sends a group-by as a list with its aggregate | The single group-by column becomes a list, with its aggregate. |

`tests/components/query/display.test.ts` (readable names, added to the existing file):

| Test | What it checks |
| --- | --- |
| `readableStream`: shortens (three examples) | `...__intake in flow rate` becomes `Intake In (Flow Rate)`, keeping in and out. |
| `readableStream`: drops the node part ... keeps acronyms | A label with no where and what keeps only its own words, and `PXR` and `RO` stay as written. |
| `readableStream`: still shortens a label that has no node part | A label without the double underscore is still reshaped. |
| `readableHeaders`: names the fixed columns in plain words | `time`, `data_alias`, `point_id`, `value_numeric` and `value_text` get plain names. |
| `readableHeaders`: names a summary column after its aggregate | `mean(value)` becomes `Mean Value`, and `count` becomes `Count`. |
| `readableHeaders`: shortens the stream columns | Stream columns are shortened while Time stays. |
| `readableHeaders`: tells a stream going in from one coming out of the same thing | `brine in` and `brine out` stay different headers. |
| `readableHeaders`: falls back to the whole names when two streams still shorten to the same text | Identical shortened headers keep their full names. |
