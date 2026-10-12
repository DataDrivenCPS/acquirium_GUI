import { describe, expect, it } from 'vitest'
import { CPU, PUMP_STATE } from '../../support/fixtures'
import { matchesFilter } from '../../../src/components/streams/filter'

describe('matchesFilter', () => {
  it('matches everything when the filter is empty', () => {
    expect(matchesFilter(CPU, '')).toBe(true)
    expect(matchesFilter(CPU, '   ')).toBe(true)
  })

  it('matches any text field, ignoring case', () => {
    expect(matchesFilter(CPU, 'cpu')).toBe(true) // label
    expect(matchesFilter(CPU, 'PERCENT')).toBe(true) // unit
    expect(matchesFilter(PUMP_STATE, 'scada')).toBe(true) // data source
    expect(matchesFilter(PUMP_STATE, 'plant:')).toBe(true) // point
  })

  it('requires every word to match', () => {
    expect(matchesFilter(CPU, 'cpu percent')).toBe(true)
    expect(matchesFilter(CPU, 'cpu scada')).toBe(false)
  })
})
