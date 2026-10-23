import type { Candidate, EntityStep, Filter, QueryStep, RelatedStep, StepKind } from '../../api/types'

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
      return { kind, target: '', filters: [{ attr, value: '', value_uri: '', exclude: false }] }
    case 'refocus':
      return { kind, alias: '' }
  }
}

const usesClass = (step: QueryStep): step is EntityStep | RelatedStep => step.kind === 'entity' || step.kind === 'related'

// Shows the name of the node the user picked where the text `text` failed to match, and remembers its
// identifier out of sight. `field` says where it was typed: 'class' (the Class box of entity and related
// steps), or the attribute of a filter, in which case only filters on that attribute are filled. Every
// place that holds exactly that text (ignoring surrounding spaces) is filled. Returns the new steps.
export function fillPick(steps: QueryStep[], text: string, field: string | null, picked: Candidate): QueryStep[] {
  const same = (value: string) => value.trim() === text.trim()
  return steps.map((step) => {
    if ((field ?? 'class') === 'class') {
      return usesClass(step) && same(step.cls) ? { ...step, cls: picked.label, cls_uri: picked.uri } : step
    }
    if (!('filters' in step)) return step
    const filters = step.filters.map((f) => (f.attr === field && same(f.value) ? { ...f, value: picked.label, value_uri: picked.uri } : f))
    return { ...step, filters }
  })
}

// The steps as the backend takes them: a picked node's identifier runs in place of the text shown, and
// cls_uri and value_uri are not sent
export function toRequest(steps: QueryStep[]): unknown[] {
  return steps.map((step) => {
    const sent = 'filters' in step ? { ...step, filters: step.filters.map(sendFilter) } : step
    if (!usesClass(step)) return sent
    const { cls_uri, ...rest } = sent as typeof step
    return { ...rest, cls: cls_uri || step.cls }
  })
}

function sendFilter({ value_uri, ...rest }: Filter) {
  return { ...rest, value: value_uri || rest.value }
}
