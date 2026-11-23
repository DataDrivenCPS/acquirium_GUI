import json
import pytest
from pydantic import ValidationError
from src.settings import DEFAULTS, Settings, limits, load, save

# Asserts that the defaults are the values the constants had before they became settings
@pytest.mark.fast
def test_defaults():
    assert DEFAULTS.resolution.min_score == 0.4
    assert DEFAULTS.resolution.margin == 0.1
    assert DEFAULTS.resolution.candidate_count == 5
    assert DEFAULTS.results.max_rows == 1000

# Asserts that saved settings load back unchanged
@pytest.mark.fast
def test_save_then_load_round_trips(tmp_path):
    path = tmp_path / "settings.json"
    changed = Settings.model_validate({"resolution": {"min_score": 0.7, "margin": 0.2, "candidate_count": 8}, "results": {"max_rows": 50}})
    save(changed, path)
    assert load(path) == changed

# Asserts that a missing file gives the defaults and does not create the file
@pytest.mark.fast
def test_missing_file_loads_defaults(tmp_path):
    path = tmp_path / "settings.json"
    assert load(path) == DEFAULTS
    assert not path.exists()

# Asserts that a file that is not JSON, or holds invalid values, gives the defaults instead of crashing the server
@pytest.mark.fast
@pytest.mark.parametrize("text", ["{not json", "[]", '{"resolution": {"min_score": 5}}', '{"unknown": 1}'])
def test_bad_file_loads_defaults(tmp_path, text):
    path = tmp_path / "settings.json"
    path.write_text(text)
    assert load(path) == DEFAULTS

# Asserts that a file missing some settings keeps the others and fills the gaps with defaults
@pytest.mark.fast
def test_partial_file_fills_defaults(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps({"results": {"max_rows": 10}}))
    loaded = load(path)
    assert loaded.results.max_rows == 10
    assert loaded.resolution == DEFAULTS.resolution

# Asserts that values outside their range are rejected
@pytest.mark.fast
@pytest.mark.parametrize("group,name,value", [
    ("resolution", "min_score", -0.1), ("resolution", "min_score", 1.1),
    ("resolution", "margin", 2), ("resolution", "candidate_count", 0),
    ("resolution", "candidate_count", 21), ("results", "max_rows", 0), ("results", "max_rows", 100001),
])
def test_out_of_range_is_rejected(group, name, value):
    with pytest.raises(ValidationError):
        Settings.model_validate({group: {name: value}})

# Asserts that a failed save leaves the previous file intact and no temporary file behind
@pytest.mark.fast
def test_save_is_atomic(tmp_path, monkeypatch):
    path = tmp_path / "settings.json"
    save(DEFAULTS, path)
    before = path.read_text()
    monkeypatch.setattr("src.settings.os.replace", lambda *a: (_ for _ in ()).throw(OSError("disk")))
    with pytest.raises(OSError):
        save(Settings.model_validate({"results": {"max_rows": 5}}), path)
    assert path.read_text() == before
    assert [p.name for p in tmp_path.iterdir()] == ["settings.json"]

# Asserts that the ranges the UI shows come from the same model that validates them
@pytest.mark.fast
def test_limits_describe_every_setting():
    assert limits() == {
        "resolution": {"min_score": {"min": 0, "max": 1}, "margin": {"min": 0, "max": 1}, "candidate_count": {"min": 1, "max": 20}},
        "results": {"max_rows": {"min": 1, "max": 100000}},
    }
