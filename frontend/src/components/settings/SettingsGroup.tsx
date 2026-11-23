import { useId, useState, type ReactNode } from 'react'

type Props = { title: string; startsOpen: boolean; children: ReactNode }

// A bar with a title that expands and collapses the settings under it. Collapsed settings are hidden, not removed.
function SettingsGroup({ title, startsOpen, children }: Props) {
  const [open, setOpen] = useState(startsOpen)
  const bodyId = useId()
  return (
    <section className="settings-group">
      <button type="button" className="settings-bar" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {title}
      </button>
      <div id={bodyId} className="settings-body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}

export default SettingsGroup
