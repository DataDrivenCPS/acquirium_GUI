/**
 * Settings (story 9b).
 *
 * The confidence threshold and the graph size limit are deliberately not
 * constants anywhere in this codebase: the right values depend on the plant's
 * size and on how much ambiguity a given operator wants to be asked about.
 * They live in a config file on the server and are edited here.
 */

import { useEffect, useState } from 'react'

import { Panel, PanelStatus } from '../components/Panel'
import type { AppConfig } from '../api/types'
import { useQuery } from '../state/QueryContext'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { config, saveConfig } = useQuery()
  const [draft, setDraft] = useState<AppConfig | null>(config)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(config), [config])

  if (!draft) return <PanelStatus kind="info">Loading settings…</PanelStatus>

  const set = (patch: Partial<AppConfig>) => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
  }

  async function save() {
    if (!draft) return
    try {
      await saveConfig(draft)
      setError(null)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Panel
      title="Settings"
      subtitle="Stored on the server, so they survive a restart."
      actions={
        <>
          <button type="button" onClick={save}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="settings">
        <label>
          How sure a text match must be before it is accepted without asking
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={draft.confidence_threshold}
            onChange={(event) => set({ confidence_threshold: Number(event.target.value) })}
          />
          <span className="hint">
            Higher means you are asked to choose more often. Lower means more silent guesses.
          </span>
        </label>

        <label>
          How far ahead the best match must be before it counts as unambiguous
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={draft.close_runner_up_margin}
            onChange={(event) => set({ close_runner_up_margin: Number(event.target.value) })}
          />
        </label>

        <label>
          How many choices to offer when a match is ambiguous
          <input
            type="number"
            min="1"
            max="20"
            value={draft.resolve_top_k}
            onChange={(event) => set({ resolve_top_k: Number(event.target.value) })}
          />
        </label>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={draft.auto_retrieve_data}
            onChange={(event) => set({ auto_retrieve_data: event.target.checked })}
          />
          Retrieve readings automatically as the query changes
          <span className="hint">
            Turn this off on a plant with large histories: retrieval is the expensive half
            of a query, and the refresh button then fetches only when you ask.
          </span>
        </label>

        <label>
          Largest graph to draw before simplifying it
          <input
            type="number"
            min="1"
            value={draft.graph_node_limit}
            onChange={(event) => set({ graph_node_limit: Number(event.target.value) })}
          />
        </label>
      </div>

      {error && <PanelStatus kind="error">{error}</PanelStatus>}
      {saved && <PanelStatus kind="info">Saved.</PanelStatus>}
    </Panel>
  )
}
