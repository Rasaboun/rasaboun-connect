import { useEffect, useRef } from 'react'
import type { JourneyResult } from '../../travel/navitia'
import { loadMapkit, mapkitEnabled } from '../../map/mapkit'

// Common pin color for transfer (correspondance) nodes (SNCF navy).
const TRANSFER_PIN = '#0C131F'

// Glyph image for a transfer node: a circle with a gradient of the two line
// colors + the station initial, shown inside the native pin.
function gradientGlyph(a: string, b: string, label: string): Record<string, string> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>` +
    `</linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#g)"/>` +
    `<text x="12" y="12" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui,sans-serif" font-size="13" font-weight="800" fill="#FFFFFF">${label}</text></svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  return { 1: url, 2: url, 3: url }
}

// Apple MapKit JS map of the whole journey: one polyline per leg (line color for
// transit, dashed grey for walk) + A/B pins, fitted to the route. Renders
// nothing when MapKit isn't configured or the journey has no geometry, so the
// detail view degrades gracefully (demo without coords, Safari, missing token).
export function ItineraryMap({ journey }: { journey: JourneyResult }) {
  const ref = useRef<HTMLDivElement>(null)
  const hasPath = journey.sections.some((section) => section.path.length > 1)

  useEffect(() => {
    if (!mapkitEnabled || !hasPath) return
    const el = ref.current
    if (!el) return

    let map: mapkit.Map | null = null
    let cancelled = false

    loadMapkit()
      .then((mk) => {
        if (cancelled) return
        map = new mk.Map(el, {
          showsCompass: mk.FeatureVisibility.Hidden,
          showsScale: mk.FeatureVisibility.Hidden,
          showsZoomControl: false,
        })

        const overlays: mapkit.PolylineOverlay[] = []
        const all: { lat: number; lon: number }[] = []
        for (const section of journey.sections) {
          if (section.path.length < 2) continue
          all.push(...section.path)
          const isWalk = section.type !== 'public_transport'
          const points = section.path.map((p) => new mk.Coordinate(p.lat, p.lon))
          const style = new mk.Style({
            lineWidth: isWalk ? 3 : 5,
            strokeColor: section.color ?? '#5E6878',
            lineDash: isWalk ? [2, 6] : [],
            lineJoin: 'round',
          })
          overlays.push(new mk.PolylineOverlay(points, { style }))
        }
        map.addOverlays(overlays)

        // Nodes = origin + each transit boarding/transfer + destination. Each
        // node tracks the arriving (`inColor`) and departing (`outColor`) leg
        // colors; a node where both exist and differ is a transport change.
        type Node = { lat: number; lon: number; name: string; inColor: string | null; outColor: string | null }
        const nodes: Node[] = []
        // Same-station test ignoring the admin suffix: Navitia names a walk's
        // endpoint after the place ("Châtelet") but the transit endpoint after
        // the stop area ("Châtelet (Paris)"), and their coords differ ~30m, so
        // neither exact name nor exact coord catches the duplicate. Strip the
        // trailing "(…)", trim and lowercase for comparison only.
        const sameStation = (a: string, b: string) =>
          a.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase() ===
          b.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
        // Two consecutive stops within ~150 m are almost always the same station
        // complex (a correspondance), not two places — merge them into one pin.
        const NEAR_METERS = 150
        const near = (aLat: number, aLon: number, bLat: number, bLon: number) => {
          const meanLat = (((aLat + bLat) / 2) * Math.PI) / 180
          const dy = (aLat - bLat) * 111320
          const dx = (aLon - bLon) * 111320 * Math.cos(meanLat)
          return Math.hypot(dx, dy) < NEAR_METERS
        }
        const at = (lat: number, lon: number, name: string, allowNear = true): Node => {
          const prev = nodes[nodes.length - 1]
          // Merge into the previous node when it's the same station — by name
          // (ignoring the admin suffix), exact coords, or close proximity (a
          // transfer between two near stops). `allowNear` is off for the
          // destination so the final pin can never be swallowed by the last stop.
          if (
            prev &&
            (sameStation(prev.name, name) ||
              (prev.lat === lat && prev.lon === lon) ||
              (allowNear && near(prev.lat, prev.lon, lat, lon)))
          )
            return prev
          const node: Node = { lat, lon, name, inColor: null, outColor: null }
          nodes.push(node)
          return node
        }
        journey.sections.forEach((section, index) => {
          if (section.path.length === 0) return
          const from = section.path[0]
          const to = section.path[section.path.length - 1]
          // A sub-minute walk contributes no pin of its own — its endpoints just
          // duplicate the adjacent stop ~30 m away. Keep only the journey's true
          // origin (first section's start) and destination (last section's end)
          // so the A/B markers never disappear.
          const trivialWalk = section.type !== 'public_transport' && section.durationSeconds < 60
          const isLast = index === journey.sections.length - 1
          if (!trivialWalk || index === 0) {
            const fromNode = at(from.lat, from.lon, section.from)
            fromNode.outColor = section.color ?? fromNode.outColor
          }
          if (!trivialWalk || isLast) {
            const toNode = at(to.lat, to.lon, section.to, !isLast)
            toNode.inColor = section.color ?? toNode.inColor
          }
        })

        const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '•'
        const annotations = nodes.map((node, index) => {
          const coord = new mk.Coordinate(node.lat, node.lon)
          // transport change → native pin, station initial on a gradient glyph of the two lines.
          if (index !== 0 && index !== nodes.length - 1 && node.inColor && node.outColor && node.inColor !== node.outColor) {
            return new mk.MarkerAnnotation(coord, {
              title: node.name,
              color: TRANSFER_PIN,
              glyphImage: gradientGlyph(node.inColor, node.outColor, initial(node.name)),
            })
          }
          // every pin colored by its line: origin = departing line, others = arriving line.
          const color = (index === 0 ? node.outColor : node.inColor ?? node.outColor) ?? '#5E6878'
          const options: { title: string; color: string; glyphColor: string; glyphText?: string } = {
            title: node.name,
            color,
            glyphColor: '#FFFFFF',
          }
          if (index === 0 || index === nodes.length - 1) options.glyphText = initial(node.name)
          return new mk.MarkerAnnotation(coord, options)
        })
        map.addAnnotations(annotations)

        if (all.length > 0) {
          const lats = all.map((c) => c.lat)
          const lons = all.map((c) => c.lon)
          const minLat = Math.min(...lats)
          const maxLat = Math.max(...lats)
          const minLon = Math.min(...lons)
          const maxLon = Math.max(...lons)
          const center = new mk.Coordinate((minLat + maxLat) / 2, (minLon + maxLon) / 2)
          const span = new mk.CoordinateSpan(
            Math.max((maxLat - minLat) * 1.5, 0.008),
            Math.max((maxLon - minLon) * 1.5, 0.008),
          )
          map.region = new mk.CoordinateRegion(center, span)
        }
      })
      .catch(() => {
        /* token/script/Safari-COEP failure → leave the map hidden */
      })

    return () => {
      cancelled = true
      if (map) map.destroy()
    }
    // Redraw whenever the displayed journey changes. `journey` is `journeys.find(...)`
    // on state: referentially stable across unrelated re-renders, but a fresh object
    // on every fetch/selection — so this re-runs exactly when the route changes.
    // Keying on `journey.id` missed re-fetches: ids are positional (`journey-0`), so
    // editing Départ/Arrivée produced a new route under the same id and the map kept
    // the stale polyline.
  }, [journey, hasPath])

  if (!mapkitEnabled || !hasPath) return null
  return <div className="mx-2 mt-4 h-60 overflow-hidden rounded-2xl bg-slate-200" ref={ref} />
}
