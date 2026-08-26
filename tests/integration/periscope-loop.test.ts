/**
 * SILENT DEPTH — periscope tactical loop integration test
 * (tests/integration/periscope-loop.test.ts)
 *
 * t-027 QA acceptance: the COMPLETE periscope loop headlessly through the REAL
 * engine (createGame → step, dt = FIXED_DT = 0.05 s), scripted inputs only.
 * No src/ changes, no mocked systems — every assertion runs the full fixed
 * pipeline (stateMachine → world → missions → submarine → sonar → periscope →
 * ai → combat → detection → objectives → snapshot).
 *
 * Scenario: M02 (single tanker, seed 1002). The player is parked 0.35 km south
 * of the tanker via the documented __internal harness pattern (the engine has
 * no public reposition API; the test writes the opaque runtime exactly like
 * the t-013 defeat-harness). Facing north, the tanker sits dead-centre in the
 * 16° periscope FOV inside the 5 km visual range.
 *
 * Loop phases (per t-024..t-027 spec):
 *   1. SUBMERGED @ Medium      → canRaise=false 'tooDeep'; raise edge →
 *      SURFACING (balance.periscope.autoSurface=true) → depth rises to the
 *      Periscope layer → RAISING.
 *   2. RAISING → RAISED        → progress 0→1 over raiseTimeS (3.2 s);
 *      exposure stays 0 while raising (accrues only from RAISED).
 *   3. OBSERVING               → tanker in FOV+range → observingContactId set;
 *      contact upgraded to CONFIRMED / Tanker / confidence 98 / exact
 *      range+speed+heading / visuallyConfirmed (ground truth, no RNG).
 *   4. Fire solution           → ESTIMATED (sonar) → 'VISUAL CONFIRMED'
 *      (observed/locked); hitProbability up — the confidence penalty removal
 *      is isolated on identical data (delta == confPen at the pre-conf).
 *   5. LOCK + FIRE             → lockTarget edge → lockedContactId; firing the
 *      locked contact → torpedo.fired ×2 (salvo) → torpedo.hit ×2 →
 *      ship.sunk → mission VICTORY (stationary-ambush geometry: the observed
 *      ground truth gives a near-perfect bow-on lead, so both torpedoes hit).
 *   6. Risk & lower            → while still raised exposure keeps rising
 *      (band progression, detection rises); lower (periscope edge) →
 *      LOWERING → SUBMERGED + periscope.unlocked/lowered. Variant: emergency
 *      dive (emergencyDive edge) → battery −3% + sub.emergencyDive + boosted
 *      lowering (emergencyLowerTimeS 0.5 s).
 *   7. Determinism             → the same scripted loop twice with the same
 *      seed → byte-identical final snapshots (periscope is RNG-neutral).
 *
 * Environment: vitest node. Deterministic — no Math.random anywhere.
 */

import { describe, expect, it } from 'vitest';
import { createGame, step, type GameHandle } from '../../src/core/engine';
import { getMissionDef } from '../../src/missions/missions';
import { loadBalance, type BalanceConfig } from '../../src/core/balance';
import { FIXED_DT } from '../../src/core/time';
import { solveFireSolution } from '../../src/combat/fireControl';
import { distKm, normalizeDeg } from '../../src/sonar/contacts';
import type {
  Contact,
  EnemyShip,
  ExposureBand,
  GameSnapshot,
  PlayerInputs,
  SubmarineState,
} from '../../src/core/types';

const BALANCE = loadBalance();

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

/** Idle + the player's depth intent on the Periscope layer (the UI does this
 *  when raising — the submarine only starts the rise when the input differs
 *  from the current layer, per updateDepth). */
const PERI: PlayerInputs = { ...IDLE, depthLayerTarget: 'Periscope' };

/** Test harness: direct write to the opaque engine runtime (documented —
 *  same pattern as the t-013 hull harness in gameplay.test.ts). */
function rtOf(handle: GameHandle): { player: SubmarineState } {
  return handle.__internal as { player: SubmarineState };
}

/** Replica of the fire-control confidence-penalty interpolation (fireControl.ts
 *  does not export it) — used to prove the VISUAL-CONFIRMED delta is exactly
 *  the removed confidence penalty. Derives purely from balance data. */
function confidencePenaltyAt(confidence: number, balance: BalanceConfig): number {
  const pts = Object.entries(balance.hitProbability.confidencePen)
    .map(
      ([key, value]) =>
        [Number.parseInt(key.replace(/^(ge|lt)/, ''), 10), value] as [number, number],
    )
    .sort((a, b) => a[0] - b[0]);
  const x = Math.min(Math.max(confidence, 30), 90);
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i]![0]) {
      const q = pts[i - 1]!;
      const t = pts[i]![0] === q[0] ? 0 : (x - q[0]) / (pts[i]![0] - q[0]);
      return q[1] + t * (pts[i]![1] - q[1]);
    }
  }
  return pts[pts.length - 1]![1];
}

// ---------------------------------------------------------------------------
// The scripted loop
// ---------------------------------------------------------------------------

export interface PeriscopeLoopTrace {
  final: GameSnapshot;
  // Phase 1
  canRaiseAtMedium: boolean;
  tooDeepReason: string | null;
  surfacingAfterRaiseEdge: boolean;
  neverImmediatelyRaised: boolean;
  ticksToRaising: number;
  // Phase 2
  progressMidRaising: number;
  exposureDuringRaising: number;
  raisedDurationDuringRaising: number;
  detectionDuringRaising: number;
  // Phase 3
  observingContactId: string | null;
  observed: Contact | null;
  observedTrueRangeKm: number;
  observedEnemy: EnemyShip | null;
  // Phase 4
  preSolutionStatus: string | undefined;
  preSolutionHp: number;
  postSolutionStatus: string | undefined;
  postSolutionHp: number;
  confPenIsolationDelta: number;
  // Phase 5
  lockedContactId: string | null;
  firedCount: number;
  fireDetectionDelta: number;
  detectionAtFire: number;
  // Phase 6
  exposureAtFire: number;
  exposureBeforeLower: number;
  bandBeforeLower: ExposureBand;
  detectionBeforeLower: number;
  lowerMode: 'edge' | 'emergency';
  loweringTicks: number;
  emergencyBatteryDelta: number | null;
  emergencyEvent: boolean;
  unlockedOnLower: boolean;
  // Phase 7 / outcome
  victory: boolean;
  torpedoesHit: number;
  tankerSunk: boolean;
  lifecycleEvents: string[];
}

/**
 * The full scripted periscope play (M02, tanker parked dead ahead at
 * `standoffKm`). Deterministic for a given seed. `lowerMode` picks the Phase 6
 * lowering: periscope edge (2 s) or emergency dive (0.5 s + battery cost).
 * Exported so test tooling / the report can capture numeric evidence.
 */
export function playPeriscopeLoop(
  opts: {
    seed?: number;
    standoffKm?: number;
    lowerMode?: 'edge' | 'emergency';
    lowerAfterS?: number;
  } = {},
): PeriscopeLoopTrace {
  const def = getMissionDef('M02');
  const seed = opts.seed ?? def.seed;
  const standoffKm = opts.standoffKm ?? 0.35;
  const lowerMode = opts.lowerMode ?? 'edge';
  const lowerAfterS = opts.lowerAfterS ?? 4;
  const tankerSpawn = def.spawns[0]!;

  const handle = createGame(def, seed);
  for (let i = 0; i < 45; i++) step(handle, FIXED_DT, IDLE); // briefing (2 s) + margin

  // --- harness: park the sub south of the tanker, facing it, at Medium ---
  const rt = rtOf(handle);
  rt.player.position = { x: tankerSpawn.x, y: tankerSpawn.y - standoffKm };
  rt.player.headingDeg = 0; // north — tanker dead-centre in the FOV
  rt.player.depthLayer = 'Medium';
  rt.player.targetDepthLayer = 'Medium';
  rt.player.depthTransitionT = null;
  let snap = step(handle, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' });
  snap = step(handle, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' }); // settle (detection runtime)

  const trace: PeriscopeLoopTrace = {
    final: snap,
    canRaiseAtMedium: false,
    tooDeepReason: null,
    surfacingAfterRaiseEdge: false,
    neverImmediatelyRaised: true,
    ticksToRaising: 0,
    progressMidRaising: 0,
    exposureDuringRaising: 0,
    raisedDurationDuringRaising: 0,
    detectionDuringRaising: 0,
    observingContactId: null,
    observed: null,
    observedTrueRangeKm: 0,
    observedEnemy: null,
    preSolutionStatus: undefined,
    preSolutionHp: 0,
    postSolutionStatus: undefined,
    postSolutionHp: 0,
    confPenIsolationDelta: 0,
    lockedContactId: null,
    firedCount: 0,
    fireDetectionDelta: 0,
    detectionAtFire: 0,
    exposureAtFire: 0,
    exposureBeforeLower: 0,
    bandBeforeLower: 'NONE',
    detectionBeforeLower: 0,
    lowerMode,
    loweringTicks: 0,
    emergencyBatteryDelta: null,
    emergencyEvent: false,
    unlockedOnLower: false,
    victory: false,
    torpedoesHit: 0,
    tankerSunk: false,
    lifecycleEvents: [],
  };

  // --- Phase 1: SUBMERGED @ Medium → cannotRaise → SURFACING auto-rise ---
  trace.canRaiseAtMedium = snap.periscope.canRaise;
  trace.tooDeepReason = snap.periscope.cannotRaiseReason;
  expect(snap.periscope.state).toBe('SUBMERGED');
  expect(snap.periscope.canRaise).toBe(false);
  expect(snap.periscope.cannotRaiseReason).toBe('tooDeep');

  // ping once → real sonar contact for the tanker (the observation input)
  snap = step(handle, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium', ping: true });
  snap = step(handle, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' });
  const preContact: Contact = snap.contacts[0]!;
  expect(preContact).toBeDefined();
  expect(preContact.trueShipId).toBe('E-01');

  // raise from Medium with the depth intent on Periscope → SURFACING (autoSurface)
  snap = step(handle, FIXED_DT, { ...PERI, periscope: true });
  trace.surfacingAfterRaiseEdge = snap.periscope.state === 'SURFACING';
  trace.neverImmediatelyRaised =
    snap.periscope.state !== 'RAISED' && snap.periscope.state !== 'RAISING';
  expect(snap.periscope.state).toBe('SURFACING');
  expect(snap.playerSub.targetDepthLayer).toBe(BALANCE.periscope.requiredLayer);
  let guard = 0;
  while (snap.periscope.state !== 'RAISING' && guard < 300) {
    snap = step(handle, FIXED_DT, PERI);
    guard++;
  }
  trace.ticksToRaising = guard;
  expect(snap.periscope.state).toBe('RAISING');
  expect(snap.playerSub.depthLayer).toBe(BALANCE.periscope.requiredLayer); // rose to Periscope
  expect(guard * FIXED_DT).toBeCloseTo(6, 0); // Medium→Shallow→Periscope = 2 layers × 3 s

  // --- Phase 2: RAISING → RAISED; exposure accrues only after RAISED ---
  const raiseTicks = Math.ceil(BALANCE.periscope.raiseTimeS / FIXED_DT); // 64
  for (let i = 0; i < raiseTicks - 1; i++) snap = step(handle, FIXED_DT, PERI);
  trace.progressMidRaising = snap.periscope.progress;
  trace.exposureDuringRaising = snap.periscope.exposure;
  trace.raisedDurationDuringRaising = snap.periscope.raisedDurationS;
  trace.detectionDuringRaising = snap.playerSub.detection;
  expect(snap.periscope.state).toBe('RAISING');
  expect(snap.periscope.progress).toBeGreaterThan(0);
  expect(snap.periscope.progress).toBeLessThan(1);
  expect(snap.periscope.exposure).toBe(0); // exposure starts only at RAISED
  expect(snap.periscope.raisedDurationS).toBe(0);
  snap = step(handle, FIXED_DT, PERI);
  expect(snap.periscope.state).toBe('RAISED');
  expect(snap.periscope.progress).toBe(1);
  expect(snap.periscope.raisedDurationS).toBe(0);

  // --- Phase 3: OBSERVING — visual ground truth ---
  snap = step(handle, FIXED_DT, PERI);
  expect(snap.periscope.state).toBe('OBSERVING');
  trace.observingContactId = snap.periscope.observingContactId;
  expect(snap.periscope.observingContactId).toBe('C-01');
  const observed = snap.contacts[0]!;
  const tanker = snap.enemies.find((e) => e.id === 'E-01')!;
  trace.observed = observed;
  trace.observedEnemy = tanker;
  trace.observedTrueRangeKm = distKm(snap.playerSub.position, tanker.position);
  expect(observed.state).toBe('CONFIRMED');
  expect(observed.classification).toBe('Tanker'); // the TRUE class, ground truth
  expect(observed.confidence).toBe(BALANCE.periscope.observeConfidence); // 98
  expect(observed.classifyConfidence).toBe(BALANCE.periscope.observeConfidence);
  // Range/heading/speed are ground-truth values from the observation tick;
  // the AI moves/turns the tanker a little later in the same tick, so compare
  // with metre/degree/tenth-kt level tolerances (the exact-0 assertions above
  // cover the error fields — the ground truth is exact, the snapshot enemy is
  // one AI sub-tick newer).
  expect(Math.abs(observed.rangeKm! - trace.observedTrueRangeKm)).toBeLessThan(0.01);
  expect(observed.rangeErrorFrac).toBe(0);
  expect(Math.abs(observed.speedEstimateKt! - tanker.speedKt)).toBeLessThan(0.2);
  expect(
    Math.abs(observed.headingEstimateDeg! - normalizeDeg(90 - tanker.headingDeg)),
  ).toBeLessThan(2);
  expect(observed.speedErrorFrac).toBe(0);
  expect(observed.signalStrength).toBe('Strong');
  expect(observed.visuallyConfirmed).toBe(true);

  // --- Phase 4: fire solution ESTIMATED → VISUAL CONFIRMED (confPen removed) ---
  const preSoln = solveFireSolution(preContact, snap.playerSub, BALANCE, false);
  const postSoln = solveFireSolution(observed, snap.playerSub, BALANCE, true);
  trace.preSolutionStatus = preSoln.status;
  trace.preSolutionHp = preSoln.hitProbability;
  trace.postSolutionStatus = postSoln.status;
  trace.postSolutionHp = postSoln.hitProbability;
  expect(preSoln.status).toBe('ESTIMATED');
  expect(postSoln.status).toBe('VISUAL CONFIRMED');
  expect(postSoln.estimated).toBe(false);
  expect(postSoln.hitProbability).toBeGreaterThan(preSoln.hitProbability);
  // confPen removal isolated on IDENTICAL data: same contact, flag toggled.
  const preVisual = solveFireSolution(preContact, snap.playerSub, BALANCE, true);
  trace.confPenIsolationDelta = preVisual.hitProbability - preSoln.hitProbability;
  expect(preVisual.status).toBe('VISUAL CONFIRMED');
  expect(preVisual.hitProbability).toBeCloseTo(
    preSoln.hitProbability + confidencePenaltyAt(preContact.confidence, BALANCE),
    9,
  );

  // --- Phase 5: LOCK → FIRE while raised ---
  snap = step(handle, FIXED_DT, { ...PERI, lockTarget: true });
  expect(snap.periscope.lockedContactId).toBe('C-01');
  trace.lockedContactId = snap.periscope.lockedContactId;
  expect(snap.eventLog.some((e) => e.type === 'periscope.locked')).toBe(true);
  const detBeforeFire = snap.playerSub.detection;
  trace.exposureAtFire = snap.periscope.exposure;
  snap = step(handle, FIXED_DT, { ...PERI, fireTorpedo: snap.periscope.lockedContactId! });
  trace.firedCount = snap.stats.torpedoesFired;
  trace.fireDetectionDelta = snap.playerSub.detection - detBeforeFire;
  trace.detectionAtFire = snap.playerSub.detection;
  expect(snap.stats.torpedoesFired).toBeGreaterThanOrEqual(2); // salvo on the locked contact
  expect(snap.torpedoes.every((t) => t.targetContactId === 'C-01')).toBe(true);
  expect(snap.playerSub.detection).toBeGreaterThan(detBeforeFire); // fired exposure (+raised bonus, unit-covered)
  const fireT = snap.simTime;

  // --- Phase 6: exposure keeps rising while raised; then lower ---
  while (snap.simTime - fireT < lowerAfterS) snap = step(handle, FIXED_DT, PERI);
  trace.exposureBeforeLower = snap.periscope.exposure;
  trace.bandBeforeLower = snap.periscope.exposureBand;
  trace.detectionBeforeLower = snap.playerSub.detection;
  expect(snap.periscope.exposure).toBeGreaterThan(trace.exposureAtFire); // keeps rising
  expect(snap.periscope.exposureBand).not.toBe('NONE');

  const batteryBeforeLower = snap.playerSub.battery;
  if (lowerMode === 'emergency') {
    snap = step(handle, FIXED_DT, { ...PERI, emergencyDive: true });
    trace.emergencyEvent = snap.eventLog.some((e) => e.type === 'sub.emergencyDive');
    trace.emergencyBatteryDelta = batteryBeforeLower - snap.playerSub.battery;
    expect(trace.emergencyEvent).toBe(true);
    expect(trace.emergencyBatteryDelta).toBeGreaterThanOrEqual(
      BALANCE.battery.emergencyDiveCostPercent,
    );
    expect(trace.emergencyBatteryDelta).toBeLessThanOrEqual(
      BALANCE.battery.emergencyDiveCostPercent + 0.01,
    );
    expect(snap.periscope.state).toBe('LOWERING');
  } else {
    snap = step(handle, FIXED_DT, { ...PERI, periscope: true });
    expect(snap.periscope.state).toBe('LOWERING');
  }
  let lowerTicks = 0;
  while (snap.periscope.state !== 'SUBMERGED' && lowerTicks < 120) {
    snap = step(handle, FIXED_DT, PERI);
    lowerTicks++;
  }
  trace.loweringTicks = lowerTicks;
  expect(snap.periscope.state).toBe('SUBMERGED');
  trace.unlockedOnLower = snap.eventLog.some((e) => e.type === 'periscope.unlocked');
  expect(snap.periscope.lockedContactId).toBeNull(); // lock released on lower completion
  expect(snap.periscope.exposureBand).toBe('NONE');
  if (lowerMode === 'emergency') {
    // boosted rate: emergencyLowerTimeS 0.5 s = 10 ticks
    expect(lowerTicks * FIXED_DT).toBeCloseTo(BALANCE.periscope.emergencyLowerTimeS, 1);
  } else {
    expect(lowerTicks * FIXED_DT).toBeCloseTo(BALANCE.periscope.lowerTimeS, 1); // 2.0 s
  }

  // --- outcome: the in-flight salvo resolves → hit → sunk → VICTORY ---
  for (let i = 0; i < 600 && snap.state === 'MISSION_RUNNING'; i++)
    snap = step(handle, FIXED_DT, PERI);
  trace.final = snap;
  trace.victory = snap.state === 'VICTORY';
  trace.torpedoesHit = snap.stats.torpedoesHit;
  trace.tankerSunk = snap.enemies[0]!.hull <= 0;
  expect(snap.state).toBe('VICTORY');
  expect(snap.stats.torpedoesHit).toBeGreaterThanOrEqual(2);
  expect(snap.enemies[0]!.hull).toBe(0);
  expect(snap.eventLog.some((e) => e.type === 'torpedo.hit')).toBe(true);
  expect(snap.eventLog.some((e) => e.type === 'ship.sunk')).toBe(true);
  expect(snap.eventLog.some((e) => e.type === 'mission.victory')).toBe(true);

  // --- lifecycle event order (raising → ready → raised → visualContact →
  //     classified → locked → torpedo.fired → unlocked/lowered) ---
  const events = snap.eventLog.map((e) => e.type);
  trace.lifecycleEvents = events.filter(
    (t) => t.startsWith('periscope') || ['torpedo.fired'].includes(t),
  );
  const order = trace.lifecycleEvents;
  const idx = (t: string): number => order.indexOf(t);
  expect(order.filter((t) => t === 'periscope.raising').length).toBe(1);
  expect(idx('periscope.raising')).toBeLessThan(idx('periscope.ready'));
  expect(idx('periscope.ready')).toBeLessThan(idx('periscope.raised'));
  expect(idx('periscope.raised')).toBeLessThan(idx('periscope.visualContact'));
  expect(idx('periscope.visualContact')).toBeLessThan(idx('periscope.classified'));
  expect(idx('periscope.classified')).toBeLessThan(idx('periscope.locked'));
  expect(idx('periscope.locked')).toBeLessThan(idx('torpedo.fired'));
  expect(idx('periscope.lowered')).toBeGreaterThan(idx('torpedo.fired'));
  expect(idx('periscope.unlocked')).toBeLessThan(idx('periscope.lowered'));

  return trace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('periscope tactical loop (M02 — tanker dead ahead, 0.35 km)', () => {
  it('full loop: SUBMERGED→SURFACING→RAISING→RAISED→OBSERVING→lock→fire→hit→VICTORY, exposure only while raised, edge lower', () => {
    const t = playPeriscopeLoop({ lowerMode: 'edge', lowerAfterS: 4 });
    // Phase 1 evidence
    expect(t.canRaiseAtMedium).toBe(false);
    expect(t.tooDeepReason).toBe('tooDeep');
    expect(t.surfacingAfterRaiseEdge).toBe(true);
    expect(t.neverImmediatelyRaised).toBe(true);
    // Phase 2 evidence
    expect(t.progressMidRaising).toBeGreaterThan(0);
    expect(t.progressMidRaising).toBeLessThan(1);
    expect(t.exposureDuringRaising).toBe(0);
    expect(t.raisedDurationDuringRaising).toBe(0);
    // Phase 3 evidence
    expect(t.observingContactId).toBe('C-01');
    expect(t.observed!.visuallyConfirmed).toBe(true);
    // Phase 4 evidence — HP up + confPen removed
    expect(t.postSolutionHp).toBeGreaterThan(t.preSolutionHp);
    expect(t.postSolutionStatus).toBe('VISUAL CONFIRMED');
    expect(t.confPenIsolationDelta).toBeGreaterThan(0);
    // Phase 5 evidence
    expect(t.lockedContactId).toBe('C-01');
    expect(t.firedCount).toBeGreaterThanOrEqual(2);
    expect(t.fireDetectionDelta).toBeGreaterThan(0);
    // Phase 6 evidence
    expect(t.exposureBeforeLower).toBeGreaterThan(t.exposureAtFire);
    expect(t.bandBeforeLower).not.toBe('NONE');
    expect(t.detectionBeforeLower).toBeGreaterThan(t.detectionAtFire); // exposure-driven detection rise
    expect(t.loweringTicks * FIXED_DT).toBeCloseTo(2.0, 1);
    expect(t.unlockedOnLower).toBe(true);
    // Outcome
    expect(t.victory).toBe(true);
    expect(t.torpedoesHit).toBeGreaterThanOrEqual(2);
    expect(t.tankerSunk).toBe(true);
  });

  it('emergency-dive variant: −3% battery, sub.emergencyDive, boosted lowering (0.5 s), still wins', () => {
    const t = playPeriscopeLoop({ lowerMode: 'emergency', lowerAfterS: 3 });
    expect(t.emergencyEvent).toBe(true);
    expect(t.emergencyBatteryDelta).toBeCloseTo(BALANCE.battery.emergencyDiveCostPercent, 1);
    expect(t.loweringTicks * FIXED_DT).toBeCloseTo(BALANCE.periscope.emergencyLowerTimeS, 1);
    expect(t.victory).toBe(true);
    expect(t.tankerSunk).toBe(true);
  });

  it('determinism: the same scripted loop twice with the same seed → byte-identical final snapshot', () => {
    const a = playPeriscopeLoop({ seed: 1002, lowerMode: 'edge', lowerAfterS: 4 });
    const b = playPeriscopeLoop({ seed: 1002, lowerMode: 'edge', lowerAfterS: 4 });
    expect(JSON.stringify(a.final)).toBe(JSON.stringify(b.final));
    expect(a.confPenIsolationDelta).toBe(b.confPenIsolationDelta);
    expect(a.lifecycleEvents).toEqual(b.lifecycleEvents);
  });

  it('the pre-observation fire solution is ESTIMATED and strictly worse (confidence penalty removed by the observation)', () => {
    const t = playPeriscopeLoop({ lowerMode: 'edge', lowerAfterS: 1 });
    expect(t.preSolutionStatus).toBe('ESTIMATED');
    expect(t.postSolutionStatus).toBe('VISUAL CONFIRMED');
    // The confPen removal alone (0.10–0.35 depending on the ping-era confidence)
    // plus the ground-truth range/heading make the observed solution clearly
    // better than the sonar estimate (the tanker sits at a ~39° AOB, so the
    // AOB penalty still applies — hence no hard near-ideal bound).
    expect(t.postSolutionHp - t.preSolutionHp).toBeGreaterThan(0.1);
    expect(t.postSolutionHp).toBeGreaterThan(0.6);
  });
});
