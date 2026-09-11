/**
 * One step of the query, drawn as a card.
 *
 * A card is a thing in the plant -- a class of equipment, something connected
 * to it, or its measurements -- and it carries everything true about that
 * thing: what it is, which way the flow runs, and the conditions narrowing
 * it. Clicking it selects it, and whatever gets added next hangs off it.
 *
 * That selection is the whole reason there are no `from` / `target` pickers
 * left. Branching used to mean choosing an alias out of a dropdown; now it
 * means clicking the card you want to branch from, and the line drawn between
 * the two says what the alias used to say.
 */

import { useState } from 'react'

import type { QueryStep, Ref, ResolveKind } from '../api/types'
import type { AttrFilter, AttributeName, Direction } from '../api/types'
import type { Condition, QueryNode } from '../state/queryTree'
import { stepLabel } from '../state/queryTree'
import { useQuery } from '../state/QueryContext'
import {
  withAttr,
  withAttrPatched,
  withResolved,
  withoutAttr,
} from '../state/queryReducer'
import { ConditionChip, ConditionEditor, emptyAttr, useAttributeValues } from './AttrFilters'
import {
  ConditionIcon,
  ConnectionIcon,
  DownstreamIcon,
  EitherWayIcon,
  EquipmentIcon,
  MeasurementIcon,
  TrashIcon,
  UpstreamIcon,
} from './icons'
import { ResolveField } from './ResolveField'

/** Which attribute a new condition on this kind of card probably means. */
const DEFAULT_CONDITION: Record<string, AttributeName> = {
  entity: 'medium',
  related: 'medium',
  // The measurement card already has a picker for what is measured, so a
  // second condition on it is almost always about the unit.
  measurement: 'unit',
}

const DIRECTIONS: { value: Direction | null; label: string; hint: string; Icon: () => JSX.Element }[] = [
  { value: null, label: 'Either way', hint: 'Anything connected, whichever way it flows', Icon: EitherWayIcon },
  { value: 'downstream', label: 'Downstream', hint: 'What this feeds into', Icon: DownstreamIcon },
  { value: 'upstream', label: 'Upstream', hint: 'What feeds this', Icon: UpstreamIcon },
]

interface StepCardProps {
  node: QueryNode
  parent: QueryNode | null
  selected: boolean
  /** Equipment known to be in this plant, for the browse list. */
  suggestions: Ref[]
}

export function StepCard({ node, parent, selected, suggestions }: StepCardProps) {
  const { state, dispatch } = useQuery()
  // Which condition's editor is open, as "<stepId>:<index>".
  const [editing, setEditing] = useState<string | null>(null)

  const step = node.step
  const patch = (values: Partial<QueryStep>) =>
    dispatch({ type: 'update', id: step.id, patch: values })

  // On a measurement card, "what is measured" is promoted to the title, so it
  // must not also appear below as a chip.
  const measuredIndex =
    step.kind === 'measurement' ? step.attrs.findIndex((attr) => attr.name === 'quantity_kind') : -1
  const chips = node.conditions.filter(
    (condition) => condition.external || condition.index !== measuredIndex,
  )

  const stepOf = (id: string) => state.steps.find((candidate) => candidate.id === id) ?? null

  const patchCondition = (condition: Condition, values: Partial<AttrFilter>) => {
    const owner = stepOf(condition.stepId)
    if (!owner) return
    dispatch({
      type: 'update',
      id: owner.id,
      patch: withAttrPatched(owner, condition.index, values),
    })
  }

  const removeCondition = (condition: Condition) => {
    const owner = stepOf(condition.stepId)
    if (!owner) return
    setEditing(null)
    // An emptied where() step would keep narrowing nothing while cluttering
    // the generated query, so it goes with its last condition.
    if (condition.external && owner.attrs.length === 1) {
      dispatch({ type: 'remove', id: owner.id })
      return
    }
    dispatch({ type: 'update', id: owner.id, patch: withoutAttr(owner, condition.index) })
  }

  const addCondition = () => {
    patch(withAttr(step, emptyAttr(DEFAULT_CONDITION[step.kind] ?? 'medium')))
    setEditing(`${step.id}:${step.attrs.length}`)
  }

  /** Add from this card, whatever is selected right now. */
  const addFromHere = (kind: 'related' | 'measurement') => {
    dispatch({ type: 'focus', alias: node.alias })
    dispatch({ type: 'add', kind })
  }

  const Icon = step.kind === 'entity' ? EquipmentIcon : step.kind === 'related' ? ConnectionIcon : MeasurementIcon
  const parentName = parent ? stepLabel(parent.step) ?? 'the step above' : null

  return (
    <div
      className={`qb-card qb-card-${step.kind}${selected ? ' is-selected' : ''}`}
      onClick={() => dispatch({ type: 'focus', alias: node.alias })}
      role="group"
      aria-label={stepLabel(step) ?? 'Unfinished step'}
    >
      <div className="qb-card-head">
        <span className="qb-badge">
          <Icon />
        </span>

        <div className="qb-card-title">
          {step.kind === 'measurement' ? (
            <MeasuredPicker step={step} onPatch={patch} />
          ) : (
            <ResolveField
              value={step.instance ?? step.cls ?? null}
              kind="class"
              suggestions={suggestions}
              // Only ever true on mount, i.e. on a card just added: the
              // cursor lands where the user has to type next.
              autoFocus={!step.cls && !step.instance}
              placeholder={step.kind === 'entity' ? 'pump, tank, RO…' : 'any equipment'}
              onResolved={(ref: Ref, kind: ResolveKind) => patch(withResolved(ref, kind === 'entity'))}
              onCleared={() => patch({ cls: null, instance: null })}
            />
          )}
          {/* The kind of thing this is. What it hangs off is written on the
              line above it, so repeating it here would just be noise. */}
          <span className="qb-card-role">
            {step.kind === 'entity' && 'Equipment in the plant'}
            {step.kind === 'related' && 'Connected equipment'}
            {step.kind === 'measurement' && `Readings from ${parentName ?? 'anything'}`}
          </span>
        </div>

        <button
          type="button"
          className="qb-icon-button qb-remove"
          title="Remove this step and anything built on it"
          onClick={(event) => {
            event.stopPropagation()
            dispatch({ type: 'remove', id: step.id })
          }}
        >
          <TrashIcon />
        </button>
      </div>

      {step.kind === 'related' && (
        <div className="qb-segmented" role="group" aria-label="Which way the flow runs">
          {DIRECTIONS.map(({ value, label, hint, Icon: DirectionIcon }) => (
            <button
              key={label}
              type="button"
              title={hint}
              className={(step.direction ?? null) === value ? 'is-on' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                patch({ direction: value })
              }}
            >
              <DirectionIcon />
              {label}
            </button>
          ))}
        </div>
      )}

      {(chips.length > 0 || selected) && (
        // Clicks inside the card's own controls must not bubble up to the
        // card's select handler: it would run *after* the control's own
        // dispatch and move the selection back onto this card.
        <div className="qb-conditions" onClick={(event) => event.stopPropagation()}>
          {chips.map((condition) => {
            const key = `${condition.stepId}:${condition.index}`
            return (
              <ConditionChip
                key={key}
                attr={condition.attr}
                active={editing === key}
                onEdit={() => setEditing(editing === key ? null : key)}
                onRemove={() => removeCondition(condition)}
              />
            )
          })}
        </div>
      )}

      {chips.map((condition) => {
        const key = `${condition.stepId}:${condition.index}`
        if (editing !== key) return null
        return (
          <div key={key} onClick={(event) => event.stopPropagation()}>
            <ConditionEditor
              attr={condition.attr}
              onChange={(values) => patchCondition(condition, values)}
              onDone={() => setEditing(null)}
            />
          </div>
        )
      })}

      {selected && (
        <div className="qb-actions" onClick={(event) => event.stopPropagation()}>
          {/* A measurement is the end of a chain: nothing connects to a
              reading, so those actions are not offered there. */}
          {step.kind !== 'measurement' && (
            <>
              <button type="button" className="qb-action" onClick={() => addFromHere('related')}>
                <ConnectionIcon />
                Follow a connection
              </button>
              <button type="button" className="qb-action" onClick={() => addFromHere('measurement')}>
                <MeasurementIcon />
                Get measurements
              </button>
            </>
          )}
          <button type="button" className="qb-action" onClick={addCondition}>
            <ConditionIcon />
            Add a condition
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * What a measurement card measures, promoted from a condition to the title.
 *
 * "Pressure" is the thing an operator came here for; making them pick
 * *attribute → what is measured → Pressure* buries it three clicks deep.
 * It is still an ordinary `quantity_kind` filter underneath.
 */
function MeasuredPicker({
  step,
  onPatch,
}: {
  step: QueryStep
  onPatch: (patch: Partial<QueryStep>) => void
}) {
  const values = useAttributeValues('quantity_kind')
  const index = step.attrs.findIndex((attr) => attr.name === 'quantity_kind')
  const current = index === -1 ? '' : step.attrs[index]?.value.id ?? ''

  return (
    <select
      className="qb-title-select"
      aria-label="What is measured"
      value={current}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const chosen = values.find((value) => value.id === event.target.value)
        if (!chosen) {
          if (index !== -1) onPatch(withoutAttr(step, index))
          return
        }
        onPatch(
          index === -1
            ? withAttr(step, { name: 'quantity_kind', value: chosen, negated: false })
            : withAttrPatched(step, index, { value: chosen }),
        )
      }}
    >
      <option value="">Everything measured</option>
      {values.map((value) => (
        <option key={value.id} value={value.id}>
          {value.label}
        </option>
      ))}
    </select>
  )
}
