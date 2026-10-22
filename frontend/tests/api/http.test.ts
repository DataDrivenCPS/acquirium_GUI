import { describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../support/mockFetch'
import { ApiError, errorMessage, NO_RESPONSE, postJson } from '../../src/api/http'

describe('errorMessage', () => {
  it('uses a plain detail string as-is', () => {
    expect(errorMessage(400, { detail: "Could not resolve 'pmup' as class" })).toBe("Could not resolve 'pmup' as class")
  })

  it('turns validation errors into readable lines, counting steps from 1', () => {
    const body = {
      detail: [
        { loc: ['body', 'steps', 0, 'entity', 'filters', 1, 'attr'], msg: "Value error, unknown attribute 'colour'" },
        { loc: ['body', 'steps', 2, 'include', 'names'], msg: 'List should have at least 1 item' },
      ],
    }
    expect(errorMessage(422, body)).toBe(
      "steps #1 entity filters #2 attr: unknown attribute 'colour'; steps #3 include names: List should have at least 1 item",
    )
  })

  it('falls back to the status code for anything else', () => {
    expect(errorMessage(500, undefined)).toBe('Request failed (HTTP 500)')
    expect(errorMessage(502, { detail: 42 })).toBe('Request failed (HTTP 502)')
  })
})

describe('postJson', () => {
  it('sends the body as JSON and returns the parsed answer', async () => {
    const fetchMock = mockFetch({ 'POST /api/echo': (body) => ({ body: { got: body } }) })
    await expect(postJson('/api/echo', { a: 1 })).resolves.toEqual({ got: { a: 1 } })
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('throws an ApiError carrying the status and readable message', async () => {
    mockFetch({ 'POST /api/run': { status: 400, body: { detail: 'bad query' } } })
    const error = await postJson('/api/run', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'bad query' })
  })

  it('carries the closest candidates and the unmatched text when the backend sends them', async () => {
    const candidates = [{ uri: 'ns1:Pump', label: 'Pump', score: 0.82 }]
    mockFetch({ 'POST /api/run': { status: 400, body: { detail: 'close matches', candidates, text: 'pmp', field: 'medium' } } })
    const error = await postJson('/api/run', {}).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 400, message: 'close matches', candidates, text: 'pmp', field: 'medium' })
  })

  it('has no candidates and no text on other errors', async () => {
    mockFetch({ 'POST /api/run': { status: 500, body: { detail: 'boom' } } })
    const error = await postJson('/api/run', {}).catch((e: unknown) => e)
    expect(error).toMatchObject({ candidates: [], text: null, field: null })
  })

  it('reports an unreachable backend as an ApiError', async () => {
    mockFetch({}) // every request fails like a network error
    await expect(postJson('/api/run', {})).rejects.toMatchObject({ status: NO_RESPONSE, message: 'Backend unreachable' })
  })

  it('lets a cancelled request reject with the AbortError, so callers can ignore it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    }))
    await expect(postJson('/api/run', {})).rejects.toMatchObject({ name: 'AbortError' })
  })
})
