import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import StatusPanel from '../../../src/components/status/StatusPanel'
import { mockFetch } from '../../support/mockFetch'

describe('StatusPanel', () => {
  it('collapses to its title and expands again when the title is clicked', async () => {
    mockFetch({}) // backend down: the rows just say unreachable
    render(<StatusPanel />)
    const panel = screen.getByRole('complementary', { name: 'System status' }) // <aside> is a "complementary" region
    const toggle = screen.getByRole('button', { name: 'Status' })
    expect(screen.getByText(/Frontend/)).toBeVisible()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/Frontend/)).not.toBeVisible()
    expect(panel).toHaveClass('status-panel--collapsed') // the CSS narrows it to a strip

    await userEvent.click(toggle)
    expect(screen.getByText(/Frontend/)).toBeVisible()
    expect(panel).not.toHaveClass('status-panel--collapsed')
  })
})
