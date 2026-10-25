import type { QueryResult, ResultOptions } from '../../api/types'
import { NONE } from '../../format'
import DataTable, { type Column } from '../layout/DataTable'
import { displayTable, readableHeaders, readableStream } from './display'
import ResultOptionsPanel from './ResultOptionsPanel'
import Window from '../layout/Window'

const count = (n: number) => n.toLocaleString('en-US')

// How many rows the table has, and how many of them are shown
function summary({ rows, total_rows, truncated }: QueryResult): string {
  if (truncated) return `Showing the first ${count(rows.length)} of ${count(total_rows)} rows`
  return total_rows === 1 ? '1 row' : `${count(total_rows)} rows`
}

type QueryResultsWindowProps = {
  result: QueryResult | null
  ran: ResultOptions // the options the shown result was run with
  options: ResultOptions // the options as chosen now, which may not have been run yet
  onOptionsChange: (options: ResultOptions) => void
  onApply: () => void
  canApply: boolean
  onViewReadings: () => void
  canViewReadings: boolean // false without a measurements step, the only thing that has readings
  onBackToMetadata: () => void
}

// The table the last run returned. A metadata table shows names instead of identifiers (see display.ts);
// readings hold times and values, which must not be read as identifiers, so they are shown as returned.
function ResultsTable({ result, ran }: { result: QueryResult | null; ran: ResultOptions }) {
  if (result === null) return <p className="muted">Run a query to see its results.</p>
  const readings = ran.view === 'readings'
  const shown = readings ? result : displayTable(result)
  // readings name their streams 's223:Pump_data__intake in flow rate': show 'Intake In (Flow Rate)', the full name on hover
  const headers = readings ? readableHeaders(shown.columns) : shown.columns
  const columns: Column<(string | null)[]>[] = shown.columns.map((name, index) => ({
    header: headers[index],
    title: headers[index].toLowerCase() === name.toLowerCase() ? undefined : name, // only a real rename needs the original on hover
    // the narrow layout and grouped readings name the stream in a cell, not in a header
    cell: (row) => (readings && name === 'data_alias' && row[index] ? readableStream(row[index]) : (row[index] ?? NONE)),
  }))
  return (
    <>
      <p>{summary(result)}</p>
      <DataTable columns={columns} rows={shown.rows} rowKey={(_, index) => String(index)} empty="No rows matched." />
    </>
  )
}

// The results of the last run. A query first shows its metadata (what matched). View readings switches to the
// values of the matched streams, with the data aggregation panel below them.
function QueryResultsWindow({ result, ran, options, onOptionsChange, onApply, canApply, onViewReadings, canViewReadings, onBackToMetadata }: QueryResultsWindowProps) {
  const readings = options.view === 'readings'
  return (
    <Window title="Query results" area="results" source={result?.source}>
      {readings ? (
        <div className="readings-layout">
          <div className="readings-data">
            <button type="button" onClick={onBackToMetadata}>
              Back to metadata
            </button>
            <ResultsTable result={result} ran={ran} />
          </div>
          <ResultOptionsPanel options={options} onChange={onOptionsChange} onApply={onApply} canApply={canApply} />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onViewReadings}
            disabled={!canViewReadings}
            title={canViewReadings ? undefined : 'Add a measurements step to see readings'}
          >
            View readings
          </button>
          <ResultsTable result={result} ran={ran} />
        </>
      )}
    </Window>
  )
}

export default QueryResultsWindow
