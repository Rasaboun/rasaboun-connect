import { m } from 'framer-motion'
import { detailTransition, screenTransition } from '../constants'
import { detectLimit } from '../needle-limits'
import { TRANSPORT_MODES } from '../travel/modeFilter'
import type { JourneyResult, LineArrivals, NavitiaPlace } from '../travel/navitia'
import { ItineraireList } from './itineraire/ItineraireList'
import { ItineraireDetail } from './itineraire/ItineraireDetail'
import { ArrivalsBoard } from './itineraire/ArrivalsBoard'
import { PlaceAutocomplete } from './PlaceAutocomplete'
import { ModeIcon } from './ModeIcon'
import { type ModelStatus } from './NeedleInfoPopover'
import { LimitNudge } from './LimitNudge'
import { SearchPanel } from './SearchPanel'
import { FilterMenu } from './FilterMenu'
import { TimeMenu } from './TimeMenu'
import { DevToolBubble } from './DevToolBubble'
import type { Filters, MetricState } from './types'

// One-tap example queries — short but varied: time, arrive-by, mode, slang, English.
const NL_CHIPS = [
  'Bastille → La Défense demain 8h',
  'Bastille avant 18h depuis Châtelet',
  'Opéra depuis Nation en bus',
  'stp cmt aller à Montparnasse',
]

export function ItineraryScreen({
  datetime,
  destination,
  error,
  modelStatus,
  filters,
  journeys,
  arrivals,
  station,
  metrics,
  onCorrect,
  onTime,
  timeMode,
  onToggleFilter,
  onToggleListFilter,
  onNewSearch,
  onRefresh,
  origin,
  output,
  placeSearch,
  query,
  running,
  disabled,
  selectedId,
  setQuery,
  setSelectedId,
  onSubmit,
  searchedQuery,
}: {
  datetime: string | null
  destination: NavitiaPlace | null
  error: string | null
  modelStatus: ModelStatus
  filters: Filters
  journeys: JourneyResult[]
  arrivals: LineArrivals[]
  station: NavitiaPlace | null
  metrics: MetricState | null
  onCorrect: (origin: NavitiaPlace, destination: NavitiaPlace) => void
  onTime: (mode: 'depart_at' | 'arrive_by', local: string) => void
  timeMode: 'depart_at' | 'arrive_by'
  onToggleFilter: (key: 'noTransfer' | 'stepFree') => void
  onToggleListFilter: (key: 'excludedModes' | 'excludedLines', uri: string) => void
  onNewSearch: () => void
  onRefresh: () => void
  origin: NavitiaPlace | null
  output: string
  placeSearch: (query: string) => Promise<NavitiaPlace[]>
  query: string
  running: boolean
  disabled: boolean
  selectedId: string | null
  setQuery: (value: string) => void
  setSelectedId: (value: string) => void
  onSubmit: () => void
  searchedQuery: string
}) {
  const selected = journeys.find((journey) => journey.id === selectedId) ?? journeys[0] ?? null

  // Contextual nudge: the query that produced the current journeys clearly asked
  // for an unsupported trip (round-trip / multiple destinations). Only for
  // itinerary results — a station board has no such notion.
  const limit = journeys.length ? detectLimit(searchedQuery) : null

  // Lines actually used in the current results — the candidates for "Éviter une ligne".
  const lineMap = new Map<string, { id: string; label: string; color: string | null }>()
  for (const journey of journeys) {
    for (const section of journey.sections) {
      if (section.type === 'public_transport' && section.lineId && !lineMap.has(section.lineId)) {
        lineMap.set(section.lineId, { id: section.lineId, label: section.label, color: section.color })
      }
    }
  }
  const availableLines = [...lineMap.values()]

  return (
    <m.main className="bg-[#F3F3F8] pb-8" {...screenTransition}>
      <div className="bg-[#0C131F]">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-7 md:px-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[28px] font-black leading-none text-white">Itinéraires</h1>
            <p className="text-sm text-white/60">
              Nos offres sont présentées par horaires de départ.{' '}
              <button className="text-[#8DE8FE] hover:underline" type="button">Voir conditions</button>
            </p>
            {journeys.length || arrivals.length ? (
              <button
                className="ml-auto text-sm font-bold text-white/70 transition hover:text-[#8DE8FE]"
                onClick={onNewSearch}
                type="button"
              >
                Effacer
              </button>
            ) : null}
          </div>
          <div className="mt-5">
            <SearchPanel disabled={disabled} examples={NL_CHIPS} onExample={setQuery} onSubmit={onSubmit} query={query} running={running} setQuery={setQuery} status={modelStatus} />
          </div>
          {limit && (
            <LimitNudge
              kind={limit}
              onInvert={origin && destination ? () => onCorrect(destination, origin) : undefined}
            />
          )}
          {origin && destination ? (
            <div className="mt-3 flex w-full flex-col gap-2 lg:flex-row lg:items-stretch">
              <div className="relative flex flex-1 flex-col items-stretch gap-px sm:flex-row sm:items-center sm:gap-2">
              <PlaceAutocomplete
                label="Départ"
                value={origin}
                onSearch={placeSearch}
                onSelect={(place) => onCorrect(place, destination)}
              />
              {/* Mobile: absolute knob straddling the two stacked fields (no own row).
                  sm+: inline between the fields. */}
              <button
                aria-label="Inverser départ et arrivée"
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#0C131F] bg-[#242b35] text-[#8DE8FE] transition hover:bg-[#8DE8FE] hover:text-[#0C131F] sm:static sm:right-auto sm:h-8 sm:w-8 sm:translate-y-0 sm:border-0"
                onClick={() => onCorrect(destination, origin)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:rotate-90">
                  <path d="M7 4v13M7 4L4 7m3-3l3 3M17 20V7m0 13l3-3m-3 3l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <PlaceAutocomplete
                label="Arrivée"
                value={destination}
                onSearch={placeSearch}
                onSelect={(place) => onCorrect(origin, place)}
              />
              </div>
              <TimeMenu datetime={datetime} onApply={onTime} timeMode={timeMode} />
            </div>
          ) : null}
          {arrivals.length === 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-white/70">Filtrer par :</span>

            <FilterMenu label="Mode de transport" active={filters.excludedModes.length > 0}>
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">Inclure</p>
              {TRANSPORT_MODES.map((mode) => {
                const checked = !filters.excludedModes.includes(mode.uri)
                return (
                  <button
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#171D2D] hover:bg-[#F4F6FF]"
                    key={mode.uri}
                    onClick={() => onToggleListFilter('excludedModes', mode.uri)}
                    type="button"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-[#127996] bg-[#127996] text-white' : 'border-slate-300'}`}>
                      {checked ? '✓' : ''}
                    </span>
                    <ModeIcon mode={mode.label} className="h-5 w-5 text-[#127996]" />
                    {mode.label}
                  </button>
                )
              })}
            </FilterMenu>

            <FilterMenu label="Éviter une ligne" active={filters.excludedLines.length > 0}>
              {availableLines.length === 0 ? (
                <p className="px-2 py-2 text-sm text-slate-400">Aucune ligne dans les résultats.</p>
              ) : (
                availableLines.map((line) => {
                  const excluded = filters.excludedLines.includes(line.id)
                  return (
                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#171D2D] hover:bg-[#F4F6FF]"
                      key={line.id}
                      onClick={() => onToggleListFilter('excludedLines', line.id)}
                      type="button"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${excluded ? 'border-[#BD2636] bg-[#BD2636] text-white' : 'border-slate-300'}`}>
                        {excluded ? '✕' : ''}
                      </span>
                      <span
                        className="flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-xs font-bold text-white"
                        style={{ backgroundColor: line.color ?? '#647187' }}
                      >
                        {line.label}
                      </span>
                      <span className="text-slate-500">{excluded ? 'Évitée' : 'Éviter'}</span>
                    </button>
                  )
                })
              )}
            </FilterMenu>

            {([
              { label: 'Accès sans escaliers', key: 'stepFree' },
              { label: 'Éviter une correspondance', key: 'noTransfer' },
            ] as const).map(({ label, key }) => {
              const active = filters[key]
              return (
                <button
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                    active ? 'bg-[#8DE8FE] text-[#0C131F]' : 'bg-[#242b35] text-white hover:bg-[#8DE8FE]/20'
                  }`}
                  disabled={running}
                  key={label}
                  onClick={() => onToggleFilter(key)}
                  type="button"
                >
                  {label}
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-base font-black leading-none ${
                      active ? 'bg-[#0C131F] text-[#8DE8FE]' : 'bg-[#8DE8FE] text-[#0C131F]'
                    }`}
                  >
                    {active ? '✓' : '+'}
                  </span>
                </button>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {arrivals.length ? (
        <ArrivalsBoard station={station} arrivals={arrivals} />
      ) : journeys.length ? (
        <div className="flex flex-grow flex-col lg:flex-row">
          <ItineraireList
            journeys={journeys}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onRefresh={onRefresh}
            refreshing={running}
          />
          <div className="w-full px-2 lg:w-2/4 lg:px-0">
            {selected ? (
              // Keyed by id: selecting another itinerary remounts and fades the
              // new detail straight in — no exit gap, so it feels instant.
              <m.div key={selected.id} {...detailTransition}>
                <ItineraireDetail journey={selected} />
              </m.div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
          <p className="text-[15px] font-black uppercase tracking-[0.16em] text-[#127996]">
            {running ? 'Recherche en cours…' : 'Prêt à partir'}
          </p>
          <p className="mt-2 max-w-[520px] text-[17px] text-[#5E6878]">
            Décrivez votre trajet dans la barre ci-dessus — par exemple « de Châtelet à Nation maintenant ».
          </p>
        </div>
      )}
      <DevToolBubble error={error} metrics={metrics} output={output} />
    </m.main>
  )
}
