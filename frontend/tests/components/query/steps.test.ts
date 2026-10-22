import { describe, expect, it } from 'vitest'
import type { QueryStep } from '../../../src/api/types'
import type { Candidate } from '../../../src/api/types'
import { fillClass, newStep, toRequest } from '../../../src/components/query/steps'

describe('newStep', () => {
  it('starts an entity step blank, with no filters', () => {
    expect(newStep('entity')).toEqual({ kind: 'entity', cls: '', cls_uri: '', uri: '', alias: '', filters: [] })
  })

  it('starts a related step with Acquirium defaults left unset', () => {
    expect(newStep('related')).toEqual({
      kind: 'related', cls: '', cls_uri: '', uri: '', alias: '', frm: '', via: '', direction: '', max_depth: null, nearest: null, filters: [],
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

const PUMP: Candidate = { uri: 'urn:nawi-water-ontology#Pump', label: 'Pump', score: 0.82, source: 'Water ontology' }
const entity = (cls: string, cls_uri = ''): QueryStep => ({ ...(newStep('entity') as Extract<QueryStep, { kind: 'entity' }>), cls, cls_uri })
const related = (cls: string): QueryStep => ({ ...(newStep('related') as Extract<QueryStep, { kind: 'related' }>), cls })

describe('fillClass', () => {
  const steps: QueryStep[] = [entity('pmup'), related(' pmup '), entity('Tank'), newStep('measurement')]

  it('shows the chosen name in every entity and related step that used the failed text, and keeps its identifier out of sight', () => {
    const filled = fillClass(steps, 'pmup', PUMP)
    expect(filled.map((s) => ('cls' in s ? [s.cls, s.cls_uri] : null))).toEqual([
      ['Pump', PUMP.uri], ['Pump', PUMP.uri], ['Tank', ''], null,
    ])
  })

  it('does not change the steps it was given', () => {
    fillClass(steps, 'pmup', PUMP)
    expect('cls' in steps[0] && [steps[0].cls, steps[0].cls_uri]).toEqual(['pmup', ''])
  })

  it('returns the steps unchanged when no step used that text', () => {
    expect(fillClass(steps, 'zzz', PUMP)).toEqual(steps)
  })
})

describe('toRequest', () => {
  it('sends the chosen identifier as the class, and not the field that held it', () => {
    const [sent] = toRequest([entity('Pump', PUMP.uri)]) as Record<string, unknown>[]
    expect(sent).toMatchObject({ kind: 'entity', cls: PUMP.uri })
    expect(sent).not.toHaveProperty('cls_uri')
  })

  it('sends the typed text when nothing was chosen', () => {
    const sent = toRequest([entity('tank'), related('pipe')]) as { cls: string }[]
    expect(sent.map((s) => s.cls)).toEqual(['tank', 'pipe'])
  })

  it('leaves other steps as they are', () => {
    const steps = [newStep('measurement'), newStep('refocus')]
    expect(toRequest(steps)).toEqual(steps)
  })
})
