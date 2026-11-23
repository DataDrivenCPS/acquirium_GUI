import { useEffect, useId, useRef, useState } from 'react'
import StatusDot from '../status/StatusDot'
import { GROUPS } from './fields'
import SettingField from './SettingField'
import SettingsGroup from './SettingsGroup'
import { useSettings, type SaveState } from './useSettings'
import './SettingsPanel.css'

// What the dot and the "Saved" line say for each save state
const SAVE_LABEL: Record<SaveState['state'], string> = { loading: 'Loading', saved: 'Saved', saving: 'Saving', error: 'Not saved' }
const SAVE_TONE = { loading: 'pending', saved: 'ok', saving: 'pending', error: 'error' } as const

// A button beside Status in the page header. Clicking it drops down one window of settings, grouped in
// collapsible bars. Every change is saved to the backend right away and applies to the next query.
// Clicking the button again, pressing Escape, or clicking anywhere else closes the window.
// To add a setting, see backend/src/settings.py and fields.ts.
function SettingsPanel() {
  const { payload, values, save, resets, change, resetOne, resetAll } = useSettings()
  const [open, setOpen] = useState(false)
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(new Set()) // fields whose box holds an unusable entry
  const windowId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // While the window is open, listen to the whole page for Escape and for clicks outside the panel
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  // An unusable entry is never sent, so "Saved" would be wrong while one is showing (the last valid value is what is saved)
  const hasInvalid = invalidFields.size > 0 && save.state !== 'loading'
  const label = hasInvalid ? 'Not saved' : SAVE_LABEL[save.state]
  const summary = `Settings: ${hasInvalid ? 'invalid' : label.toLowerCase()}` // the header button's name and tooltip
  const tone = hasInvalid ? 'error' : SAVE_TONE[save.state]
  const setValidity = (key: string, valid: boolean) =>
    setInvalidFields((current) => {
      if (current.has(key) === !valid) return current
      const next = new Set(current)
      if (valid) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside ref={panelRef} className="settings-panel" aria-label="Settings">
      <button
        ref={buttonRef}
        type="button"
        className="settings-toggle"
        aria-expanded={open}
        aria-controls={windowId}
        aria-label={summary}
        title={summary}
        onClick={() => setOpen(!open)}
      >
        <StatusDot tone={tone} />
        Settings
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {/* hidden, not removed, like the windows' contents */}
      <div id={windowId} className="settings-window" hidden={!open}>
        <div className="settings-head">
          <strong>Settings</strong>
          <span className="settings-saved" role="status">
            <StatusDot tone={tone} />
            {hasInvalid ? 'Invalid' : save.state === 'error' ? `Not saved: ${save.message}` : label}
          </span>
        </div>
        {payload && values ? (
          GROUPS.map((group) => (
            <SettingsGroup key={group.key} title={group.title} startsOpen={group.startsOpen}>
              {group.fields.map((spec) => {
                const section = values[group.key] as Record<string, number>
                const defaults = payload.defaults[group.key] as Record<string, number>
                const limits = payload.limits[group.key] as Record<string, { min: number; max: number }>
                return (
                  <SettingField
                    key={`${spec.name}-${resets}`} // a new key after Reset all, so a box holding an unusable entry starts over
                    spec={spec}
                    value={section[spec.name]}
                    defaultValue={defaults[spec.name]}
                    range={limits[spec.name]}
                    onChange={(value) => change(group.key, spec.name as never, value)}
                    onReset={() => resetOne(group.key, spec.name as never)}
                    onValidityChange={(valid) => setValidity(`${group.key}.${spec.name}`, valid)}
                  />
                )
              })}
            </SettingsGroup>
          ))
        ) : (
          <p className="settings-help settings-waiting">Waiting for the backend to start.</p>
        )}
        <div className="settings-foot">
          <button type="button" className="settings-button" onClick={resetAll} disabled={!payload}>
            Reset all to defaults
          </button>
        </div>
      </div>
    </aside>
  )
}

export default SettingsPanel
