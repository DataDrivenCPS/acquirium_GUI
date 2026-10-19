import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CPU, PUMP_STATE } from '../../support/fixtures'
import { mockFetch } from '../../support/mockFetch'
import StreamsWindow from '../../../src/components/streams/StreamsWindow'

const streamsWindow = () => screen.getByRole('region', { name: 'Streams' })

describe('StreamsWindow', () => {
  it('lists each stream with its newest reading', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } } })
    render(<StreamsWindow />)
    const cpuRow = (await screen.findByRole('cell', { name: 'CPU usage' })).closest('tr')!
    expect(within(cpuRow).getByRole('cell', { name: '15.5' })).toBeInTheDocument()
    expect(within(cpuRow).getByRole('cell', { name: 'unit:PERCENT' })).toBeInTheDocument()
    const pumpRow = screen.getByRole('cell', { name: 'Pump state' }).closest('tr')!
    expect(within(pumpRow).getByRole('cell', { name: 'running' })).toBeInTheDocument()
    expect(within(streamsWindow()).queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('flags sample streams', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'sample', streams: [CPU] } } })
    render(<StreamsWindow />)
    expect(await within(streamsWindow()).findByText('Sample data')).toBeInTheDocument()
  })

  it('narrows the list with the filter box', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } } })
    render(<StreamsWindow />)
    await screen.findByText('2 of 2 streams')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter streams' }), 'scada')
    expect(screen.getByText('1 of 2 streams')).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'CPU usage' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter streams' }), ' nothing')
    expect(screen.getByText('No streams match the filter.')).toBeInTheDocument()
  })

  it('says when the backend is unreachable', async () => {
    mockFetch({})
    render(<StreamsWindow />)
    expect(await screen.findByText(/Backend unreachable/)).toBeInTheDocument()
  })
})
