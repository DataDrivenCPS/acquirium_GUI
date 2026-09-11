"""Shared fixtures.

These run against the fixture-backed stub adapter, not a live Acquirium
server. That is a deliberate limit: they pin the *contract* -- response
shapes, the no-URI rule, the metadata/execute split, config persistence --
which the live adapter must also satisfy.

The acceptance checks in requirements.md ("the UI produces the same rows as
acq.query()...metadata()") need a live WaterTAP server and belong in a
separate suite alongside the live adapter.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from acquirium_gui.app import create_app


@pytest.fixture(autouse=True)
def isolated_config(tmp_path, monkeypatch) -> None:
    """Point the settings file at a temp path, so tests never touch the real one."""
    monkeypatch.setenv("ACQUIRIUM_GUI_CONFIG", str(tmp_path / "acquirium-gui.toml"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    # serve_static=False: the built frontend is not present during tests, and
    # its catch-all route would otherwise swallow 404s from bad API paths.
    with TestClient(create_app(serve_static=False)) as test_client:
        yield test_client


def steps(*step_dicts: dict) -> dict:
    """Build a QueryDescription payload, filling in step ids."""
    return {
        "steps": [
            {"id": f"s{i}", **step} for i, step in enumerate(step_dicts)
        ]
    }
