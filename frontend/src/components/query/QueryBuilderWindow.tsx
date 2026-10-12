import { useRef, useState } from 'react'
import type { QueryAttribute, StepKind } from '../../api/types'
import { usePolledJson } from '../../hooks/usePolledJson'
import Window from '../layout/Window'
import { type DraftStep, newStep, STEP_KINDS } from './steps'
import StepEditor from './StepEditor'
import './Query.css'

type QueryBuilderWindowProps = {
  drafts: DraftStep[]
  onDraftsChange: (drafts: DraftStep[]) => void
  onRun: () => void
  running: boolean // a run is in progress, so Run is disabled
}

// Builds an Acquirium query as a list of steps, each one call on Acquirium's query builder
function QueryBuilderWindow({ drafts, onDraftsChange, onRun, running }: QueryBuilderWindowProps) {
  const attributesResult = usePolledJson<QueryAttribute[]>('/api/query/attributes')
  const attributes = attributesResult.state === 'ok' ? attributesResult.data : []
  const [kindToAdd, setKindToAdd] = useState<StepKind>('entity')
  // useRef keeps a value between renders without causing a re-render when it changes
  const nextId = useRef(0)

  const add = () => onDraftsChange([...drafts, { id: nextId.current++, step: newStep(kindToAdd) }])

  return (
    <Window
      title="Query builder"
      area="builder"
      actions={
        <button type="button" onClick={onRun} disabled={running || drafts.length === 0}>
          {running ? 'Running…' : 'Run'}
        </button>
      }
    >
      {drafts.length === 0 && (
        <p className="muted">
          No steps yet. Start with an entity (e.g. class Pump) or a measurement (every stream).
        </p>
      )}
      {drafts.map((draft, index) => (
        <StepEditor
          key={draft.id}
          number={index + 1}
          step={draft.step}
          attributes={attributes}
          onChange={(step) => onDraftsChange(drafts.map((d) => (d.id === draft.id ? { ...d, step } : d)))}
          onRemove={() => onDraftsChange(drafts.filter((d) => d.id !== draft.id))}
        />
      ))}
      <div className="window-toolbar">
        <select aria-label="Step kind" value={kindToAdd} onChange={(event) => setKindToAdd(event.target.value as StepKind)}>
          {STEP_KINDS.map(({ kind, hint }) => (
            <option key={kind} value={kind}>
              {kind}: {hint}
            </option>
          ))}
        </select>
        <button type="button" onClick={add}>
          Add step
        </button>
        <button type="button" onClick={() => onDraftsChange([])} disabled={drafts.length === 0}>
          Clear all
        </button>
      </div>
    </Window>
  )
}

export default QueryBuilderWindow
