import { describe, expect, it } from 'vitest'
import { describePoll, worstTone } from '../../../src/components/status/describe'

describe('worstTone', () => {
  it('is ok when every tone is ok, or when there are none', () => {
    expect(worstTone(['ok', 'ok'])).toBe('ok')
    expect(worstTone([])).toBe('ok')
  })

  it('is pending when something is pending and nothing has failed', () => {
    expect(worstTone(['ok', 'pending', 'ok'])).toBe('pending')
  })

  it('is error as soon as anything has failed, whatever else is going on', () => {
    expect(worstTone(['pending', 'error', 'ok'])).toBe('error')
  })
})

describe('describePoll', () => {
  const describeHealth = (data: { ok: boolean }) => ({ tone: data.ok ? ('ok' as const) : ('error' as const), text: 'answered' })

  it('says checking while the endpoint has not answered yet', () => {
    expect(describePoll({ state: 'checking' }, describeHealth)).toEqual({ tone: 'pending', text: 'checking' })
  })

  it('says starting, in amber, while checks fail before the backend has ever answered', () => {
    expect(describePoll({ state: 'starting' }, describeHealth)).toEqual({ tone: 'pending', text: 'starting' })
  })

  it('says unreachable when the latest check failed after an earlier one succeeded', () => {
    expect(describePoll({ state: 'unreachable' }, describeHealth)).toEqual({ tone: 'error', text: 'unreachable' })
  })

  it("hands an answer to the row's describe function", () => {
    expect(describePoll({ state: 'ok', data: { ok: true } }, describeHealth)).toEqual({ tone: 'ok', text: 'answered' })
  })
})
