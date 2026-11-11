# Tests

Run from `backend/` (or `npm run test:backend` from `frontend/` for the fast tests):

```
uv run --extra dev python -m pytest -m fast   # unit tests, about a second
uv run --extra dev python -m pytest -m slow   # integration tests that start real Acquirium servers, 30–90 s
uv run --extra dev python -m pytest           # both
```

Tests must run with `backend/` as the working directory via `python -m pytest`, so `src.*` imports
resolve. The query builder's tests are here too, in `test_query_spec.py`.

Our TDD workflow should be:
- Write failing tests to ensure desired function implementation.
- Implement functions to pass tests.
    - Ensure other unrelated tests do not fail as a result of implementation.
- Refactor!

## Markers

Run a group of tests with `-m`, for example `./.venv/bin/python -m pytest -m fast`.

- `fast`: quick tests that run instantly.
- `slow`: integration tests that take time.
- `configneeded`: tests that skip unless the server has data, so they need a config with drivers.
- `watertap`: tests of the helpers that set up the WaterTAP testing environment (see below).

## WaterTAP test environment

Tests that need real streams run against the WaterTAP seawater-ro data from the Acquirium repo. The data is not stored in this repo, so the tests need a local clone of Acquirium.

How the pieces connect:

1. `acq_repo.find_acquirium_repo()` finds your Acquirium clone. It uses the `ACQUIRIUM_REPO` environment variable if set, otherwise `~/Documents/Mines/Fall2026/acquirium`.
2. `acq_repo.watertap_skip_reason()` checks the clone has the WaterTAP driver, `model.ttl`, the mapping JSON and at least one parquet file. If not, tests that use the `watertap_config` fixture are skipped with a message naming what is missing.
3. `config_stubs.WATERTAP_PARQUET` is a config template. `acq_repo.write_watertap_config()` fills in a free port and your clone's path, then writes `acquirium.toml` to a temp folder.
4. The `watertap_config` fixture (`conftest.py`) runs steps 1 to 3 and returns the config path.

The template loads only the parquet replay driver, so WaterTAP itself does not need to be installed and the data is the same every run.

If your clone is not at the default location, set the variable once:

```
export ACQUIRIUM_REPO=/path/to/acquirium                  # add to ~/.zshrc to keep it
ACQUIRIUM_REPO=/path/to/acquirium ./.venv/bin/python -m pytest   # or for one run only
```

Make sure your test file names are prefixed with 'test_' so pytest can discover new tests. Additionally, test functions should start with 'test_'. Pytest will search nested directories recursively unless specified otherwise.

<https://docs.pytest.org/en/stable/explanation/goodpractices.html#test-discovery>

## What's here

- Mark every test `@pytest.mark.fast` or `@pytest.mark.slow`.
- `config_stubs.py`: TOML strings for config tests, written to `tmp_path`. Never use real config files.
- `fakes.py`: stand-in Acquirium payloads (`DRIVER`, `STREAM_KEYS`).
- The `/query/*` route tests swap the `query_builder` functions for fakes, so they check only what the
  routes do; two tests check `/query/python` with the real `to_python`. The
  query builder's own behavior is tested in `test_query_spec.py` and `test_resolve.py` (fast, with
  fakes) and in `TestWatertapServer` (slow, real matching and queries on the WaterTAP data).
- Route tests replace `server.acq` with a `SimpleNamespace` fake and use a `TestClient` without
  `with`, so the startup code (which would start Acquirium) never runs.
- `test_live_data.py` (slow) runs a real Acquirium with its system-metrics driver, so the streams and
  drivers routes are checked against live data.

## Result options tests

All are `fast`. They check how a run's readings are shaped (limit, order, layout, group-by and aggregate; see
[backend/src/query_builder/README.md](../src/query_builder/README.md)), with a fake Acquirium and no server.

`test_result_options.py`:

| Test | What it checks |
| --- | --- |
| `test_default_options_are_the_plain_metadata_view` | A spec with no options is the metadata table, with nothing limited or grouped. |
| `test_limit_out_of_range_is_rejected` | A limit of 0, a negative one, or above the cap is rejected, so a pull is always bounded. |
| `test_unknown_option_values_are_rejected` | An unknown view, order, shape or aggregate is rejected. |
| `test_group_by_is_cleaned_and_unique` | Group-by names are trimmed and blanks dropped; a repeated name is rejected. |
| `test_metadata_view_rejects_shaping` | A limit or group-by without the readings view is rejected, not silently ignored. |
| `test_readings_narrow_without_group_by_are_returned_as_pulled` | Ungrouped narrow readings come back unchanged. |
| `test_readings_wide_is_one_column_per_stream` | Wide readings have a time column and one column per stream, in the order asked for, with values as text. |
| `test_readings_group_by_stream_aggregates` | Grouping by stream gives the right mean, min, max, sum, first and last (one case each). |
| `test_readings_group_by_count` | Count is the number of readings per stream. |
| `test_readings_first_and_last_follow_time_not_pull_order` | First and last are earliest and latest in time even when the readings were pulled newest first. |
| `test_readings_group_by_unknown_column_is_rejected` | Readings group only by the columns that identify a stream, and the error names them. |
| `test_readings_empty_pull_with_group_by_is_empty` | A pull with no readings stays an empty table instead of failing on missing columns. |
| `test_run_query_readings_passes_limit_and_order` | `run_query` hands the limit and order to Acquirium, lays the readings out wide, and returns every cell as text. |
| `test_run_query_readings_default_limit` | With no limit set, 100 readings per stream are pulled. |
| `test_run_query_readings_default_order_is_newest_first` | With no order set, the newest readings come first. |
| `test_run_query_readings_narrow_has_a_row_per_reading` | The narrow layout has the stream, point, time and value columns, one row per reading. |
| `test_run_query_readings_group_by_ignores_shape` | Grouping works whatever layout was chosen, since only the narrow one can be grouped. |
| `test_run_query_readings_without_measurements_is_rejected` | Readings need a measurements step; without one the run is rejected with a clear message. |
| `test_run_query_metadata_view_does_not_pull_readings` | The metadata view never asks Acquirium for readings and returns the table as it is. |
| `test_run_query_narrow_readings_name_their_entity` | Each reading has a column with the label of the entity its stream belongs to (two pumps with the same stream name stay apart). |
| `test_entity_without_a_label_shows_its_identifier` | An entity with no label is shown by its readable identifier, not left blank. |
| `test_run_query_wide_readings_put_the_entity_in_the_column_name` | Wide columns read `Pump 1 \| flow` and `Pump 2 \| flow`, so each pump's readings are in their own column. |
| `test_run_query_group_by_stream_keeps_entities_apart` | Grouping by stream gives one row (and mean) per pump, not one over both pumps. |
| `test_stream_under_two_entities_appears_for_each` | A stream that belongs to two entities is listed once for each. |
| `test_wide_columns_with_the_same_name_keep_their_point_id` | Two different streams that would share a wide column name get their point id added, so no readings are dropped. |
| `test_readings_without_an_entity_step_have_no_entity_columns` | A measurements-only query returns the plain narrow columns. |
| `test_wide_columns_are_grouped_by_entity` | All of an entity's wide columns sit together (entities in name order, streams in name order), so one heading spans them, even when its streams first have data in an interleaved order. |
| `test_streams_are_named_by_their_label` | A stream is named by its own label (`intake in flow rate`), not by the alias of its measurement node, in wide and narrow layouts. |
| `test_stream_without_a_label_keeps_its_alias` | A stream with no label keeps the alias Acquirium gave it, so a column is never nameless. |

`test_data_routes.py`:

| Test | What it checks |
| --- | --- |
| `test_query_run_empty_readings_is_not_sampled` | An empty readings result is not replaced by the sample rows, which have the metadata layout. |
| `test_query_run_passes_result_options` | The options in the request reach `run_query` as parsed values. |
| `test_query_run_rejects_bad_result_options` | An out-of-range option gets a 422 before anything runs. |
