/**
 * The dock: everything that is not the plant, behind tabs.
 *
 * The four-quadrant layout gave each panel a quarter of the window whether it
 * had anything to say or not, and left the plant graph -- the thing an
 * operator actually recognises -- in a corner. Here the graph is the
 * workspace and this floats over it: one tab visible at a time, collapsible
 * to a rail of icons when the plant needs the whole window.
 *
 * There are only three tabs, and that is the point. Building a query,
 * seeing what it matches and reading the data are one task, so they are one
 * tab with three bands; the other two are genuinely separate things a user
 * goes looking for.
 *
 * Collapsing does not unmount the panels' content; it hides the dock body, so
 * a half-typed query or a fetched table is still there when it reopens.
 */

import type { ReactNode } from 'react'

import {
  BuildIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
} from './icons'

export type TabId = 'query' | 'python' | 'ask'

interface Tab {
  id: TabId
  label: string
  Icon: () => JSX.Element
  /** One line saying what the tab is, for its tooltip and the collapsed rail. */
  hint: string
}

export const TABS: Tab[] = [
  { id: 'query', label: 'Query', Icon: BuildIcon, hint: 'Build a query, and see what it answers' },
  { id: 'python', label: 'Python', Icon: CodeIcon, hint: 'The same query, as Python' },
  { id: 'ask', label: 'Ask', Icon: ChatIcon, hint: 'Ask in plain English' },
]

interface DockProps {
  active: TabId
  onSelect: (tab: TabId) => void
  open: boolean
  onToggle: () => void
  /** Small counts shown on a tab, e.g. how many rows matched. */
  badges?: Partial<Record<TabId, string>>
  children: ReactNode
}

export function Dock({ active, onSelect, open, onToggle, badges = {}, children }: DockProps) {
  return (
    <div className={`dock${open ? '' : ' is-collapsed'}`}>
      <div className="dock-tabs" role="tablist" aria-label="Query tools">
        {TABS.map(({ id, label, Icon, hint }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={open && active === id}
            className={`dock-tab${open && active === id ? ' is-active' : ''}`}
            title={hint}
            onClick={() => {
              // Clicking a tab while collapsed opens the dock on that tab,
              // which is the only way back from the rail.
              if (!open || active !== id) onSelect(id)
              if (!open) onToggle()
            }}
          >
            <Icon />
            <span className="dock-tab-label">{label}</span>
            {badges[id] && <span className="dock-badge">{badges[id]}</span>}
          </button>
        ))}

        <button
          type="button"
          className="dock-collapse"
          title={open ? 'Collapse, and give the plant the whole window' : 'Open the tools'}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </button>
      </div>

      {open && (
        <div className="dock-body" role="tabpanel">
          {children}
        </div>
      )}
    </div>
  )
}
