import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'
import { mockFetch } from '../../support/mockFetch'

describe('QueryWorkspace (stub)', () => {
  it('keeps the three query windows in place, each saying it is not implemented yet', () => {
    const fetchMock = mockFetch({})
    render(<QueryWorkspace />)
    for (const title of ['Query builder', 'Python', 'Query results']) {
      expect(within(screen.getByRole('region', { name: title })).getByText('Not implemented yet.')).toBeInTheDocument()
    }
    expect(fetchMock).not.toHaveBeenCalled() // the stub doesn't call the backend's /query routes
  })
})
