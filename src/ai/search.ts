/**
 * SILENT DEPTH — enemy search patterns + LKP model (src/ai/search.ts)
 *
 * FR-10 / GAME_DESIGN §6.4 (search patterns) + §15 F5 (LKP error model).
 * Pure functions: given a pattern state and a timestep they return the next
 * target waypoint and the advanced pattern state. All randomness is injected
 * (Rng) so the module stays deterministic per seed.
 *
 * Patterns (each centred on the LKP):
 *   - circular  : radius 1.0 → 2.5 km, +300 m per completed lap, 20 kt
 *                 (GAME_DESIGN §6.4 — used right after a locate; the player
 *                 is likely still nearby).
 *   - zigzag    : parallel sweep, lane spacing 300 m, lane length 2 km,
 *                 turn radius 200 m (approximated by an instant turn at the
 *                 lane end — DESIGN DECISION; the turn radius is a visual
 *                 concern and the waypoint model stays straight-lane).
 *                 Used when a course estimate exists (sweep along it).
 *   - expanding : spiral, radius +150 m per 45° of turn, start 500 m.
 *                 Used after prolonged loss of contact.
 *
 * LKP model (F5): refresh every 5 s while the player is inside the escort's
 * sensor envelope; freeze when out of sensor range; +50 m drift error per
 * player maneuver (turn/speed change) capped at 1.5 km; a live decoy replaces
 * the LKP with 70 % probability for 20 s.
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; no module state; RNG injected.
 */

import type { Rng } from '../core/rng'
import type { BalanceConfig } from '../core/balance'
import type { AiState } from '../core/types'

// ---------------------------------------------------------------------------
// Search patterns
// ---------------------------------------------------------------------------

export type SearchPatternKind = 'circular' | 'zigzag' | 'expanding'

export interface SearchPatternsConfig {
  circular: {
    radiusStartKm: number
    radiusMaxKm: number
    radiusStepPerLapKm: number
    speedKt: number
  }
  zigzag: {
    laneSpacingKm: number
    laneLengthKm: number
  }
  expanding: {
    radiusStepPer45DegKm: number
    startRadiusKm: number
  }
}

/** Derive the pattern config from balance.enemyAI.searchPatterns (§6.4). */
export function searchPatternsConfig(balance: BalanceConfig): SearchPatternsConfig {
  const c = balance.enemyAI.searchPatterns
  return {
    circular: {
      radiusStartKm: c.circular.radiusStartKm,
      radiusMaxKm: c.circular.radiusMaxKm,
      radiusStepPerLapKm: c.circular.radiusStepPerLapM / 1000,
      speedKt: c.circular.speedKt,
    },
    zigzag: {
      laneSpacingKm: c.zigzag.laneSpacingM / 1000,
      laneLengthKm: c.zigzag.laneLengthKm,
    },
    expanding: {
      radiusStepPer45DegKm: c.expanding.radiusStepPer45DegM / 1000,
      startRadiusKm: c.expanding.startRadiusM / 1000,
    },
  }
}

/** kt → km/s (1 kt = 1.852 km/h). */
export const KT_TO_KM_S = 1.852 / 3600

export interface Point {
  x: number
  y: number
}

export function distKm(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// --- circular --------------------------------------------------------------

export interface CircularState {
  /** Current angle on the circle (radians, unbounded — grows with time). */
  angleRad: number
  /** Angle at the start of the current lap (radius step per full lap). */
  lapStartRad: number
  /** Current search radius (km). */
  radiusKm: number
}

export function initialCircularState(cfg: SearchPatternsConfig): CircularState {
  return { angleRad: 0, lapStartRad: 0, radiusKm: cfg.circular.radiusStartKm }
}

export interface CircularStep {
  point: Point
  next: CircularState
  /** Radius increased this step (a full lap was completed). */
  lapCompleted: boolean
}

/**
 * Advance the circular search one timestep. Angular speed = speed/radius so
 * the ship keeps a constant ground speed; the radius grows by
 * radiusStepPerLapKm each full lap, capped at radiusMaxKm.
 */
export function stepCircular(
  center: Point,
  st: CircularState,
  speedKt: number,
  dt: number,
  cfg: SearchPatternsConfig['circular'],
): CircularStep {
  const radius = Math.max(0.001, st.radiusKm)
  const omega = (speedKt * KT_TO_KM_S) / radius // rad/s
  let angle = st.angleRad + omega * dt
  let lapStart = st.lapStartRad
  let radiusNext = st.radiusKm
  let lapCompleted = false
  while (angle - lapStart >= 2 * Math.PI) {
    lapStart += 2 * Math.PI
    radiusNext = Math.min(radiusNext + cfg.radiusStepPerLapKm, cfg.radiusMaxKm)
    lapCompleted = true
  }
  const point: Point = {
    x: center.x + radiusNext * Math.cos(angle),
    y: center.y + radiusNext * Math.sin(angle),
  }
  return { point, next: { angleRad: angle, lapStartRad: lapStart, radiusKm: radiusNext }, lapCompleted }
}

// --- zigzag ----------------------------------------------------------------

export interface ZigzagState {
  /** Zero-based lane index (grows outward perpendicular to the sweep). */
  laneIndex: number
  /** Sweep direction along the axis (+1 forward, -1 backward). */
  dir: 1 | -1
  /** Distance travelled along the current lane (km). */
  progressKm: number
  /** Sweep axis heading (deg, north-up) — the estimated course. */
  sweepHeadingDeg: number
}

export function initialZigzagState(sweepHeadingDeg: number): ZigzagState {
  return { laneIndex: 0, dir: 1, progressKm: 0, sweepHeadingDeg }
}

export interface ZigzagStep {
  point: Point
  next: ZigzagState
}

/**
 * Advance the zig-zag sweep: the ship runs `laneLengthKm` along the sweep
 * axis, then flips direction and steps to the next lane `laneSpacingKm`
 * perpendicular to the axis.
 */
export function stepZigzag(
  center: Point,
  st: ZigzagState,
  speedKt: number,
  dt: number,
  cfg: SearchPatternsConfig['zigzag'],
): ZigzagStep {
  let progress = st.progressKm + speedKt * KT_TO_KM_S * dt
  let lane = st.laneIndex
  let dir = st.dir
  if (progress >= cfg.laneLengthKm) {
    progress = 0
    lane += 1
    dir = (dir * -1) as 1 | -1
  }
  const h = (st.sweepHeadingDeg * Math.PI) / 180
  const axis: Point = { x: Math.cos(h), y: Math.sin(h) }
  const perp: Point = { x: -Math.sin(h), y: Math.cos(h) }
  const along = dir * progress
  const across = lane * cfg.laneSpacingKm
  const point: Point = {
    x: center.x + axis.x * along + perp.x * across,
    y: center.y + axis.y * along + perp.y * across,
  }
  return { point, next: { laneIndex: lane, dir, progressKm: progress, sweepHeadingDeg: st.sweepHeadingDeg } }
}

// --- expanding spiral ------------------------------------------------------

export interface ExpandingState {
  /** Current radius (km). */
  radiusKm: number
  /** Current angle (radians, unbounded). */
  angleRad: number
}

export function initialExpandingState(cfg: SearchPatternsConfig): ExpandingState {
  return { radiusKm: cfg.expanding.startRadiusKm, angleRad: 0 }
}

export interface ExpandingStep {
  point: Point
  next: ExpandingState
}

/**
 * Archimedean-style spiral: radius grows +radiusStepPer45DegKm every 45° of
 * turn; angular speed = speed/radius keeps ground speed constant.
 */
export function stepExpanding(
  center: Point,
  st: ExpandingState,
  speedKt: number,
  dt: number,
  cfg: SearchPatternsConfig['expanding'],
): ExpandingStep {
  const radius = Math.max(0.001, st.radiusKm)
  const omega = (speedKt * KT_TO_KM_S) / radius
  const angle = st.angleRad + omega * dt
  const radiusNext = cfg.startRadiusKm + (angle / (Math.PI / 4)) * cfg.radiusStepPer45DegKm
  const point: Point = {
    x: center.x + radiusNext * Math.cos(angle),
    y: center.y + radiusNext * Math.sin(angle),
  }
  return { point, next: { radiusKm: radiusNext, angleRad: angle } }
}

// --- pattern selection -----------------------------------------------------

/**
 * Deterministic pattern choice when a ship enters SEARCHING (DESIGN DECISION,
 * GAME_DESIGN §6.4 "按场景选择"):
 *   - from ALERT          → circular   (fresh locate; player likely stationary)
 *   - from HUNTING/LOST   → expanding  (long time without a good fix)
 *   - otherwise           → zigzag     (torpedo/explosion cue; course known)
 */
export function chooseSearchPattern(previousState: AiState | null): SearchPatternKind {
  switch (previousState) {
    case 'ALERT':
      return 'circular'
    case 'HUNTING':
    case 'LOST_CONTACT':
      return 'expanding'
    default:
      return 'zigzag'
  }
}

// ---------------------------------------------------------------------------
// LKP model (F5)
// ---------------------------------------------------------------------------

export interface Lkp {
  x: number
  y: number
  /** Accumulated uncertainty radius in km (drift / bearing error). */
  errorKm: number
}

export interface LkpModelInput {
  /** Current LKP (null when the escort has never had a fix). */
  lkp: Lkp | null
  playerPos: Point
  /** Player is inside the escort's sensor envelope this tick. */
  inSensorRange: boolean
  /** LKP refresh timer due this tick (every balance.enemyAI.lkp.refreshSeconds). */
  refreshDue: boolean
  /** Number of player maneuvers this tick (turn/speed changes). */
  maneuvers: number
  /** Own active ping hit the player this tick (F4: bearing ±2°). */
  pingHit: boolean
  /** Range of that ping hit (km) — determines the F4 bearing error. */
  pingRangeKm: number
  bearingErrorDeg: number
  driftErrorM: number
  driftMaxKm: number
  /** A live decoy the escort has not reacted to yet (F5 decoy replace). */
  newDecoy: Point | null
  decoyReplaceChance: number
  /** LKP is currently pinned to a decoy (replaced for decoy.durationSeconds). */
  decoyActive: boolean
  rng: Rng
}

export interface LkpModelOutput {
  lkp: Lkp | null
  /** True while the LKP is pinned to a decoy. */
  decoyActive: boolean
}

/**
 * One-tick LKP update (F5):
 *   1. while pinned to a decoy the LKP does not move;
 *   2. a newly launched decoy replaces the LKP with `decoyReplaceChance`;
 *   3. every player maneuver adds driftErrorM to the uncertainty (cap
 *      driftMaxKm) — the LKP position itself does not change;
 *   4. an own-ping hit gives a fresh fix with the F4 bearing error
 *      (≈ range × tan(±2°)) — this overrides accumulated drift;
 *   5. a passive sensor refresh (every 5 s, in range) re-centres the LKP on
 *      the player with zero error;
 *   6. otherwise the LKP stays frozen (position unchanged).
 */
export function updateLkp(input: LkpModelInput): LkpModelOutput {
  // 1. decoy pin: freeze everything.
  if (input.decoyActive) {
    return { lkp: input.lkp, decoyActive: true }
  }

  // 2. decoy replacement roll (once per new decoy — caller tracks ids).
  if (input.newDecoy !== null && input.rng.chance(input.decoyReplaceChance)) {
    return {
      lkp: { x: input.newDecoy.x, y: input.newDecoy.y, errorKm: 0 },
      decoyActive: true,
    }
  }

  // 3. maneuver drift (position unchanged, uncertainty grows).
  const driftTotalKm = Math.min(
    (input.lkp?.errorKm ?? 0) + input.maneuvers * (input.driftErrorM / 1000),
    input.driftMaxKm,
  )

  // 4. ping-hit fresh fix with F4 bearing error.
  if (input.pingHit) {
    const bearingErrorKm = input.pingRangeKm * Math.tan((input.bearingErrorDeg * Math.PI) / 180)
    return {
      lkp: { x: input.playerPos.x, y: input.playerPos.y, errorKm: bearingErrorKm },
      decoyActive: false,
    }
  }

  // 5. passive refresh (fresh fix, zero error).
  if (input.refreshDue && input.inSensorRange) {
    return {
      lkp: { x: input.playerPos.x, y: input.playerPos.y, errorKm: 0 },
      decoyActive: false,
    }
  }

  // 6. frozen position, drifting error only.
  if (input.lkp === null) return { lkp: null, decoyActive: false }
  return { lkp: { x: input.lkp.x, y: input.lkp.y, errorKm: driftTotalKm }, decoyActive: false }
}

/**
 * True when `simTime` has reached the next refresh deadline. A fresh fix also
 * schedules the following refresh (`+refreshSeconds`).
 */
export function lkpRefreshDue(simTime: number, nextRefreshAt: number): boolean {
  return simTime >= nextRefreshAt
}

/** Seconds of the LKP refresh cadence (balance.enemyAI.lkp.refreshSeconds). */
export function lkpRefreshInterval(balance: BalanceConfig): number {
  return balance.enemyAI.lkp.refreshSeconds
}
