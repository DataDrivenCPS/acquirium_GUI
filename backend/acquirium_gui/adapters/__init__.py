"""Adapter selection.

Which adapter the app runs against is decided once, here, from the
``ACQUIRIUM_GUI_ADAPTER`` environment variable. Routes ask for it through the
``get_adapter`` FastAPI dependency in ``acquirium_gui.deps`` and never
construct one themselves, so tests can override it.
"""

from __future__ import annotations

import os

from .base import AcquiriumAdapter, AdapterError
from .live import LiveAdapter
from .stub import StubAdapter

__all__ = ["AcquiriumAdapter", "AdapterError", "LiveAdapter", "StubAdapter", "build_adapter"]


def build_adapter(name: str | None = None) -> AcquiriumAdapter:
    """Construct the configured adapter. Defaults to the fixture stub."""
    chosen = (name or os.environ.get("ACQUIRIUM_GUI_ADAPTER") or "stub").lower()
    if chosen == "stub":
        return StubAdapter()
    if chosen == "live":
        return LiveAdapter(
            server_url=os.environ.get("ACQUIRIUM_SERVER_URL", "localhost"),
            server_port=int(os.environ.get("ACQUIRIUM_SERVER_PORT", "8000")),
        )
    raise ValueError(f"Unknown adapter {chosen!r}; expected 'stub' or 'live'.")
