import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import SettingsPanel from '../../../src/components/settings/SettingsPanel'
import { mockFetch, requestBodies } from '../../support/mockFetch'

// What GET /api/settings answers: the values in force, the defaults to reset to, and each value's range
const DEFAULTS = { resolution: { min_score: 0.4, margin: 0.1, candidate_count: 5 }, results: { max_rows: 1000 } }
const LIMITS = {
  resolution: { min_score: { min: 0, max: 1 }, margin: { min: 0, max: 1 }, candidate_count: { min: 1, max: 20 } },
  results: { max_rows: { min: 1, max: 100000 } },
}
const payload = (values = DEFAULTS) => ({ values, defaults: DEFAULTS, limits: LIMITS })

const SAVED_ROWS = { ...DEFAULTS, results: { max_rows: 50 } }

// The settings button; its accessible name starts with "Settings"
const settingsButton = () => screen.getByRole('button', { name: /^Settings/ })
const openPanel = async () => userEvent.click(settingsButton())
// Waits until the saved values are in the form, so edits are made on real data
const loaded = () => screen.findByDisplayValue('1000')

describe('SettingsPanel', () => {
  it('starts as a closed button and drops the window down when clicked, then closes again', async () => {
    mockFetch({ 'GET /api/settings': { body: payload() } })
    render(<SettingsPanel />)
    await loaded()
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Maximum Rows')).not.toBeVisible()

    await openPanel()
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Maximum Rows')).toBeVisible()

    await userEvent.click(settingsButton())
    expect(screen.getByText('Maximum Rows')).not.toBeVisible()
  })

  it('closes on Escape and puts the focus back on the button', async () => {
    mockFetch({ 'GET /api/settings': { body: payload() } })
    render(<SettingsPanel />)
    await loaded()
    await openPanel()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('Maximum Rows')).not.toBeVisible()
    expect(settingsButton()).toHaveFocus()
  })

  it('closes on a click elsewhere on the page, but stays open for clicks inside', async () => {
    mockFetch({ 'GET /api/settings': { body: payload() } })
    render(
      <>
        <p>Somewhere else</p>
        <SettingsPanel />
      </>,
    )
    await loaded()
    await openPanel()
    await userEvent.click(screen.getByText('Maximum Rows'))
    expect(screen.getByText('Maximum Rows')).toBeVisible()
    await userEvent.click(screen.getByText('Somewhere else'))
    expect(screen.getByText('Maximum Rows')).not.toBeVisible()
  })

  it('opens with only the Query results group expanded, and each group bar toggles its settings', async () => {
    mockFetch({ 'GET /api/settings': { body: payload() } })
    render(<SettingsPanel />)
    await loaded()
    await openPanel()
    const resolution = screen.getByRole('button', { name: /Text resolution/ })
    const results = screen.getByRole('button', { name: /Query results/ })
    expect(results).toHaveAttribute('aria-expanded', 'true')
    expect(resolution).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Candidates Shown')).not.toBeVisible()

    await userEvent.click(resolution)
    expect(screen.getByText('Candidates Shown')).toBeVisible()
    await userEvent.click(results)
    expect(screen.getByText('Maximum Rows')).not.toBeVisible()
  })

  it('shows the saved values and the description of each setting', async () => {
    mockFetch({ 'GET /api/settings': { body: payload({ ...DEFAULTS, results: { max_rows: 250 } }) } })
    render(<SettingsPanel />)
    await openPanel()
    expect(await screen.findByLabelText('Maximum Rows')).toHaveValue(250)
    expect(screen.getByText('The maximum amount of rows for every query result.')).toBeInTheDocument()
    expect(screen.getByText('If multiple candidate scores are within this margin, the candidate pick list is triggered.')).toBeInTheDocument()
  })

  it('saves an edit to the backend with every setting, and then says Saved', async () => {
    const fetchMock = mockFetch({
      'GET /api/settings': { body: payload() },
      'PUT /api/settings': { body: payload(SAVED_ROWS) },
    })
    render(<SettingsPanel />)
    await openPanel()
    const maxRows = await screen.findByLabelText('Maximum Rows')
    await userEvent.clear(maxRows)
    await userEvent.type(maxRows, '50')

    await waitFor(() => expect(requestBodies(fetchMock, 'PUT /api/settings')).toEqual([SAVED_ROWS])) // one request, not one per key
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows an error and sends nothing for a value outside its range', async () => {
    const fetchMock = mockFetch({ 'GET /api/settings': { body: payload() } })
    render(<SettingsPanel />)
    await openPanel()
    const maxRows = await screen.findByLabelText('Maximum Rows')
    await userEvent.clear(maxRows)
    await userEvent.type(maxRows, '0')

    expect(await screen.findByText('Enter a whole number from 1 to 100000.')).toBeInTheDocument()
    expect(maxRows).toHaveAttribute('aria-invalid', 'true')
    await new Promise((resolve) => setTimeout(resolve, 500)) // longer than the save delay
    expect(requestBodies(fetchMock, 'PUT /api/settings')).toEqual([])
  })

  it('does not say Saved while an entry is invalid, and says Saved again once it is fixed', async () => {
    mockFetch({
      'GET /api/settings': { body: payload() },
      'PUT /api/settings': { body: payload(SAVED_ROWS) },
    })
    render(<SettingsPanel />)
    await openPanel()
    const maxRows = await screen.findByLabelText('Maximum Rows')
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    await userEvent.clear(maxRows)
    await userEvent.type(maxRows, '0')
    expect(await screen.findByText(/Invalid: fix the highlighted value/)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(settingsButton()).toHaveAccessibleName('Settings: invalid')

    await userEvent.clear(maxRows)
    await userEvent.type(maxRows, '50')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('offers Reset only for a setting that differs from its default, and Reset puts the default back and saves it', async () => {
    const fetchMock = mockFetch({
      'GET /api/settings': { body: payload(SAVED_ROWS) },
      'PUT /api/settings': { body: payload() },
    })
    render(<SettingsPanel />)
    await openPanel()
    await screen.findByDisplayValue('50')
    expect(screen.getAllByRole('button', { name: /^Reset (?!all)/ })).toHaveLength(1) // only Maximum Rows differs

    await userEvent.click(screen.getByRole('button', { name: 'Reset Maximum Rows' }))
    expect(screen.getByLabelText('Maximum Rows')).toHaveValue(1000)
    await waitFor(() => expect(requestBodies(fetchMock, 'PUT /api/settings')).toEqual([DEFAULTS]))
    expect(screen.queryByRole('button', { name: 'Reset Maximum Rows' })).not.toBeInTheDocument()
  })

  it('Reset all to defaults asks the backend to reset and shows the defaults', async () => {
    const fetchMock = mockFetch({
      'GET /api/settings': { body: payload(SAVED_ROWS) },
      'POST /api/settings/reset': { body: payload() },
    })
    render(<SettingsPanel />)
    await openPanel()
    await screen.findByDisplayValue('50')

    await userEvent.click(screen.getByRole('button', { name: 'Reset all to defaults' }))
    await loaded()
    expect(requestBodies(fetchMock, 'POST /api/settings/reset')).toHaveLength(1)
  })

  it('says so when a save fails', async () => {
    mockFetch({
      'GET /api/settings': { body: payload() },
      'PUT /api/settings': { status: 422, body: { detail: 'results max_rows: too big' } },
    })
    render(<SettingsPanel />)
    await openPanel()
    const maxRows = await screen.findByLabelText('Maximum Rows')
    await userEvent.type(maxRows, '5')
    expect(await screen.findByText(/Not saved: results max_rows: too big/)).toBeInTheDocument()
  })
})
