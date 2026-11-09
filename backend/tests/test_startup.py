from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from src import server

# How the backend connects to Acquirium when it starts: it starts its own server (from a config, if there is one)
# or, when told an address, connects to one that is already running.

@pytest.fixture
def init_calls(monkeypatch, tmp_path):
    """Replaces Acquirium's init() and shutdown() with recorders, runs in an empty folder (no local config) and clears
    the environment variables that choose how to connect."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv(server.ADDRESS_ENV_VAR, raising=False)
    monkeypatch.delenv(server.CONFIG_ENV_VAR, raising=False)
    calls = []
    def init(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace()
    monkeypatch.setattr(server.acquirium_lib, "init", init)
    monkeypatch.setattr(server.acquirium_lib, "shutdown", lambda: calls.append("shutdown"))
    return calls

def start():
    with TestClient(app=server.app):
        pass

# Asserts that with no address and no config the backend starts Acquirium with its built-in defaults, as before
@pytest.mark.fast
def test_starts_its_own_server_by_default(init_calls):
    start()
    assert init_calls == [{"config": None}, "shutdown"]

# Asserts that an address connects to the running server and starts nothing of its own
@pytest.mark.fast
def test_connects_to_a_running_server_when_given_an_address(init_calls, monkeypatch):
    monkeypatch.setenv(server.ADDRESS_ENV_VAR, "http://127.0.0.1:8200")
    start()
    assert init_calls == [{"address": "http://127.0.0.1:8200"}, "shutdown"]

# Asserts that the address wins over a config: a running server has its own config, and Acquirium rejects both together
@pytest.mark.fast
def test_address_wins_over_a_config(init_calls, monkeypatch, tmp_path):
    config = tmp_path / "acquirium.toml"
    config.write_text("[server]\nenabled = true\n")
    monkeypatch.setenv(server.CONFIG_ENV_VAR, str(config))
    monkeypatch.setenv(server.ADDRESS_ENV_VAR, "http://127.0.0.1:8200")
    start()
    assert init_calls[0] == {"address": "http://127.0.0.1:8200"}
