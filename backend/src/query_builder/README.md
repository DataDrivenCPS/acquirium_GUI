# query_builder

**Status: stub.** The interface is in place, but the behavior is not implemented yet.

This package is meant to turn the operator page's query builder steps into an Acquirium query, and
the same steps into a standalone Python script, so the Python the page shows always matches what
**Run** executed. A complete working version exists in commit `37c7b32` if you want a reference.

## What exists today

- **The request format** (`query_spec.py`): the pydantic step models and
  `QuerySpec`, with their validation. The backend already uses them to parse request bodies, so
  malformed steps get a 422.
- **`Call`** (one method call on an Acquirium `Query`) and **`MAX_ROWS`** (1000).
- **Stub functions:** `to_calls`, `apply_calls`, `run_query`, `to_python` and `query_attributes`
  each raise `NotImplementedError`. Their docstrings say what they should return.
- **Wiring:** the backend's `/query/attributes`, `/query/python` and `/query/run` routes call these
  functions, and answer **501 Not Implemented** until they're filled in. The frontend's query
  windows are stubs too, and their comments name the routes and types they'll use.

## Intended behavior

The frontend sends `{ "steps": [...] }`. Each step should become one call on Acquirium's explore
`Query`:

| Step `kind` | Becomes | Main fields |
| --- | --- | --- |
| `entity` | `.entity(cls, uri=, alias=, **filters)` | `cls`, `uri`, `alias` |
| `related` | `.related(cls, uri=, alias=, frm=, via=, direction=, max_depth=, nearest=, **filters)` | from an earlier alias to related things |
| `measurement` | `.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)` | measurement points; all streams if it's the first step |
| `where` | `.where(target, **filters)` | at least one filter |
| `include` | `.include(*names, of=, required=)` | extra output columns |

A filter is `{ "attr": "medium", "value": "brine", "exclude": false }`; `exclude: true` should become
`medium=Not("brine")`. Blank text fields already arrive as `None`, meaning "use Acquirium's default",
so they should be left out of the call.

```
QuerySpec --to_calls()--> [Call(method, args, kwargs), ...]
                             |                         |
     run_query(acq, spec): apply_calls()        to_python(spec, address):
     then .metadata() -> table                  Python source of the same calls
```

| Function | Should return |
| --- | --- |
| `run_query(acq, spec)` | `{"columns", "rows" (first MAX_ROWS), "total_rows", "truncated"}`; `ValueError` for an empty spec (the backend turns `ValueError` into a 400) |
| `to_python(spec, address)` | a script that connects with `acquirium.Acquirium` to `address` and makes the same calls |
| `query_attributes()` | `[{"name", "roles", "doc"}, ...]` from Acquirium's attribute `REGISTRY` |

When you implement it, make sure the Python that `to_python` writes makes exactly the calls that
`run_query` makes. The reference version tested this by running the generated script against a
stand-in that records calls.

## Tests

From `backend/`:

```bash
uv run --extra dev python -m pytest tests/test_query_spec.py
```

Today the tests check the step validation, that each
behavior raises `NotImplementedError`, and that the public interface is still there. Replace the
`NotImplementedError` tests with real ones as you implement each function (test first; see
[backend/tests/README.md](../backend/tests/README.md) for the TDD workflow).
