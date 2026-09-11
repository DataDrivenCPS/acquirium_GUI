/**
 * The wire contract, mirroring `backend/acquirium_gui/models.py`.
 * Change one, change the other.
 *
 * The hard rule these types encode: nothing the UI renders carries a URI.
 * A `Ref` is an opaque `id` the backend understands plus a `label` the user
 * reads, and `id` must never be displayed.
 */

export type AttributeName =
  | 'type'
  | 'process'
  | 'cp_type'
  | 'medium'
  | 'substance'
  | 'quantity_kind'
  | 'unit'
  | 'enumeration_kind'
  | 'data_source'

export const ATTRIBUTE_NAMES: AttributeName[] = [
  'type',
  'process',
  'cp_type',
  'medium',
  'substance',
  'quantity_kind',
  'unit',
  'enumeration_kind',
  'data_source',
]

export type ResolveKind = 'class' | 'entity' | 'predicate' | 'attribute_value'

export type StepKind = 'entity' | 'related' | 'measurement' | 'where' | 'refocus'

export type Direction = 'upstream' | 'downstream'

/** An opaque handle plus its human-readable label. Never render `id`. */
export interface Ref {
  id: string
  label: string
}

export interface AttrFilter {
  name: AttributeName
  value: Ref
  negated: boolean
}

/**
 * One builder action. Deliberately a UI-level description rather than
 * Acquirium's `Query.to_dict()` shape -- the backend adapter translates it,
 * so the frontend never has to track Acquirium's internals.
 */
export interface QueryStep {
  id: string
  kind: StepKind
  cls?: Ref | null
  instance?: Ref | null
  alias?: string | null
  frm?: string | null
  target?: string | null
  via?: Ref | null
  direction?: Direction | null
  max_depth?: number | null
  attrs: AttrFilter[]
}

/** The whole query being built. This is the app's serializable state. */
export interface QueryDescription {
  steps: QueryStep[]
}

export interface GraphNode {
  id: string
  label: string
  level: 'class' | 'instance'
  kind: 'equipment' | 'measurement' | 'system'
  /** How many real units this class node stands for. */
  instance_count: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
  simplified: boolean
  total_nodes: number
}

export interface Subgraph {
  highlighted_nodes: string[]
  highlighted_edges: string[]
  /** node id -> the instance label it should now render as. */
  relabeled: Record<string, string>
}

export interface Candidate extends Ref {
  score: number
  kind: ResolveKind
}

export interface ResolveResponse {
  candidates: Candidate[]
  /** True when the top match may be accepted without asking the user. */
  confident: boolean
}

export interface Table {
  columns: string[]
  rows: unknown[][]
  /** Set when the query is valid but matched nothing. Show it, don't hide it. */
  empty_reason: string | null
}

export interface GeneratedQuery {
  python: string
  sparql: string | null
  note: string | null
}

export interface AppConfig {
  confidence_threshold: number
  close_runner_up_margin: number
  resolve_top_k: number
  graph_node_limit: number
  /** Retrieve readings as the query changes, rather than on a button. */
  auto_retrieve_data: boolean
}

export interface HealthResponse {
  status: 'ok'
  adapter: string
  acquirium_connected: boolean
  detail: string | null
}

export interface LlmStatus {
  available: boolean
  detail: string
}
