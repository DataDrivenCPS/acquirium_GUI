/**
 * Attribute vocabulary, in plain words.
 *
 * Split out of the pickers so anything that needs to *say* what a condition
 * means -- the chips, the plain-English readback -- can do it without
 * importing a React component.
 */

import type { AttrFilter, AttributeName } from '../api/types'

/** Attribute names as an operator would say them. */
export const ATTRIBUTE_LABELS: Record<AttributeName, string> = {
  type: 'kind of equipment',
  process: 'process stage',
  cp_type: 'connection point',
  medium: 'medium',
  substance: 'substance',
  quantity_kind: 'what is measured',
  unit: 'unit',
  enumeration_kind: 'enumeration',
  data_source: 'data source',
}

/** "medium is Brine". The one phrasing, used by chips and by the sentence. */
export function attrSummary(attr: AttrFilter): string {
  return `${ATTRIBUTE_LABELS[attr.name]} ${attr.negated ? 'is not' : 'is'} ${attr.value.label}`
}

/** A condition the user started but has not finished choosing a value for. */
export function isBlank(attr: AttrFilter): boolean {
  return !attr.value.id
}
