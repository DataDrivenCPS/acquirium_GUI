from src.config import ConfigError, load_config
from config_stubs import BAD, LOCAL, EXTERNAL, LOCAL_WITH_DRIVERS, EXTERNAL_ADDRESS, BAD_TYPE_ENABLED
import pytest
from pathlib import Path

@pytest.fixture
def write_toml(tmp_path):
    """Returns a helper that writes toml text and returns the file path."""
    def _write(text, name="acquirium.toml"):
        p = tmp_path / name
        p.write_text(text)
        return p
    return _write

@pytest.fixture
def write_toml_cwd(tmp_path, monkeypatch):
    """Writes a toml into the cwd (a temp dir) and returns its relative name."""
    monkeypatch.chdir(tmp_path)
    def _write(text, name="acquirium.toml"):
        (tmp_path / name).write_text(text)
        return Path(name)              
    return _write

@pytest.fixture
def write_txt(tmp_path):
    """Writes text to a file in the temp dir and returns its absolute path."""
    def _write(text, name="acquirium.txt"):
        p = (tmp_path / name).resolve()
        p.write_text(text)
        return p
    return _write

# Assert that we can load in a working Acq config via a config specifying an absolute path
@pytest.mark.fast
def test_load_config_absolute(write_toml):
    # returns temp path of toml 
    path = write_toml(LOCAL)
    config_dict = load_config(path)
    assert config_dict is not None
    assert config_dict['path'] == path
    assert config_dict['external_address'] == None

# Assert that we can load in a working Acq config via a config in the same directory as the backend WD
@pytest.mark.fast
def test_load_config_relative(write_toml_cwd):
    # returns temp path of toml 
    path = write_toml_cwd(LOCAL)
    config_dict = load_config(path)
    assert config_dict is not None
    assert config_dict['path'] == path
    assert config_dict['external_address'] == None

# Assert that we can not load in a working Acq config if the absolute path does not exist
@pytest.mark.fast
def test_load_config_absolute_error(write_toml):
    path = Path("FakeDirectory/FakeDirectory/missing.toml")
    with pytest.raises(ConfigError, match="The config file specified does not exist.") as excinfo:
        load_config(path)
    assert str(path) in str(excinfo.value) # Ensure the absolute path is not processed as a relative path

# Assert drivers are ignored when local mode = true
@pytest.mark.fast
def test_load_config_enabled_ignore_drivers(write_toml):
    path = write_toml(LOCAL_WITH_DRIVERS)
    config_dict = load_config(path)
    assert config_dict is not None
    assert config_dict['path'] == path
    assert config_dict['external_address'] == None


# Assert each bad type is accounted for
@pytest.mark.fast
def test_load_config_enabled_bad_type(write_toml):
    path = write_toml(BAD_TYPE_ENABLED)
    with pytest.raises(ConfigError, match="The server enabled argument in the config file must contain only a boolean value."):
        config_dict = load_config(path)

# Assert that we can not load in a working Acq config if the relative path does not exist
@pytest.mark.fast
def test_load_config_relative_error(write_toml_cwd):
    path = Path("missing.toml")
    with pytest.raises(ConfigError, match="The config file specified does not exist."):
        load_config(path)

# Assert that we can not load in a working Acq config if it is not a TOML file
@pytest.mark.fast
def test_load_config_non_toml(write_txt):
    path = write_txt(LOCAL)
    with pytest.raises(ConfigError, match="The config file must be a .toml file."):
        load_config(path)

# Assert that we can load in a working Acq config via a config specifying an external server
@pytest.mark.fast
def test_load_config_external_server(write_toml):
    path = write_toml(EXTERNAL)
    config_dict = load_config(path)
    assert config_dict is not None
    assert config_dict['path'] == path
    assert config_dict['external_address'] == EXTERNAL_ADDRESS

# Assert that a config that is incomplete/has errors is not loaded and server is shutdown
@pytest.mark.fast
def test_load_config_error(write_toml):
    path = write_toml(BAD)
    with pytest.raises(ConfigError, match="The config file cannot be read by the TOML parser. Please fix any syntax errors and retry."):
        load_config(path)

    