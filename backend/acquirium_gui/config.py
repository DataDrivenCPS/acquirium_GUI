"""Runtime-tunable settings, persisted to a TOML file.

design.md deliberately refuses to hardcode the confidence threshold and the
graph size limit, so both live here and are served to the frontend through
GET/PUT /api/config.

Format and location were still open questions in the planning docs. Choice
made here, and easy to move: TOML (matching ``acquirium.toml``'s convention),
in a single ``[acquirium_gui]`` table, at ``./acquirium-gui.toml`` unless
``ACQUIRIUM_GUI_CONFIG`` points elsewhere.
"""

from __future__ import annotations

import os
import tomllib
from pathlib import Path

from acquirium_gui.models import AppConfig

_SECTION = "acquirium_gui"
_DEFAULT_FILENAME = "acquirium-gui.toml"


def config_path() -> Path:
    """Where settings are read from and written to."""
    override = os.environ.get("ACQUIRIUM_GUI_CONFIG")
    return Path(override) if override else Path.cwd() / _DEFAULT_FILENAME


def load_config() -> AppConfig:
    """Current settings, falling back to defaults when the file is absent.

    A malformed or partial file never takes the server down: unknown keys are
    ignored and missing ones fall back to their default.
    """
    path = config_path()
    if not path.is_file():
        return AppConfig()
    try:
        raw = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError):
        return AppConfig()
    section = raw.get(_SECTION, raw)
    if not isinstance(section, dict):
        return AppConfig()
    known = {k: v for k, v in section.items() if k in AppConfig.model_fields}
    try:
        return AppConfig(**known)
    except ValueError:
        return AppConfig()


def save_config(config: AppConfig) -> AppConfig:
    """Persist settings and return what was written."""
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_toml(config), encoding="utf-8")
    return config


def _dump_toml(config: AppConfig) -> str:
    """Serialize AppConfig as TOML.

    Hand-rolled rather than pulling in a writer dependency: every field of
    AppConfig is a bare number or boolean in one flat table. The guard below
    is what makes that safe -- add a string, a list or a nested table to
    AppConfig and this fails loudly at the moment of writing, rather than
    producing a file that will not parse back.
    """
    lines = [
        "# Written by acquirium-GUI. Safe to edit by hand while the server is stopped.",
        f"[{_SECTION}]",
    ]
    for name in AppConfig.model_fields:
        value = getattr(config, name)
        if isinstance(value, bool):
            # TOML booleans are lowercase; Python's repr is not.
            lines.append(f"{name} = {'true' if value else 'false'}")
        elif isinstance(value, (int, float)):
            lines.append(f"{name} = {value}")
        else:
            raise TypeError(
                f"config field {name!r} is not a number or a boolean; "
                "_dump_toml needs updating (or replace it with a real TOML writer)"
            )
    return "\n".join(lines) + "\n"
