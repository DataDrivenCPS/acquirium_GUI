import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, requestBodies } from '../support/mockFetch'
import { useDebouncedPost } from '../../src/hooks/useDebouncedPost'

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const echo = { 'POST /api/echo': (body: unknown) => ({ body: { got: body } }) }

describe('useDebouncedPost', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('waits for the delay before sending, then reports the answer', async () => {
    const fetchMock = mockFetch(echo)
    const { result } = renderHook(() => useDebouncedPost('/api/echo', { a: 1 }, 300))
    await advance(299)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ state: 'loading' })
    await advance(1)
    expect(result.current).toEqual({ state: 'ok', data: { got: { a: 1 } } })
  })

  it('sends only the last body when it changes quickly', async () => {
    const fetchMock = mockFetch(echo)
    const { rerender } = renderHook(({ body }) => useDebouncedPost('/api/echo', body, 300), {
      initialProps: { body: { a: 1 } },
    })
    await advance(100)
    rerender({ body: { a: 2 } })
    await advance(100)
    rerender({ body: { a: 3 } })
    await advance(300)
    expect(requestBodies(fetchMock, 'POST /api/echo')).toEqual([{ a: 3 }])
  })

  it('does not resend when re-rendered with an equal body', async () => {
    const fetchMock = mockFetch(echo)
    const { rerender } = renderHook(({ body }) => useDebouncedPost('/api/echo', body, 300), {
      initialProps: { body: { a: 1 } },
    })
    await advance(300)
    rerender({ body: { a: 1 } }) // a new object with the same content
    await advance(300)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the last answer while a newer one is on its way', async () => {
    mockFetch(echo)
    const { result, rerender } = renderHook(({ body }) => useDebouncedPost('/api/echo', body, 300), {
      initialProps: { body: { a: 1 } },
    })
    await advance(300)
    rerender({ body: { a: 2 } })
    expect(result.current).toEqual({ state: 'ok', data: { got: { a: 1 } } })
    await advance(300)
    expect(result.current).toEqual({ state: 'ok', data: { got: { a: 2 } } })
  })

  it('reports the backend error message', async () => {
    mockFetch({ 'POST /api/echo': { status: 422, body: { detail: 'bad steps' } } })
    const { result } = renderHook(() => useDebouncedPost('/api/echo', {}, 300))
    await advance(300)
    expect(result.current).toEqual({ state: 'error', message: 'bad steps' })
  })
})
