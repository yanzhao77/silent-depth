/**
 * SILENT DEPTH — fire control (src/combat/fireControl.ts)
 *
 * GAME_DESIGN §7.3/§7.4 + F6/F7. Display-only fire solution (no auto-lock,
 * DD-04): the player aims by reading the recommended firing bearing and hit
 * probability; the torpedo flies straight on the solved bearing (no homing).
 *
 * F6 lead angle: leadAngle = atan2(vT·sin(AOB), vT·cos(AOB) + vTorpedo) with
 * AOB measured at the target between its heading and the target→observer
 * line (AOB = 0 head-on, ±90 broadside — matches the §7.4 penalty table).
 * Recommended firing bearing = target bearing + leadAngle (absolute, north-up,
 * same convention as contact.bearingDeg — see src/sonar/contacts.ts).
 *
 * F7 hit probability: base − rangePen − aobPen − speedPen − confPen −
 * maneuverPen (all tables from balance.hitProbability, piecewise-linear
 * interpolation between the documented points), clamped 0.05..0.95. Salvo
 * display: 1 − (1−HP)².
 *
 * All inputs carry contact uncertainty (sonar already applied the errors to
 * bearingDeg / headingEstimateDeg / speedEstimateKt) → the solved bearing and
 * HP reflect confidence; `estimated` flags missing inputs (bearing-only
 * contact, no heading/speed track yet).
 *
 * DESIGN DECISIONS:
 *  - Missing range → worst-case range penalty (le6km). Missing heading/speed
 *    → zero lead (fire at current bearing) + mid-table AOB/speed penalties
 *    ('45deg' / '10kt'). Missing AOB → '45deg' mid penalty.
 *  - |AOB| > 90 (receding target) is clamped to 90 for the penalty table.
 *  - maneuverPen comes from contact.classification (the type guess);
 *    'Unknown'/'LargeSurface' → 0. The balance key 'DestroyerEvading' is
 *    reserved for the AI evade behaviour (not resolved here).
 *  - `player` is part of the contract signature (ADR: solveFireSolution
 *    (contact, player, balance)) but is unused today — bearings are absolute.
 *
 * Task: t-007 combat (gameplay-engineer).
 *
 * @pure — zero DOM; deterministic (no RNG).
 */

import type { BalanceConfig } from '../core/balance'
import type { Contact, ContactType, SubmarineState } from '../core/types'

export interface FireSolution {
  /** Absolute firing bearing (target bearing + lead angle), north-up 0..360. */
  bearingDeg: number
  /** F6 lead angle in degrees. */
  leadAngleDeg: number
  rangeKm: number | null
  targetHeadingDeg: number | null
  targetSpeedKt: number | null
  /** Signed AOB in (−180, 180], or null when the target course is unknown. */
  aobDeg: number | null
  /** F7 single-shot hit probability (clamped 0.05..0.95). */
  hitProbability: number
  /** Salvo display probability 1 − (1−HP)² (2 tubes). */
  salvoHitProbability: number
  /** True when any essential input is missing (bearing-only / no track). */
  estimated: boolean
  /**
   * t-024: 'VISUAL CONFIRMED' when the periscope observed/locked the target
   * (ground-truth data, confidence penalty removed); 'ESTIMATED' otherwise.
   * Optional only so legacy fixtures (tests/unit/ui.test.ts) compile —
   * solveFireSolution() always sets it; treat undefined as 'ESTIMATED'.
   */
  status?: 'ESTIMATED' | 'VISUAL CONFIRMED'
}

/**
 * Solve the fire solution for a contact (GAME_DESIGN §7.3). Display-only —
 * the torpedo launch uses `bearingDeg`; no lock or guidance.
 *
 * @param visualConfirmed t-024: pass true for a periscope-confirmed (or
 *   locked) contact — the confidence penalty is dropped (the contact carries
 *   ground-truth values) and the solution reports 'VISUAL CONFIRMED'.
 *   Default false keeps all legacy behavior and tests byte-identical.
 */
export function solveFireSolution(
  contact: Contact,
  _player: SubmarineState,
  balance: BalanceConfig,
  visualConfirmed = false,
): FireSolution {
  const torpedoKt = balance.torpedo.speedKt
  const theta = contact.bearingDeg // absolute, already carries sonar error
  const heading = contact.headingEstimateDeg
  const speed = contact.speedEstimateKt
  const rangeKm = contact.rangeKm
  const estimated = heading === null || speed === null || rangeKm === null

  // F6: signed AOB at the target; lead angle; recommended firing bearing.
  // AOB is measured from the target's heading to the target→observer line:
  // aob = (θ+180) − φ wrapped to (−180, 180]. AOB 0 = bow-on, ±90 = broadside.
  let aobDeg: number | null = null
  let leadAngleDeg = 0
  if (heading !== null) {
    const toPlayer = normalizeDeg(theta + 180)
    aobDeg = wrapSigned(toPlayer - heading)
  }
  if (heading !== null && speed !== null && speed > 0) {
    const aobRad = (aobDeg! * Math.PI) / 180
    leadAngleDeg = (Math.atan2(speed * Math.sin(aobRad), speed * Math.cos(aobRad) + torpedoKt) * 180) / Math.PI
  }
  const bearingDeg = normalizeDeg(theta + leadAngleDeg)

  // F7: hit probability from the balance penalty tables. A visually confirmed
  // target carries ground-truth data, so the confidence penalty is dropped.
  const hp = clamp(
    balance.hitProbability.base -
      rangePenalty(rangeKm, balance) -
      aobPenalty(aobDeg, balance) -
      speedPenalty(speed, balance) -
      (visualConfirmed ? 0 : confidencePenalty(contact.confidence, balance)) -
      maneuverPenalty(contact.classification, balance),
    balance.hitProbability.clampMin,
    balance.hitProbability.clampMax,
  )
  const salvoHitProbability = 1 - (1 - hp) ** 2

  return {
    bearingDeg,
    leadAngleDeg,
    rangeKm,
    targetHeadingDeg: heading,
    targetSpeedKt: speed,
    aobDeg,
    hitProbability: hp,
    salvoHitProbability,
    estimated: visualConfirmed ? false : estimated,
    status: visualConfirmed ? 'VISUAL CONFIRMED' : 'ESTIMATED',
  }
}

// ---------------------------------------------------------------------------
// Penalty tables (all values read from balance.hitProbability)
// ---------------------------------------------------------------------------

type PenTable = Record<string, number>

/** Build a sorted [x, y] point list from a balance penalty table, parsing the
 *  x-coordinate out of the key (e.g. 'le2km' → 2, '90deg' → 90, 'ge90' → 90,
 *  '20ktPlus' → 20). No balance number is hardcoded here. */
function penPoints(table: PenTable, parseX: (key: string) => number): [number, number][] {
  return Object.entries(table)
    .map(([key, value]) => [parseX(key), value] as [number, number])
    .sort((a, b) => a[0] - b[0])
}
/** Piecewise-linear interpolation over sorted points. */
function interpPen(points: [number, number][], x: number): number {
  const first = points[0]!
  if (x <= first[0]) return first[1]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    if (x <= p[0]) {
      const q = points[i - 1]!
      const t = p[0] === q[0] ? 0 : (x - q[0]) / (p[0] - q[0])
      return q[1] + t * (p[1] - q[1])
    }
  }
  return points[points.length - 1]![1]
}

function rangePenalty(rangeKm: number | null, balance: BalanceConfig): number {
  const pts = penPoints(balance.hitProbability.rangePen, (k) => Number.parseInt(k.slice(2), 10))
  if (rangeKm === null) return pts[pts.length - 1]![1] // worst case
  return interpPen([[0, 0], ...pts], Math.min(rangeKm, pts[pts.length - 1]![0]))
}

function aobPenalty(aobDeg: number | null, balance: BalanceConfig): number {
  const pts = penPoints(balance.hitProbability.aobPen, (k) => Number.parseInt(k, 10))
  const x = aobDeg === null ? 45 : Math.min(Math.abs(aobDeg), 90)
  return interpPen(pts, x)
}

function speedPenalty(speedKt: number | null, balance: BalanceConfig): number {
  const pts = penPoints(balance.hitProbability.targetSpeedPen, (k) => Number.parseInt(k.replace('le', ''), 10))
  if (speedKt === null) return interpPen(pts, 10) // mid-table default ('10kt')
  return interpPen(pts, Math.min(speedKt, pts[pts.length - 1]![0]))
}

function confidencePenalty(confidence: number, balance: BalanceConfig): number {
  const pts = penPoints(balance.hitProbability.confidencePen, (k) => Number.parseInt(k.replace(/^(ge|lt)/, ''), 10))
  const x = Math.min(Math.max(confidence, 30), 90)
  return interpPen(pts, x)
}

function maneuverPenalty(classification: ContactType, balance: BalanceConfig): number {
  return balance.hitProbability.maneuverPen[classification] ?? 0
}

function normalizeDeg(deg: number): number {
  const m = deg % 360
  return m < 0 ? m + 360 : m
}

/** Wrap an angle into (−180, 180]. */
function wrapSigned(deg: number): number {
  const m = deg % 360
  const w = m <= 180 ? m : m - 360
  return w <= -180 ? w + 360 : w
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
