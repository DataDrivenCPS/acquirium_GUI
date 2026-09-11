/**
 * The query being built, as pure state.
 *
 * Everything about the query lives here and nowhere else: panels read from it
 * and dispatch to it, and the whole thing serializes straight to the
 * `QueryDescription` the backend replays. Keeping it pure is what makes the
 * builder testable without a browser, and is why ids and aliases are
 * generated from a counter rather than from `crypto.randomUUID()`.
 *
 * It deliberately holds *no* query semantics -- no idea what `related()`
 * matches or how `direction=` walks the plant. That belongs to the real
 * `Query` object on the server. This is a record of what the user clicked.
 */

import type { AttrFilter, Direction, QueryDescription, QueryStep, Ref, StepKind } from '../api/types'
import { isBlank } from './attributes'

export interface QueryState {
  steps: QueryStep[]
  /** Monotonic, so step ids and generated aliases are deterministic. */
  nextId: number
  /**
   * The card the user clicked, and so what the next step hangs off.
   *
   * `null` means "follow the query", i.e. the newest binding step -- which is
   * what Acquirium's verbs do when `frm=`/`target=` is omitted. Selecting a
   * card is what replaced the old "Go back to" row: branching is now clicking
   * the thing you want to branch from, and every add resets this to null so
   * the selection follows the step just created.
   */
  focus: string | null
}

export const initialQueryState: QueryState = { steps: [], nextId: 1, focus: null }

/** Steps that introduce a new alias. `where` and `refocus` do not. */
const BINDING_KINDS: StepKind[] = ['entity', 'related', 'measurement']

const ALIAS_PREFIX: Record<StepKind, string> = {
  entity: 'e',
  related: 'r',
  measurement: 'm',
  where: 'w',
  refocus: 'f',
}

export type QueryAction =
  /** `patch` lets a click that already knows its answer -- a graph node, a
      suggested class -- create a finished step in one action. */
  | { type: 'add'; kind: StepKind; patch?: Partial<QueryStep> }
  | { type: 'update'; id: string; patch: Partial<QueryStep> }
  /** Select the card new steps hang off. `null` returns to following the query. */
  | { type: 'focus'; alias: string | null }
  | { type: 'remove'; id: string }
  /** Remove the most recent step, whatever it was. */
  | { type: 'undo' }
  | { type: 'clear' }
  /** Replace the whole query, e.g. from a saved query or the LLM panel. */
  | { type: 'load'; description: QueryDescription }

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'add': {
      const step = { ...makeStep(state, action.kind), ...action.patch }
      // Back to following the query, which now ends at this step: build a
      // chain by adding, branch by clicking a card first.
      return { steps: [...state.steps, step], nextId: state.nextId + 1, focus: null }
    }

    case 'update':
      return {
        ...state,
        steps: state.steps.map((step) =>
          step.id === action.id ? { ...step, ...action.patch } : step,
        ),
      }

    case 'focus':
      return { ...state, focus: action.alias }

    case 'remove':
      return settleFocus({ ...state, steps: withoutBranch(state.steps, action.id) })

    case 'undo':
      return settleFocus({ ...state, steps: state.steps.slice(0, -1) })

    case 'clear':
      return initialQueryState

    case 'load': {
      // Restart the counter past anything the loaded query already uses, so
      // later additions cannot collide with it.
      const highest = action.description.steps.reduce((max, step) => {
        const n = Number.parseInt(step.id.replace(/\D/g, ''), 10)
        return Number.isFinite(n) ? Math.max(max, n) : max
      }, 0)
      return { steps: action.description.steps, nextId: highest + 1, focus: null }
    }
  }
}

/**
 * Drop a step and everything anchored to it, directly or through a chain.
 *
 * The builder draws steps as nested cards, so this is what removing a card
 * has to mean. Leaving orphans behind would match nothing while showing
 * nothing that explains why -- the failure the whole design is trying to
 * avoid. A step with no explicit `frm`/`target` is left alone: its anchor is
 * implicit and re-resolves against whatever remains.
 */
function withoutBranch(steps: QueryStep[], id: string): QueryStep[] {
  const doomedIds = new Set([id])
  const doomedAliases = new Set<string>()

  for (const step of steps) {
    const anchor = step.frm ?? step.target ?? null
    if (doomedIds.has(step.id) || (anchor !== null && doomedAliases.has(anchor))) {
      doomedIds.add(step.id)
      if (step.alias) doomedAliases.add(step.alias)
    }
  }

  return steps.filter((step) => !doomedIds.has(step.id))
}

/** Let go of a selection whose card is gone. */
function settleFocus(state: QueryState): QueryState {
  if (state.focus === null) return state
  const alive = state.steps.some((step) => step.alias === state.focus)
  return alive ? state : { ...state, focus: null }
}

function makeStep(state: QueryState, kind: StepKind): QueryStep {
  const id = `s${state.nextId}`
  const current = focusedAlias(state)

  const step: QueryStep = {
    id,
    kind,
    cls: null,
    instance: null,
    alias: BINDING_KINDS.includes(kind) ? nextAlias(state, kind) : null,
    // Default to hanging off wherever the user is, which is what the Python
    // verbs do when frm=/target= is omitted -- but make it explicit and
    // editable rather than implicit, so branching is visible in the UI.
    frm: kind === 'related' || kind === 'measurement' ? current : null,
    target: kind === 'where' || kind === 'refocus' ? current : null,
    via: null,
    direction: null,
    max_depth: null,
    attrs: [],
  }
  return step
}

function nextAlias(state: QueryState, kind: StepKind): string {
  const prefix = ALIAS_PREFIX[kind]
  const taken = new Set(state.steps.map((step) => step.alias).filter(Boolean))
  let n = state.steps.filter((step) => step.kind === kind).length + 1
  while (taken.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

// --- selectors -------------------------------------------------------------

/**
 * Where the query pointer is: the alias a new `related`/`measurement`/`where`
 * would attach to by default. Mirrors Acquirium's "current node", including
 * the way `refocus()` moves it backwards.
 */
export function currentAlias(steps: QueryStep[]): string | null {
  let current: string | null = null
  for (const step of steps) {
    if (step.kind === 'refocus') {
      current = step.target ?? current
    } else if (BINDING_KINDS.includes(step.kind) && step.alias) {
      current = step.alias
    }
  }
  return current
}

/**
 * The card the builder shows as selected, and the anchor a new step gets.
 *
 * An explicit click wins; otherwise the query's own pointer, so a user who
 * never clicks anything just builds a chain.
 */
export function focusedAlias(state: QueryState): string | null {
  if (state.focus && state.steps.some((step) => step.alias === state.focus)) return state.focus
  return currentAlias(state.steps)
}

/** Aliases a step can point `frm`/`target` at, in the order they were created. */
export function bindingAliases(steps: QueryStep[]): string[] {
  return steps
    .filter((step) => BINDING_KINDS.includes(step.kind) && step.alias)
    .map((step) => step.alias as string)
}

/** Aliases created before `stepId`, i.e. the ones it may legally refer back to. */
export function aliasesBefore(steps: QueryStep[], stepId: string): string[] {
  const index = steps.findIndex((step) => step.id === stepId)
  return bindingAliases(index === -1 ? steps : steps.slice(0, index))
}

/**
 * The payload sent to the backend. The counter is local bookkeeping only.
 *
 * Half-written conditions are left behind. A condition whose value has not
 * been chosen yet is an unfinished sentence, not a constraint -- sent as one
 * it reads as "medium is <nothing>", matches nothing, and blanks the results
 * the instant someone starts narrowing them, which is the opposite of what
 * they asked for. The condition stays in state and on its card, dashed, until
 * it says something; it just does not get a vote yet.
 *
 * A `where()` left holding none of them goes with them -- an empty one
 * narrows nothing and would still show up in the generated query.
 */
export function toDescription(state: QueryState): QueryDescription {
  const steps = state.steps
    .map((step) =>
      step.attrs.some(isBlank) ? { ...step, attrs: step.attrs.filter((attr) => !isBlank(attr)) } : step,
    )
    .filter((step) => step.kind !== 'where' || step.attrs.length > 0)

  return { steps }
}

export function isEmpty(state: QueryState): boolean {
  return state.steps.length === 0
}

/** Whether Execute can do anything: without a measurement there is no data. */
export function hasMeasurement(state: QueryState): boolean {
  return state.steps.some((step) => step.kind === 'measurement')
}

// --- step editing helpers --------------------------------------------------
// Small, pure, and shared by the builder rows so attribute editing behaves
// identically everywhere.

export function withAttr(step: QueryStep, attr: AttrFilter): Partial<QueryStep> {
  return { attrs: [...step.attrs, attr] }
}

export function withoutAttr(step: QueryStep, index: number): Partial<QueryStep> {
  return { attrs: step.attrs.filter((_, i) => i !== index) }
}

export function withAttrPatched(
  step: QueryStep,
  index: number,
  patch: Partial<AttrFilter>,
): Partial<QueryStep> {
  return {
    attrs: step.attrs.map((attr, i) => (i === index ? { ...attr, ...patch } : attr)),
  }
}

export function withResolved(ref: Ref, asInstance: boolean): Partial<QueryStep> {
  return asInstance ? { instance: ref, cls: null } : { cls: ref, instance: null }
}

export function withDirection(direction: Direction | null): Partial<QueryStep> {
  return { direction }
}
