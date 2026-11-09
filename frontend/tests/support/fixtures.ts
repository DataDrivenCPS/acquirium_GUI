// Example backend payloads for tests, in the shapes the backend's routes return
import type { Driver, EmbeddingIndex, EmbeddingStatus, GraphStatus, RuntimeInfo, Stream } from '../../src/api/types'

const READY_INDEX: EmbeddingIndex = { state: 'ready', concepts: 1200, surfaces: 3400, error: null }

export const READY_EMBEDDINGS: EmbeddingStatus = { semantic: false, graph: READY_INDEX, qudt: READY_INDEX }

export const BUILDING_EMBEDDINGS: EmbeddingStatus = { ...READY_EMBEDDINGS, qudt: { ...READY_INDEX, state: 'building' } }

export const CURRENT_GRAPH: GraphStatus = {
  source_version: 7,
  published_version: 7,
  is_current: true,
  rebuild_in_progress: false,
}

export const DEFAULT_RUNTIME: RuntimeInfo = { config: null, acquirium_address: 'http://127.0.0.1:51234' }

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
