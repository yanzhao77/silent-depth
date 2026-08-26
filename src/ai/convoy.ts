/**
 * SILENT DEPTH — convoy formation + merchant behaviour (src/ai/convoy.ts)
 *
 * FR-09 / GAME_DESIGN §6.3. The standard formation is a 2×2 merchant grid
 * (colSpacingM 500 m, rowSpacingM 400 m) whose centre (the "anchor") advances
 * along the fleet heading at the fleet speed; each merchant steers to its
 * formation waypoint and aligns to the fleet heading. The escort patrols
 * offsetM behind the anchor (see escort.ts).
 *
 * Merchant individual AI (§6.1):
 *   - NORMAL  : follow the formation waypoint at fleet speed.
 *   - ALERT   : turn 30° (merchant.alertTurnDeg) and speed up to
 *               merchant.alertSpeedKt for 60 s, then restore (→ NORMAL).
 *   - Torpedo targeted (TORPEDO RUNNING pointing at self): 30 % chance to
 *     evade — turn 45° for 30 s (merchant.evadeChanceOnTorpedo /
 *     evadeTurnDeg / evadeSeconds).
 *   - Convoy mate sunk: the remaining merchants evade 45° for 30 s, then
 *     reform on the (still-advancing) formation.
 *
 * All randomness flows through the injected Rng (ADR-004).
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; no module state.
 */

import type { BalanceConfig } from '../core/balance'
import type { EnemyShip } from '../core/types'
import type { Rng } from '../core/rng'
import {
  KT_TO_KM_S,
  moveShip,
  normalizeDeg,
  steerTo,
} from './ship'
import type { AiShipRuntime, FormationSlot } from './ship'

export interface FormationGeometry {
  cols: number
  rows: number
  colSpacingM: number
  rowSpacingM: number
}

/** Formation geometry from the mission fleet (fallback: balance §6.3). */
export function formationGeometry(
  fleet: { colSpacingM?: number; rowSpacingM?: number },
  balance: BalanceConfig,
): FormationGeometry {
  const f = balance.enemyAI.escort.formation
  return {
    cols: f.columns,
    rows: f.rows,
    colSpacingM: fleet.colSpacingM ?? f.colSpacingM,
    rowSpacingM: fleet.rowSpacingM ?? f.rowSpacingM,
  }
}

/**
 * Longitudinal (forward, + ahead) and lateral (+ right) offset of a formation
 * slot in metres, relative to the formation centre. Row 0 is the front row
 * ("队首正对航向"); the grid is centred on the anchor.
 */
export function formationSlotOffsetM(slot: FormationSlot, geo: FormationGeometry): { forwardM: number; lateralM: number } {
  const forwardM = ((geo.rows - 1) / 2 - slot.row) * geo.rowSpacingM
  const lateralM = (slot.col - (geo.cols - 1) / 2) * geo.colSpacingM
  return { forwardM, lateralM }
}

/** World position of a formation slot for a given anchor + fleet heading. */
export function formationSlotPoint(
  anchor: { x: number; y: number },
  headingDeg: number,
  slot: FormationSlot,
  geo: FormationGeometry,
): { x: number; y: number } {
  const { forwardM, lateralM } = formationSlotOffsetM(slot, geo)
  const h = (headingDeg * Math.PI) / 180
  // North-up convention: forward = heading, starboard = heading − 90°.
  const fwd = { x: Math.cos(h), y: Math.sin(h) }
  const right = { x: Math.sin(h), y: -Math.cos(h) }
  return {
    x: anchor.x + (fwd.x * forwardM + right.x * lateralM) / 1000,
    y: anchor.y + (fwd.y * forwardM + right.y * lateralM) / 1000,
  }
}

/** Advance the formation anchor along the fleet heading at fleet speed. */
export function advanceAnchor(
  anchor: { x: number; y: number },
  headingDeg: number,
  speedKt: number,
  dt: number,
): { x: number; y: number } {
  const h = (headingDeg * Math.PI) / 180
  return {
    x: anchor.x + Math.cos(h) * speedKt * KT_TO_KM_S * dt,
    y: anchor.y + Math.sin(h) * speedKt * KT_TO_KM_S * dt,
  }
}

/** 0-based formation slot for the n-th merchant (col-major 2×2 grid). */
export function slotForMerchantIndex(index: number, geo: FormationGeometry): FormationSlot {
  return { col: index % geo.cols, row: Math.floor(index / geo.cols) % geo.rows }
}

// ---------------------------------------------------------------------------
// Merchant behaviour
// ---------------------------------------------------------------------------

export interface MerchantBehaviorInput {
  ship: EnemyShip
  rt: AiShipRuntime
  /** Formation anchor (null → merchants just run the fleet course). */
  anchor: { x: number; y: number } | null
  fleetHeadingDeg: number
  fleetSpeedKt: number
  geo: FormationGeometry
  balance: BalanceConfig
  dt: number
  /** A RUNNING torpedo is targeting this merchant. */
  torpedoTargeted: boolean
  /** A convoy mate sank (evade 45° / 30 s, then reform). */
  convoyMateSunk: boolean
  rng: Rng
}

/**
 * One merchant tick: torpedo / convoy-mate evade rolls, ALERT evasion, or
 * formation waypoint following. Mutates ship position/heading/speed and the
 * runtime evade/alert timers.
 */
export function runMerchantBehavior(input: MerchantBehaviorInput): void {
  const { ship, rt, balance, dt, rng } = input
  const m = balance.enemyAI.merchant
  const opts = { turnRateDegPerS: balance.enemyAI.turnRates.merchant, accelKtPerS: balance.enemyAI.accelKtPerS }

  // --- evade rolls (one roll per trigger event, not per tick) ---
  if (input.torpedoTargeted && rt.evadeS <= 0 && rt.neighborEvadeS <= 0 && rng.chance(m.evadeChanceOnTorpedo)) {
    startEvade(rt, m.evadeTurnDeg, m.evadeSeconds, rng, ship.headingDeg, 'torpedo')
  }
  if (input.convoyMateSunk && rt.evadeS <= 0 && rt.neighborEvadeS <= 0) {
    startEvade(rt, m.evadeTurnDeg, m.evadeSeconds, rng, ship.headingDeg, 'mate')
  }

  // --- timers ---
  rt.evadeS = Math.max(0, rt.evadeS - dt)
  rt.neighborEvadeS = Math.max(0, rt.neighborEvadeS - dt)
  rt.merchantAlertS = Math.max(0, rt.merchantAlertS - dt)

  // --- behaviour priority: ALERT evasion > torpedo evade > mate evade > formation ---
  if (ship.aiState === 'ALERT') {
    // §6.1: turn 30°, speed up to alertSpeedKt, restore after 60 s.
    if (rt.merchantAlertS > 0 && rt.merchantAlertHeadingDeg !== null) {
      moveShip(ship, rt.merchantAlertHeadingDeg, m.alertSpeedKt, dt, opts)
    } else {
      moveShip(ship, input.fleetHeadingDeg, input.fleetSpeedKt, dt, opts)
    }
    return
  }

  if (rt.evadeS > 0 && rt.evadeHeadingDeg !== null) {
    // Torpedo evade: hold the 45° turn heading, keep cruising speed.
    moveShip(ship, rt.evadeHeadingDeg, input.fleetSpeedKt, dt, opts)
    return
  }

  if (rt.neighborEvadeS > 0 && rt.evadeHeadingDeg !== null) {
    // Convoy-mate evade: same 45° manoeuvre; after 30 s the merchant reforms.
    moveShip(ship, rt.evadeHeadingDeg, input.fleetSpeedKt, dt, opts)
    return
  }

  // --- formation following (NORMAL) ---
  if (input.anchor !== null && rt.formationSlot !== null) {
    const waypoint = formationSlotPoint(input.anchor, input.fleetHeadingDeg, rt.formationSlot, input.geo)
    steerTo(ship, waypoint.x, waypoint.y, input.fleetSpeedKt, dt, opts)
  } else {
    moveShip(ship, input.fleetHeadingDeg, input.fleetSpeedKt, dt, opts)
  }
}

/** Start an evade turn (torpedo-targeted or convoy-mate-sunk trigger). */
function startEvade(
  rt: AiShipRuntime,
  turnDeg: number,
  seconds: number,
  rng: Rng,
  currentHeadingDeg: number,
  kind: 'torpedo' | 'mate',
): void {
  rt.evadeSign = rng.sign()
  rt.evadeHeadingDeg = normalizeDeg(currentHeadingDeg + rt.evadeSign * turnDeg)
  if (kind === 'torpedo') {
    rt.evadeS = Math.max(rt.evadeS, seconds)
  } else {
    rt.neighborEvadeS = Math.max(rt.neighborEvadeS, seconds)
  }
}
