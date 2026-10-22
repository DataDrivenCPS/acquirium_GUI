// Shapes of the JSON the backend sends back. Keep these in sync with backend/src/server.py.

// GET /api/server-health
export type Health = { ok: boolean }

// One of Acquirium's two text-matching (embedding) indexes
export type EmbeddingIndex = {
  state: 'idle' | 'building' | 'ready' | 'error'
  concepts: number
  surfaces: number
  error: string | null
}

// GET /api/embedding-status
export type EmbeddingStatus = {
  semantic: boolean // false when Acquirium runs exact-only (no fuzzy matching)
  graph: EmbeddingIndex // index over the plant graph
  qudt: EmbeddingIndex // index over units (QUDT)
}

// GET /api/graph-status
export type GraphStatus = {
  source_version: number // goes up every time the graph data changes
  published_version: number // the data version the query cache was last built from
  is_current: boolean
  rebuild_in_progress: boolean
}

// GET /api/runtime-info
export type RuntimeInfo = {
  config: string | null // null means no config file: Acquirium's built-in defaults
  acquirium_address: string
}

// Where a response's rows came from: Acquirium itself, or made-up sample rows the
// backend sends while Acquirium has no live data (the page flags those)
export type Source = 'live' | 'sample'

// One stream (measurement point) with its newest reading
export type Stream = {
  point: string // short URI, e.g. 'ns1:cpu_percent'
  label: string | null
  quantity_kind: string | null // e.g. 'quantitykind:Pressure'
  unit: string | null // e.g. 'unit:BAR'
  data_source: string | null // origin tag, e.g. 'SCADA' or 'Lab'
  latest_time: string | null // ISO 8601 time of the newest reading; null when there is none yet
  latest_value: number | string | null
}

// GET /api/streams
export type StreamsResponse = { source: Source; streams: Stream[] }

// One driver: a process that feeds data into Acquirium
export type Driver = {
  name: string
  spec: string // Python import path of the driver class
  interval: number // seconds between polls
  started_at: string // ISO 8601
  status: string // 'running', 'stopped', or 'failed: <reason>'
}

// GET /api/drivers
export type DriversResponse = { source: Source; drivers: Driver[] }

// GET /api/query/attributes returns a list of these: what query steps can filter on
export type QueryAttribute = {
  name: string // e.g. 'medium'
  roles: ('entity' | 'data')[] // which kind of node it applies to: entities, measurements (data), or both
  doc: string // one-line description
}

// ---------- query builder ----------
// Each step becomes one call on Acquirium's query, e.g. .entity('Pump', alias='p').
// Blank text means "not set"; the backend then uses Acquirium's default.

export type Direction = 'upstream' | 'downstream'

// One attribute filter, e.g. medium = 'brine'. exclude flips it to "medium is NOT brine".
export type Filter = { attr: string; value: string; exclude: boolean }

export type EntityStep = { kind: 'entity'; cls: string; uri: string; alias: string; filters: Filter[] }
export type RelatedStep = {
  kind: 'related'
  cls: string
  uri: string
  alias: string
  frm: string // alias to start from; blank = the previous step's node
  via: string // predicate to follow; blank = any
  direction: Direction | ''
  max_depth: number | null
  nearest: boolean | null // null = Acquirium's default
  filters: Filter[]
}
export type MeasurementStep = {
  kind: 'measurement'
  frm: string
  alias: string
  direction: Direction | ''
  max_depth: number | null
  nearest: boolean | null
  filters: Filter[]
}
export type WhereStep = { kind: 'where'; target: string; filters: Filter[] }
export type IncludeStep = { kind: 'include'; names: string[]; of: string; required: boolean }
export type RefocusStep = { kind: 'refocus'; alias: string } // point the query at an existing alias

// A union type: a step is exactly one of these, and its `kind` says which
export type QueryStep = EntityStep | RelatedStep | MeasurementStep | WhereStep | IncludeStep | RefocusStep
export type StepKind = QueryStep['kind'] // 'entity' | 'related' | ...

// One node that typed text could mean. score runs 0 to 1; label is null for text that was already a URI.
export type Candidate = { uri: string; label: string | null; score: number }

// POST /api/query/python answers this for { steps }
export type PythonResponse = { python: string }

// POST /api/query/run answers this for { steps }
export type QueryResult = {
  source: Source
  columns: string[]
  rows: (string | null)[][]
  total_rows: number // rows matched; only the first 1000 are sent
  truncated: boolean
}
