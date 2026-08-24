/**
 * SILENT DEPTH — player submarine system (src/gameplay/submarine.ts)
 *
 * GAME_ARCHITECTURE §3 (src/gameplay, pipeline slot 4) + GAME_DESIGN §4:
 *   §4.1 state · §4.2 actions · §4.3 speed bands + F1 noise · §4.4 depth
 *   layers + F2 transition · §4.5 battery · §4.6 hull · FR-12 decoy (§8.2).
 *
 * Exported as a SystemFn (src/core/engine.ts contract) so the factory manager
 * can wire it into the pipeline at slot 4 (submarine) without reordering:
 * the system only reads/writes ctx.player, ctx.decoys, ctx.missionStatus and
 * emits through ctx.bus; it consumes no RNG (ctx.forks.submarine is reserved
 * for later jitter — collision damage rolls belong to combat t-007).
 *
 * DESIGN DECISIONS (all deterministic; balance values read from balance.json):
 *  - Band is derived from the target speed (throttle kt). Targets in the
 *    inter-band gaps (4–8, 12–18 kt) snap UP to the faster band's minimum.
 *  - Acceleration rate is a feel constant (SUB_ACCEL_KT_PER_S = 2.0 kt/s);
 *    GAME_DESIGN specifies no rate — t-015 balance may migrate it.
 *  - Reverse (< 0 kt) is out of scope: ADR-005 PlayerInputs.throttle is
 *    clamped to [0, 22] by the engine; reverseMaxKt stays unused until the
 *    input contract grows.
 *  - LOW BATTERY: speed intent capped to SILENT max (band becomes SILENT),
 *    rudder rate halved, and the ping edge is suppressed for the sonar
 *    system (t-005) — enforced here so downstream systems see no request.
 *  - Battery = 0 → forced surface: depth forced to Surface immediately,
 *    detection set to balance.battery.forcedSurfaceDetection (100), silent
 *    running cancelled; flagged via missionStatus.forcedSurface (edge once).
 *    Defeat itself is NOT decided here — GAME_ARCHITECTURE §7 step 9 gives
 *    victory/defeat to the objectives system (t-008), which reads
 *    player.outOfBoundsTimer / hull / detection.
 *  - Out-of-bounds timer accumulates while the sub is outside the map square
 *    [0, mapSize]² and resets when back inside; 60 s failure is evaluated by
 *    t-008 (this system only keeps the data).
 *  - Emergency dive (3% battery) is not expressible in ADR-005 inputs — it is
 *    a UI shortcut mapping to a depth target; skipped until the contract
 *    grows.
 *  - sub.speedChanged is emitted on speed BAND changes only (continuous noise
 *    is read from the snapshot); sub.depthChanged on transition completion.
 *
 * Task: t-004 player submarine (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references; deterministic (no RNG).
 */

import type { BalanceConfig } from '../core/balance'
import type { SystemContext } from '../core/engine'
import type { DepthLayer, SpeedBand, SubmarineState, WeatherKind } from '../core/types'
import { createDecoy, updateDecoys } from './decoy'

/** Depth layer order (Surface=0 … Deep=4) — used for F2 transition timing. */
export const DEPTH_LAYER_ORDER: readonly DepthLayer[] = ['Surface', 'Periscope', 'Shallow', 'Medium', 'Deep']

const DEPTH_INDEX: Record<DepthLayer, number> = { Surface: 0, Periscope: 1, Shallow: 2, Medium: 3, Deep: 4 }

/** Physical unit conversion: knots → km per second (1 kt = 1.852 km/h). */
export const KNOTS_TO_KM_PER_SEC = 1.852 / 3600

/**
 * Acceleration/deceleration toward the target speed (kt/s).
 * DESIGN DECISION: not specified in GAME_DESIGN §12 — feel constant
 * (ESTIMATED); t-015 balance may migrate it into balance.json.
 */
export const SUB_ACCEL_KT_PER_S = 2.0

/** Layer distance (number of layer steps) between two depth layers (F2). */
/** Layer midpoint depth in metres (t-028, HUD display). */
export function layerMidM(layer: DepthLayer, balance: BalanceConfig): number {
  const c = balance.depthLayers[layer]
  return (c.minM + c.maxM) / 2
}

export function layerDistance(a: DepthLayer, b: DepthLayer): number {
  return Math.abs(DEPTH_INDEX[a] - DEPTH_INDEX[b])
}

// ---------------------------------------------------------------------------
// Speed bands (§4.3) & noise (F1)
// ---------------------------------------------------------------------------

/** Map a target speed (kt) to its speed band; gaps snap to the faster band. */
export function bandForTargetSpeed(speedKt: number, balance: BalanceConfig): SpeedBand {
  const { SILENT, CRUISE } = balance.speedBands
  if (speedKt <= 0) return 'STOPPED'
  if (speedKt <= SILENT.speedMaxKt) return 'SILENT'
  if (speedKt <= CRUISE.speedMaxKt) return 'CRUISE'
  return 'FULL'
}

/** Clamp a target speed into the band's [min, max] range (continuous in-band). */
export function clampSpeedToBand(band: SpeedBand, speedKt: number, balance: BalanceConfig): number {
  const cfg = balance.speedBands[band]
  const lo = band === 'STOPPED' ? 0 : cfg.speedMinKt
  const hi = cfg.speedMaxKt
  return speedKt < lo ? lo : speedKt > hi ? hi : speedKt
}

/**
 * F1 noise for a band + speed, floored at the previous band's max noise so the
 * iron rule (faster ⇒ noisier, B1) holds across band gaps: in-band values
 * match GAME_DESIGN F1 exactly (SILENT 8+2(s−2) · CRUISE 30+4(s−8) ·
 * FULL 70+5(s−18) · STOPPED = 1); out-of-band extrapolation (during band-gap
 * acceleration) is clamped up to the previous band's maximum.
 */
export function bandNoise(band: SpeedBand, speedKt: number, balance: BalanceConfig): number {
  const raw = rawBandNoise(band, speedKt, balance)
  if (band === 'STOPPED') return raw
  return Math.max(raw, previousBandMaxNoise(band, balance))
}

function rawBandNoise(band: SpeedBand, speedKt: number, balance: BalanceConfig): number {
  const interp = balance.noiseInterp[band]
  if (band === 'STOPPED') return typeof interp === 'number' ? interp : interp.bandBase
  if (typeof interp === 'number') return interp // unreachable — STOPPED handled above
  const cfg = balance.speedBands[band]
  return interp.bandBase + interp.slopePerKt * (speedKt - cfg.speedMinKt)
}

/** Max noise of the band below `band` (floor for monotonicity across gaps). */
function previousBandMaxNoise(band: SpeedBand, balance: BalanceConfig): number {
  const order: readonly SpeedBand[] = ['STOPPED', 'SILENT', 'CRUISE', 'FULL']
  const idx = order.indexOf(band)
  const prev = order[idx - 1]
  if (prev === undefined) return 0
  return bandNoise(prev, balance.speedBands[prev].speedMaxKt, balance)
}

export interface NoiseParams {
  band: SpeedBand
  speedKt: number
  depthLayer: DepthLayer
  /** Layer whose noiseMod is averaged in during a transition (F2), else null. */
  transitionLayer: DepthLayer | null
  hull: number
  weather: WeatherKind
  balance: BalanceConfig
}

/**
 * Total acoustic noise 0..100: F1 band noise + depth-layer noiseMod (+ mean
 * of the target layer's mod during a transition, F2) + hull-damaged bonus +
 * Storm-surface bonus. No RNG — deterministic.
 */
export function computeNoise(p: NoiseParams): number {
  const { band, speedKt, depthLayer, transitionLayer, hull, weather, balance } = p
  const base = bandNoise(band, speedKt, balance)
  const modCurrent = balance.depthLayers[depthLayer].noiseMod
  const modOther = transitionLayer !== null ? balance.depthLayers[transitionLayer].noiseMod : modCurrent
  const layerNoise = (modCurrent + modOther) / 2
  let noise = base + layerNoise
  if (hull <= balance.hull.damagedThreshold) {
    noise += balance.hull.damagedNoiseBonus
  }
  if (weather === 'Storm' && depthLayer === 'Surface') {
    noise += balance.weather.Storm.surfaceNoiseBonus ?? 0
  }
  return clamp(noise, 0, 100)
}

// ---------------------------------------------------------------------------
// Hull damage intake (API for combat t-007)
// ---------------------------------------------------------------------------

/**
 * Apply hull damage to the player and emit sub.damaged. Combat (t-007) calls
 * this for depth charges / deck gun / collisions. Hull ≤ 0 is a defeat
 * condition evaluated by the objectives system (t-008) — no state transition
 * happens here.
 */
export function applyHullDamage(ctx: SystemContext, source: string, amount: number): void {
  if (amount <= 0) return
  const player = ctx.player
  const maxHull = ctx.balance.hull.playerMax
  player.hull = clamp(player.hull - amount, 0, maxHull)
  ctx.bus.emit('sub.damaged', { source, amount, hullLeft: player.hull })
}

// ---------------------------------------------------------------------------
// The pipeline system (slot 4 — submarine)
// ---------------------------------------------------------------------------

export const submarineSystem: (ctx: SystemContext) => void = (ctx: SystemContext): void => {
  if (ctx.state !== 'MISSION_RUNNING') return
  const { dt, inputs, balance, bus } = ctx
  const player = ctx.player

  // --- 1. speed intent: band + in-band target; LOW BATTERY caps at SILENT ---
  let band = bandForTargetSpeed(inputs.throttle, balance)
  let target = clampSpeedToBand(band, inputs.throttle, balance)
  if (player.lowBattery && target > balance.speedBands.SILENT.speedMaxKt) {
    band = 'SILENT'
    target = balance.speedBands.SILENT.speedMaxKt
  }
  const bandChanged = band !== player.speedBand
  player.speedBand = band
  player.targetSpeedKt = target

  // --- 2. integrate speed toward target (continuous in-band acceleration) ---
  const maxStep = SUB_ACCEL_KT_PER_S * dt
  const delta = target - player.speedKt
  const step = delta > 0 ? Math.min(delta, maxStep) : Math.max(delta, -maxStep)
  player.speedKt = clamp(player.speedKt + step, 0, balance.speedBands.FULL.speedMaxKt)
  if (Math.abs(player.speedKt) < 1e-9) player.speedKt = 0

  // --- 2b. silent running toggle (§4.2) — affects battery + detection (t-007) ---
  player.silentRunning = inputs.silentRunning

  // --- 3. turn: FULL band turns slower; LOW BATTERY halves the rate ---
  const baseTurn = band === 'FULL' ? balance.rudder.turnRateDegPerSecFullSpeed : balance.rudder.turnRateDegPerSec
  const turnRate = player.lowBattery ? baseTurn * balance.rudder.lowBatteryTurnRateFactor : baseTurn
  player.headingDeg = normDeg(player.headingDeg + inputs.rudder * turnRate * dt)

  // --- 4. movement: position integrates speed × heading (north-up) ---
  moveSubmarine(player, dt)

  // --- 5. depth layer transitions (F2: 3 s per layer) ---
  updateDepth(ctx)

  // --- 6. battery: band drain + silent-running extra + surface/deep charge ---
  updateBattery(ctx)
  // --- 7. decoy launch (edge) + decoy aging ---
  if (ctx.decoyEdge) launchDecoy(ctx)
  updateDecoys(ctx.decoys, dt, balance)

  // --- 8. noise (F1 + depth mod + hull bonus + storm bonus; mean in transit) ---
  player.noise = computeNoise({
    band: player.speedBand,
    speedKt: player.speedKt,
    depthLayer: player.depthLayer,
    transitionLayer: player.depthTransitionT !== null ? player.targetDepthLayer : null,
    hull: player.hull,
    weather: ctx.mission.weather,
    balance,
  })

  // --- 9. out-of-bounds timer (60 s → defeat, decided by objectives t-008) ---
  updateOutOfBounds(ctx)

  // --- 10. events ---
  if (bandChanged) {
    bus.emit('sub.speedChanged', { band: player.speedBand, speedKt: player.speedKt, noise: player.noise })
  }

  // --- 11. LOW BATTERY gates the ping edge (sonar t-005 sees no request) ---
  if (player.lowBattery) ctx.pingEdge = false
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function moveSubmarine(player: SubmarineState, dt: number): void {
  const rad = (player.headingDeg * Math.PI) / 180
  const v = player.speedKt * KNOTS_TO_KM_PER_SEC
  player.position.x += Math.sin(rad) * v * dt
  player.position.y += Math.cos(rad) * v * dt
}

function updateDepth(ctx: SystemContext): void {
  const { dt, balance, bus, inputs } = ctx
  const player = ctx.player

  // DESIGN DECISION: no dive lock-out after forced surface — the sub recharges
  // at Surface (DD-05) within one tick, so a "battery == 0" guard would be
  // dead code; depth control stays with the player (their input is the target).
  let target = inputs.depthLayerTarget
  if (!(target in DEPTH_INDEX)) return // defensive: unknown layer ignored

  // t-024: emergency dive (edge) overrides the depth target to Deep, costs
  // battery (balance.battery.emergencyDiveCostPercent) and emits
  // sub.emergencyDive. The UI keeps depthLayerTarget='Deep' afterwards; a
  // single-shot edge without a persistent input re-asserts the player's
  // selection next tick (input contract owns the depth intent).
  if (ctx.diveEdge === true) {
    target = 'Deep'
    player.battery = Math.max(0, player.battery - balance.battery.emergencyDiveCostPercent)
    bus.emit('sub.emergencyDive', {})
  } else if (ctx.periscope !== undefined && ctx.periscope.state !== 'SUBMERGED') {
    // The periscope owns the depth while ANY of its states is active
    // (SURFACING auto-rise, RAISING, RAISED, OBSERVING, LOWERING): hold the
    // required layer against the player's input. Without this the stale
    // depth input yanks the sub back down the moment RAISING starts (t-027
    // integration finding — the hold must not be limited to SURFACING).
    // The player changes depth by lowering the periscope first, or via
    // emergency dive (diveEdge above wins).
    target = ctx.balance.periscope.requiredLayer
  }

  if (target === player.depthLayer) {
    // Cancel any in-flight transition back to the current layer.
    if (player.depthTransitionT !== null) {
      player.depthTransitionT = null
      player.targetDepthLayer = player.depthLayer
    }
    return
  }
  if (target !== player.targetDepthLayer) {
    // Start (or restart from the current layer) a transition.
    player.targetDepthLayer = target
    player.depthTransitionT = layerDistance(player.depthLayer, target) * balance.depthTransitionSecondsPerLayer
  } else if (player.depthTransitionT === null && target !== player.depthLayer) {
    // t-027 integration finding: the periscope SURFACING hold pre-sets
    // targetDepthLayer (slot 4 runs before slot 6), so `target !==
    // targetDepthLayer` is false and the transition timer would never start.
    // If the target is already set but no transition is running and we are
    // not there yet, start it now. (Normal play can't reach here: same-input
    // with a completed transition means depthLayer === target, caught by the
    // return above; an in-flight transition has depthTransitionT !== null.)
    player.depthTransitionT = layerDistance(player.depthLayer, target) * balance.depthTransitionSecondsPerLayer
  }
  if (player.depthTransitionT !== null) {
    player.depthTransitionT -= dt
    // Epsilon guards binary float drift at the completion boundary
    // (e.g. 5.95 − 118×0.05 leaves ~7e-16 instead of exactly 0).
    if (player.depthTransitionT <= 1e-9) {
      player.depthLayer = player.targetDepthLayer
      player.depthTransitionT = null
      bus.emit('sub.depthChanged', { layer: player.depthLayer })
    }
  }

  // t-028: live depth in metres — interpolate between the source layer
  // midpoint (depthLayer is still the origin while transitioning) and the
  // target midpoint by transition progress; stable when no transition runs.
  {
    const from = layerMidM(player.depthLayer, balance)
    const to = layerMidM(player.targetDepthLayer, balance)
    if (player.depthTransitionT !== null) {
      const total = Math.max(layerDistance(player.depthLayer, player.targetDepthLayer) * balance.depthTransitionSecondsPerLayer, 1e-9)
      const progress = 1 - player.depthTransitionT / total
      player.depthM = from + (to - from) * Math.max(0, Math.min(1, progress))
    } else {
      player.depthM = from
    }
  }
}

function updateBattery(ctx: SystemContext): void {
  const { dt, balance, bus } = ctx
  const player = ctx.player
  const bandCfg = balance.speedBands[player.speedBand]

  let delta = -bandCfg.batteryDrainPerSec * dt
  if (player.silentRunning) delta -= balance.battery.silentRunningExtraPerSec * dt
  const layerCfg = balance.depthLayers[player.depthLayer]
  delta += layerCfg.chargePerSec * dt // Surface recharge (DD-05)
  delta += layerCfg.extraBatteryPerSec * dt // Deep ballast recharge

  player.battery = clamp(player.battery + delta, 0, balance.battery.capacity)

  // battery.low edge (crossing below the threshold)
  const low = player.battery < balance.battery.lowBatteryThreshold
  if (!player.lowBattery && low) {
    bus.emit('battery.low', { battery: player.battery })
  }
  player.lowBattery = low

  // battery = 0 → forced surface (edge once, punitive path §3.1)
  if (player.battery <= 0 && !ctx.missionStatus.forcedSurface) {
    ctx.missionStatus.forcedSurface = true
    player.depthLayer = 'Surface'
    player.targetDepthLayer = 'Surface'
    player.depthTransitionT = null
    player.silentRunning = false
    player.detection = balance.battery.forcedSurfaceDetection
    bus.emit('sub.forcedSurface', {})
  }
}

function launchDecoy(ctx: SystemContext): void {
  const { balance, bus } = ctx
  const player = ctx.player
  if (player.decoyCount <= 0) return // no decoys left — ignored silently
  if (player.battery < balance.decoy.batteryCostPercent) return // can't afford
  player.decoyCount -= 1
  player.battery = Math.max(0, player.battery - balance.decoy.batteryCostPercent)
  // Deterministic per-mission ids: D-01, D-02 … (launched count = perMission − remaining).
  const id = `D-${String(balance.decoy.perMission - player.decoyCount).padStart(2, '0')}`
  const decoy = createDecoy(id, player.position.x, player.position.y, balance)
  ctx.decoys.push(decoy)
  bus.emit('decoy.launched', { decoyId: id, x: player.position.x, y: player.position.y })
}

function updateOutOfBounds(ctx: SystemContext): void {
  const { dt, balance } = ctx
  const player = ctx.player
  const size = balance.world.mapSizeKm
  const inside = player.position.x >= 0 && player.position.x <= size && player.position.y >= 0 && player.position.y <= size
  if (inside) {
    player.outOfBoundsTimer = 0
  } else {
    player.outOfBoundsTimer = Math.min(player.outOfBoundsTimer + dt, balance.world.outOfBoundsFailSeconds)
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}
