"""User settings: the values behind the Settings window, kept in a JSON file so they survive a restart.

The server loads the file at startup (load) and writes it on every change and at shutdown (save).
Code that needs a setting asks for the current values with get(), so a change applies to the next request.
"""
import json
import os
import tempfile
from pathlib import Path
from pydantic import BaseModel, ConfigDict, Field, ValidationError

# Where the settings are kept: backend/settings.json, wherever the server was started from
SETTINGS_FILE = Path(__file__).resolve().parent.parent / "settings.json"

class ResolutionSettings(BaseModel):
    """How typed text is matched to a node (see query_builder/resolve.py)."""
    model_config = ConfigDict(extra="forbid")
    # A text must score at least this to count as matched (Acquirium's own default for query text is 0.4)
    min_score: float = Field(default=0.4, ge=0, le=1)
    # A match whose runner-up scores within this much of it is ambiguous, so the user should choose
    margin: float = Field(default=0.1, ge=0, le=1)
    # Candidates asked for, and shown to the user when a match fails
    candidate_count: int = Field(default=5, ge=1, le=20)

class ResultSettings(BaseModel):
    """What a query result holds (see query_builder/query_spec.py)."""
    model_config = ConfigDict(extra="forbid")
    # Most rows of the final table one query run sends back; the rest are counted but left out
    max_rows: int = Field(default=1000, ge=1, le=100_000)

class Settings(BaseModel):
    """Every setting, grouped the way the Settings window groups them."""
    model_config = ConfigDict(extra="forbid")
    resolution: ResolutionSettings = ResolutionSettings()
    results: ResultSettings = ResultSettings()

DEFAULTS = Settings()

def load(path: Path) -> Settings:
    """The settings saved in `path`; the defaults when the file is missing, unreadable or holds invalid values."""
    try:
        return Settings.model_validate(json.loads(Path(path).read_text()))
    except (OSError, ValueError, ValidationError):  # ValidationError and JSON errors are both ValueErrors
        return DEFAULTS

def save(settings: Settings, path: Path) -> None:
    """Writes `settings` to `path`. The file is replaced in one step, so a crash never leaves half a file."""
    path = Path(path)
    handle, temp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(handle, "w") as temp:
            json.dump(settings.model_dump(), temp, indent=2)
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise

def limits() -> dict:
    """{"group": {"setting": {"min": ..., "max": ...}}}: the range each setting accepts, for the UI to show.
    A bound the setting does not have is None."""
    schema = Settings.model_json_schema()
    result = {}
    for group, group_ref in schema["properties"].items():
        fields = schema["$defs"][group_ref["$ref"].split("/")[-1]]["properties"]
        result[group] = {name: {"min": field.get("minimum"), "max": field.get("maximum")} for name, field in fields.items()}
    return result

# The values in force right now; the server replaces them at startup and on every change
_current: Settings = DEFAULTS

def get() -> Settings:
    return _current

def use(settings: Settings) -> None:
    global _current
    _current = settings
