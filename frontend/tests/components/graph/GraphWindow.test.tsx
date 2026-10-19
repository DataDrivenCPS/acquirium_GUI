import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GraphWindow from '../../../src/components/graph/GraphWindow'

describe('GraphWindow', () => {
  it('is a collapsible placeholder window with no data yet', () => {
    render(<GraphWindow />)
    const graph = screen.getByRole('region', { name: 'Graph' })
    expect(within(graph).getByText(/Placeholder/)).toBeInTheDocument()
    expect(within(graph).getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(graph).queryByText('Sample data')).not.toBeInTheDocument() // it shows no data, so nothing to flag
  })
})
