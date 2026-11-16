import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '../../../src/api/types'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'
import { mockFetch, requestBodies } from '../../support/mockFetch'

// What the Query results window shows for the streams picked in the Streams window (the `streams` prop)

const CPU = 'ns1:cpu_percent'
const PUMP = 'plant:pump_state'
const META: QueryResult = {
  source: 'live',
  columns: ['point', 'point.label'],
  rows: [[CPU, 'CPU usage'], [PUMP, 'Pump state']],
  total_rows: 2,
  truncated: false,
}
const READINGS: QueryResult = { source: 'live', columns: ['time', 'CPU usage'], rows: [['2026-01-01 00:00:00', '15.5']], total_rows: 1, truncated: false }
const BUILDER_RESULT: QueryResult = { source: 'live', columns: ['point', 'point.label'], rows: [['wbs:flow-1', 'Feed flow']], total_rows: 1, truncated: false }

const STREAMS = 'POST /api/query/streams'
const RUN = 'POST /api/query/run'
const routes = {
  'GET /api/query/attributes': { body: [] },
  [STREAMS]: (body: unknown) => ({ body: (body as { options?: { view: string } }).options?.view === 'readings' ? READINGS : META }),
  [RUN]: { body: BUILDER_RESULT },
}

const results = () => screen.getByRole('region', { name: 'Query results' })
const resultsButton = (name: string) => within(results()).getByRole('button', { name })

describe('QueryWorkspace with picked streams', () => {
  it('sends nothing and keeps the empty prompt while no stream is picked', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace streams={[]} />)
    expect(screen.getByText('Run a query to see its results.')).toBeInTheDocument()
    expect(requestBodies(fetchMock, STREAMS)).toEqual([])
  })

  it('shows the picked streams as rows of the metadata table', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace streams={[CPU, PUMP]} />)
    expect(await within(results()).findByRole('cell', { name: 'CPU usage' })).toBeInTheDocument()
    expect(within(results()).getByRole('cell', { name: 'Pump state' })).toBeInTheDocument()
    expect(within(results()).getByText('2 streams selected')).toBeInTheDocument()
    expect(requestBodies(fetchMock, STREAMS)).toEqual([{ points: [CPU, PUMP] }]) // the metadata view is the backend's default, so no options are sent
  })

  it('says "1 stream selected" for a single stream', async () => {
    mockFetch(routes)
    render(<QueryWorkspace streams={[CPU]} />)
    expect(await within(results()).findByText('1 stream selected')).toBeInTheDocument()
  })

  it('asks again when the picks change, and shows the newest answer', async () => {
    const fetchMock = mockFetch(routes)
    const { rerender } = render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    rerender(<QueryWorkspace streams={[CPU, PUMP]} />)
    expect(await within(results()).findByText('2 streams selected')).toBeInTheDocument()
    expect(requestBodies(fetchMock, STREAMS)).toEqual([{ points: [CPU] }, { points: [CPU, PUMP] }])
  })

  it('does not ask again when it is rendered again with the same picks', async () => {
    const fetchMock = mockFetch(routes)
    const { rerender } = render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    rerender(<QueryWorkspace streams={[CPU]} />) // a new array with the same points
    expect(requestBodies(fetchMock, STREAMS)).toHaveLength(1)
  })

  it('leaves the last results showing when the picks are cleared', async () => {
    const fetchMock = mockFetch(routes)
    const { rerender } = render(<QueryWorkspace streams={[CPU, PUMP]} />)
    await within(results()).findByRole('cell', { name: 'CPU usage' })
    rerender(<QueryWorkspace streams={[]} />)
    expect(within(results()).getByRole('cell', { name: 'CPU usage' })).toBeInTheDocument()
    expect(requestBodies(fetchMock, STREAMS)).toHaveLength(1)
  })

  it('can view the readings of the picked streams without any builder step, and go back to the metadata', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    await userEvent.click(resultsButton('View readings'))
    expect(await within(results()).findByRole('columnheader', { name: /cpu usage/i })).toBeInTheDocument()
    expect(requestBodies(fetchMock, STREAMS)[1]).toEqual({ points: [CPU], options: expect.objectContaining({ view: 'readings' }) })

    await userEvent.click(resultsButton('Back to metadata'))
    expect(await within(results()).findByRole('cell', { name: 'CPU usage' })).toBeInTheDocument()
    expect(requestBodies(fetchMock, RUN)).toEqual([]) // the builder was never involved
  })

  it('keeps the readings view when the picks change', async () => {
    const fetchMock = mockFetch(routes)
    const { rerender } = render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    await userEvent.click(resultsButton('View readings'))
    await within(results()).findByRole('columnheader', { name: /cpu usage/i })
    rerender(<QueryWorkspace streams={[CPU, PUMP]} />)
    await waitFor(() => expect(requestBodies(fetchMock, STREAMS)).toHaveLength(3))
    expect(requestBodies(fetchMock, STREAMS)[2]).toEqual({ points: [CPU, PUMP], options: expect.objectContaining({ view: 'readings' }) })
  })

  it('goes back to the builder results when Run is pressed in the query builder', async () => {
    mockFetch(routes)
    render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    const builder = screen.getByRole('region', { name: 'Query builder' })
    await userEvent.click(within(builder).getByRole('button', { name: 'Use measurements' }))
    await userEvent.click(within(builder).getByRole('button', { name: 'Run' }))
    expect(await within(results()).findByRole('cell', { name: 'Feed flow' })).toBeInTheDocument()
    expect(within(results()).queryByText('1 stream selected')).not.toBeInTheDocument()
  })

  it('does not clear the picked streams readings when the builder steps are edited', async () => {
    mockFetch(routes)
    render(<QueryWorkspace streams={[CPU]} />)
    await within(results()).findByText('1 stream selected')
    await userEvent.click(resultsButton('View readings'))
    await within(results()).findByRole('columnheader', { name: /cpu usage/i })
    const builder = screen.getByRole('region', { name: 'Query builder' })
    await userEvent.click(within(builder).getByRole('button', { name: 'Add entity' }))
    expect(within(results()).getByRole('columnheader', { name: /cpu usage/i })).toBeInTheDocument()
  })

  it('shows a rejected selection in the results window and no old table', async () => {
    mockFetch({ ...routes, [STREAMS]: { status: 400, body: { detail: "No stream found for 'ns1:gone'" } } })
    render(<QueryWorkspace streams={['ns1:gone']} />)
    expect(await within(results()).findByRole('alert')).toHaveTextContent("No stream found for 'ns1:gone'")
    expect(within(results()).queryByRole('table')).not.toBeInTheDocument()
  })

  it('flags sample rows', async () => {
    mockFetch({ ...routes, [STREAMS]: { body: { ...META, source: 'sample' } } })
    render(<QueryWorkspace streams={[CPU]} />)
    expect(await within(results()).findByText('Sample data')).toBeInTheDocument()
  })

  it('shows the answer to the newest picks even when an older request answers last', async () => {
    const answers: ((result: QueryResult) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/query/attributes') return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      const result = await new Promise<QueryResult>((resolve) => answers.push(resolve))
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const { rerender } = render(<QueryWorkspace streams={[CPU]} />)
    await waitFor(() => expect(answers).toHaveLength(1))
    rerender(<QueryWorkspace streams={[CPU, PUMP]} />)
    await waitFor(() => expect(answers).toHaveLength(2))
    answers[1](META) // the newest request answers first ...
    await within(results()).findByText('2 streams selected')
    answers[0]({ ...META, rows: [[CPU, 'CPU usage']], total_rows: 1 }) // ... and the stale one afterwards
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(within(results()).getByText('2 streams selected')).toBeInTheDocument()
    expect(within(results()).getByRole('cell', { name: 'Pump state' })).toBeInTheDocument()
  })
})
