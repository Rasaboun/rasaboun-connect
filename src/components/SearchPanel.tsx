import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { EASE } from '../constants'
import { NeedleInfoPopover, type ModelStatus } from './NeedleInfoPopover'

// Cycled inside the search bar as a live placeholder — sells the natural-language
// premise without a decorative icon.
const NL_PLACEHOLDERS = [
  'Aller de Châtelet à Nation maintenant',
  'Montparnasse → République demain à 8h',
  'Prochain métro à Saint-Lazare',
  'Gare du Nord à Bastille sans correspondance',
]

type SearchPanelProps = {
  query: string
  setQuery: (value: string) => void
  running: boolean
  disabled: boolean
  onSubmit: () => void
  examples?: string[]
  onExample?: (value: string) => void
  status: ModelStatus
}

// Single natural-language search bar — the whole product premise. No structured
// Départ/Arrivée/Maintenant fields: the user just describes the trip in plain
// words and Needle (on-device model) extracts origin, destination and time.
// The placeholder cycles through real example phrasings (animated) so the bar
// teaches what it accepts instead of relying on a decorative icon.
export function SearchPanel({ query, setQuery, running, disabled, onSubmit, examples, onExample, status }: SearchPanelProps) {
  const [phIdx, setPhIdx] = useState(0)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (query) return
    const timer = setInterval(() => setPhIdx((i) => (i + 1) % NL_PLACEHOLDERS.length), 3000)
    return () => clearInterval(timer)
  }, [query])

  // The model isn't ready: lock the input and show a static placeholder instead
  // of the cycling examples (which would otherwise animate behind it).
  const modelBusy = status.loading || Boolean(status.error)
  const showHint = !query && !focused && !modelBusy

  return (
    <section className="w-full">
      <div className="flex h-[52px] items-center gap-2 rounded-xl border border-[#D8DEFA] bg-white py-1.5 pl-4 pr-1.5 shadow-[0_2px_10px_rgba(21,35,70,0.08)] transition focus-within:border-[#8DE8FE] focus-within:ring-2 focus-within:ring-[#8DE8FE]/30">
        <div className="relative flex min-w-0 flex-1 items-center">
          <label className="sr-only" htmlFor="natural-query">Votre demande de trajet en langage naturel</label>
          <input
            className="peer w-full bg-transparent text-[15px] font-semibold text-[#171D2D] outline-none disabled:cursor-not-allowed"
            id="natural-query"
            autoComplete="off"
            disabled={modelBusy}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
            value={query}
          />
          {modelBusy && !query && (
            <span className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] font-medium text-[#9AA1B2]">
              {status.error ? 'Recherche indisponible' : 'Préparation de Needle…'}
            </span>
          )}
          {showHint && (
            <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={phIdx}
                  className="truncate text-[15px] font-medium text-[#9AA1B2]"
                  initial={{ opacity: 0, y: '70%' }}
                  animate={{ opacity: 1, y: '0%' }}
                  exit={{ opacity: 0, y: '-70%' }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  {NL_PLACEHOLDERS[phIdx]}
                </m.span>
              </AnimatePresence>
            </span>
          )}
        </div>
        <button
          className="inline-flex h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-[#0C1324] px-5 text-[13px] font-black text-white transition hover:bg-[#1b2640] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || running}
          onClick={onSubmit}
          type="button"
        >
          {running ? 'Recherche...' : 'Rechercher'}
          {!running && (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <NeedleInfoPopover status={status} />
        {examples && examples.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[12px] font-medium text-white/35">Essayez :</span>
            {examples.map((example) => (
              <button
                className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium text-white/45 transition hover:bg-white/5 hover:text-white/80"
                key={example}
                onClick={() => onExample?.(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
