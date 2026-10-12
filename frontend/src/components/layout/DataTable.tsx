import type { ReactNode } from 'react'

// How to show one column: its header, and what to put in its cell for a given row
export type Column<Row> = {
  header: string
  cell: (row: Row) => ReactNode
  numeric?: boolean // right-aligned, so digits line up
}

type DataTableProps<Row> = {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string // React needs a stable, unique key per row
  empty: string // shown instead of the table when there are no rows
}

// A plain table. <Row> is the type of one row, so cell functions get properly typed rows.
function DataTable<Row>({ columns, rows, rowKey, empty }: DataTableProps<Row>) {
  if (rows.length === 0) return <p className="muted">{empty}</p>
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header} className={column.numeric ? 'numeric' : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row, index)}>
            {columns.map((column) => (
              <td key={column.header} className={column.numeric ? 'numeric' : undefined}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DataTable
