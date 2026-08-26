/**
 * SILENT DEPTH — sonar uncertainty model (src/sonar/uncertainty.ts)
 *
 * FR-06 / GAME_DESIGN §5.3. Pure error/convergence functions — all numbers
 * come from balance.sonar (active/passive/contact), with a few documented
 * design constants where the design doc has no balance entry.
 *
 *   - Ping range error : ±rangeErrorPctStart (10 %) on the first ping hit,
 *     ×rangeErrorPctPerPingFactor (0.8) per further ping → 10 % → 8 % →
 *     6.4 % …
 *   - Ping bearing error: ±bearingErrorDeg (0.5°) on the first hit,
 *     ×bearingErrorPerPingFactor (0.7) per further ping.
 *   - Passive bearing   : ±3° at first contact, converging to ±1° over
 *     bearingConvergeSeconds (30 s). GAME_DESIGN §5.3 phrases this as
 *     "×0.9 per 10 s"; the balance's 30 s convergence curve is the
 *     authoritative timing (the two phrasings are inconsistent — ADR-002
 *     favours the balance values).
 *   - Speed/heading     : ±convergeSpeedHeadingPctStart (20 %) from
 *     SUSPECTED, ±convergeSpeedHeadingPctTracked (5 %) once TRACKED+;
 *     ×convergePerObsFactor (0.85) per observation.
 *   - Range error       : TRACKED pins it at ±2 % (design §5.4; no balance
 *     entry — TRACKED_RANGE_ERROR_FRAC design constant), CONFIRMED → 0.
 *   - Error exemption    : CONFIRMED with range < errorExemptRangeKm (1.5 km)
 *     → all errors treated as 0 (§5.3: the fire-control must be usable).
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; no RNG; no module state.
 */

import type { BalanceConfig } from '../core/balance';
import type { ContactState } from '../core/types';

/** ±2 % range error at TRACKED (GAME_DESIGN §5.4; no balance entry). */
export const TRACKED_RANGE_ERROR_FRAC = 0.02;

/**
 * Heading-estimate error scale: a ±20 % speed/heading error becomes
 * ±(0.20 × 180) = ±36° of heading. DESIGN DECISION — the design gives only
 * the fraction; degrees need a scale (0.2 × 360 would be nonsensical).
 */
export const HEADING_ERROR_DEG_SCALE = 180;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Range error fraction for the n-th ping hit (1-based; ±10 %, ×0.8 each). */
export function pingRangeErrorFrac(pingCount: number, balance: BalanceConfig): number {
  const c = balance.sonar.active;
  const n = Math.max(1, pingCount);
  return c.rangeErrorPctStart * Math.pow(c.rangeErrorPctPerPingFactor, n - 1);
}

/** Bearing error (°) for the n-th ping hit (1-based; ±0.5°, ×0.7 each). */
export function pingBearingErrorDeg(pingCount: number, balance: BalanceConfig): number {
  const c = balance.sonar.active;
  const n = Math.max(1, pingCount);
  return c.bearingErrorDeg * Math.pow(c.bearingErrorPerPingFactor, n - 1);
}

/**
 * Passive bearing error after `elapsedS` seconds of continuous passive
 * tracking: ±3° → ±1° (lerp over bearingConvergeSeconds), floored at the
 * converged value.
 */
export function passiveBearingErrorDeg(elapsedS: number, balance: BalanceConfig): number {
  const c = balance.sonar.passive;
  if (elapsedS <= 0) return c.bearingErrorDegStart;
  const t = clamp(elapsedS / c.bearingConvergeSeconds, 0, 1);
  return c.bearingErrorDegStart + (c.bearingErrorDegConverged - c.bearingErrorDegStart) * t;
}

/**
 * Speed/heading estimate error fraction by contact state and observation
 * count: ±20 % from SUSPECTED, ±5 % once TRACKED+, ×0.85 per observation
 * (floored at the tracked value).
 */
export function speedHeadingErrorFrac(
  state: ContactState,
  observations: number,
  balance: BalanceConfig,
): number {
  const c = balance.sonar.contact;
  const base =
    state === 'TRACKED' || state === 'CONFIRMED'
      ? c.convergeSpeedHeadingPctTracked
      : c.convergeSpeedHeadingPctStart;
  const n = Math.max(1, observations);
  return Math.max(c.convergeSpeedHeadingPctTracked, base * Math.pow(c.convergePerObsFactor, n - 1));
}

/** Range error fraction for a contact in the given state. */
export function rangeErrorFracFor(state: ContactState, pingErrorFrac: number): number {
  if (state === 'TRACKED') return TRACKED_RANGE_ERROR_FRAC;
  if (state === 'CONFIRMED') return 0;
  return pingErrorFrac;
}

/**
 * §5.3 fire-control exemption: CONFIRMED contacts closer than
 * errorExemptRangeKm are treated as exact (errors → 0).
 */
export function errorsExempt(
  state: ContactState,
  rangeKm: number | null,
  balance: BalanceConfig,
): boolean {
  return (
    state === 'CONFIRMED' && rangeKm !== null && rangeKm < balance.sonar.contact.errorExemptRangeKm
  );
}

/** Heading-estimate error (°) implied by a speed/heading error fraction. */
export function headingErrorDeg(errorFrac: number): number {
  return errorFrac * HEADING_ERROR_DEG_SCALE;
}
