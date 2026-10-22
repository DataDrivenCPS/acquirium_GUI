# query_builder

Turns the operator page's query builder steps into an Acquirium query, runs it, and reports text that
did not match a node. **`to_python` is still a stub** (the Python window is a placeholder too).

## What exists

- **The request format** (`query_spec.py`): the pydantic step models and `QuerySpec`, with their
  validation. Malformed steps get a 422.
- **`to_calls` / `apply_calls`**: each step becomes one `Call` on Acquirium's explore `Query`, and the
  calls are chained onto `acq.query()`. Unset options are left out so Acquirium's defaults apply.
- **`run_query(acq, spec)`**: runs `.metadata()` and returns `{"columns", "rows" (first MAX_ROWS),
  "total_rows", "truncated"}`. An empty spec raises `ValueError`.
- **`query_attributes()`**: the attributes steps can filter on, from Acquirium's `REGISTRY`.
- **Text matching** (`resolve.py`): `resolve_text(acq, text, kind)` returns the one node a text
  names, or raises `ResolutionError` carrying the closest candidates (and the text that failed).
  `run_query` checks every entity and related class this way before building the query.
- **Not implemented:** `to_python(spec, address)`.

| Step `kind` | Becomes | Main fields |
| --- | --- | --- |
| `entity` | `.entity(cls, uri=, alias=, **filters)` | `cls`, `uri`, `alias` |
| `related` | `.related(cls, uri=, alias=, frm=, via=, direction=, max_depth=, nearest=, **filters)` | from an earlier alias to related things |
| `measurement` | `.measurement(frm=, alias=, direction=, max_depth=, nearest=, **filters)` | measurement points; all streams if it's the first step |
| `where` | `.where(target, **filters)` | at least one filter |
| `include` | `.include(*names, of=, required=)` | extra output columns (no button in the page yet) |
| `refocus` | `.refocus(alias)` | point the query at an existing alias |

A filter is `{ "attr": "medium", "value": "brine", "exclude": false }`; `exclude: true` becomes
`medium=Not("brine")`.

## When text does not match

A text matches when its best score is at least `RESOLVE_MIN_SCORE` (0.4) and the runner-up is not
within `RESOLVE_MARGIN` (0.1) of it. Otherwise the backend answers 400 with
`{"detail", "candidates": [{"uri", "label", "score", "source"}], "text"}`, and the page lists the candidates.
Two ontologies can define the same name (`pump` is both an ASHRAE 223 and a water ontology class), so
a plain name can be reported as ambiguous. TODO: make the threshold and margin user settings in the UI.

## Tests

From `backend/`:

```bash
uv run --extra dev python -m pytest tests/test_query_spec.py tests/test_resolve.py   # fast
uv run --extra dev python -m pytest -m slow                                          # WaterTAP, see tests/README.md
```

See [backend/tests/README.md](../../tests/README.md) for the TDD workflow and the WaterTAP setup.
