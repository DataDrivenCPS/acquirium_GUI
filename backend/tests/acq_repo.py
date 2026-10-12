import os
from pathlib import Path

DEFAULT_ACQ_REPO = Path.home() / "Documents/Mines/Fall2026/acquirium"


# Returns the Acquirium checkout path: ACQUIRIUM_REPO when set, else the default
def find_acquirium_repo() -> Path:
    env_path = os.environ.get("ACQUIRIUM_REPO")
    return Path(env_path) if env_path else DEFAULT_ACQ_REPO
