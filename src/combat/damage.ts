/**
 * SILENT DEPTH — damage application (src/combat/damage.ts)
 *
 * GAME_DESIGN §7.5 / §8.1:
 *  - torpedo damage to enemy ships (hull −= roll; ship.sunk at ≤ 0) —
 *    uses the AI's applyDamage helper (same clamp/edge semantics).
 *  - player-facing intake: depth-charge / deck-gun damage resolved by the AI
 *    system is drained here once per tick (drainAiPendingDamage) and applied
 *    through applyHullDamage(ctx, source, amount) from src/gameplay/submarine.
 *  - collisions: player sub within COLLISION_DIST_KM of a ship while moving →
 *    balance.hull.collisionDamageMin..Max roll via ctx.forks.combat, gated by
 *    a per-game cooldown.
 *
 * DESIGN DECISIONS:
 *  - ship.sunk is emitted by combat at the exact tick a torpedo drives hull
 *    to 0 (source-of-truth event). The AI's maybeEmitSunk may re-emit on the
 *    following tick for the same ship — the event is consumed idempotently
 *    (AI explosion lookback is boolean; objectives derive sunk from hull;
 *    audio replays the explosion). Known cosmetic interaction, documented.
 *  - Collision distance and cooldown are now in balance.json (t-015 migration);
 *    read via `balance.hull.collisionDistKm` and `balance.hull.collisionCooldownS`.
 *  - A collision only damages the player (ship collision damage is out of
 *    scope — GAME_DESIGN only specifies the player-side 10–25).
 *  - Per-game collision state lives in a WeakMap keyed on the live
 *    ctx.player reference (same pattern as src/ai/ai.ts) — no cross-game
 *    leakage, no module-level mutable game state.
 *
 * Task: t-007 combat (gameplay-engineer).
 *
 * @pure — zero DOM; deterministic (RNG only via ctx.forks.combat).
 */

import type { SystemContext } from '../core/engine'
import type { EnemyShip } from '../core/types'
import { applyHullDamage } from '../gameplay/submarine'
import { distKm } from '../sonar/contacts'
import { applyDamage } from '../ai/ship'
import { drainAiPendingDamage } from '../ai/ai'

/** Player-ship collision radius (km) — now in balance.hull.collisionDistKm (t-015). */
export const COLLISION_DIST_KM = 0.05
/** Minimum seconds between two collision damage events — now in balance.hull.collisionCooldownS (t-015). */
export const COLLISION_COOLDOWN_S = 5

interface CollisionRuntime {
  nextCollisionAt: number
}

const collisionRuntimes = new WeakMap<object, CollisionRuntime>()

function getCollisionRuntime(ctx: SystemContext): CollisionRuntime {
  let rt = collisionRuntimes.get(ctx.player)
  if (rt === undefined) {
    rt = { nextCollisionAt: 0 }
    collisionRuntimes.set(ctx.player, rt)
  }
  return rt
}

/**
 * Drain the AI-resolved player damage (depth-charge detonations, deck-gun
 * hits) and apply it to the player hull. Called once per combat tick — the
 * buffer is snapshot-and-cleared by drainAiPendingDamage(), so nothing leaks
 * into the next tick.
 */
export function drainPendingPlayerDamage(ctx: SystemContext): void {
  const damages = drainAiPendingDamage()
  for (const damage of damages) {
    applyHullDamage(ctx, damage.source, damage.amount)
  }
}

/**
 * Apply torpedo damage to an enemy ship. Returns true when this call drove
 * the hull to 0 — the caller then knows the ship sank this tick.
 */
export function applyTorpedoDamage(ctx: SystemContext, ship: EnemyShip, amount: number): boolean {
  const sank = applyDamage(ship, amount)
  if (sank) {
    ctx.bus.emit('ship.sunk', { shipId: ship.id, shipClass: ship.shipClass })
  }
  return sank
}

/**
 * Player-ship collision check (once per tick, cooldown-gated). Roll from
 * ctx.forks.combat (deterministic, seeded).
 */
export function checkCollisions(ctx: SystemContext): void {
  const rt = getCollisionRuntime(ctx)
  if (ctx.simTime < rt.nextCollisionAt) return
  if (ctx.player.speedKt <= 0) return // not moving → no impact

  const balance = ctx.balance
  for (const ship of ctx.enemies) {
    if (ship.hull <= 0) continue
    if (distKm(ctx.player.position, ship.position) <= balance.hull.collisionDistKm) {
      const roll = ctx.forks.combat.int(balance.hull.collisionDamageMin, balance.hull.collisionDamageMax)
      applyHullDamage(ctx, 'collision', roll)
      rt.nextCollisionAt = ctx.simTime + balance.hull.collisionCooldownS
      return // one collision event per tick
    }
  }
}
