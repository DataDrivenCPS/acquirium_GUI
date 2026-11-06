import { useEffect, useState } from 'react'

// How often to re-check, in milliseconds. The backend can take a while to start
// Acquirium, so one check at page load is not enough.
const POLL_INTERVAL_MS = 3000

// What a poll has found so far. Only the 'ok' case carries data, so TypeScript
// makes you check state before you can touch data.
export type PollResult<T> =
  | { state: 'checking' } // the first check hasn't come back yet
  | { state: 'starting' } // checks failed, but none has succeeded yet: the backend is probably still starting
  | { state: 'unreachable' } // the latest check failed, after an earlier one had succeeded
  | { state: 'ok'; data: T } // the latest check succeeded

// Fetches JSON from url right away and then every few seconds, so the page notices
// when the backend comes up or goes down. T is the shape of the JSON (see api/types.ts).
export function usePolledJson<T>(url: string): PollResult<T> {
  const [result, setResult] = useState<PollResult<T>>({ state: 'checking' })

  useEffect(() => {
    const check = () => {
      fetch(url)
        .then((response) => {
          // fetch only throws on network failures, not on server errors like 500,
          // so we check the HTTP status ourselves.
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((data: T) => setResult({ state: 'ok', data }))
        // Backend down, error, etc. Until the first success, a failure most likely means the backend is
        // still starting (it accepts no requests while it starts Acquirium); after that it means it went down.
        // Passing setResult a function lets it look at the previous result to decide.
        .catch(() =>
          setResult((previous) =>
            previous.state === 'checking' || previous.state === 'starting'
              ? { state: 'starting' }
              : { state: 'unreachable' },
          ),
        )
    }

    check() // check once right away...
    const timer = setInterval(check, POLL_INTERVAL_MS) // ...then keep checking
    return () => clearInterval(timer) // React runs this when the component leaves the page, so the timer stops too
  }, [url]) // only restart polling if the url changes

  return result
}
