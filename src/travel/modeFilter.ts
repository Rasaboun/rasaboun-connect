import type { SearchIntent } from './toolCall'

// "Mode de transport" options -> Navitia physical_mode uris. Unchecked ones are
// added to forbidden_uris[].
export const TRANSPORT_MODES = [
  { label: 'Métro', uri: 'physical_mode:Metro' },
  { label: 'RER', uri: 'physical_mode:RapidTransit' },
  { label: 'Train', uri: 'physical_mode:Train' },
  { label: 'Tram', uri: 'physical_mode:Tramway' },
  { label: 'Bus', uri: 'physical_mode:Bus' },
]

const ALL_MODE_URIS = TRANSPORT_MODES.map((mode) => mode.uri)

// Model mode names (include_modes / exclude_modes) -> physical_mode uris.
const MODE_NAME_TO_URI: Record<string, string> = {
  metro: 'physical_mode:Metro',
  rer: 'physical_mode:RapidTransit',
  train: 'physical_mode:Train',
  transilien: 'physical_mode:Train',
  tram: 'physical_mode:Tramway',
  tramway: 'physical_mode:Tramway',
  bus: 'physical_mode:Bus',
}

// Turn the model's include_modes / exclude_modes into the set of modes to forbid.
// include wins (whitelist -> forbid everything else); else exclude (blacklist).
export function excludedModesFromIntent(intent: SearchIntent): string[] {
  const toUri = (name: string) => MODE_NAME_TO_URI[name.toLowerCase()]
  const included = intent.includeModes.map(toUri).filter(Boolean)
  if (included.length > 0) return ALL_MODE_URIS.filter((uri) => !included.includes(uri))
  const excluded = intent.excludeModes.map(toUri).filter(Boolean)
  return [...new Set(excluded)]
}
