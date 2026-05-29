// Needle parses ONE natural-language trip into a single tool call: it has no
// notion of round-trips, multiple destinations, or stops along the way. We can't
// teach the model those here, but we can spot when a user clearly asked for one
// and explain the boundary instead of silently returning just the "aller".
//
// Pure string -> enum so the regexes (the false-positive-prone part, e.g.
// "depuis" must not read as "puis") stay unit-testable without React.

export type NeedleLimit = 'round-trip' | 'multi-dest'

// `allers?-?retours?` (sing./plur., hyphen/space/none), the "A/R" abbreviation,
// "et (le) retour", and the English "round trip".
const ROUND_TRIP = /allers?[\s-]?retours?|\bA\/?R\b|\bet\s+(le\s+)?retour\b|round[\s-]?trip/i

// "puis" as its own word (NOT inside "depuis"), "étape(s)", or "passant par".
// No leading \b on "étape": "é" is not a regex word char, so \b never matches
// between a space and "é".
const MULTI_DEST = /\bpuis\b|étapes?\b|passant\s+par/i

// Returns the strongest unsupported intent in the query, or null. Round-trip
// wins over multi-dest so only one nudge ever shows.
export function detectLimit(query: string): NeedleLimit | null {
  const q = query ?? ''
  if (ROUND_TRIP.test(q)) return 'round-trip'
  if (MULTI_DEST.test(q)) return 'multi-dest'
  return null
}
