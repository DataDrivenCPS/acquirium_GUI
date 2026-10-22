import { describe, expect, it } from 'vitest'
import type { QueryResult } from '../../../src/api/types'
import { displayTable, shortName } from '../../../src/components/query/display'

const table = (columns: string[], rows: (string | null)[][]): QueryResult => ({
  source: 'live', columns, rows, total_rows: rows.length, truncated: false,
})

describe('shortName', () => {
  it('keeps the readable end of an identifier', () => {
    expect(shortName('wbs:co2-addition')).toBe('co2-addition')
    expect(shortName('urn:nawi-water-ontology#Pump')).toBe('Pump')
    expect(shortName('plain')).toBe('plain')
  })
})

describe('displayTable', () => {
  const result = table(
    ['m', 'm.label', 'm.unit'],
    [['wbs:co2-addition', 'CO2 Addition', 'unit:BAR'], ['wbs:static-mixer', null, null]],
  )

  it('replaces an identifier column and its label column with one column of names', () => {
    expect(displayTable(result)).toEqual({
      columns: ['m', 'm.unit'],
      rows: [['CO2 Addition', 'unit:BAR'], ['static-mixer', null]], // no label: the readable end of the identifier
    })
  })

  it('shows the readable end of identifiers in an identifier column that has no label column', () => {
    expect(displayTable(table(['data'], [['wbs:flow-1']]))).toEqual({ columns: ['data'], rows: [['flow-1']] })
  })

  it('keeps the column order, with each name where its identifier was', () => {
    const wide = table(['a', 'b', 'a.label', 'b.label'], [['x:1', 'x:2', 'One', 'Two']])
    expect(displayTable(wide)).toEqual({ columns: ['a', 'b'], rows: [['One', 'Two']] })
  })

  it('leaves attribute columns as they are, since they are not identifiers of nodes', () => {
    const attrs = table(['p', 'p.quantity_kind'], [['wbs:p1', 'quantitykind:Pressure']])
    expect(displayTable(attrs).rows).toEqual([['p1', 'quantitykind:Pressure']])
  })

  // TODO (settings): a UI setting for showing identifiers will call this with true
  it('returns the table untouched when identifiers are to be shown', () => {
    expect(displayTable(result, true)).toEqual({ columns: result.columns, rows: result.rows })
  })
})
