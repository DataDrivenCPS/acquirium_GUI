import { describe, expect, it } from 'vitest'
import { formatTime, formatValue, NONE } from '../src/format'

describe('formatValue', () => {
  it('shows numbers with separators and at most 3 decimals', () => {
    expect(formatValue(70397689)).toBe('70,397,689')
    expect(formatValue(0.123456)).toBe('0.123')
    expect(formatValue(15.5)).toBe('15.5')
  })

  it('shows text readings as-is and a dash for none', () => {
    expect(formatValue('running')).toBe('running')
    expect(formatValue(null)).toBe(NONE)
  })
})

describe('formatTime', () => {
  it('shows an ISO time as YYYY-MM-DD HH:MM:SS in the given time zone', () => {
    expect(formatTime('2026-10-11T19:52:41.745513+00:00', 'UTC')).toBe('2026-10-11 19:52:41')
    expect(formatTime('2026-10-11T19:52:41+00:00', 'America/Denver')).toBe('2026-10-11 13:52:41')
  })

  it('shows a dash for no time', () => {
    expect(formatTime(null)).toBe(NONE)
  })
})
