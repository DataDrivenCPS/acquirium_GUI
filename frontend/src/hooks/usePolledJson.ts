import { useEffect, useState } from 'react'

// How often to re-check, in milliseconds. The backend can take a while to start
// Acquirium, so one check at page load is not enough.
const POLL_INTERVAL_MS = 3000

// What a poll has found so far. Only the 'ok' case carries data, so TypeScript
// makes you check state before you can touch data.
export type PollResult<T> =
  | { state: 'checking' } // no answer yet
  | { state: 'unreachable' } // the latest check failed
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
        .catch(() => setResult({ state: 'unreachable' })) // backend down, error, etc.
    }

    check() // check once right away...
    const timer = setInterval(check, POLL_INTERVAL_MS) // ...then keep checking
    return () => clearInterval(timer) // React runs this when the component leaves the page, so the timer stops too
  }, [url]) // only restart polling if the url changes

  return result
}
