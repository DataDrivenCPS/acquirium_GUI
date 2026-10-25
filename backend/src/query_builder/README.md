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
- **Result options** (`shaping.py`): `QuerySpec.options` (`ResultOptions`) picks the table a run returns. The default
  is the metadata table, which is never shaped. `view: "readings"` runs `.dataframe()` instead and returns the
  matched streams' values, shaped by these options (a limit or group-by with the metadata view is rejected):

  | Option | Readings view |
  | --- | --- |
  | `limit` | readings per stream (100 when unset, at most 100,000) |
  | `order` | `desc` (default) is newest first, so a limit keeps the newest readings |
  | `shape` | `wide` (a column per stream) or `narrow` (a row per reading) |
  | `group_by` | `data_alias` or `point_id`; aggregates `value_numeric` |
  | `aggregate` | `count`, `mean`, `min`, `max`, `sum`, `first`, `last` (`first`/`last` follow time) |

  Grouping is a polars call after the pull, not an Acquirium option, and it pulls the narrow layout whatever
  `shape` says. Readings need a measurement step. Every cell of the answer is text (or null), as before.
  An empty readings pull is never replaced by the metadata sample rows. Not checked against real data yet:
  that `value_numeric` is filled for the default `cast_value`; try it on the WaterTAP data.
- **`query_attributes()`**: the attributes steps can filter on, from Acquirium's `REGISTRY`.
- **Text matching** (`resolve.py`; applies to class text and to filter values Acquirium matches by meaning, not to verbatim attributes like a label): `resolve_text(acq, text, kind)` returns the one node a text
  names, or raises `ResolutionError` carrying the closest candidates (and the text that failed).
  `run_query` checks every class and filter value this way before building the query.
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
`{"detail", "candidates": [{"uri", "label", "score", "source"}], "text", "field"}` (`field` is "class" or the filter attribute the text was typed in), and the page lists the candidates.
Two ontologies can define the same name (`pump` is both an ASHRAE 223 and a water ontology class), so
a plain name can be reported as ambiguous. TODO: make the threshold and margin user settings in the UI.

## Safety

Acquirium writes filter literals and identifiers into SPARQL without escaping them. Before calling it,
`run_query` escapes literal values (a label, `data_source`, `app`), rejects identifier-like text that could
break out of `<...>`, checks that an entity `uri` exists (Acquirium answers an unknown one with a made-up
row), and drops `label` from include steps (a duplicate column crashes Acquirium).

## Names, not identifiers

The page avoids showing URIs. `run_query` adds `include("label")` after every entity and related step
(measurements already have a label column), candidates always carry a label and a plain-words source,
and the frontend merges each alias column with its label column (`display.ts`). TODO: a UI setting to
show identifiers (`SHOW_IDENTIFIERS`). Entities cannot yet be picked by name: Class text names a class.

## Tests

From `backend/`:

```bash
uv run --extra dev python -m pytest tests/test_query_spec.py tests/test_resolve.py   # fast
uv run --extra dev python -m pytest -m slow                                          # WaterTAP, see tests/README.md
```

See [backend/tests/README.md](../../tests/README.md) for the TDD workflow and the WaterTAP setup.
