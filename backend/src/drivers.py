"""Reads the drivers (data ingesters) the Acquirium server is running."""
import json
from urllib.request import urlopen

# Seconds to wait for Acquirium before the request fails
REQUEST_TIMEOUT_S = 5

def live_drivers(address: str) -> list[dict]:
    """Acquirium's GET /drivers/list. Its Python client has no call for this route, so we request it directly."""
    with urlopen(f"{address}/drivers/list", timeout=REQUEST_TIMEOUT_S) as response:
        return json.load(response)["drivers"]
