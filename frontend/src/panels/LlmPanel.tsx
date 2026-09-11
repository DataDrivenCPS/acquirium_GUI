/**
 * Ask in plain English. Placeholder -- deliberately non-functional.
 *
 * A bonus goal, out of scope for this iteration. The panel exists so the
 * seam is real and visible rather than a vague intention:
 *
 *   text -> POST /api/llm/translate -> a QueryDescription -> `dispatch({type:
 *   'load'})` -> the ordinary builder, metadata preview, graph highlighting
 *   and Execute, all untouched.
 *
 * That is the design constraint to preserve when this is implemented. The LLM
 * produces the same step list the buttons produce, so its output is editable
 * afterwards and every other panel keeps working without knowing it was
 * involved. It must not get a query path of its own, and must not emit SPARQL.
 *
 * The wiring below is written and commented out rather than described, so
 * implementing this is a matter of removing the guard once /api/llm/translate
 * returns something.
 */

import { useEffect, useState } from 'react'

import { api } from '../api/client'
import { Panel, PanelStatus } from '../components/Panel'

export function LlmPanel() {
  const [text, setText] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [detail, setDetail] = useState<string>('')

  useEffect(() => {
    api
      .llmStatus()
      .then((status) => {
        setAvailable(status.available)
        setDetail(status.detail)
      })
      .catch(() => {
        setAvailable(false)
        setDetail('Could not reach the backend to check.')
      })
  }, [])

  // When this is implemented:
  //
  //   const { dispatch } = useQuery()
  //   const { description } = await api.llmTranslate(text)
  //   dispatch({ type: 'load', description })
  //
  // ...and everything downstream updates on its own.

  return (
    <Panel
      title="Ask in plain English"
      subtitle="Not implemented yet — a planned addition, shown here so the shape is settled."
    >
      <div className="llm">
        <input
          type="text"
          value={text}
          disabled
          placeholder="e.g. what pressure is the RO running at?"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" disabled>
          Ask
        </button>
      </div>
      <PanelStatus kind="info">
        {available === null
          ? 'Checking…'
          : detail || 'Natural-language querying is not available yet.'}
      </PanelStatus>
      <p className="hint">
        When built, this will fill in the Build tab rather than running a query of its own, so
        you can check and edit whatever it proposes before any data is retrieved.
      </p>
    </Panel>
  )
}
