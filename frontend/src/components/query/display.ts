import type { QueryResult } from '../../api/types'

// TODO (settings): let the user turn this on in the UI. Identifiers (URIs) are shown only when it is true.
export const SHOW_IDENTIFIERS = false

// The readable end of an identifier, e.g. 'wbs:co2-addition' -> 'co2-addition'
export function shortName(identifier: string): string {
  return identifier.split(/[#/:]/).pop() || identifier
}

// What a column of node identifiers (an alias, like 'm') is called apart from its attributes ('m.label')
const isAliasColumn = (column: string) => !column.includes('.')

type Cell = string | null
export type Table = { columns: string[]; rows: Cell[][] }

// The table to show. Unless identifiers are wanted, each alias column and its '<alias>.label' column become
// one column of names (a node with no label shows the readable end of its identifier), at the alias's place.
export function displayTable({ columns, rows }: Pick<QueryResult, 'columns' | 'rows'>, showIdentifiers = SHOW_IDENTIFIERS): Table {
  if (showIdentifiers) return { columns, rows }
  const labelOf = (column: string) => columns.indexOf(`${column}.label`)
  const shown = columns.map((column, index) => ({ column, index })).filter(({ column }) => {
    const isLabelOfAnAlias = column.endsWith('.label') && columns.includes(column.slice(0, -'.label'.length))
    return !isLabelOfAnAlias
  })
  return {
    columns: shown.map(({ column }) => column),
    rows: rows.map((row) =>
      shown.map(({ column, index }) => {
        if (!isAliasColumn(column)) return row[index]
        const label = labelOf(column) >= 0 ? row[labelOf(column)] : null
        return label ?? (row[index] === null ? null : shortName(row[index]))
      }),
    ),
  }
}
