import os
from pathlib import Path

DEFAULT_ACQ_REPO = Path.home() / "Documents/Mines/Fall2026/acquirium"


# Returns the Acquirium checkout path: ACQUIRIUM_REPO when set, else the default
def find_acquirium_repo() -> Path:
    env_path = os.environ.get("ACQUIRIUM_REPO")
    return Path(env_path) if env_path else DEFAULT_ACQ_REPO


# Returns None when the checkout has the WaterTAP files, else why tests should skip
def watertap_skip_reason(repo: Path) -> str | None:
    watertap = repo / "deployments/WATERTAP"
    model = watertap / "models/seawater-ro"
    required = [
        watertap / "scripts/parquet_driver.py",
        model / "model.ttl",
        model / "watertap-mapping.json",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if not list((model / "data").glob("*.parquet")):
        missing.append(f"{model / 'data'}/*.parquet")
    if missing:
        return f"Acquirium checkout at {repo} is missing: {', '.join(missing)}"
    return None
