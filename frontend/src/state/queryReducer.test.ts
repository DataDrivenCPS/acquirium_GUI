import { describe, expect, it } from 'vitest'

import type { QueryStep } from '../api/types'
import {
  aliasesBefore,
  bindingAliases,
  currentAlias,
  focusedAlias,
  hasMeasurement,
  initialQueryState,
  queryReducer,
  toDescription,
  withAttr,
  withAttrPatched,
  withResolved,
  withoutAttr,
} from './queryReducer'
import type { QueryAction, QueryState } from './queryReducer'

function run(...actions: QueryAction[]): QueryState {
  return actions.reduce(queryReducer, initialQueryState)
}

const PUMP = { id: 'c_pump', label: 'Pump' }

describe('adding steps', () => {
  it('gives each step a stable id and an alias', () => {
    const state = run({ type: 'add', kind: 'entity' })
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({ id: 's1', kind: 'entity', alias: 'e1' })
  })

  it('numbers aliases per kind, so e1/e2 and r1 coexist', () => {
    const state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'entity' },
    )
    expect(state.steps.map((s) => s.alias)).toEqual(['e1', 'r1', 'e2'])
  })

  it('does not alias where/refocus, which constrain rather than bind', () => {
    const state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'where' })
    expect(state.steps[1]?.alias).toBeNull()
  })

  it('hangs a related step off wherever the pointer is', () => {
    const state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    expect(state.steps[1]?.frm).toBe('e1')
  })

  it('targets a where at the current node', () => {
    const state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'where' })
    expect(state.steps[1]?.target).toBe('e1')
  })

  it('leaves the first entity with nothing to hang off', () => {
    const state = run({ type: 'add', kind: 'entity' })
    expect(state.steps[0]?.frm).toBeNull()
  })
})

describe('the query pointer', () => {
  it('follows the most recent binding step', () => {
    const state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'measurement' },
    )
    expect(currentAlias(state.steps)).toBe('m1')
  })

  it('moves back when the user refocuses', () => {
    let state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'refocus' },
    )
    const refocus = state.steps[2] as QueryStep
    state = queryReducer(state, { type: 'update', id: refocus.id, patch: { target: 'e1' } })

    expect(currentAlias(state.steps)).toBe('e1')
  })

  it('branches: a step added after a refocus hangs off the earlier node', () => {
    let state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'refocus' },
    )
    state = queryReducer(state, {
      type: 'update',
      id: 's3',
      patch: { target: 'e1' },
    })
    state = queryReducer(state, { type: 'add', kind: 'related' })

    expect(state.steps[3]?.frm).toBe('e1')
  })

  it('is null on an empty query', () => {
    expect(currentAlias([])).toBeNull()
  })
})

describe('the selected card', () => {
  it('is the newest step when the user has not picked one', () => {
    const state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    expect(focusedAlias(state)).toBe('r1')
  })

  it('is whatever the user clicked', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    state = queryReducer(state, { type: 'focus', alias: 'e1' })

    expect(focusedAlias(state)).toBe('e1')
  })

  it('is what a new step hangs off, so clicking a card branches from it', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    state = queryReducer(state, { type: 'focus', alias: 'e1' })
    state = queryReducer(state, { type: 'add', kind: 'measurement' })

    expect(state.steps[2]?.frm).toBe('e1')
  })

  it('moves to the step just added, so the next one continues the chain', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    state = queryReducer(state, { type: 'focus', alias: 'e1' })
    state = queryReducer(state, { type: 'add', kind: 'measurement' })

    expect(focusedAlias(state)).toBe('m1')
  })

  it('lets go when the card it pointed at is removed', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'entity' })
    state = queryReducer(state, { type: 'focus', alias: 'e2' })
    state = queryReducer(state, { type: 'remove', id: 's2' })

    expect(focusedAlias(state)).toBe('e1')
  })

  it('is nothing on an empty query', () => {
    expect(focusedAlias(initialQueryState)).toBeNull()
  })
})

describe('adding a step with its choice already made', () => {
  it('applies the patch, so clicking the plant graph builds a step in one go', () => {
    const state = run({ type: 'add', kind: 'entity', patch: { cls: PUMP } })
    expect(state.steps[0]).toMatchObject({ kind: 'entity', cls: PUMP, alias: 'e1' })
  })

  it('still hangs the step off the selected card', () => {
    let state = run({ type: 'add', kind: 'entity' })
    state = queryReducer(state, { type: 'add', kind: 'related', patch: { cls: PUMP } })

    expect(state.steps[1]?.frm).toBe('e1')
  })
})

describe('alias selectors', () => {
  it('lists only binding aliases', () => {
    const state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'where' },
      { type: 'add', kind: 'measurement' },
    )
    expect(bindingAliases(state.steps)).toEqual(['e1', 'm1'])
  })

  it('offers a step only the aliases that existed before it', () => {
    const state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'measurement' },
    )
    // A step cannot hang off itself or off something defined later.
    expect(aliasesBefore(state.steps, 's2')).toEqual(['e1'])
  })
})

describe('editing and removing', () => {
  it('patches one step and leaves the others alone', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'entity' })
    state = queryReducer(state, { type: 'update', id: 's1', patch: { cls: PUMP } })

    expect(state.steps[0]?.cls).toEqual(PUMP)
    expect(state.steps[1]?.cls).toBeNull()
  })

  it('undo removes the last step and nothing else', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    state = queryReducer(state, { type: 'undo' })

    expect(state.steps.map((s) => s.id)).toEqual(['s1'])
  })

  it('undo on an empty query is a no-op rather than an error', () => {
    expect(queryReducer(initialQueryState, { type: 'undo' }).steps).toEqual([])
  })

  it('removes a step and everything hanging off it', () => {
    // The builder draws these as nested cards, so removing one has to take
    // its branch with it -- leaving a step pointing at an alias that no
    // longer exists would match nothing, with nothing on screen saying why.
    let state = run(
      { type: 'add', kind: 'entity' },
      { type: 'add', kind: 'related' },
      { type: 'add', kind: 'measurement' },
    )
    state = queryReducer(state, { type: 'remove', id: 's2' })

    expect(state.steps.map((s) => s.id)).toEqual(['s1'])
  })

  it('leaves a sibling branch alone', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'related' })
    state = queryReducer(state, { type: 'focus', alias: 'e1' })
    state = queryReducer(state, { type: 'add', kind: 'measurement' })
    state = queryReducer(state, { type: 'remove', id: 's2' })

    expect(state.steps.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  it('takes the conditions aimed at a removed step with it', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'where' })
    state = queryReducer(state, { type: 'remove', id: 's1' })

    expect(state.steps).toEqual([])
  })

  it('never reuses an alias after a removal', () => {
    let state = run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'entity' })
    state = queryReducer(state, { type: 'remove', id: 's1' })
    state = queryReducer(state, { type: 'add', kind: 'entity' })

    const aliases = state.steps.map((s) => s.alias)
    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it('clear resets to the empty query', () => {
    const state = queryReducer(run({ type: 'add', kind: 'entity' }), { type: 'clear' })
    expect(state).toEqual(initialQueryState)
  })
})

describe('loading a query wholesale', () => {
  it('adopts the steps and keeps new ids clear of them', () => {
    const loaded: QueryStep[] = [
      { id: 's7', kind: 'entity', alias: 'e1', cls: PUMP, attrs: [] },
    ]
    let state = queryReducer(initialQueryState, {
      type: 'load',
      description: { steps: loaded },
    })
    state = queryReducer(state, { type: 'add', kind: 'related' })

    expect(state.steps[1]?.id).toBe('s8')
  })
})

describe('serializing', () => {
  it('sends the steps and keeps local bookkeeping out of the payload', () => {
    const state = run({ type: 'add', kind: 'entity' })
    expect(toDescription(state)).toEqual({ steps: state.steps })
    expect(toDescription(state)).not.toHaveProperty('nextId')
  })

  it('knows whether Execute has anything to fetch', () => {
    expect(hasMeasurement(run({ type: 'add', kind: 'entity' }))).toBe(false)
    expect(
      hasMeasurement(run({ type: 'add', kind: 'entity' }, { type: 'add', kind: 'measurement' })),
    ).toBe(true)
  })

  // A condition the user has opened but not answered must not reach the
  // backend: it would be sent as "medium is <nothing>", match no rows, and
  // blank the results the moment someone starts narrowing them.
  it('leaves out a condition with no value chosen yet', () => {
    let state = run({ type: 'add', kind: 'entity', patch: { cls: PUMP } })
    const id = state.steps[0]!.id
    state = queryReducer(state, {
      type: 'update',
      id,
      patch: {
        attrs: [
          { name: 'medium', value: { id: '', label: '' }, negated: false },
          { name: 'unit', value: { id: 'u_bar', label: 'bar' }, negated: false },
        ],
      },
    })

    expect(toDescription(state).steps[0]?.attrs).toEqual([
      { name: 'unit', value: { id: 'u_bar', label: 'bar' }, negated: false },
    ])
    // The step itself stays: it is the user's query, not their condition.
    expect(toDescription(state).steps).toHaveLength(1)
  })

  it('drops a where() step whose only condition is unanswered', () => {
    let state = run({ type: 'add', kind: 'entity', patch: { cls: PUMP } })
    state = queryReducer(state, { type: 'add', kind: 'where' })
    const whereId = state.steps[1]!.id
    state = queryReducer(state, {
      type: 'update',
      id: whereId,
      patch: { attrs: [{ name: 'medium', value: { id: '', label: '' }, negated: false }] },
    })

    // An empty where() narrows nothing and only clutters the generated query.
    expect(toDescription(state).steps.map((step) => step.kind)).toEqual(['entity'])
  })

  it('leaves a finished query exactly as it is', () => {
    const state = run({ type: 'add', kind: 'entity', patch: { cls: PUMP } })
    expect(toDescription(state)).toEqual({ steps: state.steps })
  })
})

describe('step editing helpers', () => {
  const step: QueryStep = {
    id: 's1',
    kind: 'where',
    attrs: [
      { name: 'unit', value: { id: 'u_bar', label: 'bar' }, negated: false },
      { name: 'medium', value: { id: 'm_brine', label: 'Brine' }, negated: false },
    ],
  }

  it('appends an attribute filter', () => {
    const patch = withAttr(step, {
      name: 'quantity_kind',
      value: { id: 'q_pressure', label: 'Pressure' },
      negated: false,
    })
    expect(patch.attrs).toHaveLength(3)
  })

  it('removes one attribute filter by position', () => {
    expect(withoutAttr(step, 0).attrs).toEqual([step.attrs[1]])
  })

  it('patches one attribute filter in place', () => {
    const patch = withAttrPatched(step, 0, { negated: true })
    expect(patch.attrs?.[0]?.negated).toBe(true)
    expect(patch.attrs?.[1]?.negated).toBe(false)
  })

  it('a resolved class and a resolved instance are mutually exclusive', () => {
    expect(withResolved(PUMP, false)).toEqual({ cls: PUMP, instance: null })
    expect(withResolved({ id: 'e_ro', label: 'RO' }, true)).toEqual({
      cls: null,
      instance: { id: 'e_ro', label: 'RO' },
    })
  })
})
