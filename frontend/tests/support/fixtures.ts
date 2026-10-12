// Example backend payloads for tests, in the shapes the backend's routes return
import type { Driver, QueryAttribute, QueryResult, Stream } from '../../src/api/types'

export const CPU: Stream = {
  point: 'ns1:cpu_percent',
  label: 'CPU usage',
  quantity_kind: 'quantitykind:DimensionlessRatio',
  unit: 'unit:PERCENT',
  data_source: null,
  latest_time: '2026-10-11T19:52:41+00:00',
  latest_value: 15.5,
}

export const PUMP_STATE: Stream = {
  point: 'plant:pump_state',
  label: 'Pump state',
  quantity_kind: null,
  unit: null,
  data_source: 'SCADA',
  latest_time: null,
  latest_value: 'running',
}

export const METRICS_DRIVER: Driver = {
  name: 'SystemMetricsDriver',
  spec: 'acquirium.Drivers.BuiltInDrivers.system_metrics:SystemMetricsDriver',
  interval: 2,
  started_at: '2026-10-11T19:51:29+00:00',
  status: 'running',
}

export const FAILED_DRIVER: Driver = { ...METRICS_DRIVER, name: 'historian', status: 'failed: connection refused' }

// A few entries of Acquirium's attribute registry (GET /api/query/attributes)
export const ATTRIBUTES: QueryAttribute[] = [
  { name: 'process', roles: ['entity'], doc: 'treatment process' },
  { name: 'medium', roles: ['data', 'entity'], doc: 'carried medium' },
  { name: 'quantity_kind', roles: ['data'], doc: 'QUDT quantity kind' },
  { name: 'unit', roles: ['data'], doc: 'QUDT unit' },
]

export const RESULT: QueryResult = {
  source: 'live',
  columns: ['data', 'data.label'],
  rows: [
    ['ns1:cpu_percent', 'CPU usage'],
    ['ns1:ram', null],
  ],
  total_rows: 2,
  truncated: false,
}
