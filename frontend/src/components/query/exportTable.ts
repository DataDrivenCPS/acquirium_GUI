// Exporting the results table as a file the user can open elsewhere: CSV (spreadsheets), JSON (programs) or
// plain text (tab-separated, for pasting or a quick look). The pure functions here turn the table into text;
// download() hands that text to the browser as a file.

export type ExportFormat = 'csv' | 'json' | 'txt'
export type ExportTable = { headers: string[]; rows: (string | null)[][] }

export const FORMATS: { format: ExportFormat; label: string; mime: string }[] = [
  { format: 'csv', label: 'CSV', mime: 'text/csv' },
  { format: 'json', label: 'JSON', mime: 'application/json' },
  { format: 'txt', label: 'TXT', mime: 'text/plain' },
]

// A CSV field in quotes when it holds a comma, a quote or a line break (a quote inside is doubled), as RFC 4180 says
const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

// Comma-separated, one line per row, a missing value left empty
export function toCsv({ headers, rows }: ExportTable): string {
  return [headers, ...rows.map((row) => row.map((cell) => cell ?? ''))].map((line) => line.map(quote).join(',')).join('\r\n') + '\r\n'
}

// If two columns have the same header, the later ones are numbered ('Flow', 'Flow (2)') so no key overwrites another
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const times = (seen.get(name) ?? 0) + 1
    seen.set(name, times)
    return times === 1 ? name : `${name} (${times})`
  })
}

// A list with one object per row, keyed by header. Cells stay the text the page shows; a missing value is null.
export function toJson({ headers, rows }: ExportTable): string {
  const keys = uniqueNames(headers)
  return JSON.stringify(rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index]]))), null, 2) + '\n'
}

// Tab-separated, one line per row. A tab or line break inside a cell becomes a space so the columns stay aligned.
export function toText({ headers, rows }: ExportTable): string {
  const clean = (cell: string | null) => (cell ?? '').replace(/[\t\r\n]+/g, ' ')
  return [headers, ...rows].map((line) => line.map(clean).join('\t')).join('\n') + '\n'
}

export function toFormat(table: ExportTable, format: ExportFormat): string {
  return { csv: toCsv, json: toJson, txt: toText }[format](table)
}

// 'query-readings-2026-11-08.csv': what was exported, the day (this computer's), and the format
export function exportFileName(view: 'metadata' | 'readings', format: ExportFormat, now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `query-${view}-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.${format}`
}

// Saves text as a file through the browser. A CSV starts with a byte order mark so Excel reads accents correctly.
export function download(fileName: string, text: string, mime: string): void {
  const bom = mime === 'text/csv' ? '﻿' : ''
  const url = URL.createObjectURL(new Blob([bom + text], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
