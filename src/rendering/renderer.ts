/**
 * SILENT DEPTH — canvas renderer (src/rendering/renderer.ts)
 *
 * GAME_ARCHITECTURE §8 rendering pipeline — layers L0..L5, drawn in order:
 *
 *   L0 ocean gradient (VISUAL_STYLE §2: #050a12 base → #0a1626 → #0d2233 →
 *      #14303f shallow tint)
 *   L1 5 km grid (balance.world.gridM, ~9 % alpha — softened in t-023) +
 *      sonar range rings + LKP markers
 *   L2 entities: enemy ships (per shipClass + aiState coding) → player
 *      submarine (white outline) + wake → torpedoes / decoys → contact
 *      uncertainty ellipses (CONTACT_STATE_COLORS rings)
 *   L3 particles (ping rings / wake bubbles / explosions / splashes)
 *   L4 weather overlays (Night / Fog / Storm / Cloudy, VISUAL_STYLE §2)
 *   L5 minimap (30 km world: own sub, contacts, convoy, search areas)
 *   (L6 = DOM HUD, src/ui/hud.ts)
 *
 * Dual-rate rendering: the shell steps the sim at 20 Hz and renders at
 * rAF (60 Hz); entity positions are lerped between prev/current snapshots
 * with alpha = accumulator / FIXED_DT (GAME_ARCHITECTURE §8).
 *
 * Node compatibility: this module is importable in Node (no DOM at module
 * scope; CanvasRenderingContext2D / HTMLCanvasElement are TYPE-only). The
 * pure helpers — minimapProject / lerpPos / lerpAngle / activeWeatherAt —
 * are unit-tested in tests/unit/ui.test.ts. render() itself only runs in
 * the browser.
 *
 * DESIGN DECISIONS:
 *  - Enemy sprites are drawn ONLY when the player's sonar perceives the ship
 *    (a contact with state != UNKNOWN links to the enemy via trueShipId).
 *    Undetected ships stay invisible — the honest view is the uncertainty
 *    ellipse, not the omniscient enemy position (GAME_DESIGN §11.2 "接触显示
 *    为不确定性椭圆而非红点").
 *  - aiState color coding: NORMAL dim (alpha .6) → SUSPICIOUS .75 →
 *    SEARCHING .85 → ALERT bright 1.0 → HUNTING 1.0 + red outline.
 *  - Contact glyphs/ellipses are drawn with vector canvas arcs (crisper at
 *    small sizes than a downscaled 128 px atlas); the atlas is reserved for
 *    ship/unit sprites (drawImage fast path, GAME_ARCHITECTURE §11).
 *  - Weather overlays follow the ACTIVE weather segment (world.ts semantics:
 *    M05 'Night->Fog' hands over at the midpoint).
 *  - UI v2 (t-023): the grid alpha is softened (major 0.18 → 0.09, minor
 *    0.05 → 0.035) so the map reads as ambient background under the DOM
 *    Mission Workspace frame; nothing else in the tactical palette changed.
 *  - The renderer works in CSS pixels; the shell scales the backing store by
 *    devicePixelRatio and applies ctx.setTransform(dpr,…) once.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — canvas/DOM touched only inside render().
 */

import type { BalanceConfig } from '../core/balance'
import { loadBalance } from '../core/balance'
import type { Contact, EnemyShip, GameSnapshot, MissionDef, ShipClass, WeatherKind } from '../core/types'
import { OCEAN_GRID_COLOR, OCEAN_PALETTE, generateOcean, type OceanModel } from '../world/ocean'
import { parseWeatherSequence } from '../world/weather'
import {
  PALETTE,
  contactStateColor,
  getAtlasSprite,
  getManifestEntry,
  type SpriteKind,
} from './sprites'
import type { Camera } from './camera'
import type { ParticleSystem } from './particles'

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/** World → minimap projection. North-up, top-left origin, `padding` inset. */
export function minimapProject(
  wx: number,
  wy: number,
  mapSizeKm: number,
  sizePx: number,
  padding = 8,
): { x: number; y: number } {
  const inner = Math.max(1, sizePx - padding * 2)
  const u = Math.max(1e-6, mapSizeKm)
  return {
    x: padding + (wx / u) * inner,
    y: padding + (1 - wy / u) * inner,
  }
}

/** Linear interpolation between two 2D points. */
export function lerpPos(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Shortest-path angle interpolation (handles 350° → 10° wraps). */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180
  return (a + delta * t + 360) % 360
}

/**
 * Active weather kind at a sim time (world.ts semantics: 'A->B' segments are
 * equal-length, segment i starts at fraction i/n of parTimeS). Pure.
 */
export function activeWeatherAt(
  weatherSpec: string,
  simTime: number,
  parTimeS: number,
  balance: BalanceConfig = loadBalance(),
): WeatherKind {
  const seq = parseWeatherSequence(weatherSpec, balance)
  if (seq.length <= 1) return seq[0]![0]
  const frac = parTimeS > 0 ? simTime / parTimeS : 0
  let kind = seq[0]![0]
  for (const [k, start] of seq) {
    if (frac >= start) kind = k
  }
  return kind
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ShipClass → atlas sprite kind (SPRITE_MANIFEST ids 'sprite-<kind>'). */
const SPRITE_BY_CLASS: Record<ShipClass, SpriteKind> = {
  Merchant: 'merchant',
  Cargo: 'cargo',
  Tanker: 'tanker',
  Destroyer: 'destroyer',
  Frigate: 'frigate',
  Submarine: 'submarine',
}

/** aiState → sprite alpha + optional bright/red treatment. */
const AI_STATE_ALPHA: Record<EnemyShip['aiState'], number> = {
  NORMAL: 0.6,
  SUSPICIOUS: 0.75,
  SEARCHING: 0.85,
  ALERT: 1.0,
  HUNTING: 1.0,
  LOST_CONTACT: 0.55,
}

/** Contact estimate when bearing-only (no range) — nominal 3 km standoff. */
const BEARING_ONLY_RANGE_KM = 3

const MINIMAP_SIZE_PX = 180
const MINIMAP_PADDING = 8

const RAD = Math.PI / 180

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export interface RenderSettings {
  mapGrid: boolean
  particlesEnabled: boolean
  showFps: boolean
}

export interface RendererOptions {
  seed: number
  mission: MissionDef
  balance?: BalanceConfig
}

export interface RenderFrameOpts {
  /** Previous snapshot for 20→60 Hz interpolation (optional). */
  prev?: GameSnapshot
  /** Interpolation alpha in [0,1] = accumulator / FIXED_DT (optional). */
  alpha?: number
  /** Particle system (L3). Owned by the shell. */
  particles?: ParticleSystem
  /** Render settings (defaults: grid on, particles on, fps off). */
  settings?: Partial<RenderSettings>
  /** Selected contact id (bright outline on the map). */
  selectedContactId?: string | null
  /** Wall time seconds for subtle roll/bob animation. */
  timeSeconds?: number
  /** Measured FPS for the debug overlay (settings.showFps). */
  fps?: number
}

export interface Renderer {
  /** Draw layers L0..L5 for a snapshot. Browser only. */
  render(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    camera: Camera,
    dt: number,
    opts?: RenderFrameOpts,
  ): void
  /** Seeded ocean model (static per mission). */
  readonly ocean: OceanModel
}

/**
 * Create a renderer bound to one mission (seed + mission def are fixed per
 * game). The ocean model is derived deterministically from the seed
 * (generateOcean — same seed → same model, ADR-004-safe for visuals).
 */
export function createRenderer(opts: RendererOptions): Renderer {
  const balance = opts.balance ?? loadBalance()
  const mission = opts.mission
  const ocean = generateOcean(opts.seed, balance)
  const mapSizeKm = balance.world.mapSizeKm

  // Per-torpedo wake emitters (~10 Hz per torpedo).
  const wakeTimers = new Map<string, number>()

  /** Player sonar-perceived enemy ids this frame (trueShipId links). */
  function detectedEnemyIds(snapshot: GameSnapshot): Set<string> {
    const ids = new Set<string>()
    for (const c of snapshot.contacts) {
      if (c.state !== 'UNKNOWN' && c.trueShipId !== null) ids.add(c.trueShipId)
    }
    return ids
  }

  function render(
    ctx: CanvasRenderingContext2D,
    snapshot: GameSnapshot,
    camera: Camera,
    dt: number,
    frame: RenderFrameOpts = {},
  ): void {
    const t = Math.min(1, Math.max(0, frame.alpha ?? 1))
    const prev = frame.prev
    const settings: RenderSettings = {
      mapGrid: frame.settings?.mapGrid ?? true,
      particlesEnabled: frame.settings?.particlesEnabled ?? true,
      showFps: frame.settings?.showFps ?? false,
    }
    const player = snapshot.playerSub
    const wallT = frame.timeSeconds ?? 0
    const weather = activeWeatherAt(mission.weather, snapshot.simTime, mission.parTimeS, balance)

    // Interpolated player position (for entity anchoring).
    const playerPos = prev
      ? lerpPos(prev.playerSub.position, player.position, t)
      : player.position

    // ---------------- L0 ocean background ---------------------------------
    const w = camera.viewport.width
    const h = camera.viewport.height
    ctx.fillStyle = ocean.backgroundColor
    ctx.fillRect(0, 0, w, h)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, OCEAN_PALETTE.shallow)
    grad.addColorStop(0.35, OCEAN_PALETTE.mid)
    grad.addColorStop(0.7, OCEAN_PALETTE.deep)
    grad.addColorStop(1, OCEAN_PALETTE.base)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // ---------------- L1 grid + rings + LKP --------------------------------
    if (settings.mapGrid) drawGrid(ctx, camera, balance)
    drawRangeRings(ctx, camera, playerPos, balance)
    drawWorldBounds(ctx, camera, mapSizeKm)
    drawLkpMarkers(ctx, camera, snapshot)

    // ---------------- L2 entities ------------------------------------------
    const detected = detectedEnemyIds(snapshot)
    for (const enemy of snapshot.enemies) {
      if (!detected.has(enemy.id)) continue
      const pos = prev ? lerpPos(prevEnemyPos(prev, enemy.id) ?? enemy.position, enemy.position, t) : enemy.position
      drawEnemy(ctx, camera, enemy, pos, weather)
    }
    drawPlayerSubmarine(ctx, camera, playerPos, player.headingDeg, player.speedKt, player.depthLayer, wallT)

    // Torpedoes (wake bubbles emitted here — presentation only).
    if (frame.particles) {
      const activeTorpedoIds = new Set<string>()
      for (const torp of snapshot.torpedoes) {
        activeTorpedoIds.add(torp.id)
        if (torp.state !== 'RUNNING') continue
        const pos = prev ? lerpPos(prevTorpPos(prev, torp.id) ?? torp.position, torp.position, t) : torp.position
        drawTorpedo(ctx, camera, torp, pos)
        // ~10 Hz wake emission per torpedo.
        const acc = (wakeTimers.get(torp.id) ?? 0) + dt
        if (acc >= 0.1) {
          wakeTimers.set(torp.id, acc % 0.1)
          frame.particles.spawnWake(pos.x, pos.y, torp.headingDeg)
        } else {
          wakeTimers.set(torp.id, acc)
        }
      }
      for (const id of Array.from(wakeTimers.keys())) {
        if (!activeTorpedoIds.has(id)) wakeTimers.delete(id)
      }
      for (const decoy of snapshot.decoys) {
        drawDecoy(ctx, camera, decoy.position)
      }
    } else {
      for (const torp of snapshot.torpedoes) {
        if (torp.state !== 'RUNNING') continue
        const pos = prev ? lerpPos(prevTorpPos(prev, torp.id) ?? torp.position, torp.position, t) : torp.position
        drawTorpedo(ctx, camera, torp, pos)
      }
      for (const decoy of snapshot.decoys) {
        drawDecoy(ctx, camera, decoy.position)
      }
    }

    // Contact uncertainty ellipses (honest sonar view).
    for (const c of snapshot.contacts) {
      drawContactUncertainty(ctx, camera, c, playerPos, c.id === frame.selectedContactId)
    }

    // ---------------- L3 particles ------------------------------------------
    if (frame.particles && settings.particlesEnabled) {
      frame.particles.render(ctx, camera)
    }

    // ---------------- L4 weather overlays -----------------------------------
    drawWeatherOverlay(ctx, weather, w, h)

    // ---------------- L5 minimap --------------------------------------------
    drawMinimap(ctx, snapshot, mapSizeKm, w, h)

    // ---------------- debug FPS overlay -------------------------------------
    if (settings.showFps && frame.fps !== undefined) {
      ctx.fillStyle = PALETTE.uiTextDim
      ctx.font = '11px "SF Mono", Consolas, monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`FPS ${Math.round(frame.fps)}`, w - 8, 16)
      ctx.textAlign = 'left'
    }

    ctx.globalAlpha = 1
  }

  return { render, ocean }
}

// ---------------------------------------------------------------------------
// Layer draw functions
// ---------------------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, balance: BalanceConfig): void {
  const cellKm = balance.world.gridM / 1000 // 500 m per cell (world.gridM)
  const majorEvery = Math.max(1, Math.round(5 / cellKm)) // 5 km major lines
  const zoom = camera.zoom
  const showMinor = zoom >= 6 // minor cells < 4 px are clutter
  const view = viewRect(camera)
  ctx.lineWidth = 1
  ctx.strokeStyle = OCEAN_GRID_COLOR

  // UI v2 (t-023): the grid is ambient background, not UI — major lines at
  // ~9% alpha (was 18% per VISUAL_STYLE v1), minor at ~3.5% (was 5%). The
  // tactical palette is otherwise untouched; the Mission Workspace (DOM
  // frame) now carries the "UI" role.
  const ALPHA_MAJOR = 0.09
  const ALPHA_MINOR = 0.035

  // Inline north-up projection (no per-line worldToScreen allocation):
  //   screenX = wx * zoom + originX, screenY = -wy * zoom + originY.
  const originX = camera.viewport.width / 2 - camera.center.x * zoom
  const originY = camera.viewport.height / 2 + camera.center.y * zoom

  // Vertical lines (world x constant).
  const x0 = Math.floor(view.left / cellKm) * cellKm
  const x1 = view.right
  for (let x = x0; x <= x1; x += cellKm) {
    const idx = Math.round(x / cellKm)
    const major = idx % majorEvery === 0
    if (!major && !showMinor) continue
    ctx.globalAlpha = major ? ALPHA_MAJOR : ALPHA_MINOR
    const sx = x * zoom + originX
    ctx.beginPath()
    ctx.moveTo(sx, view.bottom * -zoom + originY)
    ctx.lineTo(sx, view.top * -zoom + originY)
    ctx.stroke()
  }
  // Horizontal lines (world y constant).
  const y0 = Math.floor(view.bottom / cellKm) * cellKm
  const y1 = view.top
  for (let y = y0; y <= y1; y += cellKm) {
    const idx = Math.round(y / cellKm)
    const major = idx % majorEvery === 0
    if (!major && !showMinor) continue
    ctx.globalAlpha = major ? ALPHA_MAJOR : ALPHA_MINOR
    const sy = -y * zoom + originY
    ctx.beginPath()
    ctx.moveTo(view.left * zoom + originX, sy)
    ctx.lineTo(view.right * zoom + originX, sy)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Sonar range rings around the player: passive engine range + active ping. */
function drawRangeRings(ctx: CanvasRenderingContext2D, camera: Camera, player: { x: number; y: number }, balance: BalanceConfig): void {
  const passive = balance.sonar.passive.engineRangeKm
  const active = balance.sonar.active.rangeKm
  const rings: { km: number; alpha: number }[] = [
    { km: passive, alpha: 0.22 },
    { km: active, alpha: 0.3 },
  ]
  const center = camera.worldToScreen(player.x, player.y)
  ctx.strokeStyle = PALETTE.rangeRing
  ctx.lineWidth = 1
  for (const ring of rings) {
    ctx.globalAlpha = ring.alpha
    ctx.beginPath()
    ctx.arc(center.x, center.y, ring.km * camera.zoom, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawWorldBounds(ctx: CanvasRenderingContext2D, camera: Camera, mapSizeKm: number): void {
  const tl = camera.worldToScreen(0, mapSizeKm)
  const br = camera.worldToScreen(mapSizeKm, 0)
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = PALETTE.uiTextDim
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

/** LKP markers (escorts' last-known-position of the player). */
function drawLkpMarkers(ctx: CanvasRenderingContext2D, camera: Camera, snapshot: GameSnapshot): void {
  ctx.strokeStyle = PALETTE.outlineDim
  ctx.fillStyle = PALETTE.outlineDim
  ctx.lineWidth = 1
  for (const enemy of snapshot.enemies) {
    const lkp = enemy.lkp
    if (lkp === null) continue
    const s = camera.worldToScreen(lkp.x, lkp.y)
    // Error circle.
    ctx.globalAlpha = 0.35
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.arc(s.x, s.y, lkp.errorKm * camera.zoom, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    // Cross marker.
    ctx.globalAlpha = 0.6
    const r = 4
    ctx.beginPath()
    ctx.moveTo(s.x - r, s.y)
    ctx.lineTo(s.x + r, s.y)
    ctx.moveTo(s.x, s.y - r)
    ctx.lineTo(s.x, s.y + r)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  enemy: EnemyShip,
  pos: { x: number; y: number },
  _weather: WeatherKind,
): void {
  const kind = SPRITE_BY_CLASS[enemy.shipClass] ?? 'merchant'
  const entry = getManifestEntry(`sprite-${kind}`)
  if (entry === undefined) return
  const sprite = getAtlasSprite(kind, entry.width)
  const size = entry.renderScalePx * (camera.zoom / 8)
  const s = camera.worldToScreen(pos.x, pos.y)

  ctx.save()
  ctx.translate(s.x, s.y)
  // REMEDIATION t-020: enemy headingDeg is math convention (0=east); canvas
  // rotation is compass-clockwise in y-down screen space → rotate(90 − hdg).
  ctx.rotate((90 - enemy.headingDeg) * RAD)
  ctx.globalAlpha = AI_STATE_ALPHA[enemy.aiState] ?? 0.6
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
  ctx.restore()

  if (enemy.aiState === 'HUNTING') {
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = PALETTE.alert
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(s.x, s.y, size * 0.72, 0, Math.PI * 2)
    ctx.stroke()
  } else if (enemy.aiState === 'ALERT') {
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = PALETTE.outlineBright
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(s.x, s.y, size * 0.72, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawPlayerSubmarine(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  pos: { x: number; y: number },
  headingDeg: number,
  speedKt: number,
  _depthLayer: string,
  wallT: number,
): void {
  const entry = getManifestEntry('sprite-submarine')
  if (entry === undefined) return
  const sprite = getAtlasSprite('submarine', entry.width)
  const size = entry.renderScalePx * (camera.zoom / 8)
  const s = camera.worldToScreen(pos.x, pos.y)

  // Wake: two stern lines, length/alpha by speed (VISUAL_STYLE §9 subtle).
  if (speedKt > 0.5) {
    const wakeLen = Math.min(30, 4 + speedKt * 0.8) // px
    const back = headingDeg + 180
    const sin = Math.sin(back * RAD)
    const cos = Math.cos(back * RAD)
    const half = size * 0.28
    ctx.globalAlpha = Math.min(0.5, 0.08 + speedKt * 0.02)
    ctx.strokeStyle = PALETTE.torpedoTrail
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s.x - cos * half - sin * half * 0.3, s.y + sin * half - cos * half * 0.3)
    ctx.lineTo(s.x - cos * (half + wakeLen), s.y + sin * (half + wakeLen))
    ctx.moveTo(s.x + cos * half - sin * half * 0.3, s.y - sin * half - cos * half * 0.3)
    ctx.lineTo(s.x - cos * (half + wakeLen), s.y + sin * (half + wakeLen))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Gentle roll/bob (VISUAL_STYLE §9: 2-frame roll, no rotation).
  const bob = Math.sin(wallT * 2) * 0.8
  ctx.save()
  ctx.translate(s.x, s.y + bob)
  ctx.rotate(headingDeg * RAD)
  ctx.globalAlpha = 1
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
  ctx.restore()
}

function drawTorpedo(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  torp: { headingDeg: number },
  pos: { x: number; y: number },
): void {
  const entry = getManifestEntry('sprite-torpedo')
  if (entry === undefined) return
  const sprite = getAtlasSprite('torpedo', entry.width)
  const size = entry.renderScalePx * (camera.zoom / 8)
  const s = camera.worldToScreen(pos.x, pos.y)
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(torp.headingDeg * RAD)
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
  ctx.restore()
}

function drawDecoy(ctx: CanvasRenderingContext2D, camera: Camera, pos: { x: number; y: number }): void {
  const entry = getManifestEntry('sprite-decoy')
  if (entry === undefined) return
  const sprite = getAtlasSprite('decoy', entry.width)
  const size = entry.renderScalePx * (camera.zoom / 8)
  const s = camera.worldToScreen(pos.x, pos.y)
  ctx.globalAlpha = 0.85
  ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size)
  ctx.globalAlpha = 1
}

/** Contact uncertainty ellipse + state ring + bearing tick (L2, honest view). */
function drawContactUncertainty(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  c: Contact,
  player: { x: number; y: number },
  selected: boolean,
): void {
  const range = c.rangeKm ?? BEARING_ONLY_RANGE_KM
  const brgRad = c.bearingDeg * RAD
  const est = {
    x: player.x + Math.sin(brgRad) * range,
    y: player.y + Math.cos(brgRad) * range,
  }
  const s = camera.worldToScreen(est.x, est.y)
  const color = contactStateColor(c.state)

  // Uncertainty ellipse (major axis along the bearing).
  let rxKm: number
  let ryKm: number
  if (c.rangeKm === null) {
    rxKm = 2.0 // bearing-only: very uncertain down-range
    ryKm = 0.6
  } else {
    rxKm = Math.max(0.2, c.rangeKm * Math.max(c.rangeErrorFrac, 0.05))
    ryKm = Math.max(0.15, c.rangeKm * Math.sin((c.bearingErrorDeg * Math.PI) / 180))
  }
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(brgRad)
  ctx.globalAlpha = selected ? 0.95 : 0.7
  ctx.strokeStyle = selected ? PALETTE.outlineBright : color
  ctx.lineWidth = selected ? 1.6 : 1
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.ellipse(0, 0, rxKm * camera.zoom, ryKm * camera.zoom, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  // Bearing tick (direction hint).
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(0, -6)
  ctx.lineTo(0, -10)
  ctx.stroke()
  ctx.restore()

  // State ring at the estimate center.
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(s.x, s.y, 4, 0, Math.PI * 2)
  ctx.stroke()
  if (selected) {
    ctx.strokeStyle = PALETTE.outlineBright
    ctx.beginPath()
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Weather overlay alphas per VISUAL_STYLE §2 (Night 35–55 %, Fog 12–25 %). */
function drawWeatherOverlay(ctx: CanvasRenderingContext2D, weather: WeatherKind, w: number, h: number): void {
  let color: string
  let alpha: number
  switch (weather) {
    case 'Night':
      color = '#000000'
      alpha = 0.45
      break
    case 'Fog':
      color = '#9fb4c7'
      alpha = 0.18
      break
    case 'Storm':
      color = '#0a1626'
      alpha = 0.12
      break
    case 'Cloudy':
      color = '#0d2233'
      alpha = 0.05
      break
    default:
      return
  }
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 1
}

/** L5 minimap: 30 km world, own sub, contacts, convoy ships, search areas. */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  snapshot: GameSnapshot,
  mapSizeKm: number,
  w: number,
  h: number,
): void {
  const size = MINIMAP_SIZE_PX
  const pad = MINIMAP_PADDING
  const x0 = w - size - 10
  const y0 = h - size - 10
  const project = (wx: number, wy: number): { x: number; y: number } =>
    minimapProject(wx, wy, mapSizeKm, size, pad)

  // Frame.
  ctx.fillStyle = 'rgba(11,21,32,0.88)'
  ctx.fillRect(x0, y0, size, size)
  ctx.strokeStyle = PALETTE.uiPanelBorder
  ctx.lineWidth = 1
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1)

  // World bounds inset.
  const tl = project(0, mapSizeKm)
  const br = project(mapSizeKm, 0)
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = PALETTE.uiTextDim
  ctx.strokeRect(x0 + tl.x, y0 + tl.y, br.x - tl.x, br.y - tl.y)
  ctx.globalAlpha = 1

  // Convoy (enemies) — squares, escorts red.
  for (const enemy of snapshot.enemies) {
    const p = project(enemy.position.x, enemy.position.y)
    const isEscort = enemy.shipClass === 'Destroyer' || enemy.shipClass === 'Frigate'
    ctx.fillStyle = isEscort ? PALETTE.enemySurface : PALETTE.hullLight
    ctx.globalAlpha = 0.9
    ctx.fillRect(x0 + p.x - 1.5, y0 + p.y - 1.5, 3, 3)
  }

  // Contacts — state-colored dots (honest view).
  const player = snapshot.playerSub
  for (const c of snapshot.contacts) {
    const range = c.rangeKm ?? BEARING_ONLY_RANGE_KM
    const brg = c.bearingDeg * RAD
    const est = { x: player.position.x + Math.sin(brg) * range, y: player.position.y + Math.cos(brg) * range }
    const p = project(est.x, est.y)
    ctx.fillStyle = contactStateColor(c.state)
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(x0 + p.x, y0 + p.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Search areas (LKP).
  ctx.lineWidth = 1
  for (const enemy of snapshot.enemies) {
    const lkp = enemy.lkp
    if (lkp === null) continue
    const p = project(lkp.x, lkp.y)
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = PALETTE.warning
    ctx.beginPath()
    ctx.arc(x0 + p.x, y0 + p.y, Math.max(2, lkp.errorKm / mapSizeKm * (size - pad * 2)), 0, Math.PI * 2)
    ctx.stroke()
  }

  // Own submarine — white triangle, heading tick.
  const pp = project(player.position.x, player.position.y)
  const px = x0 + pp.x
  const py = y0 + pp.y
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(player.headingDeg * RAD)
  ctx.globalAlpha = 1
  ctx.fillStyle = PALETTE.outlineBright
  ctx.beginPath()
  ctx.moveTo(0, -4.5)
  ctx.lineTo(3, 4)
  ctx.lineTo(-3, 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Viewport / snapshot lookups
// ---------------------------------------------------------------------------

interface ViewRect {
  left: number
  right: number
  top: number
  bottom: number
}

function viewRect(camera: Camera): ViewRect {
  const halfW = camera.viewport.width / 2 / camera.zoom
  const halfH = camera.viewport.height / 2 / camera.zoom
  return {
    left: camera.center.x - halfW,
    right: camera.center.x + halfW,
    top: camera.center.y + halfH,
    bottom: camera.center.y - halfH,
  }
}

function prevEnemyPos(prev: GameSnapshot, id: string): { x: number; y: number } | null {
  for (const e of prev.enemies) {
    if (e.id === id) return e.position
  }
  return null
}

function prevTorpPos(prev: GameSnapshot, id: string): { x: number; y: number } | null {
  for (const t of prev.torpedoes) {
    if (t.id === id) return t.position
  }
  return null
}
