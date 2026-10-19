import { vi } from 'vitest'

// What a mocked endpoint answers: a fixed reply, or a function of the request body (parsed JSON)
type Reply = { status?: number; body: unknown }
type Route = Reply | ((body: unknown) => Reply)

// Replaces the global fetch with a fake backend. Keys are "METHOD /url", e.g. "GET /api/streams".
// A request with no matching route fails like a network error, which is how a down backend looks.
// Returns the mock, so tests can check which requests were made.
export function mockFetch(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`
    const route = routes[key]
    if (!route) throw new TypeError(`Failed to fetch (no mock for ${key})`)
    const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const { status = 200, body } = typeof route === 'function' ? route(requestBody) : route
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The parsed JSON bodies of every request the mock received for one "METHOD /url" key
export function requestBodies(fetchMock: ReturnType<typeof mockFetch>, key: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key)
    .map(([, init]) => JSON.parse(init?.body as string))
}
