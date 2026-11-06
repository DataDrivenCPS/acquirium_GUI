import { useEffect, useId, useRef, useState } from 'react'
import { TONE_SUMMARY, worstTone } from './describe'
import StatusDot from './StatusDot'
import StatusRow from './StatusRow'
import { useStatusRows } from './useStatusRows'
import './StatusPanel.css'

// A small button in the page's top-right corner. Its dot shows the worst status of all the checks;
// clicking it drops down the full list, one row per part of the system, each re-checked every few seconds.
// Clicking the button again, pressing Escape, or clicking anywhere else closes the list.
// To add a check, see useStatusRows.ts.
function StatusPanel() {
  const rows = useStatusRows() // keeps polling while the list is closed, so the dot stays current
  const [open, setOpen] = useState(false)
  const listId = useId() // a page-unique id, so the button can say which element it opens
  // refs point at elements on the page once React has drawn them (null before that)
  const panelRef = useRef<HTMLElement>(null) // the button and the list, to tell clicks inside from clicks outside
  const buttonRef = useRef<HTMLButtonElement>(null)

  const tone = worstTone(rows.map((row) => row.tone))
  const summary = `Status: ${TONE_SUMMARY[tone]}` // e.g. "Status: all good"

  // While the list is open, listen to the whole page for Escape and for clicks outside the panel
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      // event.target is typed loosely as EventTarget; on a page it is always a Node, which contains() needs
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus() // puts keyboard users back on the button they opened the list from
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      // React runs this when the list closes (or the panel leaves the page), so the listeners go too
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open]) // re-run whenever the list opens or closes

  return (
    <aside ref={panelRef} className="status-panel" aria-label="System status">
      {/* aria-label adds the summary to what screen readers announce; title shows it on hover */}
      <button
        ref={buttonRef}
        type="button"
        className="status-toggle"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={summary}
        title={summary}
        onClick={() => setOpen(!open)}
      >
        <StatusDot tone={tone} />
        Status
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {/* hidden, not removed, like the windows' contents */}
      <ul id={listId} className="status-list" hidden={!open}>
        {rows.map((row) => (
          // key tells React which row is which between redraws; every label is unique
          <StatusRow key={row.label} {...row} />
        ))}
      </ul>
    </aside>
  )
}

export default StatusPanel
