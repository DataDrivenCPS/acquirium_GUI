"""FastAPI dependencies.

The adapter is built once at import and handed to routes through
:func:`get_adapter`. Tests override that dependency rather than reaching into
module state.
"""

from __future__ import annotations

from functools import lru_cache

from acquirium_gui.adapters import AcquiriumAdapter, build_adapter
from acquirium_gui.config import load_config
from acquirium_gui.models import AppConfig


@lru_cache(maxsize=1)
def _adapter() -> AcquiriumAdapter:
    return build_adapter()


def get_adapter() -> AcquiriumAdapter:
    return _adapter()


def get_config() -> AppConfig:
    """Read settings fresh on every request.

    Deliberately not cached: PUT /api/config must take effect immediately,
    including for a file edited by hand between requests.
    """
    return load_config()
