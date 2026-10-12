# Phase 0 notes and verification: WaterTAP test environment

Date: 2026-10-11. Branch: streams-phase0-setup. Part of the stream interface plan (backend only, test first). Phase 1 (streams.py) and Phase 2 (endpoints) follow in their own branches.

## Why this phase exists
The data-dependent tests ran against a server with no drivers, so they silently skipped. The stream queries in Phases 1 and 2 need real streams, so this phase builds a repeatable WaterTAP test environment first.

## Key decisions
- Config path: the server reads ACQUIRIUM_GUI_CONFIG, falling back to stdin. Existing stdin tests still work.
- Pin: acquirium==0.4.0a8 in backend/pyproject.toml. Alpha versions are skipped by default installs. The uv.lock files were left alone (teammate's files, user does not use uv), so they are stale.
- Data source: only the parquet replay driver from the Acquirium WaterTAP seawater-ro config. The live simulation driver needs a WaterTAP install and produces time-dependent data, so it is left out.
- Paths in the template are absolute, built from ACQUIRIUM_REPO (default ~/Documents/Mines/Fall2026/acquirium), so the working directory does not matter.
- Fixtures: watertap_config and watertap_server are class scoped so one server is shared by a test class. A function-scoped fixture and its two tests were removed for simplicity.
- Two server classes: TestServerClass (driverless, health tests) and TestWatertapServer (WaterTAP, data tests). The data tests are marked slow and no longer use configneeded.
- Helpers: two polling helpers were kept on purpose. _wait_for_rows (skips on empty) stays in TestServerClass. wait_for_rows (fails on empty) is module level and used by the WaterTAP class. WaterTAP may be a temporary test environment, so duplication was accepted.
- Dropped: the assertion that the server port matches the config. It tested Acquirium behavior and sat inside an unrelated JSON test. A /server-port endpoint idea was abandoned.
- Alias test: now checks that attribute columns carry the streams. prefix instead of a bare streams column.

## What was implemented
- backend/src/server.py: env var config path.
- backend/tests/config_stubs.py: WATERTAP_PARQUET template.
- backend/tests/acq_repo.py: find_acquirium_repo, watertap_skip_reason, write_watertap_config, free_port, shared file constants.
- backend/tests/conftest.py: watertap_config and watertap_server fixtures.
- backend/tests/test_server.py: TestWatertapServer with 10 tests; wait_for_rows helper.
- backend/pyproject.toml: acquirium pin and watertap marker.
- backend/tests/README.md: marker list and WaterTAP setup instructions.

## Verification
Command: `./.venv/bin/python -m pytest -v -rs` from backend/, macOS, Python 3.12, acquirium 0.4.0a8 editable from the local clone.

Result: 28 passed, 0 failed, 0 skipped, 1 warning (existing httpx deprecation notice), 47.37 s.

| File | Tests |
|---|---|
| test_acq_repo.py | 6 |
| test_config.py | 6 |
| test_config_stubs.py | 1 |
| test_example.py | 1 |
| test_server.py | 14 |

Observations:
- The server started from the WaterTAP config with an absolute driver spec path, so that assumption held.
- The data tests found exactly 32 streams with label, medium, quantity_kind and unit columns.
- Metadata columns are all strings and survive a JSON round trip.
- Fast suite alone: 16 passed. Marker selection (-m watertap) picks the 5 environment setup tests that existed when the marker was added.
- Each test was written first and seen to fail before the code was written, except the data-loaded and moved tests, which characterize existing behavior and passed on the first run.

## Known gaps
- Run on one machine only. Not run on Linux, Windows, or a teammate's machine.
- The skip path for a missing checkout is covered by unit tests of watertap_skip_reason, not by a full-suite run without a checkout.
- A free port is chosen then released before the server binds it, so a rare collision is possible.
- If the data fails to load, wait_for_rows fails but the old helper would skip; the two classes behave differently on purpose.
- Exact stream count of 32 comes from the demo notes and was confirmed on this run only.
