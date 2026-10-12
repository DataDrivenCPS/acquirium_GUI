# Tests

Run from `backend/` (or `npm run test:backend` from `frontend/` for the fast tests):

```
uv run --extra dev python -m pytest -m fast   # unit tests, about a second
uv run --extra dev python -m pytest -m slow   # integration tests that start real Acquirium servers, 30–90 s
uv run --extra dev python -m pytest           # both
```

Tests must run with `backend/` as the working directory via `python -m pytest`, so `src.*` imports
resolve. The query builder's own tests live in [`../../query_builder/tests`](../../query_builder/tests).

Our TDD workflow should be:
- Write failing tests to ensure desired function implementation.
- Implement functions to pass tests.
    - Ensure other unrelated tests do not fail as a result of implementation.
- Refactor!

Make sure your test file names are prefixed with 'test_' so pytest can discover new tests. Additionally, test functions should start with 'test_'. Pytest will search nested directories recursively unless specified otherwise.

<https://docs.pytest.org/en/stable/explanation/goodpractices.html#test-discovery>

## What's here

- Mark every test `@pytest.mark.fast` or `@pytest.mark.slow`.
- `config_stubs.py`: TOML strings for config tests, written to `tmp_path`. Never use real config files.
- `fakes.py`: stand-in Acquirium payloads (`DRIVER`, `STREAM_KEYS`).
- The `/query/*` route tests swap the `query_builder` functions for fakes (it's a stub for now), so they
  check only what the routes do; one test checks that the real stub makes them answer 501.
- Route tests replace `server.acq` with a `SimpleNamespace` fake and use a `TestClient` without
  `with`, so the startup code (which would start Acquirium) never runs.
- `test_live_data.py` (slow) runs a real Acquirium with its system-metrics driver, so the streams and
  drivers routes are checked against live data.
