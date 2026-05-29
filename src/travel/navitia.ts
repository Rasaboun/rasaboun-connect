import type { SearchIntent } from './toolCall'

// Itinerary requests go through our Cloudflare Worker (navitia-proxy), which
// holds the IDFM/Navitia apiKey as a secret and rate-limits per IP. The Worker
// owns the fixed Navitia params (type[], count, data_freshness, disable_geojson),
// so the client only sends the meaningful inputs. No token ships in the bundle.
const NAVITIA_BASE = (import.meta.env.VITE_NAVITIA_PROXY_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export type NavitiaPlace = {
  id: string
  name: string
}

type NavitiaRawPlace = {
  id?: string
  name?: string
  quality?: number
}

export type NavitiaPlacesResponse = {
  places?: NavitiaRawPlace[]
}

type NavitiaStopDateTime = {
  stop_point?: { name?: string }
}

type NavitiaSection = {
  type?: string
  mode?: string
  duration?: number
  from?: { name?: string; stop_area?: { name?: string } }
  to?: { name?: string; stop_area?: { name?: string } }
  departure_date_time?: string
  arrival_date_time?: string
  display_informations?: {
    code?: string
    label?: string
    color?: string
    text_color?: string
    commercial_mode?: string
    physical_mode?: string
    direction?: string
    headsign?: string
  }
  stop_date_times?: NavitiaStopDateTime[]
  links?: Array<{ type?: string; id?: string }>
  geojson?: { coordinates?: [number, number][] }
}

type NavitiaJourney = {
  type?: string
  duration?: number
  nb_transfers?: number
  departure_date_time?: string
  arrival_date_time?: string
  co2_emission?: { value?: number; unit?: string }
  sections?: NavitiaSection[]
}

export type NavitiaJourneysResponse = {
  journeys?: NavitiaJourney[]
  error?: { message?: string }
}

export type StopDateTime = {
  stopPoint: string
}

export type JourneySection = {
  id: string
  type: string
  mode: string
  label: string
  from: string
  to: string
  durationSeconds: number
  departure: string | null
  arrival: string | null
  color: string | null
  textColor: string | null
  direction: string | null
  lineId: string | null
  path: { lat: number; lon: number }[]
  stopDateTimes: StopDateTime[]
}

export type JourneyResult = {
  id: string
  type: string
  durationSeconds: number
  transfers: number
  departure: string | null
  arrival: string | null
  co2: string | null
  sections: JourneySection[]
}

type JourneyParamsInput = {
  from: string
  to: string
  datetime: string | null
  timeMode: SearchIntent['timeMode']
}

// Filters from the "Filtrer par" chips that map cleanly to Navitia params.
export type JourneyOptions = {
  maxTransfers?: number | null
  wheelchair?: boolean
  forbiddenUris?: string[]
}

type FetchJourneysInput = {
  origin: NavitiaPlace
  destination: NavitiaPlace
  intent: SearchIntent
  datetime: string | null
  options?: JourneyOptions
  signal?: AbortSignal
}

function assertProxy() {
  if (!NAVITIA_BASE) {
    throw new Error('Missing VITE_NAVITIA_PROXY_URL for itinerary requests.')
  }
}

function normalizeColor(value: string | undefined): string | null {
  if (!value) return null
  const clean = value.trim().replace(/^#/, '')
  return clean ? `#${clean}` : null
}

function formatCo2(co2: NavitiaJourney['co2_emission']): string | null {
  if (typeof co2?.value !== 'number' || !co2.unit) return null
  return `${co2.value.toFixed(0)} ${co2.unit}`
}

function sectionLabel(section: NavitiaSection): string {
  if (section.display_informations?.code) return section.display_informations.code
  if (section.display_informations?.label) return section.display_informations.label
  if (section.type === 'street_network' && section.mode === 'walking') return 'Walk'
  if (section.mode) return section.mode
  return section.type ?? 'Step'
}

function sectionMode(section: NavitiaSection): string {
  return (
    section.display_informations?.commercial_mode ??
    section.display_informations?.physical_mode ??
    section.mode ??
    section.type ??
    'transport'
  )
}

function navitiaDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

async function navitiaFetch<T>(url: URL, signal?: AbortSignal): Promise<T> {
  // No apiKey header — the proxy injects it. Errors (400/429/5xx) surface as a
  // thrown error with the proxy status, same as before.
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Itinerary request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

function deburr(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// How well a place name matches the extracted query. Navitia names look like
// "Montreuil (Seine-Saint-Denis)" or "Châtelet (Paris)", so we compare against
// the head (before any "(" / ","): exact head > prefix > whole-word > substring.
export function nameMatchScore(name: string, query: string): number {
  const n = deburr(name)
  const q = deburr(query)
  if (!q) return 0
  const head = n.split(/[(,]/)[0].trim()
  if (head === q || n === q) return 4
  if (head.startsWith(q) || n.startsWith(q)) return 3
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(n)) return 2
  if (n.includes(q)) return 1
  return 0
}

// Rank candidates by how well their name matches the extracted query, then by
// Navitia's own quality score (importance/relevance). No geography involved.
export function rankPlaces(places: NavitiaRawPlace[], query: string): NavitiaPlace[] {
  const valid = places.filter((p): p is NavitiaRawPlace & { id: string; name: string } => Boolean(p.id && p.name))
  const scored = valid
    .map((p) => ({ p, score: nameMatchScore(p.name, query), quality: p.quality ?? 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.quality - a.quality)
  const ordered = scored.length > 0 ? scored.map((x) => x.p) : valid
  return ordered.map((p) => ({ id: p.id, name: p.name }))
}

export function pickBestPlace(response: NavitiaPlacesResponse): NavitiaPlace | null {
  const first = response.places?.find((place) => place.id && place.name)
  return first?.id && first.name ? { id: first.id, name: first.name } : null
}

export function formatNavitiaDateTime(date: Date): string {
  return `${date.getFullYear()}${navitiaDatePart(date.getMonth() + 1)}${navitiaDatePart(
    date.getDate(),
  )}T${navitiaDatePart(date.getHours())}${navitiaDatePart(date.getMinutes())}${navitiaDatePart(
    date.getSeconds(),
  )}`
}

export function buildJourneySearchParams(input: JourneyParamsInput): URLSearchParams {
  // Only the meaningful inputs; the proxy owns count/data_freshness/disable_geojson.
  const params = new URLSearchParams()
  params.set('from', input.from)
  params.set('to', input.to)
  if (input.datetime) {
    params.set('datetime', input.datetime)
    params.set('datetime_represents', input.timeMode === 'arrive_by' ? 'arrival' : 'departure')
  }
  return params
}

export function normalizeJourneys(response: NavitiaJourneysResponse): JourneyResult[] {
  return (response.journeys ?? []).map((journey, journeyIndex) => {
    const journeyId = `journey-${journeyIndex}`
    return {
      id: journeyId,
      type: journey.type ?? 'journey',
      durationSeconds: journey.duration ?? 0,
      transfers: journey.nb_transfers ?? 0,
      departure: journey.departure_date_time ?? null,
      arrival: journey.arrival_date_time ?? null,
      co2: formatCo2(journey.co2_emission),
      sections: (journey.sections ?? []).map((section, sectionIndex) => ({
        id: `${journeyId}-section-${sectionIndex}`,
        type: section.type ?? 'section',
        mode: sectionMode(section),
        label: sectionLabel(section),
        from: section.from?.stop_area?.name ?? section.from?.name ?? 'Unknown',
        to: section.to?.stop_area?.name ?? section.to?.name ?? 'Unknown',
        durationSeconds: section.duration ?? 0,
        departure: section.departure_date_time ?? null,
        arrival: section.arrival_date_time ?? null,
        color: normalizeColor(section.display_informations?.color),
        textColor: normalizeColor(section.display_informations?.text_color),
        direction: section.display_informations?.direction ?? null,
        lineId: section.links?.find((link) => link.type === 'line')?.id ?? null,
        path: (section.geojson?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon })),
        stopDateTimes: (section.stop_date_times ?? []).map((sdt) => ({
          stopPoint: sdt.stop_point?.name ?? '',
        })),
      })),
    }
  })
}

// Returns up to `count` candidates, ranked by how well their name matches the
// query (then Navitia quality). Used both for resolution and for the correction
// autocomplete listbox.
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  count = 8,
): Promise<NavitiaPlace[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  assertProxy()
  const url = new URL(`${NAVITIA_BASE}/places`)
  url.searchParams.set('q', trimmed)
  // The proxy adds the type[] filter (region, stop, address, poi).
  url.searchParams.set('count', String(count))
  const response = await navitiaFetch<NavitiaPlacesResponse>(url, signal)
  return rankPlaces(response.places ?? [], trimmed)
}

export async function resolvePlace(
  query: string,
  signal?: AbortSignal,
): Promise<NavitiaPlace | null> {
  const places = await searchPlaces(query, signal)
  return places[0] ?? null
}

export async function fetchJourneys({
  origin,
  destination,
  intent,
  datetime,
  options,
  signal,
}: FetchJourneysInput): Promise<JourneyResult[]> {
  assertProxy()
  const url = new URL(`${NAVITIA_BASE}/journeys`)
  const params = buildJourneySearchParams({
    from: origin.id,
    to: destination.id,
    datetime,
    timeMode: intent.timeMode,
  })
  params.forEach((value, key) => url.searchParams.append(key, value))
  // Filter chips → proxy contract (the Worker maps these to Navitia):
  // "Éviter une correspondance" → max_transfers; "Accès sans escaliers" → wheelchair;
  // "Mode de transport" / "Éviter une ligne" → forbidden_uris (repeatable).
  if (options?.maxTransfers != null) url.searchParams.set('max_transfers', String(options.maxTransfers))
  if (options?.wheelchair) url.searchParams.set('wheelchair', 'true')
  for (const uri of options?.forbiddenUris ?? []) url.searchParams.append('forbidden_uris', uri)
  const response = await navitiaFetch<NavitiaJourneysResponse>(url, signal)
  return normalizeJourneys(response)
}

// --- get_next_arrivals: next departures board for a single stop ----------------
// Navitia `/departures` is a multi-route board (the big station screens). The
// flat `/stop_areas/{id}/departures` form resolves without a /coverage prefix,
// just like /journeys and /places on this base.

type NavitiaDeparture = {
  display_informations?: {
    code?: string
    label?: string
    name?: string
    color?: string
    text_color?: string
    direction?: string
    headsign?: string
    commercial_mode?: string
    physical_mode?: string
    network?: string
  }
  stop_date_time?: {
    departure_date_time?: string
    base_departure_date_time?: string
    data_freshness?: string
  }
}

export type NavitiaDeparturesResponse = {
  departures?: NavitiaDeparture[]
  error?: { message?: string }
}

export type Arrival = {
  id: string
  lineCode: string
  mode: string
  color: string | null
  textColor: string | null
  direction: string | null
  network: string | null
  departure: string | null
  realtime: boolean
}

export type DepartureTime = {
  departure: string | null
  realtime: boolean
}

export type DirectionArrivals = {
  direction: string
  times: DepartureTime[]
}

// One line serving the stop, with its (up to two) directions and the next
// departure times in each — what the board renders, one card per line.
export type LineArrivals = {
  lineCode: string
  mode: string
  color: string | null
  textColor: string | null
  network: string | null
  directions: DirectionArrivals[]
}

type FetchNextArrivalsInput = {
  stop: NavitiaPlace
  fromDatetime: string | null
  limit: number | null
  line: string | null
  signal?: AbortSignal
}

export function buildDeparturesUrl(
  stopId: string,
  params: { fromDatetime: string | null; count: number },
): URL {
  // The proxy adds data_freshness=realtime.
  const url = new URL(`${NAVITIA_BASE}/stop_areas/${encodeURIComponent(stopId)}/departures`)
  url.searchParams.set('count', String(params.count))
  if (params.fromDatetime) url.searchParams.set('from_datetime', params.fromDatetime)
  return url
}

export function normalizeArrivals(response: NavitiaDeparturesResponse): Arrival[] {
  return (response.departures ?? []).map((dep, index) => {
    const di = dep.display_informations ?? {}
    const sdt = dep.stop_date_time ?? {}
    return {
      id: `arrival-${index}`,
      lineCode: di.code ?? di.label ?? di.name ?? '?',
      mode: di.commercial_mode ?? di.physical_mode ?? 'transport',
      color: normalizeColor(di.color),
      textColor: normalizeColor(di.text_color),
      direction: di.direction ?? di.headsign ?? null,
      network: di.network ?? null,
      departure: sdt.departure_date_time ?? null,
      realtime: sdt.data_freshness === 'realtime',
    }
  })
}

// Fold the flat, time-sorted departures list into one entry per line, each with
// up to `maxDirections` directions and `maxTimes` upcoming times per direction.
// Navitia returns departures already sorted by time, so Map insertion order puts
// the soonest line/direction first — slicing keeps the nearest ones, no parsing.
export function groupArrivals(
  arrivals: Arrival[],
  {
    maxDirections = 2,
    maxTimes = 2,
    maxLines = 8,
  }: { maxDirections?: number; maxTimes?: number; maxLines?: number } = {},
): LineArrivals[] {
  const lines = new Map<
    string,
    { meta: Omit<LineArrivals, 'directions'>; dirs: Map<string, DepartureTime[]> }
  >()
  for (const arrival of arrivals) {
    const key = `${arrival.mode}|${arrival.lineCode}`
    let line = lines.get(key)
    if (!line) {
      line = {
        meta: {
          lineCode: arrival.lineCode,
          mode: arrival.mode,
          color: arrival.color,
          textColor: arrival.textColor,
          network: arrival.network,
        },
        dirs: new Map(),
      }
      lines.set(key, line)
    }
    const direction = arrival.direction ?? '—'
    const times = line.dirs.get(direction) ?? []
    if (times.length < maxTimes) times.push({ departure: arrival.departure, realtime: arrival.realtime })
    line.dirs.set(direction, times)
  }
  return [...lines.values()].slice(0, maxLines).map(({ meta, dirs }) => ({
    ...meta,
    directions: [...dirs.entries()]
      .slice(0, maxDirections)
      .map(([direction, times]) => ({ direction, times })),
  }))
}

// Loose match for the optional `line` arg ("4", "RER A", "T3a", "L") against the
// Navitia line code/mode. Diacritic- and case-insensitive; token match handles
// single-letter codes ("A" from "RER A") without over-matching short numbers.
function lineMatches(arrival: Arrival, line: string): boolean {
  const code = deburr(arrival.lineCode)
  if (!code) return false
  const q = deburr(line)
  if (!q) return true
  if (code === q) return true
  if (code.length >= 2 && (code.includes(q) || q.includes(code))) return true
  return q.split(/\s+/).some((token) => token === code)
}

export async function fetchNextArrivals({
  stop,
  fromDatetime,
  limit,
  line,
  signal,
}: FetchNextArrivalsInput): Promise<LineArrivals[]> {
  assertProxy()
  // Fetch a wide window so both directions of each line are present, then group.
  const url = buildDeparturesUrl(stop.id, { fromDatetime, count: 40 })
  const response = await navitiaFetch<NavitiaDeparturesResponse>(url, signal)
  let arrivals = normalizeArrivals(response)
  if (line) arrivals = arrivals.filter((arrival) => lineMatches(arrival, line))
  return groupArrivals(arrivals, { maxTimes: limit ?? 2 })
}
