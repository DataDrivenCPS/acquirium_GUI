// Formatting shared by the windows

// Shown in a cell that has no value
export const NONE = '—'

// A reading for display: numbers with at most 3 decimals and thousands separators, text as-is
export function formatValue(value: number | string | null): string {
  if (value === null) return NONE
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return value
}

// An ISO 8601 time as 'YYYY-MM-DD HH:MM:SS' in timeZone (default: this computer's time zone).
// The sv-SE (Swedish) locale happens to format dates exactly this way.
export function formatTime(iso: string | null, timeZone?: string): string {
  if (iso === null) return NONE
  return new Date(iso).toLocaleString('sv-SE', { timeZone })
}

// A term without its namespace: 'unit:BAR' and 'http://qudt.org/vocab/unit/BAR' both become 'BAR'
export function localName(term: string | null): string {
  if (term === null) return NONE
  return term.slice(Math.max(term.lastIndexOf(':'), term.lastIndexOf('/'), term.lastIndexOf('#')) + 1)
}

// A unit for display: like localName, but the dimensionless unit reads 'unitless'
export function unitName(unit: string | null): string {
  const name = localName(unit)
  return name === 'UNITLESS' ? 'unitless' : name
}
