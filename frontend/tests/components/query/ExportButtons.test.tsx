import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '../../../src/api/types'
import ExportButtons from '../../../src/components/query/ExportButtons'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'
import { mockFetch } from '../../support/mockFetch'

// Downloads in the browser go through a Blob URL and a clicked link; here both are caught so a test can read what would be saved
const saved: { name: string; blob: Blob }[] = []
let lastBlob: Blob
const read = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^﻿/, ''))
    reader.readAsText(blob)
  })

beforeEach(() => {
  saved.length = 0
  URL.createObjectURL = vi.fn((blob: Blob) => ((lastBlob = blob), 'blob:test'))
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: lastBlob })
  })
})
afterEach(() => vi.restoreAllMocks())

const TABLE = { headers: ['Time', 'Flow'], rows: [['2026-01-01 00:00:00', '1.5']] }
const exportAs = (label: string) => userEvent.click(screen.getByRole('button', { name: `Export as ${label}` }))

describe('ExportButtons', () => {
  it('is disabled before a run and when nothing matched, and says why', () => {
    const { rerender } = render(<ExportButtons table={null} view="metadata" truncated={false} />)
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toHaveAttribute('title', 'Run a query with results to export them')
    rerender(<ExportButtons table={{ headers: ['A'], rows: [] }} view="metadata" truncated={false} />)
    expect(screen.getByRole('button', { name: 'Export as JSON' })).toBeDisabled()
  })

  it('saves the table as a CSV, JSON or text file named after the view and the day', async () => {
    render(<ExportButtons table={TABLE} view="readings" truncated={false} />)
    await exportAs('CSV')
    await exportAs('JSON')
    await exportAs('TXT')
    expect(saved.map(({ name }) => name.replace(/\d{4}-\d{2}-\d{2}/, 'DAY'))).toEqual(['query-readings-DAY.csv', 'query-readings-DAY.json', 'query-readings-DAY.txt'])
    expect(saved.map(({ blob }) => blob.type)).toEqual(['text/csv;charset=utf-8', 'application/json;charset=utf-8', 'text/plain;charset=utf-8'])
    expect(await read(saved[0].blob)).toBe('Time,Flow\r\n2026-01-01 00:00:00,1.5\r\n')
    expect(JSON.parse(await read(saved[1].blob))).toEqual([{ Time: '2026-01-01 00:00:00', Flow: '1.5' }])
    expect(await read(saved[2].blob)).toBe('Time\tFlow\n2026-01-01 00:00:00\t1.5\n')
  })

  it('says that only the rows shown are exported when the result was cut off', () => {
    const { rerender } = render(<ExportButtons table={TABLE} view="metadata" truncated={false} />)
    expect(screen.queryByText('Only the rows shown are exported.')).not.toBeInTheDocument()
    rerender(<ExportButtons table={TABLE} view="metadata" truncated />)
    expect(screen.getByText('Only the rows shown are exported.')).toBeInTheDocument()
  })
})

describe('export from the query results window', () => {
  const METADATA: QueryResult = { source: 'live', columns: ['point', 'point.label'], rows: [['wbs:flow-1', 'Feed flow']], total_rows: 1, truncated: false }
  const WIDE: QueryResult = {
    source: 'live',
    columns: ['time', 'Pump 1 | s223:Pump_data__intake in flow rate'],
    rows: [['2026-01-01 00:00:00', '1.5']],
    total_rows: 1,
    truncated: false,
  }
  const routes = {
    'GET /api/query/attributes': { body: [] },
    'POST /api/query/run': (body: unknown) => ({ body: (body as { options?: unknown }).options ? WIDE : METADATA }),
  }

  it('exports the metadata with the names it shows, not the identifiers', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    const builder = screen.getByRole('region', { name: 'Query builder' })
    await userEvent.click(within(builder).getByRole('button', { name: 'Use measurements' }))
    await userEvent.click(within(builder).getByRole('button', { name: 'Run' }))
    await screen.findByRole('cell', { name: 'Feed flow' })
    await exportAs('CSV')
    expect(saved[0].name).toMatch(/^query-metadata-/)
    expect(await read(saved[0].blob)).toBe('point\r\nFeed flow\r\n')
  })

  it('exports the readings with the same entity and stream names as the table header', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    const builder = screen.getByRole('region', { name: 'Query builder' })
    await userEvent.click(within(builder).getByRole('button', { name: 'Use measurements' }))
    await userEvent.click(within(builder).getByRole('button', { name: 'Run' }))
    await screen.findByRole('cell', { name: 'Feed flow' })
    await userEvent.click(screen.getByRole('button', { name: 'View readings' }))
    await screen.findByRole('columnheader', { name: 'Pump 1' })
    await exportAs('CSV')
    expect(saved[0].name).toMatch(/^query-readings-/)
    expect(await read(saved[0].blob)).toBe('Time,Pump 1 | Intake In (Flow Rate)\r\n2026-01-01 00:00:00,1.5\r\n')
  })
})
