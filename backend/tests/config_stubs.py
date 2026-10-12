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
