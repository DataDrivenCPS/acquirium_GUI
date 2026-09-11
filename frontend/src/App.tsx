/**
 * The app shell: one workspace, not four panes.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Acquirium                  [status]  [⚙]     │
 *   ├──────────────────────────────────────────────┤
 *   │ ┌─────────────────┐ Show me every Pump…      │
 *   │ │ ▤Query ⟨⟩Python │                          │
 *   │ ├─────────────────┤        THE PLANT         │  the graph is the
 *   │ │                 │     (the workspace)      │  workspace, and fills
 *   │ │                 ┆                   [tools]│  the window
 *   │ └─────────────────┴──────────────────────────┘
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
 *
 * How much of the window the dock takes is the user's call (the `┆` above is
 * the drag handle), so the width lives here: the dock is sized by it and the
 * stage is inset by it, and the two must not be able to disagree.
 */

import { useEffect, useState } from 'react'
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

/** The gap the dock floats in, left and right of it. Matches `.dock` in CSS. */
const DOCK_MARGIN = 10

const DOCK_DEFAULT_WIDTH = 420
const DOCK_MIN_WIDTH = 300
const DOCK_MAX_WIDTH = 820
/** However wide the dock gets, this much window is still the plant's. */
const STAGE_MIN_WIDTH = 260

const WIDTH_KEY = 'acquirium.dockWidth'

/**
 * Keep the dock between "a card still fits" and "the plant is still there".
 *
 * The upper bound is the window's, not a constant: a fixed maximum that is
 * fine on a desktop hides the whole plant on a laptop, and a dock the user
 * cannot see past is the one state this layout exists to avoid.
 */
function clampWidth(width: number): number {
  const room = window.innerWidth - STAGE_MIN_WIDTH - DOCK_MARGIN * 2
  const max = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, room))
  return Math.round(Math.min(max, Math.max(DOCK_MIN_WIDTH, width)))
}

/** Last session's width, if it is still sensible on this window. */
function storedWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(saved) && saved > 0) return clampWidth(saved)
  } catch {
    // Private browsing, or storage turned off. A default is fine.
  }
  return clampWidth(DOCK_DEFAULT_WIDTH)
}

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
  const [dockWidth, setDockWidth] = useState(storedWidth)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const rows = metadata.data?.rows.length ?? 0

  const resizeDock = (width: number) => setDockWidth(clampWidth(width))

  // Remembered across sessions: it is a preference about how this operator
  // works, not about the query they happen to have open.
  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(dockWidth))
    } catch {
      // Nothing to do, and nothing worth telling the user about.
    }
  }, [dockWidth])

  // A window narrowed past the dock would otherwise leave no plant at all.
  useEffect(() => {
    const onResize = () => setDockWidth((width) => clampWidth(width))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
          the dock so the plant is never drawn underneath it. Collapsed, the
          dock is a small strip in the corner and the plant takes it all. */}
      <main
        className="workspace"
        style={
          {
            '--dock-inset': dockOpen ? `${dockWidth + DOCK_MARGIN * 2}px` : '0px',
          } as CSSProperties
        }
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
          width={dockWidth}
          onResize={resizeDock}
          onResetWidth={() => resizeDock(DOCK_DEFAULT_WIDTH)}
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
