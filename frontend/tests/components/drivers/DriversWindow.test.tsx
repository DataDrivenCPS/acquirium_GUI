import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FAILED_DRIVER, METRICS_DRIVER } from '../../support/fixtures'
import { mockFetch } from '../../support/mockFetch'
import DriversWindow from '../../../src/components/drivers/DriversWindow'

describe('DriversWindow', () => {
  it('lists each driver with its status, interval and spec', async () => {
    mockFetch({ 'GET /api/drivers': { body: { source: 'live', drivers: [METRICS_DRIVER] } } })
    render(<DriversWindow />)
    const row = (await screen.findByRole('cell', { name: 'SystemMetricsDriver' })).closest('tr')!
    expect(within(row).getByRole('cell', { name: 'running' })).toBeInTheDocument()
    expect(within(row).getByRole('cell', { name: '2' })).toBeInTheDocument()
    expect(within(row).getByText(METRICS_DRIVER.spec)).toBeInTheDocument()
  })

  it('shows a failed driver in the error color', async () => {
    mockFetch({ 'GET /api/drivers': { body: { source: 'live', drivers: [FAILED_DRIVER] } } })
    render(<DriversWindow />)
    expect(await screen.findByText('failed: connection refused')).toHaveClass('text-error')
  })

  it('flags sample drivers', async () => {
    mockFetch({ 'GET /api/drivers': { body: { source: 'sample', drivers: [METRICS_DRIVER] } } })
    render(<DriversWindow />)
    expect(await screen.findByText('Sample data')).toBeInTheDocument()
  })
})
