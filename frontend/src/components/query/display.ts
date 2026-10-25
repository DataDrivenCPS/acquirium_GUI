import type { QueryResult } from '../../api/types'

// TODO (settings): let the user turn this on in the UI. Identifiers (URIs) are shown only when it is true.
export const SHOW_IDENTIFIERS = false

// The readable end of an identifier, e.g. 'wbs:co2-addition' -> 'co2-addition'
export function shortName(identifier: string): string {
  return identifier.split(/[#/:]/).pop() || identifier
}

// A column of node identifiers (an alias, like 'm') is told apart from its attribute columns ('m.label') by
// the others: 'm.label' is an attribute because the table has an 'm' column it is named after. An alias the
// user typed can itself contain a dot ('pump.v2'), so a dot alone does not make a column an attribute.
const isAliasColumn = (column: string, columns: string[]) => !columns.some((other) => column.startsWith(`${other}.`))

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
        if (!isAliasColumn(column, columns)) return row[index]
        const label = labelOf(column) >= 0 ? row[labelOf(column)] : null
        return label ?? (row[index] === null ? null : shortName(row[index]))
      }),
    ),
  }
}

// Capitalizes the first letter of each word, leaving the other letters alone so acronyms stay ('RO feed' -> 'RO Feed')
const titleCase = (text: string) => text.replace(/(^|[\s(])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())

// A stream's column name reads 's223:Pump_data__intake in flow rate': the node it hangs off ('s223:Pump_data'),
// two underscores, then the stream's own label. The part before the underscores is plumbing, and a label that
// says where and what ('intake in flow rate') reads better as 'Intake In (Flow Rate)'. The 'in' or 'out' stays,
// since a stream going in and one coming out of the same thing would otherwise read the same. Anything that
// does not look like that is only capitalized.
export function readableStream(name: string): string {
  const own = name.includes('__') ? name.slice(name.indexOf('__') + 2) : name
  const match = /^(.+?) (in|out) (.+)$/.exec(own)
  return titleCase(match ? `${match[1]} ${match[2]} (${match[3]})` : own)
}

// The columns of the narrow and grouped readings tables, in plain words
const FIXED_HEADERS: Record<string, string> = {
  time: 'Time',
  data_alias: 'Stream',
  point_id: 'Stream Identifier',
  value_numeric: 'Value',
  value_text: 'Text Value',
  count: 'Count',
}

// Readable headers for a readings table: the fixed columns get plain words ('time' -> 'Time'), a summary column
// 'mean(value)' becomes 'Mean Value', and each stream column is shortened (see readableStream). If two streams
// still shorten to the same text (the same label under two different nodes), those keep their whole names.
export function readableHeaders(columns: string[]): string[] {
  const summary = (column: string) => /^(\w+)\(value\)$/.exec(column)
  const short = columns.map((column) => FIXED_HEADERS[column] ?? (summary(column) ? titleCase(`${summary(column)![1]} value`) : readableStream(column)))
  return columns.map((column, index) => (short.filter((other) => other === short[index]).length > 1 ? column : short[index]))
}
