# query_builder

Turns the operator page's query builder steps into an Acquirium query. The same steps also become a
standalone Python script, so the Python the page shows always matches what **Run** executed.

It's a small Python package (`src/query_builder/`). The backend installs it from this folder and
calls it from its `/query/*` routes; it has no web code of its own.

## How it works

The frontend sends `{ "steps": [...] }`. Each step is one call on Acquirium's explore `Query`:

| Step `kind` | Becomes | Main fields |
| --- | --- | --- |
| `entity` | `.entity(cls, uri=, alias=, **filters)` | `cls`, `uri`, `alias` |
| `related` | `.related(cls, uri=, alias=, frm=, via=, direction=, max_depth=, nearest=, **filters)` | from an earlier alias to related things |
| `measurement` | `.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)` | measurement points; all streams if it's the first step |
| `where` | `.where(target, **filters)` | at least one filter |
| `include` | `.include(*names, of=, required=)` | extra output columns |

A filter is `{ "attr": "medium", "value": "brine", "exclude": false }`; `exclude: true` becomes
`medium=Not("brine")`. Attribute names come from Acquirium's registry (`query_attributes()`).
Blank text fields mean "not set", so Acquirium's own defaults apply.

```
QuerySpec (pydantic: validates steps) --to_calls()--> [Call(method, args, kwargs), ...]
                                                        |                   |
                         run_query(acq, spec): apply_calls()     to_python(spec, address):
                         then .metadata() -> table               Python source of the same calls
```

## API

```python
from query_builder import QuerySpec, run_query, to_python, query_attributes

spec = QuerySpec.model_validate({"steps": [{"kind": "measurement", "alias": "m"}]})
to_python(spec, "http://127.0.0.1:58999")  # script that connects to that Acquirium and runs the query
run_query(acq, spec)                        # {"columns", "rows", "total_rows", "truncated"} (first 1000 rows)
```

`run_query` raises `ValueError` for an empty query, and Acquirium raises `ValueError` for queries it
rejects (unknown alias, text it can't resolve); the backend turns those into HTTP 400s.

## Adding a step option

1. Add the field to the step model in `src/query_builder/query_spec.py`; its `to_call()` decides
   the keyword it becomes.
2. Add a test in `tests/test_query_spec.py`.
3. In the frontend, add it to the step type in `src/api/types.ts`, to `newStep()` and to the step's
   fields in `StepEditor.tsx`.

## Tests

From this folder:

```bash
uv run --extra dev python -m pytest
```

Or `npm run test:query` from `frontend/`. All tests are unit tests (marked `fast`) using the
stand-ins in `tests/fakes.py`; none starts Acquirium.
`test_generated_python_makes_the_same_calls` runs a generated script against a recording stand-in
and checks it makes exactly the calls `run_query` makes, so the shown Python can't drift from what
runs.
