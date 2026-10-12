// Small labeled form controls for the query builder. Each wraps its input in a <label>, so the
// label text is the input's accessible name (screen readers announce it; tests find inputs by it).

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

type NumberFieldProps = {
  label: string
  value: number | null // null = empty box = Acquirium's default
  onChange: (value: number | null) => void
  placeholder?: string
}

export function NumberField({ label, value, onChange, placeholder }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    </label>
  )
}

// One choice in a SelectField: the value it stands for, and the text shown for it
export type Option<V extends string> = { value: V; label: string }

type SelectFieldProps<V extends string> = {
  label: string
  value: V
  options: Option<V>[]
  onChange: (value: V) => void
}

export function SelectField<V extends string>({ label, value, options, onChange }: SelectFieldProps<V>) {
  return (
    <label className="field">
      <span>{label}</span>
      {/* the browser hands back the chosen option's value as a plain string; it is one of ours */}
      <select value={value} onChange={(event) => onChange(event.target.value as V)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

type CheckboxFieldProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="field field--inline">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
