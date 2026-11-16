import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App'
import { CPU, PUMP_STATE } from './support/fixtures'
import { mockFetch, requestBodies } from './support/mockFetch'

describe('App', () => {
  it('lists the windows in screen order: streams and graph, the query tools, then drivers', () => {
    mockFetch({}) // no backend: the windows just say they're waiting for it to start
    render(<App />)
    // the page's order also decides the Tab key order, so it must match where App.css places the windows
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Streams',
      'Graph',
      'Query builder',
      'Python',
      'Query results',
      'Drivers',
    ])
    expect(screen.getByRole('complementary', { name: 'System status' })).toBeInTheDocument()
  })

  it('shows the streams clicked in the Streams window in the Query results window', async () => {
    const meta = { source: 'live', columns: ['point', 'point.label'], rows: [[CPU.point, 'CPU usage'], [PUMP_STATE.point, 'Pump state']], total_rows: 2, truncated: false }
    const fetchMock = mockFetch({
      'GET /api/streams': { body: { source: 'live', streams: [CPU, PUMP_STATE] } },
      'POST /api/query/streams': { body: meta },
    })
    render(<App />)
    const streams = screen.getByRole('region', { name: 'Streams' })
    const user = userEvent.setup()
    await user.click((await within(streams).findByRole('cell', { name: 'CPU usage' })).closest('tr')!)
    await user.keyboard('{Control>}')
    await user.click(within(streams).getByRole('cell', { name: 'Pump state' }).closest('tr')!)

    const results = screen.getByRole('region', { name: 'Query results' })
    expect(await within(results).findByText('2 streams selected')).toBeInTheDocument()
    expect(requestBodies(fetchMock, 'POST /api/query/streams').at(-1)).toEqual({ points: [CPU.point, PUMP_STATE.point] })
    expect(within(streams).getAllByRole('row', { selected: true })).toHaveLength(2)
  })
})
