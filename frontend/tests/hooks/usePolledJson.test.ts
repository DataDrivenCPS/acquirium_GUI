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

  it('reports starting while checks fail before any has succeeded, however often they fail', async () => {
    mockFetch({ 'GET /api/err': { status: 500, body: {} } })
    const failing = renderHook(() => usePolledJson('/api/down')) // no route: network failure
    const erroring = renderHook(() => usePolledJson('/api/err'))
    await advance(0)
    expect(failing.result.current).toEqual({ state: 'starting' })
    expect(erroring.result.current).toEqual({ state: 'starting' })
    await advance(3000)
    expect(failing.result.current).toEqual({ state: 'starting' })
  })

  it('reports the data once a starting backend comes up', async () => {
    let up = false
    mockFetch({ 'GET /api/x': () => (up ? { body: { n: 1 } } : { status: 500, body: {} }) })
    const { result } = renderHook(() => usePolledJson<{ n: number }>('/api/x'))
    await advance(0)
    expect(result.current).toEqual({ state: 'starting' })
    up = true
    await advance(3000)
    expect(result.current).toEqual({ state: 'ok', data: { n: 1 } })
  })

  it('reports unreachable when a check fails after an earlier one succeeded, and keeps saying so', async () => {
    let up = true
    mockFetch({ 'GET /api/x': () => (up ? { body: {} } : { status: 500, body: {} }) })
    const { result } = renderHook(() => usePolledJson('/api/x'))
    await advance(0)
    up = false
    await advance(3000)
    expect(result.current).toEqual({ state: 'unreachable' })
    await advance(3000)
    expect(result.current).toEqual({ state: 'unreachable' }) // not back to starting: it was up before
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
