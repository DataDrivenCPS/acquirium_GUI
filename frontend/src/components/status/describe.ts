import type { EmbeddingStatus, GraphStatus, Health, RuntimeInfo } from '../../api/types'
import type { PollResult } from '../../hooks/usePolledJson'

// The color of a row's dot: green = fine, amber = waiting or in progress, red = problem
export type Tone = 'ok' | 'pending' | 'error'

// Everything one status row shows. detail is an optional, smaller second line.
export type RowStatus = { tone: Tone; text: string; detail?: string }

// One row of the status panel: what is checked (label) and what the check found.
// & combines two types: the row's status plus its label.
export type LabeledStatus = RowStatus & { label: string }

// How the status button sums up the whole system, read out by screen readers and shown on hover
export const TONE_SUMMARY: Record<Tone, string> = { ok: 'all good', pending: 'waiting', error: 'problem' }

// The tone of the whole system: the most serious tone among the rows (a problem outweighs a wait)
export function worstTone(tones: Tone[]): Tone {
  if (tones.includes('error')) return 'error'
  if (tones.includes('pending')) return 'pending'
  return 'ok'
}

// What a polled row shows before the backend has given it a usable answer.
// Starting is amber, not red: the backend is expected to be unreachable while it starts.
const UNANSWERED: Record<'checking' | 'starting' | 'unreachable', RowStatus> = {
  checking: { tone: 'pending', text: 'checking' },
  starting: { tone: 'pending', text: 'starting' },
  unreachable: { tone: 'error', text: 'unreachable' },
}

// What a polled row shows: its describe function's answer once the endpoint has replied,
// otherwise 'checking', 'starting' or 'unreachable'. <T> is the shape of that endpoint's JSON.
export function describePoll<T>(result: PollResult<T>, describe: (data: T) => RowStatus): RowStatus {
  return result.state === 'ok' ? describe(result.data) : UNANSWERED[result.state]
}

// Each function below turns one endpoint's JSON into what its row shows.

// FastAPI answered at all, so the backend process is up
export function describeBackend(): RowStatus {
  return { tone: 'ok', text: 'healthy' }
}

// Acquirium's own health check answers { ok: true } when its server is up
export function describeAcquirium(data: Health): RowStatus {
  return data.ok ? { tone: 'ok', text: 'healthy' } : { tone: 'error', text: 'unhealthy' }
}

export function describeEmbeddings(data: EmbeddingStatus): RowStatus {
  const indexes = [data.graph, data.qudt]
  const detail = `graph ${data.graph.concepts.toLocaleString()} · units ${data.qudt.concepts.toLocaleString()} concepts`

  const failed = indexes.find((index) => index.state === 'error')
  if (failed) {
    return { tone: 'error', text: 'error', detail: failed.error ?? undefined }
  }
  if (indexes.every((index) => index.state === 'ready')) {
    // exact-only means names must match exactly; there is no fuzzy matching
    return { tone: 'ok', text: data.semantic ? 'ready' : 'ready (exact-only)', detail }
  }
  const building = indexes.some((index) => index.state === 'building')
  return { tone: 'pending', text: building ? 'building' : 'waiting', detail }
}

// The query cache is rebuilt after every graph change; queries see old data until it catches up
export function describeGraph(data: GraphStatus): RowStatus {
  const detail = `data version ${data.source_version}`
  if (data.is_current) {
    return { tone: 'ok', text: 'up to date', detail }
  }
  return { tone: 'pending', text: data.rebuild_in_progress ? 'rebuilding cache' : 'cache behind', detail }
}

export function describeConfig(data: RuntimeInfo): RowStatus {
  if (data.config === null) {
    return { tone: 'ok', text: 'built-in defaults' }
  }
  const fileName = data.config.split(/[\\/]/).pop() // last part of the path, with \ (Windows) or / separators
  return { tone: 'ok', text: fileName || data.config, detail: data.config }
}

export function describeAddress(data: RuntimeInfo): RowStatus {
  return { tone: 'ok', text: data.acquirium_address.replace(/^https?:\/\//, '') }
}
