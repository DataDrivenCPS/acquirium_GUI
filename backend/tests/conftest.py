import socket

import pytest
from acq_repo import find_acquirium_repo, watertap_skip_reason, write_watertap_config


# Returns the path of a config that loads the WaterTAP parquet data on a free port,
# or skips the test when the Acquirium checkout lacks the WaterTAP files
@pytest.fixture
def watertap_config(tmp_path):
    repo = find_acquirium_repo()
    reason = watertap_skip_reason(repo)
    if reason:
        pytest.skip(reason)

    # asks the OS for a free port to configure the server with
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    return write_watertap_config(tmp_path, port, repo)
