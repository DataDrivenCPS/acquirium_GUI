import Window from '../layout/Window'
import type { PythonResponse, QueryStep } from '../../api/types' // PythonResponse is the shape of the backend's answer {python:string}
import { useDebouncedPost } from '../../hooks/useDebouncedPost'
import { toRequest } from './steps'
import './PythonWindow.css' // for panel style

// Show the query as a Python script (PythonResponse from POST /api/query/python),
// updated as the steps change, with a Copy button

type PythonWindowProps = {
  steps: QueryStep[]
}

function PythonWindow({steps}: PythonWindowProps) {
  // send steps to backend whenever they change and get back latest answer
  const result = useDebouncedPost<PythonResponse>('/api/query/python', { steps: toRequest(steps) })

  return (
    <Window title="Query as Python Code" area="python">
      {steps.length === 0 ? (
        <p className="muted">Add a step to see the query as Python.</p> // if no steps, load this
      ) : ( // else, load one of these options
        <> 
        {result.state === 'loading' && <p className="muted">Loading...</p>}
        {result.state === 'error' && <p role="alert" className="text-error">{result.message}</p>} 
        {result.state === 'ok' && <pre>{result.data.python}</pre>}
        </>
      )}
    </Window>
  )
}

export default PythonWindow
