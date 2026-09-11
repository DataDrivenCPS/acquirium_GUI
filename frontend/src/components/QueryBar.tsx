/**
 * The query, in English, across the top of the workspace.
 *
 * It lives outside the dock on purpose: it is the one thing that must be
 * true and visible no matter which tab is open or whether the dock is
 * collapsed at all. An operator watching the plant highlight itself needs to
 * be able to read what they have asked for without going back to the builder.
 */

import { useQuery } from '../state/QueryContext'
import { describeQuery } from '../state/queryTree'

export function QueryBar() {
  const { state, dispatch } = useQuery()
  const sentence = describeQuery(state.steps)
  const empty = state.steps.length === 0

  return (
    <div className={`query-bar${empty ? ' is-empty' : ''}`}>
      <p className="query-bar-text">
        {empty ? 'No query yet — click the plant, or open Build to start one.' : sentence}
      </p>

      <div className="query-bar-actions">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={empty}>
          Undo
        </button>
        <button type="button" onClick={() => dispatch({ type: 'clear' })} disabled={empty}>
          Start over
        </button>
      </div>
    </div>
  )
}
