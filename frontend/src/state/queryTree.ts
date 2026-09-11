/**
 * The query as a *shape* rather than a list of steps.
 *
 * `queryReducer` keeps the query the way the backend wants it: a flat,
 * ordered step list where relationships are carried by alias strings
 * (`frm: 'e1'`, `target: 'r2'`). That is exactly right as a wire format and
 * exactly wrong as something to put in front of a plant operator -- reading
 * it means holding an alias table in your head.
 *
 * This module is the translation. It turns that flat list into the tree it
 * actually describes, so the builder can draw connected cards, and it turns
 * the same list into an English sentence, so the user can check what they
 * built without learning what `related()` means.
 *
 * Everything here is pure and derived. It never changes the query -- the step
 * list stays the single source of truth, aliases and all.
 */

import type { QueryStep, StepKind } from '../api/types'
import type { AttrFilter } from '../api/types'
import { attrSummary, isBlank } from './attributes'

/** Steps that introduce something new to point at, and so get a card. */
const BINDING_KINDS: StepKind[] = ['entity', 'related', 'measurement']

/**
 * One condition as the UI handles it: the filter itself, plus where it lives
 * so an edit can be dispatched back to the right step.
 *
 * `external` distinguishes a condition written on the card's own step
 * (`entity(cls, medium=...)`) from one carried by a separate `where()` step
 * aimed at it. Both render identically -- a condition is a condition to the
 * user -- but they are patched differently.
 */
export interface Condition {
  stepId: string
  index: number
  attr: AttrFilter
  external: boolean
}

/** One card in the builder: a binding step, its conditions, and what hangs off it. */
export interface QueryNode {
  step: QueryStep
  alias: string
  parentAlias: string | null
  children: QueryNode[]
  conditions: Condition[]
}

export interface QueryTree {
  roots: QueryNode[]
  /**
   * Conditions whose target no longer exists -- possible after a step is
   * removed, or in a query loaded from elsewhere. Surfaced rather than
   * dropped: an invisible constraint silently narrowing results is the kind
   * of thing this UI exists to prevent.
   */
  orphans: Condition[]
}

/** What to call a card: the specific unit if there is one, else its class. */
export function stepLabel(step: QueryStep): string | null {
  return step.instance?.label ?? step.cls?.label ?? null
}

export function buildQueryTree(steps: QueryStep[]): QueryTree {
  const byAlias = new Map<string, QueryNode>()
  const roots: QueryNode[] = []
  const orphans: Condition[] = []

  // Mirrors the query pointer in queryReducer: where an omitted frm/target
  // lands, including the way refocus() moves it backwards.
  let current: string | null = null

  for (const step of steps) {
    if (step.kind === 'refocus') {
      current = step.target ?? current
      continue
    }

    if (step.kind === 'where') {
      const conditions = conditionsOf(step, true)
      const target = step.target ?? current
      const node = target ? byAlias.get(target) : undefined
      if (node) node.conditions.push(...conditions)
      else orphans.push(...conditions)
      continue
    }

    if (!BINDING_KINDS.includes(step.kind)) continue

    // Fall back to the step id so a query missing its aliases still draws.
    const alias = step.alias ?? step.id
    const parentAlias = step.kind === 'entity' ? null : step.frm ?? current
    const parent = parentAlias ? byAlias.get(parentAlias) : undefined

    const node: QueryNode = {
      step,
      alias,
      parentAlias: parent ? parentAlias : null,
      children: [],
      conditions: conditionsOf(step, false),
    }

    byAlias.set(alias, node)
    if (parent) parent.children.push(node)
    else roots.push(node)

    current = alias
  }

  return { roots, orphans }
}

function conditionsOf(step: QueryStep, external: boolean): Condition[] {
  return step.attrs.map((attr, index) => ({ stepId: step.id, index, attr, external }))
}

export function findNode(roots: QueryNode[], alias: string): QueryNode | null {
  for (const root of roots) {
    if (root.alias === alias) return root
    const hit = findNode(root.children, alias)
    if (hit) return hit
  }
  return null
}

/** Every card, depth-first, in the order they are drawn. */
export function flattenTree(roots: QueryNode[]): QueryNode[] {
  return roots.flatMap((node) => [node, ...flattenTree(node.children)])
}

// --- English readback ------------------------------------------------------

/**
 * The query as a sentence.
 *
 * This is the check an operator can actually perform: not "is `frm` pointing
 * at r1", but "does this say what I meant". It is derived from the same tree
 * the cards are drawn from, so the two cannot disagree.
 */
export function describeQuery(steps: QueryStep[]): string {
  const { roots } = buildQueryTree(steps)
  const clauses: string[] = []

  const walk = (node: QueryNode, parent: QueryNode | null) => {
    clauses.push(clauseFor(node, parent))
    node.children.forEach((child) => walk(child, node))
  }
  roots.forEach((root) => walk(root, null))

  if (clauses.length === 0) return ''
  return `Show me ${clauses.join(', then ')}.`
}

function clauseFor(node: QueryNode, parent: QueryNode | null): string {
  const parentName = parent ? stepLabel(parent.step) ?? 'it' : 'the plant'
  const label = stepLabel(node.step)

  if (node.step.kind === 'entity') {
    const subject = node.step.instance
      ? node.step.instance.label
      : label
        ? `every ${label}`
        : 'anything in the plant'
    return subject + conditionPhrase(node.conditions)
  }

  if (node.step.kind === 'related') {
    const subject = node.step.instance ? node.step.instance.label : label ? `every ${label}` : 'everything'
    const relation =
      node.step.direction === 'downstream'
        ? `downstream of ${parentName}`
        : node.step.direction === 'upstream'
          ? `upstream of ${parentName}`
          : `connected to ${parentName}`
    return `${subject} ${relation}` + conditionPhrase(node.conditions)
  }

  // measurement: what it measures is the useful half, so it leads.
  const measured = node.conditions.find(
    (condition) => condition.attr.name === 'quantity_kind' && !isBlank(condition.attr),
  )
  const rest = node.conditions.filter((condition) => condition !== measured)
  const subject = measured
    ? `the ${measured.attr.value.label} measurements of ${parentName}`
    : `every measurement of ${parentName}`
  return subject + conditionPhrase(rest)
}

function conditionPhrase(conditions: Condition[]): string {
  const said = conditions.filter((condition) => !isBlank(condition.attr)).map((condition) => attrSummary(condition.attr))
  return said.length ? ` where ${said.join(' and ')}` : ''
}
