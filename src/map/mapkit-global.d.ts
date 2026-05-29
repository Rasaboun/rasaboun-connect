// Minimal ambient (global) types for the subset of Apple MapKit JS we use.
// Pure ambient script (no imports/exports) so `mapkit` is available globally.
declare namespace mapkit {
  function init(options: {
    authorizationCallback: (done: (token: string) => void) => void
    language?: string
  }): void

  class Coordinate {
    constructor(latitude: number, longitude: number)
    latitude: number
    longitude: number
  }
  class CoordinateSpan {
    constructor(latitudeDelta: number, longitudeDelta: number)
  }
  class CoordinateRegion {
    constructor(center: Coordinate, span: CoordinateSpan)
  }
  class Style {
    constructor(options: {
      lineWidth?: number
      strokeColor?: string
      strokeOpacity?: number
      lineDash?: number[]
      lineJoin?: string
    })
  }
  class PolylineOverlay {
    constructor(points: Coordinate[], options?: { style?: Style })
  }
  class MarkerAnnotation {
    constructor(
      coordinate: Coordinate,
      options?: {
        color?: string
        glyphColor?: string
        glyphText?: string
        glyphImage?: Record<string, string>
        title?: string
        selected?: boolean
      },
    )
  }
  class Map {
    constructor(parent: HTMLElement | string, options?: Record<string, unknown>)
    region: CoordinateRegion
    cameraDistance: number
    addOverlays(overlays: PolylineOverlay[]): void
    addAnnotations(annotations: MarkerAnnotation[]): void
    destroy(): void
  }
  const FeatureVisibility: { Adaptive: string; Hidden: string; Visible: string }
}

interface Window {
  mapkit?: typeof mapkit
}
