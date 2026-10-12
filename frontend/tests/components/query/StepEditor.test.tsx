import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { QueryStep, StepKind } from '../../../src/api/types'
import { ATTRIBUTES } from '../../support/fixtures'
import StepEditor from '../../../src/components/query/StepEditor'
import { newStep } from '../../../src/components/query/steps'

// Renders one StepEditor that keeps its own state, like the builder does, and exposes the latest step
function renderStep(kind: StepKind) {
  const latest: { step: QueryStep } = { step: newStep(kind) }
  function Harness() {
    const [step, setStep] = useState<QueryStep>(latest.step)
    const onChange = (changed: QueryStep) => {
      latest.step = changed
      setStep(changed)
    }
    return <StepEditor step={step} number={1} attributes={ATTRIBUTES} onChange={onChange} onRemove={() => {}} />
  }
  render(<Harness />)
  return latest
}

describe('StepEditor', () => {
  it('titles the step with its number and kind', () => {
    renderStep('entity')
    expect(screen.getByRole('group', { name: '1. entity' })).toBeInTheDocument()
  })

  it('edits an entity step\'s class and alias', async () => {
    const latest = renderStep('entity')
    await userEvent.type(screen.getByLabelText('Class'), 'Pump')
    await userEvent.type(screen.getByLabelText('Alias'), 'p')
    expect(latest.step).toMatchObject({ kind: 'entity', cls: 'Pump', alias: 'p' })
  })

  it('edits a related step\'s direction, depth and nearest options', async () => {
    const latest = renderStep('related')
    await userEvent.selectOptions(screen.getByLabelText('Direction'), 'downstream')
    await userEvent.type(screen.getByLabelText('Max depth'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Nearest'), 'all matches')
    expect(latest.step).toMatchObject({ direction: 'downstream', max_depth: 2, nearest: false })
    await userEvent.clear(screen.getByLabelText('Max depth'))
    await userEvent.selectOptions(screen.getByLabelText('Nearest'), 'default')
    expect(latest.step).toMatchObject({ max_depth: null, nearest: null }) // back to Acquirium's defaults
  })

  it('adds, edits and removes filters, offering only attributes that fit the step', async () => {
    const latest = renderStep('measurement')
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    const attribute = screen.getByLabelText('Filter 1 attribute')
    // measurement steps filter data nodes, so the entity-only 'process' isn't offered
    expect([...attribute.querySelectorAll('option')].map((o) => o.value)).toEqual(['medium', 'quantity_kind', 'unit'])
    await userEvent.selectOptions(attribute, 'unit')
    await userEvent.type(screen.getByLabelText('Filter 1 value'), 'PSI')
    await userEvent.click(screen.getByLabelText('not'))
    expect(latest.step).toMatchObject({ filters: [{ attr: 'unit', value: 'PSI', exclude: true }] })
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter' }))
    expect(latest.step).toMatchObject({ filters: [] })
  })

  it('defaults a new filter to an attribute the step is not filtering yet', async () => {
    const latest = renderStep('measurement')
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(latest.step).toMatchObject({ filters: [{ attr: 'medium' }, { attr: 'quantity_kind' }] })
  })

  it('parses an include step\'s comma-separated columns but keeps the text as typed', async () => {
    const latest = renderStep('include')
    await userEvent.type(screen.getByLabelText('Columns'), 'unit, medium,')
    expect(screen.getByLabelText('Columns')).toHaveValue('unit, medium,')
    expect(latest.step).toMatchObject({ names: ['unit', 'medium'] })
    await userEvent.click(screen.getByLabelText('Required'))
    expect(latest.step).toMatchObject({ required: true })
  })

  it('edits a where step\'s target', async () => {
    const latest = renderStep('where')
    await userEvent.type(screen.getByLabelText('Target alias'), 'ro')
    expect(latest.step).toMatchObject({ kind: 'where', target: 'ro' })
  })
})
