/**
 * App-wide state: the query being built, the settings, and the live results
 * that follow from them.
 *
 * All fetching policy lives here, and the split between the two kinds of
 * fetch is the part worth understanding:
 *
 *   - **Metadata** is a cheap lazy pattern match, so it re-runs immediately
 *     after every builder change.
 *   - **Readings** are the expensive half -- real timeseries out of the
 *     plant's store. They are retrieved automatically too, but *debounced*,
 *     only once the query has settled, only when it actually has a
 *     measurement to fetch, and only while `auto_retrieve_data` is on. A
 *     plant with large histories can turn that off in Settings and go back
 *     to fetching on the button, which is what `runExecute` is for.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { ApiError, api } from '../api/client'
import type { AppConfig, GraphModel, HealthResponse, Subgraph, Table } from '../api/types'
import {
  hasMeasurement,
  initialQueryState,
  queryReducer,
  toDescription,
} from './queryReducer'
import type { QueryAction, QueryState } from './queryReducer'

/** A request that may be loading, may have failed, and may have a value. */
export interface Async<T> {
  data: T | null
  error: string | null
  loading: boolean
}

const idle = <T,>(): Async<T> => ({ data: null, error: null, loading: false })

/** Rows retrieved unless the user asks for more. */
const DEFAULT_LIMIT = 50

/**
 * How long the query must sit still before readings are fetched.
 *
 * Long enough that typing a class name, picking a value from a dropdown and
 * fixing it again costs one retrieval rather than four.
 */
const RETRIEVE_DEBOUNCE_MS = 700

interface QueryContextValue {
  state: QueryState
  dispatch: (action: QueryAction) => void

  health: HealthResponse | null
  config: AppConfig | null
  saveConfig: (next: AppConfig) => Promise<void>

  graph: Async<GraphModel>
  subgraph: Async<Subgraph>
  metadata: Async<Table>
  /** The readings, retrieved as the query settles (or on demand). */
  dataframe: Async<Table>
  /** How many rows to retrieve. Lives here because auto-retrieval uses it. */
  limit: number
  setLimit: (limit: number) => void
  runExecute: (limit?: number) => Promise<void>
  clearDataframe: () => void
}

const QueryContext = createContext<QueryContextValue | null>(null)

export function QueryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(queryReducer, initialQueryState)

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [graph, setGraph] = useState<Async<GraphModel>>(idle)
  const [subgraph, setSubgraph] = useState<Async<Subgraph>>(idle)
  const [metadata, setMetadata] = useState<Async<Table>>(idle)
  const [dataframe, setDataframe] = useState<Async<Table>>(idle)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)

  const description = useMemo(() => toDescription(state), [state])
  // Effects below depend on the query's *content*, not its object identity,
  // so an unrelated re-render does not re-fetch.
  const descriptionKey = useMemo(() => JSON.stringify(description), [description])

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig(null))
  }, [])

  // The full model graph. Re-fetched when the size limit changes, since that
  // is what decides whether the backend simplifies it.
  useEffect(() => {
    let cancelled = false
    setGraph((prev) => ({ ...prev, loading: true }))
    api
      .graphModel()
      .then((data) => !cancelled && setGraph({ data, error: null, loading: false }))
      .catch(
        (error) =>
          !cancelled && setGraph({ data: null, error: message(error), loading: false }),
      )
    return () => {
      cancelled = true
    }
  }, [config?.graph_node_limit])

  // Story 7: the preview updates after every step, with no run action.
  useEffect(() => {
    let cancelled = false
    setMetadata((prev) => ({ ...prev, loading: true }))
    setSubgraph((prev) => ({ ...prev, loading: true }))

    api
      .metadata(description)
      .then((data) => !cancelled && setMetadata({ data, error: null, loading: false }))
      .catch(
        (error) =>
          !cancelled && setMetadata({ data: null, error: message(error), loading: false }),
      )

    api
      .subgraph(description)
      .then((data) => !cancelled && setSubgraph({ data, error: null, loading: false }))
      .catch(
        (error) =>
          !cancelled && setSubgraph({ data: null, error: message(error), loading: false }),
      )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [descriptionKey])

  const runExecute = useCallback(
    async (rows = limit) => {
      setDataframe({ data: null, error: null, loading: true })
      try {
        const data = await api.execute(description, rows)
        setDataframe({ data, error: null, loading: false })
      } catch (error) {
        setDataframe({ data: null, error: message(error), loading: false })
      }
    },
    [description, limit],
  )

  // Editing the query invalidates whatever was retrieved -- leaving stale
  // rows on screen under a changed query is worse than showing nothing --
  // and then fetches again once the edits stop.
  //
  // The debounce is the whole reason this is safe to do automatically: a
  // user typing "pump" would otherwise pull four sets of timeseries. Nothing
  // is requested at all until the query has a measurement in it, because
  // without one there is nothing to retrieve.
  useEffect(() => {
    setDataframe(idle)

    if (!config?.auto_retrieve_data || !hasMeasurement(state)) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setDataframe({ data: null, error: null, loading: true })
      try {
        const data = await api.execute(description, limit)
        if (!cancelled) setDataframe({ data, error: null, loading: false })
      } catch (error) {
        if (!cancelled) setDataframe({ data: null, error: message(error), loading: false })
      }
    }, RETRIEVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [descriptionKey, limit, config?.auto_retrieve_data])

  const saveConfig = useCallback(async (next: AppConfig) => {
    setConfig(await api.putConfig(next))
  }, [])

  const clearDataframe = useCallback(() => setDataframe(idle), [])

  const value: QueryContextValue = {
    state,
    dispatch,
    health,
    config,
    saveConfig,
    graph,
    subgraph,
    metadata,
    dataframe,
    limit,
    setLimit,
    runExecute,
    clearDataframe,
  }

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>
}

export function useQuery(): QueryContextValue {
  const value = useContext(QueryContext)
  if (!value) throw new Error('useQuery must be used inside a QueryProvider')
  return value
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}
