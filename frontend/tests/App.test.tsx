import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../src/App'
import { mockFetch } from './support/mockFetch'

describe('App', () => {
  it('lists the windows in screen order: streams and graph, the query tools, then drivers', () => {
    mockFetch({}) // no backend: the windows just say it's unreachable
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
})
