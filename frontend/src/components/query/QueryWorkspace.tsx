import { useEffect, useRef, useState } from 'react'
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
// The streams picked in the Streams window are the other source of results: picking them shows their metadata
// (POST /api/query/streams) in the same results window, and View readings and the aggregation panel work on
// them too. Pressing Run in the builder takes the results back to the builder's query. The builder's steps are
// kept either way, and clearing the picks leaves the last results showing.
// The Python window is still a stub: it will show the same steps as a Python script
// (POST /api/query/python, see hooks/useDebouncedPost).
function QueryWorkspace({ streams }: { streams: string[] }) {
  const [steps, setSteps] = useState<QueryStep[]>([])
  const [options, setOptions] = useState<ResultOptions>(DEFAULT_OPTIONS) // what the user has chosen, run or not; its view is metadata or readings
  const [result, setResult] = useState<QueryResult | null>(null) // the last run, if it succeeded
  const [ran, setRan] = useState<ResultOptions>(DEFAULT_OPTIONS) // the options that last run used, which say how to show its table
  const [error, setError] = useState<RunError | null>(null)
  const [running, setRunning] = useState(false)
  const [source, setSource] = useState<'builder' | 'streams'>('builder') // whose results the window shows
  const [streamsError, setStreamsError] = useState<string | null>(null) // why the picked streams could not be shown
  const latest = useRef(0) // the newest request; an answer to an older one (picks change faster than the backend answers) is dropped
  const hasMeasurements = steps.some((step) => step.kind === 'measurement') // only measurements have readings

  // Runs `toRun` with `used` options (a pick runs the steps it has just changed, which state does not hold yet)
  async function run(toRun: QueryStep[], used: ResultOptions = options) {
    await send('builder', '/api/query/run', { steps: toRequest(toRun), options: toOptionsRequest(used) }, used)
  }

  // Shows the picked streams, with `used` options
  async function runStreams(points: string[], used: ResultOptions = options) {
    await send('streams', '/api/query/streams', { points, options: toOptionsRequest(used) }, used)
  }

  async function send(from: 'builder' | 'streams', url: string, body: unknown, used: ResultOptions) {
    const request = ++latest.current
    setSource(from)
    setRunning(true)
    try {
      const answer = await postJson<QueryResult>(url, body)
      if (request !== latest.current) return
      setResult(answer)
      setRan(used)
      setError(null)
      setStreamsError(null)
    } catch (caught) {
      if (request !== latest.current) return
      setResult(null) // a failed run must not leave the previous query's table up, as if it answered this one
      const failure = caught as Error
      if (from === 'streams') {
        setStreamsError(failure.message)
        setError(null)
      } else {
        const { candidates, text, field } = failure instanceof ApiError ? failure : { candidates: [], text: null, field: null }
        setError({ message: failure.message, candidates, text, field })
        setStreamsError(null)
      }
    } finally {
      if (request === latest.current) setRunning(false)
    }
  }

  // Show the streams whenever the picks change (the same points in a new array do not count). Their results
  // are asked for with the options as they are, so picking more streams while in the readings view stays in it.
  const picked = streams.join('\n')
  useEffect(() => {
    if (picked !== '') void runStreams(picked.split('\n'))
    // only a change of picks should ask again, not a change of options
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  // Runs whatever the results window is showing again, with the given options
  function rerun(used: ResultOptions) {
    void (source === 'streams' ? runStreams(streams, used) : run(steps, used))
  }

  // Editing the steps while readings are showing makes those readings stale, so go back to an empty metadata view
  function editSteps(next: QueryStep[]) {
    setSteps(next)
    if (source === 'builder' && options.view === 'readings') {
      setOptions(DEFAULT_OPTIONS)
      setRan(DEFAULT_OPTIONS)
      setResult(null)
    }
  }

  function viewReadings() {
    setOptions(READINGS_OPTIONS)
    rerun(READINGS_OPTIONS)
  }

  function backToMetadata() {
    setOptions(DEFAULT_OPTIONS)
    rerun(DEFAULT_OPTIONS)
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
      <PythonWindow steps={steps} />
      <QueryResultsWindow
        result={result}
        ran={ran}
        options={options}
        onOptionsChange={setOptions}
        onApply={() => rerun(options)}
        canApply={!running}
        onViewReadings={viewReadings}
        canViewReadings={(source === 'streams' || hasMeasurements) && !running}
        onBackToMetadata={backToMetadata}
        label={source === 'streams' ? `${streams.length} ${streams.length === 1 ? 'stream' : 'streams'} selected` : null}
        error={source === 'streams' ? streamsError : null}
      />
    </>
  )
}

export default QueryWorkspace
