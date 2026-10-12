import type { ReactNode } from 'react'
import type { PollResult } from '../../hooks/usePolledJson'

type PolledBodyProps<T> = {
  result: PollResult<T>
  children: (data: T) => ReactNode // called with the data once there is some ("render prop")
}

// The body of a window fed by usePolledJson: a waiting or error line until data arrives
function PolledBody<T>({ result, children }: PolledBodyProps<T>) {
  if (result.state === 'checking') return <p className="muted">Loading…</p>
  if (result.state === 'unreachable') {
    return <p className="text-error">Backend unreachable. Retrying every few seconds.</p>
  }
  return <>{children(result.data)}</> // <>...</> groups elements without adding a tag to the page
}

export default PolledBody
