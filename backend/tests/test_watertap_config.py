import tomllib

import pytest
from acq_repo import WATERTAP_DATA_DIR, WATERTAP_REQUIRED_FILES

# marks every test in this module as WaterTAP environment setup
pytestmark = pytest.mark.watertap


# Asserts the fixture writes a config pointing into the checkout named by ACQUIRIUM_REPO
@pytest.mark.fast
def test_watertap_config_fixture_builds_config(monkeypatch, tmp_path, request):
    # a stand-in checkout holding the required (empty) files
    repo = tmp_path / "acquirium"
    for name in [*WATERTAP_REQUIRED_FILES, f"{WATERTAP_DATA_DIR}/seawater-ro_test.parquet"]:
        file = repo / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.touch()
    monkeypatch.setenv("ACQUIRIUM_REPO", str(repo))

    config_path = request.getfixturevalue("watertap_config")

    parsed = tomllib.loads(config_path.read_text())
    assert parsed["server"]["port"] > 0
    assert parsed["drivers"][0]["watch_dir"].startswith(f"{repo}/")


# Asserts the fixture skips the test when the checkout lacks the WaterTAP files
@pytest.mark.fast
def test_watertap_config_fixture_skips_without_checkout(monkeypatch, tmp_path, request):
    monkeypatch.setenv("ACQUIRIUM_REPO", str(tmp_path))

    with pytest.raises(pytest.skip.Exception, match="is missing"):
        request.getfixturevalue("watertap_config")
