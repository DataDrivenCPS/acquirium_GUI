import { describe, expect, it } from 'vitest'
import { ATTRIBUTES } from '../../support/fixtures'
import { attributesFor, newStep, parseNames, STEP_KINDS } from '../../../src/components/query/steps'

describe('newStep', () => {
  it('makes an empty step of every kind in the menu', () => {
    for (const { kind } of STEP_KINDS) {
      expect(newStep(kind).kind).toBe(kind)
    }
  })

  it('leaves every option blank, so the backend uses Acquirium defaults', () => {
    expect(newStep('related')).toEqual({
      kind: 'related', cls: '', uri: '', alias: '', frm: '', via: '',
      direction: '', max_depth: null, nearest: null, filters: [],
    })
    expect(newStep('include')).toEqual({ kind: 'include', names: [], of: '', required: false })
  })
})

describe('attributesFor', () => {
  const names = (kind: Parameters<typeof attributesFor>[0]) => attributesFor(kind, ATTRIBUTES).map((a) => a.name)

  it('offers entity attributes to entity and related steps', () => {
    expect(names('entity')).toEqual(['process', 'medium'])
    expect(names('related')).toEqual(['process', 'medium'])
  })

  it('offers data attributes to measurement steps', () => {
    expect(names('measurement')).toEqual(['medium', 'quantity_kind', 'unit'])
  })

  it('offers everything to where steps, which can target either', () => {
    expect(names('where')).toEqual(['process', 'medium', 'quantity_kind', 'unit'])
  })
})

describe('parseNames', () => {
  it('splits on commas and drops blanks', () => {
    expect(parseNames(' unit, medium ,, ')).toEqual(['unit', 'medium'])
    expect(parseNames('')).toEqual([])
  })
})
