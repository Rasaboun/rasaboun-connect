// Lazy, single-init loader for Apple MapKit JS — mirrors the load-once pattern
// used for onnxruntime in src/inference/session.ts. The pre-signed, domain-locked
// ES256 JWT is fetched at runtime from the navitia-proxy Worker (/mapkit-token),
// so no token ships in the bundle. Apple still enforces the token's `origin`
// claim server-side, so it only works when served from the registered host.
const PROXY_BASE = (import.meta.env.VITE_NAVITIA_PROXY_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

// Map is available when the proxy is configured; a failed token fetch later just
// leaves the map hidden (ItineraryMap catches loadMapkit rejection).
export const mapkitEnabled = Boolean(PROXY_BASE)

let loadPromise: Promise<typeof mapkit> | null = null

async function fetchMapkitToken(): Promise<string> {
  const response = await fetch(`${PROXY_BASE}/mapkit-token`)
  if (!response.ok) throw new Error(`MapKit token request failed (${response.status}).`)
  const { token } = (await response.json()) as { token?: string }
  if (!token) throw new Error('MapKit token missing from proxy response')
  return token
}

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.mapkit) return resolve()
    const existing = document.getElementById('mapkit-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('MapKit JS failed to load')))
      return
    }
    const script = document.createElement('script')
    script.id = 'mapkit-js'
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js'
    script.crossOrigin = 'anonymous'
    script.async = true
    script.dataset.libraries = 'map,annotations,overlays'
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('MapKit JS failed to load')))
    document.head.appendChild(script)
  })
}

export function loadMapkit(): Promise<typeof mapkit> {
  if (!mapkitEnabled) return Promise.reject(new Error('MapKit proxy not configured'))
  if (loadPromise) return loadPromise
  // Fetch the token first so a token/CORS failure rejects here and the map hides,
  // rather than the script loading but never authorizing.
  loadPromise = Promise.all([fetchMapkitToken(), injectScript()]).then(
    ([token]) =>
      new Promise<typeof mapkit>((resolve, reject) => {
        const mk = window.mapkit
        if (!mk) return reject(new Error('MapKit JS unavailable after load'))
        try {
          mk.init({
            authorizationCallback: (done) => done(token),
          })
          resolve(mk)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('MapKit init failed'))
        }
      }),
  )
  return loadPromise
}
