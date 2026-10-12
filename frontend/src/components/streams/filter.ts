import type { Stream } from '../../api/types'

// Whether a stream matches the filter box: every word must appear in one of its text fields
export function matchesFilter(stream: Stream, filter: string): boolean {
  const haystack = [stream.label, stream.point, stream.quantity_kind, stream.unit, stream.data_source]
    .filter((field) => field !== null)
    .join(' ')
    .toLowerCase()
  return filter
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word)) // ''.split gives [''], and every string includes ''
}
