import src.settings as settings
import pytest
from acq_repo import (
    find_acquirium_repo,
    free_port,
    watertap_skip_reason,
    write_watertap_config,
)
from fastapi.testclient import TestClient
from src.server import app


# Returns the path of a config that loads the WaterTAP parquet data on a free port,
# or skips the tests when the Acquirium checkout lacks the WaterTAP files.
# Class-scoped so every test in a class shares one config, and so one server.
@pytest.fixture(scope="class")
def watertap_config(tmp_path_factory):
    repo = find_acquirium_repo()
    reason = watertap_skip_reason(repo)
    if reason:
        pytest.skip(reason)

    return write_watertap_config(tmp_path_factory.mktemp("watertap"), free_port(), repo)


# Starts the FastAPI app with the WaterTAP config and yields a client for it.
# The server is shut down after the last test in the class.
@pytest.fixture(scope="class")
def watertap_server(watertap_config):
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("ACQUIRIUM_GUI_CONFIG", str(watertap_config))
        with TestClient(app=app) as client:
            yield client


@pytest.fixture(autouse=True)
def default_settings(monkeypatch):
    """Every test starts with the default settings, whatever an earlier test changed."""
    monkeypatch.setattr(settings, "_current", settings.DEFAULTS)
