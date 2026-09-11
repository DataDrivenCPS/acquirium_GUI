import { describe, expect, it } from 'vitest'

import type { QueryStep } from '../api/types'
import { buildQueryTree, describeQuery, findNode, stepLabel } from './queryTree'

const PUMP = { id: 'c_pump', label: 'Pump' }
const TANK = { id: 'c_tank', label: 'Tank' }
const P1 = { id: 'e_p1', label: 'P1' }
const PRESSURE = { id: 'q_pressure', label: 'Pressure' }
const BRINE = { id: 'm_brine', label: 'Brine' }

/** A step with the boilerplate filled in, so each test states only its point. */
function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id' | 'kind'>): QueryStep {
  return { attrs: [], ...partial }
}

const pumpStep = step({ id: 's1', kind: 'entity', alias: 'e1', cls: PUMP })

describe('shaping the steps into a tree', () => {
  it('nests a step under the alias it hangs off', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'related', alias: 'r1', frm: 'e1', cls: TANK }),
    ])

    expect(roots).toHaveLength(1)
    expect(roots[0]?.children.map((child) => child.alias)).toEqual(['r1'])
    expect(roots[0]?.children[0]?.parentAlias).toBe('e1')
  })

  it('puts two steps hanging off the same alias side by side', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'related', alias: 'r1', frm: 'e1' }),
      step({ id: 's3', kind: 'measurement', alias: 'm1', frm: 'e1' }),
    ])

    expect(roots[0]?.children.map((child) => child.alias)).toEqual(['r1', 'm1'])
  })

  it('gives a second entity a branch of its own', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'entity', alias: 'e2', cls: TANK }),
    ])

    expect(roots.map((root) => root.alias)).toEqual(['e1', 'e2'])
  })

  it('resolves an omitted frm to wherever the query pointer is', () => {
    const { roots } = buildQueryTree([pumpStep, step({ id: 's2', kind: 'related', alias: 'r1' })])

    expect(roots[0]?.children[0]?.parentAlias).toBe('e1')
  })

  it('follows a refocus when resolving an omitted frm', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'related', alias: 'r1', frm: 'e1' }),
      step({ id: 's3', kind: 'refocus', target: 'e1' }),
      step({ id: 's4', kind: 'measurement', alias: 'm1' }),
    ])

    expect(roots[0]?.children.map((child) => child.alias)).toEqual(['r1', 'm1'])
  })
})

describe('conditions', () => {
  it('carries the attributes written on a step on that step card', () => {
    const { roots } = buildQueryTree([
      step({ ...pumpStep, attrs: [{ name: 'medium', value: BRINE, negated: false }] }),
    ])

    expect(roots[0]?.conditions).toHaveLength(1)
    expect(roots[0]?.conditions[0]).toMatchObject({ stepId: 's1', index: 0, external: false })
  })

  it('attaches a where step to the card it targets, rather than showing a row of its own', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({
        id: 's2',
        kind: 'where',
        target: 'e1',
        attrs: [{ name: 'medium', value: BRINE, negated: false }],
      }),
    ])

    expect(roots).toHaveLength(1)
    expect(roots[0]?.conditions[0]).toMatchObject({ stepId: 's2', index: 0, external: true })
  })

  it('targets a where at the current node when it names none', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'where', attrs: [{ name: 'medium', value: BRINE, negated: false }] }),
    ])

    expect(roots[0]?.conditions).toHaveLength(1)
  })

  it('reports a condition it cannot attach rather than dropping it silently', () => {
    const { roots, orphans } = buildQueryTree([
      step({
        id: 's1',
        kind: 'where',
        target: 'e9',
        attrs: [{ name: 'medium', value: BRINE, negated: false }],
      }),
    ])

    expect(roots).toEqual([])
    expect(orphans).toHaveLength(1)
  })
})

describe('finding a card', () => {
  it('finds one nested anywhere in the tree', () => {
    const { roots } = buildQueryTree([
      pumpStep,
      step({ id: 's2', kind: 'related', alias: 'r1', frm: 'e1' }),
      step({ id: 's3', kind: 'measurement', alias: 'm1', frm: 'r1' }),
    ])

    expect(findNode(roots, 'm1')?.step.id).toBe('s3')
    expect(findNode(roots, 'nope')).toBeNull()
  })
})

describe('naming a card', () => {
  it('prefers the specific unit over its class', () => {
    expect(stepLabel(step({ id: 's1', kind: 'entity', cls: PUMP, instance: P1 }))).toBe('P1')
    expect(stepLabel(pumpStep)).toBe('Pump')
    expect(stepLabel(step({ id: 's1', kind: 'entity' }))).toBeNull()
  })
})

describe('reading the query back in English', () => {
  it('says nothing about an empty query', () => {
    expect(describeQuery([])).toBe('')
  })

  it('describes one class of equipment', () => {
    expect(describeQuery([pumpStep])).toBe('Show me every Pump.')
  })

  it('names a specific unit instead of its class', () => {
    expect(describeQuery([step({ id: 's1', kind: 'entity', alias: 'e1', instance: P1 })])).toBe(
      'Show me P1.',
    )
  })

  it('admits when nothing has been chosen yet', () => {
    expect(describeQuery([step({ id: 's1', kind: 'entity', alias: 'e1' })])).toBe(
      'Show me anything in the plant.',
    )
  })

  it('reads a connection in the direction the flow runs', () => {
    const sentence = describeQuery([
      pumpStep,
      step({
        id: 's2',
        kind: 'related',
        alias: 'r1',
        frm: 'e1',
        cls: TANK,
        direction: 'downstream',
      }),
    ])

    expect(sentence).toBe('Show me every Pump, then every Tank downstream of Pump.')
  })

  it('falls back to a plain connection when no direction is set', () => {
    const sentence = describeQuery([
      pumpStep,
      step({ id: 's2', kind: 'related', alias: 'r1', frm: 'e1', cls: TANK }),
    ])

    expect(sentence).toBe('Show me every Pump, then every Tank connected to Pump.')
  })

  it('names what a measurement measures when that is pinned down', () => {
    const sentence = describeQuery([
      pumpStep,
      step({
        id: 's2',
        kind: 'measurement',
        alias: 'm1',
        frm: 'e1',
        attrs: [{ name: 'quantity_kind', value: PRESSURE, negated: false }],
      }),
    ])

    expect(sentence).toBe('Show me every Pump, then the Pressure measurements of Pump.')
  })

  it('reads a measurement with nothing pinned down as all of them', () => {
    const sentence = describeQuery([
      pumpStep,
      step({ id: 's2', kind: 'measurement', alias: 'm1', frm: 'e1' }),
    ])

    expect(sentence).toBe('Show me every Pump, then every measurement of Pump.')
  })

  it('spells out the conditions on a card', () => {
    const sentence = describeQuery([
      step({ ...pumpStep, attrs: [{ name: 'medium', value: BRINE, negated: false }] }),
    ])

    expect(sentence).toBe('Show me every Pump where medium is Brine.')
  })

  it('spells out a negated condition as "is not"', () => {
    const sentence = describeQuery([
      step({ ...pumpStep, attrs: [{ name: 'medium', value: BRINE, negated: true }] }),
    ])

    expect(sentence).toBe('Show me every Pump where medium is not Brine.')
  })

  it('leaves a half-finished condition out of the sentence', () => {
    const sentence = describeQuery([
      step({
        ...pumpStep,
        attrs: [{ name: 'medium', value: { id: '', label: '' }, negated: false }],
      }),
    ])

    expect(sentence).toBe('Show me every Pump.')
  })
})
