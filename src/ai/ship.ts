/**
 * SILENT DEPTH — enemy ship primitives (src/ai/ship.ts)
 *
 * Ship-class behaviour data (GAME_DESIGN §6.2), the F3 passive-detection
 * formula (§15 F3 / B9), simple kinematics (steer toward a target heading at
 * a target speed), and the shared per-ship AI runtime type used by convoy.ts /
 * escort.ts / ai.ts. Also hosts the small PendingDamage type that bridges the
 * AI system (pipeline position 6) to the combat system (position 7, t-007).
 *
 * DESIGN DECISIONS (numbers without a balance.json entry):
 *   - Enemy turn rates: escorts 8 °/s, merchants 4 °/s (no design number;
 *     escorts must feel nimble, merchants sluggish).
 *   - Enemy acceleration toward target speed: 2 kt/s (no design number).
 *   - SUSPICIOUS cruise cap 22 kt and LOST_CONTACT cruise 20 kt come from the
 *     §6.1 state table (22 kt suspicious, 20 kt en route home).
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; no module state.
 */

import type { BalanceConfig } from '../core/balance'
import type { EnemyShip, SubmarineState, WeatherKind } from '../core/types'
import type { SearchPatternKind } from './search'

/**
 * Convoy formation slot (0-based col/row of the fleet grid, GAME_DESIGN §6.3).
 * Defined here (not in convoy.ts) so the per-ship runtime type stays
 * import-cycle-free: ship.ts ← convoy.ts ← ai.ts.
 */
export interface FormationSlot {
  col: number
  row: number
}

/** kt → km/s (1 kt = 1.852 km/h). */
export const KT_TO_KM_S = 1.852 / 3600

// ---------------------------------------------------------------------------
// Design constants — now migrated to balance.json (t-015).
// Retained as named exports for backward compatibility; callers should
// prefer reading from balance.enemyAI for new code.
// ---------------------------------------------------------------------------

/** Enemy turn rates (°/s) — now in balance.enemyAI.turnRates. */
export const ENEMY_TURN_RATE_DEG_S = { escort: 8, merchant: 4 } as const
/** Enemy acceleration toward target speed (kt/s) — now in balance.enemyAI.accelKtPerS. */
export const ENEMY_ACCEL_KT_PER_S = 2
/** SUSPICIOUS cruise speed cap (§6.1 table) — now in balance.enemyAI.suspiciousSpeedCapKt. */
export const SUSPICIOUS_SPEED_CAP_KT = 22
/** LOST_CONTACT cruise speed (§6.1 table) — now in balance.enemyAI.lostContactSpeedKt. */
export const LOST_CONTACT_SPEED_KT = 20
/** Merchant ALERT behaviour duration (§6.1) — now in balance.enemyAI.merchantAlertSeconds. */
export const MERCHANT_ALERT_SECONDS = 60

export interface Point {
  x: number
  y: number
}

export function distKm(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Wrap a heading to [0, 360). */
export function normalizeDeg(h: number): number {
  const m = h % 360
  return m < 0 ? m + 360 : m
}

/** Signed shortest angular difference from→to in (-180, 180]. */
export function angleDiffDeg(from: number, to: number): number {
  let d = (normalizeDeg(to) - normalizeDeg(from)) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** North-up bearing (deg) from `a` to `b`. */
export function bearingDeg(a: Point, b: Point): number {
  return normalizeDeg((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
}

// ---------------------------------------------------------------------------
// Ship-class data (GAME_DESIGN §6.2 / balance.enemyAI.shipTypes)
// ---------------------------------------------------------------------------

/** Escort = a ship with an attack kit (Destroyer / Frigate). */
export function isEscortShip(ship: EnemyShip, balance: BalanceConfig): boolean {
  return balance.enemyAI.shipTypes[ship.shipClass]?.attack !== null
}

export function isMerchantShip(ship: EnemyShip, balance: BalanceConfig): boolean {
  return !isEscortShip(ship, balance)
}

export interface ShipSpeeds {
  patrolKt: number
  attackKt: number
}

/** Patrol/attack speeds from balance (number = both, or {patrol, attack}). */
export function shipSpeeds(ship: EnemyShip, balance: BalanceConfig): ShipSpeeds {
  const cfg = balance.enemyAI.shipTypes[ship.shipClass]
  const s = cfg?.speedKt
  if (typeof s === 'number') return { patrolKt: s, attackKt: s }
  const patrolKt = s?.patrol ?? 9
  return { patrolKt, attackKt: s?.attack ?? patrolKt }
}

/** Passive sensor range (km) from balance.enemyAI.shipTypes. */
export function passiveRangeKm(ship: EnemyShip, balance: BalanceConfig): number {
  return balance.enemyAI.shipTypes[ship.shipClass]?.passiveRangeKm ?? 4
}

/** F3 base rate: escorts 0.05/s (6 km), merchants 0.015/s (4 km). */
export function baseDetectionRate(ship: EnemyShip, balance: BalanceConfig): number {
  return isEscortShip(ship, balance)
    ? balance.detectionFormula.escortBaseRate
    : balance.detectionFormula.merchantBaseRate
}

// ---------------------------------------------------------------------------
// F3 — enemy passive detection rate of the player (%/s)
// ---------------------------------------------------------------------------

/**
 * F3: P_detect = (noise/100) × baseRate × depthFactor × weatherFactor ×
 * distanceFactor, with distanceFactor = clamp(1 − d/range, 0, 1)
 * (GAME_DESIGN §15 F3, balance.detectionFormula; depth factor from
 * balance.depthLayers, weather factor = sonarFactor from balance.weather).
 * Returns the rate in **percent of the detection meter per second** (%/s) —
 * GAME_DESIGN B9 labels a 0.05 base-rate product as "5.0%/s" and derives
 * "≈8 s from 0 to 40", so the caller adds `rate × dt` directly to the
 * 0..100 meter.
 */
export function passiveDetectionRate(
  ship: EnemyShip,
  player: SubmarineState,
  balance: BalanceConfig,
  weather: WeatherKind,
): number {
  const range = passiveRangeKm(ship, balance)
  if (range <= 0) return 0
  const d = distKm(ship.position, player.position)
  const distanceFactor = clamp(1 - d / range, 0, 1)
  if (distanceFactor <= 0) return 0
  const noise = Math.max(0, player.noise)
  if (noise <= 0) return 0
  const depthFactor = balance.depthLayers[player.depthLayer].detectFactor
  const weatherFactor = balance.weather[weather].sonarFactor
  // (noise/100) × 100 collapses to `noise` — the %/s rate.
  return noise * baseDetectionRate(ship, balance) * depthFactor * weatherFactor * distanceFactor
}

// ---------------------------------------------------------------------------
// Kinematics
// ---------------------------------------------------------------------------

export interface MoveOpts {
  turnRateDegPerS: number
  accelKtPerS?: number
}

/**
 * Simple kinematics: turn toward `targetHeadingDeg` at a limited rate, ease
 * speed toward `targetSpeedKt`, then integrate position along the heading.
 * Mutates the ship's position/heading/speed in place (the EnemyShip public
 * view is the AI system's canonical object).
 */
export function moveShip(
  ship: EnemyShip,
  targetHeadingDeg: number,
  targetSpeedKt: number,
  dt: number,
  opts: MoveOpts,
): void {
  const accel = opts.accelKtPerS ?? ENEMY_ACCEL_KT_PER_S
  const diff = angleDiffDeg(ship.headingDeg, targetHeadingDeg)
  const maxTurn = opts.turnRateDegPerS * dt
  ship.headingDeg = normalizeDeg(ship.headingDeg + Math.sign(diff) * Math.min(Math.abs(diff), maxTurn))

  const dv = targetSpeedKt - ship.speedKt
  const maxDv = accel * dt
  ship.speedKt = ship.speedKt + Math.sign(dv) * Math.min(Math.abs(dv), maxDv)
  if (Math.abs(ship.speedKt) < 1e-9) ship.speedKt = 0

  const rad = (ship.headingDeg * Math.PI) / 180
  ship.position.x += Math.cos(rad) * ship.speedKt * KT_TO_KM_S * dt
  ship.position.y += Math.sin(rad) * ship.speedKt * KT_TO_KM_S * dt
}

/** Steer toward a world point at a target speed (see moveShip). */
export function steerTo(
  ship: EnemyShip,
  tx: number,
  ty: number,
  targetSpeedKt: number,
  dt: number,
  opts: MoveOpts,
): void {
  moveShip(ship, bearingDeg(ship.position, { x: tx, y: ty }), targetSpeedKt, dt, opts)
}

// ---------------------------------------------------------------------------
// Damage helper (used by the AI system and by combat t-007)
// ---------------------------------------------------------------------------

/**
 * Apply damage to an enemy ship hull (clamped at 0). Returns true only when
 * THIS call drove the hull to 0 — the caller emits the ship.sunk event once.
 */
export function applyDamage(ship: EnemyShip, amount: number): boolean {
  const before = ship.hull
  ship.hull = Math.max(0, ship.hull - Math.max(0, amount))
  return before > 0 && ship.hull <= 0
}

// ---------------------------------------------------------------------------
// Pending-output bridge (AI system → combat system, t-007)
// ---------------------------------------------------------------------------

/**
 * Damage the AI resolved this tick (depth-charge detonation / deck-gun hit)
 * but that the combat system must apply to the player hull. The engine's
 * SystemContext has no such field, so the AI system accumulates them in a
 * per-tick buffer exposed by src/ai/ai.ts (drainAiPendingDamage); the factory
 * manager wires the drain call into the t-007 combat stub (DESIGN DECISION —
 * see src/ai/ai.ts header).
 */
export interface PendingDamage {
  shipId: string
  source: 'depthCharge' | 'deckGun'
  amount: number
  distM: number
  hit: boolean
}

// ---------------------------------------------------------------------------
// Per-ship AI runtime (private behaviour state, keyed by game instance)
// ---------------------------------------------------------------------------

/**
 * Mutable behaviour state the AI keeps for one enemy ship across ticks.
 * Lives in a per-game runtime owned by src/ai/ai.ts (WeakMap keyed on the
 * live player reference) so it never leaks between games and never touches
 * the frozen EnemyShip public view.
 */
export interface AiShipRuntime {
  // state-residence accumulators (seconds)
  suspiciousNoContactS: number
  searchingNoContactS: number
  huntingBelow40S: number
  lostContactAtPostS: number
  // merchant behaviours
  /** Remaining seconds of the §6.1 ALERT merchant behaviour (turn 30°, 11 kt). */
  merchantAlertS: number
  /** Remaining seconds of a torpedo-targeted evade (45°, 30 s). */
  evadeS: number
  /** Remaining seconds of a convoy-mate-sunk evade (45°, 30 s, then reform). */
  neighborEvadeS: number
  /** Direction chosen for the current merchant evade turn. */
  evadeSign: 1 | -1
  /** Absolute heading held during merchant ALERT (or null). */
  merchantAlertHeadingDeg: number | null
  /** Absolute heading held during a merchant evade (or null). */
  evadeHeadingDeg: number | null
  // escort sensors
  /** simTime of the next own active ping. */
  nextPingAt: number
  /** Consecutive own-ping hits with range (SUSPICIOUS → ALERT trigger). */
  consecutivePingHits: number
  /** Range (km) of the last own-ping hit, or null. */
  lastPingHitRangeKm: number | null
  /** simTime of the next LKP refresh (F5, 5 s cadence). */
  nextLkpRefreshAt: number
  /** Current LKP uncertainty from drift (km). */
  lkpErrorKm: number
  /** simTime until which the LKP is pinned to a decoy. */
  lkpDecoyUntil: number
  /** Decoy ids already processed (one replacement roll per decoy). */
  decoyHandled: Set<string>
  /** Player motion reference for F5 maneuver drift detection. */
  lastPlayerHeadingDeg: number
  lastPlayerSpeedKt: number
  // search-pattern state
  searchPattern: SearchPatternKind | null
  circular: { angleRad: number; lapStartRad: number; radiusKm: number }
  zigzag: { laneIndex: number; dir: 1 | -1; progressKm: number; sweepHeadingDeg: number }
  expanding: { radiusKm: number; angleRad: number }
  // escort patrol
  /** Figure-8 phase (radians). */
  patrolPhaseRad: number
  /** Escort patrol post (formation anchor minus offset). */
  post: { x: number; y: number } | null
  // escort attacks
  /** simTime of the next depth-charge drop in the current round. */
  dcNextDropAt: number
  /** Charges dropped in the current round (perRound per round). */
  dcRoundCount: number
  /** simTime when the next round may begin. */
  dcNextRoundAt: number
  /** simTime of the next allowed deck-gun shot. */
  nextDeckGunAt: number
  // flags
  sunkEmitted: boolean
  /** Depth-charge ammo exhausted — HUNTING disabled forever (§6.1). */
  huntingDisabled: boolean
  /** Formation slot (col,row) for convoy merchants (null for escorts). */
  formationSlot: FormationSlot | null
}

/** Fresh per-ship runtime defaults (no shared references). */
export function createShipRuntime(slot: FormationSlot | null): AiShipRuntime {
  return {
    suspiciousNoContactS: 0,
    searchingNoContactS: 0,
    huntingBelow40S: 0,
    lostContactAtPostS: 0,
    merchantAlertS: 0,
    evadeS: 0,
    neighborEvadeS: 0,
    evadeSign: 1,
    merchantAlertHeadingDeg: null,
    evadeHeadingDeg: null,
    nextPingAt: 0,
    consecutivePingHits: 0,
    lastPingHitRangeKm: null,
    nextLkpRefreshAt: 0,
    lkpErrorKm: 0,
    lkpDecoyUntil: 0,
    decoyHandled: new Set<string>(),
    lastPlayerHeadingDeg: 0,
    lastPlayerSpeedKt: 0,
    searchPattern: null,
    circular: { angleRad: 0, lapStartRad: 0, radiusKm: 0 },
    zigzag: { laneIndex: 0, dir: 1, progressKm: 0, sweepHeadingDeg: 0 },
    expanding: { radiusKm: 0, angleRad: 0 },
    patrolPhaseRad: 0,
    post: null,
    dcNextDropAt: 0,
    dcRoundCount: 0,
    dcNextRoundAt: 0,
    nextDeckGunAt: 0,
    sunkEmitted: false,
    huntingDisabled: false,
    formationSlot: slot,
  }
}
