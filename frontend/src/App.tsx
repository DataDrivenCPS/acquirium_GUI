/**
 * The app shell: one workspace, not four panes.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Acquirium                  [status]  [⚙]     │
 *   ├──────────────────────────────────────────────┤
 *   │ Show me every Pump…            [Undo][Start] │  query bar
 *   │ ┌────────────┐                               │
 *   │ │ ▤ Query    │                               │
 *   │ │ ⟨⟩ Python  │        THE PLANT              │  the graph is the
 *   │ │ ▭ Ask      │        (the workspace)        │  workspace, and fills
 *   │ │            │                        [tools]│  the window
 *   │ └────────────┘                               │
 *   └──────────────────────────────────────────────┘
 *
 * The plant graph is the thing an operator recognises on sight, so it gets
 * the window and everything else floats over it in a collapsible dock. The
 * two panels that used to be permanently on screen but rarely wanted --
 * the generated query and the plain-English placeholder -- are tabs now,
 * costing nothing until they are asked for.
 *
 * "Query" is one tab holding three bands -- build, what it matches, the
 * readings -- because they are one task: change a step, watch the rows
 * change. Splitting them across tabs hid exactly that.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'

import { Dock } from './components/Dock'
import type { TabId } from './components/Dock'
import { QueryBar } from './components/QueryBar'
import { SettingsIcon } from './components/icons'
import { GeneratedQueryPanel } from './panels/GeneratedQueryPanel'
import { GraphPanel } from './panels/GraphPanel'
import { LlmPanel } from './panels/LlmPanel'
import { QueryPanel } from './panels/QueryPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { QueryProvider, useQuery } from './state/QueryContext'

export default function App() {
  return (
    <QueryProvider>
      <Shell />
    </QueryProvider>
  )
}

function Shell() {
  const { health, metadata } = useQuery()
  const [tab, setTab] = useState<TabId>('query')
  const [dockOpen, setDockOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const rows = metadata.data?.rows.length ?? 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Acquirium</h1>
        <div className="app-header-right">
          <ConnectionNote />
          <button
            type="button"
            className="icon-button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
            Settings
          </button>
        </div>
      </header>

      {/* The stage holds the plant and the query bar, and steps aside for
          the dock so the plant is never drawn underneath it. */}
      <main
        className="workspace"
        // Matches the dock's own width in each state, so the plant is never
        // fitted into space the dock is sitting on.
        style={{ '--dock-inset': dockOpen ? '462px' : '148px' } as CSSProperties}
      >
        <div className="stage">
          <GraphPanel />
          <QueryBar />
        </div>

        <Dock
          active={tab}
          onSelect={setTab}
          open={dockOpen}
          onToggle={() => setDockOpen((open) => !open)}
          badges={{ query: rows ? String(rows) : undefined }}
        >
          {tab === 'query' && <QueryPanel />}
          {tab === 'python' && <GeneratedQueryPanel />}
          {tab === 'ask' && <LlmPanel />}
        </Dock>
      </main>

      {settingsOpen && (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}

      {health === null && (
        <p className="status status-error app-error" role="alert">
          Cannot reach the backend. Start it with: python -m acquirium_gui --port 5002
        </p>
      )}
    </div>
  )
}

/**
 * Says plainly whether this is a real plant or sample data.
 *
 * Worth a permanent spot in the header: an operator looking at fixture
 * readings and believing they are their own plant's is the worst failure this
 * app could have.
 */
function ConnectionNote() {
  const { health } = useQuery()
  if (!health) return null
  return (
    <span className={health.acquirium_connected ? 'badge' : 'badge badge-warn'}>
      {health.acquirium_connected ? 'Connected to Acquirium' : 'Sample data'}
    </span>
  )
}
