import { type ReactNode, useId, useState } from 'react'
import type { Source } from '../../api/types'
import CollapseToggle from './CollapseToggle'
import './Window.css'

// Shown when a window's data is sample data, unless the window passes its own note
const DEFAULT_SAMPLE_NOTE = 'Acquirium has no live data for this yet, so these rows are made up. Live data replaces them automatically.'

type WindowProps = {
  title: string
  area: string // which cell of the operator grid this window fills (grid-template-areas in App.css)
  source?: Source // where the shown data came from; 'sample' adds a visible flag and note
  sampleNote?: string
  actions?: ReactNode // optional controls shown in the title bar, e.g. a Copy button
  children: ReactNode // ReactNode = anything React can render: elements, text, lists...
}

// One titled panel of the operator screen. Clicking the title collapses it to just its title bar.
function Window({ title, area, source, sampleNote = DEFAULT_SAMPLE_NOTE, actions, children }: WindowProps) {
  const [collapsed, setCollapsed] = useState(false)
  const bodyId = useId() // a page-unique id, so the toggle button can say which element it controls
  const isSample = source === 'sample'
  return (
    // aria-label names the region, so screen readers (and tests) can find a window by its title
    // window--<area> lets App.css style one window, e.g. cap the height of a long list
    <section
      className={`window window--${area}${collapsed ? ' window--collapsed' : ''}`}
      style={{ gridArea: area }}
      aria-label={title}
    >
      <header className="window-header">
        <h2>
          <CollapseToggle label={title} collapsed={collapsed} controls={bodyId} onToggle={() => setCollapsed(!collapsed)} />
        </h2>
        {/* the sample flag stays visible when collapsed, so hidden sample data is still flagged */}
        {isSample && <span className="sample-flag">Sample data</span>}
        {actions && <div className="window-actions">{actions}</div>}
      </header>
      {/* `hidden` only hides the contents; they stay on the page, so typed text, filters and polling survive a collapse */}
      {isSample && (
        <p className="sample-note" role="note" hidden={collapsed}>
          {sampleNote}
        </p>
      )}
      <div className="window-body" id={bodyId} hidden={collapsed}>
        {children}
      </div>
    </section>
  )
}

export default Window
