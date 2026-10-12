import type { QueryResult } from '../../api/types'
import { NONE } from '../../format'
import DataTable, { type Column } from '../layout/DataTable'
import Window from '../layout/Window'

// What the Run button has produced so far
export type RunState =
  | { state: 'idle' } // never run
  | { state: 'running' }
  | { state: 'ok'; result: QueryResult; ranSteps: string } // ranSteps: JSON of the steps that ran
  | { state: 'error'; message: string }

const SAMPLE_NOTE =
  'Acquirium has no live data, so this is a made-up example table, not the result of your query. ' +
  'Run again once Acquirium has data.'

type QueryResultsWindowProps = {
  run: RunState
  stale: boolean // the steps changed since this result was produced
}

// The table the last Run returned
function QueryResultsWindow({ run, stale }: QueryResultsWindowProps) {
  return (
    <Window
      title="Query results"
      area="results"
      source={run.state === 'ok' ? run.result.source : undefined}
      sampleNote={SAMPLE_NOTE}
    >
      {run.state === 'idle' && <p className="muted">Build a query and press Run to see its results here.</p>}
      {run.state === 'running' && <p className="muted">Running…</p>}
      {run.state === 'error' && <p className="text-error">{run.message}</p>}
      {run.state === 'ok' && <ResultTable result={run.result} stale={stale} />}
    </Window>
  )
}

function ResultTable({ result, stale }: { result: QueryResult; stale: boolean }) {
  // One column per result column; a row is a list of cells in column order
  const columns: Column<(string | null)[]>[] = result.columns.map((name, i) => ({
    header: name,
    cell: (row) => row[i] ?? NONE,
  }))
  return (
    <>
      <p className="window-toolbar">
        {result.total_rows} {result.total_rows === 1 ? 'row' : 'rows'}
        {result.truncated && ` (showing the first ${result.rows.length})`}
        {stale && <span className="muted">The steps have changed since this run.</span>}
      </p>
      <DataTable columns={columns} rows={result.rows} rowKey={(_, index) => String(index)} empty="No matches." />
    </>
  )
}

export default QueryResultsWindow
