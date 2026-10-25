import Window from '../layout/Window'
import type { PythonResponse, QueryStep } from '../../api/types' // PythonResponse is the shape of the backend's answer {python:string}
import { useDebouncedPost } from '../../hooks/useDebouncedPost'
import { toRequest } from './steps'

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
      {result.state === 'loading' && <p className="muted">Loading...</p>}
      {result.state === 'error' && <p role="alert">{result.message}</p>}
      {result.state === 'ok' && <pre>{result.data.python}</pre>}
    </Window>
  )
}

export default PythonWindow
