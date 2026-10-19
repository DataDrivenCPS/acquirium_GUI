import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import DataTable from '../../../src/components/layout/DataTable'
import PolledBody from '../../../src/components/layout/PolledBody'
import Window from '../../../src/components/layout/Window'

describe('Window', () => {
  it('shows its title and content, without a sample flag for live data', () => {
    render(<Window title="Streams" area="streams" source="live">rows here</Window>)
    expect(screen.getByRole('region', { name: 'Streams' })).toHaveTextContent('rows here')
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('flags sample data with a badge and an explanation', () => {
    render(<Window title="Drivers" area="drivers" source="sample">rows</Window>)
    expect(screen.getByText('Sample data')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/made up/)
  })

  it('uses a custom sample note when given one', () => {
    render(<Window title="Results" area="results" source="sample" sampleNote="Not your query.">rows</Window>)
    expect(screen.getByRole('note')).toHaveTextContent('Not your query.')
  })

  it('collapses to its title bar and expands again when the title is clicked', async () => {
    render(<Window title="Streams" area="streams" source="sample">rows here</Window>)
    const toggle = screen.getByRole('button', { name: 'Streams' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('rows here')).not.toBeVisible()
    expect(screen.getByText('rows here')).toBeInTheDocument() // hidden, not removed, so its state survives
    expect(screen.getByRole('note', { hidden: true })).not.toBeVisible()
    expect(screen.getByText('Sample data')).toBeVisible() // still flagged while collapsed

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('rows here')).toBeVisible()
  })

  it('keeps its title-bar actions while collapsed', async () => {
    render(<Window title="Query builder" area="builder" actions={<button type="button">Run</button>}>steps</Window>)
    await userEvent.click(screen.getByRole('button', { name: 'Query builder' }))
    expect(screen.getByRole('button', { name: 'Run' })).toBeVisible()
  })
})

describe('DataTable', () => {
  const columns = [
    { header: 'Name', cell: (row: { name: string; n: number }) => row.name },
    { header: 'N', cell: (row: { name: string; n: number }) => row.n, numeric: true },
  ]

  it('renders a header and one row per item', () => {
    render(<DataTable columns={columns} rows={[{ name: 'a', n: 1 }, { name: 'b', n: 2 }]} rowKey={(r) => r.name} empty="none" />)
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Name', 'N'])
    expect(screen.getAllByRole('row')).toHaveLength(3) // header row + 2
    expect(screen.getByRole('cell', { name: '2' })).toHaveClass('numeric')
  })

  it('shows the empty message instead of an empty table', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.name} empty="Nothing here." />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  })
})

describe('PolledBody', () => {
  it('shows a loading line, an unreachable line, or the rendered data', () => {
    const { rerender } = render(<PolledBody result={{ state: 'checking' }}>{() => 'data'}</PolledBody>)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    rerender(<PolledBody result={{ state: 'unreachable' }}>{() => 'data'}</PolledBody>)
    expect(screen.getByText(/Backend unreachable/)).toBeInTheDocument()
    rerender(<PolledBody result={{ state: 'ok', data: 7 }}>{(n) => `got ${n}`}</PolledBody>)
    expect(screen.getByText('got 7')).toBeInTheDocument()
  })
})
