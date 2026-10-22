import type { Candidate } from './types'

// Thrown when the backend answers with an error status. message is ready to show on the page.
// When typed text did not match one node confidently, text is what was typed and candidates are
// the closest nodes (best first) to choose from; otherwise they are null and empty.
export class ApiError extends Error {
  readonly status: number
  readonly candidates: Candidate[]
  readonly text: string | null

  constructor(status: number, message: string, candidates: Candidate[] = [], text: string | null = null) {
    super(message)
    this.status = status
    this.candidates = candidates
    this.text = text
  }
}

// One entry of FastAPI's validation error list, e.g. { loc: ['body', 'steps', 0, 'entity', 'cls'], msg: '...' }
type ValidationIssue = { loc: (string | number)[]; msg: string }

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === 'object' && value !== null && 'loc' in value && 'msg' in value
}

// Turns an error response into readable text. FastAPI sends { detail: "..." } for errors our
// routes raise, and { detail: [{ loc, msg }, ...] } when a request fails validation (status 422).
export function errorMessage(status: number, body: unknown): string {
  const detail = typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.every(isValidationIssue)) {
    return detail
      .map(({ loc, msg }) => {
        // ['body', 'steps', 0, 'entity', 'cls'] -> 'steps #1 entity cls' (people count from 1)
        const where = loc
          .filter((part) => part !== 'body')
          .map((part) => (typeof part === 'number' ? `#${part + 1}` : part))
          .join(' ')
        return `${where}: ${msg.replace(/^Value error, /, '')}`
      })
      .join('; ')
  }
  return `Request failed (HTTP ${status})`
}

// The candidates and unmatched text of an error response, when it has them
function resolutionDetails(body: unknown): { candidates: Candidate[]; text: string | null } {
  const fields = typeof body === 'object' && body !== null ? (body as { candidates?: unknown; text?: unknown }) : {}
  return {
    candidates: Array.isArray(fields.candidates) ? (fields.candidates as Candidate[]) : [],
    text: typeof fields.text === 'string' ? fields.text : null,
  }
}

// Status we give ApiError when no answer came back at all (the backend is down or unreachable)
export const NO_RESPONSE = 0

// Sends body as JSON with POST and returns the JSON answer. Throws ApiError on an error status or
// when the backend can't be reached. signal lets the caller cancel a request whose answer it no
// longer needs; a cancelled request rejects with the browser's AbortError instead.
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(NO_RESPONSE, 'Backend unreachable')
  }
  const data: unknown = await response.json().catch(() => undefined) // an error page may not be JSON
  if (!response.ok) {
    const { candidates, text } = resolutionDetails(data)
    throw new ApiError(response.status, errorMessage(response.status, data), candidates, text)
  }
  return data as T
}
