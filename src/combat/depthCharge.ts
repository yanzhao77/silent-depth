/**
 * SILENT DEPTH — depth-charge detonation tiers (src/combat/depthCharge.ts)
 *
 * GAME_DESIGN §7.5 / B6 + balance.weapons.depthCharge: distance→damage tiers
 * (direct 35 ≤ 40 m · near 20 ≤ 120 m · far 10 ≤ 250 m · none beyond) with the
 * Deep-layer vulnerability factor (dcDamageFactor ×1.5, B2).
 *
 * This is the authoritative tier helper. The AI system (src/ai/escort.ts) has
 * an equivalent inline computation (it resolves detonations and hands the
 * resolved damage to combat through the pending bridge) — combat cannot
 * refactor that module (t-006 ownership); this export keeps the logic single-
 * sourced for tests and future consolidation.
 *
 * Task: t-007 combat (gameplay-engineer).
 *
 * @pure — zero DOM; deterministic (no RNG).
 */

import type { BalanceConfig } from '../core/balance'
import type { DepthLayer } from '../core/types'

/**
 * Resolve depth-charge damage for a detonation at `distM` against the player
 * at `depthLayer`. Returns whole damage points (rounds after the layer
 * factor — mirrors the AI's resolution so both paths agree).
 */
export function depthChargeDamage(distM: number, depthLayer: DepthLayer, balance: BalanceConfig): number {
  const wc = balance.weapons.depthCharge
  let dmg = 0
  if (distM <= wc.directM) {
    dmg = wc.directDamage
  } else if (distM <= wc.nearM) {
    dmg = wc.nearMissDamage
  } else if (distM <= wc.farM) {
    dmg = wc.farDamage
  }
  dmg *= balance.depthLayers[depthLayer].dcDamageFactor
  return Math.round(dmg)
}
