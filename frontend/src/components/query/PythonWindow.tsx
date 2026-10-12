import { useState } from 'react'
import type { PythonResponse, QueryStep } from '../../api/types'
import { useDebouncedPost } from '../../hooks/useDebouncedPost'
import Window from '../layout/Window'

type PythonWindowProps = {
  steps: QueryStep[]
}

// The query builder's steps as a Python script using the acquirium library, kept in sync as you
// edit. The backend writes it from the same steps Run executes, so it always matches what runs.
function PythonWindow({ steps }: PythonWindowProps) {
  const result = useDebouncedPost<PythonResponse>('/api/query/python', { steps })
  const code = result.state === 'ok' ? result.data.python : null
  const [copiedCode, setCopiedCode] = useState<string | null>(null) // which code was last copied

  const copy = () => {
    if (code === null) return
    navigator.clipboard?.writeText(code).then(() => setCopiedCode(code)) // ?. skips this if there is no clipboard
  }

  return (
    <Window
      title="Python"
      area="python"
      actions={
        <button type="button" onClick={copy} disabled={code === null}>
          {code !== null && copiedCode === code ? 'Copied' : 'Copy'}
        </button>
      }
    >
      {result.state === 'loading' && <p className="muted">Translating…</p>}
      {result.state === 'error' && <p className="text-error">{result.message}</p>}
      {code !== null && (
        <pre className="python-code">
          <code>{code}</code>
        </pre>
      )}
    </Window>
  )
}

export default PythonWindow
