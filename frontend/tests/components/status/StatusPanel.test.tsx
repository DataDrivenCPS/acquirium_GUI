import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import StatusPanel from '../../../src/components/status/StatusPanel'
import { BUILDING_EMBEDDINGS, CURRENT_GRAPH, DEFAULT_RUNTIME, READY_EMBEDDINGS } from '../../support/fixtures'
import { mockFetch } from '../../support/mockFetch'

// Every status endpoint answering that all is well. Spread it and override one route to break one check.
const HEALTHY = {
  'GET /api/': { body: { message: 'Acquirium GUI backend' } },
  'GET /api/server-health': { body: { ok: true } },
  'GET /api/embedding-status': { body: READY_EMBEDDINGS },
  'GET /api/graph-status': { body: CURRENT_GRAPH },
  'GET /api/runtime-info': { body: DEFAULT_RUNTIME },
}

// The status button; its accessible name starts with "Status" and ends with the summary
const statusButton = () => screen.getByRole('button', { name: /^Status/ })

// Waits until every polled row has its first answer, so the summary reflects real results
const allChecksAnswered = () => waitFor(() => expect(screen.queryByText('checking')).not.toBeInTheDocument())

describe('StatusPanel', () => {
  it('starts as a closed button and drops its rows down when clicked, then closes again', async () => {
    mockFetch({}) // backend not up yet: the rows just say starting
    render(<StatusPanel />)
    expect(statusButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/Frontend/)).not.toBeVisible()

    await userEvent.click(statusButton())
    expect(statusButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Frontend/)).toBeVisible()

    await userEvent.click(statusButton())
    expect(screen.getByText(/Frontend/)).not.toBeVisible()
  })

  it('closes on Escape and puts the focus back on the button', async () => {
    mockFetch({})
    render(<StatusPanel />)
    await userEvent.click(statusButton())

    await userEvent.keyboard('{Escape}')
    expect(screen.getByText(/Frontend/)).not.toBeVisible()
    expect(statusButton()).toHaveFocus()
  })

  it('closes on a click elsewhere on the page, but stays open for clicks inside its list', async () => {
    mockFetch({})
    render(
      <>
        <p>Somewhere else</p>
        <StatusPanel />
      </>,
    )
    await userEvent.click(statusButton())

    await userEvent.click(screen.getByText(/Frontend/))
    expect(screen.getByText(/Frontend/)).toBeVisible()

    await userEvent.click(screen.getByText('Somewhere else'))
    expect(screen.getByText(/Frontend/)).not.toBeVisible()
  })

  it('lists one row per check, filled in from the backend', async () => {
    mockFetch(HEALTHY)
    render(<StatusPanel />)
    await userEvent.click(statusButton())
    await allChecksAnswered()

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent?.trim())
    expect(rows).toEqual([
      expect.stringMatching(/^Frontend: running/),
      'Backend API: healthy',
      'Acquirium server: healthy',
      expect.stringMatching(/^Embedding indexes: ready \(exact-only\)/),
      expect.stringMatching(/^Graph: up to date/),
      'Config: built-in defaults',
      'Acquirium address: 127.0.0.1:51234',
    ])
  })

  it('shows a green "all good" dot when every check is fine', async () => {
    mockFetch(HEALTHY)
    render(<StatusPanel />)
    await allChecksAnswered()

    expect(statusButton()).toHaveAccessibleName('Status: all good')
    expect(statusButton().querySelector('.status-dot')).toHaveClass('status-dot--ok')
  })

  it('shows an amber "waiting" dot while any check is still in progress', async () => {
    mockFetch({ ...HEALTHY, 'GET /api/embedding-status': { body: BUILDING_EMBEDDINGS } })
    render(<StatusPanel />)
    await allChecksAnswered()

    expect(statusButton()).toHaveAccessibleName('Status: waiting')
    expect(statusButton().querySelector('.status-dot')).toHaveClass('status-dot--pending')
  })

  it('shows an amber "waiting" dot, not a red one, while the backend has not answered yet', async () => {
    mockFetch({}) // every request fails, like a backend that is still starting Acquirium
    render(<StatusPanel />)
    await allChecksAnswered()

    // hidden: true also finds the rows while the list is closed
    const rows = screen.getAllByRole('listitem', { hidden: true }).map((row) => row.textContent?.trim())
    expect(rows).toContain('Backend API: starting')
    expect(statusButton()).toHaveAccessibleName('Status: waiting')
    expect(statusButton().querySelector('.status-dot')).toHaveClass('status-dot--pending')
  })

  it('shows a red "problem" dot when any check fails, even while others are still in progress', async () => {
    mockFetch({
      ...HEALTHY,
      'GET /api/server-health': { body: { ok: false } },
      'GET /api/embedding-status': { body: BUILDING_EMBEDDINGS },
    })
    render(<StatusPanel />)
    await allChecksAnswered()

    expect(statusButton()).toHaveAccessibleName('Status: problem')
    expect(statusButton().querySelector('.status-dot')).toHaveClass('status-dot--error')
  })

  it('checks the runtime info once for both the Config and Acquirium address rows', async () => {
    const fetchMock = mockFetch(HEALTHY)
    render(<StatusPanel />)
    await allChecksAnswered()

    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/runtime-info')).toHaveLength(1)
  })
})
