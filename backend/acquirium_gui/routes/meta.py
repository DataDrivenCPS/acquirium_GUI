"""Health and settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from acquirium_gui.adapters import AcquiriumAdapter
from acquirium_gui.config import load_config, save_config
from acquirium_gui.deps import get_adapter
from acquirium_gui.models import AppConfig, HealthResponse

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse)
def health(adapter: AcquiriumAdapter = Depends(get_adapter)) -> HealthResponse:
    connected = adapter.connected()
    return HealthResponse(
        adapter=adapter.name,
        acquirium_connected=connected,
        detail=(
            None
            if connected
            else "Serving sample plant data; no Acquirium server is connected."
        ),
    )


@router.get("/config", response_model=AppConfig)
def read_config() -> AppConfig:
    return load_config()


@router.put("/config", response_model=AppConfig)
def write_config(config: AppConfig) -> AppConfig:
    """Replace the whole settings document.

    A full replace rather than a patch: the settings panel always sends every
    field, and this keeps the file a faithful picture of what the UI shows.
    """
    return save_config(config)
