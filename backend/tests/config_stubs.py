LOCAL = """
[server]
enabled = true
data_dir = ".acquirium"
"""

EXTERNAL = """
[server]
enabled = false
[driver]
server_url = "127.0.0.1"
server_port = 8000
"""
EXTERNAL_ADDRESS = "http://127.0.0.1:8000"

LOCAL_WITH_DRIVERS = """
[server]
enabled = true
data_dir = ".acquirium"
[driver]
server_url = "127.0.0.1"
server_port = 8000
"""

BAD = """
[server
enabled = true
data_dir = ".acquirium"
"""

BAD_TYPE_ENABLED = """
[server]
enabled = "false"
data_dir = ".acquirium"
[driver]
server_url = "127.0.0.1"
server_port = 8000
"""
