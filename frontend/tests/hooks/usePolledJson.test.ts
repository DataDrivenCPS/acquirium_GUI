import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../support/mockFetch'
import { usePolledJson } from '../../src/hooks/usePolledJson'

// advanceTimersByTimeAsync moves the fake clock forward and lets pending fetches finish;
// act() tells React to apply the resulting state updates before we look
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('usePolledJson', () => {
  beforeEach(() => {
    vi.useFakeTimers() // the hook re-polls every 3 s; a fake clock lets tests skip ahead instantly
  })

  it('reports checking, then the data once the backend answers', async () => {
    mockFetch({ 'GET /api/x': { body: { n: 1 } } })
    const { result } = renderHook(() => usePolledJson<{ n: number }>('/api/x'))
    expect(result.current).toEqual({ state: 'checking' })
    await advance(0)
    expect(result.current).toEqual({ state: 'ok', data: { n: 1 } })
  })

  it('reports unreachable when the request fails or returns an error status', async () => {
    mockFetch({ 'GET /api/err': { status: 500, body: {} } })
    const failing = renderHook(() => usePolledJson('/api/down')) // no route: network failure
    const erroring = renderHook(() => usePolledJson('/api/err'))
    await advance(0)
    expect(failing.result.current).toEqual({ state: 'unreachable' })
    expect(erroring.result.current).toEqual({ state: 'unreachable' })
  })

  it('polls again every 3 seconds and picks up changes', async () => {
    let n = 1
    const fetchMock = mockFetch({ 'GET /api/x': () => ({ body: { n: n++ } }) })
    const { result } = renderHook(() => usePolledJson<{ n: number }>('/api/x'))
    await advance(0)
    await advance(3000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual({ state: 'ok', data: { n: 2 } })
  })

  it('stops polling when the component goes away', async () => {
    const fetchMock = mockFetch({ 'GET /api/x': { body: {} } })
    const { unmount } = renderHook(() => usePolledJson('/api/x'))
    await advance(0)
    unmount()
    await advance(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
