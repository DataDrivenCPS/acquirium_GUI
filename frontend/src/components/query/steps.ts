import type { EntityStep, QueryStep, RelatedStep, StepKind } from '../../api/types'

// The steps the builder has a button for (include steps are still understood by the backend)
export type BuilderKind = Exclude<StepKind, 'include'>

// A new, blank step. A where step starts with one filter on `attr`, since it needs at least one.
export function newStep(kind: BuilderKind, attr = ''): QueryStep {
  switch (kind) {
    case 'entity':
      return { kind, cls: '', uri: '', alias: '', filters: [] }
    case 'related':
      return { kind, cls: '', uri: '', alias: '', frm: '', via: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'measurement':
      return { kind, frm: '', alias: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'where':
      return { kind, target: '', filters: [{ attr, value: '', exclude: false }] }
    case 'refocus':
      return { kind, alias: '' }
  }
}

const usesClass = (step: QueryStep): step is EntityStep | RelatedStep => step.kind === 'entity' || step.kind === 'related'

// Replaces the class text `text` (as typed, ignoring surrounding spaces) with `uri` in every entity
// and related step that used it, and returns the new steps. Used when the user picks a candidate.
export function fillClass(steps: QueryStep[], text: string, uri: string): QueryStep[] {
  return steps.map((step) => (usesClass(step) && step.cls.trim() === text.trim() ? { ...step, cls: uri } : step))
}
