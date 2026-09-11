/**
 * The only place this app talks to the backend.
 *
 * Everything is relative to `/api`, which Vite proxies to the backend in
 * development and FastAPI serves itself once packaged -- so there is no host
 * or port anywhere in the frontend, and no configuration to get wrong.
 */

import type {
  AppConfig,
  AttributeName,
  GeneratedQuery,
  GraphModel,
  HealthResponse,
  LlmStatus,
  QueryDescription,
  Ref,
  ResolveKind,
  ResolveResponse,
  Subgraph,
  Table,
} from './types'

const BASE = '/api'

/**
 * A failed request, carrying the backend's own wording where it gave any.
 *
 * The backend phrases adapter failures for a plant operator ("Add an entity
 * before relating another one to it"), so panels should show `message`
 * directly rather than inventing their own.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    // The backend not running at all is the most common failure in
    // development, and a bare "Failed to fetch" does not say so.
    throw new ApiError('Cannot reach the Acquirium GUI backend. Is it running?', 0)
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status)
  }
  return (await response.json()) as T
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.detail === 'string') return body.detail
    // FastAPI validation errors arrive as a list of field problems.
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? '').join('; ')
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `Request failed (${response.status})`
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  getConfig: () => request<AppConfig>('/config'),
  putConfig: (config: AppConfig) =>
    request<AppConfig>('/config', { method: 'PUT', body: JSON.stringify(config) }),

  graphModel: () => request<GraphModel>('/graph/model'),
  subgraph: (description: QueryDescription) => post<Subgraph>('/graph/subgraph', description),

  resolve: (text: string, kind: ResolveKind, topK?: number) =>
    post<ResolveResponse>('/resolve', { text, kind, top_k: topK ?? null }),
  attributeValues: (attr: AttributeName) => request<Ref[]>(`/attributes/${attr}/values`),

  /** Cheap and lazy. Safe to call after every builder step. */
  metadata: (description: QueryDescription) => post<Table>('/query/metadata', description),

  /**
   * Expensive: this is the one that actually retrieves timeseries.
   * Only ever call it from an explicit user action, never from an effect.
   */
  execute: (description: QueryDescription, limit = 50) =>
    post<Table>(`/query/execute?limit=${limit}`, description),

  generated: (description: QueryDescription) =>
    post<GeneratedQuery>('/query/generated', description),

  llmStatus: () => request<LlmStatus>('/llm/status'),
}
