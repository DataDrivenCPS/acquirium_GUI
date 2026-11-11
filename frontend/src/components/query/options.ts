import type { Aggregate, ResultOptions } from '../../api/types'

// The metadata table, which every query starts with. Readings are asked for with the View readings button.
export const DEFAULT_OPTIONS: ResultOptions = { view: 'metadata', limit: null, order: 'desc', shape: 'wide', group_by: '', aggregate: 'count' }

// What the View readings button starts with: the newest readings of every stream, one column per stream
export const READINGS_OPTIONS: ResultOptions = { ...DEFAULT_OPTIONS, view: 'readings' }

// A column the readings can be grouped by: value is what the backend is told, label is what the user reads.
// Only the columns that identify a stream make sense, since each stream has its own unit.
export type GroupChoice = { value: string; label: string }
export const READINGS_GROUPS: GroupChoice[] = [
  { value: 'data_alias', label: 'Stream' },
  { value: 'point_id', label: 'Stream identifier' },
]

export const AGGREGATES: Aggregate[] = ['count', 'mean', 'min', 'max', 'sum', 'first', 'last']

// The options as the backend takes them, or undefined for the metadata table (so a plain run sends exactly
// what it always did)
export function toOptionsRequest(options: ResultOptions): Record<string, unknown> | undefined {
  if (options.view === 'metadata') return undefined
  const sent: Record<string, unknown> = { view: 'readings', order: options.order, shape: options.shape }
  if (options.limit !== null) sent.limit = options.limit
  if (options.group_by) {
    sent.group_by = [options.group_by]
    sent.aggregate = options.aggregate
  }
  return sent
}
