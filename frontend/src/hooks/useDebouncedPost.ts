import { useEffect, useState } from 'react'
import { postJson } from '../api/http'

// The latest answer. Only 'ok' carries data and only 'error' a message. A new answer replaces the
// old one only when it arrives, so the page keeps showing the last answer instead of flickering.
export type PostResult<T> =
  | { state: 'loading' } // no answer yet
  | { state: 'ok'; data: T }
  | { state: 'error'; message: string }

// POSTs body to url whenever body changes, but only once it has stopped changing for delayMs
// ("debouncing"), so typing in a form sends one request instead of one per keystroke.
// T is the answer's shape.
export function useDebouncedPost<T>(url: string, body: unknown, delayMs = 300): PostResult<T> {
  const [result, setResult] = useState<PostResult<T>>({ state: 'loading' })
  // Compare bodies by their JSON text: a new object with the same content shouldn't trigger a request
  const payload = JSON.stringify(body)

  useEffect(() => {
    const controller = new AbortController() // lets us cancel the request if body changes again
    const timer = setTimeout(() => {
      postJson<T>(url, JSON.parse(payload), controller.signal)
        .then((data) => setResult({ state: 'ok', data }))
        .catch((error: Error) => {
          if (error.name !== 'AbortError') setResult({ state: 'error', message: error.message })
        })
    }, delayMs)
    // React runs this before the next change's effect (and on unmount): drop the pending send,
    // and cancel a request already on its way so an old answer can't overwrite a newer one
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [url, payload, delayMs])

  return result
}
