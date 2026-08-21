/**
 * SILENT DEPTH — decoy entity (src/gameplay/decoy.ts)
 *
 * FR-12 / GAME_DESIGN §8.2: acoustic decoy — fixed position, high noise,
 * short lifetime. Consumed by the submarine system (t-004) and later by the
 * enemy AI (t-006, LKP replacement chance) and combat/detection (t-007).
 *
 * Decoy fields (GAME_ARCHITECTURE §6): { id, position, ageS, noise }.
 * - lifetime: balance.decoy.durationSeconds (20 s)
 * - noise:    balance.decoy.noiseLevel (90), fixed
 * - position: fixed at launch — decoys do not move
 *
 * Task: t-004 player submarine (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references; deterministic (no RNG).
 */

import type { BalanceConfig } from '../core/balance'
import type { Decoy } from '../core/types'

/**
 * Create a decoy at a fixed position. All values come from the balance config
 * (single source of numbers, ADR-002) — nothing hardcoded.
 */
export function createDecoy(id: string, x: number, y: number, balance: BalanceConfig): Decoy {
  return {
    id,
    position: { x, y },
    ageS: 0,
    noise: balance.decoy.noiseLevel,
  }
}

/**
 * Age all decoys by `dt` seconds and remove expired ones (age >= duration).
 * Mutates the array in place (it is the engine's live ctx.decoys list).
 *
 * DESIGN DECISION: decoy expiry emits no event — the event catalogue (§14)
 * has no decoy.expired entry; the UI observes removal via the snapshot.
 */
export function updateDecoys(decoys: Decoy[], dt: number, balance: BalanceConfig): void {
  const maxAge = balance.decoy.durationSeconds
  for (let i = decoys.length - 1; i >= 0; i--) {
    const decoy = decoys[i]
    if (decoy === undefined) continue
    decoy.ageS += dt
    if (decoy.ageS >= maxAge) decoys.splice(i, 1)
  }
}
