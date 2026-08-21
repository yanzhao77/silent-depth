/**
 * SILENT DEPTH — mission objectives + scoring (src/missions/objectives.ts)
 *
 * FR-20 / GAME_DESIGN §10 + §9.1 + F9 escape. Two SystemFns for the fixed
 * pipeline (engine.ts slots 3 and 9 — the factory manager swaps the stubs):
 *
 *   - missionsSystem  (slot 3, lightweight): reflects objective progress into
 *     ctx.missionStatus.objectives[] done flags each tick (no RNG).
 *   - objectivesSystem (slot 9): refreshes progress, runs the F9 escape
 *     check, updates ctx.score (running totals), then decides victory/defeat
 *     via ctx.setOutcome('victory' | 'defeat').
 *
 * Objective model: MissionDef.objective.subgoals (config/missions.json)
 * define the mission's checklist; engine initialMissionStatus() already maps
 * them into missionStatus.objectives[{id, desc, done, weight}]. Subgoal ids:
 *   'find' | 'classify' | 'track'  (M01 — contact states, FR-05)
 *   'sink-<n>'                    (M02–M05 — n-th sunk ship of targetClass)
 *   'survive'                     (M04 — hull > 0)
 *   'escape'                      (M05 — missionStatus.escaped, F9)
 * Victory = every subgoal done. Defeat = hull ≤ 0 or
 * player.outOfBoundsTimer ≥ balance.world.outOfBoundsFailSeconds.
 *
 * DESIGN DECISIONS:
 *  - Sunk ships are derived from ctx.enemies (hull ≤ 0), NOT from the event
 *    log: stateless + idempotent per tick. The AI keeps sunk ships in the
 *    array (ai.ts: hull ≤ 0 → emit-once + skip) — t-007 combat must do the
 *    same, or this derivation needs rewiring (documented contract).
 *  - F9 escape needs a per-game consecutive-seconds timer; it lives in a
 *    WeakMap keyed on the LIVE ctx.missionStatus reference (same pattern as
 *    ai.ts's WeakMap on ctx.player). Each createGame() builds a fresh
 *    missionStatus, so interleaved/re-created games never share state and
 *    step() stays pure w.r.t. a handle (ADR-004). No fields were added to the
 *    frozen MissionStatus type.
 *  - Escaped = detection < balance.escape.detectionBelow AND nearest escort
 *    > balance.escape.minDistEscortKm, sustained for
 *    balance.escape.durationSeconds (F9). Escorts = ships with an attack kit
 *    (Destroyer/Frigate); no escorts → distance = ∞ (condition holds).
 *  - The escape requirement (M05) is driven by the objective kind
 *    'sink_ge1_and_escape', cross-checked with balance.escape.requiredInM05.
 *  - Scoring (GAME_DESIGN §10.1) is pure: computeScoreParts(ctx) reads
 *    missionStatus/stats/player/mission only. M01's damage component is the
 *    tracking-based 折算 (§10.1.2): damageMax (200) when a merchant contact
 *    is CONFIRMED, damageMax/2 (100) when TRACKED — derived from balance,
 *    no hardcoded literals. M05 escaped adds m05EscapeBonus to survival.
 *  - The outcome tick's score is the final one: score is written BEFORE the
 *    victory/defeat decision, so the final snapshot carries the outcome-tick
 *    values (time component uses the actual victory/defeat simTime).
 *  - Defeat takes precedence over victory on the same tick (a dead player
 *    cannot win).
 *
 * Task: t-008 missions (level-designer).
 *
 * @pure — zero DOM / browser-API references; no Math.random.
 */

import type { BalanceConfig } from '../core/balance'
import { loadBalance } from '../core/balance'
import type { SystemContext, SystemFn } from '../core/engine'
import type { Contact, EnemyShip, MissionStatus, ScoreGrade, ScoreParts, ShipClass } from '../core/types'

// ---------------------------------------------------------------------------
// Contact-state ranking (FR-05 five-state machine)
// ---------------------------------------------------------------------------

const CONTACT_RANK: Record<Contact['state'], number> = {
  UNKNOWN: 0,
  SUSPECTED: 1,
  CLASSIFIED: 2,
  TRACKED: 3,
  CONFIRMED: 4,
}

const MERCHANT_CLASSES: ReadonlySet<ShipClass> = new Set(['Merchant', 'Cargo', 'Tanker'])

/** Escort = a ship class with an attack kit (Destroyer / Frigate). */
function isEscortClass(cls: ShipClass, balance: BalanceConfig): boolean {
  return balance.enemyAI.shipTypes[cls]?.attack !== null && balance.enemyAI.shipTypes[cls]?.attack !== undefined
}

/** True when a contact points at a merchant (classification or true ship). */
function isMerchantContact(c: Contact, enemies: EnemyShip[], balance: BalanceConfig): boolean {
  if (MERCHANT_CLASSES.has(c.classification as ShipClass)) return true
  if (c.trueShipId !== null) {
    for (const e of enemies) {
      if (e.id === c.trueShipId && MERCHANT_CLASSES.has(e.shipClass)) return true
    }
  }
  return false
}

/** Highest contact-state rank among merchant contacts (0 = none). */
function bestMerchantContactRank(ctx: SystemContext): number {
  let best = 0
  for (const c of ctx.contacts) {
    if (isMerchantContact(c, ctx.enemies, ctx.balance)) {
      const rank = CONTACT_RANK[c.state] ?? 0
      if (rank > best) best = rank
    }
  }
  return best
}

/** Any merchant contact exists (any state). */
function anyMerchantContact(ctx: SystemContext): boolean {
  for (const c of ctx.contacts) {
    if (isMerchantContact(c, ctx.enemies, ctx.balance)) return true
  }
  return false
}

/** Count of sunk ships, optionally restricted to one class. */
function sunkCount(ctx: SystemContext, cls: ShipClass | undefined): number {
  let n = 0
  for (const e of ctx.enemies) {
    if (e.hull > 0) continue
    if (cls === undefined || e.shipClass === cls) n++
  }
  return n
}

// ---------------------------------------------------------------------------
// F9 escape (per-game timer via WeakMap on the live missionStatus)
// ---------------------------------------------------------------------------

interface EscapeRuntime {
  consecutiveS: number
  emitted: boolean
}

const escapeStates = new WeakMap<MissionStatus, EscapeRuntime>()

function escapeState(ms: MissionStatus): EscapeRuntime {
  let st = escapeStates.get(ms)
  if (st === undefined) {
    st = { consecutiveS: 0, emitted: false }
    escapeStates.set(ms, st)
  }
  return st
}

function nearestEscortKm(ctx: SystemContext): number {
  let best = Infinity
  for (const e of ctx.enemies) {
    if (!isEscortClass(e.shipClass, ctx.balance)) continue
    const d = Math.hypot(e.position.x - ctx.player.position.x, e.position.y - ctx.player.position.y)
    if (d < best) best = d
  }
  return best
}

/**
 * F9 escape check: detection < balance.escape.detectionBelow AND nearest
 * escort > balance.escape.minDistEscortKm sustained for durationSeconds.
 * Sets missionStatus.escaped (once) and emits escape.escaped.
 */
function updateEscape(ctx: SystemContext): void {
  const esc = ctx.balance.escape
  if (ctx.missionStatus.escaped) return
  const ok = ctx.player.detection < esc.detectionBelow && nearestEscortKm(ctx) > esc.minDistEscortKm
  const st = escapeState(ctx.missionStatus)
  st.consecutiveS = ok ? st.consecutiveS + ctx.dt : 0
  if (st.consecutiveS >= esc.durationSeconds) {
    ctx.missionStatus.escaped = true
    st.emitted = true
    ctx.bus.emit('escape.escaped', { missionId: ctx.mission.id, durationSeconds: esc.durationSeconds })
  }
}

/** True when the mission demands an escape for victory (M05). */
export function missionRequiresEscape(ctx: SystemContext): boolean {
  return (
    ctx.mission.objective.kind === 'sink_ge1_and_escape' ||
    (ctx.mission.id === 'M05' && ctx.balance.escape.requiredInM05)
  )
}

// ---------------------------------------------------------------------------
// Subgoal progress (shared by missionsSystem slot 3 and objectivesSystem slot 9)
// ---------------------------------------------------------------------------

/** Recompute every subgoal's done flag from the current game state. */
export function evaluateObjectiveProgress(ctx: SystemContext): void {
  for (const sg of ctx.missionStatus.objectives) {
    sg.done = subgoalDone(sg.id, ctx)
  }
}

function subgoalDone(id: string, ctx: SystemContext): boolean {
  switch (id) {
    case 'find':
      return anyMerchantContact(ctx)
    case 'classify':
      return bestMerchantContactRank(ctx) >= CONTACT_RANK.CLASSIFIED
    case 'track':
      return bestMerchantContactRank(ctx) >= CONTACT_RANK.TRACKED
    case 'survive':
      return ctx.player.hull > 0
    case 'escape':
      return ctx.missionStatus.escaped
  }
  if (id.startsWith('sink-')) {
    const n = Number.parseInt(id.slice('sink-'.length), 10)
    if (!Number.isFinite(n) || n <= 0) return false
    const target = ctx.mission.objective.params?.targetClass as ShipClass | undefined
    return sunkCount(ctx, target) >= n
  }
  return false
}

// ---------------------------------------------------------------------------
// Scoring (GAME_DESIGN §10.1 — pure function of the context)
// ---------------------------------------------------------------------------

/** Grade for a total score (balance.scoring.grades, descending min). */
export function computeGrade(total: number, balance: BalanceConfig): ScoreGrade {
  for (const g of balance.scoring.grades) {
    if (total >= g.min) return g.label
  }
  return 'Failed'
}

function objectiveComponent(ctx: SystemContext): number {
  let sum = 0
  for (const o of ctx.missionStatus.objectives) {
    if (o.done) sum += o.weight
  }
  return Math.min(sum, ctx.balance.scoring.components.objectiveMax)
}

function damageComponent(ctx: SystemContext): number {
  const sc = ctx.balance.scoring
  const max = sc.components.damageMax
  if (ctx.mission.objective.kind === 'find_classify_track') {
    // M01 has no sink requirement — the component is the tracking 折算
    // (§10.1.2): CONFIRMED +200, TRACKED +100.
    const rank = bestMerchantContactRank(ctx)
    if (rank >= CONTACT_RANK.CONFIRMED) return max
    if (rank >= CONTACT_RANK.TRACKED) return max / 2
    return 0
  }
  let sum = 0
  for (const e of ctx.enemies) {
    if (e.hull > 0) continue
    sum += sc.damageScores[e.shipClass] ?? 0
  }
  return Math.min(sum, max)
}

function torpedoEfficiencyComponent(ctx: SystemContext): number {
  const sc = ctx.balance.scoring
  const max = sc.components.torpedoEfficiencyMax
  const expected = sc.expectedHits[ctx.mission.id]
  if (expected === undefined || expected <= 0) return max // M01: component is always 100 (§10.1.4)
  const ratio = Math.min(1, Math.max(0, ctx.stats.torpedoesHit / expected))
  return max * ratio
}

function timeComponent(ctx: SystemContext): number {
  const max = ctx.balance.scoring.components.timeMax
  const actual = ctx.simTime
  if (actual <= 0) return max // just started: on pace
  const ratio = Math.min(1, Math.max(0, ctx.mission.parTimeS / actual))
  return max * ratio
}

function survivalComponent(ctx: SystemContext): number {
  const sc = ctx.balance.scoring
  const max = sc.components.survivalMax
  const hullFrac = Math.min(1, Math.max(0, ctx.player.hull / ctx.balance.hull.playerMax))
  let v = max * hullFrac
  if (missionRequiresEscape(ctx) && ctx.missionStatus.escaped) v += sc.m05EscapeBonus
  return v
}

/**
 * Full score parts per GAME_DESIGN §10.1: objective (subgoal weights),
 * damage (sink scores / M01 tracking 折算), stealth (150 × (1 − peak/100)),
 * torpedoEfficiency (100 × clamp(hits/expected)), time (100 × clamp(par/actual)),
 * survival (50 × hull/100, +50 M05 escape bonus), total, grade. Pure.
 */
export function computeScoreParts(ctx: SystemContext): ScoreParts {
  const objective = objectiveComponent(ctx)
  const damage = damageComponent(ctx)
  const stealth = ctx.balance.scoring.components.detectionMax * (1 - Math.min(ctx.stats.peakDetection, 100) / 100)
  const torpedoEfficiency = torpedoEfficiencyComponent(ctx)
  const time = timeComponent(ctx)
  const survival = survivalComponent(ctx)
  const total = objective + damage + stealth + torpedoEfficiency + time + survival
  return {
    objective,
    damage,
    stealth,
    torpedoEfficiency,
    time,
    survival,
    total,
    grade: computeGrade(total, ctx.balance),
  }
}

function applyScore(ctx: SystemContext, parts: ScoreParts): void {
  ctx.score.objective = parts.objective
  ctx.score.damage = parts.damage
  ctx.score.stealth = parts.stealth
  ctx.score.torpedoEfficiency = parts.torpedoEfficiency
  ctx.score.time = parts.time
  ctx.score.survival = parts.survival
  ctx.score.total = parts.total
  ctx.score.grade = parts.grade
}

// ---------------------------------------------------------------------------
// Systems (pipeline slots 3 and 9)
// ---------------------------------------------------------------------------

/**
 * Slot 3 (lightweight): reflect objective progress into missionStatus each
 * tick. Reads contacts/enemies/player/escaped — no RNG, no writes beyond the
 * done flags. (State is one tick behind the gameplay systems that run after
 * it; objectivesSystem re-evaluates at slot 9 with fresh state.)
 */
export const missionsSystem: SystemFn = (ctx) => {
  evaluateObjectiveProgress(ctx)
}

/**
 * Slot 9: escape check (F9) → running score → victory/defeat via
 * ctx.setOutcome (the engine applies the outcome; never call endMission —
 * the handle is not available here). Idempotent: returns once the mission
 * phase leaves 'running' (the engine sets it on the outcome tick).
 */
export const objectivesSystem: SystemFn = (ctx) => {
  if (ctx.missionStatus.phase !== 'running') return

  // F9 escape first so the 'escape' subgoal and M05 victory can complete on
  // the same tick.
  updateEscape(ctx)
  evaluateObjectiveProgress(ctx)

  // Running totals (final on the outcome tick — written before the decision).
  applyScore(ctx, computeScoreParts(ctx))

  // Defeat (takes precedence over victory on the same tick).
  if (ctx.player.hull <= 0) {
    ctx.setOutcome?.('defeat')
    return
  }
  if (ctx.player.outOfBoundsTimer >= ctx.balance.world.outOfBoundsFailSeconds) {
    ctx.setOutcome?.('defeat')
    return
  }

  // Victory: every objective subgoal done.
  const objectives = ctx.missionStatus.objectives
  if (objectives.length > 0 && objectives.every((o) => o.done)) {
    ctx.setOutcome?.('victory')
  }
}
