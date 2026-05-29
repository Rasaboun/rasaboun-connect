// Canonical RATP tools used to train needle v29. Same string as the Python
// smoke test, so outputs are directly comparable.
export const DEFAULT_TOOLS = JSON.stringify(
  [
    {
      name: 'search_itinerary',
      description:
        'Search a public transport itinerary in the Paris and Ile-de-France area.',
      parameters: {
        origin: {
          type: 'string',
          description:
            'Starting place, station, address, or landmark. Omit if the user wants to use current location.',
          required: false,
        },
        destination: {
          type: 'string',
          description: 'Destination place, station, address, or landmark.',
          required: true,
        },
        time_human: {
          type: 'string',
          description:
            "Requested departure or arrival time in the user's own words, for example 'demain a 8h' or 'today at 6pm'.",
          required: false,
        },
        time_mode: {
          type: 'string',
          description: 'Either depart_at or arrive_by.',
          required: false,
        },
        include_modes: {
          type: 'array',
          description:
            'Transport modes explicitly requested by the user. Allowed values: metro, rer, bus, tram, transilien, walking, bike.',
          required: false,
        },
        exclude_modes: {
          type: 'array',
          description:
            'Transport modes explicitly excluded by the user. Allowed values: metro, rer, bus, tram, transilien, walking, bike.',
          required: false,
        },
      },
    },
    {
      name: 'get_next_arrivals',
      description:
        'Get the next train, RER, metro or tram arrivals at a specified RATP/IDF station or stop.',
      parameters: {
        station: {
          type: 'string',
          description: 'Station or stop name. Required.',
          required: true,
        },
        line: {
          type: 'string',
          description:
            "Optional line filter, for example '4', 'RER A', 'T3a', 'L'. Omit to return arrivals across all lines serving the station.",
          required: false,
        },
        limit: {
          type: 'integer',
          description:
            'Maximum number of upcoming arrivals to return (default 3).',
          required: false,
        },
      },
    },
  ],
  null,
  2,
)

export const EXAMPLE_QUERIES = [
  'Comment aller de Châtelet à Nation ?',
  'How do I get from Gare du Nord to Bastille ?',
  'Prochains métros à Saint-Lazare',
  'Itinéraire Montparnasse vers République demain à 8h',
  'arriver à Bastille avant 18h depuis Châtelet',
  'stp dis moi cmt aller a opera depuis nation',
  'next train at La Défense line A',
  'Quel temps fait-il à Paris ?',
]

// What Needle can and can't do — single source for the info popover (and any
// future surface). Showing capabilities alongside limits reads better than a
// bare "can't" list.
export const NEEDLE_CAPABILITIES = {
  understands: [
    'Un trajet d’un point A à un point B',
    'Une heure de départ ou d’arrivée (« demain 8h », « avant 18h »)',
    'Des modes précisés (métro, RER, bus, tram, vélo…)',
  ],
  notYet: [
    'Les allers-retours — un aller à la fois',
    'Plusieurs destinations ou étapes',
    'Les trajets hors Île-de-France',
  ],
} as const

export const MODE_TABS = [
  { id: 'all', label: 'Tout rechercher', icon: '🔍' },
  { id: 'trains', label: 'Trains', icon: '🚆' },
  { id: 'bus', label: 'Bus et covoiturage', icon: '🚌' },
  { id: 'urban', label: 'Itinéraires urbains', icon: '📍' },
] as const

export const EXPLORE_CARDS = [
  { label: 'Châtelet → Nation', query: 'Comment aller de Châtelet à Nation ?', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Gare du Nord → Bastille', query: 'How do I get from Gare du Nord to Bastille ?', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Saint-Lazare', query: 'Prochains métros à Saint-Lazare', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: 'Montparnasse', query: 'Itinéraire Montparnasse vers République demain à 8h', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
] as const

// Weights are served from the Hugging Face Hub (public, ungated):
//   https://huggingface.co/rasaboun/needle-transit-onnx
// Pinned to a commit so the bytes always match the parity check. HF `resolve`
// URLs send CORS (origin-reflected) + Content-Length, so the cross-origin
// streaming + per-file progress in `fetchCached` work from any deploy host and
// from localhost. Swap the SHA for `main` to always track the latest upload.
const MODEL_BASE =
  'https://huggingface.co/rasaboun/needle-transit-onnx/resolve/d4f6f1b072119d2d8453fb3f3b283e7f5b035c35'

export const MODEL_FILES = {
  encoder: { name: 'encoder.onnx', url: `${MODEL_BASE}/encoder.onnx` },
  decoder: { name: 'decoder_step.onnx', url: `${MODEL_BASE}/decoder_step.onnx` },
  tokenizer: { name: 'needle.model', url: `${MODEL_BASE}/needle.model` },
  specials: { name: 'tokenizer-specials.json', url: `${MODEL_BASE}/tokenizer-specials.json` },
  config: { name: 'needle_torch.config.json', url: `${MODEL_BASE}/needle_torch.config.json` },
} as const
