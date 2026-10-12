import pytest
from acq_repo import (
    find_acquirium_repo,
    free_port,
    watertap_skip_reason,
    write_watertap_config,
)


# Returns the path of a config that loads the WaterTAP parquet data on a free port,
# or skips the test when the Acquirium checkout lacks the WaterTAP files
@pytest.fixture
def watertap_config(tmp_path):
    repo = find_acquirium_repo()
    reason = watertap_skip_reason(repo)
    if reason:
        pytest.skip(reason)

    return write_watertap_config(tmp_path, free_port(), repo)
