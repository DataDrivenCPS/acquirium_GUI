import type { Filter, QueryAttribute } from '../../api/types'

type FilterListProps = {
  filters: Filter[]
  attributes: QueryAttribute[] // what the attribute menus offer
  onChange: (filters: Filter[]) => void
}

// A step's attribute filters: one row per filter (attribute, value, "not"), plus an Add button
function FilterList({ filters, attributes, onChange }: FilterListProps) {
  // Replaces filter number `index` with a copy that has `changes` applied
  const update = (index: number, changes: Partial<Filter>) =>
    onChange(filters.map((filter, i) => (i === index ? { ...filter, ...changes } : filter)))

  const add = () => {
    // default to the first attribute this step isn't filtering yet
    const unused = attributes.find((a) => !filters.some((f) => f.attr === a.name))
    onChange([...filters, { attr: unused?.name ?? '', value: '', exclude: false }])
  }

  return (
    <div className="query-filters">
      {filters.map((filter, index) => (
        // filters have no ids; index keys are fine because every input's value comes from props
        <div className="query-filter" key={index}>
          <select
            aria-label={`Filter ${index + 1} attribute`}
            value={filter.attr}
            onChange={(event) => update(index, { attr: event.target.value })}
          >
            {/* a placeholder until an attribute is picked (or while the list is loading) */}
            {!attributes.some((a) => a.name === filter.attr) && <option value={filter.attr}>{filter.attr || 'attribute…'}</option>}
            {attributes.map((a) => (
              <option key={a.name} value={a.name} title={a.doc}>
                {a.name}
              </option>
            ))}
          </select>
          <label className="field--inline">
            <input
              type="checkbox"
              checked={filter.exclude}
              onChange={(event) => update(index, { exclude: event.target.checked })}
            />
            <span>not</span>
          </label>
          <input
            type="text"
            aria-label={`Filter ${index + 1} value`}
            placeholder="value, e.g. water"
            value={filter.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button type="button" onClick={() => onChange(filters.filter((_, i) => i !== index))}>
            Remove filter
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        Add filter
      </button>
    </div>
  )
}

export default FilterList
