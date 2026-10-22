import { useEffect, useState } from 'react'
import type { Candidate, QueryAttribute, QueryStep } from '../../api/types'
import Window from '../layout/Window'
import StepEditor from './StepEditor'
import { newStep, type BuilderKind } from './steps'
import './QueryBuilder.css'

// Why the last run failed. candidates are the closest nodes to the text that did not match (empty for other errors).
export type RunError = { message: string; candidates: Candidate[]; text: string | null }

type QueryBuilderWindowProps = {
  steps: QueryStep[]
  onChange: (steps: QueryStep[]) => void
  onRun: () => void
  running: boolean
  error: RunError | null
  onPick: (text: string, uri: string) => void // the user chose a candidate for the text that did not match
}

const ADD_BUTTONS: { kind: BuilderKind; label: string }[] = [
  { kind: 'entity', label: 'Add entity' },
  { kind: 'related', label: 'Add related entity' },
  { kind: 'measurement', label: 'Use measurements' },
  { kind: 'refocus', label: 'Refocus' },
  { kind: 'where', label: 'Add filter step' },
]

// What a pick-list entry says: the label (if any), its URI, and how well it matched
function describe({ uri, label, score }: Candidate): string {
  return `${label ? `${label} (${uri})` : uri}, score ${score.toFixed(2)}`
}

// Loads the attributes filters can use, once. null while loading and when they could not be loaded.
function useAttributes(): { attributes: QueryAttribute[] | null; failed: boolean } {
  const [state, setState] = useState<{ attributes: QueryAttribute[] | null; failed: boolean }>({ attributes: null, failed: false })
  useEffect(() => {
    let current = true // false once the window is gone, so a late answer is ignored
    fetch('/api/query/attributes')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((attributes: QueryAttribute[]) => current && setState({ attributes, failed: false }))
      .catch(() => current && setState({ attributes: null, failed: true }))
    return () => {
      current = false
    }
  }, [])
  return state
}

// Builds a query step by step. Editing only changes the steps; nothing is sent until Run.
function QueryBuilderWindow({ steps, onChange, onRun, running, error, onPick }: QueryBuilderWindowProps) {
  const { attributes, failed } = useAttributes()
  const firstAttribute = attributes?.[0]?.name ?? ''

  return (
    <Window
      title="Query builder"
      area="builder"
      actions={
        <button type="button" onClick={onRun} disabled={steps.length === 0 || running} aria-busy={running}>
          Run
        </button>
      }
    >
      <div className="builder-toolbar">
        {ADD_BUTTONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            disabled={kind === 'where' && attributes === null}
            onClick={() => onChange([...steps, newStep(kind, firstAttribute)])}
          >
            {label}
          </button>
        ))}
      </div>
      {failed && <p className="muted">Could not load the attribute list; filters are unavailable.</p>}
      {steps.length === 0 && <p className="muted">Add a step to start a query.</p>}
      {steps.map((step, index) => (
        <StepEditor
          // steps have no id and are edited in place, so the position identifies one
          key={index}
          step={step}
          number={index + 1}
          attributes={attributes}
          onChange={(next) => onChange(steps.map((s, i) => (i === index ? next : s)))}
          onRemove={() => onChange(steps.filter((_, i) => i !== index))}
        />
      ))}
      {error && (
        <div role="alert" className="run-error">
          <p>{error.message}</p>
          {error.candidates.length > 0 && (
            <ul aria-label="Closest matches">
              {error.candidates.map((candidate) => (
                <li key={candidate.uri}>
                  <button type="button" onClick={() => onPick(error.text ?? '', candidate.uri)}>
                    {describe(candidate)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Window>
  )
}

export default QueryBuilderWindow
