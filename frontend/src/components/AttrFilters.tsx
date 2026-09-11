/**
 * Conditions -- the `where(...)` vocabulary -- as chips you can read.
 *
 * A condition spends most of its life as a sentence fragment on a card
 * ("medium is Brine"), because that is the form a plant operator can check at
 * a glance. The three-control editor only appears for the one condition being
 * changed, and closes again afterwards.
 *
 * Values come from the server as labels ("Pressure", "bar"), so the user
 * never types or sees the underlying identifiers. This is the
 * browse-what-exists path, which matters because operators generally do not
 * know what to search for until they see the list.
 */

import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { ATTRIBUTE_NAMES } from '../api/types'
import type { AttrFilter, AttributeName, Ref } from '../api/types'
import { ATTRIBUTE_LABELS, attrSummary, isBlank } from '../state/attributes'
import { CloseIcon } from './icons'

interface ConditionChipProps {
  attr: AttrFilter
  /** True while this condition's editor is open. */
  active: boolean
  onEdit: () => void
  onRemove: () => void
}

/**
 * One condition, as a readable pill. Click it to change it.
 *
 * A condition with no value yet reads as the sentence it is on its way to
 * being -- "medium is …" -- rather than as "unfinished condition". The dashed
 * outline already says it is not narrowing anything; the words should say
 * what it will narrow, which is the part the user is mid-way through
 * answering.
 */
export function ConditionChip({ attr, active, onEdit, onRemove }: ConditionChipProps) {
  const blank = isBlank(attr)
  return (
    <span className={`qb-chip${active ? ' is-active' : ''}${blank ? ' is-blank' : ''}`}>
      <button type="button" className="qb-chip-label" onClick={onEdit}>
        {blank ? `${ATTRIBUTE_LABELS[attr.name]} ${attr.negated ? 'is not' : 'is'} …` : attrSummary(attr)}
      </button>
      <button type="button" className="qb-chip-remove" onClick={onRemove} title="Remove this condition">
        <CloseIcon />
      </button>
    </span>
  )
}

interface ConditionEditorProps {
  attr: AttrFilter
  onChange: (patch: Partial<AttrFilter>) => void
  onDone: () => void
  /** Abandon the condition entirely, rather than leave it half-written. */
  onRemove: () => void
}

/**
 * The three-control editor, opened for one condition at a time.
 *
 * It is laid out as the sentence it writes -- "only where / medium / is /
 * Brine" -- with the lead-in spelled out above the controls. Three bare
 * dropdowns in a row is a form; the same three under a sentence is a
 * sentence with blanks in it, and a plant operator can check the second one
 * at a glance.
 *
 * Picking a value closes the editor: for the overwhelmingly common
 * single-condition case that is the whole interaction, and there is nothing
 * left to confirm. "Done" stays for the case where the attribute or the
 * is/is-not was what changed.
 */
export function ConditionEditor({ attr, onChange, onDone, onRemove }: ConditionEditorProps) {
  const values = useAttributeValues(attr.name)

  return (
    <div className="qb-editor">
      <p className="qb-editor-lead">Only include ones where…</p>

      <div className="qb-editor-row">
        <select
          aria-label="What to check"
          value={attr.name}
          onChange={(event) =>
            // Changing the attribute invalidates the value picked for the old
            // one, so it is cleared rather than left mismatched.
            onChange({ name: event.target.value as AttributeName, value: { id: '', label: '' } })
          }
        >
          {ATTRIBUTE_NAMES.map((name) => (
            <option key={name} value={name}>
              {ATTRIBUTE_LABELS[name]}
            </option>
          ))}
        </select>

        <select
          aria-label="is or is not"
          value={attr.negated ? 'not' : 'is'}
          onChange={(event) => onChange({ negated: event.target.value === 'not' })}
        >
          <option value="is">is</option>
          <option value="not">is not</option>
        </select>

        <select
          aria-label="Value"
          value={attr.value.id}
          onChange={(event) => {
            const chosen = values.find((value) => value.id === event.target.value)
            if (!chosen) return
            onChange({ value: chosen })
            onDone()
          }}
        >
          <option value="">choose a value…</option>
          {values.map((value) => (
            <option key={value.id} value={value.id}>
              {value.label}
            </option>
          ))}
        </select>
      </div>

      <div className="qb-editor-actions">
        <button type="button" className="qb-action qb-action-quiet" onClick={onRemove}>
          Remove
        </button>
        <button type="button" className="qb-action" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

/** The values one attribute can take, fetched once per attribute name. */
export function useAttributeValues(attr: AttributeName): Ref[] {
  const [values, setValues] = useState<Ref[]>([])

  useEffect(() => {
    let cancelled = false
    api
      .attributeValues(attr)
      .then((result) => !cancelled && setValues(result))
      .catch(() => !cancelled && setValues([]))
    return () => {
      cancelled = true
    }
  }, [attr])

  return values
}

/**
 * A condition with nothing chosen yet.
 *
 * The caller passes the attribute a new condition on *this kind of card* most
 * likely means, so the common case takes one click instead of three.
 */
export function emptyAttr(name: AttributeName): AttrFilter {
  return { name, value: { id: '', label: '' }, negated: false }
}
