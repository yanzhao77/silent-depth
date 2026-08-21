/**
 * SILENT DEPTH — torpedo lifecycle + combat system (src/combat/torpedo.ts)
 *
 * GAME_DESIGN §7.1/§7.5 + balance.torpedo. Pipeline slot 7 (combat).
 *
 * Tube lifecycle (SubmarineState.torpedoTubes):
 *   LOADED → READY (fire solution computed) → FIRED (launched; v1 has no
 *   reload — tubes stay FIRED, stats.torpedoesRemaining drops).
 * Torpedo entity lifecycle (ctx.torpedoes):
 *   RUNNING → HIT | MISSED | EXPIRED, straight line, no homing (DD-04).
 *
 * Firing (inputs.fireTorpedo = contactId, normalized by the engine):
 *   - resolve contact → trueShipId → enemy ship (contact without a live ship
 *     link → torpedo.fireRejected 'noTarget');
 *   - up to salvoMax (2) LOADED/READY tubes launch on the F6 fire-solution
 *     bearing; each emits torpedo.ready then torpedo.fired;
 *   - detection += balance.detection.sources.torpedoFired (20, once per
 *     action — "出管瞬间"); stats.torpedoesFired += fired count.
 *
 * Hit resolution (deterministic geometry, seeded damage roll):
 *   - distM ≤ hitDistanceM (40 m) → HIT: damage roll = damageBase ± damageSpread
 *     via ctx.forks.combat, applyDamage to the ship (ship.sunk at hull ≤ 0),
 *     emit torpedo.hit, stats.torpedoesHit++.
 *   - The first tick the torpedo moves away from its closest approach:
 *     nearestPass ≤ nearMissDistanceM (120 m) → MISSED (near miss, emit
 *     torpedo.missed); wider passes keep flying to the range/lifetime limit.
 *   - distanceKm ≥ rangeKm (6 km) or ageS ≥ lifetimeSeconds (300 s) → EXPIRED
 *     (emit torpedo.expired). Range expires marginally before lifetime.
 *
 * DESIGN DECISIONS:
 *  - fireTorpedo is per-tick, not edge-triggered (contract: "at most one per
 *    tick"); holding the input re-requests and gets 'notReady' rejections once
 *    the tubes are spent (UI sends a single F-key request).
 *  - 'lowBattery' fire rejection is not implemented: GAME_DESIGN §4.5 only
 *    disables active sonar at low battery, not torpedoes.
 *  - Torpedoes self-noise needs no event: the AI (slot 6) and passive sonar
 *    (slot 5) read ctx.torpedoes positions directly (one tick of latency,
 *    deterministic). torpedo.hit doubles as the explosion cue.
 *  - Sunk ships stay in ctx.enemies (objectives derive sunk from hull ≤ 0);
 *    a torpedo whose target is already sunk runs to expiry (EXPIRED).
 *  - Combat runtime (next torpedo id) lives in a WeakMap keyed on the live
 *    ctx.player reference (ai.ts pattern) — no cross-game leakage.
 *
 * Task: t-007 combat (gameplay-engineer).
 *
 * @pure — zero DOM; RNG only via ctx.forks.combat (damage/collision rolls).
 */

import type { SystemContext } from '../core/engine'
import type { Contact, EnemyShip, Torpedo } from '../core/types'
import { KNOTS_TO_KM_PER_SEC } from '../gameplay/submarine'
import { distKm } from '../sonar/contacts'
import { solveFireSolution } from './fireControl'
import { applyTorpedoDamage, checkCollisions, drainPendingPlayerDamage } from './damage'

export interface CombatRuntime {
  nextTorpedoId: number
}

const combatRuntimes = new WeakMap<object, CombatRuntime>()

/** Test/manager hook into the per-game combat runtime. */
export function getCombatRuntime(ctx: SystemContext): CombatRuntime {
  let rt = combatRuntimes.get(ctx.player)
  if (rt === undefined) {
    rt = { nextTorpedoId: 1 }
    combatRuntimes.set(ctx.player, rt)
  }
  return rt
}

/** Create the torpedo entity for a fired tube (launch data from the solution). */
export function createTorpedo(
  ctx: SystemContext,
  rt: CombatRuntime,
  ship: EnemyShip,
  contact: Contact,
  bearingDeg: number,
): Torpedo {
  const balance = ctx.balance
  const torpedo: Torpedo = {
    id: `TP-${String(rt.nextTorpedoId++).padStart(2, '0')}`,
    state: 'RUNNING',
    position: { x: ctx.player.position.x, y: ctx.player.position.y },
    headingDeg: bearingDeg,
    speedKt: balance.torpedo.speedKt,
    ageS: 0,
    distanceKm: 0,
    targetShipId: ship.id,
    targetContactId: contact.id,
    firedAt: ctx.simTime,
    nearestPass: null,
  }
  ctx.torpedoes.push(torpedo)
  return torpedo
}

// ---------------------------------------------------------------------------
// Combat system (pipeline slot 7)
// ---------------------------------------------------------------------------

export const combatSystem: (ctx: SystemContext) => void = (ctx: SystemContext): void => {
  if (ctx.state !== 'MISSION_RUNNING') return
  const rt = getCombatRuntime(ctx)

  // 1. AI-resolved player damage (depth charges / deck gun) — drain & apply.
  drainPendingPlayerDamage(ctx)

  // 2. Fire control + launch (inputs.fireTorpedo).
  handleFireInput(ctx, rt)

  // 3. Torpedo movement / hit / near-miss / expiry.
  updateTorpedoes(ctx)

  // 4. Player-ship collisions.
  checkCollisions(ctx)
}

function handleFireInput(ctx: SystemContext, rt: CombatRuntime): void {
  const contactId = ctx.inputs.fireTorpedo
  if (contactId === null) return

  const balance = ctx.balance
  const reject = (reason: 'noTarget' | 'notReady'): void => {
    ctx.bus.emit('torpedo.fireRejected', { reason, contactId })
  }

  // Resolve contact → ship (the engine already rejected unknown contact ids).
  const contact = ctx.contacts.find((c) => c.id === contactId)
  if (contact === undefined) {
    reject('noTarget') // defensive — engine normalize should have caught it
    return
  }
  const ship = contact.trueShipId !== null ? ctx.enemies.find((e) => e.id === contact.trueShipId) : undefined
  if (ship === undefined || ship.hull <= 0) {
    reject('noTarget') // no live ship behind the contact (sunk / no link)
    return
  }

  // Tubes: fire up to salvoMax LOADED/READY tubes on the solved bearing.
  const tubes = ctx.player.torpedoTubes.filter((t) => t.state === 'LOADED' || t.state === 'READY')
  if (tubes.length === 0) {
    reject('notReady')
    return
  }
  const fireCount = Math.min(tubes.length, balance.torpedo.salvoMax)
  const solution = solveFireSolution(contact, ctx.player, balance)

  for (let i = 0; i < fireCount; i++) {
    const tube = tubes[i]!
    if (tube.state === 'LOADED') {
      tube.state = 'READY' // fire solution computed
      ctx.bus.emit('torpedo.ready', { tubeId: tube.id, targetContactId: contactId })
    }
    tube.state = 'FIRED'
    tube.targetContactId = contactId
    ctx.bus.emit('torpedo.fired', { tubeId: tube.id, targetContactId: contactId })
    createTorpedo(ctx, rt, ship, contact, solution.bearingDeg)
  }

  // Self-exposure: +20 detection once per fire action ("出管瞬间", §8.1).
  ctx.player.detection = clamp(ctx.player.detection + balance.detection.sources.torpedoFired, 0, 100)
  ctx.stats.torpedoesFired += fireCount
}

function updateTorpedoes(ctx: SystemContext): void {
  const balance = ctx.balance
  for (let i = ctx.torpedoes.length - 1; i >= 0; i--) {
    const torpedo = ctx.torpedoes[i]
    if (torpedo === undefined || torpedo.state !== 'RUNNING') continue

    // Straight-line movement (no homing, DD-04).
    const rad = (torpedo.headingDeg * Math.PI) / 180
    const v = torpedo.speedKt * KNOTS_TO_KM_PER_SEC
    torpedo.position.x += Math.sin(rad) * v * ctx.dt
    torpedo.position.y += Math.cos(rad) * v * ctx.dt
    torpedo.ageS += ctx.dt
    torpedo.distanceKm += v * ctx.dt

    const ship = torpedo.targetShipId !== null ? ctx.enemies.find((e) => e.id === torpedo.targetShipId) : undefined
    if (ship !== undefined && ship.hull > 0) {
      const distM = distKm(torpedo.position, ship.position) * 1000

      // Closest-approach bookkeeping.
      if (torpedo.nearestPass === null || distM < torpedo.nearestPass.distM) {
        torpedo.nearestPass = { distM, at: ctx.simTime }
      }

      // HIT: within the 40 m kill radius.
      if (distM <= balance.torpedo.hitDistanceM) {
        torpedo.state = 'HIT'
        const roll = balance.torpedo.damageBase + ctx.forks.combat.range(-balance.torpedo.damageSpread, balance.torpedo.damageSpread)
        const damage = Math.max(0, Math.round(roll))
        applyTorpedoDamage(ctx, ship, damage)
        ctx.bus.emit('torpedo.hit', { torpedoId: torpedo.id, targetShipId: ship.id, distM: Math.round(distM) })
        ctx.stats.torpedoesHit += 1
        ctx.torpedoes.splice(i, 1)
        continue
      }

      // Passed the closest point and never got closer than 40 m: near miss
      // (40–120 m) or a wide pass that keeps flying to expiry (> 120 m).
      if (torpedo.nearestPass !== null && distM > torpedo.nearestPass.distM + 1e-9) {
        if (torpedo.nearestPass.distM <= balance.torpedo.nearMissDistanceM) {
          torpedo.state = 'MISSED'
          ctx.bus.emit('torpedo.missed', { torpedoId: torpedo.id, targetShipId: ship.id, distM: Math.round(torpedo.nearestPass.distM) })
          ctx.torpedoes.splice(i, 1)
          continue
        }
        // nearest pass > 120 m: can no longer hit — run to expiry.
      }
    }

    // Range / lifetime expiry (6 km / 300 s).
    if (torpedo.distanceKm >= balance.torpedo.rangeKm || torpedo.ageS >= balance.torpedo.lifetimeSeconds) {
      torpedo.state = 'EXPIRED'
      ctx.bus.emit('torpedo.expired', { torpedoId: torpedo.id, targetShipId: torpedo.targetShipId })
      ctx.torpedoes.splice(i, 1)
      continue
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
