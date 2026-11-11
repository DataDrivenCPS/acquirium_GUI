import { describe, expect, it } from 'vitest'
import type { ResultOptions } from '../../../src/api/types'
import { DEFAULT_OPTIONS, READINGS_OPTIONS, toOptionsRequest } from '../../../src/components/query/options'

const readings = (change: Partial<ResultOptions>): ResultOptions => ({ ...READINGS_OPTIONS, ...change })

describe('toOptionsRequest', () => {
  it('sends nothing for the metadata table, so a plain run is the request it always was', () => {
    expect(toOptionsRequest(DEFAULT_OPTIONS)).toBeUndefined()
  })

  it('sends the newest readings in the wide layout for View readings, with no limit so the backend default applies', () => {
    expect(toOptionsRequest(READINGS_OPTIONS)).toEqual({ view: 'readings', order: 'desc', shape: 'wide' })
  })

  it('sends the limit, order and layout that were chosen', () => {
    expect(toOptionsRequest(readings({ limit: 50, order: 'asc', shape: 'narrow' }))).toEqual({
      view: 'readings', limit: 50, order: 'asc', shape: 'narrow',
    })
  })

  it('sends a group-by as a list with its aggregate', () => {
    expect(toOptionsRequest(readings({ group_by: 'data_alias', aggregate: 'mean' }))).toMatchObject({
      group_by: ['data_alias'], aggregate: 'mean',
    })
  })
})
