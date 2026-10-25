import { describe, expect, it } from 'vitest'
import type { QueryResult } from '../../../src/api/types'
import { displayTable, readableHeaders, readableStream, shortName } from '../../../src/components/query/display'

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

  // An alias the user typed can contain a dot, which must not make it look like an attribute column
  it('shows the name for an alias that contains a dot', () => {
    const dotted = table(['pump.v2', 'pump.v2.label'], [['wbs:P1', 'High-pressure Pump P1']])
    expect(displayTable(dotted)).toEqual({ columns: ['pump.v2'], rows: [['High-pressure Pump P1']] })
  })

  it('keeps the attribute columns of a dotted alias as they are, and shows its identifier shortened when it has no label', () => {
    const dotted = table(['pump.v2', 'pump.v2.quantity_kind'], [['wbs:P1', 'quantitykind:Pressure']])
    expect(displayTable(dotted)).toEqual({ columns: ['pump.v2', 'pump.v2.quantity_kind'], rows: [['P1', 'quantitykind:Pressure']] })
  })
})

describe('readableStream', () => {
  it.each([
    ['s223:Pump_data__intake in flow rate', 'Intake In (Flow Rate)'],
    ['s223:Pump_data__intake in tds concentration', 'Intake In (Tds Concentration)'],
    ['s223:Pump_data__storage tank 3 out tds concentration', 'Storage Tank 3 Out (Tds Concentration)'],
  ])('shortens %s', (name, expected) => expect(readableStream(name)).toBe(expected))

  it('drops the node part of a label that does not say where and what, and keeps acronyms as they are', () => {
    expect(readableStream('s223:Pump_data__RO feed pressure')).toBe('RO Feed Pressure')
    expect(readableStream('s223:Pump_data__PXR brine out tds')).toBe('PXR Brine Out (Tds)')
  })

  it('still shortens a label that has no node part', () => {
    expect(readableStream('flow in pipe')).toBe('Flow In (Pipe)')
  })
})

describe('readableHeaders', () => {
  it('names the fixed columns in plain words', () => {
    expect(readableHeaders(['time', 'data_alias', 'point_id', 'value_numeric', 'value_text'])).toEqual([
      'Time', 'Stream', 'Stream Identifier', 'Value', 'Text Value',
    ])
  })

  it('names a summary column after its aggregate', () => {
    expect(readableHeaders(['data_alias', 'mean(value)'])).toEqual(['Stream', 'Mean Value'])
    expect(readableHeaders(['data_alias', 'count'])).toEqual(['Stream', 'Count'])
  })

  it('shortens the stream columns', () => {
    expect(readableHeaders(['time', 's223:Pump_data__intake in flow rate'])).toEqual(['Time', 'Intake In (Flow Rate)'])
  })

  it('tells a stream going in from one coming out of the same thing', () => {
    const columns = ['time', 'a__brine in tds', 'a__brine out tds']
    expect(readableHeaders(columns)).toEqual(['Time', 'Brine In (Tds)', 'Brine Out (Tds)'])
  })

  it('falls back to the whole names when two streams still shorten to the same text', () => {
    const columns = ['x__brine in tds', 'y__brine in tds']
    expect(readableHeaders(columns)).toEqual(columns)
  })
})
