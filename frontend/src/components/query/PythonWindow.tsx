import Window from '../layout/Window'
import type { QueryStep } from '../../api/types'

// Show the query as a Python script (PythonResponse from POST /api/query/python),
// updated as the steps change, with a Copy button

type PythonWindowProps = {
  steps: QueryStep[]
}

function PythonWindow({steps}: PythonWindowProps) {
  return (
    <Window title="Query as Python Code" area="python">
      <p className="muted">The query has {steps.length} steps.</p>
    </Window>
  )
}

export default PythonWindow
