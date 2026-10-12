import type { QueryAttribute, QueryStep, StepKind } from '../../api/types'

// The step kinds in the "Add step" menu, with a one-line hint of what each does
export const STEP_KINDS: { kind: StepKind; hint: string }[] = [
  { kind: 'entity', hint: 'start at things of a class, e.g. "Pump"' },
  { kind: 'related', hint: 'hop to related things, e.g. a pump\'s outlet' },
  { kind: 'measurement', hint: 'attach measurement points (all streams if first)' },
  { kind: 'where', hint: 'filter an earlier node by its attributes' },
  { kind: 'include', hint: 'add output columns, e.g. unit' },
]

// A new, empty step of the given kind. Blank fields mean "Acquirium's default".
export function newStep(kind: StepKind): QueryStep {
  switch (kind) {
    case 'entity':
      return { kind, cls: '', uri: '', alias: '', filters: [] }
    case 'related':
      return { kind, cls: '', uri: '', alias: '', frm: '', via: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'measurement':
      return { kind, frm: '', alias: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'where':
      return { kind, target: '', filters: [] }
    case 'include':
      return { kind, names: [], of: '', required: false }
  }
}

// The attributes worth offering in a step's filter menu. entity/related steps match entities and
// measurement steps match data (measurement) nodes; a where step can target either, so it gets all.
export function attributesFor(kind: StepKind, attributes: QueryAttribute[]): QueryAttribute[] {
  if (kind === 'entity' || kind === 'related') return attributes.filter((a) => a.roles.includes('entity'))
  if (kind === 'measurement') return attributes.filter((a) => a.roles.includes('data'))
  return attributes
}

// 'unit, medium ,' -> ['unit', 'medium']: the include step's names, as typed in one text box
export function parseNames(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

// A step being edited, with an id so React can tell steps apart when one is removed
export type DraftStep = { id: number; step: QueryStep }
