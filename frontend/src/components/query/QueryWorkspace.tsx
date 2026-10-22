import { useState } from 'react'
import { ApiError, postJson } from '../../api/http'
import type { QueryResult, QueryStep } from '../../api/types'
import PythonWindow from './PythonWindow'
import QueryBuilderWindow, { type RunError } from './QueryBuilderWindow'
import QueryResultsWindow from './QueryResultsWindow'
import { fillClass } from './steps'

// The three query windows. This component owns the steps being built: the builder edits them,
// and Run sends them to POST /api/query/run for the results window. Nothing is sent before Run.
// The Python window is still a stub: it will show the same steps as a Python script
// (POST /api/query/python, see hooks/useDebouncedPost).
function QueryWorkspace() {
  const [steps, setSteps] = useState<QueryStep[]>([])
  const [result, setResult] = useState<QueryResult | null>(null) // the last successful run, kept while a later run fails
  const [error, setError] = useState<RunError | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      setResult(await postJson<QueryResult>('/api/query/run', { steps }))
      setError(null)
    } catch (caught) {
      const failure = caught as Error
      const { candidates, text } = failure instanceof ApiError ? failure : { candidates: [], text: null }
      setError({ message: failure.message, candidates, text })
    } finally {
      setRunning(false)
    }
  }

  // The user chose which node their unmatched text meant: use its URI there, and let them run again
  function pick(text: string, uri: string) {
    setSteps(fillClass(steps, text, uri))
    setError(null)
  }

  return (
    // <>...</> adds no element, so each window is placed directly in the operator grid
    <>
      <QueryBuilderWindow steps={steps} onChange={setSteps} onRun={run} running={running} error={error} onPick={pick} />
      <PythonWindow />
      <QueryResultsWindow result={result} />
    </>
  )
}

export default QueryWorkspace
