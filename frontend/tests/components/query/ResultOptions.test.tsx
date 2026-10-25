import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { QueryAttribute, QueryResult } from '../../../src/api/types'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'
import { mockFetch, requestBodies } from '../../support/mockFetch'

const ATTRIBUTES: QueryAttribute[] = [{ name: 'medium', roles: ['data', 'entity'], doc: 'carried medium' }]
const METADATA: QueryResult = {
  source: 'live',
  columns: ['point', 'point.label'],
  rows: [['wbs:flow-1', 'Feed flow']],
  total_rows: 1,
  truncated: false,
}
const READINGS: QueryResult = {
  source: 'live',
  columns: ['time', 'flow'],
  rows: [['2026-01-01 00:00:00', '1.5']],
  total_rows: 1,
  truncated: false,
}

const RUN = 'POST /api/query/run'
// metadata unless the request asks for readings
const answer = (body: unknown) => ({ body: (body as { options?: unknown }).options ? READINGS : METADATA })
const routes = { 'GET /api/query/attributes': { body: ATTRIBUTES }, [RUN]: answer }

const builder = () => screen.getByRole('region', { name: 'Query builder' })
const results = () => screen.getByRole('region', { name: 'Query results' })
const panel = () => within(results()).getByRole('form', { name: 'Data aggregation' })
const field = (label: string) => within(panel()).getByLabelText(label)
const viewReadings = () => within(results()).getByRole('button', { name: 'View readings' })
const addMeasurements = () => userEvent.click(within(builder()).getByRole('button', { name: 'Use measurements' }))
const run = () => userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
// a query with a measurements step, run once, showing its metadata
const queryWithMeasurements = async () => {
  await addMeasurements()
  await run()
  await screen.findByRole('cell', { name: 'Feed flow' })
}

describe('readings view', () => {
  it('starts with the metadata and no aggregation panel', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    expect(within(results()).queryByRole('form', { name: 'Data aggregation' })).not.toBeInTheDocument()
    expect(within(results()).queryByRole('button', { name: 'Back to metadata' })).not.toBeInTheDocument()
  })

  it('disables View readings until the query has a measurements step, and says why', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(within(builder()).getByRole('button', { name: 'Add entity' }))
    expect(viewReadings()).toBeDisabled()
    expect(viewReadings()).toHaveAttribute('title', 'Add a measurements step to see readings')
    await addMeasurements()
    expect(viewReadings()).toBeEnabled()
  })

  it('sends only the steps for a plain run', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    expect(Object.keys(requestBodies(fetchMock, RUN)[0] as object)).toEqual(['steps'])
  })

  it('runs the same steps for readings, shows them as returned and opens the aggregation panel beside them', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())

    // a time contains colons: it must not be shortened like an identifier
    expect(await within(results()).findByRole('cell', { name: '2026-01-01 00:00:00' })).toBeInTheDocument()
    expect(within(results()).getByRole('columnheader', { name: 'Time' })).toBeInTheDocument()
    expect(panel()).toBeInTheDocument()
    const [first, second] = requestBodies(fetchMock, RUN) as { steps: unknown[]; options?: unknown }[]
    expect(second.steps).toEqual(first.steps)
    expect(second.options).toEqual({ view: 'readings', order: 'desc', shape: 'wide' })
  })

  it('shows a stream as where and what, keeping the full name on hover', async () => {
    const named: QueryResult = { ...READINGS, columns: ['time', 's223:Pump_data__intake in flow rate'] }
    mockFetch({ ...routes, [RUN]: (body) => ((body as { options?: unknown }).options ? { body: named } : { body: METADATA }) })
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    const header = await within(results()).findByRole('columnheader', { name: 'Intake In (Flow Rate)' })
    expect(header).toHaveAttribute('title', 's223:Pump_data__intake in flow rate')
    expect(within(results()).getByRole('columnheader', { name: 'Time' })).not.toHaveAttribute('title')
  })

  it('applies a limit, an order and a layout from the panel', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    await within(results()).findByRole('cell', { name: '2026-01-01 00:00:00' })

    await userEvent.type(field('Readings per stream'), '10')
    await userEvent.selectOptions(field('Order'), 'asc')
    await userEvent.selectOptions(field('Layout'), 'narrow')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(requestBodies(fetchMock, RUN)).toHaveLength(3))
    expect(requestBodies(fetchMock, RUN)[2]).toMatchObject({ options: { view: 'readings', limit: 10, order: 'asc', shape: 'narrow' } })
  })

  it('groups readings by stream with every aggregate, and fixes the layout while grouped', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    await within(results()).findByRole('cell', { name: '2026-01-01 00:00:00' })

    expect(within(panel()).queryByLabelText('Summarize with')).not.toBeInTheDocument()
    await userEvent.selectOptions(field('Group by'), 'data_alias')
    expect(within(field('Summarize with')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'count', 'mean', 'min', 'max', 'sum', 'first', 'last',
    ])
    expect(field('Layout')).toBeDisabled()

    await userEvent.selectOptions(field('Summarize with'), 'mean')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(requestBodies(fetchMock, RUN)).toHaveLength(3))
    expect(requestBodies(fetchMock, RUN)[2]).toMatchObject({ options: { group_by: ['data_alias'], aggregate: 'mean' } })
  })

  it('goes back to the metadata, and the panel goes away', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    await within(results()).findByRole('cell', { name: '2026-01-01 00:00:00' })

    await userEvent.click(within(results()).getByRole('button', { name: 'Back to metadata' }))
    expect(await within(results()).findByRole('cell', { name: 'Feed flow' })).toBeInTheDocument()
    expect(within(results()).queryByRole('form', { name: 'Data aggregation' })).not.toBeInTheDocument()
    expect(Object.keys(requestBodies(fetchMock, RUN)[2] as object)).toEqual(['steps'])
  })

  it('drops the stale readings when a step is edited, back to an empty metadata view', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    await within(results()).findByRole('cell', { name: '2026-01-01 00:00:00' })

    await userEvent.click(within(builder()).getByRole('button', { name: 'Add entity' }))
    expect(within(results()).queryByRole('cell', { name: '2026-01-01 00:00:00' })).not.toBeInTheDocument()
    expect(within(results()).queryByRole('form', { name: 'Data aggregation' })).not.toBeInTheDocument()
    expect(within(results()).getByText('Run a query to see its results.')).toBeInTheDocument()
  })

  it('shows a rejected option as the builder error, like any rejected query', async () => {
    mockFetch({
      ...routes,
      [RUN]: (body) =>
        (body as { options?: unknown }).options
          ? { status: 422, body: { detail: [{ loc: ['body', 'options', 'limit'], msg: 'Input should be greater than or equal to 1' }] } }
          : { body: METADATA },
    })
    render(<QueryWorkspace />)
    await queryWithMeasurements()
    await userEvent.click(viewReadings())
    expect(await within(builder()).findByRole('alert')).toHaveTextContent('options limit: Input should be greater than or equal to 1')
  })
})
