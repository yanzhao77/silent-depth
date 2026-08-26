/**
 * SILENT DEPTH — contact classification voting (src/sonar/classification.ts)
 *
 * FR-08 / GAME_DESIGN §5.5. Progressive chain
 * `Unknown → LargeSurface → type (e.g. Merchant 72%) → Confirmed type`.
 * Votes come from observable features — speed estimate (when the track has
 * one), the measured noise signature, and the echo/signal strength (size
 * prior) — weighted against balance.sonar.classification.types
 * (speedRangeKt / noiseRange / surfaceOnly).
 *
 * DESIGN DECISIONS:
 *   - Noise measurement: the sim has no per-enemy noise field, so the sonar
 *     "measures" the noise signature from the TRUE class profile's noiseRange
 *     midpoint ± jitter (seeded RNG). This is a game abstraction: the
 *     signature leans toward the true class without being perfect.
 *   - Speed fit uses the Gaussian distance to the band midpoint (band
 *     memberships overlap — Merchant/Cargo are genuinely ambiguous); noise
 *     fit likewise. Signal strength acts as a size prior (large merchant
 *     classes prefer Strong echoes, escorts Medium, submarines Weak).
 *   - A vote below UNKNOWN_VOTE_THRESHOLD names no type (the ping return
 *     shows "TYPE UNKNOWN CONFIDENCE n%" — GAME_DESIGN §5.1 example).
 *     classifyConfidence ratchets up over observations and the type LOCKS at
 *     balance.sonar.classification.lockTypeConfidence (60).
 *   - v1 has no enemy submarines; the Submarine pool entry is
 *     future-proofing (GAME_DESIGN §5.5 "ESTIMATED"). surfaceOnly is not
 *     observable by sonar — all v1 contacts are surface, so it plays no role
 *     in the vote (documented simplification).
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; RNG injected; no module state.
 */

import type { BalanceConfig } from '../core/balance';
import type { ShipClass } from '../core/types';
import type { Rng } from '../core/rng';

/**
 * Echo strength (types.ts Contact.signalStrength is the inline union
 * 'Strong' | 'Medium' | 'Weak' — declared here for shared use).
 */
export type SignalStrength = 'Strong' | 'Medium' | 'Weak';

/** Below this top-vote share the contact stays "Unknown" (§5.1 example). */
export const UNKNOWN_VOTE_THRESHOLD = 0.4;

/** Large merchant classes (big engines → Strong echo / engine noise). */
export const LARGE_SURFACE_CLASSES: ReadonlySet<ShipClass> = new Set([
  'Merchant',
  'Cargo',
  'Tanker',
]);

export function isLargeSurfaceClass(cls: ShipClass): boolean {
  return LARGE_SURFACE_CLASSES.has(cls);
}

export function isEscortClass(cls: ShipClass): boolean {
  return cls === 'Destroyer' || cls === 'Frigate';
}

// ---------------------------------------------------------------------------
// Signal strength
// ---------------------------------------------------------------------------

/**
 * Signal strength for a PASSIVE contact (no range): class-based size reading
 * (§5.2: merchant engines Strong, escort propellers Medium, submarines Weak).
 */
export function passiveSignalForClass(shipClass: ShipClass): SignalStrength {
  if (isLargeSurfaceClass(shipClass)) return 'Strong';
  if (isEscortClass(shipClass)) return 'Medium';
  return 'Weak';
}

/**
 * Signal strength for a PING return: range bands from balance.sonar
 * .signalStrength (Strong <3 km / Medium 3–7 km / Weak 7–10 km), overridden
 * by size (§5.1: "Strong (< 3 km 或大型目标)", "Weak (…或小型目标)").
 */
export function pingSignalFor(
  distanceKm: number,
  shipClass: ShipClass,
  balance: BalanceConfig,
): SignalStrength {
  const ss = balance.sonar.signalStrength;
  if (isLargeSurfaceClass(shipClass)) return 'Strong';
  if (shipClass === 'Submarine') return 'Weak';
  if (distanceKm < ss.strongMaxKm) return 'Strong';
  if (distanceKm < ss.mediumMaxKm) return 'Medium';
  return 'Weak';
}

// ---------------------------------------------------------------------------
// Noise signature measurement
// ---------------------------------------------------------------------------

/**
 * Measure the noise signature of a ship: midpoint of the class noiseRange ±
 * jitter (~80 % of the half-width, seeded RNG). The measurement is a game
 * abstraction of the acoustic spectrum (§5.5 "噪声特征").
 */
export function observedNoiseForClass(
  shipClass: ShipClass,
  balance: BalanceConfig,
  rng: Rng,
): number {
  const t = balance.sonar.classification.types[shipClass];
  if (t === undefined) return 50;
  const lo = t.noiseRange[0] ?? 0;
  const hi = t.noiseRange[1] ?? 100;
  const mid = (lo + hi) / 2;
  const halfWidth = Math.max(1, (hi - lo) / 2);
  return mid + (rng.next() * 2 - 1) * halfWidth * 0.8;
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

export interface ObservedFeatures {
  /** Speed estimate (kt) — null until the track has one (SUSPECTED+). */
  speedEstimateKt: number | null;
  /** Measured noise signature (0..100). */
  noise: number;
  /** Echo strength (ping) or size reading (passive) — null if unknown. */
  signal: SignalStrength | null;
}

export interface ClassificationVote {
  /** Top voted type (always a ShipClass from the pool). */
  type: ShipClass;
  /** 0..100 top-vote share — below UNKNOWN_VOTE_THRESHOLD the type is not named. */
  confidence: number;
  scores: Record<string, number>;
}

/** Gaussian band fit: 1 at the midpoint, exp(−(d/width)²) outside. */
function bandFit(value: number, band: readonly [number, number]): number {
  const lo = band[0] ?? 0;
  const hi = band[1] ?? lo;
  const width = Math.max(0.5, hi - lo);
  const mid = (lo + hi) / 2;
  const d = Math.abs(value - mid);
  return Math.exp(-Math.pow(d / width, 2));
}

/** Size prior by signal strength (DESIGN DECISION — see header). */
function signalPrior(signal: SignalStrength, cls: ShipClass): number {
  if (isLargeSurfaceClass(cls)) {
    return signal === 'Strong' ? 1.25 : signal === 'Medium' ? 0.9 : 0.6;
  }
  if (isEscortClass(cls)) {
    return signal === 'Strong' ? 1.05 : signal === 'Medium' ? 1.1 : 0.9;
  }
  return signal === 'Weak' ? 1.2 : signal === 'Medium' ? 0.7 : 0.5;
}

/**
 * Run the classification vote over the type pool. Returns the top-voted type
 * and its share (confidence); the caller decides whether the share is high
 * enough to NAME the type (UNKNOWN_VOTE_THRESHOLD) or LOCK it
 * (balance.sonar.classification.lockTypeConfidence).
 */
export function voteClassification(
  features: ObservedFeatures,
  balance: BalanceConfig,
): ClassificationVote {
  const types = balance.sonar.classification.types;
  const scores: Record<string, number> = {};
  let total = 0;
  for (const cls of Object.keys(types)) {
    const t = types[cls];
    if (t === undefined) continue;
    let score = 1;
    if (features.speedEstimateKt !== null) {
      score *= bandFit(features.speedEstimateKt, t.speedRangeKt);
    }
    score *= bandFit(features.noise, t.noiseRange);
    if (features.signal !== null) score *= signalPrior(features.signal, cls as ShipClass);
    scores[cls] = score;
    total += score;
  }
  let top: ShipClass = 'Merchant';
  let topScore = -1;
  for (const cls of Object.keys(scores)) {
    const s = scores[cls] ?? 0;
    if (s > topScore) {
      topScore = s;
      top = cls as ShipClass;
    }
  }
  const confidence = total > 0 ? Math.round((100 * topScore) / total) : 0;
  return { type: top, confidence, scores };
}
