import type { ReactNode } from 'react'

// How to show one column: its header, and what to put in its cell for a given row
export type Column<Row> = {
  header: string
  group?: string // a heading above this column and the neighbouring columns that share it, e.g. the pump their readings belong to
  title?: string // shown on hover, e.g. the full name behind a shortened header
  cell: (row: Row) => ReactNode
  numeric?: boolean // right-aligned, so digits line up
}

type DataTableProps<Row> = {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string // React needs a stable, unique key per row
  empty: string // shown instead of the table when there are no rows
}

// Neighbouring columns with the same group, in order: [{ group: 'Pump 1', columns: [..] }, { columns: [..] }, ...]
// A column with no group is a run of its own.
function runsOf<Row>(columns: Column<Row>[]) {
  const runs: { group?: string; columns: Column<Row>[] }[] = []
  for (const column of columns) {
    const last = runs[runs.length - 1]
    if (column.group !== undefined && last?.group === column.group) last.columns.push(column)
    else runs.push({ group: column.group, columns: [column] })
  }
  return runs
}

// A plain table. <Row> is the type of one row, so cell functions get properly typed rows. If any column has a
// group, the header has a top row naming the groups, each spanning its columns, above the column headers; a
// column without a group puts its header across both rows.
function DataTable<Row>({ columns, rows, rowKey, empty }: DataTableProps<Row>) {
  if (rows.length === 0) return <p className="muted">{empty}</p>
  const grouped = columns.some((column) => column.group !== undefined)
  const header = (column: Column<Row>, key: string, rowSpan?: number) => (
    <th key={key} title={column.title} rowSpan={rowSpan} className={column.numeric ? 'numeric' : undefined}>
      {column.header}
    </th>
  )
  return (
    <table className="data-table">
      <thead>
        {grouped ? (
          <>
            <tr>
              {runsOf(columns).map((run, index) =>
                run.group === undefined ? (
                  run.columns.map((column, i) => header(column, `${index}-${i}`, 2))
                ) : (
                  <th key={index} colSpan={run.columns.length} className="group">
                    {run.group}
                  </th>
                ),
              )}
            </tr>
            <tr className="sub-header">{columns.filter((column) => column.group !== undefined).map((column, index) => header(column, String(index)))}</tr>
          </>
        ) : (
          <tr>{columns.map((column, index) => header(column, String(index)))}</tr>
        )}
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row, index)}>
            {columns.map((column, i) => (
              <td key={i} className={column.numeric ? 'numeric' : undefined}>
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
