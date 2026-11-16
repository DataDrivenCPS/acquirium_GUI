import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CPU, PUMP_STATE } from '../../support/fixtures'
import { mockFetch } from '../../support/mockFetch'
import StreamsWindow from '../../../src/components/streams/StreamsWindow'

const streamsWindow = () => screen.getByRole('region', { name: 'Streams' })

describe('StreamsWindow', () => {
  it('lists each stream with its newest reading', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } } })
    render(<StreamsWindow selected={[]} onSelect={() => {}} />)
    const cpuRow = (await screen.findByRole('cell', { name: 'CPU usage' })).closest('tr')!
    expect(within(cpuRow).getByRole('cell', { name: '15.5' })).toBeInTheDocument()
    expect(within(cpuRow).getByRole('cell', { name: 'PERCENT' })).toBeInTheDocument()
    expect(within(cpuRow).getByTitle('unit:PERCENT')).toBeInTheDocument()
    expect(within(cpuRow).getByTitle('quantitykind:DimensionlessRatio')).toHaveTextContent('DimensionlessRatio')
    const pumpRow = screen.getByRole('cell', { name: 'Pump state' }).closest('tr')!
    expect(within(pumpRow).getByRole('cell', { name: 'running' })).toBeInTheDocument()
    expect(within(streamsWindow()).queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('shows unitless streams as unitless, with the full name as alt text', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'live', streams: [{ ...CPU, unit: 'unit:UNITLESS' }] } } })
    render(<StreamsWindow selected={[]} onSelect={() => {}} />)
    expect(await screen.findByTitle('unit:UNITLESS')).toHaveTextContent('unitless')
  })

  it('flags sample streams', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'sample', streams: [CPU] } } })
    render(<StreamsWindow selected={[]} onSelect={() => {}} />)
    expect(await within(streamsWindow()).findByText('Sample data')).toBeInTheDocument()
  })

  it('narrows the list with the filter box', async () => {
    mockFetch({ 'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } } })
    render(<StreamsWindow selected={[]} onSelect={() => {}} />)
    await screen.findByText('2 of 2 streams')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter streams' }), 'scada')
    expect(screen.getByText('1 of 2 streams')).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'CPU usage' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter streams' }), ' nothing')
    expect(screen.getByText('No streams match the filter.')).toBeInTheDocument()
  })

  it('says it is waiting while the backend has not answered yet', async () => {
    mockFetch({}) // every request fails, like a backend that is still starting
    render(<StreamsWindow selected={[]} onSelect={() => {}} />)
    expect(await screen.findByText('Waiting for the backend to start…')).toBeInTheDocument()
  })
})

describe('StreamsWindow selection', () => {
  const streams = { 'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } } }
  const rowOf = async (label: string) => (await screen.findByRole('cell', { name: label })).closest('tr')!

  it('marks the selected streams, and only those', async () => {
    mockFetch(streams)
    render(<StreamsWindow selected={[CPU.point]} onSelect={() => {}} />)
    expect(await rowOf('CPU usage')).toHaveAttribute('aria-selected', 'true')
    expect(await rowOf('Pump state')).toHaveAttribute('aria-selected', 'false')
  })

  it('selects just the clicked stream, replacing an earlier selection', async () => {
    mockFetch(streams)
    const onSelect = vi.fn()
    render(<StreamsWindow selected={[PUMP_STATE.point]} onSelect={onSelect} />)
    await userEvent.click(await rowOf('CPU usage'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith([CPU.point])
  })

  it('adds a stream to the selection on Ctrl-click, and on Cmd-click', async () => {
    mockFetch(streams)
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<StreamsWindow selected={[CPU.point]} onSelect={onSelect} />)
    await user.keyboard('{Control>}')
    await user.click(await rowOf('Pump state'))
    await user.keyboard('{/Control}{Meta>}')
    await user.click(await rowOf('Pump state'))
    expect(onSelect).toHaveBeenNthCalledWith(1, [CPU.point, PUMP_STATE.point])
    expect(onSelect).toHaveBeenNthCalledWith(2, [CPU.point, PUMP_STATE.point])
  })

  it('takes a selected stream out of the selection on Ctrl-click', async () => {
    mockFetch(streams)
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<StreamsWindow selected={[CPU.point, PUMP_STATE.point]} onSelect={onSelect} />)
    await user.keyboard('{Control>}')
    await user.click(await rowOf('CPU usage'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith([PUMP_STATE.point])
  })

  it('selects with Enter on a focused row', async () => {
    mockFetch(streams)
    const onSelect = vi.fn()
    render(<StreamsWindow selected={[]} onSelect={onSelect} />)
    ;(await rowOf('CPU usage')).focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith([CPU.point])
  })
})
