import { useState } from 'react'
import type {
  Direction,
  EntityStep,
  IncludeStep,
  MeasurementStep,
  QueryAttribute,
  QueryStep,
  RelatedStep,
  WhereStep,
} from '../../api/types'
import { CheckboxField, NumberField, type Option, SelectField, TextField } from './fields'
import FilterList from './FilterList'
import { attributesFor, parseNames } from './steps'

const DIRECTIONS: Option<Direction | ''>[] = [
  { value: '', label: 'any' },
  { value: 'upstream', label: 'upstream' },
  { value: 'downstream', label: 'downstream' },
]

// The select can only hold strings, so null/true/false travel as '', 'yes', 'no'
type NearestChoice = '' | 'yes' | 'no'
const NEAREST: Option<NearestChoice>[] = [
  { value: '', label: 'default' },
  { value: 'yes', label: 'nearest only' },
  { value: 'no', label: 'all matches' },
]
const toChoice = (nearest: boolean | null): NearestChoice => (nearest === null ? '' : nearest ? 'yes' : 'no')
const fromChoice = (choice: NearestChoice): boolean | null => (choice === '' ? null : choice === 'yes')

// Props shared by the per-kind field sets below; S is that kind's step type
type FieldsProps<S> = { step: S; attributes: QueryAttribute[]; onChange: (step: S) => void }

function EntityFields({ step, attributes, onChange }: FieldsProps<EntityStep>) {
  return (
    <>
      <div className="query-fields">
        <TextField label="Class" value={step.cls} placeholder="e.g. Pump" onChange={(cls) => onChange({ ...step, cls })} />
        <TextField label="URI" value={step.uri} placeholder="one specific thing" onChange={(uri) => onChange({ ...step, uri })} />
        <TextField label="Alias" value={step.alias} placeholder="name for later steps" onChange={(alias) => onChange({ ...step, alias })} />
      </div>
      <FilterList filters={step.filters} attributes={attributes} onChange={(filters) => onChange({ ...step, filters })} />
    </>
  )
}

function RelatedFields({ step, attributes, onChange }: FieldsProps<RelatedStep>) {
  return (
    <>
      <div className="query-fields">
        <TextField label="Class" value={step.cls} placeholder="e.g. outlet connection point" onChange={(cls) => onChange({ ...step, cls })} />
        <TextField label="URI" value={step.uri} onChange={(uri) => onChange({ ...step, uri })} />
        <TextField label="Alias" value={step.alias} onChange={(alias) => onChange({ ...step, alias })} />
        <TextField label="From alias" value={step.frm} placeholder="previous step" onChange={(frm) => onChange({ ...step, frm })} />
        <TextField label="Via" value={step.via} placeholder="any predicate" onChange={(via) => onChange({ ...step, via })} />
        <SelectField label="Direction" value={step.direction} options={DIRECTIONS} onChange={(direction) => onChange({ ...step, direction })} />
        <NumberField label="Max depth" value={step.max_depth} placeholder="3" onChange={(max_depth) => onChange({ ...step, max_depth })} />
        <SelectField label="Nearest" value={toChoice(step.nearest)} options={NEAREST} onChange={(c) => onChange({ ...step, nearest: fromChoice(c) })} />
      </div>
      <FilterList filters={step.filters} attributes={attributes} onChange={(filters) => onChange({ ...step, filters })} />
    </>
  )
}

function MeasurementFields({ step, attributes, onChange }: FieldsProps<MeasurementStep>) {
  return (
    <>
      <div className="query-fields">
        <TextField label="From alias" value={step.frm} placeholder="previous step, or * for all" onChange={(frm) => onChange({ ...step, frm })} />
        <TextField label="Alias" value={step.alias} onChange={(alias) => onChange({ ...step, alias })} />
        <SelectField label="Direction" value={step.direction} options={DIRECTIONS} onChange={(direction) => onChange({ ...step, direction })} />
        <NumberField label="Max depth" value={step.max_depth} placeholder="3" onChange={(max_depth) => onChange({ ...step, max_depth })} />
        <SelectField label="Nearest" value={toChoice(step.nearest)} options={NEAREST} onChange={(c) => onChange({ ...step, nearest: fromChoice(c) })} />
      </div>
      <FilterList filters={step.filters} attributes={attributes} onChange={(filters) => onChange({ ...step, filters })} />
    </>
  )
}

function WhereFields({ step, attributes, onChange }: FieldsProps<WhereStep>) {
  return (
    <>
      <div className="query-fields">
        <TextField label="Target alias" value={step.target} placeholder="previous step" onChange={(target) => onChange({ ...step, target })} />
      </div>
      <FilterList filters={step.filters} attributes={attributes} onChange={(filters) => onChange({ ...step, filters })} />
    </>
  )
}

function IncludeFields({ step, onChange }: FieldsProps<IncludeStep>) {
  // The box keeps exactly what was typed (e.g. a trailing comma mid-typing); the step gets the parsed list
  const [namesText, setNamesText] = useState(step.names.join(', '))
  return (
    <div className="query-fields">
      <TextField
        label="Columns"
        value={namesText}
        placeholder="e.g. unit, medium"
        onChange={(text) => {
          setNamesText(text)
          onChange({ ...step, names: parseNames(text) })
        }}
      />
      <TextField label="Of alias" value={step.of} placeholder="previous step" onChange={(of) => onChange({ ...step, of })} />
      <CheckboxField label="Required" checked={step.required} onChange={(required) => onChange({ ...step, required })} />
    </div>
  )
}

type StepEditorProps = {
  step: QueryStep
  number: number // position in the query, counting from 1
  attributes: QueryAttribute[]
  onChange: (step: QueryStep) => void
  onRemove: () => void
}

// One step of the query builder: a box titled with its number and kind, holding that kind's fields
function StepEditor({ step, number, attributes, onChange, onRemove }: StepEditorProps) {
  const offered = attributesFor(step.kind, attributes)
  return (
    // a fieldset groups related inputs; its legend names the group
    <fieldset className="query-step">
      <legend>
        {number}. {step.kind}
      </legend>
      {/* checking step.kind narrows the union type, so each field set gets its exact step type */}
      {step.kind === 'entity' && <EntityFields step={step} attributes={offered} onChange={onChange} />}
      {step.kind === 'related' && <RelatedFields step={step} attributes={offered} onChange={onChange} />}
      {step.kind === 'measurement' && <MeasurementFields step={step} attributes={offered} onChange={onChange} />}
      {step.kind === 'where' && <WhereFields step={step} attributes={offered} onChange={onChange} />}
      {step.kind === 'include' && <IncludeFields step={step} attributes={offered} onChange={onChange} />}
      <button type="button" className="query-step-remove" onClick={onRemove}>
        Remove step {number}
      </button>
    </fieldset>
  )
}

export default StepEditor
