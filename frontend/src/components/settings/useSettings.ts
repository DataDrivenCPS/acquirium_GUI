import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, postJson, putJson } from '../../api/http'
import type { Settings, SettingsPayload } from '../../api/types'

// How long to wait after the last edit before saving, so typing a number sends one request instead of one per key
const SAVE_DELAY_MS = 300
// The backend can take a while to start Acquirium, so the first load is retried until it answers
const RETRY_MS = 3000

export type SaveState =
  | { state: 'loading' } // the settings have not arrived yet
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'error'; message: string } // the last save was refused or failed; the edit is still shown

// The settings in force, kept in step with the backend: loaded once, and every change is saved right away
// (after SAVE_DELAY_MS of no further edits). Reading settings.values gives what the form shows.
export function useSettings() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null)
  const [values, setValues] = useState<Settings | null>(null) // what the form shows; may be ahead of the backend while saving
  const [resets, setResets] = useState(0) // counts answered Reset alls, so the fields can drop what was typed in them
  const [save, setSave] = useState<SaveState>({ state: 'loading' })
  const valuesRef = useRef<Settings | null>(null) // the same values as `values`, readable straight after a change
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(0) // numbers each save, so a slow answer to an old save can't overwrite a newer edit

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const load = () => {
      fetch('/api/settings')
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json() as Promise<SettingsPayload>
        })
        .then((data) => {
          if (cancelled) return
          setPayload(data)
          valuesRef.current = data.values
          setValues(data.values)
          setSave({ state: 'saved' })
        })
        .catch(() => {
          if (!cancelled) retry = setTimeout(load, RETRY_MS)
        })
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(retry)
      clearTimeout(timer.current)
    }
  }, [])

  const saveNow = useCallback((next: Settings) => {
    const mine = ++latest.current
    setSave({ state: 'saving' })
    putJson<SettingsPayload>('/api/settings', next)
      .then(() => {
        if (mine === latest.current) setSave({ state: 'saved' })
      })
      .catch((error: ApiError) => {
        if (mine === latest.current) setSave({ state: 'error', message: error.message })
      })
  }, [])

  // Changes one setting, and saves the whole set shortly after the last change
  const change = useCallback(
    <G extends keyof Settings>(group: G, name: keyof Settings[G], value: number) => {
      const current = valuesRef.current
      if (!current) return
      const next = { ...current, [group]: { ...current[group], [name]: value } }
      valuesRef.current = next
      setValues(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => saveNow(next), SAVE_DELAY_MS)
    },
    [saveNow],
  )

  // Puts one setting back to its default and saves it
  const resetOne = useCallback(
    <G extends keyof Settings>(group: G, name: keyof Settings[G]) => {
      if (payload) change(group, name, payload.defaults[group][name] as number)
    },
    [payload, change],
  )

  // Asks the backend to reset every setting, and shows what it answers
  const resetAll = useCallback(() => {
    clearTimeout(timer.current)
    const mine = ++latest.current
    setSave({ state: 'saving' })
    postJson<SettingsPayload>('/api/settings/reset', {})
      .then((data) => {
        if (mine !== latest.current) return
        setPayload(data)
        valuesRef.current = data.values
        setValues(data.values)
        setResets((count) => count + 1)
        setSave({ state: 'saved' })
      })
      .catch((error: ApiError) => {
        if (mine === latest.current) setSave({ state: 'error', message: error.message })
      })
  }, [])

  return { payload, values, save, resets, change, resetOne, resetAll }
}
