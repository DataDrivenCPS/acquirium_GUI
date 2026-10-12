import os
import socket
from pathlib import Path

from config_stubs import WATERTAP_PARQUET

DEFAULT_ACQ_REPO = Path.home() / "Documents/Mines/Fall2026/acquirium"

# Files the WaterTAP parquet driver needs, relative to the checkout root
WATERTAP_REQUIRED_FILES = [
    "deployments/WATERTAP/scripts/parquet_driver.py",
    "deployments/WATERTAP/models/seawater-ro/model.ttl",
    "deployments/WATERTAP/models/seawater-ro/watertap-mapping.json",
]
# Folder that must hold at least one .parquet file, relative to the checkout root
WATERTAP_DATA_DIR = "deployments/WATERTAP/models/seawater-ro/data"


# Returns the Acquirium checkout path: ACQUIRIUM_REPO when set, else the default
def find_acquirium_repo() -> Path:
    env_path = os.environ.get("ACQUIRIUM_REPO")
    return Path(env_path) if env_path else DEFAULT_ACQ_REPO


# Returns None when the checkout has the WaterTAP files, else why tests should skip
def watertap_skip_reason(repo: Path) -> str | None:
    missing = [
        str(repo / name) for name in WATERTAP_REQUIRED_FILES
        if not (repo / name).is_file()
    ]
    data_dir = repo / WATERTAP_DATA_DIR
    if not list(data_dir.glob("*.parquet")):
        missing.append(f"{data_dir}/*.parquet")
    if missing:
        return f"Acquirium checkout at {repo} is missing: {', '.join(missing)}"
    return None


# Writes acquirium.toml into directory from the WaterTAP template and returns its path
def write_watertap_config(directory: Path, port: int, repo: Path) -> Path:
    config_path = directory / "acquirium.toml"
    config_path.write_text(WATERTAP_PARQUET.format(port=port, acq_repo=repo))
    return config_path


# Asks the OS for a free port to configure a server with
def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
