import type { ReactNode } from 'react'

interface PanelProps {
  /**
   * Optional: a panel inside the dock is already named by its tab, and
   * repeating the name costs a header's worth of the height the builder
   * wants. Omitting it drops the header entirely.
   */
  title?: string
  /** One line under the title saying what this panel is for. */
  subtitle?: string
  /** Buttons for the panel header. */
  actions?: ReactNode
  children: ReactNode
}

/** A titled box: a dock tab's content, or a section under one. */
export function Panel({ title, subtitle, actions, children }: PanelProps) {
  const header = title || subtitle || actions

  return (
    <section className="panel">
      {header && (
        <header className="panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}

/**
 * Whatever the panel has to say instead of content: loading, an error, or a
 * reason there is nothing to show.
 *
 * The brief asks that an empty result read as a message rather than a crash
 * or a blank grid, so panels route all three through here.
 */
export function PanelStatus({ kind, children }: { kind: 'info' | 'error'; children: ReactNode }) {
  return (
    <p className={kind === 'error' ? 'status status-error' : 'status'} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </p>
  )
}
