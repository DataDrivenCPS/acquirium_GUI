import type { QueryResult } from '../../api/types'
import { localName, NONE, unitName } from '../../format'
import DataTable, { type Column } from '../layout/DataTable'
import { displayTable, ENTITY_SEPARATOR, readableHeaders, readableStream } from './display'
import ExportButtons from './ExportButtons'
import type { ExportTable } from './exportTable'
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

// The table the last run returned, as shown. A metadata table shows names instead of identifiers (see display.ts);
// readings hold times and values, which must not be read as identifiers, so they are shown as returned, with
// readable headers ('s223:Pump_data__intake in flow rate' becomes 'Intake In (Flow Rate)'). The same table is
// what gets exported, so a file has the headers and names the page has.
type ShownTable = { names: string[]; headers: string[]; rows: (string | null)[][] }
function shownTable(result: QueryResult, ran: ResultOptions): ShownTable {
  const readings = ran.view === 'readings'
  const shown = readings ? result : displayTable(result)
  return {
    names: shown.columns,
    headers: readings ? readableHeaders(shown.columns) : shown.columns,
    // the narrow layout and grouped readings name the stream in a cell, not in a header
    rows: shown.rows.map((row) => row.map((cell, index) => (readings && shown.columns[index] === 'data_alias' && cell ? readableStream(cell) : cell))),
  }
}
// Attribute columns whose values are namespaced terms: shown without the namespace, which stays as alt text
const termName = (header: string) =>
  header.endsWith('.unit') ? unitName : header.endsWith('.quantity_kind') ? localName : null

function ResultsTable({ result, table, ran }: { result: QueryResult | null; table: ShownTable | null; ran: ResultOptions }) {
  if (result === null || table === null) return <p className="muted">Run a query to see its results.</p>
  const readings = ran.view === 'readings'
  const { names, headers } = table
  const columns: Column<(string | null)[]>[] = names.map((name, index) => {
    // a wide readings column reads 'Pump 1 | Intake In (Flow Rate)': the entity goes on top, the stream stays as the header
    const bar = readings ? headers[index].indexOf(ENTITY_SEPARATOR) : -1
    return {
      header: bar >= 0 ? headers[index].slice(bar + ENTITY_SEPARATOR.length) : headers[index],
      group: bar >= 0 ? headers[index].slice(0, bar) : undefined,
      title: headers[index].toLowerCase() === name.toLowerCase() ? undefined : name, // only a real rename needs the original on hover
      cell: (row) => row[index] ?? NONE,
    }
  })
  return (
    <>
      <p>{summary(result)}</p>
      <DataTable columns={columns} rows={table.rows} rowKey={(_, index) => String(index)} empty="No rows matched." />
    </>
  )
}

// The results of the last run. A query first shows its metadata (what matched). View readings switches to the
// values of the matched streams, with the data aggregation panel below them.
function QueryResultsWindow({ result, ran, options, onOptionsChange, onApply, canApply, onViewReadings, canViewReadings, onBackToMetadata }: QueryResultsWindowProps) {
  const readings = options.view === 'readings'
  const table = result === null ? null : shownTable(result, ran)
  const exportable: ExportTable | null = table && { headers: table.headers, rows: table.rows }
  const exportButtons = <ExportButtons table={exportable} view={ran.view} truncated={result?.truncated ?? false} />
  return (
    <Window title="Query results" area="results" source={result?.source}>
      {readings ? (
        <div className="readings-layout">
          <div className="results-toolbar">
            <button type="button" onClick={onBackToMetadata}>
              Back to metadata
            </button>
            {exportButtons}
          </div>
          <div className="readings-data">
            <ResultsTable result={result} table={table} ran={ran} />
          </div>
          <ResultOptionsPanel options={options} onChange={onOptionsChange} onApply={onApply} canApply={canApply} />
        </div>
      ) : (
        <>
          <div className="results-toolbar">
            <button
              type="button"
              onClick={onViewReadings}
              disabled={!canViewReadings}
              title={canViewReadings ? undefined : 'Add a measurements step to see readings'}
            >
              View readings
            </button>
            {exportButtons}
          </div>
          <ResultsTable result={result} table={table} ran={ran} />
        </>
      )}
    </Window>
  )
}

export default QueryResultsWindow
