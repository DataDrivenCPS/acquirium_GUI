import { useEffect, useState } from 'react'

// The only values status is allowed to have. TypeScript will warn you
// if you misspell one.
type Status = 'checking' | 'healthy' | 'unreachable'

function HealthStatus() {
  const [status, setStatus] = useState<Status>('checking') // status starts as checking

  useEffect(() => {
    fetch('/api/server-health')
      .then((response) => {
        // fetch only throws on network failures, not on server errors like 500,
        // so we check the HTTP status ourselves.
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => { // when the previous step finishes, do this next
        // TODO 1: data is the JSON from the backend, e.g. { ok: true }.
        // If data.ok is true, set status to 'healthy'. Otherwise, 'unreachable'.
        if ( data.ok === true) {
            setStatus('healthy')
        } else {
            setStatus('unreachable')
        }
      })
      .catch(() => { // handles any errors along the way ^
        // TODO 2: Something went wrong (backend down, error, etc.).
        // What should status be?
        setStatus('unreachable')
      })
  }, [])

  // TODO 3: Return JSX that shows the status on the page.
  // <p> means a paragraph
  return <p>Acquirium Status: {status}</p> // returns the current status of the connection to Acquirium
}

export default HealthStatus