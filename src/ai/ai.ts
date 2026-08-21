/**
 * SILENT DEPTH — enemy AI system (src/ai/ai.ts)
 *
 * FR-09/FR-10, GAME_ARCHITECTURE §3 (src/ai) / §7 (pipeline position 6).
 * The factory manager wires `aiSystem` into the engine pipeline in place of
 * the t-006 stub (src/core/engine.ts `systemAI`) — engine.ts is NOT edited
 * here. Per tick, for every enemy ship:
 *
 *   1. sense   — F3 passive detection of the player's noise (writes the
 *                detection delta into ctx.player.detection), player-ping
 *                hearing, torpedo proximity, explosion lookback over the
 *                event log, and the escort's own active ping (F4: on a hit,
 *                detection +8 and a bearing ±2° fix).
 *   2. LKP     — F5 model: 5 s refresh, freeze out of sensor range, +50 m
 *                drift per player maneuver (cap 1.5 km), decoy replacement
 *                (70 % / 20 s). Escorts only.
 *   3. state   — evaluateAiState (src/ai/aiState.ts) with the perception
 *                triggers and timer accumulators.
 *   4. behave  — merchant: convoy formation / evade (src/ai/convoy.ts);
 *                escort: patrol / chase / search / hunt + attacks
 *                (src/ai/escort.ts).
 *   5. publish — mutate the EnemyShip public view (position, headingDeg,
 *                speedKt, hull, aiState, lkp, depthChargesLeft,
 *                activePingCooldown, inConvoy) and emit events
 *                (depthCharge.dropped, depthCharge.detonated, deckGun.fired,
 *                ship.sunk).
 *
 * DESIGN DECISIONS:
 *   - Per-game runtime: the AI keeps mutable behaviour state (timers, pattern
 *     phase, LKP bookkeeping) in a WeakMap keyed on the LIVE ctx.player
 *     reference. Each createGame() builds a fresh player object, so re-created
 *     games and interleaved handles never share state — step() stays pure w.r.t.
 *     a handle (ADR-004). No extra fields were added to the frozen EnemyShip
 *     public type.
 *   - Detection deltas: the AI applies F3/F4/depth-charge/deck-gun detection
 *     contributions directly to ctx.player.detection (clamped 0..100) — that
 *     IS the "context field" for the player's meter. The t-007 detection
 *     system must NOT re-apply these; it owns the F8 sinks, band-threshold
 *     events and the located/60 s logic.
 *   - Pending damage bridge: SystemContext has no damage field, so resolved
 *     depth-charge/deck-gun damage is accumulated in a per-game buffer
 *     exposed via drainAiPendingDamage() (owner-keyed on the live player
 *     reference, so interleaved/re-created games never contaminate each
 *     other). The factory manager wires the drain into the t-007 combat stub,
 *     which applies each entry to the player hull. In the real engine combat
 *     drains after every AI tick, so the buffer never holds more than one
 *     tick's worth; while combat is unwired the accumulation keeps resolved
 *     damage available instead of silently dropping it.
 *   - Explosion perception: the event bus tail IS the sonar→ai perception
 *     queue the engine exposes today; the AI looks back EXPLOSION_LOOKBACK_S
 *     for torpedo.hit / depthCharge.detonated / ship.sunk. Payloads carrying
 *     x/y are range-gated by sonar.passive.explosionRangeKm; payloads without
 *     position (e.g. ship.sunk) are assumed heard (documented simplification).
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; the only randomness is
 * ctx.forks.ai (ADR-004). Module state is limited to the per-game WeakMap and
 * the per-game pending-damage buffer described above.
 */

import type { SystemContext, SystemFn } from '../core/engine'
import type { AiState, EnemyShip, WeatherKind } from '../core/types'
import {
  HUNTING_DEGRADE_BELOW,
  defaultAiThresholds,
  evaluateAiState,
} from './aiState'
import type { AiStateTimers, AiThresholds, AiTriggers } from './aiState'
import {
  advanceAnchor,
  formationGeometry,
  runMerchantBehavior,
  slotForMerchantIndex,
} from './convoy'
import type { FormationGeometry } from './convoy'
import { runEscortTick } from './escort'
import type { EscortTickCtx } from './escort'
import {
  chooseSearchPattern,
  initialCircularState,
  initialExpandingState,
  initialZigzagState,
  lkpRefreshDue,
  searchPatternsConfig,
  updateLkp,
} from './search'
import {
  MERCHANT_ALERT_SECONDS,
  angleDiffDeg,
  applyDamage,
  clamp,
  createShipRuntime,
  distKm,
  isEscortShip,
  isMerchantShip,
  normalizeDeg,
  passiveDetectionRate,
} from './ship'
import type { AiShipRuntime, FormationSlot, PendingDamage } from './ship'

// Re-export the damage helper so combat (t-007) applies player-facing damage
// with the same semantics the AI uses for ship.sunk detection.
export { applyDamage }

// ---------------------------------------------------------------------------
// Design constants
// ---------------------------------------------------------------------------

/** Explosion lookback window (s) over the event-log perception queue. */
export const EXPLOSION_LOOKBACK_S = 2
/** Player turn above this (°) counts as one F5 maneuver. */
export const MANEUVER_TURN_DEG = 30
/** Player speed change above this (kt) counts as one F5 maneuver. */
export const MANEUVER_SPEED_KT = 3

// ---------------------------------------------------------------------------
// Pending-output bridge (AI → combat, t-007)
// ---------------------------------------------------------------------------

interface PendingOutput {
  simTime: number
  /** Owning game (the live player reference) — key for cross-game isolation. */
  owner: object | null
  damages: PendingDamage[]
}

let pending: PendingOutput = { simTime: -1, owner: null, damages: [] }

/**
 * Snapshot-and-clear the damage the AI resolved since the last drain. The
 * factory manager wires this into the t-007 combat stub (position 7), which
 * applies each entry to the player hull (sub.damaged / ship destruction).
 *
 * The buffer accumulates across ticks of the same game until drained — in the
 * real engine combat drains it every tick right after the AI system, so it
 * never holds more than one tick's worth; when combat is not yet wired the
 * accumulation keeps the data available instead of silently dropping it.
 */
export function drainAiPendingDamage(): PendingDamage[] {
  const out = pending.damages
  pending.damages = []
  return out
}

/** Test/manager hook: fully reset the pending bridge. */
export function resetAiPendingOutput(): void {
  pending = { simTime: -1, owner: null, damages: [] }
}

/** Re-key the buffer when a different game instance ticks (no cross-game leak). */
function ensurePendingOwner(ctx: SystemContext): void {
  if (pending.owner !== ctx.player) {
    pending = { simTime: ctx.simTime, owner: ctx.player, damages: [] }
  }
}

// ---------------------------------------------------------------------------
// Per-game runtime (WeakMap keyed on the live player reference)
// ---------------------------------------------------------------------------

interface AiGameRuntime {
  anchor: { x: number; y: number } | null
  fleetHeadingDeg: number
  fleetSpeedKt: number
  geo: FormationGeometry
  heavyEscort: boolean
  ships: Map<string, AiShipRuntime>
  /** Formation slot per merchant id (assigned in spawn order). */
  slots: Map<string, FormationSlot>
  /** Convoy merchant ids that are sunk this tick (neighbor-evade trigger). */
  convoySunkIds: Set<string>
}

const gameRuntimes = new WeakMap<object, AiGameRuntime>()

/**
 * Active weather for F3: prefer the world system's per-tick weather
 * (ctx.worldState, t-009 — handles mission chains like M03 "Clear->Storm"),
 * else fall back to the static mission weather (defensive default 'Clear' if
 * the mission string is a chain and the world system is not wired yet).
 */
function activeWeatherFor(ctx: SystemContext): WeatherKind {
  const ws = ctx.worldState as { currentWeather?: WeatherKind } | undefined
  if (ws?.currentWeather !== undefined) return ws.currentWeather
  const kind = ctx.mission.weather
  return kind in ctx.balance.weather ? (kind as WeatherKind) : 'Clear'
}

function getGameRuntime(ctx: SystemContext): AiGameRuntime {
  let rt = gameRuntimes.get(ctx.player)
  if (rt === undefined) {
    rt = {
      anchor: null,
      fleetHeadingDeg: ctx.mission.fleet.headingDeg,
      fleetSpeedKt: ctx.mission.fleet.speedKt,
      geo: formationGeometry(ctx.mission.fleet, ctx.balance),
      heavyEscort: false,
      ships: new Map<string, AiShipRuntime>(),
      slots: new Map<string, FormationSlot>(),
      convoySunkIds: new Set<string>(),
    }
    gameRuntimes.set(ctx.player, rt)
  }
  return rt
}

function initRuntime(rt: AiGameRuntime, ctx: SystemContext): void {
  const balance = ctx.balance
  const merchants = ctx.enemies.filter((e) => isMerchantShip(e, balance))
  let cx = 0
  let cy = 0
  if (merchants.length > 0) {
    for (const m of merchants) {
      cx += m.position.x
      cy += m.position.y
    }
    cx /= merchants.length
    cy /= merchants.length
  } else if (ctx.enemies.length > 0) {
    const first = ctx.enemies[0]
    if (first !== undefined) {
      cx = first.position.x
      cy = first.position.y
    }
  } else {
    cx = ctx.player.position.x
    cy = ctx.player.position.y
  }
  rt.anchor = { x: cx, y: cy }
  rt.fleetHeadingDeg = ctx.mission.fleet.headingDeg
  rt.fleetSpeedKt = ctx.mission.fleet.speedKt
  rt.geo = formationGeometry(ctx.mission.fleet, ctx.balance)
  const escortCount = ctx.enemies.filter((e) => isEscortShip(e, balance)).length
  // Heavy escort (≥2) → the aggressive 2 s ping cadence (M04/M05).
  rt.heavyEscort = escortCount >= 2
  merchants.forEach((m, i) => {
    rt.slots.set(m.id, slotForMerchantIndex(i, rt.geo))
  })
}

function getShipRuntime(rt: AiGameRuntime, ship: EnemyShip, ctx: SystemContext): AiShipRuntime {
  let srt = rt.ships.get(ship.id)
  if (srt === undefined) {
    srt = createShipRuntime(rt.slots.get(ship.id) ?? null)
    // Prime the F5 maneuver tracker so the first tick is not a "maneuver".
    srt.lastPlayerHeadingDeg = ctx.player.headingDeg
    srt.lastPlayerSpeedKt = ctx.player.speedKt
    rt.ships.set(ship.id, srt)
  }
  return srt
}

// ---------------------------------------------------------------------------
// Sensing
// ---------------------------------------------------------------------------

interface SenseResult {
  noiseSensed: boolean
  pingHeard: boolean
  torpedoNearKm: number | null
  explosionHeard: boolean
  pingHit: boolean
  pingHitRangeKm: number | null
}

const EXPLOSION_TYPES: ReadonlySet<string> = new Set(['torpedo.hit', 'depthCharge.detonated', 'ship.sunk'])

function applyDetection(ctx: SystemContext, delta: number): void {
  if (delta === 0) return
  ctx.player.detection = clamp(ctx.player.detection + delta, 0, 100)
}

function senseShip(ship: EnemyShip, srt: AiShipRuntime, rt: AiGameRuntime, ctx: SystemContext): SenseResult {
  const balance = ctx.balance
  const player = ctx.player
  const weather = activeWeatherFor(ctx)

  // F3 passive detection of the player's noise → detection delta.
  const rate = passiveDetectionRate(ship, player, balance, weather)
  const noiseSensed = rate > 0
  const f3Delta = rate * ctx.dt
  if (f3Delta > 0) applyDetection(ctx, f3Delta)

  // Player active ping heard (escorts within escortHearPingRangeKm).
  let pingHeard = false
  if (isEscortShip(ship, balance) && ctx.pingEdge) {
    const hearRange = balance.sonar.active.escortHearPingRangeKm
    if (distKm(ship.position, player.position) <= hearRange) pingHeard = true
  }

  // Nearest RUNNING torpedo (km) — proximity perception.
  let torpedoNearKm: number | null = null
  for (const t of ctx.torpedoes) {
    if (t.state !== 'RUNNING') continue
    const d = distKm(ship.position, t.position)
    if (torpedoNearKm === null || d < torpedoNearKm) torpedoNearKm = d
  }

  // Explosion lookback over the event log (§7: the event bus is the
  // sonar→ai perception queue the engine exposes today).
  let explosionHeard = false
  const log = ctx.bus.getLog()
  for (const ev of log) {
    if (!EXPLOSION_TYPES.has(ev.type)) continue
    if (ev.simTime < ctx.simTime - EXPLOSION_LOOKBACK_S) continue
    const p = ev.payload
    if (p !== undefined && typeof p.x === 'number' && typeof p.y === 'number') {
      if (distKm(ship.position, { x: p.x, y: p.y }) <= balance.sonar.passive.explosionRangeKm) {
        explosionHeard = true
        break
      }
    } else {
      // Payload without position (e.g. ship.sunk) → assumed audible
      // (DESIGN DECISION — documented in the file header).
      explosionHeard = true
      break
    }
  }

  // Own active ping (escorts only; SUSPICIOUS 4 s, SEARCHING 4 s, HUNTING 2 s,
  // heavy escort 2 s). On a player hit: detection +8, consecutive-hit count,
  // LKP fix with F4 bearing error (handled by updateShipLkp).
  let pingHit = false
  let pingHitRangeKm: number | null = null
  if (isEscortShip(ship, balance) && canPingState(ship.aiState)) {
    if (ctx.simTime >= srt.nextPingAt) {
      srt.nextPingAt = ctx.simTime + pingInterval(ship.aiState, rt, balance)
      const pingRange = balance.enemyAI.shipTypes[ship.shipClass]?.activePingRangeKm
      if (pingRange !== undefined) {
        const d = distKm(ship.position, player.position)
        if (d <= pingRange) {
          pingHit = true
          pingHitRangeKm = d
          srt.consecutivePingHits += 1
          srt.lastPingHitRangeKm = d
          applyDetection(ctx, balance.enemyAI.activePing.detectionGainOnPlayer)
        } else {
          srt.consecutivePingHits = 0
        }
      }
    }
  }

  return { noiseSensed, pingHeard, torpedoNearKm, explosionHeard, pingHit, pingHitRangeKm }
}

function canPingState(state: AiState): boolean {
  return state === 'SUSPICIOUS' || state === 'SEARCHING' || state === 'HUNTING'
}

function pingInterval(state: AiState, rt: AiGameRuntime, balance: SystemContext['balance']): number {
  const ap = balance.enemyAI.activePing
  if (state === 'HUNTING') return ap.huntingIntervalSeconds
  if (rt.heavyEscort) return ap.heavyEscortIntervalSeconds
  return ap.suspiciousIntervalSeconds
}

// ---------------------------------------------------------------------------
// LKP (F5)
// ---------------------------------------------------------------------------

function countPlayerManeuvers(srt: AiShipRuntime, player: SystemContext['player']): number {
  let n = 0
  if (Math.abs(angleDiffDeg(srt.lastPlayerHeadingDeg, player.headingDeg)) > MANEUVER_TURN_DEG) n += 1
  if (Math.abs(player.speedKt - srt.lastPlayerSpeedKt) > MANEUVER_SPEED_KT) n += 1
  return n
}

function updateShipLkp(ship: EnemyShip, srt: AiShipRuntime, rt: AiGameRuntime, ctx: SystemContext, sense: SenseResult): void {
  const balance = ctx.balance
  const lkpCfg = balance.enemyAI.lkp
  const player = ctx.player

  if (ship.aiState === 'NORMAL' && ship.lkp === null) {
    // Not aware yet — nothing to maintain.
    srt.nextLkpRefreshAt = ctx.simTime + lkpCfg.refreshSeconds
    srt.lastPlayerHeadingDeg = player.headingDeg
    srt.lastPlayerSpeedKt = player.speedKt
    return
  }

  const activeRange = balance.enemyAI.shipTypes[ship.shipClass]?.activePingRangeKm
  const inSensorRange =
    sense.noiseSensed ||
    (activeRange !== undefined && distKm(ship.position, player.position) <= activeRange)

  // New live decoy → one replacement roll (F5: 70 % / 20 s).
  let newDecoy: { x: number; y: number } | null = null
  for (const d of ctx.decoys) {
    if (d.ageS < balance.decoy.durationSeconds && !srt.decoyHandled.has(d.id)) {
      srt.decoyHandled.add(d.id)
      newDecoy = { x: d.position.x, y: d.position.y }
      break
    }
  }

  const maneuvers = countPlayerManeuvers(srt, player)
  srt.lastPlayerHeadingDeg = player.headingDeg
  srt.lastPlayerSpeedKt = player.speedKt

  const due = lkpRefreshDue(ctx.simTime, srt.nextLkpRefreshAt)
  if (due) srt.nextLkpRefreshAt = ctx.simTime + lkpCfg.refreshSeconds

  const decoyActive = ctx.simTime < srt.lkpDecoyUntil
  const out = updateLkp({
    lkp: ship.lkp,
    playerPos: player.position,
    inSensorRange,
    refreshDue: due,
    maneuvers,
    pingHit: sense.pingHit,
    pingRangeKm: sense.pingHitRangeKm ?? 0,
    bearingErrorDeg: balance.enemyAI.activePing.bearingErrorDeg,
    driftErrorM: lkpCfg.driftErrorM,
    driftMaxKm: lkpCfg.driftMaxKm,
    newDecoy,
    decoyReplaceChance: balance.decoy.escortReplaceChance,
    decoyActive,
    rng: ctx.forks.ai,
  })
  ship.lkp = out.lkp
  if (out.decoyActive) srt.lkpDecoyUntil = ctx.simTime + balance.decoy.durationSeconds
}

// ---------------------------------------------------------------------------
// State machine orchestration
// ---------------------------------------------------------------------------

function merchantClamp(current: AiState, next: AiState): AiState {
  // Merchants have no search/hunt behaviour (no weapons, §6.1 merchant rows):
  // SEARCHING/HUNTING fall back to staying, LOST_CONTACT maps to NORMAL
  // (they have no escort post to return to — DESIGN DECISION).
  if (next === 'SEARCHING' || next === 'HUNTING') return current
  if (next === 'LOST_CONTACT') return 'NORMAL'
  return next
}

function onEnterState(
  ship: EnemyShip,
  srt: AiShipRuntime,
  next: AiState,
  prev: AiState,
  rt: AiGameRuntime,
  ctx: SystemContext,
): void {
  const balance = ctx.balance
  const merchant = isMerchantShip(ship, balance)
  switch (next) {
    case 'SUSPICIOUS': {
      srt.suspiciousNoContactS = 0
      srt.consecutivePingHits = 0
      srt.lastPingHitRangeKm = null
      if (!merchant) {
        // Start the escort's own active ping cadence immediately.
        srt.nextPingAt = ctx.simTime
        if (ship.lkp === null) {
          ship.lkp = { x: ctx.player.position.x, y: ctx.player.position.y, errorKm: 0 }
        }
      }
      break
    }
    case 'ALERT': {
      if (!merchant && ship.lkp === null) {
        ship.lkp = { x: ctx.player.position.x, y: ctx.player.position.y, errorKm: 0 }
      }
      if (merchant) {
        // §6.1 ALERT merchant: turn 30° (direction via RNG) and speed up to
        // alertSpeedKt for MERCHANT_ALERT_SECONDS, then restore.
        srt.evadeSign = ctx.forks.ai.sign()
        srt.merchantAlertHeadingDeg = normalizeDeg(
          ship.headingDeg + srt.evadeSign * balance.enemyAI.merchant.alertTurnDeg,
        )
        srt.merchantAlertS = MERCHANT_ALERT_SECONDS
      }
      break
    }
    case 'SEARCHING': {
      srt.searchingNoContactS = 0
      srt.nextPingAt = ctx.simTime
      const kind = chooseSearchPattern(prev)
      srt.searchPattern = kind
      const cfg = searchPatternsConfig(balance)
      if (kind === 'circular') {
        srt.circular = initialCircularState(cfg)
      } else if (kind === 'zigzag') {
        srt.zigzag = initialZigzagState(rt.fleetHeadingDeg)
      } else {
        srt.expanding = initialExpandingState(cfg)
      }
      break
    }
    case 'HUNTING': {
      srt.huntingBelow40S = 0
      srt.dcNextDropAt = 0
      srt.dcRoundCount = 0
      srt.nextPingAt = ctx.simTime
      break
    }
    case 'LOST_CONTACT': {
      srt.lostContactAtPostS = 0
      break
    }
    case 'NORMAL': {
      srt.patrolPhaseRad = 0
      break
    }
  }
}

function updateStateTimers(ship: EnemyShip, srt: AiShipRuntime, rt: AiGameRuntime, ctx: SystemContext, sense: SenseResult): void {
  const dt = ctx.dt
  const contact = sense.noiseSensed || sense.pingHeard || sense.pingHit
  switch (ship.aiState) {
    case 'SUSPICIOUS':
      srt.suspiciousNoContactS = contact ? 0 : srt.suspiciousNoContactS + dt
      break
    case 'SEARCHING':
      srt.searchingNoContactS = contact ? 0 : srt.searchingNoContactS + dt
      break
    case 'HUNTING':
      srt.huntingBelow40S =
        ctx.player.detection < HUNTING_DEGRADE_BELOW ? srt.huntingBelow40S + dt : 0
      break
    case 'LOST_CONTACT': {
      const post = srt.post ?? rt.anchor
      const atPost =
        post !== null && distKm(ship.position, post) <= ctx.balance.enemyAI.escort.patrolRadiusKm
      srt.lostContactAtPostS = atPost ? srt.lostContactAtPostS + dt : 0
      break
    }
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Sunk handling
// ---------------------------------------------------------------------------

function maybeEmitSunk(ship: EnemyShip, rt: AiGameRuntime, ctx: SystemContext): void {
  let srt = rt.ships.get(ship.id)
  if (srt === undefined) {
    // A ship can enter the tick already sunk (no runtime was ever created) —
    // create one so the event fires exactly once.
    srt = createShipRuntime(rt.slots.get(ship.id) ?? null)
    rt.ships.set(ship.id, srt)
  }
  if (ship.hull <= 0 && !srt.sunkEmitted) {
    srt.sunkEmitted = true
    ctx.bus.emit('ship.sunk', { shipId: ship.id, shipClass: ship.shipClass })
  }
}

function isTorpedoTargeting(ship: EnemyShip, torpedoes: SystemContext['torpedoes']): boolean {
  for (const t of torpedoes) {
    if (t.state === 'RUNNING' && t.targetShipId === ship.id) return true
  }
  return false
}

function convoyMateSunk(ownId: string, sunkIds: ReadonlySet<string>): boolean {
  for (const id of sunkIds) if (id !== ownId) return true
  return false
}

// ---------------------------------------------------------------------------
// aiSystem
// ---------------------------------------------------------------------------

function stateTimers(srt: AiShipRuntime): AiStateTimers {
  return {
    suspiciousNoContactS: srt.suspiciousNoContactS,
    searchingNoContactS: srt.searchingNoContactS,
    huntingBelow40S: srt.huntingBelow40S,
    lostContactAtPostS: srt.lostContactAtPostS,
  }
}

function escortCtx(ctx: SystemContext, rt: AiGameRuntime): EscortTickCtx {
  return {
    dt: ctx.dt,
    simTime: ctx.simTime,
    balance: ctx.balance,
    player: ctx.player,
    torpedoes: ctx.torpedoes,
    bus: ctx.bus,
    rng: ctx.forks.ai,
    addDetection: (d) => applyDetection(ctx, d),
    emitDamage: (d) => {
      pending.damages.push(d)
    },
    heavyEscort: rt.heavyEscort,
    fleetHeadingDeg: rt.fleetHeadingDeg,
    anchor: rt.anchor,
  }
}

/**
 * Enemy AI pipeline system (pipeline position 6, GAME_ARCHITECTURE §7).
 * Matches SystemFn — the factory manager wires it into src/core/engine.ts in
 * place of the t-006 stub.
 */
export const aiSystem: SystemFn = (ctx) => {
  // Re-key the pending bridge for this game instance (combat t-007 drains it
  // right after this system returns; the buffer is never reset mid-game so an
  // unwired combat system cannot lose resolved damage between ticks).
  ensurePendingOwner(ctx)

  const rt = getGameRuntime(ctx)
  if (rt.anchor === null) initRuntime(rt, ctx)
  // initRuntime() guarantees a non-null anchor from here on.
  const anchor = rt.anchor as { x: number; y: number }

  // Advance the formation anchor along the fleet course.
  rt.anchor = advanceAnchor(anchor, rt.fleetHeadingDeg, rt.fleetSpeedKt, ctx.dt)

  // Pre-pass: which convoy merchants are already sunk this tick (drives the
  // neighbor-evade rule regardless of array order).
  rt.convoySunkIds.clear()
  for (const e of ctx.enemies) {
    if (e.hull <= 0 && e.inConvoy && isMerchantShip(e, ctx.balance)) {
      rt.convoySunkIds.add(e.id)
    }
  }

  const thresholds: AiThresholds = defaultAiThresholds(ctx.balance)

  for (const ship of ctx.enemies) {
    if (ship.hull <= 0) {
      maybeEmitSunk(ship, rt, ctx)
      continue
    }
    const srt = getShipRuntime(rt, ship, ctx)

    // 1. sense
    const sense = senseShip(ship, srt, rt, ctx)

    // 2. LKP (escorts only)
    if (isEscortShip(ship, ctx.balance)) updateShipLkp(ship, srt, rt, ctx, sense)

    // 3. state machine
    const prev = ship.aiState
    const triggers: AiTriggers = {
      noiseSensed: sense.noiseSensed,
      pingHeard: sense.pingHeard,
      detection: ctx.player.detection,
      consecutivePingHits: srt.consecutivePingHits,
      lastPingHitRangeKm: srt.lastPingHitRangeKm,
      torpedoNearKm: sense.torpedoNearKm,
      explosionHeard: sense.explosionHeard,
      huntingDisabled: srt.huntingDisabled,
      atPost:
        srt.post !== null &&
        distKm(ship.position, srt.post) <= ctx.balance.enemyAI.escort.patrolRadiusKm,
    }
    const result = evaluateAiState(prev, triggers, stateTimers(srt), thresholds)
    const next = isMerchantShip(ship, ctx.balance) ? merchantClamp(prev, result.next) : result.next
    if (next !== prev) {
      onEnterState(ship, srt, next, prev, rt, ctx)
      ship.aiState = next
    }

    // 4. timers + behavior
    updateStateTimers(ship, srt, rt, ctx, sense)

    if (isEscortShip(ship, ctx.balance)) {
      runEscortTick(ship, srt, escortCtx(ctx, rt))
      // Depth-charge exhaustion disables HUNTING forever (§6.1).
      if (ship.depthChargesLeft <= 0) srt.huntingDisabled = true
    } else {
      runMerchantBehavior({
        ship,
        rt: srt,
        anchor: rt.anchor,
        fleetHeadingDeg: rt.fleetHeadingDeg,
        fleetSpeedKt: rt.fleetSpeedKt,
        geo: rt.geo,
        balance: ctx.balance,
        dt: ctx.dt,
        torpedoTargeted: isTorpedoTargeting(ship, ctx.torpedoes),
        convoyMateSunk: convoyMateSunk(ship.id, rt.convoySunkIds),
        rng: ctx.forks.ai,
      })
      // §6.1: merchant ALERT behaviour lasts 60 s, then restores to NORMAL.
      if (ship.aiState === 'ALERT' && srt.merchantAlertS <= 0) {
        ship.aiState = 'NORMAL'
        srt.merchantAlertHeadingDeg = null
      }
    }

    // 5. publish + sunk
    maybeEmitSunk(ship, rt, ctx)
    ship.activePingCooldown = Math.max(0, srt.nextPingAt - ctx.simTime)
  }
}
