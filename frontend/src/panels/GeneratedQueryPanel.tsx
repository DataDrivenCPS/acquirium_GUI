/**
 * The technical escape hatch (story 13).
 *
 * The one place in the app allowed to show query text, and it stays collapsed
 * by default: a plant operator should never meet it, and someone who does
 * write Python should be able to copy the query into a notebook.
 *
 * It fetches only while open, so the default UI makes no request that could
 * return a URI at all.
 */

import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { Panel, PanelStatus } from '../components/Panel'
import type { GeneratedQuery } from '../api/types'
import { useQuery } from '../state/QueryContext'
import { toDescription } from '../state/queryReducer'

export function GeneratedQueryPanel() {
  const { state } = useQuery()
  const [open, setOpen] = useState(false)
  const [generated, setGenerated] = useState<GeneratedQuery | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .generated(toDescription(state))
      .then((result) => {
        if (cancelled) return
        setGenerated(result)
        setError(null)
      })
      .catch((cause) => {
        if (cancelled) return
        setGenerated(null)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [open, state])

  return (
    <Panel
      title="Generated query"
      subtitle="For users who want to run this from Python."
      actions={
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Show'}
        </button>
      }
    >
      {!open ? (
        <PanelStatus kind="info">Hidden by default.</PanelStatus>
      ) : error ? (
        <PanelStatus kind="error">{error}</PanelStatus>
      ) : generated ? (
        <>
          <pre className="code">{generated.python}</pre>
          {generated.sparql && <pre className="code">{generated.sparql}</pre>}
          {generated.note && <PanelStatus kind="info">{generated.note}</PanelStatus>}
        </>
      ) : (
        <PanelStatus kind="info">Loading…</PanelStatus>
      )}
    </Panel>
  )
}
