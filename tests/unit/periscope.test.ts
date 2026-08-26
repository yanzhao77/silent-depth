/**
 * SILENT DEPTH — periscope system unit tests (tests/unit/periscope.test.ts)
 *
 * t-024 acceptance (10 spec tests + extras):
 *   1. too deep → cannotRaise 'tooDeep' (public state) + SURFACING auto-rise
 *      (autoSurface=true) / cannotRaise rejection (autoSurface=false)
 *   2. raise at Periscope layer → SUCCESS (RAISING → RAISED)
 *   3. RAISING progress 0→1
 *   4. UNKNOWN contact → OBSERVING / periscope.visualContact (CONFIRMED)
 *   5. classification Unknown → Merchant (ground truth)
 *   6. fire solution ESTIMATED → VISUAL CONFIRMED (HP up, confPen removed)
 *   7. lockTarget edge → lockedContactId; unlock on contact loss
 *   8. fire while locked + raised → TORPEDO FIRED + detection bonus
 *   9. lower: RAISED → LOWERING → SUBMERGED (progress 0→1)
 *  10. exposure bands LOW→MEDIUM→HIGH→CRITICAL + per-tick detection raise
 * Plus: determinism, auto-lower on depth leave, emergency dive (battery cost +
 * boosted lower), cannotRaise 'alreadyActive', FOV/range gating, engine-level
 * auto-surface integration, pause-freeze.
 */

import { describe, expect, it } from 'vitest';
import { loadBalance } from '../../src/core/balance';
import { createEventBus } from '../../src/core/eventBus';
import { createRng } from '../../src/core/rng';
import { FIXED_DT } from '../../src/core/time';
import { createGame, step, type SystemContext } from '../../src/core/engine';
import type {
  Contact,
  EnemyShip,
  MissionDef,
  PlayerInputs,
  SubmarineState,
} from '../../src/core/types';
import {
  createInitialPeriscopeState,
  exposureBandFor,
  periscopeSystem,
  visualRangeKm,
} from '../../src/periscope/periscope';
import { submarineSystem } from '../../src/gameplay/submarine';
import { combatSystem } from '../../src/combat/torpedo';
import { solveFireSolution } from '../../src/combat/fireControl';
import { normalizeDeg } from '../../src/sonar/contacts';

const BALANCE = loadBalance();
const IDLE_INPUT: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Periscope',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
  periscope: false,
  lockTarget: false,
  emergencyDive: false,
};

// ---------------------------------------------------------------------------
// Fixtures & harness
// ---------------------------------------------------------------------------

function makeMission(): MissionDef {
  return {
    id: 'M-T',
    name: 'Periscope Test',
    objective: { kind: 'sink', subgoals: [{ id: 'sink-1', weight: 1, desc: 'Sink' }] },
    patrolArea: { km: 30, gridM: 500 },
    fleet: {
      headingDeg: 90,
      speedKt: 9,
      formation: '2x2',
      colSpacingM: 500,
      rowSpacingM: 400,
      patrolBehavior: 'figure8',
    },
    spawns: [{ type: 'Merchant', x: 0, y: 20, headingDeg: 180 }],
    playerStart: { x: 0, y: 0, headingDeg: 0 },
    weather: 'Clear',
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed: 1001,
    briefingSeconds: 1,
  };
}

function makePlayer(overrides: Partial<SubmarineState> = {}): SubmarineState {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 0,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: 'Periscope',
    targetDepthLayer: 'Periscope',
    depthTransitionT: null,
    battery: 100,
    noise: 0,
    hull: 100,
    detection: 0,
    silentRunning: false,
    sonarState: 'idle',
    pingCooldown: 0,
    torpedoTubes: Array.from({ length: 4 }, (_, i) => ({
      id: `T-${String(i + 1).padStart(2, '0')}`,
      state: 'LOADED' as const,
      targetContactId: null,
    })),
    decoyCount: BALANCE.decoy.perMission,
    lowBattery: false,
    outOfBoundsTimer: 0,
    ...overrides,
  };
}

/** A merchant 1 km north of the player — dead-center in the FOV (view 0°). */
function makeEnemy(overrides: Partial<EnemyShip> = {}): EnemyShip {
  return {
    id: 'E-01',
    shipClass: 'Merchant',
    position: { x: 0, y: 1 },
    headingDeg: 180, // math convention → compass headingEstimate 270
    speedKt: 9,
    hull: 100,
    aiState: 'NORMAL',
    lkp: null,
    depthChargesLeft: 0,
    activePingCooldown: 0,
    inConvoy: false,
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'C-01',
    state: 'UNKNOWN',
    bearingDeg: 0,
    rangeKm: null,
    bearingErrorDeg: 3,
    rangeErrorFrac: 0.2,
    speedEstimateKt: null,
    headingEstimateDeg: null,
    speedErrorFrac: 0.2,
    classification: 'Unknown',
    classifyConfidence: 0,
    confidence: 10,
    signalStrength: 'Medium',
    lastDetectedAt: 0,
    lastPingAt: 0,
    lastBearingAt: 0,
    observations: 1,
    trueShipId: 'E-01',
    ...overrides,
  };
}

interface CtxOptions {
  seed?: number;
  dt?: number;
  player?: SubmarineState;
  enemies?: EnemyShip[];
  contacts?: Contact[];
  balance?: typeof BALANCE;
}

function makeCtx(opts: CtxOptions = {}): SystemContext {
  const seed = opts.seed ?? 1001;
  const rng = createRng(seed);
  const mission = makeMission();
  const balance = opts.balance ?? BALANCE;
  return {
    dt: opts.dt ?? FIXED_DT,
    simTime: 0,
    state: 'MISSION_RUNNING',
    pauseEdge: false,
    pingEdge: false,
    decoyEdge: false,
    periscopeEdge: false,
    lockEdge: false,
    diveEdge: false,
    inputs: { ...IDLE_INPUT },
    bus: createEventBus(),
    balance,
    mission,
    forks: {
      world: rng.fork('world'),
      missions: rng.fork('missions'),
      submarine: rng.fork('submarine'),
      sonar: rng.fork('sonar'),
      ai: rng.fork('ai'),
      combat: rng.fork('combat'),
      detection: rng.fork('detection'),
      objectives: rng.fork('objectives'),
    },
    player: opts.player ?? makePlayer(),
    contacts: opts.contacts ?? [],
    enemies: opts.enemies ?? [],
    torpedoes: [],
    decoys: [],
    missionStatus: {
      missionId: mission.id,
      phase: 'running',
      objectives: [],
      escaped: false,
      forcedSurface: false,
    },
    score: {
      objective: 0,
      damage: 0,
      stealth: 0,
      torpedoEfficiency: 0,
      time: 0,
      survival: 0,
      total: 0,
      grade: 'Failed',
    },
    stats: {
      torpedoesFired: 0,
      torpedoesHit: 0,
      peakDetection: 0,
      elapsedS: 0,
      torpedoesRemaining: 4,
      bestScore: 0,
    },
    periscope: createInitialPeriscopeState(),
    skip: false,
  };
}

interface TickOpts {
  inputs?: Partial<PlayerInputs>;
  periscopeEdge?: boolean;
  lockEdge?: boolean;
  diveEdge?: boolean;
}

/** One periscope tick (sync bus simTime, set edges/inputs, run the system). */
function tick(ctx: SystemContext, opts: TickOpts = {}): void {
  ctx.inputs = { ...IDLE_INPUT, ...opts.inputs };
  ctx.periscopeEdge = opts.periscopeEdge ?? false;
  ctx.lockEdge = opts.lockEdge ?? false;
  ctx.diveEdge = opts.diveEdge ?? false;
  ctx.bus.setSimTime(ctx.simTime);
  periscopeSystem(ctx);
  ctx.simTime += ctx.dt;
}

/** Raise from SUBMERGED to RAISED (fails the test on any detour). */
function raiseToRaised(ctx: SystemContext): void {
  tick(ctx, { periscopeEdge: true });
  for (let i = 0; i < 200 && ctx.periscope!.state !== 'RAISED'; i++) tick(ctx);
  expect(ctx.periscope!.state).toBe('RAISED');
  expect(ctx.periscope!.raisedDurationS).toBe(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('periscope state machine', () => {
  it('1. too deep: canRaise=false reason tooDeep; autoSurface rises (SURFACING), never immediately RAISED', () => {
    const ctx = makeCtx({
      player: makePlayer({ depthLayer: 'Medium', targetDepthLayer: 'Medium' }),
    });
    tick(ctx); // first tick populates canRaise/cannotRaiseReason
    expect(ctx.periscope!.canRaise).toBe(false);
    expect(ctx.periscope!.cannotRaiseReason).toBe('tooDeep');
    tick(ctx, { periscopeEdge: true });
    expect(ctx.periscope!.state).toBe('SURFACING');
    expect(ctx.periscope!.state).not.toBe('RAISED');
    expect(ctx.player.targetDepthLayer).toBe(BALANCE.periscope.requiredLayer);
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.raising')).toHaveLength(0);
    // once the submarine reaches the Periscope layer → RAISING
    ctx.player.depthLayer = 'Periscope';
    tick(ctx);
    expect(ctx.periscope!.state).toBe('RAISING');
    expect(ctx.bus.getLog().some((e) => e.type === 'periscope.raising')).toBe(true);
  });

  it('1b. autoSurface=false rejects the raise from a deeper layer with cannotRaise tooDeep', () => {
    const custom = { ...BALANCE, periscope: { ...BALANCE.periscope, autoSurface: false } };
    const ctx = makeCtx({
      player: makePlayer({ depthLayer: 'Deep', targetDepthLayer: 'Deep' }),
      balance: custom,
    });
    tick(ctx, { periscopeEdge: true });
    expect(ctx.periscope!.state).toBe('SUBMERGED');
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.cannotRaise')).toEqual([
      expect.objectContaining({ payload: { reason: 'tooDeep' } }),
    ]);
  });

  it('1c. Surface layer: canRaise=false reason wrongLayer; raise rejected (wrongLayer)', () => {
    const ctx = makeCtx({
      player: makePlayer({ depthLayer: 'Surface', targetDepthLayer: 'Surface' }),
    });
    tick(ctx); // first tick populates canRaise/cannotRaiseReason
    expect(ctx.periscope!.cannotRaiseReason).toBe('wrongLayer');
    tick(ctx, { periscopeEdge: true });
    expect(ctx.periscope!.state).toBe('SUBMERGED');
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.cannotRaise')[0]!.payload).toEqual({
      reason: 'wrongLayer',
    });
  });

  it('2+3. at Periscope layer: raise → RAISING (periscope.raising) → RAISED after raiseTimeS with progress 0→1', () => {
    const ctx = makeCtx();
    tick(ctx, { periscopeEdge: true });
    expect(ctx.periscope!.state).toBe('RAISING');
    expect(ctx.periscope!.progress).toBe(0);
    expect(ctx.bus.getLog().some((e) => e.type === 'periscope.raising')).toBe(true);
    const raiseTicks = Math.ceil(BALANCE.periscope.raiseTimeS / FIXED_DT); // 64
    for (let i = 0; i < raiseTicks - 1; i++) tick(ctx);
    expect(ctx.periscope!.state).toBe('RAISING');
    expect(ctx.periscope!.progress).toBeGreaterThan(0);
    expect(ctx.periscope!.progress).toBeLessThan(1);
    tick(ctx);
    expect(ctx.periscope!.state).toBe('RAISED');
    expect(ctx.periscope!.progress).toBe(1);
    const types = ctx.bus.getLog().map((e) => e.type);
    expect(types).toContain('periscope.ready');
    expect(types).toContain('periscope.raised');
    expect(types.indexOf('periscope.ready')).toBeLessThan(types.indexOf('periscope.raised'));
  });

  it('cannotRaise alreadyActive while raising', () => {
    const ctx = makeCtx();
    tick(ctx, { periscopeEdge: true }); // → RAISING
    tick(ctx, { periscopeEdge: true }); // second request while raising
    expect(ctx.periscope!.state).toBe('RAISING');
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.cannotRaise')).toEqual([
      expect.objectContaining({ payload: { reason: 'alreadyActive' } }),
    ]);
  });

  it('9. lower: edge while RAISED → LOWERING (progress 0→1) → SUBMERGED + periscope.lowered', () => {
    const ctx = makeCtx();
    raiseToRaised(ctx);
    tick(ctx, { periscopeEdge: true });
    expect(ctx.periscope!.state).toBe('LOWERING');
    expect(ctx.periscope!.progress).toBe(0);
    const lowerTicks = Math.ceil(BALANCE.periscope.lowerTimeS / FIXED_DT); // 40
    for (let i = 0; i < lowerTicks - 1; i++) tick(ctx);
    expect(ctx.periscope!.state).toBe('LOWERING');
    expect(ctx.periscope!.progress).toBeLessThan(1);
    tick(ctx);
    expect(ctx.periscope!.state).toBe('SUBMERGED');
    expect(ctx.periscope!.progress).toBe(0);
    expect(ctx.periscope!.raisedDurationS).toBe(0);
    expect(ctx.bus.getLog().some((e) => e.type === 'periscope.lowered')).toBe(true);
  });

  it('auto-lower when leaving the Periscope layer while raised (depth guard)', () => {
    const ctx = makeCtx();
    raiseToRaised(ctx);
    ctx.player.depthLayer = 'Deep'; // the sub dove away
    tick(ctx);
    expect(ctx.periscope!.state).toBe('LOWERING');
  });

  it('periscope edge during SURFACING cancels the auto-rise', () => {
    const ctx = makeCtx({
      player: makePlayer({ depthLayer: 'Medium', targetDepthLayer: 'Medium' }),
    });
    tick(ctx, { periscopeEdge: true }); // → SURFACING
    expect(ctx.periscope!.state).toBe('SURFACING');
    tick(ctx, { periscopeEdge: true }); // cancel
    expect(ctx.periscope!.state).toBe('SUBMERGED');
    expect(ctx.player.targetDepthLayer).toBe(ctx.player.depthLayer); // depth frozen
  });
});

describe('visual observation (the core reward)', () => {
  it('4+5. UNKNOWN contact in view → OBSERVING, CONFIRMED with ground-truth type', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    raiseToRaised(ctx);
    expect(ctx.periscope!.state).toBe('RAISED');
    tick(ctx);
    expect(ctx.periscope!.state).toBe('OBSERVING');
    expect(ctx.periscope!.observingContactId).toBe('C-01');
    const c = ctx.contacts[0]!;
    expect(c.state).toBe('CONFIRMED');
    expect(c.classification).toBe('Merchant');
    expect(c.classifyConfidence).toBe(BALANCE.periscope.observeConfidence);
    expect(c.confidence).toBe(BALANCE.periscope.observeConfidence);
    expect(c.rangeKm).toBeCloseTo(1, 9);
    expect(c.rangeErrorFrac).toBe(0);
    expect(c.speedEstimateKt).toBe(9);
    expect(c.headingEstimateDeg).toBe(normalizeDeg(90 - 180)); // 270 (compass)
    expect(c.speedErrorFrac).toBe(0);
    expect(c.signalStrength).toBe('Strong');
    expect(c.visuallyConfirmed).toBe(true);
    const types = ctx.bus.getLog().map((e) => e.type);
    expect(types.filter((t) => t === 'periscope.visualContact')).toHaveLength(1);
    expect(types.filter((t) => t === 'periscope.classified')).toHaveLength(1);
    expect(
      ctx.bus.getLog().filter((e) => e.type === 'periscope.visualContact')[0]!.payload,
    ).toEqual({
      contactId: 'C-01',
      classification: 'Merchant',
    });
  });

  it('visual events fire once per target even while observing for many ticks', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    raiseToRaised(ctx);
    for (let i = 0; i < 50; i++) tick(ctx);
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.visualContact')).toHaveLength(1);
    expect(ctx.bus.getLog().filter((e) => e.type === 'periscope.classified')).toHaveLength(1);
    expect(ctx.periscope!.observingContactId).toBe('C-01');
  });

  it('FOV and range gating: target outside the cone or beyond visual range is not observed', () => {
    // 45° off the 16° cone centered on view bearing 0°
    const offFov = makeCtx({
      contacts: [makeContact()],
      enemies: [makeEnemy({ position: { x: 1, y: 1 } })],
    });
    raiseToRaised(offFov);
    tick(offFov);
    expect(offFov.periscope!.state).toBe('RAISED');
    expect(offFov.periscope!.observingContactId).toBeNull();
    // beyond visual range: 6 km > min(5, Clear 10) = 5 km
    const far = makeCtx({
      contacts: [makeContact()],
      enemies: [makeEnemy({ position: { x: 0, y: 6 } })],
    });
    raiseToRaised(far);
    tick(far);
    expect(far.periscope!.state).toBe('RAISED');
    expect(far.periscope!.observingContactId).toBeNull();
  });

  it('visual range is capped by the active weather visibility', () => {
    const ctx = makeCtx(); // Clear mission → visibility 10 km
    expect(visualRangeKm(ctx)).toBeCloseTo(Math.min(BALANCE.periscope.maxVisualRangeKm, 10), 9);
    const foggy = makeCtx({ player: makePlayer() });
    foggy.mission = { ...foggy.mission, weather: 'Fog' };
    expect(visualRangeKm(foggy)).toBeCloseTo(Math.min(BALANCE.periscope.maxVisualRangeKm, 1.5), 9);
  });

  it('6. fire solution: ESTIMATED → VISUAL CONFIRMED (confidence penalty removed, HP up)', () => {
    // Imprecise sonar track: confidence 70 → confPen 0.10
    const imprecise = makeContact({
      state: 'TRACKED',
      rangeKm: 2,
      headingEstimateDeg: 270,
      speedEstimateKt: 9,
      confidence: 70,
      classification: 'Merchant',
    });
    const estimated = solveFireSolution(imprecise, makePlayer(), BALANCE);
    expect(estimated.status).toBe('ESTIMATED');
    const withConfPen = estimated.hitProbability;
    const visual = solveFireSolution(imprecise, makePlayer(), BALANCE, true);
    expect(visual.status).toBe('VISUAL CONFIRMED');
    expect(visual.estimated).toBe(false);
    expect(visual.hitProbability).toBeCloseTo(
      withConfPen + BALANCE.hitProbability.confidencePen['70']!,
      9,
    );
    // and after the periscope upgrade (98 conf, precise data) the visual solve is near-ideal
    const observed = makeContact({
      state: 'CONFIRMED',
      rangeKm: 1,
      headingEstimateDeg: 270,
      speedEstimateKt: 9,
      confidence: 98,
      classification: 'Merchant',
      visuallyConfirmed: true,
    });
    const confirmed = solveFireSolution(observed, makePlayer(), BALANCE, true);
    expect(confirmed.status).toBe('VISUAL CONFIRMED');
    expect(confirmed.hitProbability).toBeCloseTo(0.85 - 0.04, 9); // only the 9 kt speed penalty
  });
});

describe('lock & fire', () => {
  it('7. lockTarget edge → lockedContactId + periscope.locked; unlock on contact loss', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    raiseToRaised(ctx);
    tick(ctx); // → OBSERVING
    tick(ctx, { lockEdge: true });
    expect(ctx.periscope!.lockedContactId).toBe('C-01');
    expect(ctx.bus.getLog().some((e) => e.type === 'periscope.locked')).toBe(true);
    // contact removed (sonar decay) → unlock
    ctx.contacts.length = 0;
    tick(ctx);
    expect(ctx.periscope!.lockedContactId).toBeNull();
    expect(ctx.bus.getLog().some((e) => e.type === 'periscope.unlocked')).toBe(true);
  });

  it('8. fire while locked + raised: torpedo fired + raised detection bonus', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    raiseToRaised(ctx);
    tick(ctx); // OBSERVING
    tick(ctx, { lockEdge: true });
    const detectionBefore = ctx.player.detection;
    ctx.inputs = { ...IDLE_INPUT, fireTorpedo: 'C-01' };
    ctx.bus.setSimTime(ctx.simTime);
    combatSystem(ctx);
    const fired = ctx.bus.getLog().filter((e) => e.type === 'torpedo.fired');
    expect(fired).toHaveLength(2); // salvo on the locked contact
    const expected =
      BALANCE.detection.sources.torpedoFired + BALANCE.periscope.torpedoFiredWhileRaisedBonus;
    expect(ctx.player.detection).toBeCloseTo(detectionBefore + expected, 9);
    expect(ctx.torpedoes.every((t) => t.targetContactId === 'C-01')).toBe(true);
  });

  it('firing while submerged does NOT get the raised bonus', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    const detectionBefore = ctx.player.detection;
    ctx.inputs = { ...IDLE_INPUT, fireTorpedo: 'C-01' };
    ctx.bus.setSimTime(ctx.simTime);
    combatSystem(ctx);
    expect(ctx.player.detection).toBeCloseTo(
      detectionBefore + BALANCE.detection.sources.torpedoFired,
      9,
    );
  });
});

describe('exposure & risk', () => {
  it('10. exposure bands LOW→MEDIUM→HIGH→CRITICAL with per-tick detection raises', () => {
    // dt = 1 s → band boundaries land on exact seconds (no float drift).
    const ctx = makeCtx({ dt: 1 }); // no contacts → stays RAISED
    raiseToRaised(ctx);
    expect(ctx.periscope!.exposureBand).toBe('NONE');
    // 3 s: LOW (0.4/s) → +1.2
    for (let i = 0; i < 3; i++) tick(ctx);
    expect(ctx.periscope!.exposureBand).toBe('LOW');
    expect(ctx.periscope!.exposure).toBeCloseTo((3 / 15) * 100, 9);
    expect(ctx.player.detection).toBeCloseTo(0.4 * 3, 6);
    // 8 s: MEDIUM (1.0/s) → +5.0
    for (let i = 0; i < 5; i++) tick(ctx);
    expect(ctx.periscope!.exposureBand).toBe('MEDIUM');
    expect(ctx.player.detection).toBeCloseTo(0.4 * 3 + 1.0 * 5, 6);
    // 15 s: HIGH (2.0/s) → +14.0
    for (let i = 0; i < 7; i++) tick(ctx);
    expect(ctx.periscope!.exposureBand).toBe('HIGH');
    expect(ctx.player.detection).toBeCloseTo(0.4 * 3 + 1.0 * 5 + 2.0 * 7, 6);
    // 18 s: CRITICAL (4.0/s) → +12.0
    for (let i = 0; i < 3; i++) tick(ctx);
    expect(ctx.periscope!.exposureBand).toBe('CRITICAL');
    expect(ctx.player.detection).toBeCloseTo(0.4 * 3 + 1.0 * 5 + 2.0 * 7 + 4.0 * 3, 6);
    expect(ctx.periscope!.exposure).toBe(100);
    // band events: NONE→LOW, LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL
    const bands = ctx.bus
      .getLog()
      .filter((e) => e.type === 'periscope.exposure')
      .map((e) => e.payload!.band);
    expect(bands).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('exposureBandFor matches the balance thresholds', () => {
    expect(exposureBandFor(0, BALANCE.periscope)).toBe('LOW');
    expect(exposureBandFor(3, BALANCE.periscope)).toBe('LOW');
    expect(exposureBandFor(3.05, BALANCE.periscope)).toBe('MEDIUM');
    expect(exposureBandFor(8.05, BALANCE.periscope)).toBe('HIGH');
    expect(exposureBandFor(15.05, BALANCE.periscope)).toBe('CRITICAL');
  });

  it('submerged periscope never raises detection', () => {
    const ctx = makeCtx();
    for (let i = 0; i < 100; i++) tick(ctx);
    expect(ctx.player.detection).toBe(0);
    expect(ctx.bus.getLog()).toHaveLength(0);
  });
});

describe('emergency dive', () => {
  it('13. diveEdge while raised lowers at the boosted rate; submarine pays battery + event', () => {
    const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
    raiseToRaised(ctx);
    // submarine system: battery cost + sub.emergencyDive (the STOPPED band
    // also drains 0.02/s × dt in the same tick)
    ctx.inputs = { ...IDLE_INPUT, depthLayerTarget: 'Deep', emergencyDive: true };
    ctx.diveEdge = true;
    ctx.bus.setSimTime(ctx.simTime);
    submarineSystem(ctx);
    const bandDrain = BALANCE.speedBands.STOPPED.batteryDrainPerSec * FIXED_DT;
    expect(ctx.player.battery).toBeCloseTo(
      100 - BALANCE.battery.emergencyDiveCostPercent - bandDrain,
      9,
    );
    expect(ctx.bus.getLog().some((e) => e.type === 'sub.emergencyDive')).toBe(true);
    // periscope: boosted lower (0.5 s = 10 ticks)
    periscopeSystem(ctx);
    ctx.simTime += ctx.dt;
    expect(ctx.periscope!.state).toBe('LOWERING');
    for (let i = 0; i < 30 && ctx.periscope!.state !== 'SUBMERGED'; i++) tick(ctx);
    expect(ctx.periscope!.state).toBe('SUBMERGED');
  });

  it('emergency dive cancels an in-progress auto-surface', () => {
    const ctx = makeCtx({
      player: makePlayer({ depthLayer: 'Medium', targetDepthLayer: 'Medium' }),
    });
    tick(ctx, { periscopeEdge: true }); // → SURFACING
    tick(ctx, { diveEdge: true });
    expect(ctx.periscope!.state).toBe('SUBMERGED');
  });
});

describe('determinism & pause', () => {
  it('same seed + same inputs → identical periscope state, contacts, and events', () => {
    const run = (): string => {
      const ctx = makeCtx({ contacts: [makeContact()], enemies: [makeEnemy()] });
      raiseToRaised(ctx);
      for (let i = 0; i < 30; i++) tick(ctx);
      tick(ctx, { lockEdge: true });
      for (let i = 0; i < 20; i++) tick(ctx);
      tick(ctx, { periscopeEdge: true }); // lower
      for (let i = 0; i < 60; i++) tick(ctx);
      return JSON.stringify({
        periscope: ctx.periscope,
        contact: ctx.contacts[0],
        detection: ctx.player.detection,
        events: ctx.bus.getLog(),
      });
    };
    expect(run()).toBe(run());
  });

  it('periscope state freezes while the mission is paused (engine level)', () => {
    const def = makeMission();
    const handle = createGame(def, def.seed);
    // briefing (1 s = 20 ticks) + Shallow→Periscope transition (3 s = 60 ticks) + margin
    let snap = step(handle, FIXED_DT, { ...IDLE_INPUT, depthLayerTarget: 'Periscope' });
    for (let t = 0; t < 119; t++)
      snap = step(handle, FIXED_DT, { ...IDLE_INPUT, depthLayerTarget: 'Periscope' });
    expect(snap.playerSub.depthLayer).toBe('Periscope');
    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, periscope: true }); // edge → RAISING
    expect(snap.periscope.state).toBe('RAISING');
    for (let t = 0; t < 100; t++) snap = step(handle, FIXED_DT, IDLE_INPUT);
    expect(snap.periscope.state).toBe('RAISED');
    const durationBeforePause = snap.periscope.raisedDurationS;
    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, pause: true });
    expect(snap.state).toBe('PAUSED');
    for (let t = 0; t < 50; t++) snap = step(handle, FIXED_DT, IDLE_INPUT);
    expect(snap.state).toBe('PAUSED');
    expect(snap.periscope.state).toBe('RAISED');
    expect(snap.periscope.raisedDurationS).toBe(durationBeforePause); // frozen
    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, pause: true }); // resume
    snap = step(handle, FIXED_DT, IDLE_INPUT);
    expect(snap.periscope.state).toBe('RAISED');
    expect(snap.periscope.raisedDurationS).toBeGreaterThan(durationBeforePause);
  });

  it('engine-level auto-surface: Medium → SURFACING → submarine rises → RAISED', () => {
    const def = makeMission();
    const handle = createGame(def, def.seed);
    let snap = step(handle, FIXED_DT, { ...IDLE_INPUT, depthLayerTarget: 'Medium' });
    for (let t = 0; t < 119; t++)
      snap = step(handle, FIXED_DT, { ...IDLE_INPUT, depthLayerTarget: 'Medium' });
    expect(snap.playerSub.depthLayer).toBe('Medium');
    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, periscope: true }); // raise from Medium
    expect(snap.periscope.state).toBe('SURFACING');
    // the submarine system holds Periscope while surfacing (2 layers = 120 ticks)
    for (let t = 0; t < 120 && snap.periscope.state !== 'RAISED'; t++) {
      snap = step(handle, FIXED_DT, { ...IDLE_INPUT, depthLayerTarget: 'Medium' }); // player input still says Medium
    }
    expect(snap.playerSub.depthLayer).toBe('Periscope');
    for (let t = 0; t < 100 && snap.periscope.state !== 'RAISED'; t++)
      snap = step(handle, FIXED_DT, IDLE_INPUT);
    expect(snap.periscope.state).toBe('RAISED');
  });
});
