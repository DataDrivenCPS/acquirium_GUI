import { useState } from 'react'
import { postJson } from '../../api/http'
import type { QueryResult } from '../../api/types'
import PythonWindow from './PythonWindow'
import QueryBuilderWindow from './QueryBuilderWindow'
import QueryResultsWindow, { type RunState } from './QueryResultsWindow'
import type { DraftStep } from './steps'

// The three query windows, which share one list of steps: the builder edits it, the Python
// window translates it, and Run sends it to the backend for the results window.
function QueryWorkspace() {
  const [drafts, setDrafts] = useState<DraftStep[]>([])
  const [run, setRun] = useState<RunState>({ state: 'idle' })
  const steps = drafts.map((draft) => draft.step) // the backend only needs the steps, not our ids
  const stepsJson = JSON.stringify(steps)

  // async lets us wait for the backend with `await` instead of chaining .then() calls
  const runQuery = async () => {
    setRun({ state: 'running' })
    try {
      const result = await postJson<QueryResult>('/api/query/run', { steps })
      setRun({ state: 'ok', result, ranSteps: stepsJson })
    } catch (error) {
      setRun({ state: 'error', message: (error as Error).message })
    }
  }

  return (
    // <>...</> adds no element, so each window is placed directly in the operator grid
    <>
      <QueryBuilderWindow drafts={drafts} onDraftsChange={setDrafts} onRun={runQuery} running={run.state === 'running'} />
      <PythonWindow steps={steps} />
      <QueryResultsWindow run={run} stale={run.state === 'ok' && run.ranSteps !== stepsJson} />
    </>
  )
}

export default QueryWorkspace
