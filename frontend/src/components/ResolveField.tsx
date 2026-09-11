/**
 * A free-text box that turns what the user typed into a real thing in the
 * graph -- the safety net described in design.md.
 *
 * The flow, and why each part is there:
 *
 *   type -> debounce -> POST /api/resolve
 *     confident   -> accept the top match silently, show its label
 *     ambiguous   -> show the top few *labels* and make the user choose
 *
 * Acquirium's resolver returns its closest match above a floor score, so a
 * typo produces a confidently wrong answer rather than an error. This picker
 * is the only thing standing between a bad input and a bad query, which is
 * why the ambiguous branch must never quietly pick the first candidate.
 *
 * The confidence rule itself lives on the server (it depends on user
 * settings); this component only reacts to the `confident` flag it is told.
 *
 * `suggestions` adds the other half of the same job: what is actually in this
 * plant, listed, for the operator who does not know what to type. Those match
 * locally and instantly -- they never bypass the resolver, they just mean an
 * empty box is no longer a dead end.
 */

import { useEffect, useRef, useState } from 'react'

import { api } from '../api/client'
import type { Candidate, Ref, ResolveKind } from '../api/types'
import { ListIcon } from './icons'

const DEBOUNCE_MS = 300
/** Enough to scan without turning the card into a scrolling list. */
const MAX_SUGGESTIONS = 8

interface ResolveFieldProps {
  /** What has been resolved so far, if anything. */
  value: Ref | null
  kind: ResolveKind
  placeholder?: string
  /** Things known to exist in this plant, offered as a browsable list. */
  suggestions?: Ref[]
  /** Take the cursor on mount -- used by a card the user has just added. */
  autoFocus?: boolean
  /** `candidateKind` says whether the user landed on a class or one instance. */
  onResolved: (ref: Ref, candidateKind: ResolveKind) => void
  onCleared: () => void
}

export function ResolveField({
  value,
  kind,
  placeholder,
  suggestions = [],
  autoFocus = false,
  onResolved,
  onCleared,
}: ResolveFieldProps) {
  const [text, setText] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  // Guards against a slow earlier request overwriting a newer one's result.
  const requestId = useRef(0)

  useEffect(() => {
    if (!text.trim()) {
      setCandidates([])
      setStatus(null)
      return
    }

    const id = ++requestId.current
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const response = await api.resolve(text, kind)
        if (id !== requestId.current) return

        if (response.candidates.length === 0) {
          setCandidates([])
          setStatus(`Nothing in the plant model matches “${text}”.`)
        } else if (response.confident) {
          const best = response.candidates[0] as Candidate
          setCandidates([])
          setStatus(null)
          setText('')
          onResolved({ id: best.id, label: best.label }, best.kind)
        } else {
          // Ambiguous: hand the choice back rather than guessing.
          setCandidates(response.candidates)
          setStatus('More than one match — choose one:')
        }
      } catch (error) {
        if (id !== requestId.current) return
        setCandidates([])
        setStatus(error instanceof Error ? error.message : String(error))
      } finally {
        if (id === requestId.current) setBusy(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResolved is a
    // fresh closure on every render; re-running on it would loop.
  }, [text, kind])

  function choose(ref: Ref, candidateKind: ResolveKind) {
    setCandidates([])
    setStatus(null)
    setText('')
    setBrowsing(false)
    onResolved(ref, candidateKind)
  }

  if (value) {
    return (
      <span className="resolved">
        <span className="resolved-label">{value.label}</span>
        <button type="button" className="link" onClick={onCleared} title="Choose something else">
          change
        </button>
      </span>
    )
  }

  const typed = text.trim().toLowerCase()
  const matches = suggestions
    .filter((suggestion) => !typed || suggestion.label.toLowerCase().includes(typed))
    .slice(0, MAX_SUGGESTIONS)
  // The resolver's picker always wins the space: it is the disambiguation
  // step, and burying it under a browse list would defeat the point.
  const showSuggestions = candidates.length === 0 && matches.length > 0 && (browsing || typed !== '')

  return (
    <span
      className="resolve-field"
      // The browse list floats over the cards below it, so it closes as soon
      // as the field is done with -- otherwise it sits there swallowing
      // clicks meant for the card underneath.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBrowsing(false)
      }}
    >
      <span className="resolve-input">
        <input
          type="text"
          value={text}
          placeholder={placeholder ?? 'type a name…'}
          autoFocus={autoFocus}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setBrowsing(true)}
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            className="qb-icon-button"
            title={browsing ? 'Hide the list' : "List what is in this plant"}
            onClick={() => setBrowsing((open) => !open)}
          >
            <ListIcon />
          </button>
        )}
        {busy && <span className="hint">…</span>}
      </span>

      {status && <span className="hint">{status}</span>}

      {candidates.length > 0 && (
        <ul className="candidates">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => choose({ id: candidate.id, label: candidate.label }, candidate.kind)}
              >
                {candidate.label}
                {/* The kind matters: "Pump" the class and "P1" the unit are
                    different choices, and the user cannot tell from the label
                    alone. */}
                <span className="candidate-kind">
                  {candidate.kind === 'entity' ? 'this specific one' : 'any of these'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showSuggestions && (
        <ul className="candidates candidates-browse">
          {matches.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" onClick={() => choose(suggestion, 'class')}>
                {suggestion.label}
                <span className="candidate-kind">in this plant</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
