import { useEffect, useId, useRef, useState } from 'react'
import type { SettingsRange } from '../../api/types'
import type { FieldSpec } from './fields'

type Props = {
  spec: FieldSpec
  value: number // what is saved or being saved
  defaultValue: number
  range: SettingsRange
  onChange: (value: number) => void // called only with a valid number
  onReset: () => void
  onValidityChange: (valid: boolean) => void // told whenever the box becomes valid or invalid, so the window can say what is not saved
}

// A valid entry: a number in range, and a whole number for whole-number settings
function parse(text: string, range: SettingsRange, integer: boolean): number | null {
  if (text.trim() === '') return null
  const number = Number(text)
  if (!Number.isFinite(number) || number < range.min || number > range.max) return null
  if (integer && !Number.isInteger(number)) return null
  return number
}

// One setting: its name, description, a number box (and a slider for scores), a Reset when it differs from the default.
// The box keeps what the person typed, even while it is not valid yet; only valid numbers are passed on to be saved.
function SettingField({ spec, value, defaultValue, range, onChange, onReset, onValidityChange }: Props) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const invalid = parse(text, range, spec.integer) === null

  // Report validity only when it changes (the callback is kept in a ref because the parent makes a new one on every render).
  // On the way out, report valid so a removed field never leaves the window stuck on "Not saved".
  const report = useRef(onValidityChange)
  report.current = onValidityChange
  useEffect(() => {
    report.current(!invalid)
  }, [invalid])
  useEffect(() => () => report.current(true), [])

  // When the value changes from outside (Reset, or the backend's answer), show it. React lets a component
  // adjust its own state while rendering, which avoids an extra render after the screen has been drawn.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (parse(text, range, spec.integer) !== value) setText(String(value))
  }

  const edit = (next: string) => {
    setText(next)
    const valid = parse(next, range, spec.integer)
    if (valid !== null) onChange(valid)
  }

  return (
    <div className="settings-field">
      <div className="settings-field-head">
        <label htmlFor={id}>{spec.label}</label>
        <span className="settings-range">
          range {range.min} to {range.max}
        </span>
      </div>
      <p className="settings-help">{spec.description}</p>
      <div className="settings-control">
        {spec.slider && (
          <input
            type="range"
            aria-label={`${spec.label} slider`}
            min={range.min}
            max={range.max}
            step={0.05}
            value={invalid ? value : Number(text)}
            onChange={(event) => edit(event.target.value)}
          />
        )}
        <input
          id={id}
          type="number"
          min={range.min}
          max={range.max}
          step={spec.integer ? 1 : 0.05}
          value={text}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => edit(event.target.value)}
        />
        {(value !== defaultValue || invalid) && (
          <button type="button" className="settings-reset" aria-label={`Reset ${spec.label}`} onClick={() => {
              setText(String(defaultValue)) // the saved value may already be the default, so the box would not resync by itself
              onReset()
            }}
          >
            Reset
          </button>
        )}
      </div>
      {invalid && (
        <div id={`${id}-error`} className="settings-error">
          Enter {spec.integer ? 'a whole number' : 'a value'} from {range.min} to {range.max}.
        </div>
      )}
    </div>
  )
}

export default SettingField
