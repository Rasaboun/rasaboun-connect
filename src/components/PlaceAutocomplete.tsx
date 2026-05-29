import { useEffect, useRef, useState } from 'react'
import type { NavitiaPlace } from '../travel/navitia'

type Props = {
  label: string
  value: NavitiaPlace | null
  onSearch: (query: string) => Promise<NavitiaPlace[]>
  onSelect: (place: NavitiaPlace) => void
}

// Compact, editable Départ/Arrivée field with a suggestion listbox. Lets the
// user correct the place Needle resolved; suggestions come back ranked by how
// well their name matches what was typed.
export function PlaceAutocomplete({ label, value, onSearch, onSelect }: Props) {
  const [text, setText] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<NavitiaPlace[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  // Resync the field when the value changes from outside (new search or swap),
  // using the render-phase "adjust state on prop change" pattern.
  const [prevValueId, setPrevValueId] = useState(value?.id)
  const rootRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  if (value?.id !== prevValueId) {
    setPrevValueId(value?.id)
    setText(value?.name ?? '')
    setOpen(false)
  }

  const query = text.trim()
  // Open whenever the field is focused with any text — tapping a filled field
  // re-searches the current value so the list opens immediately.
  const queryValid = open && query.length > 0
  const visibleResults = queryValid ? results : []

  // Debounced search. setState lives in the timeout/promise callbacks (async),
  // never synchronously in the effect body.
  useEffect(() => {
    if (!queryValid) return
    const myId = ++reqId.current
    const timer = setTimeout(() => {
      setLoading(true)
      void onSearch(query)
        .then((list) => {
          if (reqId.current === myId) {
            setResults(list)
            setActive(0)
          }
        })
        .finally(() => {
          if (reqId.current === myId) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(timer)
  }, [queryValid, query, onSearch])

  // Close + revert on outside click.
  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setText(value?.name ?? '')
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [value?.name])

  function choose(place: NavitiaPlace) {
    setOpen(false)
    setResults([])
    setText(place.name)
    if (place.id !== value?.id) onSelect(place)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, visibleResults.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (visibleResults[active]) choose(visibleResults[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setText(value?.name ?? '')
    }
  }

  return (
    <div className="relative flex-1" ref={rootRef}>
      <div className="flex items-center gap-2 rounded-xl bg-[#242b35] px-4 py-2.5 ring-2 ring-transparent transition focus-within:ring-[#8DE8FE]">
        <span className="shrink-0 text-sm text-slate-400">{label} :</span>
        <input
          autoComplete="off"
          className="w-full min-w-0 truncate bg-transparent text-[15px] font-semibold text-white outline-none placeholder:font-normal placeholder:text-slate-500"
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            // Tapping the field clears it for a fresh entry. Tapping away without
            // picking a suggestion restores value?.name (outside-click / Escape
            // handlers below), so nothing is lost when the user just glances in.
            setOpen(true)
            setText('')
          }}
          onKeyDown={onKeyDown}
          placeholder={label === 'Départ' ? "D'où partez-vous ?" : 'Où allez-vous ?'}
          value={text}
        />
      </div>
      {open && queryValid && (loading || visibleResults.length > 0) ? (
        <ul className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[#D8DEFA] bg-white py-1 shadow-2xl">
          {loading && visibleResults.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-slate-400">Recherche…</li>
          ) : null}
          {visibleResults.map((place, index) => (
            <li key={place.id}>
              <button
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm ${index === active ? 'bg-[#EDF6FF]' : 'hover:bg-[#F4F6FF]'}`}
                onClick={() => choose(place)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-[#127996]">
                  <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <span className="truncate font-semibold text-[#171D2D]">{place.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
