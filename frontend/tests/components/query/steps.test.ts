import { describe, expect, it } from 'vitest'
import type { QueryStep } from '../../../src/api/types'
import { fillClass, newStep } from '../../../src/components/query/steps'

describe('newStep', () => {
  it('starts an entity step blank, with no filters', () => {
    expect(newStep('entity')).toEqual({ kind: 'entity', cls: '', uri: '', alias: '', filters: [] })
  })

  it('starts a related step with Acquirium defaults left unset', () => {
    expect(newStep('related')).toEqual({
      kind: 'related', cls: '', uri: '', alias: '', frm: '', via: '', direction: '', max_depth: null, nearest: null, filters: [],
    })
  })

  it('starts a measurement step blank', () => {
    expect(newStep('measurement')).toEqual({
      kind: 'measurement', frm: '', alias: '', direction: '', max_depth: null, nearest: null, filters: [],
    })
  })

  it('starts a filter (where) step with one filter on the given attribute, since a where needs at least one', () => {
    expect(newStep('where', 'medium')).toEqual({
      kind: 'where', target: '', filters: [{ attr: 'medium', value: '', exclude: false }],
    })
  })

  it('starts a refocus step with no alias', () => {
    expect(newStep('refocus')).toEqual({ kind: 'refocus', alias: '' })
  })

  it('gives every step its own filters array', () => {
    const [a, b] = [newStep('entity'), newStep('entity')]
    expect(a.kind === 'entity' && b.kind === 'entity' && a.filters !== b.filters).toBe(true)
  })
})

describe('fillClass', () => {
  const steps: QueryStep[] = [
    { ...(newStep('entity') as Extract<QueryStep, { kind: 'entity' }>), cls: 'pmup' },
    { ...(newStep('related') as Extract<QueryStep, { kind: 'related' }>), cls: ' pmup ' },
    { ...(newStep('entity') as Extract<QueryStep, { kind: 'entity' }>), cls: 'Tank' },
    newStep('measurement'),
  ]

  it('replaces the class text that failed to match, in every entity and related step that used it', () => {
    const filled = fillClass(steps, 'pmup', 'ns1:Pump')
    expect(filled.map((s) => ('cls' in s ? s.cls : null))).toEqual(['ns1:Pump', 'ns1:Pump', 'Tank', null])
  })

  it('does not change the steps it was given', () => {
    fillClass(steps, 'pmup', 'ns1:Pump')
    expect('cls' in steps[0] && steps[0].cls).toBe('pmup')
  })

  it('returns the steps unchanged when no step used that text', () => {
    expect(fillClass(steps, 'zzz', 'ns1:Pump')).toEqual(steps)
  })
})
