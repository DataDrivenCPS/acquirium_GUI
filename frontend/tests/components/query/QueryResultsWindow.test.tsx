import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QueryResult } from '../../../src/api/types'
import QueryResultsWindow from '../../../src/components/query/QueryResultsWindow'

const result: QueryResult = {
  source: 'live',
  columns: ['data', 'data.quantity_kind', 'data.unit'],
  rows: [
    ['wbs:p1', 'quantitykind:Pressure', 'unit:BAR'],
    ['wbs:p2', 'quantitykind:DimensionlessRatio', 'unit:UNITLESS'],
    ['wbs:p3', null, null],
  ],
  total_rows: 3,
  truncated: false,
}

describe('QueryResultsWindow', () => {
  it('shows units and quantity kinds without namespaces, with the full name as alt text', () => {
    render(<QueryResultsWindow result={result} />)
    expect(screen.getByTitle('quantitykind:Pressure')).toHaveTextContent('Pressure')
    expect(screen.getByTitle('unit:BAR')).toHaveTextContent('BAR')
    expect(screen.queryByText('unit:BAR')).not.toBeInTheDocument()
  })

  it('shows unitless units as unitless', () => {
    render(<QueryResultsWindow result={result} />)
    expect(screen.getByTitle('unit:UNITLESS')).toHaveTextContent('unitless')
  })

  it('shows a dash for a missing unit', () => {
    render(<QueryResultsWindow result={result} />)
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(2)
  })
})
