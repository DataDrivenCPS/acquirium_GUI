"""Stand-in Acquirium payloads, so unit tests never start a real server."""

# Keys every stream row has, live or sample (the frontend's Stream type)
STREAM_KEYS = {"point", "label", "quantity_kind", "unit", "data_source", "latest_time", "latest_value"}

# One entry in the shape Acquirium 0.4.0a8's GET /drivers/list returns
DRIVER = {
    "name": "SystemMetricsDriver",
    "spec": "acquirium.Drivers.BuiltInDrivers.system_metrics:SystemMetricsDriver",
    "interval": 2.0,
    "started_at": "2026-10-11T19:51:29.977660+00:00",
    "status": "running",
}
