import type { Candidate, EntityStep, QueryStep, RelatedStep, StepKind } from '../../api/types'

// The steps the builder has a button for (include steps are still understood by the backend)
export type BuilderKind = Exclude<StepKind, 'include'>

// A new, blank step. A where step starts with one filter on `attr`, since it needs at least one.
export function newStep(kind: BuilderKind, attr = ''): QueryStep {
  switch (kind) {
    case 'entity':
      return { kind, cls: '', cls_uri: '', uri: '', alias: '', filters: [] }
    case 'related':
      return { kind, cls: '', cls_uri: '', uri: '', alias: '', frm: '', via: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'measurement':
      return { kind, frm: '', alias: '', direction: '', max_depth: null, nearest: null, filters: [] }
    case 'where':
      return { kind, target: '', filters: [{ attr, value: '', exclude: false }] }
    case 'refocus':
      return { kind, alias: '' }
  }
}

const usesClass = (step: QueryStep): step is EntityStep | RelatedStep => step.kind === 'entity' || step.kind === 'related'

// Shows the name of the node the user picked in every entity and related step that used the class text `text`
// (as typed, ignoring surrounding spaces), and remembers its identifier out of sight. Returns the new steps.
export function fillClass(steps: QueryStep[], text: string, picked: Candidate): QueryStep[] {
  return steps.map((step) =>
    usesClass(step) && step.cls.trim() === text.trim() ? { ...step, cls: picked.label, cls_uri: picked.uri } : step,
  )
}

// The steps as the backend takes them: a picked node's identifier runs as the class, and cls_uri is not sent
export function toRequest(steps: QueryStep[]): unknown[] {
  return steps.map((step) => {
    if (!usesClass(step)) return step
    const { cls_uri, ...rest } = step
    return { ...rest, cls: cls_uri || step.cls }
  })
}
