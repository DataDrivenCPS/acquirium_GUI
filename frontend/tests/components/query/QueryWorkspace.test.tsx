import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ATTRIBUTES, RESULT } from '../../support/fixtures'
import { mockFetch, requestBodies } from '../../support/mockFetch'
import QueryWorkspace from '../../../src/components/query/QueryWorkspace'

const builder = () => screen.getByRole('region', { name: 'Query builder' })
const python = () => screen.getByRole('region', { name: 'Python' })
const results = () => screen.getByRole('region', { name: 'Query results' })

// A fake backend: the Python window shows how many steps it was sent; runs answer `run`
function backend(run: { status?: number; body: unknown } = { body: RESULT }) {
  return mockFetch({
    'GET /api/query/attributes': { body: ATTRIBUTES },
    'POST /api/query/python': (body) => ({ body: { python: `# ${(body as { steps: unknown[] }).steps.length} steps` } }),
    'POST /api/query/run': run,
  })
}

async function addStep(kind: string) {
  await userEvent.selectOptions(within(builder()).getByLabelText('Step kind'), kind)
  await userEvent.click(within(builder()).getByRole('button', { name: 'Add step' }))
}

describe('QueryWorkspace', () => {
  it('starts empty, with Run disabled', async () => {
    backend()
    render(<QueryWorkspace />)
    expect(within(builder()).getByText(/No steps yet/)).toBeInTheDocument()
    expect(within(builder()).getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(within(results()).getByText(/press Run/)).toBeInTheDocument()
    expect(await within(python()).findByText('# 0 steps')).toBeInTheDocument()
  })

  it('keeps the Python translation in sync with the steps', async () => {
    const fetchMock = backend()
    render(<QueryWorkspace />)
    await addStep('entity')
    await userEvent.type(within(builder()).getByLabelText('Class'), 'Pump')
    expect(await within(python()).findByText('# 1 steps')).toBeInTheDocument()
    // debouncing: typing "Pump" sent one request with the finished word, not one per letter
    await waitFor(() => {
      expect(requestBodies(fetchMock, 'POST /api/query/python').at(-1)).toEqual({
        steps: [{ kind: 'entity', cls: 'Pump', uri: '', alias: '', filters: [] }],
      })
    })
    expect(requestBodies(fetchMock, 'POST /api/query/python').length).toBeLessThan(4)
  })

  it('removes a step and clears all steps', async () => {
    backend()
    render(<QueryWorkspace />)
    await addStep('entity')
    await addStep('measurement')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Remove step 1' }))
    expect(within(builder()).getByRole('group', { name: '1. measurement' })).toBeInTheDocument()
    await userEvent.click(within(builder()).getByRole('button', { name: 'Clear all' }))
    expect(within(builder()).queryByRole('group')).not.toBeInTheDocument()
  })

  it('runs the steps and shows the result table', async () => {
    const fetchMock = backend()
    render(<QueryWorkspace />)
    await addStep('measurement')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
    expect(await within(results()).findByRole('cell', { name: 'CPU usage' })).toBeInTheDocument()
    expect(within(results()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['data', 'data.label'])
    expect(within(results()).getByText(/2 rows/)).toBeInTheDocument()
    expect(requestBodies(fetchMock, 'POST /api/query/run')).toEqual([
      { steps: [{ kind: 'measurement', frm: '', alias: '', direction: '', max_depth: null, nearest: null, filters: [] }] },
    ])
  })

  it('notes when the steps changed after a run', async () => {
    backend()
    render(<QueryWorkspace />)
    await addStep('measurement')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
    await within(results()).findByRole('table')
    expect(within(results()).queryByText(/changed since this run/)).not.toBeInTheDocument()
    await userEvent.type(within(builder()).getByLabelText('Alias'), 'm')
    expect(within(results()).getByText(/changed since this run/)).toBeInTheDocument()
  })

  it('flags a sample result as not the result of the query', async () => {
    backend({ body: { ...RESULT, source: 'sample' } })
    render(<QueryWorkspace />)
    await addStep('measurement')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
    expect(await within(results()).findByText('Sample data')).toBeInTheDocument()
    expect(within(results()).getByRole('note')).toHaveTextContent(/not the result of your query/)
  })

  it('says how many rows were left out of a truncated result', async () => {
    backend({ body: { ...RESULT, total_rows: 5000, truncated: true } })
    render(<QueryWorkspace />)
    await addStep('measurement')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
    expect(await within(results()).findByText(/5000 rows \(showing the first 2\)/)).toBeInTheDocument()
  })

  it('shows Acquirium\'s error message when a run fails', async () => {
    backend({ status: 400, body: { detail: "Could not resolve 'pmup' as class" } })
    render(<QueryWorkspace />)
    await addStep('entity')
    await userEvent.click(within(builder()).getByRole('button', { name: 'Run' }))
    expect(await within(results()).findByText("Could not resolve 'pmup' as class")).toHaveClass('text-error')
  })

  it('shows translation errors in the Python window', async () => {
    mockFetch({
      'GET /api/query/attributes': { body: ATTRIBUTES },
      'POST /api/query/python': { status: 422, body: { detail: [{ loc: ['body', 'steps', 0, 'where', 'filters'], msg: 'List should have at least 1 item' }] } },
    })
    render(<QueryWorkspace />)
    expect(await within(python()).findByText('steps #1 where filters: List should have at least 1 item')).toBeInTheDocument()
  })

  it('copies the Python to the clipboard', async () => {
    backend()
    const user = userEvent.setup() // sets up a fake clipboard, among other things
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    render(<QueryWorkspace />)
    await within(python()).findByText('# 0 steps')
    await user.click(within(python()).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('# 0 steps')
    expect(await within(python()).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
