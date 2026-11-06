import type { EmbeddingStatus, GraphStatus, Health, RuntimeInfo } from '../../api/types'
import { usePolledJson } from '../../hooks/usePolledJson'
import {
  describeAcquirium,
  describeAddress,
  describeBackend,
  describeConfig,
  describeEmbeddings,
  describeGraph,
  describePoll,
  type LabeledStatus,
} from './describe'

// Keeps re-checking every status endpoint and turns the answers into the status panel's rows.
// The panel needs all the rows at once, so it can color its button by the worst one.
// To add a check: poll its endpoint here, write a describe function in describe.ts, and add its row below.
export function useStatusRows(): LabeledStatus[] {
  const backend = usePolledJson<unknown>('/api/') // any answer at all means the backend is up
  const acquirium = usePolledJson<Health>('/api/server-health')
  const embeddings = usePolledJson<EmbeddingStatus>('/api/embedding-status')
  const graph = usePolledJson<GraphStatus>('/api/graph-status')
  const runtime = usePolledJson<RuntimeInfo>('/api/runtime-info') // one poll feeds both the Config and address rows

  // ...describePoll(...) spreads the row's tone, text and detail into the object next to its label
  return [
    // If this page is showing, the frontend is running. MODE is 'development' under npm run dev.
    { label: 'Frontend', tone: 'ok', text: 'running', detail: `${import.meta.env.MODE} mode` },
    { label: 'Backend API', ...describePoll(backend, describeBackend) },
    { label: 'Acquirium server', ...describePoll(acquirium, describeAcquirium) },
    { label: 'Embedding indexes', ...describePoll(embeddings, describeEmbeddings) },
    { label: 'Graph', ...describePoll(graph, describeGraph) },
    { label: 'Config', ...describePoll(runtime, describeConfig) },
    { label: 'Acquirium address', ...describePoll(runtime, describeAddress) },
  ]
}
