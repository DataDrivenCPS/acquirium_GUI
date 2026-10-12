import { usePolledJson } from '../../hooks/usePolledJson'
import { UNANSWERED, type RowStatus } from './describe'
import StatusRow from './StatusRow'

type PolledStatusRowProps<T> = {
  label: string
  url: string // backend endpoint to poll, e.g. '/api/graph-status'
  describe: (data: T) => RowStatus // turns the endpoint's JSON into what the row shows
}

// A status row that keeps re-checking a backend endpoint. <T> is the shape of that
// endpoint's JSON; TypeScript works it out from the describe function you pass in.
function PolledStatusRow<T>({ label, url, describe }: PolledStatusRowProps<T>) {
  const result = usePolledJson<T>(url)
  const status = result.state === 'ok' ? describe(result.data) : UNANSWERED[result.state]
  return <StatusRow label={label} {...status} /> // {...status} passes tone, text and detail as separate props
}

export default PolledStatusRow
