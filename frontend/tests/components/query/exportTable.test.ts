import { describe, expect, it } from 'vitest'
import { defaultFileName, exportFileName, toCsv, toFormat, toJson, toText, uniqueNames } from '../../../src/components/query/exportTable'

const table = { headers: ['Time', 'Pump 1 | Intake In (Flow Rate)'], rows: [['2026-01-01 00:00:00', '1.5'], ['2026-01-01 01:00:00', null]] }

describe('toCsv', () => {
  it('writes the headers and one line per row, with a missing value left empty', () => {
    expect(toCsv(table)).toBe('Time,Pump 1 | Intake In (Flow Rate)\r\n2026-01-01 00:00:00,1.5\r\n2026-01-01 01:00:00,\r\n')
  })

  it('quotes a field with a comma, a quote or a line break, and doubles the quotes inside', () => {
    const tricky = { headers: ['Name'], rows: [['a, b'], ['say "hi"'], ['two\nlines'], ['plain']] }
    expect(toCsv(tricky)).toBe('Name\r\n"a, b"\r\n"say ""hi"""\r\n"two\nlines"\r\nplain\r\n')
  })
})

describe('toJson', () => {
  it('writes one object per row, keyed by header, with null for a missing value', () => {
    expect(JSON.parse(toJson(table))).toEqual([
      { Time: '2026-01-01 00:00:00', 'Pump 1 | Intake In (Flow Rate)': '1.5' },
      { Time: '2026-01-01 01:00:00', 'Pump 1 | Intake In (Flow Rate)': null },
    ])
  })

  it('numbers repeated headers so no column overwrites another', () => {
    const repeated = { headers: ['Flow', 'Flow', 'Flow'], rows: [['1', '2', '3']] }
    expect(JSON.parse(toJson(repeated))).toEqual([{ Flow: '1', 'Flow (2)': '2', 'Flow (3)': '3' }])
    expect(uniqueNames(['a', 'b', 'a'])).toEqual(['a', 'b', 'a (2)'])
  })
})

describe('toText', () => {
  it('writes tab-separated lines, a missing value left empty', () => {
    expect(toText(table)).toBe('Time\tPump 1 | Intake In (Flow Rate)\n2026-01-01 00:00:00\t1.5\n2026-01-01 01:00:00\t\n')
  })

  it('turns a tab or line break inside a cell into a space so the columns stay aligned', () => {
    expect(toText({ headers: ['A'], rows: [['x\ty\nz']] })).toBe('A\nx y z\n')
  })
})

describe('toFormat and exportFileName', () => {
  it('picks the writer for the format', () => {
    expect(toFormat(table, 'csv')).toBe(toCsv(table))
    expect(toFormat(table, 'json')).toBe(toJson(table))
    expect(toFormat(table, 'txt')).toBe(toText(table))
  })

  it('names the file after what was exported, the day and the format', () => {
    const day = new Date(2026, 10, 8, 12, 30)
    expect(exportFileName('readings', 'csv', '', day)).toBe('query-readings-2026-11-08.csv')
    expect(exportFileName('metadata', 'json', '', new Date(2026, 0, 5))).toBe('query-metadata-2026-01-05.json')
    expect(defaultFileName('readings', day)).toBe('query-readings-2026-11-08')
  })

  it('uses the name the user typed, adds the extension once and drops characters a file name cannot hold', () => {
    const day = new Date(2026, 10, 8)
    expect(exportFileName('readings', 'csv', 'plant A run 3', day)).toBe('plant A run 3.csv')
    expect(exportFileName('readings', 'csv', 'plant.csv', day)).toBe('plant.csv')
    expect(exportFileName('readings', 'json', 'plant.csv', day)).toBe('plant.json')
    expect(exportFileName('readings', 'txt', 'a/b:c*?"<>|', day)).toBe('abc.txt')
    expect(exportFileName('readings', 'csv', '   ', day)).toBe('query-readings-2026-11-08.csv')
    expect(exportFileName('readings', 'csv', '.csv', day)).toBe('query-readings-2026-11-08.csv')
  })
})
