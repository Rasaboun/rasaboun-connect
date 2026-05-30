// Demo fixtures so the itinerary results screen can be rendered (and visually
// QA'd with Playwright) without loading the on-device model or hitting the
// Navitia API. Activated with the `?demo=1` query param. Châtelet -> Nation,
// mirroring the SNCF-Connect reference screenshot. Every section carries
// departure/arrival times so the detail timeline can show a time-pill per node.
import { nameMatchScore, type JourneyResult, type JourneySection, type NavitiaPlace } from '../travel/navitia'

const M1 = '#FFCD00'
const M2 = '#0064B0'

// Static place set for the correction autocomplete under ?demo=1 (no token).
// Two "Montreuil" homonyms (bigger one first, as Navitia quality would rank it)
// so the name-match ranking is demonstrable.
const DEMO_PLACES: NavitiaPlace[] = [
  { id: 'sa:chatelet', name: 'Châtelet, Paris' },
  { id: 'sa:nation', name: 'Nation, Paris' },
  { id: 'sa:montreuil93', name: 'Montreuil, Seine-Saint-Denis' },
  { id: 'sa:montreuil-yvelines', name: 'Montreuil, Versailles (Yvelines)' },
  { id: 'sa:gare-du-nord', name: 'Gare du Nord, Paris' },
  { id: 'sa:bastille', name: 'Bastille, Paris' },
  { id: 'sa:saint-lazare', name: 'Saint-Lazare, Paris' },
  { id: 'sa:republique', name: 'République, Paris' },
  { id: 'sa:montparnasse', name: 'Montparnasse, Paris' },
  { id: 'sa:opera', name: 'Opéra, Paris' },
]

export const DEMO_ORIGIN = DEMO_PLACES[0]
export const DEMO_DESTINATION = DEMO_PLACES[1]

export function demoSearchPlaces(query: string): Promise<NavitiaPlace[]> {
  const matches = DEMO_PLACES.map((place) => ({ place, score: nameMatchScore(place.name, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.place)
  return Promise.resolve(matches.slice(0, 8))
}

function nav(hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `20260528T${hh}${mm}00`
}

const NATION_STOPS = [
  'Châtelet',
  'Hôtel de Ville',
  'Saint-Paul',
  'Bastille',
  'Gare de Lyon',
  'Reuilly - Diderot',
  'Nation',
].map((stopPoint) => ({ stopPoint }))

// Approximate Paris coordinates so the MapKit map can draw the demo journey.
const COORDS: Record<string, { lat: number; lon: number }> = {
  'Départ': { lat: 48.8593, lon: 2.345 },
  'Châtelet': { lat: 48.8584, lon: 2.347 },
  'Hôtel de Ville': { lat: 48.8575, lon: 2.3517 },
  'Saint-Paul': { lat: 48.8552, lon: 2.361 },
  'Bastille': { lat: 48.8531, lon: 2.3692 },
  'Gare de Lyon': { lat: 48.8449, lon: 2.3735 },
  'Reuilly - Diderot': { lat: 48.8472, lon: 2.3876 },
  'Nation': { lat: 48.8484, lon: 2.3958 },
}

function coordsFor(names: string[]): { lat: number; lon: number }[] {
  return names.map((name) => COORDS[name]).filter((c): c is { lat: number; lon: number } => Boolean(c))
}

function walk(
  id: string,
  seconds: number,
  from: string,
  to: string,
  dep: string,
  arr: string,
): JourneySection {
  return {
    id,
    type: 'street_network',
    mode: 'walking',
    label: 'Marche',
    from,
    to,
    durationSeconds: seconds,
    departure: dep,
    arrival: arr,
    color: null,
    textColor: null,
    direction: null,
    lineId: null,
    path: coordsFor([from, to]),
    stopDateTimes: [],
  }
}

function metro(
  id: string,
  line: string,
  color: string,
  from: string,
  to: string,
  seconds: number,
  direction: string,
  stops: { stopPoint: string }[],
  dep: string,
  arr: string,
): JourneySection {
  return {
    id,
    type: 'public_transport',
    mode: 'Métro',
    label: line,
    from,
    to,
    durationSeconds: seconds,
    departure: dep,
    arrival: arr,
    color,
    textColor: '#000000',
    direction,
    lineId: `line:demo:${line}`,
    path: coordsFor(stops.map((stop) => stop.stopPoint)),
    stopDateTimes: stops,
  }
}

export const DEMO_JOURNEYS: JourneyResult[] = [
  {
    id: 'journey-0',
    type: 'best',
    durationSeconds: 14 * 60,
    transfers: 0,
    departure: nav(20, 8),
    arrival: nav(20, 22),
    co2: '20 gEC',
    sections: [
      walk('s0-0', 3 * 60, 'Départ', 'Châtelet', nav(20, 8), nav(20, 11)),
      metro('s0-1', '1', M1, 'Châtelet', 'Nation', 11 * 60, 'Château de Vincennes', NATION_STOPS, nav(20, 11), nav(20, 22)),
    ],
  },
  {
    id: 'journey-1',
    type: 'rapid',
    durationSeconds: 20 * 60,
    transfers: 1,
    departure: nav(20, 8),
    arrival: nav(20, 28),
    co2: '24 gEC',
    sections: [
      metro('s1-0', '1', M1, 'Châtelet', 'Bastille', 6 * 60, 'Château de Vincennes', NATION_STOPS.slice(0, 4), nav(20, 8), nav(20, 14)),
      metro('s1-1', '2', M2, 'Bastille', 'Nation', 8 * 60, 'Nation', NATION_STOPS.slice(3), nav(20, 20), nav(20, 28)),
    ],
  },
  {
    id: 'journey-2',
    type: 'rapid',
    durationSeconds: 14 * 60,
    transfers: 0,
    departure: nav(20, 10),
    arrival: nav(20, 24),
    co2: '20 gEC',
    sections: [
      walk('s2-0', 3 * 60, 'Départ', 'Châtelet', nav(20, 10), nav(20, 13)),
      metro('s2-1', '1', M1, 'Châtelet', 'Nation', 11 * 60, 'Château de Vincennes', NATION_STOPS, nav(20, 13), nav(20, 24)),
    ],
  },
  {
    id: 'journey-3',
    type: 'rapid',
    durationSeconds: 14 * 60,
    transfers: 0,
    departure: nav(20, 12),
    arrival: nav(20, 26),
    co2: '20 gEC',
    sections: [
      walk('s3-0', 3 * 60, 'Départ', 'Châtelet', nav(20, 12), nav(20, 15)),
      metro('s3-1', '1', M1, 'Châtelet', 'Nation', 11 * 60, 'Château de Vincennes', NATION_STOPS, nav(20, 15), nav(20, 26)),
    ],
  },
  {
    id: 'journey-4',
    type: 'rapid',
    durationSeconds: 18 * 60,
    transfers: 1,
    departure: nav(20, 12),
    arrival: nav(20, 30),
    co2: '24 gEC',
    sections: [
      metro('s4-0', '1', M1, 'Châtelet', 'Bastille', 6 * 60, 'Château de Vincennes', NATION_STOPS.slice(0, 4), nav(20, 12), nav(20, 18)),
      metro('s4-1', '2', M2, 'Bastille', 'Nation', 8 * 60, 'Nation', NATION_STOPS.slice(3), nav(20, 24), nav(20, 30)),
    ],
  },
]
