import { useState } from 'react'
import { ApiError, postJson } from '../../api/http'
import type { Candidate, QueryResult, QueryStep, ResultOptions } from '../../api/types'
import { DEFAULT_OPTIONS, READINGS_OPTIONS, toOptionsRequest } from './options'
import PythonWindow from './PythonWindow'
import QueryBuilderWindow, { type RunError } from './QueryBuilderWindow'
import QueryResultsWindow from './QueryResultsWindow'
import { fillPick, toRequest } from './steps'

// The three query windows. This component owns the steps being built and the result options: the builder
// edits the steps, and Run sends them to POST /api/query/run for the results window. A run shows the metadata
// (what matched); View readings in the results window runs the same steps again for the values of the matched
// streams, and the data aggregation panel there shapes them. Nothing is sent before Run (or View readings, or
// Apply, or before picking a closest match, which carries on with the run).
// The Python window is still a stub: it will show the same steps as a Python script
// (POST /api/query/python, see hooks/useDebouncedPost).
function QueryWorkspace() {
  const [steps, setSteps] = useState<QueryStep[]>([])
  const [options, setOptions] = useState<ResultOptions>(DEFAULT_OPTIONS) // what the user has chosen, run or not; its view is metadata or readings
  const [result, setResult] = useState<QueryResult | null>(null) // the last run, if it succeeded
  const [ran, setRan] = useState<ResultOptions>(DEFAULT_OPTIONS) // the options that last run used, which say how to show its table
  const [error, setError] = useState<RunError | null>(null)
  const [running, setRunning] = useState(false)
  const hasMeasurements = steps.some((step) => step.kind === 'measurement') // only measurements have readings

  // Runs `toRun` with `used` options (a pick runs the steps it has just changed, which state does not hold yet)
  async function run(toRun: QueryStep[], used: ResultOptions = options) {
    setRunning(true)
    try {
      const answer = await postJson<QueryResult>('/api/query/run', { steps: toRequest(toRun), options: toOptionsRequest(used) })
      setResult(answer)
      setRan(used)
      setError(null)
    } catch (caught) {
      setResult(null) // a failed run must not leave the previous query's table up, as if it answered this one
      const failure = caught as Error
      const { candidates, text, field } = failure instanceof ApiError ? failure : { candidates: [], text: null, field: null }
      setError({ message: failure.message, candidates, text, field })
    } finally {
      setRunning(false)
    }
  }

  // Editing the steps while readings are showing makes those readings stale, so go back to an empty metadata view
  function editSteps(next: QueryStep[]) {
    setSteps(next)
    if (options.view === 'readings') {
      setOptions(DEFAULT_OPTIONS)
      setRan(DEFAULT_OPTIONS)
      setResult(null)
    }
  }

  function viewReadings() {
    setOptions(READINGS_OPTIONS)
    void run(steps, READINGS_OPTIONS)
  }

  function backToMetadata() {
    setOptions(DEFAULT_OPTIONS)
    void run(steps, DEFAULT_OPTIONS)
  }

  // The user chose which node their unmatched text meant: show its name there and carry on with the run
  function pick({ text, field }: RunError, picked: Candidate) {
    const filled = fillPick(steps, text ?? '', field, picked)
    setSteps(filled)
    setError(null)
    void run(filled)
  }

  return (
    // <>...</> adds no element, so each window is placed directly in the operator grid
    <>
      <QueryBuilderWindow steps={steps} onChange={editSteps} onRun={() => void run(steps)} running={running} error={error} onPick={pick} />
      <PythonWindow />
      <QueryResultsWindow
        result={result}
        ran={ran}
        options={options}
        onOptionsChange={setOptions}
        onApply={() => void run(steps)}
        canApply={!running}
        onViewReadings={viewReadings}
        canViewReadings={hasMeasurements && !running}
        onBackToMetadata={backToMetadata}
      />
    </>
  )
}

export default QueryWorkspace
