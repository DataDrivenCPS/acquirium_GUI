import { useState } from 'react'
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

// What the copy button is showing right now
type CopyStatus = 'idle' | 'copied' | 'failed'

function PythonWindow({steps}: PythonWindowProps) {
  // send steps to backend whenever they change and get back latest answer
  const result = useDebouncedPost<PythonResponse>('/api/query/python', { steps: toRequest(steps) })
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')

  // the code to copy or null when no code 
  const codeToCopy = steps.length > 0 && result.state === 'ok' ? result.data.python : null

  // copies the code and shows response on button for 2 sec
  async function copy(){
    if(codeToCopy === null) return
    try{
      await navigator.clipboard.writeText(codeToCopy)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  // copy button's label for each status
  const copyLabel = { idle: 'Copy', copied: 'Copied to clipboard', failed: 'Copy failed'}[copyStatus]

  // the copy button, greys out and is not clickable when no code or after you just copied something
  const copyButton = (
    <button type="button" onClick={copy} disabled={codeToCopy === null || copyStatus != 'idle'}> 
      {copyLabel}
    </button>
  )



  return (
    <Window title="Python" area="python" actions={copyButton}>
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
