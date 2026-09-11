/**
 * The actual readings: the third band of the query tab.
 *
 * These arrive on their own now, once the query has settled -- see the
 * debounce in QueryContext, which is what makes that safe. The button here
 * is no longer how data is fetched; it is how it is fetched *again* without
 * editing anything, and the only way to fetch at all when auto-retrieval has
 * been turned off in Settings for a plant with large histories.
 *
 * The gating is unchanged and still matters: a query with no measurement has
 * nothing to retrieve, and says so rather than offering a dead button.
 */

import { DataTable } from '../components/DataTable'
import { PanelStatus } from '../components/Panel'
import { RefreshIcon } from '../components/icons'
import { useQuery } from '../state/QueryContext'
import { hasMeasurement } from '../state/queryReducer'

const ROW_LIMITS = [50, 200, 1000]

export function DataframeView() {
  const { state, dataframe, config } = useQuery()

  if (!hasMeasurement(state)) {
    return (
      <PanelStatus kind="info">
        This query asks about equipment, not readings. Add measurements to a card above and
        they arrive here on their own.
      </PanelStatus>
    )
  }

  return (
    <DataTable
      result={dataframe}
      idleMessage={
        config?.auto_retrieve_data === false
          ? 'Automatic retrieval is off. Press the refresh button to fetch the readings.'
          : 'Retrieving the readings…'
      }
    />
  )
}

/** The band header's controls: how many rows, and fetch them again. */
export function DataframeControls() {
  const { state, dataframe, limit, setLimit, runExecute } = useQuery()
  const ready = hasMeasurement(state)

  return (
    <>
      <label className="inline">
        rows
        <select
          value={limit}
          disabled={!ready}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          {ROW_LIMITS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="qb-icon-button"
        title="Retrieve the readings again"
        disabled={!ready || dataframe.loading}
        onClick={() => runExecute()}
      >
        <RefreshIcon />
      </button>
    </>
  )
}
