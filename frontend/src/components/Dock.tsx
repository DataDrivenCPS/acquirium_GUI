/**
 * The dock: everything that is not the plant, behind tabs.
 *
 * The four-quadrant layout gave each panel a quarter of the window whether it
 * had anything to say or not, and left the plant graph -- the thing an
 * operator actually recognises -- in a corner. Here the graph is the
 * workspace and this floats over it: one tab visible at a time, collapsible
 * to a strip of icons when the plant needs the whole window.
 *
 * There are only three tabs, and that is the point. Building a query,
 * seeing what it matches and reading the data are one task, so they are one
 * tab with three bands; the other two are genuinely separate things a user
 * goes looking for.
 *
 * The tabs run **across the top** rather than down a side rail. A vertical
 * rail costs its own width for the whole height of the dock, which is width
 * the query builder's cards want and the tabs do not need -- three labels
 * fit one line.
 *
 * The dock's width is the user's to set, because what it should be depends
 * entirely on what they are doing: a deep query with nested cards wants a
 * wide dock, watching the plant highlight wants a narrow one. Dragging the
 * right edge sets it, and the workspace's inset follows so the plant is
 * still never fitted into space the dock is sitting on.
 *
 * Collapsing does not unmount the panels' content; it hides the dock body, so
 * a half-typed query or a fetched table is still there when it reopens.
 */

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

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
  /** One line saying what the tab is, for its tooltip. */
  hint: string
}

export const TABS: Tab[] = [
  { id: 'query', label: 'Query', Icon: BuildIcon, hint: 'Build a query, and see what it answers' },
  { id: 'python', label: 'Python', Icon: CodeIcon, hint: 'The same query, as Python' },
  { id: 'ask', label: 'Ask', Icon: ChatIcon, hint: 'Ask in plain English' },
]

/** How far one arrow-key press on the resize handle moves the edge. */
const KEYBOARD_STEP = 24

interface DockProps {
  active: TabId
  onSelect: (tab: TabId) => void
  open: boolean
  onToggle: () => void
  /** Current width in pixels. The caller clamps it. */
  width: number
  /** A new width, straight from the pointer -- clamping is the caller's. */
  onResize: (width: number) => void
  /** Back to the width the dock opens at. */
  onResetWidth: () => void
  /** Small counts shown on a tab, e.g. how many rows matched. */
  badges?: Partial<Record<TabId, string>>
  children: ReactNode
}

export function Dock({
  active,
  onSelect,
  open,
  onToggle,
  width,
  onResize,
  onResetWidth,
  badges = {},
  children,
}: DockProps) {
  const dock = useRef<HTMLDivElement | null>(null)

  /**
   * Drag the right edge.
   *
   * Pointer capture is what makes this survive the pointer outracing the
   * edge: without it the handle stops receiving moves the moment the cursor
   * leaves it, which at any real drag speed is immediately.
   */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const frame = dock.current
    if (!frame) return
    event.preventDefault()

    const handle = event.currentTarget
    const left = frame.getBoundingClientRect().left
    handle.setPointerCapture(event.pointerId)

    const move = (moved: globalThis.PointerEvent) => onResize(moved.clientX - left)
    const stop = () => {
      handle.releasePointerCapture(event.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      document.body.classList.remove('is-resizing')
    }

    document.body.classList.add('is-resizing')
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }

  return (
    <div
      ref={dock}
      className={`dock${open ? '' : ' is-collapsed'}`}
      // Only while open: collapsed, the strip is as wide as its tabs.
      style={open ? { width } : undefined}
    >
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
              // which is the only way back from the strip.
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
        <>
          <div className="dock-body" role="tabpanel">
            {children}
          </div>

          {/* A separator rather than a button: it has a value, a range and
              arrow keys, which is the whole interaction for anyone not
              using a pointer. */}
          <div
            className="dock-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Dock width"
            aria-valuenow={Math.round(width)}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
            onPointerDown={startResize}
            onDoubleClick={onResetWidth}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') onResize(width - KEYBOARD_STEP)
              else if (event.key === 'ArrowRight') onResize(width + KEYBOARD_STEP)
              else return
              event.preventDefault()
            }}
          />
        </>
      )}
    </div>
  )
}
