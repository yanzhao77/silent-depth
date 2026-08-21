/**
 * SILENT DEPTH — tactical camera (src/rendering/camera.ts)
 *
 * Top-down, north-up, no rotation (VISUAL_STYLE §1, GAME_ARCHITECTURE §8).
 * World is 2D Euclidean: x = east, y = north (km). Screen: x → right,
 * y → down (canvas). North (world +y) is up on screen.
 *
 *   screenX = (worldX − cx) * zoom + viewportW / 2
 *   screenY = (cy − worldY) * zoom + viewportH / 2
 *
 * Zoom range 4–16 px/km (default 8, VISUAL_STYLE §5). Pure math — no DOM,
 * no wall clock, no RNG. Unit-testable in Node (tests/unit/ui.test.ts).
 *
 * DESIGN DECISIONS:
 *  - `followPlayer` is a per-frame hint: the shell calls follow(player.x,
 *    player.y) each render frame while enabled; the camera itself holds no
 *    reference to the engine.
 *  - Center is clamped to the world rectangle [0, mapSizeKm]² so the view
 *    can never drift off-map (a 30 km map; out-of-bounds is a gameplay
 *    failure, not a camera concern — the HUD still shows the player).
 *  - zoomPxPerKm is clamped to [MIN_ZOOM, MAX_ZOOM]; a zoom target of e.g.
 *    20 clamps to 16 (mouse-wheel steps are applied as deltas, so clamping
 *    inside setZoom is the single guard point).
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure — zero DOM / browser-API references.
 */

/** Minimum zoom in px/km (VISUAL_STYLE §5: zoomable 4–16 px/km). */
export const MIN_ZOOM = 4
/** Maximum zoom in px/km. */
export const MAX_ZOOM = 16
/** Default zoom in px/km. */
export const DEFAULT_ZOOM = 8

/** A point on screen (px) or in world (km) coordinates. */
export interface Point {
  x: number
  y: number
}

export interface Camera {
  /** Current zoom, px/km, clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number
  /** World-space center of the viewport (km). */
  center: { x: number; y: number }
  /** Viewport size in px (set by setViewport). */
  viewport: { width: number; height: number }
  /** World bounds the center is clamped to (km). */
  mapSizeKm: number
  /** World → screen transform (north-up: world +y maps to smaller screen y). */
  worldToScreen(wx: number, wy: number): Point
  /** Screen → world transform (inverse of worldToScreen). */
  screenToWorld(sx: number, sy: number): Point
  /** Set the viewport size in px. */
  setViewport(width: number, height: number): void
  /** Set zoom (clamped to [MIN_ZOOM, MAX_ZOOM]). */
  setZoom(zoom: number): void
  /** Zoom by a wheel delta (positive = zoom in). */
  zoomBy(delta: number): void
  /** Move the viewport center (km), clamped to the world bounds. */
  setCenter(x: number, y: number): void
  /** Pan by a screen-space delta (px): dragging right shows more of the
   *  west (center moves −x/zoom), dragging down shows more of the north
   *  (center moves +y/zoom). */
  panBy(dxPx: number, dyPx: number): void
  /** Center the view on a world point (used by follow-player). */
  follow(worldX: number, worldY: number): void
}

export interface CameraOptions {
  /** Initial zoom, px/km (default DEFAULT_ZOOM). */
  zoom?: number
  /** Initial center in world km (default map center). */
  center?: { x: number; y: number }
  /** Viewport size in px (default 1280×720). */
  viewport?: { width: number; height: number }
  /** World bounds, km (default 30 — balance.world.mapSizeKm). */
  mapSizeKm?: number
}

/** Clamp a number to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/**
 * Create a tactical camera (pure math). All transforms are derived from
 * (zoom, center, viewport) — the object is plain data + functions.
 */
export function createCamera(opts: CameraOptions = {}): Camera {
  const mapSizeKm = opts.mapSizeKm ?? 30
  const viewport = {
    width: Math.max(1, opts.viewport?.width ?? 1280),
    height: Math.max(1, opts.viewport?.height ?? 720),
  }
  const camera: Camera = {
    zoom: clamp(opts.zoom ?? DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM),
    center: {
      x: clamp(opts.center?.x ?? mapSizeKm / 2, 0, mapSizeKm),
      y: clamp(opts.center?.y ?? mapSizeKm / 2, 0, mapSizeKm),
    },
    viewport,
    mapSizeKm,

    worldToScreen(wx: number, wy: number): Point {
      return {
        x: (wx - camera.center.x) * camera.zoom + viewport.width / 2,
        y: (camera.center.y - wy) * camera.zoom + viewport.height / 2,
      }
    },

    screenToWorld(sx: number, sy: number): Point {
      return {
        x: camera.center.x + (sx - viewport.width / 2) / camera.zoom,
        y: camera.center.y - (sy - viewport.height / 2) / camera.zoom,
      }
    },

    setViewport(width: number, height: number): void {
      viewport.width = Math.max(1, width)
      viewport.height = Math.max(1, height)
    },

    setZoom(zoom: number): void {
      camera.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    },

    zoomBy(delta: number): void {
      camera.setZoom(camera.zoom + delta)
    },

    setCenter(x: number, y: number): void {
      camera.center.x = clamp(x, 0, mapSizeKm)
      camera.center.y = clamp(y, 0, mapSizeKm)
    },

    panBy(dxPx: number, dyPx: number): void {
      // Drag semantics: content follows the pointer, so the center moves the
      // opposite way in world space (and y is inverted by the north-up map).
      camera.setCenter(camera.center.x - dxPx / camera.zoom, camera.center.y + dyPx / camera.zoom)
    },

    follow(worldX: number, worldY: number): void {
      camera.setCenter(worldX, worldY)
    },
  }
  return camera
}
