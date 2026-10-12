"""Made-up data the GUI shows while Acquirium has no live data of its own.

Responses built from it carry "source": "sample" so the frontend can flag them. As soon as
Acquirium has live data, the routes return that instead.
"""

# Same fields as streams.live_streams() rows
SAMPLE_STREAMS = [
    {"point": "sample:ro_feed_pressure", "label": "RO feed pressure", "quantity_kind": "quantitykind:Pressure",
     "unit": "unit:BAR", "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": 14.2},
    {"point": "sample:ro_permeate_flow", "label": "RO permeate flow", "quantity_kind": "quantitykind:VolumeFlowRate",
     "unit": "unit:M3-PER-HR", "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": 42.7},
    {"point": "sample:permeate_conductivity", "label": "Permeate conductivity", "quantity_kind": "quantitykind:Conductivity",
     "unit": "unit:MicroS-PER-CentiM", "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": 312.0},
    {"point": "sample:feed_ph", "label": "Feed pH", "quantity_kind": "quantitykind:PH",
     "unit": "unit:PH", "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": 7.4},
    {"point": "sample:feed_tank_level", "label": "Feed tank level", "quantity_kind": "quantitykind:DimensionlessRatio",
     "unit": "unit:PERCENT", "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": 63.5},
    {"point": "sample:filtrate_turbidity", "label": "Filtrate turbidity", "quantity_kind": "quantitykind:Turbidity",
     "unit": "unit:NTU", "data_source": "Lab", "latest_time": "2026-01-01T08:30:00+00:00", "latest_value": 0.21},
    {"point": "sample:backwash_pump_state", "label": "Backwash pump state", "quantity_kind": None,
     "unit": None, "data_source": "SCADA", "latest_time": "2026-01-01T12:00:00+00:00", "latest_value": "stopped"},
]

# Same fields as Acquirium's GET /drivers/list entries
SAMPLE_DRIVERS = [
    {"name": "scada-opcua", "spec": "plant_drivers.opcua:OpcUaDriver", "interval": 1.0,
     "started_at": "2026-01-01T06:00:00+00:00", "status": "running"},
    {"name": "lab-results", "spec": "acquirium.Drivers.BuiltInDrivers.csv_ingest:CSVIngestDriver", "interval": 3600.0,
     "started_at": "2026-01-01T06:00:00+00:00", "status": "running"},
    {"name": "historian-backfill", "spec": "plant_drivers.historian:BackfillDriver", "interval": 60.0,
     "started_at": "2026-01-01T06:00:00+00:00", "status": "failed: connection refused"},
]

# Same shape as query_spec.run_query(); a stand-in result, not the result of any particular query
_SAMPLE_COLUMNS = ["data", "data.label", "data.quantity_kind", "data.unit"]
SAMPLE_QUERY_RESULT = {
    "columns": _SAMPLE_COLUMNS,
    "rows": [[s["point"], s["label"], s["quantity_kind"], s["unit"]] for s in SAMPLE_STREAMS],
    "total_rows": len(SAMPLE_STREAMS),
    "truncated": False,
}

def live_or_sample(key: str, live: list, sample: list) -> dict:
    """Live rows under `key` when there are any, otherwise the sample rows, with where they came from."""
    if live:
        return {"source": "live", key: live}
    return {"source": "sample", key: sample}
