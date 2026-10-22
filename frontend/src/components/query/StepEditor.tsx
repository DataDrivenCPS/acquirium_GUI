import { useEffect, type ReactNode } from 'react'
import type { Direction, Filter, QueryAttribute, QueryStep } from '../../api/types'

type StepEditorProps = {
  step: QueryStep
  number: number // 1-based position, shown in the legend
  attributes: QueryAttribute[] | null // null until loaded, or when they could not be loaded
  onChange: (step: QueryStep) => void
  onRemove: () => void
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function DirectionField({ value, onChange }: { value: Direction | ''; onChange: (value: Direction | '') => void }) {
  return (
    <label>
      Direction
      <select value={value} onChange={(event) => onChange(event.target.value as Direction | '')}>
        <option value="">default</option>
        <option value="upstream">upstream</option>
        <option value="downstream">downstream</option>
      </select>
    </label>
  )
}

function MaxDepthField({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label>
      Max depth
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    </label>
  )
}

// null means "use Acquirium's default", which is neither yes nor no
const NEAREST_VALUES = { '': null, yes: true, no: false } as const

function NearestField({ value, onChange }: { value: boolean | null; onChange: (value: boolean | null) => void }) {
  const current = value === null ? '' : value ? 'yes' : 'no'
  return (
    <label>
      Nearest
      <select value={current} onChange={(event) => onChange(NEAREST_VALUES[event.target.value as keyof typeof NEAREST_VALUES])}>
        <option value="">default</option>
        <option value="yes">yes</option>
        <option value="no">no</option>
      </select>
    </label>
  )
}

type FilterRowProps = {
  filter: Filter
  names: string[] // attribute names to choose from
  onChange: (filter: Filter) => void
  onRemove: () => void
}

function FilterRow({ filter, names, onChange, onRemove }: FilterRowProps) {
  // A filter added before the attribute list arrived has no attribute yet; give it the first one
  const first = names[0]
  useEffect(() => {
    if (!filter.attr && first) onChange({ ...filter, attr: first })
  }, [filter, first, onChange])

  return (
    <div className="filter-row">
      <label>
        Filter attribute
        <select value={filter.attr} onChange={(event) => onChange({ ...filter, attr: event.target.value })}>
          {names.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Filter value
        <input value={filter.value} onChange={(event) => onChange({ ...filter, value: event.target.value })} />
      </label>
      <label>
        <input type="checkbox" checked={filter.exclude} onChange={(event) => onChange({ ...filter, exclude: event.target.checked })} />
        Exclude
      </label>
      <button type="button" onClick={onRemove}>Remove filter</button>
    </div>
  )
}

type FilterListProps = {
  filters: Filter[]
  attributes: QueryAttribute[] | null
  onChange: (filters: Filter[]) => void
}

function FilterList({ filters, attributes, onChange }: FilterListProps) {
  const names = (attributes ?? []).map((attribute) => attribute.name)
  return (
    <>
      {filters.map((filter, index) => (
        <FilterRow
          // filters have no id, and are only added at the end or removed, so the position identifies one
          key={index}
          filter={filter}
          names={names}
          onChange={(next) => onChange(filters.map((f, i) => (i === index ? next : f)))}
          onRemove={() => onChange(filters.filter((_, i) => i !== index))}
        />
      ))}
      <button
        type="button"
        disabled={attributes === null}
        onClick={() => onChange([...filters, { attr: names[0] ?? '', value: '', exclude: false }])}
      >
        Add filter
      </button>
    </>
  )
}

// The form for one step, with a button to remove it
function StepEditor({ step, number, attributes, onChange, onRemove }: StepEditorProps) {
  // Replaces some fields of this step. The cast is safe: every patch below only names fields of this step's own kind.
  const set = (patch: Partial<QueryStep>) => onChange({ ...step, ...patch } as QueryStep)
  const filters = (): ReactNode =>
    'filters' in step && <FilterList filters={step.filters} attributes={attributes} onChange={(next) => set({ filters: next })} />

  return (
    <fieldset className="step">
      <legend>{`Step ${number}: ${step.kind}`}</legend>
      <div className="step-fields">
        {(step.kind === 'entity' || step.kind === 'related') && (
          <>
            <TextField label="Class" value={step.cls} onChange={(cls) => set({ cls })} />
            <TextField label="URI" value={step.uri} onChange={(uri) => set({ uri })} />
            <TextField label="Alias" value={step.alias} onChange={(alias) => set({ alias })} />
          </>
        )}
        {step.kind === 'related' && (
          <>
            <TextField label="From alias" value={step.frm} onChange={(frm) => set({ frm })} />
            <TextField label="Via" value={step.via} onChange={(via) => set({ via })} />
          </>
        )}
        {step.kind === 'measurement' && (
          <>
            <TextField label="From alias" value={step.frm} onChange={(frm) => set({ frm })} />
            <TextField label="Alias" value={step.alias} onChange={(alias) => set({ alias })} />
          </>
        )}
        {(step.kind === 'related' || step.kind === 'measurement') && (
          <>
            <DirectionField value={step.direction} onChange={(direction) => set({ direction })} />
            <MaxDepthField value={step.max_depth} onChange={(max_depth) => set({ max_depth })} />
            <NearestField value={step.nearest} onChange={(nearest) => set({ nearest })} />
          </>
        )}
        {step.kind === 'where' && <TextField label="Apply to alias" value={step.target} onChange={(target) => set({ target })} />}
        {step.kind === 'refocus' && <TextField label="Alias" value={step.alias} onChange={(alias) => set({ alias })} />}
      </div>
      {filters()}
      <button type="button" onClick={onRemove}>Remove step</button>
    </fieldset>
  )
}

export default StepEditor
