import type { Aggregate, ResultOptions } from '../../api/types'
import { AGGREGATES, READINGS_GROUPS } from './options'

type ResultOptionsPanelProps = {
  options: ResultOptions
  onChange: (options: ResultOptions) => void
  onApply: () => void
  canApply: boolean // false while a run is under way
}

// The data aggregation panel below the readings: how many readings, in what order and layout, and whether to
// summarize them per stream. Changing a choice sends nothing; Apply runs the query again with them.
function ResultOptionsPanel({ options, onChange, onApply, canApply }: ResultOptionsPanelProps) {
  const grouped = options.group_by !== ''
  const set = (change: Partial<ResultOptions>) => onChange({ ...options, ...change })

  return (
    <form
      className="result-options"
      aria-label="Data aggregation"
      onSubmit={(event) => {
        event.preventDefault() // stay on the page; Apply runs the query
        if (canApply) onApply()
      }}
    >
      <h3>Data aggregation</h3>
      <label>
        Readings per stream
        <input
          type="number"
          min={1}
          value={options.limit ?? ''}
          placeholder="100"
          onChange={(event) => set({ limit: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </label>
      <label>
        Order
        <select value={options.order} onChange={(event) => set({ order: event.target.value as ResultOptions['order'] })}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </label>
      <label>
        Layout
        <select
          value={grouped ? 'narrow' : options.shape}
          disabled={grouped}
          title={grouped ? 'Grouped readings are always one row per group' : undefined}
          onChange={(event) => set({ shape: event.target.value as ResultOptions['shape'] })}
        >
          <option value="wide">Wide (a column per stream)</option>
          <option value="narrow">Narrow (a row per reading)</option>
        </select>
      </label>
      <label>
        Group by
        <select value={options.group_by} onChange={(event) => set({ group_by: event.target.value, aggregate: 'count' })}>
          <option value="">No grouping</option>
          {READINGS_GROUPS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {grouped && (
        <label>
          Summarize with
          <select value={options.aggregate} onChange={(event) => set({ aggregate: event.target.value as Aggregate })}>
            {AGGREGATES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={!canApply}>
        Apply
      </button>
    </form>
  )
}

export default ResultOptionsPanel
