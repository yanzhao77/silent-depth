/**
 * SILENT DEPTH — detection system (src/combat/detection.ts)
 *
 * GAME_DESIGN §8.1/F8 + balance.detection. Pipeline slot 8.
 *
 * Applies ONLY the F8 sinks — the raises are owned elsewhere:
 *   - F3/F4 passive-detect rate & enemy-ping hits  → ai (src/ai/ai.ts)
 *   - active ping +12, depth-charge hit +15/+10, deck-gun hit +5
 *                                                  → ai / sonar (applied directly)
 *   - torpedo fired +20                            → combat (torpedo.ts)
 *
 * Sinks (balance.detection.sinks):
 *   - STOPPED + silent running      −2%/s
 *   - SILENT  + silent running      −1%/s
 *   - dive into Medium or deeper    −15 (edge, once per layer change)
 *   - hard turn > 30° in 10 s       −10 (edge; 10 s cumulative window)
 *   - decoy launched                −20 (edge, per launch)
 *   - nearest escort > 3 km         −0.5%/s (distance sink, escorts only)
 *
 * Then: clamp 0..100, band-crossing events (detection.threshold — bands from
 * balance.detection.bands: 20/40/60/80/100), and the LOCATED episode:
 * detection = 100 → player.located + 60 s grace countdown
 * (balance.detection.located); dropping below requiredBelow (60) clears the
 * episode. Grace expiry is tracked (runtime, test-observable) — the AI already
 * hunts at high detection, so no further gameplay change is needed.
 *
 * DESIGN DECISIONS:
 *  - "Dive Surface→Medium −15": fires when the layer changes into Medium or
 *    Deep (index ≥ 3) from a shallower layer (F2 snaps straight to the target
 *    layer, so Shallow→Deep also counts).
 *  - Hard-turn window threshold (30° / 10 s) is encoded in the balance sink
 *    key name (hardTurnDeg30Per10s) — the window/degrees constants live here
 *    (HARD_TURN_DEG_THRESHOLD / HARD_TURN_WINDOW_S).
 *  - Distance sink uses nearest escort distance only (the LKP-error half of
 *    "> 3 km 且 LKP 误差增大" is a simplification — the AI owns LKP).
 *  - The first tick only initialises trackers (no spurious events).
 *  - Per-game runtime (band index, turn history, located state) lives in a
 *    WeakMap keyed on the live ctx.player reference (ai.ts pattern).
 *
 * Task: t-007 combat (gameplay-engineer).
 *
 * @pure — zero DOM; deterministic (no RNG).
 */

import type { BalanceConfig } from '../core/balance'
import type { SystemContext } from '../core/engine'
import type { DepthLayer, SubmarineState } from '../core/types'
import { DEPTH_LAYER_ORDER } from '../gameplay/submarine'
import { distKm } from '../sonar/contacts'

/** Hard-turn trigger: cumulative heading change over the window (degrees). */
export const HARD_TURN_DEG_THRESHOLD = 30
/** Hard-turn window (seconds). */
export const HARD_TURN_WINDOW_S = 10

export interface DetectionRuntime {
  initialized: boolean
  lastBandIndex: number
  prevDepthLayer: DepthLayer
  prevDecoyCount: number
  prevHeadingDeg: number
  turnHistory: { at: number; deltaDeg: number }[]
  locatedActive: boolean
  locatedAt: number
  graceRemainingS: number
  graceExpired: boolean
}

const detectionRuntimes = new WeakMap<object, DetectionRuntime>()

/** Test/manager hook into the per-game detection runtime. */
export function getDetectionRuntime(ctx: SystemContext): DetectionRuntime {
  let rt = detectionRuntimes.get(ctx.player)
  if (rt === undefined) {
    rt = {
      initialized: false,
      lastBandIndex: 0,
      prevDepthLayer: 'Shallow',
      prevDecoyCount: 0,
      prevHeadingDeg: 0,
      turnHistory: [],
      locatedActive: false,
      locatedAt: 0,
      graceRemainingS: 0,
      graceExpired: false,
    }
    detectionRuntimes.set(ctx.player, rt)
  }
  return rt
}

// ---------------------------------------------------------------------------
// Pure per-sink helpers (testable)
// ---------------------------------------------------------------------------

/** STOPPED + silent running: −2 %/s. */
export function stoppedSilentPerSec(player: SubmarineState, balance: BalanceConfig): number {
  return player.speedBand === 'STOPPED' && player.silentRunning ? balance.detection.sinks.stoppedSilentPerSec : 0
}

/** SILENT + silent running: −1 %/s. */
export function silentSilentPerSec(player: SubmarineState, balance: BalanceConfig): number {
  return player.speedBand === 'SILENT' && player.silentRunning ? balance.detection.sinks.silentSilentPerSec : 0
}

/** Dive into Medium or deeper (from a shallower layer): −15, edge. */
export function diveSink(oldLayer: DepthLayer, newLayer: DepthLayer, balance: BalanceConfig): number {
  const oldIdx = DEPTH_LAYER_ORDER.indexOf(oldLayer)
  const newIdx = DEPTH_LAYER_ORDER.indexOf(newLayer)
  if (oldIdx < 0 || newIdx < 0) return 0
  return newIdx >= 3 && oldIdx < 3 ? balance.detection.sinks.diveSurfaceToMedium : 0
}

/** Decoy launch: −20, edge (detected via the decoy-count decrease). */
export function decoyLaunchSink(prevCount: number, newCount: number, balance: BalanceConfig): number {
  return newCount < prevCount ? balance.detection.sinks.decoyLaunch : 0
}

/** Distance sink: −0.5 %/s while the nearest escort is beyond the escape
 *  distance. Returns 0 when there is no escort at all (M01/M02). */
export function distanceSinkPerSec(nearestEscortKm: number | null, balance: BalanceConfig): number {
  if (nearestEscortKm === null) return 0
  return nearestEscortKm > balance.escape.minDistEscortKm ? balance.detection.sinks.distancePerSec : 0
}

/** Nearest living attack-capable escort distance, or null when none exists. */
export function nearestEscortKm(ctx: SystemContext): number | null {
  let nearest: number | null = null
  for (const ship of ctx.enemies) {
    if (ship.hull <= 0) continue
    const attack = ctx.balance.enemyAI.shipTypes[ship.shipClass]?.attack
    if (attack === undefined || attack === null || attack.length === 0) continue
    const d = distKm(ctx.player.position, ship.position)
    if (nearest === null || d < nearest) nearest = d
  }
  return nearest
}

/** Smallest angle between two headings (0..180). */
export function minAngleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Detection band index for a value (first band with max >= detection). */
export function bandIndexFor(detection: number, balance: BalanceConfig): number {
  const bands = balance.detection.bands
  for (let i = 0; i < bands.length; i++) {
    if (detection <= bands[i]!.max) return i
  }
  return bands.length - 1
}

// ---------------------------------------------------------------------------
// Detection system (pipeline slot 8)
// ---------------------------------------------------------------------------

export const detectionSystem: (ctx: SystemContext) => void = (ctx: SystemContext): void => {
  if (ctx.state !== 'MISSION_RUNNING') return
  const rt = getDetectionRuntime(ctx)
  const balance = ctx.balance
  const player = ctx.player

  if (!rt.initialized) {
    rt.prevDepthLayer = player.depthLayer
    rt.prevDecoyCount = player.decoyCount
    rt.prevHeadingDeg = player.headingDeg
    rt.lastBandIndex = bandIndexFor(player.detection, balance)
    rt.initialized = true
  }

  let delta = 0

  // Per-second sinks (STOPPED/SILENT + silent running, distance).
  delta -= stoppedSilentPerSec(player, balance) * ctx.dt
  delta -= silentSilentPerSec(player, balance) * ctx.dt
  const nearest = nearestEscortKm(ctx)
  delta -= distanceSinkPerSec(nearest, balance) * ctx.dt

  // Dive sink (edge on layer change into Medium/Deep).
  delta -= diveSink(rt.prevDepthLayer, player.depthLayer, balance)
  rt.prevDepthLayer = player.depthLayer

  // Hard-turn sink (edge: > 30° cumulative in a 10 s window).
  const headingDelta = minAngleDelta(player.headingDeg, rt.prevHeadingDeg)
  rt.prevHeadingDeg = player.headingDeg
  rt.turnHistory.push({ at: ctx.simTime, deltaDeg: headingDelta })
  while (rt.turnHistory.length > 0 && rt.turnHistory[0]!.at < ctx.simTime - HARD_TURN_WINDOW_S) {
    rt.turnHistory.shift()
  }
  const turnSum = rt.turnHistory.reduce((sum, entry) => sum + entry.deltaDeg, 0)
  if (turnSum > HARD_TURN_DEG_THRESHOLD) {
    delta -= balance.detection.sinks.hardTurnDeg30Per10s
    rt.turnHistory.length = 0 // edge once, window reset
  }

  // Decoy-launch sink (edge on decoyCount decrease — submarine launched one).
  delta -= decoyLaunchSink(rt.prevDecoyCount, player.decoyCount, balance)
  rt.prevDecoyCount = player.decoyCount

  // Apply + clamp (§8.1: no auto decay beyond the explicit sinks).
  player.detection = clamp(player.detection + delta, 0, 100)

  // Band-crossing events.
  const bandIndex = bandIndexFor(player.detection, balance)
  if (bandIndex !== rt.lastBandIndex) {
    ctx.bus.emit('detection.threshold', {
      detection: player.detection,
      band: balance.detection.bands[bandIndex]!.label,
    })
    rt.lastBandIndex = bandIndex
  }

  // LOCATED episode (§8.1: 100 = located; 60 s grace to drop below 60).
  if (player.detection >= 100) {
    if (!rt.locatedActive) {
      rt.locatedActive = true
      rt.locatedAt = ctx.simTime
      rt.graceRemainingS = balance.detection.located.graceSeconds
      ctx.bus.emit('player.located', {})
    }
    if (rt.graceRemainingS > 0) {
      rt.graceRemainingS -= ctx.dt
      if (rt.graceRemainingS <= 0) rt.graceExpired = true
    }
  } else if (player.detection < balance.detection.located.requiredBelow) {
    rt.locatedActive = false
    rt.graceRemainingS = 0
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
