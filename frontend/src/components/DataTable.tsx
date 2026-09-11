import type { Table } from '../api/types'
import type { Async } from '../state/QueryContext'
import { PanelStatus } from './Panel'

interface DataTableProps {
  result: Async<Table>
  /** Shown before the first request, when there is nothing to report yet. */
  idleMessage: string
}

/**
 * The one table renderer, shared by the metadata and dataframe panels.
 *
 * It renders whatever columns the backend sends, in order, and never
 * interprets them. That is deliberate: the metadata columns depend on the
 * aliases the user created, so hardcoding any of them here would break as
 * soon as someone builds a different query.
 */
export function DataTable({ result, idleMessage }: DataTableProps) {
  if (result.error) return <PanelStatus kind="error">{result.error}</PanelStatus>
  if (result.loading && !result.data) return <PanelStatus kind="info">Loading…</PanelStatus>
  if (!result.data) return <PanelStatus kind="info">{idleMessage}</PanelStatus>

  const { columns, rows, empty_reason } = result.data

  if (rows.length === 0) {
    return <PanelStatus kind="info">{empty_reason ?? 'No results.'}</PanelStatus>
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell === null || cell === undefined ? '' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-footnote">
        {rows.length} row{rows.length === 1 ? '' : 's'}
        {result.loading && ' · refreshing…'}
      </p>
    </div>
  )
}
