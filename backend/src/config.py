import tomllib
from pathlib import Path


class ConfigError(Exception):
    """Raised when a config file cannot be located, validated, or parsed."""


def load_config(path: str | Path) -> dict:
    """Validate a TOML config path (relative or absolute) and return {'path': path}."""
    config_path = Path(path)
    try:
        if not config_path.is_file():
            raise ConfigError(f"The config file specified does not exist. Path: {config_path}")
        if config_path.suffix.lower() != ".toml":
            raise ConfigError(f"The config file must be a .toml file. Path: {config_path}")
        with config_path.open("rb") as f:
            tomllib.load(f)
    except ConfigError:
        raise
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(
            "The config file cannot be read by the TOML parser. "
            f"Please fix any syntax errors and retry. Details: {e}"
        ) from e
    except FileNotFoundError as e:
        raise ConfigError(f"The config file specified does not exist. Path: {config_path}") from e
    except Exception as e:
        raise ConfigError(f"Unexpected error while loading the config file: {e}") from e
    return {"path": config_path}
