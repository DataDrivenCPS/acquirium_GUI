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
  components/query/       QueryWorkspace owns the steps -> builder (StepEditor, steps.ts) and results windows;
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
