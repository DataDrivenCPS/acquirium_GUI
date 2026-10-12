from pathlib import Path

import pytest
from acq_repo import DEFAULT_ACQ_REPO, find_acquirium_repo


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
