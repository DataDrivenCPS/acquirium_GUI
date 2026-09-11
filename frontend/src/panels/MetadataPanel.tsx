/**
 * What the query matches right now: the second band of the query tab.
 *
 * Refreshes on its own after every builder change (story 7) -- there is no
 * run button here on purpose. That is affordable because this is Acquirium's
 * lazy `metadata()`: a pattern match, not a data fetch.
 */

import { DataTable } from '../components/DataTable'
import { useQuery } from '../state/QueryContext'

export function MetadataView() {
  const { metadata } = useQuery()

  return <DataTable result={metadata} idleMessage="Add a step to see what it matches." />
}

/** Row count for the band header, or why there is none. */
export function metadataSummary(rows: number | null, loading: boolean): string {
  if (loading && rows === null) return 'checking…'
  if (rows === null) return ''
  return `${rows} row${rows === 1 ? '' : 's'}`
}
