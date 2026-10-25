import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Candidate, QueryAttribute, QueryResult } from '../../../src/api/types'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'
import { mockFetch, requestBodies } from '../../support/mockFetch'

const ATTRIBUTES: QueryAttribute[] = [
  { name: 'medium', roles: ['data', 'entity'], doc: 'carried medium' },
  { name: 'unit', roles: ['data'], doc: 'unit of measure' },
]
const RESULT: QueryResult = {
  source: 'live',
  columns: ['point', 'point.label'],
  rows: [['wbs:flow-1', 'Feed flow'], ['wbs:flow-2', null]],
  total_rows: 2,
  truncated: false,
}
const PUMP: Candidate = { uri: 'http://data.ashrae.org/standard223#Pump', label: 'Pump', score: 0.82, source: 'ASHRAE 223' }
const PIPE: Candidate = { uri: 'ns1:Pipe', label: 'Pipe', score: 0.78, source: null }

const RUN = 'POST /api/query/run'
const routes = { 'GET /api/query/attributes': { body: ATTRIBUTES }, [RUN]: { body: RESULT } }

const builder = () => screen.getByRole('region', { name: 'Query builder' })
const step = (n: number, kind: string) => within(builder()).getByRole('group', { name: `Step ${n}: ${kind}` })
const button = (name: string) => within(builder()).getByRole('button', { name })

describe('QueryWorkspace', () => {
  it('keeps the three windows in place and the Python window asks for a step', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    for (const title of ['Query builder', 'Python', 'Query results']) {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
    }
    expect(within(screen.getByRole('region', { name: 'Python' })).getByText('Add a step to see the query as Python.')).toBeInTheDocument()
    expect(screen.getByText('Run a query to see its results.')).toBeInTheDocument()
  })

  it('adds a step for each button, numbered in order, and removes one', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.click(button('Add related entity'))
    await userEvent.click(button('Use measurements'))
    await userEvent.click(button('Refocus'))
    await userEvent.click(button('Add filter step'))
    const legends = within(builder()).getAllByRole('group').map((g) => within(g).getByText(/^Step \d/).textContent)
    expect(legends).toEqual(['Step 1: entity', 'Step 2: related', 'Step 3: measurement', 'Step 4: refocus', 'Step 5: where'])

    await userEvent.click(within(step(2, 'related')).getByRole('button', { name: 'Remove step' }))
    expect(within(builder()).queryByRole('group', { name: 'Step 5: where' })).not.toBeInTheDocument()
    expect(step(2, 'measurement')).toBeInTheDocument() // later steps move up
  })

  it('never contacts the backend to run while the steps are only being edited (just the attribute list loads)', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 'tank')
    await userEvent.click(button('Add related entity'))
    expect(requestBodies(fetchMock, RUN)).toEqual([])
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/query/attributes'])
  })

  it('disables Run until there is a step', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    expect(button('Run')).toBeDisabled()
    await userEvent.click(button('Add entity'))
    expect(button('Run')).toBeEnabled()
  })

  it('offers the attributes from the backend in a filter, and sends the filter with the step', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Use measurements'))
    await userEvent.click(within(step(1, 'measurement')).getByRole('button', { name: 'Add filter' }))
    const attr = within(step(1, 'measurement')).getByLabelText('Filter attribute')
    await waitFor(() => expect(within(attr).getAllByRole('option').map((o) => o.textContent)).toEqual(['medium', 'unit']))
    await userEvent.selectOptions(attr, 'unit')
    await userEvent.type(within(step(1, 'measurement')).getByLabelText('Filter value'), 'BAR')
    await userEvent.click(within(step(1, 'measurement')).getByLabelText('Exclude'))
    await userEvent.click(button('Run'))
    await screen.findByRole('cell', { name: 'Feed flow' })
    expect(requestBodies(fetchMock, RUN)).toEqual([
      { steps: [expect.objectContaining({ kind: 'measurement', filters: [{ attr: 'unit', value: 'BAR', exclude: true }] })] },
    ])
  })

  it('starts a filter step with a filter on the first attribute and removes a filter', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add filter step'))
    const where = step(1, 'where')
    await waitFor(() => expect(within(where).getByLabelText('Filter attribute')).toHaveValue('medium'))
    await userEvent.click(within(where).getByRole('button', { name: 'Remove filter' }))
    expect(within(where).queryByLabelText('Filter attribute')).not.toBeInTheDocument()
  })

  it('runs the steps and shows the returned table', async () => {
    const fetchMock = mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 'tank')
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Alias'), 't')
    await userEvent.click(button('Add related entity'))
    await userEvent.selectOptions(within(step(2, 'related')).getByLabelText('Direction'), 'downstream')
    await userEvent.type(within(step(2, 'related')).getByLabelText('Max depth'), '2')
    await userEvent.selectOptions(within(step(2, 'related')).getByLabelText('Nearest'), 'no')
    await userEvent.click(button('Run'))

    const results = screen.getByRole('region', { name: 'Query results' })
    expect(await within(results).findByRole('columnheader', { name: 'point' })).toBeInTheDocument()
    expect(within(results).getByRole('cell', { name: 'Feed flow' })).toBeInTheDocument() // the label, not 'wbs:flow-1'
    expect(within(results).getByRole('cell', { name: 'flow-2' })).toBeInTheDocument() // no label: readable end of the identifier
    expect(within(results).queryByText('wbs:flow-1')).not.toBeInTheDocument()
    expect(within(results).queryByRole('columnheader', { name: 'point.label' })).not.toBeInTheDocument()
    expect(within(results).getByText('2 rows')).toBeInTheDocument()
    expect(within(results).queryByText('Sample data')).not.toBeInTheDocument()

    const [{ steps }] = requestBodies(fetchMock, RUN) as { steps: unknown[] }[]
    expect(steps).toEqual([
      expect.objectContaining({ kind: 'entity', cls: 'tank', alias: 't', filters: [] }),
      expect.objectContaining({ kind: 'related', direction: 'downstream', max_depth: 2, nearest: false }),
    ])
  })

  it('says when only the first rows of a longer table are shown', async () => {
    mockFetch({ ...routes, [RUN]: { body: { ...RESULT, total_rows: 5000, truncated: true } } })
    render(<QueryWorkspace />)
    await userEvent.click(button('Use measurements'))
    await userEvent.click(button('Run'))
    expect(await screen.findByText('Showing the first 2 of 5,000 rows')).toBeInTheDocument()
  })

  it('flags a sample result', async () => {
    mockFetch({ ...routes, [RUN]: { body: { ...RESULT, source: 'sample' } } })
    render(<QueryWorkspace />)
    await userEvent.click(button('Use measurements'))
    await userEvent.click(button('Run'))
    const results = screen.getByRole('region', { name: 'Query results' })
    expect(await within(results).findByText('Sample data')).toBeInTheDocument()
  })

  it('shows a rejected query as a message in the builder, keeping the steps', async () => {
    mockFetch({ ...routes, [RUN]: { status: 400, body: { detail: 'refocus: unknown alias', candidates: [], text: null } } })
    render(<QueryWorkspace />)
    await userEvent.click(button('Refocus'))
    await userEvent.type(within(step(1, 'refocus')).getByLabelText('Alias'), 'nope')
    await userEvent.click(button('Run'))
    expect(await within(builder()).findByRole('alert')).toHaveTextContent('refocus: unknown alias')
    expect(within(builder()).queryByRole('list', { name: 'Closest matches' })).not.toBeInTheDocument()
    expect(within(step(1, 'refocus')).getByLabelText('Alias')).toHaveValue('nope')
  })

  it('lists the closest matches for text that did not match, and fills the class when one is picked', async () => {
    let call = 0
    const fetchMock = mockFetch({
      ...routes,
      [RUN]: () => {
        call += 1
        return call === 1
          ? { status: 400, body: { detail: "Several close matches for 'pmp'; choose one", candidates: [PUMP, PIPE], text: 'pmp' } }
          : { body: RESULT }
      },
    })
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 'pmp')
    await userEvent.click(button('Run'))

    expect(await within(builder()).findByRole('alert')).toHaveTextContent("Several close matches for 'pmp'")
    const matches = within(builder()).getByRole('list', { name: 'Closest matches' })
    expect(within(matches).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pump (ASHRAE 223), score 0.82', // the source tells same-named nodes apart; no identifiers are shown
      'Pipe, score 0.78',
    ])

    await userEvent.click(within(matches).getByRole('button', { name: /Pump/ }))
    expect(within(step(1, 'entity')).getByLabelText('Class')).toHaveValue('Pump') // the name, not the identifier
    expect(within(builder()).queryByRole('alert')).not.toBeInTheDocument()

    // picking runs the query by itself: no second press of Run
    await screen.findByRole('cell', { name: 'Feed flow' })
    expect(requestBodies(fetchMock, RUN)).toHaveLength(2)
    expect(requestBodies(fetchMock, RUN)[1]).toEqual({ steps: [expect.objectContaining({ cls: PUMP.uri })] }) // but the identifier is what runs
  })

  it('says when the backend is unreachable, keeping the steps', async () => {
    mockFetch({ 'GET /api/query/attributes': { body: ATTRIBUTES } }) // no run route: the request fails like a network error
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.click(button('Run'))
    expect(await within(builder()).findByRole('alert')).toHaveTextContent('Backend unreachable')
    expect(step(1, 'entity')).toBeInTheDocument()
  })

  it('still builds steps when the attribute list cannot be loaded, and says so', async () => {
    mockFetch({ [RUN]: { body: RESULT } }) // no attributes route
    render(<QueryWorkspace />)
    expect(await within(builder()).findByText('Could not load the attribute list; filters are unavailable.')).toBeInTheDocument()
    await userEvent.click(button('Add entity'))
    expect(step(1, 'entity')).toBeInTheDocument()
  })

  it('does not ask for an identifier: entity and related steps have no URI field', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.click(button('Add related entity'))
    expect(within(builder()).queryByLabelText('URI')).not.toBeInTheDocument()
  })

  it('forgets the chosen node when the class is edited afterwards, so the typed text runs instead', async () => {
    let call = 0
    const fetchMock = mockFetch({
      ...routes,
      [RUN]: () => (++call === 1 ? { status: 400, body: { detail: 'close', candidates: [PUMP], text: 'pmp' } } : { body: RESULT }),
    })
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 'pmp')
    await userEvent.click(button('Run'))
    await userEvent.click(await within(builder()).findByRole('button', { name: /Pump/ })) // runs with the pick
    await screen.findByRole('cell', { name: 'Feed flow' })
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 's')
    await userEvent.click(button('Run'))
    await waitFor(() => expect(requestBodies(fetchMock, RUN)).toHaveLength(3))
    expect(requestBodies(fetchMock, RUN)[2]).toEqual({ steps: [expect.objectContaining({ cls: 'Pumps' })] })
  })

  it('tells the user that Via takes plain words', async () => {
    mockFetch(routes)
    render(<QueryWorkspace />)
    await userEvent.click(button('Add related entity'))
    expect(within(step(1, 'related')).getByLabelText('Via')).toHaveAttribute('placeholder', 'e.g. feeds (blank: any)')
  })

  it.each([
    ['a text that does not match', { status: 400, body: { detail: "No confident match for 'pmp'", candidates: [PUMP], text: 'pmp' } }],
    ['a rejected query', { status: 400, body: { detail: 'refocus: unknown alias', candidates: [], text: null } }],
  ])('clears the earlier results when a later run fails on %s, so they are not mistaken for the new query', async (_, failure) => {
    let call = 0
    mockFetch({ ...routes, [RUN]: () => (++call === 1 ? { body: RESULT } : failure) })
    render(<QueryWorkspace />)
    await userEvent.click(button('Use measurements'))
    await userEvent.click(button('Run'))
    await screen.findByRole('cell', { name: 'Feed flow' })

    await userEvent.click(button('Run'))
    expect(await within(builder()).findByRole('alert')).toBeInTheDocument()
    const results = screen.getByRole('region', { name: 'Query results' })
    expect(within(results).queryByRole('cell', { name: 'Feed flow' })).not.toBeInTheDocument()
    expect(within(results).getByText('Run a query to see its results.')).toBeInTheDocument()
  })

  it('shows the next unmatched text when the run after a pick fails on another step', async () => {
    const TANK: Candidate = { uri: 'urn:nawi-water-ontology#Tank', label: 'Tank', score: 0.8, source: 'Water ontology' }
    let call = 0
    mockFetch({
      ...routes,
      [RUN]: () => {
        call += 1
        return call === 1
          ? { status: 400, body: { detail: "close matches for 'pmp'", candidates: [PUMP], text: 'pmp' } }
          : { status: 400, body: { detail: "close matches for 'tnk'", candidates: [TANK], text: 'tnk' } }
      },
    })
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.type(within(step(1, 'entity')).getByLabelText('Class'), 'pmp')
    await userEvent.click(button('Add related entity'))
    await userEvent.type(within(step(2, 'related')).getByLabelText('Class'), 'tnk')
    await userEvent.click(button('Run'))
    await userEvent.click(await within(builder()).findByRole('button', { name: /Pump/ }))
    expect(await within(builder()).findByRole('button', { name: /Tank/ })).toBeInTheDocument()
    expect(within(step(1, 'entity')).getByLabelText('Class')).toHaveValue('Pump')
  })

  it('lets the user pick a candidate for an ambiguous filter value, then carries on with the run', async () => {
    let call = 0
    const fetchMock = mockFetch({
      ...routes,
      [RUN]: () =>
        ++call === 1
          ? { status: 400, body: { detail: "Several close matches for 'pump'", candidates: [PUMP, PIPE], text: 'pump', field: 'type' } }
          : { body: RESULT },
    })
    render(<QueryWorkspace />)
    await userEvent.click(button('Add entity'))
    await userEvent.click(within(step(1, 'entity')).getByRole('button', { name: 'Add filter' }))
    const filter = within(step(1, 'entity'))
    await waitFor(() => expect(within(filter.getByLabelText('Filter attribute')).getAllByRole('option')).toHaveLength(2))
    await userEvent.selectOptions(filter.getByLabelText('Filter attribute'), 'medium') // not the failing attribute
    await userEvent.type(filter.getByLabelText('Filter value'), 'pump')
    await userEvent.click(button('Run'))

    await userEvent.click(await within(builder()).findByRole('button', { name: /Pump \(ASHRAE 223\)/ }))
    await screen.findByRole('cell', { name: 'Feed flow' }) // the run carried on by itself
    // this filter is on 'medium', the error was about 'type', so it keeps what the user typed
    expect(filter.getByLabelText('Filter value')).toHaveValue('pump')
    expect(requestBodies(fetchMock, RUN)).toHaveLength(2)
  })

  it('fills the failing filter with the name, sends its identifier, and forgets the pick when the value is edited', async () => {
    let call = 0
    const fetchMock = mockFetch({
      ...routes,
      [RUN]: () =>
        ++call === 1
          ? { status: 400, body: { detail: 'close', candidates: [PUMP], text: 'pump', field: 'medium' } }
          : { body: RESULT },
    })
    render(<QueryWorkspace />)
    await userEvent.click(button('Use measurements'))
    await userEvent.click(within(step(1, 'measurement')).getByRole('button', { name: 'Add filter' }))
    const filter = within(step(1, 'measurement'))
    await userEvent.type(filter.getByLabelText('Filter value'), 'pump')
    await userEvent.click(button('Run'))
    await userEvent.click(await within(builder()).findByRole('button', { name: /Pump/ }))
    await screen.findByRole('cell', { name: 'Feed flow' })
    expect(filter.getByLabelText('Filter value')).toHaveValue('Pump') // the name, not the identifier
    expect(requestBodies(fetchMock, RUN)[1]).toEqual({
      steps: [expect.objectContaining({ filters: [{ attr: 'medium', value: PUMP.uri, exclude: false }] })],
    })

    await userEvent.type(filter.getByLabelText('Filter value'), 's')
    await userEvent.click(button('Run'))
    await waitFor(() => expect(requestBodies(fetchMock, RUN)).toHaveLength(3))
    expect(requestBodies(fetchMock, RUN)[2]).toEqual({
      steps: [expect.objectContaining({ filters: [{ attr: 'medium', value: 'Pumps', exclude: false }] })],
    })
  })
})
