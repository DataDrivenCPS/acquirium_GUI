import tomllib
from pathlib import Path

import pytest
from acq_repo import (
    DEFAULT_ACQ_REPO,
    WATERTAP_DATA_DIR,
    WATERTAP_REQUIRED_FILES,
    find_acquirium_repo,
    watertap_skip_reason,
    write_watertap_config,
)

# marks every test in this module as WaterTAP environment setup
pytestmark = pytest.mark.watertap

WATERTAP_FILES = [*WATERTAP_REQUIRED_FILES, f"{WATERTAP_DATA_DIR}/seawater-ro_test.parquet"]


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


# Asserts the written config file holds the given port and points into the checkout
@pytest.mark.fast
def test_write_watertap_config_fills_template(tmp_path):
    config_path = write_watertap_config(tmp_path, port=1234, repo=Path("/fake/acquirium"))

    assert config_path == tmp_path / "acquirium.toml"
    parsed = tomllib.loads(config_path.read_text())
    assert parsed["server"]["port"] == 1234
    assert parsed["drivers"][0]["watch_dir"].startswith("/fake/acquirium/")
