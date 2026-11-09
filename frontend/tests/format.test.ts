import { describe, expect, it } from 'vitest'
import { formatTime, formatValue, localName, NONE, unitName } from '../src/format'

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

describe('localName', () => {
  it('drops the namespace prefix', () => {
    expect(localName('unit:PERCENT')).toBe('PERCENT')
    expect(localName('quantitykind:DimensionlessRatio')).toBe('DimensionlessRatio')
  })

  it('drops a full URI up to the last # or /', () => {
    expect(localName('http://qudt.org/vocab/unit/BAR')).toBe('BAR')
    expect(localName('http://qudt.org/vocab/quantitykind#Pressure')).toBe('Pressure')
  })

  it('leaves a name with no namespace alone and shows a dash for none', () => {
    expect(localName('Pressure')).toBe('Pressure')
    expect(localName(null)).toBe(NONE)
  })
})

describe('unitName', () => {
  it('shows unitless units as unitless', () => {
    expect(unitName('unit:UNITLESS')).toBe('unitless')
    expect(unitName('http://qudt.org/vocab/unit/UNITLESS')).toBe('unitless')
  })

  it('otherwise behaves like localName', () => {
    expect(unitName('unit:BAR')).toBe('BAR')
    expect(unitName(null)).toBe(NONE)
  })
})
