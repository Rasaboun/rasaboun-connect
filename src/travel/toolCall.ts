export type SearchIntent = {
  name: 'search_itinerary'
  origin: string | null
  destination: string
  timeHuman: string | null
  timeMode: 'depart_at' | 'arrive_by' | null
  includeModes: string[]
  excludeModes: string[]
}

export type NextArrivalsIntent = {
  name: 'get_next_arrivals'
  station: string
  line: string | null
  limit: number | null
}

export type NeedleIntent = SearchIntent | NextArrivalsIntent

export type ParsedNeedleToolCall =
  | { ok: true; intent: NeedleIntent }
  | {
      ok: false
      reason: 'empty' | 'invalid_json' | 'unsupported_intent' | 'missing_destination' | 'missing_station'
      message: string
    }

type RawToolCall = {
  name?: unknown
  arguments?: Record<string, unknown>
}

function stripToolCall(text: string): string {
  return text.trim().startsWith('<tool_call>')
    ? text.trim().slice('<tool_call>'.length).trim()
    : text.trim()
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function asTimeMode(value: unknown): SearchIntent['timeMode'] {
  return value === 'depart_at' || value === 'arrive_by' ? value : null
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  return null
}

export function parseNeedleToolCall(text: string): ParsedNeedleToolCall {
  const clean = stripToolCall(text)
  if (!clean) {
    return { ok: false, reason: 'empty', message: 'Needle did not emit a tool call yet.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(clean)
  } catch {
    return {
      ok: false,
      reason: 'invalid_json',
      message: 'Needle emitted an incomplete or invalid tool call.',
    }
  }

  const calls: RawToolCall[] = Array.isArray(parsed)
    ? parsed.filter((item): item is RawToolCall => typeof item === 'object' && item !== null)
    : typeof parsed === 'object' && parsed !== null
      ? [parsed as RawToolCall]
      : []

  const call = calls.find(
    (item) => item.name === 'search_itinerary' || item.name === 'get_next_arrivals',
  )
  if (!call) {
    return {
      ok: false,
      reason: 'unsupported_intent',
      message: 'Needle understood the request, but this demo only opens itineraries.',
    }
  }

  const args = call.arguments ?? {}

  if (call.name === 'get_next_arrivals') {
    const station = asString(args.station)
    if (!station) {
      return {
        ok: false,
        reason: 'missing_station',
        message: 'Needle did not find a station in the request.',
      }
    }
    return {
      ok: true,
      intent: {
        name: 'get_next_arrivals',
        station,
        line: asString(args.line),
        limit: asInteger(args.limit),
      },
    }
  }

  const destination = asString(args.destination)
  if (!destination) {
    return {
      ok: false,
      reason: 'missing_destination',
      message: 'Needle did not find a destination in the request.',
    }
  }

  return {
    ok: true,
    intent: {
      name: 'search_itinerary',
      origin: asString(args.origin),
      destination,
      timeHuman: asString(args.time_human),
      timeMode: asTimeMode(args.time_mode),
      includeModes: asStringArray(args.include_modes),
      excludeModes: asStringArray(args.exclude_modes),
    },
  }
}
