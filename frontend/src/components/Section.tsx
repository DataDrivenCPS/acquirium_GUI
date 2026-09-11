/**
 * One band of the query tab.
 *
 * Build, what it matches, and the readings are three stages of one job, so
 * they are stacked in one place rather than hidden behind tabs from each
 * other -- an operator should be able to change a step and watch the rows
 * change without navigating. Each band collapses so the dock is never a
 * scroll, and the header carries a summary (a row count, an error) that
 * stays readable while collapsed.
 */

import type { ReactNode } from 'react'

import { ChevronDownIcon, ChevronRightIcon } from './icons'

interface SectionProps {
  title: string
  /** Short status shown beside the title, e.g. "3 rows". */
  summary?: ReactNode
  /** Controls that belong to this band, e.g. the row-count picker. */
  actions?: ReactNode
  open: boolean
  onToggle: () => void
  /** A band that fills the space left over, rather than its content's height. */
  grow?: boolean
  children: ReactNode
}

export function Section({
  title,
  summary,
  actions,
  open,
  onToggle,
  grow = false,
  children,
}: SectionProps) {
  return (
    <section className={`section${open ? ' is-open' : ''}${grow ? ' is-grow' : ''}`}>
      <header className="section-header">
        <button
          type="button"
          className="section-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <span className="section-title">{title}</span>
          {summary && <span className="section-summary">{summary}</span>}
        </button>
        {/* Stays reachable while the band is collapsed: the row count is
            worth changing without expanding a table to do it. */}
        {actions && <div className="section-actions">{actions}</div>}
      </header>

      {open && <div className="section-body">{children}</div>}
    </section>
  )
}
