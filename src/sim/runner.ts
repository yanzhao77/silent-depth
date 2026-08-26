/**
 * SILENT DEPTH — headless playtest runner (src/sim/runner.ts)
 *
 * t-014 playtest agent. Per ADR-005 / GAME_ARCHITECTURE §3, the headless
 * runner drives the REAL engine — createGame(missionDef, seed) → step(handle,
 * FIXED_DT, inputs) — with a scripted "brain" (the same signature pattern as
 * tests/integration/gameplay.test.ts runGame) and records an honest AUDIT
 * TRAIL per session:
 *
 *   {missionId, seed, outcome, simTime, actions, stats, score, keyEvents,
 *    errors} + the full final snapshot (determinism evidence).
 *
 * The runner itself is deterministic — no PRNG calls, no wall clock; the
 * engine is the only time source. Report files are written by
 * src/sim/playtest.ts (the runner stays pure; playtest.ts owns the I/O).
 *
 * DESIGN DECISIONS:
 *  - runScripted mirrors runGame from gameplay.test.ts exactly (one initial
 *    IDLE step, brain loop, early exit on VICTORY/DEFEAT/MISSION_RESULT) so
 *    the proven t-013 brains port verbatim.
 *  - The audit trail counts pings and fireTorpedo inputs at the RUNNER level
 *    (the exact inputs the engine sees), plus moving/turning ticks for the
 *    maneuver summary, plus fire rejections observed in the event tail.
 *  - outcome = 'ERROR' when the engine throws (programming-error guard);
 *    errors[] carries the message(s). The engine never throws on bad inputs,
 *    so an ERROR is always a runner/brain bug, never a player mistake.
 *  - finalSnapshot is kept in-memory for the byte-identical determinism
 *    assertion; the markdown report renders a compact evidence block instead.
 *  - failure classification (classifyFailure) is derived from observable
 *    state only (outcome, hull, outOfBoundsTimer, sunk counts vs. the
 *    mission's sink-N subgoals) — never fabricated.
 *
 * @pure — zero DOM; no PRNG; no wall clock.
 */

import { createGame, step } from '../core/engine';
import { FIXED_DT } from '../core/time';
import type {
  EventEntry,
  GameSnapshot,
  MissionDef,
  PlayerInputs,
  ScoreParts,
  ShipClass,
} from '../core/types';
import { compassBearing, distKm } from '../sonar/contacts';

// ---------------------------------------------------------------------------
// Brain contract (same signature pattern as gameplay.test.ts runGame)
// ---------------------------------------------------------------------------

export interface BrainContext {
  /** Number of ping requests the runner has forwarded to the engine. */
  pings: number;
  /** Number of ticks the brain requested a torpedo launch (fireTorpedo ≠ null). */
  fireInputs: number;
  /** Zero-based tick index (sim ticks at FIXED_DT = 0.05 s). */
  tick: number;
}

export type Brain = (snap: GameSnapshot, last: PlayerInputs, ctx: BrainContext) => PlayerInputs;

// ---------------------------------------------------------------------------
// Audit trail types
// ---------------------------------------------------------------------------

export type PlaytestOutcome = 'VICTORY' | 'DEFEAT' | 'TIMEOUT' | 'ERROR';

export interface PlaytestActions {
  /** Total ping requests forwarded to the engine. */
  pings: number;
  /** Total fireTorpedo input ticks (each may launch up to salvoMax tubes). */
  fireInputs: number;
  /** Ticks where the brain requested throttle > 0. */
  movingTicks: number;
  /** Ticks where the brain requested a non-zero rudder. */
  turningTicks: number;
  /** torpedo.fireRejected events observed in the event-log tail. */
  fireRejections: number;
}

export interface PlaytestStats {
  torpedoesFired: number;
  torpedoesHit: number;
  peakDetection: number;
  /** Enemy ids with hull ≤ 0 at session end (AI keeps sunk ships in the array). */
  sunkIds: string[];
  /** Ship classes of the sunk ships. */
  sunkClasses: ShipClass[];
  /** Sum of (initial hull − final hull) across all enemies — actual damage dealt. */
  damageDealt: number;
  torpedoesRemaining: number;
  finalHull: number;
  finalBattery: number;
  finalDetection: number;
}

export interface PlaytestResult {
  session: number;
  missionId: string;
  missionName: string;
  seed: number;
  difficulty: number;
  strategy: string;
  brainId: string;
  outcome: PlaytestOutcome;
  /** classifyFailure() result — 'none' for VICTORY. */
  failure: string;
  /** Final simulation time in seconds (engine simTime). */
  simTime: number;
  /** Ticks executed (excludes the initial IDLE step). */
  ticks: number;
  actions: PlaytestActions;
  stats: PlaytestStats;
  score: ScoreParts;
  /** Event-log tail (ring buffer, last 50 events) at session end. */
  keyEvents: EventEntry[];
  /** Non-empty only when outcome === 'ERROR'. */
  errors: string[];
  /** Full final snapshot — determinism evidence; null only on a pre-step ERROR. */
  finalSnapshot: GameSnapshot | null;
}

// ---------------------------------------------------------------------------
// Small math helpers (mirror gameplay.test.ts)
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Signed smallest-angle difference a→b in degrees, wrapped to (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

const IDLE: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
};

function steerInputs(
  snap: GameSnapshot,
  bearing: number,
  throttle: number,
  extra: Partial<PlayerInputs> = {},
): PlayerInputs {
  return {
    throttle,
    rudder: clamp(angleDelta(snap.playerSub.headingDeg, bearing) / 15, -1, 1),
    depthLayerTarget: 'Shallow',
    silentRunning: false,
    ping: false,
    fireTorpedo: null,
    decoy: false,
    pause: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// runScripted — the headless runner
// ---------------------------------------------------------------------------

export interface RunScriptedOptions {
  session?: number;
  strategy?: string;
  brainId?: string;
}

/**
 * Drive one playtest session: createGame(def, seed) then up to maxTicks fixed
 * steps with the brain's inputs. Returns the audit-trail result. Never throws
 * (engine errors are captured into outcome 'ERROR').
 */
export function runScripted(
  def: MissionDef,
  seed: number,
  brain: Brain,
  maxTicks: number,
  opts: RunScriptedOptions = {},
): PlaytestResult {
  const session = opts.session ?? 0;
  const strategy = opts.strategy ?? 'scripted';
  const brainId = opts.brainId ?? `scripted-brain-${strategy}`;

  let snap: GameSnapshot | null = null;
  let outcome: PlaytestOutcome;
  const errors: string[] = [];
  let initialHulls = new Map<string, number>();
  const actions: PlaytestActions = {
    pings: 0,
    fireInputs: 0,
    movingTicks: 0,
    turningTicks: 0,
    fireRejections: 0,
  };
  let ticks = 0;

  try {
    const handle = createGame(def, seed);
    let last = IDLE;
    snap = step(handle, FIXED_DT, IDLE);
    initialHulls = new Map(snap.enemies.map((e) => [e.id, e.hull]));
    const st: BrainContext = { pings: 0, fireInputs: 0, tick: 0 };
    for (let t = 0; t < maxTicks; t++) {
      st.tick = t;
      const inputs = brain(snap, last, st);
      if (inputs.ping) actions.pings += 1;
      if (inputs.fireTorpedo !== null) actions.fireInputs += 1;
      if (inputs.throttle > 0) actions.movingTicks += 1;
      if (inputs.rudder !== 0) actions.turningTicks += 1;
      last = inputs;
      snap = step(handle, FIXED_DT, inputs);
      ticks += 1;
      if (snap.state === 'VICTORY' || snap.state === 'DEFEAT' || snap.state === 'MISSION_RESULT')
        break;
    }
    if (snap.state === 'VICTORY') outcome = 'VICTORY';
    else if (snap.state === 'DEFEAT') outcome = 'DEFEAT';
    else outcome = 'TIMEOUT';
  } catch (err) {
    outcome = 'ERROR';
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const final = snap;
  const stats: PlaytestStats = final
    ? {
        torpedoesFired: final.stats.torpedoesFired,
        torpedoesHit: final.stats.torpedoesHit,
        peakDetection: final.stats.peakDetection,
        sunkIds: final.enemies.filter((e) => e.hull <= 0).map((e) => e.id),
        sunkClasses: final.enemies.filter((e) => e.hull <= 0).map((e) => e.shipClass),
        damageDealt: final.enemies.reduce(
          (sum, e) => sum + Math.max(0, (initialHulls.get(e.id) ?? e.hull) - e.hull),
          0,
        ),
        torpedoesRemaining: final.stats.torpedoesRemaining,
        finalHull: final.playerSub.hull,
        finalBattery: final.playerSub.battery,
        finalDetection: final.playerSub.detection,
      }
    : {
        torpedoesFired: 0,
        torpedoesHit: 0,
        peakDetection: 0,
        sunkIds: [],
        sunkClasses: [],
        damageDealt: 0,
        torpedoesRemaining: 0,
        finalHull: 0,
        finalBattery: 0,
        finalDetection: 0,
      };

  return {
    session,
    missionId: def.id,
    missionName: def.name,
    seed,
    difficulty: def.difficulty,
    strategy,
    brainId,
    outcome,
    failure: classifyFailure(outcome, final, def),
    simTime: final?.simTime ?? 0,
    ticks,
    actions: {
      ...actions,
      fireRejections: (final?.eventLog ?? []).filter((e) => e.type === 'torpedo.fireRejected')
        .length,
    },
    stats,
    score: final?.score ?? {
      objective: 0,
      damage: 0,
      stealth: 0,
      torpedoEfficiency: 0,
      time: 0,
      survival: 0,
      total: 0,
      grade: 'Failed',
    },
    keyEvents: final?.eventLog ?? [],
    errors,
    finalSnapshot: final,
  };
}

// ---------------------------------------------------------------------------
// Failure classification (honest, state-derived)
// ---------------------------------------------------------------------------

/** Number of ships the mission's sink-N subgoals demand (max N over subgoals). */
export function requiredSinks(def: MissionDef): number {
  let max = 0;
  for (const sg of def.objective.subgoals ?? []) {
    const m = /^sink-(\d+)$/.exec(sg.id);
    if (m !== null) max = Math.max(max, Number.parseInt(m[1]!, 10));
  }
  return max;
}

export function sunkCount(snap: GameSnapshot | null): number {
  return snap === null ? 0 : snap.enemies.filter((e) => e.hull <= 0).length;
}

/**
 * Classify WHY the session did not end in VICTORY — a compact machine-readable
 * label plus nothing else (the markdown report adds the narrative). All inputs
 * are observable state; nothing is inferred beyond the data.
 */
export function classifyFailure(
  outcome: PlaytestOutcome,
  snap: GameSnapshot | null,
  def: MissionDef,
): string {
  if (outcome === 'VICTORY') return 'none';
  if (outcome === 'ERROR') return 'SCRIPT_ERROR';
  if (snap === null) return 'NO_SNAPSHOT';
  const required = requiredSinks(def);
  const sunk = sunkCount(snap);
  const hasEscorts = def.spawns.some((s) => s.type === 'Destroyer' || s.type === 'Frigate');
  if (outcome === 'DEFEAT') {
    if (snap.playerSub.hull <= 0) return hasEscorts ? 'DESTROYED_BY_ESCORT' : 'DESTROYED';
    if (snap.playerSub.outOfBoundsTimer >= 59) return 'OUT_OF_BOUNDS';
    return 'MISSION_DEFEAT';
  }
  // TIMEOUT
  if (sunk >= required && required > 0) {
    // Sinks achieved but the mission still demands more (M04 survive / M05 escape).
    if (def.objective.subgoals?.some((sg) => sg.id === 'escape')) return 'ESCAPE_FAILED';
    if (def.objective.subgoals?.some((sg) => sg.id === 'survive')) return 'SURVIVE_FAILED';
    return 'VICTORY_CONDITION_TIMED_OUT';
  }
  return 'SINK_OBJECTIVE_NOT_MET';
}

// ---------------------------------------------------------------------------
// Strategy registry + brain factories
// ---------------------------------------------------------------------------

export type StrategyId =
  | 'ping-until-track'
  | 'stationary-ambush'
  | 'convoy-attack'
  | 'generic-hunter'
  | 'sink-and-escape'
  | 'determinism-check';

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  description: string;
}

export const STRATEGIES: Record<StrategyId, StrategyMeta> = {
  'ping-until-track': {
    id: 'ping-until-track',
    label: 'Ping until track (M01)',
    description:
      'Cruise toward the reported merchant position (briefing knowledge), ping inside 10 km until the contact reaches TRACKED; no torpedoes (M01 has no sink requirement).',
  },
  'stationary-ambush': {
    id: 'stationary-ambush',
    label: 'Stationary ambush (M02, PROVEN t-013/t-020)',
    description:
      'Hold position STOPPED at Medium depth, sparse pings every 150 s for range, fire point-blank (≤ 1.2 km) with a fresh ping + lead-corrected fire solution; re-fire after torpedo resolution.',
  },
  'convoy-attack': {
    id: 'convoy-attack',
    label: 'Convoy attack (M03/M04 best effort)',
    description:
      'Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.',
  },
  'generic-hunter': {
    id: 'generic-hunter',
    label: 'Generic hunter (generated missions)',
    description:
      'Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.',
  },
  'sink-and-escape': {
    id: 'sink-and-escape',
    label: 'Sink then escape (M05 best effort)',
    description:
      'Phase 1: convoy-attack behavior until the first ship is sunk; Phase 2: Deep + silent running, creep away from the nearest escort to satisfy F9 (detection < 20, escorts > 3 km for 30 s).',
  },
  'determinism-check': {
    id: 'determinism-check',
    label: 'Determinism double-run (M01)',
    description:
      'Re-runs the ping-until-track brain on M01/seed 1001 twice; the harness asserts the two final snapshots are byte-identical.',
  },
};

export interface BrainOptions {
  /** Fire gate: torpedoes only when the target contact range ≤ this (km). */
  fireRangeKm?: number;
  /** Detection threshold that flips the brain into evade mode. */
  evadeDetection?: number;
  /** Approach speed outside the "close" radius (kt). */
  cruiseKt?: number;
  /** Speed inside the "close" radius (kt, SILENT band). */
  closeKt?: number;
}

/** Helper shared by the offensive brains: nearest merchant contact with a range fix. */
function nearestMerchantContact(snap: GameSnapshot): {
  contactId: string;
  shipId: string;
  d: number;
  bearing: number;
  state: string;
} | null {
  const merchants = snap.enemies.filter(
    (e) =>
      e.hull > 0 &&
      (e.shipClass === 'Cargo' || e.shipClass === 'Merchant' || e.shipClass === 'Tanker'),
  );
  let nearest: {
    contactId: string;
    shipId: string;
    d: number;
    bearing: number;
    state: string;
  } | null = null;
  for (const m of merchants) {
    const c = snap.contacts.find((x) => x.trueShipId === m.id && x.rangeKm !== null);
    if (c === undefined) continue;
    const d = distKm(snap.playerSub.position, m.position);
    if (nearest === null || d < nearest.d) {
      nearest = { contactId: c.id, shipId: m.id, d, bearing: c.bearingDeg, state: c.state };
    }
  }
  return nearest;
}

function nearestEscort(
  snap: GameSnapshot,
): { id: string; d: number; bearing: number; aiState: string } | null {
  const escorts = snap.enemies.filter(
    (e) => e.hull > 0 && (e.shipClass === 'Destroyer' || e.shipClass === 'Frigate'),
  );
  let best: { id: string; d: number; bearing: number; aiState: string } | null = null;
  for (const e of escorts) {
    const d = distKm(snap.playerSub.position, e.position);
    if (best === null || d < best.d)
      best = {
        id: e.id,
        d,
        bearing: compassBearing(snap.playerSub.position, e.position),
        aiState: e.aiState,
      };
  }
  return best;
}

/** Evade decision shared by convoy-attack / generic-hunter / sink-and-escape. */
function evadeInputs(
  snap: GameSnapshot,
  opts: BrainOptions,
  awayBearing: number,
  decoy: boolean,
): PlayerInputs {
  return {
    throttle: 3,
    rudder: clamp(angleDelta(snap.playerSub.headingDeg, awayBearing) / 15, -1, 1),
    depthLayerTarget: 'Deep',
    silentRunning: true,
    ping: false,
    fireTorpedo: null,
    decoy,
    pause: false,
  };
}

function wantEvade(snap: GameSnapshot, opts: BrainOptions): { on: boolean; awayBearing: number } {
  const threshold = opts.evadeDetection ?? 45;
  const hot = snap.playerSub.detection >= threshold;
  const escort = nearestEscort(snap);
  const threat = escort !== null && escort.aiState !== 'NORMAL' && escort.d < 5;
  if (!hot && !threat) return { on: false, awayBearing: 0 };
  const away = escort !== null ? escort.bearing + 180 : snap.playerSub.headingDeg;
  return { on: true, awayBearing: away };
}

/**
 * Build a brain for a strategy. The factories capture the MissionDef for
 * briefing knowledge (reported spawn positions) exactly like the t-013 tests.
 */
export function makeBrain(strategy: StrategyId, def: MissionDef, opts: BrainOptions = {}): Brain {
  switch (strategy) {
    case 'ping-until-track':
    case 'determinism-check': {
      const target = def.spawns[0]!;
      return (snap, last) => {
        const contact = snap.contacts[0];
        const bearing =
          contact !== undefined
            ? contact.bearingDeg
            : compassBearing(snap.playerSub.position, target);
        const inRange = distKm(snap.playerSub.position, target) < 10;
        const wantPing =
          inRange &&
          snap.playerSub.pingCooldown <= 0 &&
          !last.ping &&
          snap.state === 'MISSION_RUNNING';
        return steerInputs(snap, bearing, 22, { ping: wantPing });
      };
    }

    case 'stationary-ambush': {
      // PROVEN t-020 brain (regression.test.ts): STOPPED + Medium, sparse pings,
      // fire ≤ 1.2 km with a fresh ping; re-fire after torpedo resolution.
      const tankerPos = def.spawns[0]!;
      const fireRangeKm = opts.fireRangeKm ?? 1.2;
      let lastPingAt = -1e9;
      return (snap, last, st) => {
        const contact = snap.contacts.find((c) => c.rangeKm !== null && c.trueShipId !== null);
        const range =
          contact !== undefined ? contact.rangeKm! : distKm(snap.playerSub.position, tankerPos);
        const tanker = snap.enemies.find((e) => e.id === contact?.trueShipId);
        const torpedoRunning = snap.torpedoes.some(
          (tp) => tp.targetShipId === tanker?.id && tp.state === 'RUNNING',
        );
        const tubesReady = snap.playerSub.torpedoTubes.some(
          (tb) => tb.state === 'LOADED' || tb.state === 'READY',
        );
        const canFire =
          contact !== undefined &&
          range <= fireRangeKm &&
          snap.playerSub.pingCooldown <= 0 &&
          !torpedoRunning &&
          snap.state === 'MISSION_RUNNING' &&
          tubesReady;
        const fire = canFire ? contact!.id : null;
        // DESIGN DECISION: keep the proven cadence — one range ping every 150 s,
        // plus a same-tick ping right before firing (fresh bearing for the lead).
        const wantRangePing =
          snap.playerSub.pingCooldown <= 0 && st.tick - lastPingAt >= 3000 && !last.ping;
        const ping = (fire !== null && !last.ping) || wantRangePing;
        if (ping) lastPingAt = st.tick;
        const rudder = clamp(
          angleDelta(snap.playerSub.headingDeg, contact !== undefined ? contact.bearingDeg : 0) /
            15,
          -1,
          1,
        );
        return {
          throttle: 0,
          rudder,
          depthLayerTarget: 'Medium',
          silentRunning: false,
          ping,
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        };
      };
    }

    case 'convoy-attack': {
      const fireRangeKm = opts.fireRangeKm ?? 1.5;
      // DESIGN DECISION: sparse ping cadence (30 s sim = 600 ticks) for the
      // "silent approach" — pinging every cooldown (6 s) pins the shared
      // detection meter at 40+ and scatters the merchants before any shot.
      let lastPingTick = -1e9;
      return (snap, last, st) => {
        const nearest = nearestMerchantContact(snap);
        const torpedoesSpent = snap.playerSub.torpedoTubes.every(
          (t) => t.state !== 'LOADED' && t.state !== 'READY',
        );
        const ev = wantEvade(snap, opts);
        const depthCharges = snap.eventLog.some((e) => e.type === 'depthCharge.dropped');
        if (ev.on || torpedoesSpent) {
          const away = ev.on
            ? ev.awayBearing
            : nearest !== null
              ? nearest.bearing + 180
              : snap.playerSub.headingDeg;
          return evadeInputs(snap, opts, away, depthCharges);
        }
        const torpedoRunningAt = (shipId: string): boolean =>
          snap.torpedoes.some((tp) => tp.targetShipId === shipId && tp.state === 'RUNNING');
        const tubesReady = snap.playerSub.torpedoTubes.some(
          (t) => t.state === 'LOADED' || t.state === 'READY',
        );
        const canFire =
          nearest !== null &&
          nearest.d <= fireRangeKm &&
          !torpedoRunningAt(nearest.shipId) &&
          tubesReady &&
          snap.playerSub.pingCooldown <= 0 &&
          snap.state === 'MISSION_RUNNING';
        const fire = canFire ? nearest!.contactId : null;
        const close = nearest !== null && nearest.d <= 2.5;
        const fireNow = fire !== null && !last.ping;
        const acquire = nearest === null && st.tick - lastPingTick >= 150; // first fix (7.5 s)
        const refresh =
          nearest !== null &&
          (nearest.d > 3 ||
            nearest.state === 'UNKNOWN' ||
            nearest.state === 'SUSPECTED' ||
            nearest.state === 'CLASSIFIED') &&
          st.tick - lastPingTick >= 200; // 10 s cadence (range-fix): keeps the contact climbing to TRACKED
        // while limiting ping self-exposure
        const wantPing =
          snap.playerSub.pingCooldown <= 0 &&
          !last.ping &&
          snap.state === 'MISSION_RUNNING' &&
          (acquire || refresh || fireNow);
        const ping = wantPing || fireNow;
        if (ping) lastPingTick = st.tick;
        return {
          throttle: close ? 3 : 8,
          rudder:
            nearest !== null
              ? clamp(angleDelta(snap.playerSub.headingDeg, nearest.bearing) / 15, -1, 1)
              : 0,
          depthLayerTarget: close ? 'Medium' : 'Shallow',
          silentRunning: close,
          ping,
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        };
      };
    }

    case 'generic-hunter': {
      // Task contract: ping + fire at the nearest TRACKED-or-better contact
      // ≤ 1.5 km, silent approach. Requires 3 pings to reach TRACKED (pingCount
      // ≥ 3 + confidence ≥ 70) — fire gate keeps the fire solution fresh.
      // Sparse cadence (30 s) keeps the shared meter below the 40 ALERT band
      // so the merchants do not scatter before the shot (same reasoning as
      // convoy-attack).
      const fireRangeKm = opts.fireRangeKm ?? 1.5;
      let lastPingTick = -1e9;
      return (snap, last, st) => {
        const nearest = nearestMerchantContact(snap);
        const torpedoesSpent = snap.playerSub.torpedoTubes.every(
          (t) => t.state !== 'LOADED' && t.state !== 'READY',
        );
        const ev = wantEvade(snap, opts);
        const depthCharges = snap.eventLog.some((e) => e.type === 'depthCharge.dropped');
        if (ev.on || torpedoesSpent) {
          const away = ev.on
            ? ev.awayBearing
            : nearest !== null
              ? nearest.bearing + 180
              : snap.playerSub.headingDeg;
          return evadeInputs(snap, opts, away, depthCharges);
        }
        const torpedoRunningAt = (shipId: string): boolean =>
          snap.torpedoes.some((tp) => tp.targetShipId === shipId && tp.state === 'RUNNING');
        const tubesReady = snap.playerSub.torpedoTubes.some(
          (t) => t.state === 'LOADED' || t.state === 'READY',
        );
        const tracked =
          nearest !== null &&
          (nearest.state === 'TRACKED' || nearest.state === 'CONFIRMED') &&
          !torpedoRunningAt(nearest.shipId);
        const canFire =
          tracked &&
          nearest!.d <= fireRangeKm &&
          tubesReady &&
          snap.playerSub.pingCooldown <= 0 &&
          snap.state === 'MISSION_RUNNING';
        const fire = canFire ? nearest!.contactId : null;
        const close = nearest !== null && nearest.d <= 2.5;
        const fireNow = fire !== null && !last.ping;
        const acquire = nearest === null && st.tick - lastPingTick >= 150; // first fix (7.5 s)
        const refresh =
          nearest !== null &&
          (nearest.d > 3 ||
            nearest.state === 'UNKNOWN' ||
            nearest.state === 'SUSPECTED' ||
            nearest.state === 'CLASSIFIED') &&
          st.tick - lastPingTick >= 200; // 10 s cadence (range-fix): keeps the contact climbing to TRACKED
        // while limiting ping self-exposure
        const wantPing =
          snap.playerSub.pingCooldown <= 0 &&
          !last.ping &&
          snap.state === 'MISSION_RUNNING' &&
          (acquire || refresh || fireNow);
        const ping = wantPing || fireNow;
        if (ping) lastPingTick = st.tick;
        return {
          throttle: close ? 3 : 8,
          rudder:
            nearest !== null
              ? clamp(angleDelta(snap.playerSub.headingDeg, nearest.bearing) / 15, -1, 1)
              : 0,
          depthLayerTarget: close ? 'Medium' : 'Shallow',
          silentRunning: close,
          ping,
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        };
      };
    }

    case 'sink-and-escape': {
      const fireRangeKm = opts.fireRangeKm ?? 1.2;
      let lastPingTick = -1e9;
      return (snap, last, st) => {
        const alreadySunk = sunkCount(snap) >= 1;
        if (alreadySunk) {
          // Phase 2 — F9 escape: Deep + silent, creep away from the nearest
          // escort, drop a decoy when depth charges start falling.
          const escort = nearestEscort(snap);
          const away = escort !== null ? escort.bearing + 180 : snap.playerSub.headingDeg;
          const depthCharges = snap.eventLog.some((e) => e.type === 'depthCharge.dropped');
          return evadeInputs(snap, { ...opts, evadeDetection: 0 }, away, depthCharges);
        }
        // Phase 1 — same as convoy-attack (sparse 30 s ping cadence) until the
        // first kill.
        const nearest = nearestMerchantContact(snap);
        const torpedoesSpent = snap.playerSub.torpedoTubes.every(
          (t) => t.state !== 'LOADED' && t.state !== 'READY',
        );
        const ev = wantEvade(snap, opts);
        const depthCharges = snap.eventLog.some((e) => e.type === 'depthCharge.dropped');
        if (ev.on || torpedoesSpent) {
          const away = ev.on
            ? ev.awayBearing
            : nearest !== null
              ? nearest.bearing + 180
              : snap.playerSub.headingDeg;
          return evadeInputs(snap, opts, away, depthCharges);
        }
        const torpedoRunningAt = (shipId: string): boolean =>
          snap.torpedoes.some((tp) => tp.targetShipId === shipId && tp.state === 'RUNNING');
        const tubesReady = snap.playerSub.torpedoTubes.some(
          (t) => t.state === 'LOADED' || t.state === 'READY',
        );
        const canFire =
          nearest !== null &&
          nearest.d <= fireRangeKm &&
          !torpedoRunningAt(nearest.shipId) &&
          tubesReady &&
          snap.playerSub.pingCooldown <= 0 &&
          snap.state === 'MISSION_RUNNING';
        const fire = canFire ? nearest!.contactId : null;
        const close = nearest !== null && nearest.d <= 2.5;
        const fireNow = fire !== null && !last.ping;
        const acquire = nearest === null && st.tick - lastPingTick >= 150; // first fix (7.5 s)
        const refresh =
          nearest !== null &&
          (nearest.d > 3 ||
            nearest.state === 'UNKNOWN' ||
            nearest.state === 'SUSPECTED' ||
            nearest.state === 'CLASSIFIED') &&
          st.tick - lastPingTick >= 200; // 10 s cadence (range-fix): keeps the contact climbing to TRACKED
        // while limiting ping self-exposure
        const wantPing =
          snap.playerSub.pingCooldown <= 0 &&
          !last.ping &&
          snap.state === 'MISSION_RUNNING' &&
          (acquire || refresh || fireNow);
        const ping = wantPing || fireNow;
        if (ping) lastPingTick = st.tick;
        return {
          throttle: close ? 3 : 8,
          rudder:
            nearest !== null
              ? clamp(angleDelta(snap.playerSub.headingDeg, nearest.bearing) / 15, -1, 1)
              : 0,
          depthLayerTarget: close ? 'Medium' : 'Shallow',
          silentRunning: close,
          ping,
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        };
      };
    }
  }
}
