/**
 * The query builder: the first band of the query tab.
 *
 * The query is drawn as what it actually is -- a chain of things in the plant
 * with lines between them -- rather than as the list of verbs that produces
 * it. One card per step, nested under whatever it hangs off, with the
 * relationship written on the line joining them.
 *
 * Three deliberate absences, each of which used to be a control here:
 *
 *   - **No alias pickers.** `from` / `target` dropdowns full of `e1`, `r2`
 *     asked the user to hold Acquirium's binding table in their head. The
 *     line between two cards says the same thing, and branching is clicking
 *     the card to branch from.
 *   - **No "Go back to" step.** `refocus()` was a row you added to move an
 *     invisible pointer. The pointer is now the selected card, and it is
 *     visible.
 *   - **No standalone "Narrow down" rows.** A `where()` renders as a chip on
 *     the card it constrains, because that is where the constraint applies.
 *
 * None of that changes the query being built: the state is still the same
 * flat, alias-carrying step list the backend replays, and `queryTree` derives
 * the shape from it. Nothing here evaluates a query -- cards only edit steps,
 * and the server answers what they match.
 */

import { useMemo } from 'react'

import { PanelStatus } from '../components/Panel'
import { ResolveField } from '../components/ResolveField'
import { StepCard } from '../components/StepCard'
import { ConditionChip } from '../components/AttrFilters'
import { EquipmentIcon, PlusIcon } from '../components/icons'
import type { GraphModel, QueryStep, Ref, ResolveKind } from '../api/types'
import { useQuery } from '../state/QueryContext'
import { focusedAlias, withResolved, withoutAttr } from '../state/queryReducer'
import { buildQueryTree } from '../state/queryTree'
import type { Condition, QueryNode } from '../state/queryTree'

/** Suggestion chips offered before anything is built. */
const QUICK_START_LIMIT = 8

export function QueryBuilder() {
  const { state, dispatch, graph } = useQuery()

  const { roots, orphans } = useMemo(() => buildQueryTree(state.steps), [state.steps])
  const selected = focusedAlias(state)
  const suggestions = useMemo(() => equipmentInPlant(graph.data), [graph.data])

  return (
    <>
      {state.steps.length === 0 ? (
        <StartHere suggestions={suggestions} />
      ) : (
        <>
          {/* The English readback lives in the query bar above the workspace,
              where it stays visible whichever tab is open. */}
          <div className="qb-canvas">
            {roots.map((root) => (
              <NodeView
                key={root.alias}
                node={root}
                parent={null}
                selected={selected}
                suggestions={suggestions}
              />
            ))}
          </div>

          <OrphanConditions orphans={orphans} />

          <div className="qb-canvas-footer">
            <button
              type="button"
              className="qb-action"
              title="Ask about a second, unrelated piece of equipment"
              onClick={() => dispatch({ type: 'add', kind: 'entity' })}
            >
              <PlusIcon />
              Another starting point
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** One card plus everything hanging off it, drawn recursively. */
function NodeView({
  node,
  parent,
  selected,
  suggestions,
}: {
  node: QueryNode
  parent: QueryNode | null
  selected: string | null
  suggestions: Ref[]
}) {
  return (
    <div className="qb-node">
      <StepCard
        node={node}
        parent={parent}
        selected={node.alias === selected}
        suggestions={suggestions}
      />

      {node.children.length > 0 && (
        <div className="qb-children">
          {node.children.map((child) => (
            <div className="qb-branch" key={child.alias}>
              {/* The line's label carries what an alias used to. */}
              <span className={`qb-link qb-link-${child.step.kind}`}>{linkLabel(child.step)}</span>
              <NodeView
                node={child}
                parent={node}
                selected={selected}
                suggestions={suggestions}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** What to write on the line joining a card to its parent. */
function linkLabel(step: QueryStep): string {
  if (step.kind === 'measurement') return 'measured at'
  if (step.direction === 'downstream') return 'flows into'
  if (step.direction === 'upstream') return 'fed by'
  return 'connected to'
}

/**
 * The empty state: a question, and things to click.
 *
 * An empty text box is a dead end for someone who does not know the plant's
 * vocabulary, so what is actually installed is offered directly. The chips
 * come from the same model graph filling the workspace behind this, which is
 * why clicking one and clicking the matching node in the plant do the same
 * thing.
 */
function StartHere({ suggestions }: { suggestions: Ref[] }) {
  const { dispatch, graph } = useQuery()

  const start = (ref: Ref, kind: ResolveKind = 'class') =>
    dispatch({ type: 'add', kind: 'entity', patch: withResolved(ref, kind === 'entity') })

  return (
    <div className="qb-start">
      <h3>What are you looking for?</h3>
      <p className="qb-start-lead">Pick a piece of equipment to start, or type its name.</p>

      <div className="qb-quick">
        {suggestions.slice(0, QUICK_START_LIMIT).map((suggestion) => (
          <button
            type="button"
            key={suggestion.id}
            className="qb-quick-chip"
            onClick={() => start(suggestion)}
          >
            <EquipmentIcon />
            {suggestion.label}
          </button>
        ))}
      </div>

      {graph.loading && suggestions.length === 0 && (
        <PanelStatus kind="info">Loading the plant model…</PanelStatus>
      )}

      <div className="qb-start-field">
        <ResolveField
          value={null}
          kind="class"
          suggestions={suggestions}
          placeholder="pump, tank, RO…"
          onResolved={(ref, kind) => start(ref, kind)}
          onCleared={() => undefined}
        />
      </div>
    </div>
  )
}

/**
 * Conditions whose card is gone.
 *
 * Should not normally happen -- removing a card takes its conditions with it
 * -- but a query loaded from elsewhere can carry one. Shown rather than
 * dropped: a constraint narrowing the results with nothing on screen to say
 * so is exactly the failure this UI exists to prevent.
 */
function OrphanConditions({ orphans }: { orphans: Condition[] }) {
  const { state, dispatch } = useQuery()
  if (orphans.length === 0) return null

  return (
    <div className="qb-orphans">
      <PanelStatus kind="info">
        These conditions are not attached to any step, and are still narrowing the results:
      </PanelStatus>
      <div className="qb-conditions">
        {orphans.map((condition) => (
          <ConditionChip
            key={`${condition.stepId}:${condition.index}`}
            attr={condition.attr}
            active={false}
            onEdit={() => undefined}
            onRemove={() => {
              const owner = state.steps.find((step) => step.id === condition.stepId)
              if (!owner) return
              if (owner.attrs.length === 1) dispatch({ type: 'remove', id: owner.id })
              else dispatch({ type: 'update', id: owner.id, patch: withoutAttr(owner, condition.index) })
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Equipment classes drawn from the plant model graph.
 *
 * This assumes a class-level graph node's `id` is also a valid class
 * reference -- true of the stub, and a contract the live adapter has to keep
 * (noted in its checklist). Measurement nodes are left out: a query starts at
 * equipment, and measurements are reached by hanging one off a card.
 */
function equipmentInPlant(model: GraphModel | null): Ref[] {
  if (!model) return []
  return model.nodes
    .filter((node) => node.kind !== 'measurement')
    .map((node) => ({ id: node.id, label: node.label }))
}
