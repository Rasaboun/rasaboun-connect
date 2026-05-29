import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDeparturesUrl,
  buildJourneySearchParams,
  fetchJourneys,
  formatNavitiaDateTime,
  groupArrivals,
  nameMatchScore,
  normalizeArrivals,
  normalizeJourneys,
  pickBestPlace,
  rankPlaces,
  type Arrival,
} from './navitia'

describe('pickBestPlace', () => {
  it('uses the first Navitia place result as the best match', () => {
    expect(
      pickBestPlace({
        places: [
          { id: 'stop_area:second', name: 'Second' },
          { id: 'stop_area:first', name: 'First' },
        ],
      }),
    ).toEqual({ id: 'stop_area:second', name: 'Second' })
  })
})

describe('nameMatchScore', () => {
  it('scores an exact head match above a substring match', () => {
    const exact = nameMatchScore('Montreuil (Seine-Saint-Denis)', 'montreuil')
    const substring = nameMatchScore('Rue de Montreuil (Paris)', 'montreuil')
    expect(exact).toBeGreaterThan(substring)
  })

  it('ignores accents and case', () => {
    expect(nameMatchScore('Châtelet (Paris)', 'chatelet')).toBe(4)
  })
})

describe('rankPlaces', () => {
  it('ranks by name match, then Navitia quality', () => {
    const ranked = rankPlaces(
      [
        { id: 'rue', name: 'Rue de Montreuil (Paris)', quality: 90 },
        { id: 'city-small', name: 'Montreuil (Yvelines)', quality: 30 },
        { id: 'city-big', name: 'Montreuil (Seine-Saint-Denis)', quality: 80 },
      ],
      'montreuil',
    )
    expect(ranked.map((p) => p.id)).toEqual(['city-big', 'city-small', 'rue'])
  })
})

describe('buildJourneySearchParams', () => {
  it('sends only the meaningful inputs (proxy owns count/data_freshness/disable_geojson)', () => {
    expect(
      buildJourneySearchParams({
        from: 'stop_area:RAT:SA:CHLET',
        to: 'stop_area:RAT:SA:NATIO',
        datetime: '20260528T084500',
        timeMode: 'depart_at',
      }).toString(),
    ).toBe(
      'from=stop_area%3ARAT%3ASA%3ACHLET&to=stop_area%3ARAT%3ASA%3ANATIO&datetime=20260528T084500&datetime_represents=departure',
    )

    expect(
      buildJourneySearchParams({
        from: 'a',
        to: 'b',
        datetime: '20260528T180000',
        timeMode: 'arrive_by',
      }).get('datetime_represents'),
    ).toBe('arrival')
  })
})

describe('buildDeparturesUrl', () => {
  it('targets the proxy stop_areas departures route (proxy adds data_freshness)', () => {
    const url = buildDeparturesUrl('stop_area:IDFM:71370', {
      fromDatetime: '20260529T120000',
      count: 4,
    })
    expect(url.origin).toBe('https://proxy.test')
    expect(url.pathname).toBe('/stop_areas/stop_area%3AIDFM%3A71370/departures')
    expect(url.searchParams.get('count')).toBe('4')
    expect(url.searchParams.has('data_freshness')).toBe(false)
    expect(url.searchParams.get('from_datetime')).toBe('20260529T120000')
  })

  it('omits from_datetime when not provided', () => {
    const url = buildDeparturesUrl('stop_area:IDFM:71370', { fromDatetime: null, count: 3 })
    expect(url.searchParams.has('from_datetime')).toBe(false)
  })
})

describe('fetchJourneys → proxy request', () => {
  afterEach(() => vi.unstubAllGlobals())

  // The filter chips are only real if the emitted query uses the proxy's param
  // names (max_transfers, repeatable forbidden_uris) — not Navitia's raw names.
  it('hits the proxy /journeys with the filter params the Worker reads', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ journeys: [] }), { headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchJourneys({
      origin: { id: 'A', name: 'A' },
      destination: { id: 'B', name: 'B' },
      intent: { name: 'search_itinerary', origin: 'A', destination: 'B', timeMode: 'depart_at', timeHuman: null, includeModes: [], excludeModes: [] },
      datetime: null,
      options: { maxTransfers: 0, wheelchair: true, forbiddenUris: ['line:1', 'physical_mode:Bus'] },
    })

    const url = fetchMock.mock.calls[0][0] as URL
    expect(url.origin).toBe('https://proxy.test')
    expect(url.pathname).toBe('/journeys')
    expect(url.searchParams.get('from')).toBe('A')
    expect(url.searchParams.get('max_transfers')).toBe('0')
    expect(url.searchParams.get('wheelchair')).toBe('true')
    expect(url.searchParams.getAll('forbidden_uris')).toEqual(['line:1', 'physical_mode:Bus'])
    // The Worker owns these — the client must not send them.
    expect(url.searchParams.has('count')).toBe(false)
    expect(url.searchParams.has('max_nb_transfers')).toBe(false)
    expect(url.searchParams.has('forbidden_uris[]')).toBe(false)
  })
})

describe('normalizeArrivals', () => {
  it('maps a departures board to arrival rows with realtime flag', () => {
    expect(
      normalizeArrivals({
        departures: [
          {
            display_informations: {
              code: '14',
              color: '62259D',
              text_color: 'FFFFFF',
              commercial_mode: 'Métro',
              physical_mode: 'Metro',
              direction: 'Saint-Lazare',
              network: 'RATP',
            },
            stop_date_time: {
              departure_date_time: '20260529T120300',
              base_departure_date_time: '20260529T120000',
              data_freshness: 'realtime',
            },
          },
          {
            display_informations: { label: 'L', color: '67B4E7', commercial_mode: 'Train', headsign: 'Nanterre' },
            stop_date_time: { departure_date_time: '20260529T120500', data_freshness: 'base_schedule' },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'arrival-0',
        lineCode: '14',
        mode: 'Métro',
        color: '#62259D',
        textColor: '#FFFFFF',
        direction: 'Saint-Lazare',
        network: 'RATP',
        departure: '20260529T120300',
        realtime: true,
      },
      {
        id: 'arrival-1',
        lineCode: 'L',
        mode: 'Train',
        color: '#67B4E7',
        textColor: null,
        direction: 'Nanterre',
        network: null,
        departure: '20260529T120500',
        realtime: false,
      },
    ])
  })
})

describe('groupArrivals', () => {
  it('groups by line, keeping up to two directions and the next times each', () => {
    const flat: Arrival[] = [
      { id: '0', lineCode: '13', mode: 'Métro', color: '#C', textColor: '#W', network: 'RATP', direction: 'Châtillon', departure: '20260529T120100', realtime: true },
      { id: '1', lineCode: '14', mode: 'Métro', color: '#A', textColor: '#B', network: 'RATP', direction: 'Olympiades', departure: '20260529T120130', realtime: true },
      { id: '2', lineCode: '13', mode: 'Métro', color: '#C', textColor: '#W', network: 'RATP', direction: 'Saint-Denis', departure: '20260529T120200', realtime: false },
      { id: '3', lineCode: '13', mode: 'Métro', color: '#C', textColor: '#W', network: 'RATP', direction: 'Châtillon', departure: '20260529T120500', realtime: true },
      { id: '4', lineCode: '13', mode: 'Métro', color: '#C', textColor: '#W', network: 'RATP', direction: 'Châtillon', departure: '20260529T120900', realtime: true },
      { id: '5', lineCode: '13', mode: 'Métro', color: '#C', textColor: '#W', network: 'RATP', direction: 'Asnières', departure: '20260529T121000', realtime: false },
    ]

    expect(groupArrivals(flat)).toEqual([
      {
        lineCode: '13',
        mode: 'Métro',
        color: '#C',
        textColor: '#W',
        network: 'RATP',
        directions: [
          {
            direction: 'Châtillon',
            times: [
              { departure: '20260529T120100', realtime: true },
              { departure: '20260529T120500', realtime: true },
            ],
          },
          { direction: 'Saint-Denis', times: [{ departure: '20260529T120200', realtime: false }] },
        ],
      },
      {
        lineCode: '14',
        mode: 'Métro',
        color: '#A',
        textColor: '#B',
        network: 'RATP',
        directions: [{ direction: 'Olympiades', times: [{ departure: '20260529T120130', realtime: true }] }],
      },
    ])
  })
})

describe('formatNavitiaDateTime', () => {
  it('formats dates as Navitia basic ISO timestamps', () => {
    expect(formatNavitiaDateTime(new Date(2026, 4, 28, 8, 45, 0))).toBe(
      '20260528T084500',
    )
  })
})

describe('normalizeJourneys', () => {
  it('keeps route summary and public transport timeline details', () => {
    const journeys = normalizeJourneys({
      journeys: [
        {
          type: 'best',
          duration: 1380,
          nb_transfers: 1,
          departure_date_time: '20260528T084500',
          arrival_date_time: '20260528T090800',
          co2_emission: { value: 12.4, unit: 'gEC' },
          sections: [
            {
              type: 'street_network',
              mode: 'walking',
              duration: 240,
              from: { name: 'Châtelet' },
              to: { name: 'Châtelet - Les Halles' },
              departure_date_time: '20260528T084500',
              arrival_date_time: '20260528T084900',
            },
            {
              type: 'public_transport',
              duration: 900,
              from: { name: 'Châtelet - Les Halles' },
              to: { name: 'Nation' },
              departure_date_time: '20260528T084900',
              arrival_date_time: '20260528T090400',
              display_informations: {
                code: 'A',
                color: 'E2231A',
                text_color: 'FFFFFF',
                commercial_mode: 'RER',
                direction: 'Marne-la-Vallée Chessy',
              },
              geojson: { coordinates: [[2.347, 48.862], [2.396, 48.848]] },
            },
          ],
        },
      ],
    })

    expect(journeys).toEqual([
      {
        id: 'journey-0',
        type: 'best',
        durationSeconds: 1380,
        transfers: 1,
        departure: '20260528T084500',
        arrival: '20260528T090800',
        co2: '12 gEC',
        sections: [
          {
            id: 'journey-0-section-0',
            type: 'street_network',
            mode: 'walking',
            label: 'Walk',
            from: 'Châtelet',
            to: 'Châtelet - Les Halles',
            durationSeconds: 240,
            departure: '20260528T084500',
            arrival: '20260528T084900',
            color: null,
            textColor: null,
            direction: null,
            lineId: null,
            path: [],
            stopDateTimes: [],
          },
          {
            id: 'journey-0-section-1',
            type: 'public_transport',
            mode: 'RER',
            label: 'A',
            from: 'Châtelet - Les Halles',
            to: 'Nation',
            durationSeconds: 900,
            departure: '20260528T084900',
            arrival: '20260528T090400',
            color: '#E2231A',
            textColor: '#FFFFFF',
            direction: 'Marne-la-Vallée Chessy',
            lineId: null,
            path: [
              { lat: 48.862, lon: 2.347 },
              { lat: 48.848, lon: 2.396 },
            ],
            stopDateTimes: [],
          },
        ],
      },
    ])
  })
})
