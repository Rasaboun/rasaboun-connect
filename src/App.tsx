import { useRef, useState } from 'react'
import { LazyMotion, MotionConfig, domAnimation, useReducedMotion } from 'framer-motion'
import { DEFAULT_TOOLS, MODEL_FILES } from './constants'
import { aggregateProgress } from './inference/progress'
import { generate } from './inference/generate'
import { parseHumanTime } from './time/parse'
import { fetchJourneys, fetchNextArrivals, formatNavitiaDateTime, resolvePlace, searchPlaces, type JourneyResult, type LineArrivals, type NavitiaPlace } from './travel/navitia'
import { parseNeedleToolCall, type NeedleIntent } from './travel/toolCall'
import { DEMO_DESTINATION, DEMO_JOURNEYS, DEMO_ORIGIN, demoSearchPlaces } from './data/demo-data'
import { type ModelStatus } from './components/NeedleInfoPopover'
import { excludedModesFromIntent } from './travel/modeFilter'
import { useNeedleModel } from './hooks/useNeedleModel'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ItineraryScreen } from './components/ItineraryScreen'
import type { Filters, MetricState } from './components/types'

const demoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

// Live itinerary data flows through the navitia-proxy Worker; the secret apiKey
// lives there, not in this bundle. Presence of the proxy URL enables live mode.
const navitiaEnabled = Boolean(import.meta.env.VITE_NAVITIA_PROXY_URL)
const defaultQuery = 'Comment aller de Chatelet a Nation maintenant ?'

// Ask the browser for the user's position; resolves to a Navitia place whose id
// is "lon;lat" (Navitia accepts coordinates as from/to). Resolves null if
// geolocation is unavailable or the user denies the prompt.
function requestCurrentLocation(): Promise<NavitiaPlace | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ id: `${pos.coords.longitude};${pos.coords.latitude}`, name: 'Ma position' }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

export default function App() {
  const prefersReducedMotion = useReducedMotion()
  const { model, progress, error: modelError, loading, retry } = useNeedleModel()
  const modelStatus: ModelStatus = {
    loading,
    error: modelError,
    agg: aggregateProgress(progress, Object.keys(MODEL_FILES).length),
    retry,
  }
  const [query, setQuery] = useState(defaultQuery)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [intent, setIntent] = useState<NeedleIntent | null>(null)
  const [arrivals, setArrivals] = useState<LineArrivals[]>([])
  const [station, setStation] = useState<NavitiaPlace | null>(null)
  const [origin, setOrigin] = useState<NavitiaPlace | null>(demoMode ? DEMO_ORIGIN : null)
  const [destination, setDestination] = useState<NavitiaPlace | null>(demoMode ? DEMO_DESTINATION : null)
  const [datetime, setDatetime] = useState<string | null>(null)
  const [timeMode, setTimeMode] = useState<'depart_at' | 'arrive_by'>('depart_at')
  const [journeys, setJourneys] = useState<JourneyResult[]>(demoMode ? DEMO_JOURNEYS : [])
  const [selectedId, setSelectedId] = useState<string | null>(demoMode ? DEMO_JOURNEYS[0].id : null)
  const [metrics, setMetrics] = useState<MetricState | null>(null)
  // The query string that produced the current journeys — drives the limitation
  // nudge. Separate from `query` so editing the bar after a search doesn't move it.
  const [searchedQuery, setSearchedQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({ noTransfer: false, stepFree: false, excludedModes: [], excludedLines: [] })
  const runId = useRef(0)

  // Autocomplete source for the correction fields: real Navitia, or a local
  // mock under ?demo=1 (no token) so the listbox is demonstrable.
  const placeSearch = (q: string) =>
    demoMode || !navitiaEnabled ? demoSearchPlaces(q) : searchPlaces(q)

  const journeyOptions = (f: Filters) => ({
    maxTransfers: f.noTransfer ? 0 : null,
    wheelchair: f.stepFree,
    forbiddenUris: [...f.excludedModes, ...f.excludedLines],
  })

  async function runSearch() {
    if (!model || running || !query.trim()) return
    const currentRun = runId.current + 1
    runId.current = currentRun
    const startedAt = performance.now()

    setRunning(true)
    setError(null)
    setOutput('')
    setIntent(null)
    setOrigin(null)
    setDestination(null)
    setJourneys([])
    setArrivals([])
    setStation(null)
    setSelectedId(null)
    setMetrics(null)
    setSearchedQuery('')

    try {
      const inputTokens = model.tokenizer.buildEncoderInput(query, DEFAULT_TOOLS, model.sessions.cfg.max_seq_len).length
      let fullText = ''
      let outputTokens = 0

      for await (const step of generate(model.sessions, model.tokenizer, query, DEFAULT_TOOLS, { maxGen: 160 })) {
        if (runId.current !== currentRun) return
        fullText = step.fullText
        outputTokens = step.step + 1
        setOutput(fullText)
        setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
      }

      const parsed = parseNeedleToolCall(fullText)
      if (!parsed.ok) throw new Error(parsed.message)
      if (!navitiaEnabled) throw new Error('Missing VITE_NAVITIA_PROXY_URL for itinerary requests.')

      // get_next_arrivals: resolve the station and show its next-departures board.
      if (parsed.intent.name === 'get_next_arrivals') {
        const resolvedStation = await resolvePlace(parsed.intent.station)
        if (!resolvedStation) throw new Error(`Impossible de résoudre la station "${parsed.intent.station}".`)
        const nextArrivals = await fetchNextArrivals({
          stop: resolvedStation,
          fromDatetime: formatNavitiaDateTime(new Date()),
          limit: parsed.intent.limit,
          line: parsed.intent.line,
        })
        if (runId.current !== currentRun) return
        setIntent(parsed.intent)
        setStation(resolvedStation)
        setArrivals(nextArrivals)
        setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
        return
      }

      const parsedDate = parsed.intent.timeHuman ? parseHumanTime(parsed.intent.timeHuman, 'fr') : null
      const nextDatetime = parsedDate ? formatNavitiaDateTime(parsedDate.date) : null

      // Resolve the destination by best name match (Navitia quality breaks ties).
      const resolvedDestination = await resolvePlace(parsed.intent.destination)
      if (!resolvedDestination) throw new Error(`Impossible de résoudre l'arrivée "${parsed.intent.destination}".`)

      // No départ in the request -> ask for the user's location and use it.
      let resolvedOrigin: NavitiaPlace | null
      if (parsed.intent.origin) {
        resolvedOrigin = await resolvePlace(parsed.intent.origin)
        if (!resolvedOrigin) throw new Error(`Impossible de résoudre le départ "${parsed.intent.origin}".`)
      } else {
        resolvedOrigin = await requestCurrentLocation()
        if (!resolvedOrigin) {
          throw new Error("Needle n'a pas trouvé de point de départ. Ajoutez-le dans la phrase ou accepter la demande de localisation")
        }
      }
      if (runId.current !== currentRun) return

      // Fresh filters derived from the request (e.g. "en bus" -> only Bus).
      const nextFilters: Filters = {
        noTransfer: false,
        stepFree: false,
        excludedModes: excludedModesFromIntent(parsed.intent),
        excludedLines: [],
      }

      const nextJourneys = await fetchJourneys({
        origin: resolvedOrigin,
        destination: resolvedDestination,
        intent: parsed.intent,
        datetime: nextDatetime,
        options: journeyOptions(nextFilters),
      })

      if (runId.current !== currentRun) return
      setIntent(parsed.intent)
      setFilters(nextFilters)
      setOrigin(resolvedOrigin)
      setDestination(resolvedDestination)
      setDatetime(nextDatetime)
      setTimeMode(parsed.intent.timeMode ?? 'depart_at')
      setJourneys(nextJourneys)
      setSearchedQuery(query)
      setSelectedId(nextJourneys[0]?.id ?? null)
      setMetrics({ inputTokens, outputTokens, latencyMs: performance.now() - startedAt })
    } catch (err) {
      if (runId.current === currentRun) setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      if (runId.current === currentRun) setRunning(false)
    }
  }

  // Re-run the journeys query with the current places/intent/time and the given
  // filters. Shared by place correction and filter toggles. No-op without a
  // token or a prior search (demo mode just updates the UI).
  async function refetchJourneys(
    nextOrigin: NavitiaPlace | null,
    nextDestination: NavitiaPlace | null,
    nextFilters: typeof filters,
    nextDatetime: string | null = datetime,
    nextTimeMode: 'depart_at' | 'arrive_by' = timeMode,
  ) {
    if (!navitiaEnabled || !intent || intent.name !== 'search_itinerary' || !nextOrigin || !nextDestination) return
    const currentRun = runId.current + 1
    runId.current = currentRun
    setRunning(true)
    setError(null)
    try {
      const nextJourneys = await fetchJourneys({
        origin: nextOrigin,
        destination: nextDestination,
        intent: { ...intent, timeMode: nextTimeMode },
        datetime: nextDatetime,
        options: journeyOptions(nextFilters),
      })
      if (runId.current !== currentRun) return
      setJourneys(nextJourneys)
      setSelectedId(nextJourneys[0]?.id ?? null)
    } catch (err) {
      if (runId.current === currentRun) setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      if (runId.current === currentRun) setRunning(false)
    }
  }

  // User corrected a place via the autocomplete (or hit "Inverser pour le
  // retour"): update it and re-fetch. Clear the searched query so the limitation
  // nudge — derived from the typed sentence — drops once results no longer match it.
  function applyPlaces(nextOrigin: NavitiaPlace, nextDestination: NavitiaPlace) {
    setOrigin(nextOrigin)
    setDestination(nextDestination)
    setSearchedQuery('')
    void refetchJourneys(nextOrigin, nextDestination, filters)
  }

  // User changed the time field (mode = depart_at/arrive_by, local = datetime-local
  // string, '' = now) → re-fetch.
  function applyTime(mode: 'depart_at' | 'arrive_by', local: string) {
    let nav: string | null = null
    if (local) {
      const d = new Date(local)
      // Bail on an unparseable datetime-local string: keep current state and
      // skip the refetch so 'NaNNaNNaNTNaNNaNNaN' never reaches the proxy.
      if (Number.isNaN(d.getTime())) return
      nav = formatNavitiaDateTime(d)
    }
    setDatetime(nav)
    setTimeMode(mode)
    void refetchJourneys(origin, destination, filters, nav, mode)
  }

  // Toggle a boolean "Filtrer par" chip and re-fetch.
  function toggleFilter(key: 'noTransfer' | 'stepFree') {
    const next = { ...filters, [key]: !filters[key] }
    setFilters(next)
    void refetchJourneys(origin, destination, next)
  }

  // Toggle a value inside a string-array filter (excludedModes / excludedLines).
  function toggleListFilter(key: 'excludedModes' | 'excludedLines', uri: string) {
    const current = filters[key]
    const nextList = current.includes(uri) ? current.filter((u) => u !== uri) : [...current, uri]
    const next = { ...filters, [key]: nextList }
    setFilters(next)
    void refetchJourneys(origin, destination, next)
  }

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
        <div className="min-h-screen bg-[#F3F3F8] font-sans text-[#0C131F]">
          <Header />
          <ItineraryScreen
            datetime={datetime}
            destination={destination}
            disabled={!model || loading || Boolean(modelError)}
            error={error}
            modelStatus={modelStatus}
            filters={filters}
            journeys={journeys}
            arrivals={arrivals}
            station={station}
            metrics={metrics}
            onCorrect={applyPlaces}
            onTime={applyTime}
            onRefresh={() => refetchJourneys(origin, destination, filters)}
            timeMode={timeMode}
            onToggleFilter={toggleFilter}
            onToggleListFilter={toggleListFilter}
            onNewSearch={() => {
              setOutput('')
              setError(null)
              setIntent(null)
              setJourneys([])
              setArrivals([])
              setStation(null)
              setSearchedQuery('')
            }}
            onSubmit={runSearch}
            origin={origin}
            output={output}
            placeSearch={placeSearch}
            query={query}
            running={running}
            searchedQuery={searchedQuery}
            selectedId={selectedId}
            setQuery={setQuery}
            setSelectedId={setSelectedId}
          />
          <Footer />
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
