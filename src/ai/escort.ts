/**
 * SILENT DEPTH — escort behaviour + attacks (src/ai/escort.ts)
 *
 * FR-09/FR-10, GAME_DESIGN §6.1–§6.4 + §7.5/B6. Per-state escort behaviour:
 *
 *   NORMAL     figure-8 patrol (radius patrolRadiusKm, offsetM behind the
 *              formation anchor, physical phase advance so ground speed ≈
 *              patrol speed — the design's "period 90 s" and "radius 1 km at
 *              20 kt" are mutually inconsistent: a 1 km figure-8 at 20 kt
 *              takes ~8 min. DESIGN DECISION: keep the radius + speed, honour
 *              the period only nominally).
 *   SUSPICIOUS turn toward the contact/LKP at min(attack, 22 kt) (§6.1: 22).
 *   ALERT      full attack speed toward the LKP (§6.1: 26 kt).
 *   SEARCHING  search pattern around the LKP (§6.4, 20 kt).
 *   HUNTING    converge on the LKP; depth-charge volleys (perRound 6 /
 *              volleyInterval 3 s / roundInterval 20 s, perMission 20 ammo;
 *              exhaustion → SEARCHING forever, see aiState.ts).
 *   LOST_CONTACT return to the escort post at 20 kt.
 *
 * Attacks (B6/§7.5):
 *   - depth charges: dropped at the ship's position once within
 *     DC_DROP_RANGE_KM of the LKP; detonate immediately against the player
 *     (direct ≤40 m 35 / near ≤120 m 20 / far ≤250 m 10, ×dcDamageFactor of
 *     the player's depth layer). The AI emits depthCharge.dropped /
 *     depthCharge.detonated and hands the resolved damage to combat (t-007)
 *     through the pending-damage bridge.
 *   - deck gun: player Surface/Periscope within deckGun.rangeKm; hit chance
 *     linear 60 % @0.5 km → 10 % @2 km; damage 8–15; DECK_GUN_COOLDOWN_S
 *     between shots (DESIGN DECISION — no balance cadence entry).
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; RNG injected; no module state.
 */

import type { BalanceConfig } from '../core/balance'
import type { EnemyShip, SubmarineState, Torpedo } from '../core/types'
import type { EventBus } from '../core/eventBus'
import type { Rng } from '../core/rng'
import {
  ENEMY_ACCEL_KT_PER_S,
  ENEMY_TURN_RATE_DEG_S,
  KT_TO_KM_S,
  LOST_CONTACT_SPEED_KT,
  SUSPICIOUS_SPEED_CAP_KT,
  clamp,
  distKm,
  moveShip,
  shipSpeeds,
  steerTo,
} from './ship'
import type { AiShipRuntime, PendingDamage } from './ship'
import {
  chooseSearchPattern,
  initialCircularState,
  initialExpandingState,
  initialZigzagState,
  searchPatternsConfig,
  stepCircular,
  stepExpanding,
  stepZigzag,
} from './search'

/** Drop range: the escort must be within this distance of the LKP to drop. */
export const DC_DROP_RANGE_KM = 0.5
/** Deck-gun cooldown between shots (seconds) — DESIGN DECISION. */
export const DECK_GUN_COOLDOWN_S = 5
/** States in which an escort will fire the deck gun (aware states). */
export const DECK_GUN_STATES = ['SUSPICIOUS', 'ALERT', 'SEARCHING', 'HUNTING'] as const

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Escort patrol post: offsetM behind the formation anchor along its heading. */
export function escortPost(
  anchor: { x: number; y: number },
  offsetM: number,
  fleetHeadingDeg: number,
): { x: number; y: number } {
  const h = (fleetHeadingDeg * Math.PI) / 180
  return {
    x: anchor.x - Math.cos(h) * (offsetM / 1000),
    y: anchor.y - Math.sin(h) * (offsetM / 1000),
  }
}

/**
 * Point on a Gerono lemniscate (figure-8) centred on `post`: extent ±r along
 * x, ±r/2 along y. Phase 0 → 2π is one full figure-8 loop.
 */
export function figure8Point(post: { x: number; y: number }, radiusKm: number, phaseRad: number): { x: number; y: number } {
  return {
    x: post.x + radiusKm * Math.sin(phaseRad),
    y: post.y + (radiusKm * Math.sin(2 * phaseRad)) / 2,
  }
}

/** |d(point)/d(phase)| for the Gerono lemniscate (km/rad). */
export function figure8ArcDerivative(radiusKm: number, phaseRad: number): number {
  const c1 = Math.cos(phaseRad)
  const c2 = Math.cos(2 * phaseRad)
  return radiusKm * Math.sqrt(c1 * c1 + c2 * c2)
}

// ---------------------------------------------------------------------------
// Escort tick
// ---------------------------------------------------------------------------

export interface EscortTickCtx {
  dt: number
  simTime: number
  balance: BalanceConfig
  player: SubmarineState
  torpedoes: Torpedo[]
  bus: EventBus
  rng: Rng
  /** Apply a detection-meter delta to the player (clamped by the caller). */
  addDetection: (delta: number) => void
  /** Hand a resolved damage to combat (t-007) via the pending bridge. */
  emitDamage: (damage: PendingDamage) => void
  /** ≥2 escorts in the fleet → heavy escort ping cadence (2 s). */
  heavyEscort: boolean
  fleetHeadingDeg: number
  anchor: { x: number; y: number } | null
}

/**
 * One escort tick: movement per aiState, then attacks (depth charges + deck
 * gun). Mutates the ship's public view and the per-ship runtime.
 */
export function runEscortTick(ship: EnemyShip, rt: AiShipRuntime, ctx: EscortTickCtx): void {
  const { balance } = ctx
  const speeds = shipSpeeds(ship, balance)
  const opts = { turnRateDegPerS: ENEMY_TURN_RATE_DEG_S.escort, accelKtPerS: ENEMY_ACCEL_KT_PER_S }
  const escortCfg = balance.enemyAI.escort
  const lkp = ship.lkp

  // The patrol post tracks the (moving) formation anchor.
  if (ctx.anchor !== null) {
    rt.post = escortPost(ctx.anchor, escortCfg.offsetM, ctx.fleetHeadingDeg)
  }

  switch (ship.aiState) {
    case 'NORMAL': {
      // Figure-8 patrol around the post; physical phase advance keeps the
      // ground speed ≈ patrol speed (see header DESIGN DECISION).
      const radius = escortCfg.patrolRadiusKm
      const arc = figure8ArcDerivative(radius, rt.patrolPhaseRad)
      const speedKmPerS = speeds.patrolKt * KT_TO_KM_S
      rt.patrolPhaseRad = (rt.patrolPhaseRad + (speedKmPerS * ctx.dt) / Math.max(0.001, arc)) % (2 * Math.PI)
      const post = rt.post ?? ctx.anchor ?? ship.position
      const target = figure8Point(post, radius, rt.patrolPhaseRad)
      steerTo(ship, target.x, target.y, speeds.patrolKt, ctx.dt, opts)
      break
    }
    case 'SUSPICIOUS': {
      // Turn toward the contact (LKP) at the §6.1 suspicious speed.
      const target = lkp ?? rt.post ?? ctx.anchor ?? ship.position
      steerTo(ship, target.x, target.y, Math.min(speeds.attackKt, SUSPICIOUS_SPEED_CAP_KT), ctx.dt, opts)
      break
    }
    case 'ALERT': {
      // Full attack speed toward the LKP.
      const target = lkp ?? rt.post ?? ctx.anchor ?? ship.position
      steerTo(ship, target.x, target.y, speeds.attackKt, ctx.dt, opts)
      break
    }
    case 'SEARCHING': {
      runSearching(ship, rt, ctx, opts)
      break
    }
    case 'HUNTING': {
      // Converge on the LKP; once close, hold station (slow) and drop.
      if (lkp !== null && distKm(ship.position, lkp) > DC_DROP_RANGE_KM) {
        steerTo(ship, lkp.x, lkp.y, speeds.attackKt, ctx.dt, opts)
      } else {
        moveShip(ship, ship.headingDeg, speeds.patrolKt, ctx.dt, opts)
      }
      break
    }
    case 'LOST_CONTACT': {
      const post = rt.post ?? ctx.anchor ?? ship.position
      steerTo(ship, post.x, post.y, LOST_CONTACT_SPEED_KT, ctx.dt, opts)
      break
    }
  }

  runEscortAttacks(ship, rt, ctx)
}

/** SEARCHING movement: advance the active search pattern around the LKP. */
function runSearching(
  ship: EnemyShip,
  rt: AiShipRuntime,
  ctx: EscortTickCtx,
  opts: { turnRateDegPerS: number; accelKtPerS: number },
): void {
  const { balance } = ctx
  const cfg = searchPatternsConfig(balance)
  const center = ship.lkp ?? rt.post ?? ctx.anchor ?? ship.position
  const kind = rt.searchPattern ?? chooseSearchPattern(null)
  // All three patterns run at the circular pattern speed (§6.4: 20 kt).
  const speedKt = cfg.circular.speedKt

  if (kind === 'circular') {
    const step = stepCircular(center, rt.circular, speedKt, ctx.dt, cfg.circular)
    rt.circular = step.next
    steerTo(ship, step.point.x, step.point.y, speedKt, ctx.dt, opts)
    return
  }
  if (kind === 'zigzag') {
    const step = stepZigzag(center, rt.zigzag, speedKt, ctx.dt, cfg.zigzag)
    rt.zigzag = step.next
    steerTo(ship, step.point.x, step.point.y, speedKt, ctx.dt, opts)
    return
  }
  const step = stepExpanding(center, rt.expanding, speedKt, ctx.dt, cfg.expanding)
  rt.expanding = step.next
  steerTo(ship, step.point.x, step.point.y, speedKt, ctx.dt, opts)
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

/** One escort attack tick: depth-charge volleys (HUNTING) + deck gun. */
export function runEscortAttacks(ship: EnemyShip, rt: AiShipRuntime, ctx: EscortTickCtx): void {
  runDepthCharges(ship, rt, ctx)
  runDeckGun(ship, rt, ctx)
}

/**
 * HUNTING depth-charge volleys: perRound 6 charges, one every volleyInterval
 * 3 s while within DC_DROP_RANGE_KM of the LKP; after a full round wait
 * roundInterval 20 s. perMission 20 ammo; exhaustion disables HUNTING forever
 * (the state machine degrades to SEARCHING — aiState.ts).
 */
function runDepthCharges(ship: EnemyShip, rt: AiShipRuntime, ctx: EscortTickCtx): void {
  const dc = ctx.balance.enemyAI.depthCharges
  if (ship.aiState !== 'HUNTING') return
  const lkp = ship.lkp
  if (lkp === null || distKm(ship.position, lkp) > DC_DROP_RANGE_KM) return
  if (ship.depthChargesLeft <= 0) return

  if (ctx.simTime < rt.dcNextDropAt) return
  if (rt.dcRoundCount >= dc.perRound && ctx.simTime < rt.dcNextRoundAt) return
  if (rt.dcRoundCount >= dc.perRound) {
    // New round may begin.
    rt.dcRoundCount = 0
    rt.dcNextDropAt = ctx.simTime
  }

  dropDepthCharge(ship, ctx)

  ship.depthChargesLeft = Math.max(0, ship.depthChargesLeft - 1)
  rt.dcRoundCount += 1
  rt.dcNextDropAt = ctx.simTime + dc.volleyIntervalSeconds
  if (rt.dcRoundCount >= dc.perRound) {
    rt.dcNextRoundAt = ctx.simTime + dc.roundIntervalSeconds
  }
}

/** Drop one charge at the ship's position and resolve the detonation. */
function dropDepthCharge(ship: EnemyShip, ctx: EscortTickCtx): void {
  const { balance } = ctx
  const wc = balance.weapons.depthCharge
  const x = ship.position.x
  const y = ship.position.y
  ctx.bus.emit('depthCharge.dropped', { shipId: ship.id, x, y })

  const distM = distKm({ x, y }, ctx.player.position) * 1000
  let dmg = 0
  let detectionDelta = 0
  if (distM <= wc.directM) {
    dmg = wc.directDamage
    detectionDelta = balance.detection.sources.depthChargeHit
  } else if (distM <= wc.nearM) {
    dmg = wc.nearMissDamage
    detectionDelta = balance.detection.sources.depthChargeNearMiss
  } else if (distM <= wc.farM) {
    dmg = wc.farDamage
  }
  dmg *= balance.depthLayers[ctx.player.depthLayer].dcDamageFactor
  dmg = Math.round(dmg)

  ctx.bus.emit('depthCharge.detonated', { shipId: ship.id, x, y, distM: Math.round(distM), dmg })
  if (dmg > 0) {
    ctx.emitDamage({ shipId: ship.id, source: 'depthCharge', amount: dmg, distM: Math.round(distM), hit: distM <= wc.nearM })
  }
  if (detectionDelta > 0) ctx.addDetection(detectionDelta)
}

/** Deck gun: Surface/Periscope player within range, aware states only. */
function runDeckGun(ship: EnemyShip, rt: AiShipRuntime, ctx: EscortTickCtx): void {
  const { balance } = ctx
  const cfg = balance.weapons.deckGun
  const attacks = balance.enemyAI.shipTypes[ship.shipClass]?.attack ?? []
  if (!attacks.includes('deckGun')) return
  if (!(DECK_GUN_STATES as readonly string[]).includes(ship.aiState)) return
  if (!cfg.targets.includes(ctx.player.depthLayer)) return
  if (ctx.simTime < rt.nextDeckGunAt) return

  const distM = distKm(ship.position, ctx.player.position) * 1000
  const rangeM = cfg.rangeKm * 1000
  if (distM > rangeM) return

  rt.nextDeckGunAt = ctx.simTime + DECK_GUN_COOLDOWN_S
  const t = clamp((distM - 500) / (rangeM - 500), 0, 1)
  const hitChance = cfg.hitChanceAt0_5km + t * (cfg.hitChanceAt2km - cfg.hitChanceAt0_5km)
  const hit = ctx.rng.chance(hitChance)
  const amount = hit ? ctx.rng.int(cfg.damageMin, cfg.damageMax) : 0

  ctx.bus.emit('deckGun.fired', { shipId: ship.id, distM: Math.round(distM), hit })
  if (hit) {
    ctx.emitDamage({ shipId: ship.id, source: 'deckGun', amount, distM: Math.round(distM), hit: true })
    ctx.addDetection(balance.detection.sources.deckGunHit)
  }
}
