import tomllib

import pytest
from config_stubs import WATERTAP_PARQUET

# marks every test in this module as WaterTAP environment setup
pytestmark = pytest.mark.watertap


# Asserts the WaterTAP template formats into valid TOML with one parquet driver
# whose paths are all anchored at the Acquirium checkout it was given
@pytest.mark.fast
def test_watertap_parquet_template_formats():
    text = WATERTAP_PARQUET.format(port=1234, acq_repo="/fake/acquirium")
    parsed = tomllib.loads(text)

    assert parsed["server"]["port"] == 1234

    assert len(parsed["drivers"]) == 1
    driver = parsed["drivers"][0]
    assert driver["spec"].endswith("parquet_driver.py:WaterTAPParquetDriver")
    for key in ("spec", "watch_dir", "watertap_mapping_path", "watertap_graph_path"):
        assert driver[key].startswith("/fake/acquirium/")
