LOCAL = """
[server]
host = "0.0.0.0"
port = 8000
enabled = true
data_dir = ".acquirium"
"""

BAD = """
[server
host = "0.0.0.0"
port = 8000
data_dir = ".acquirium"
"""

# Format with a free port to verify the server honors the configured port
PORTED = """
[server]
host = "127.0.0.1"
port = {port}
enabled = true
data_dir = ".acquirium"
"""

# PORTED plus Acquirium's built-in system-metrics driver, which registers live CPU/RAM/disk/network streams
METRICS = PORTED + """
[[drivers]]
spec = "acquirium.Drivers.BuiltInDrivers.system_metrics:SystemMetricsDriver"
interval = 1
"""

# Format with a free port and the path of an Acquirium checkout ({acq_repo}).
# Replays the WaterTAP seawater-ro parquet files onto the 32 mapped streams.
# Paths are absolute so the working directory does not matter.
WATERTAP_PARQUET = """
[server]
host = "127.0.0.1"
port = {port}
enabled = true
data_dir = ".acquirium"

[[drivers]]
spec                   = "{acq_repo}/deployments/WATERTAP/scripts/parquet_driver.py:WaterTAPParquetDriver"
interval               = 120.0
watch_dir              = "{acq_repo}/deployments/WATERTAP/models/seawater-ro/data"
glob                   = ["*.parquet", "*.pq"]
format                 = "wide"
time_col               = "timestamp"
source_id              = "watertap-seawater-ro"
watertap_mapping_path  = "{acq_repo}/deployments/WATERTAP/models/seawater-ro/watertap-mapping.json"
watertap_graph_path    = "{acq_repo}/deployments/WATERTAP/models/seawater-ro/model.ttl"
watertap_insert_graph  = true
"""
