# Tests

```
./.venv/bin/python -m pytest
```

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