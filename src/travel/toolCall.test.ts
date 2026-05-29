import { describe, expect, it } from 'vitest'
import { parseNeedleToolCall } from './toolCall'

describe('parseNeedleToolCall', () => {
  it('extracts a search itinerary call from streamed Needle output', () => {
    const parsed = parseNeedleToolCall(
      '<tool_call>[{"name":"search_itinerary","arguments":{"origin":"Châtelet","destination":"Nation","time_human":"demain à 8h","time_mode":"depart_at"}}]',
    )

    expect(parsed).toEqual({
      ok: true,
      intent: {
        name: 'search_itinerary',
        origin: 'Châtelet',
        destination: 'Nation',
        timeHuman: 'demain à 8h',
        timeMode: 'depart_at',
        includeModes: [],
        excludeModes: [],
      },
    })
  })

  it('extracts a get_next_arrivals call with line and limit', () => {
    const parsed = parseNeedleToolCall(
      '[{"name":"get_next_arrivals","arguments":{"station":"La Défense","line":"RER A","limit":5}}]',
    )

    expect(parsed).toEqual({
      ok: true,
      intent: { name: 'get_next_arrivals', station: 'La Défense', line: 'RER A', limit: 5 },
    })
  })

  it('defaults optional get_next_arrivals fields to null', () => {
    const parsed = parseNeedleToolCall(
      '<tool_call>[{"name":"get_next_arrivals","arguments":{"station":"Saint-Lazare"}}]',
    )

    expect(parsed).toEqual({
      ok: true,
      intent: { name: 'get_next_arrivals', station: 'Saint-Lazare', line: null, limit: null },
    })
  })

  it('reports a missing station for get_next_arrivals', () => {
    const parsed = parseNeedleToolCall('[{"name":"get_next_arrivals","arguments":{}}]')

    expect(parsed).toEqual({
      ok: false,
      reason: 'missing_station',
      message: 'Needle did not find a station in the request.',
    })
  })

  it('returns unsupported for tools the demo does not handle', () => {
    const parsed = parseNeedleToolCall('[{"name":"get_weather","arguments":{"city":"Paris"}}]')

    expect(parsed).toEqual({
      ok: false,
      reason: 'unsupported_intent',
      message: 'Needle understood the request, but this demo only opens itineraries.',
    })
  })
})
