from pathlib import Path

import pytest
from acq_repo import DEFAULT_ACQ_REPO, find_acquirium_repo, watertap_skip_reason

# marks every test in this module as WaterTAP environment setup
pytestmark = pytest.mark.watertap

WATERTAP_FILES = [
    "deployments/WATERTAP/scripts/parquet_driver.py",
    "deployments/WATERTAP/models/seawater-ro/model.ttl",
    "deployments/WATERTAP/models/seawater-ro/watertap-mapping.json",
    "deployments/WATERTAP/models/seawater-ro/data/seawater-ro_test.parquet",
]


# Asserts the ACQUIRIUM_REPO env var is used when it is set
@pytest.mark.fast
def test_find_acquirium_repo_uses_env_var(monkeypatch):
    monkeypatch.setenv("ACQUIRIUM_REPO", "/from/env")
    assert find_acquirium_repo() == Path("/from/env")


# Asserts the default location is used when the env var is not set
@pytest.mark.fast
def test_find_acquirium_repo_falls_back_to_default(monkeypatch):
    monkeypatch.delenv("ACQUIRIUM_REPO", raising=False)
    assert find_acquirium_repo() == DEFAULT_ACQ_REPO
    assert DEFAULT_ACQ_REPO == Path.home() / "Documents/Mines/Fall2026/acquirium"


# Asserts a checkout holding every WaterTAP file needs no skip
@pytest.mark.fast
def test_watertap_skip_reason_none_when_files_present(tmp_path):
    for name in WATERTAP_FILES:
        file = tmp_path / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.touch()
    assert watertap_skip_reason(tmp_path) is None


# Asserts a missing folder or missing files give a reason naming the checkout
@pytest.mark.fast
def test_watertap_skip_reason_explains_missing_files(tmp_path):
    missing_dir = tmp_path / "nope"
    assert str(missing_dir) in watertap_skip_reason(missing_dir)

    # the folder exists but is empty, so the WaterTAP files are missing
    assert str(tmp_path) in watertap_skip_reason(tmp_path)
