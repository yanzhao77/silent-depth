/**
 * SILENT DEPTH — passive sonar listening (src/sonar/passive.ts)
 *
 * FR-07 / GAME_DESIGN §5.2. Runs every tick BEFORE the active ping and NEVER
 * exposes the player (no detection change — the only zero-risk information
 * source):
 *
 *   - engine noise  : enemy ships within passive.engineRangeKm (5 km).
 *                     Merchant engines → source 'engine' (Strong signal),
 *                     escort propellers → 'propeller' (Medium) — §5.2.
 *   - torpedo noise : RUNNING torpedoes within passive.torpedoRangeKm
 *                     (10 km) → source 'torpedo' (gated to one event per
 *                     torpedo per TORPEDO_PASSIVE_INTERVAL_S).
 *   - explosions    : explosion events from the event-log tail within
 *                     passive.explosionRangeKm (15 km) → source 'explosion'
 *                     (each event handled once — dedup by event id).
 *
 * Passive returns bearing ONLY (±3° converging to ±1° over 30 s —
 * uncertainty.ts) — never range (passive.rangeNeverGiven). Contacts are
 * updated every tick for smooth tracking, but OBSERVATIONS (confidence +15,
 * promotion counters, sonar.passive events) are gated to one per contact per
 * PASSIVE_OBS_INTERVAL_S.
 *
 * DESIGN DECISIONS:
 *   - PASSIVE_OBS_INTERVAL_S = 3 s: the design has no observation cadence;
 *     3 s keeps the +15/obs confidence curve and the "2 passive obs →
 *     SUSPECTED" promotion at a game-friendly pace.
 *   - TORPEDO_PASSIVE_INTERVAL_S = 5 s / EXPLOSION_LOOKBACK_S = 2 s:
 *     event-log gating constants (matches the ai module's lookback).
 *   - A passive track that went silent for longer than bearingConvergeSeconds
 *     restarts its bearing convergence on re-acquisition.
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; randomness only from
 * ctx.forks.sonar (ADR-004).
 */

import type { SystemContext } from '../core/engine'
import type { BalanceConfig } from '../core/balance'
import type { ShipClass } from '../core/types'
import type { SonarRuntime } from './sonar'
import {
  compassBearing,
  contactForShip,
  distKm,
  getOrCreateTrack,
  normalizeDeg,
  recordObservation,
} from './contacts'
import {
  observedNoiseForClass,
  passiveSignalForClass,
} from './classification'
import { passiveBearingErrorDeg } from './uncertainty'

/**
 * Escort = a ship with an attack kit (Destroyer / Frigate). Local copy of the
 * ai module's rule — sonar sits UPSTREAM of ai in the dependency order
 * (GAME_ARCHITECTURE §3) and must not import from src/ai.
 */
function isEscortShipClass(shipClass: ShipClass, balance: BalanceConfig): boolean {
  return balance.enemyAI.shipTypes[shipClass]?.attack !== null
}

/** Passive observation cadence per contact (s) — DESIGN DECISION. */
export const PASSIVE_OBS_INTERVAL_S = 3
/** Torpedo passive-event repeat interval (s) — DESIGN DECISION. */
export const TORPEDO_PASSIVE_INTERVAL_S = 5
/** Explosion lookback over the event-log tail (s) — matches the ai module. */
export const EXPLOSION_LOOKBACK_S = 2

const EXPLOSION_TYPES: ReadonlySet<string> = new Set(['torpedo.hit', 'depthCharge.detonated', 'ship.sunk'])

/** Run the passive listen pass (no self-exposure). */
export function runPassiveListen(ctx: SystemContext, rt: SonarRuntime): void {
  const balance = ctx.balance
  const pc = balance.sonar.passive
  const player = ctx.player

  // --- 1. enemy engine / propeller noise (5 km) ---
  for (const ship of ctx.enemies) {
    if (ship.hull <= 0) continue
    if (distKm(player.position, ship.position) > pc.engineRangeKm) continue

    const track = getOrCreateTrack(rt, ship.id)
    const trueBearing = compassBearing(player.position, ship.position)
    const signal = passiveSignalForClass(ship.shipClass)
    const elapsed = Math.max(0, ctx.simTime - track.passiveTrackStartAt)
    const errorDeg = passiveBearingErrorDeg(elapsed, balance)
    const obsDue = ctx.simTime - track.lastPassiveObsAt >= PASSIVE_OBS_INTERVAL_S
    // Bearing refresh every tick (smooth tracking within the current error).
    const bearingDeg = normalizeDeg(trueBearing + ctx.forks.sonar.range(-1, 1) * errorDeg)

    const existing = contactForShip(rt, ship.id)
    if (existing === null) {
      // First contact: a full observation (creation counts as one, §5.4:
      // 2 passive observations → SUSPECTED).
      recordObservation(ctx, rt, track, {
        ship,
        bearingDeg,
        rangeKm: null, // passive never gives range
        signal,
        noise: observedNoiseForClass(ship.shipClass, balance, ctx.forks.sonar),
        isPing: false,
        rng: ctx.forks.sonar,
      })
      track.lastPassiveObsAt = ctx.simTime // creation IS the first observation
    } else {
      // Smooth per-tick refresh — no observation bookkeeping between gates.
      existing.bearingDeg = bearingDeg
      existing.lastBearingAt = ctx.simTime
      existing.signalStrength = signal
      if (obsDue) {
        recordObservation(ctx, rt, track, {
          ship,
          bearingDeg,
          rangeKm: null,
          signal,
          noise: observedNoiseForClass(ship.shipClass, balance, ctx.forks.sonar),
          isPing: false,
          rng: ctx.forks.sonar,
        })
        // Re-acquisition after a long silence restarts bearing convergence.
        if (ctx.simTime - track.lastObservedAt > pc.bearingConvergeSeconds) {
          track.passiveTrackStartAt = ctx.simTime
        }
        track.lastPassiveObsAt = ctx.simTime
        const source = isEscortShipClass(ship.shipClass, balance) ? 'propeller' : 'engine'
        ctx.bus.emit('sonar.passive', { source, bearingDeg })
      }
    }
  }

  // --- 2. torpedo running noise (10 km, gated) ---
  for (const t of ctx.torpedoes) {
    if (t.state !== 'RUNNING') continue
    if (distKm(player.position, t.position) > pc.torpedoRangeKm) continue
    const last = rt.torpedoPassiveAt.get(t.id) ?? -1e9
    if (ctx.simTime - last >= TORPEDO_PASSIVE_INTERVAL_S) {
      rt.torpedoPassiveAt.set(t.id, ctx.simTime)
      ctx.bus.emit('sonar.passive', {
        source: 'torpedo',
        bearingDeg: compassBearing(player.position, t.position),
      })
    }
  }

  // --- 3. explosions (15 km, event-log tail, dedup) ---
  for (const ev of ctx.bus.getLog()) {
    if (!EXPLOSION_TYPES.has(ev.type)) continue
    if (rt.handledExplosions.has(ev.id)) continue
    if (ev.simTime < ctx.simTime - EXPLOSION_LOOKBACK_S) continue
    const pos = resolveExplosionPosition(ev, ctx)
    if (pos === null) continue
    if (distKm(player.position, pos) <= pc.explosionRangeKm) {
      rt.handledExplosions.add(ev.id)
      ctx.bus.emit('sonar.passive', { source: 'explosion', bearingDeg: compassBearing(player.position, pos) })
    }
  }
}

/** Resolve the world position of an explosion event (payload x/y wins). */
function resolveExplosionPosition(
  ev: { type: string; payload?: Record<string, unknown> },
  ctx: SystemContext,
): { x: number; y: number } | null {
  const p = ev.payload
  if (p !== undefined && typeof p.x === 'number' && typeof p.y === 'number') {
    return { x: p.x, y: p.y }
  }
  // Positionless events (ship.sunk / torpedo.hit): fall back to the ship's
  // last known position (sunk ships stay in ctx.enemies with their last pos).
  const shipId = typeof p?.shipId === 'string' ? p.shipId : null
  if (shipId !== null) {
    for (const ship of ctx.enemies) {
      if (ship.id === shipId) return { x: ship.position.x, y: ship.position.y }
    }
  }
  return null
}
