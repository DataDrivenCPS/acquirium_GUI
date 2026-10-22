import type { QueryResult } from '../../api/types'
import { NONE } from '../../format'
import DataTable, { type Column } from '../layout/DataTable'
import Window from '../layout/Window'

const count = (n: number) => n.toLocaleString('en-US')

// How many rows the table has, and how many of them are shown
function summary({ rows, total_rows, truncated }: QueryResult): string {
  if (truncated) return `Showing the first ${count(rows.length)} of ${count(total_rows)} rows`
  return total_rows === 1 ? '1 row' : `${count(total_rows)} rows`
}

// The table the last run returned: one column per column of the query's metadata
function QueryResultsWindow({ result }: { result: QueryResult | null }) {
  const columns: Column<(string | null)[]>[] = (result?.columns ?? []).map((header, index) => ({
    header,
    cell: (row) => row[index] ?? NONE,
  }))

  return (
    <Window title="Query results" area="results" source={result?.source}>
      {result === null ? (
        <p className="muted">Run a query to see its results.</p>
      ) : (
        <>
          <p>{summary(result)}</p>
          <DataTable columns={columns} rows={result.rows} rowKey={(_, index) => String(index)} empty="No rows matched." />
        </>
      )}
    </Window>
  )
}

export default QueryResultsWindow
