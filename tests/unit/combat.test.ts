/**
 * SILENT DEPTH — combat system unit tests (tests/unit/combat.test.ts)
 *
 * Task t-007 acceptance (combat-gate):
 *   - torpedo fire → run → hit (damage applied, ship sunk at hull ≤ 0)
 *   - near-miss vs miss vs expire
 *   - fire solution HP math (range/AOB/speed/confidence penalties from balance)
 *   - salvo display math (1 − (1−HP)²)
 *   - depth-charge damage tiers + Deep ×1.5
 *   - pending-damage drain applies once per tick and never leaks
 *   - detection sinks (all five) + band crossing events + located grace
 *   - collision damage
 *   - determinism (seeded forks; same seed → same rolls; no Math.random)
 *
 * The combat/detection systems are not wired into the engine yet — these
 * tests drive them through a hand-built SystemContext exactly like the engine
 * would (slot 7 combat, slot 8 detection).
 */

import { describe, expect, it } from 'vitest';
import { loadBalance } from '../../src/core/balance';
import { createEventBus } from '../../src/core/eventBus';
import { createRng } from '../../src/core/rng';
import { FIXED_DT } from '../../src/core/time';
import type { SystemContext } from '../../src/core/engine';
import type {
  Contact,
  EnemyShip,
  MissionDef,
  PlayerInputs,
  SubmarineState,
  Torpedo,
} from '../../src/core/types';
import { combatSystem, getCombatRuntime, createTorpedo } from '../../src/combat/torpedo';
import { solveFireSolution, type FireSolution } from '../../src/combat/fireControl';
import { depthChargeDamage } from '../../src/combat/depthCharge';
import {
  detectionSystem,
  getDetectionRuntime,
  stoppedSilentPerSec,
  silentSilentPerSec,
  diveSink,
  decoyLaunchSink,
  distanceSinkPerSec,
  nearestEscortKm,
  bandIndexFor,
  minAngleDelta,
} from '../../src/combat/detection';
import { aiSystem, drainAiPendingDamage, resetAiPendingOutput } from '../../src/ai/ai';

// ---------------------------------------------------------------------------
// Fixtures & harness
// ---------------------------------------------------------------------------

const BALANCE = loadBalance();
const IDLE_INPUT: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
};

function makeMission(): MissionDef {
  return {
    id: 'M-T',
    name: 'Combat Test',
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
    spawns: [{ type: 'Merchant', x: 10, y: 10, headingDeg: 90 }],
    playerStart: { x: 15, y: 15, headingDeg: 0 },
    weather: 'Clear',
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed: 1001,
    briefingSeconds: 2,
  };
}

function makePlayer(overrides: Partial<SubmarineState> = {}): SubmarineState {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 0,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: 'Shallow',
    targetDepthLayer: 'Shallow',
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

function makeEnemy(overrides: Partial<EnemyShip> = {}): EnemyShip {
  return {
    id: 'E-01',
    shipClass: 'Merchant',
    position: { x: 0.5, y: 0 },
    headingDeg: 0,
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
    state: 'TRACKED',
    bearingDeg: 90,
    rangeKm: 0.5,
    bearingErrorDeg: 0.5,
    rangeErrorFrac: 0.02,
    speedEstimateKt: 0,
    headingEstimateDeg: 0,
    speedErrorFrac: 0.05,
    classification: 'Merchant',
    classifyConfidence: 90,
    confidence: 95,
    signalStrength: 'Strong',
    lastDetectedAt: 0,
    lastPingAt: 0,
    lastBearingAt: 0,
    observations: 5,
    trueShipId: 'E-01',
    ...overrides,
  };
}

interface CtxOptions {
  seed?: number;
  dt?: number;
  simTime?: number;
  player?: SubmarineState;
  enemies?: EnemyShip[];
  contacts?: Contact[];
  torpedoes?: Torpedo[];
  bus?: ReturnType<typeof createEventBus>;
}

function makeCtx(opts: CtxOptions = {}): SystemContext {
  const seed = opts.seed ?? 1001;
  const rng = createRng(seed);
  const mission = makeMission();
  return {
    dt: opts.dt ?? FIXED_DT,
    simTime: opts.simTime ?? 0,
    state: 'MISSION_RUNNING',
    pauseEdge: false,
    pingEdge: false,
    decoyEdge: false,
    inputs: { ...IDLE_INPUT },
    bus: opts.bus ?? createEventBus(),
    balance: BALANCE,
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
    torpedoes: opts.torpedoes ?? [],
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
    skip: false,
  };
}

interface TickOpts {
  inputs?: Partial<PlayerInputs>;
}

/** One combat tick: sync bus simTime, set inputs, run combatSystem. */
function tick(ctx: SystemContext, opts: TickOpts = {}): void {
  ctx.inputs = { ...IDLE_INPUT, ...opts.inputs };
  ctx.bus.setSimTime(ctx.simTime);
  combatSystem(ctx);
  ctx.simTime += ctx.dt;
}

/** One ai+combat tick (for the pending-damage bridge test). */
function tickAiAndCombat(ctx: SystemContext, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    ctx.simTime += ctx.dt;
    ctx.bus.setSimTime(ctx.simTime);
    aiSystem(ctx);
    combatSystem(ctx);
  }
}

// ---------------------------------------------------------------------------
// Fire control (§7.3/§7.4, F6/F7)
// ---------------------------------------------------------------------------

/** Fire-solution scenario: player (0,0), target east, configurable course. */
function solution(overrides: Partial<Contact> = {}): FireSolution {
  const contact = makeContact({ rangeKm: 1, ...overrides });
  return solveFireSolution(contact, makePlayer(), BALANCE);
}

describe('fire control (F6/F7)', () => {
  it('HP is the balance base at ideal geometry (range 1, AOB 90, slow, confident, Merchant)', () => {
    // target east of player heading north → AOB 90 (broadside)
    const s = solution({
      bearingDeg: 90,
      headingEstimateDeg: 0,
      speedEstimateKt: 4,
      confidence: 95,
    });
    expect(s.hitProbability).toBeCloseTo(BALANCE.hitProbability.base, 9); // 0.85
    expect(s.estimated).toBe(false);
  });

  it('applies the range penalty from balance (piecewise)', () => {
    expect(solution({ rangeKm: 1 }).hitProbability).toBeCloseTo(0.85, 9);
    expect(solution({ rangeKm: 3 }).hitProbability).toBeCloseTo(0.85 - 0.075, 9); // interp(2→4)
    expect(solution({ rangeKm: 5 }).hitProbability).toBeCloseTo(0.85 - 0.25, 9); // interp(4→6)
    expect(solution({ rangeKm: 6 }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.rangePen.le6km,
      9,
    ); // 0.50
    // unknown range → worst case
    expect(solution({ rangeKm: null }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.rangePen.le6km,
      9,
    );
  });

  it('applies the AOB penalty table (0 head-on … 90 broadside)', () => {
    // AOB 0: target heading straight at the observer
    expect(solution({ bearingDeg: 90, headingEstimateDeg: 270 }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.aobPen['0deg'],
      9,
    );
    // AOB 45
    expect(solution({ bearingDeg: 90, headingEstimateDeg: 225 }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.aobPen['45deg'],
      9,
    );
    // AOB 90 (ideal)
    expect(solution({ bearingDeg: 90, headingEstimateDeg: 0 }).hitProbability).toBeCloseTo(0.85, 9);
    // unknown course → mid default ('45deg')
    expect(solution({ headingEstimateDeg: null }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.aobPen['45deg'],
      9,
    );
  });

  it('applies the target-speed and confidence penalties', () => {
    expect(solution({ speedEstimateKt: 25 }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.targetSpeedPen['20ktPlus'],
      9,
    );
    expect(solution({ speedEstimateKt: 10 }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.targetSpeedPen['10kt'],
      9,
    );
    expect(solution({ confidence: 45 }).hitProbability).toBeCloseTo(0.85 - 0.2375, 9); // interp(70→50)
    expect(solution({ confidence: 95 }).hitProbability).toBeCloseTo(0.85, 9);
  });

  it('applies the maneuver penalty by classification and clamps to [0.05, 0.95]', () => {
    expect(solution({ classification: 'Destroyer' }).hitProbability).toBeCloseTo(
      0.85 - BALANCE.hitProbability.maneuverPen['Destroyer']!,
      9,
    );
    expect(solution({ classification: 'Unknown' }).hitProbability).toBeCloseTo(0.85, 9);
    const worst = solution({
      rangeKm: 6,
      headingEstimateDeg: 270,
      speedEstimateKt: 25,
      confidence: 5,
      classification: 'Destroyer',
    });
    expect(worst.hitProbability).toBe(BALANCE.hitProbability.clampMin); // 0.05
  });

  it('salvo display probability is 1 − (1−HP)²', () => {
    const s = solution({ rangeKm: 6 }); // HP = 0.50
    expect(s.hitProbability).toBeCloseTo(0.5, 9);
    expect(s.salvoHitProbability).toBeCloseTo(1 - (1 - 0.5) ** 2, 9); // 0.75
    const perfect = solution({});
    expect(perfect.salvoHitProbability).toBeCloseTo(1 - (1 - perfect.hitProbability) ** 2, 9);
  });

  it('computes the F6 lead angle and firing bearing (broadside target)', () => {
    // target east of the player (bearing 90), heading south (180) at 9 kt
    const s = solution({ bearingDeg: 90, headingEstimateDeg: 180, speedEstimateKt: 9 });
    expect(s.aobDeg).toBeCloseTo(90, 9);
    const expectedLead =
      (Math.atan2(9 * Math.sin(Math.PI / 2), 9 * Math.cos(Math.PI / 2) + BALANCE.torpedo.speedKt) *
        180) /
      Math.PI;
    expect(s.leadAngleDeg).toBeCloseTo(expectedLead, 9); // ≈ 12.68
    expect(s.bearingDeg).toBeCloseTo(90 + expectedLead, 9); // ≈ 102.68
  });

  it('head-on and receding targets need no lead', () => {
    const headOn = solution({ bearingDeg: 90, headingEstimateDeg: 270, speedEstimateKt: 9 });
    expect(headOn.leadAngleDeg).toBeCloseTo(0, 9);
    expect(headOn.bearingDeg).toBeCloseTo(90, 9);
    const receding = solution({ bearingDeg: 90, headingEstimateDeg: 90, speedEstimateKt: 9 });
    expect(receding.leadAngleDeg).toBeCloseTo(0, 6);
  });

  it('flags estimated solutions when inputs are missing', () => {
    expect(solution({ rangeKm: null }).estimated).toBe(true);
    expect(solution({ headingEstimateDeg: null }).estimated).toBe(true);
    expect(solution({ speedEstimateKt: null }).estimated).toBe(true);
    expect(solution({}).estimated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Torpedo fire
// ---------------------------------------------------------------------------

describe('torpedo fire', () => {
  it('fires a salvo of up to 2 tubes with ready→fired events, +15 detection (t-015: 20 → 15)', () => {
    const ship = makeEnemy();
    const ctx = makeCtx({ enemies: [ship], contacts: [makeContact()] });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });

    expect(ctx.stats.torpedoesFired).toBe(2);
    expect(ctx.player.detection).toBe(BALANCE.detection.sources.torpedoFired); // 15 (t-015: 20 → 15)
    expect(ctx.player.torpedoTubes.filter((t) => t.state === 'FIRED')).toHaveLength(2);
    expect(ctx.torpedoes).toHaveLength(2);
    expect(ctx.torpedoes.every((t) => t.state === 'RUNNING')).toBe(true);
    expect(ctx.torpedoes[0]!.headingDeg).toBeCloseTo(90, 9); // lead 0 → target bearing
    expect(ctx.torpedoes[0]!.targetShipId).toBe('E-01');
    expect(ctx.torpedoes[0]!.targetContactId).toBe('C-01');
    expect(ctx.torpedoes[0]!.firedAt).toBe(ctx.simTime - ctx.dt);

    const fired = ctx.bus.getLog().filter((e) => e.type === 'torpedo.fired');
    const ready = ctx.bus.getLog().filter((e) => e.type === 'torpedo.ready');
    expect(fired).toHaveLength(2);
    expect(ready).toHaveLength(2);
    expect(fired[0]!.payload).toEqual({ tubeId: 'T-01', targetContactId: 'C-01' });
  });

  it('rejects fire when no tubes are ready/loaded (notReady)', () => {
    const ctx = makeCtx({
      enemies: [makeEnemy()],
      contacts: [makeContact()],
      player: makePlayer({ torpedoTubes: [{ id: 'T-01', state: 'FIRED', targetContactId: null }] }),
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    expect(ctx.bus.getLog().filter((e) => e.type === 'torpedo.fireRejected')).toEqual([
      expect.objectContaining({ payload: { reason: 'notReady', contactId: 'C-01' } }),
    ]);
    expect(ctx.torpedoes).toHaveLength(0);
  });

  it('rejects fire at a contact without a live ship (noTarget)', () => {
    const ctx = makeCtx({
      contacts: [makeContact({ trueShipId: null })],
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    expect(ctx.bus.getLog().filter((e) => e.type === 'torpedo.fireRejected')[0]!.payload).toEqual({
      reason: 'noTarget',
      contactId: 'C-01',
    });
    expect(ctx.torpedoes).toHaveLength(0);
  });

  it('rejects fire at an already-sunk ship (noTarget)', () => {
    const ctx = makeCtx({
      enemies: [makeEnemy({ hull: 0 })],
      contacts: [makeContact()],
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    expect(ctx.torpedoes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Torpedo run → hit / near-miss / expire
// ---------------------------------------------------------------------------

describe('torpedo lifecycle', () => {
  /** Single-tube player so salvo doesn't mask single-torpedo assertions. */
  function singleTubePlayer(): SubmarineState {
    return makePlayer({ torpedoTubes: [{ id: 'T-01', state: 'LOADED', targetContactId: null }] });
  }

  it('fires, runs straight, and HITs a stationary target: damage applied', () => {
    const ship = makeEnemy({ hull: 200, position: { x: 0.5, y: 0 } });
    const ctx = makeCtx({
      dt: 0.5,
      enemies: [ship],
      contacts: [makeContact({ rangeKm: 0.5 })],
      player: singleTubePlayer(),
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } }); // launch
    for (let i = 0; i < 60; i++) tick(ctx); // ~30 s of flight (0.5 km @ 40 kt)
    const hits = ctx.bus.getLog().filter((e) => e.type === 'torpedo.hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.payload!.targetShipId).toBe('E-01');
    expect(ship.hull).toBeGreaterThanOrEqual(
      200 - BALANCE.torpedo.damageBase - BALANCE.torpedo.damageSpread,
    );
    expect(ship.hull).toBeLessThanOrEqual(
      200 - BALANCE.torpedo.damageBase + BALANCE.torpedo.damageSpread,
    );
    expect(ctx.stats.torpedoesHit).toBe(1);
    expect(ctx.torpedoes).toHaveLength(0); // hit torpedo removed
    expect(ship.hull).toBeGreaterThan(0); // hull 200 → not sunk
  });

  it('sinks a ship at hull ≤ 0 and keeps it in the array (objectives derive sunk)', () => {
    const ship = makeEnemy({ hull: 20, position: { x: 0.5, y: 0 } });
    const ctx = makeCtx({
      dt: 0.5,
      enemies: [ship],
      contacts: [makeContact({ rangeKm: 0.5 })],
      player: singleTubePlayer(),
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    for (let i = 0; i < 60; i++) tick(ctx);
    expect(ship.hull).toBe(0);
    expect(ctx.enemies).toContain(ship); // kept in the array
    expect(ctx.bus.getLog().filter((e) => e.type === 'ship.sunk')).toEqual([
      expect.objectContaining({ payload: { shipId: 'E-01', shipClass: 'Merchant' } }),
    ]);
  });

  it('MISSED on a near miss (closest pass 40–120 m)', () => {
    // ship 80 m off the torpedo's straight path (bearing 90 vs true bearing ~87.7)
    const ship = makeEnemy({ position: { x: 2, y: 0.08 } });
    const ctx = makeCtx({
      dt: 0.5,
      enemies: [ship],
      contacts: [makeContact({ rangeKm: 2 })],
      player: singleTubePlayer(),
    });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    for (let i = 0; i < 240; i++) tick(ctx);
    const misses = ctx.bus.getLog().filter((e) => e.type === 'torpedo.missed');
    expect(misses).toHaveLength(1);
    const distM = misses[0]!.payload!.distM as number;
    expect(distM).toBeGreaterThan(BALANCE.torpedo.hitDistanceM);
    expect(distM).toBeLessThanOrEqual(BALANCE.torpedo.nearMissDistanceM);
    expect(ship.hull).toBe(100); // unharmed
    expect(ctx.torpedoes).toHaveLength(0);
    expect(ctx.bus.getLog().filter((e) => e.type === 'torpedo.hit')).toHaveLength(0);
  });

  it('EXPIRED at the 6 km range limit (target beyond reach)', () => {
    const ship = makeEnemy({ position: { x: 10, y: 0 } });
    const ctx = makeCtx({ dt: 5, enemies: [ship], contacts: [makeContact({ rangeKm: 10 })] });
    tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
    for (let i = 0; i < 80; i++) tick(ctx);
    const expired = ctx.bus.getLog().filter((e) => e.type === 'torpedo.expired');
    expect(expired).toHaveLength(2); // both salvo tubes
    expect(ctx.torpedoes).toHaveLength(0);
    expect(ship.hull).toBe(100);
  });

  it('EXPIRED at the 300 s lifetime backstop', () => {
    const torpedo: Torpedo = {
      id: 'TP-01',
      state: 'RUNNING',
      position: { x: 5, y: 0 },
      headingDeg: 90,
      speedKt: BALANCE.torpedo.speedKt,
      ageS: 299.95,
      distanceKm: 0.5,
      targetShipId: null,
      targetContactId: null,
      firedAt: 0,
      nearestPass: null,
    };
    const ctx = makeCtx({ torpedoes: [torpedo] });
    tick(ctx);
    expect(ctx.bus.getLog().filter((e) => e.type === 'torpedo.expired')).toHaveLength(1);
    expect(ctx.torpedoes).toHaveLength(0);
  });

  it('createTorpedo assigns monotonic per-game ids', () => {
    const rt = getCombatRuntime(makeCtx());
    const ctx = makeCtx();
    const a = createTorpedo(ctx, rt, makeEnemy(), makeContact(), 90);
    const b = createTorpedo(ctx, rt, makeEnemy(), makeContact(), 90);
    expect(a.id).toBe('TP-01');
    expect(b.id).toBe('TP-02');
  });
});

// ---------------------------------------------------------------------------
// Depth charge tiers (§7.5, B6)
// ---------------------------------------------------------------------------

describe('depthChargeDamage', () => {
  it('resolves the direct/near/far tiers and the Deep-layer ×1.5 factor', () => {
    expect(depthChargeDamage(30, 'Shallow', BALANCE)).toBe(
      BALANCE.weapons.depthCharge.directDamage,
    ); // 35
    expect(depthChargeDamage(80, 'Shallow', BALANCE)).toBe(
      BALANCE.weapons.depthCharge.nearMissDamage,
    ); // 20
    expect(depthChargeDamage(200, 'Shallow', BALANCE)).toBe(BALANCE.weapons.depthCharge.farDamage); // 10
    expect(depthChargeDamage(300, 'Shallow', BALANCE)).toBe(0);
    expect(depthChargeDamage(30, 'Deep', BALANCE)).toBe(
      Math.round(35 * BALANCE.depthLayers.Deep.dcDamageFactor),
    ); // 53
    expect(depthChargeDamage(80, 'Deep', BALANCE)).toBe(Math.round(20 * 1.5)); // 30
    expect(depthChargeDamage(80, 'Medium', BALANCE)).toBe(20); // factor 1.0
  });
});

// ---------------------------------------------------------------------------
// Pending damage drain (AI → combat bridge)
// ---------------------------------------------------------------------------

describe('pending damage drain', () => {
  it('applies AI depth-charge damage once per tick and never leaks', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      id: 'E-01',
      shipClass: 'Destroyer',
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 20,
    });
    const player = makePlayer({
      position: { x: 10.001, y: 10 },
      detection: 0,
      depthLayer: 'Deep',
      hull: 100,
    });
    const bus = createEventBus();
    const ctx = makeCtx({ enemies: [escort], player, bus });

    tickAiAndCombat(ctx, 2); // ai drops a charge → combat drains & applies
    expect(ctx.player.hull).toBeLessThan(100);
    const expected =
      100 -
      Math.round(
        BALANCE.weapons.depthCharge.directDamage * BALANCE.depthLayers.Deep.dcDamageFactor,
      );
    expect(ctx.player.hull).toBe(expected); // 100 − 53 = 47
    expect(
      ctx.bus
        .getLog()
        .filter((e) => e.type === 'sub.damaged' && e.payload!.source === 'depthCharge'),
    ).toHaveLength(1);
    // detection raises come from the AI only (depth-charge hit +15, escort
    // own-ping hit +8) — combat must not re-apply the hit raise, so the meter
    // stays strictly below 2 × depthChargeHit.
    expect(ctx.player.detection).toBeGreaterThanOrEqual(BALANCE.detection.sources.depthChargeHit);
    expect(ctx.player.detection).toBeLessThan(2 * BALANCE.detection.sources.depthChargeHit);
    // buffer is drained: nothing leaks into the next tick
    expect(drainAiPendingDamage(ctx)).toEqual([]);
    // another ai tick without a detonation → still empty after combat
    tickAiAndCombat(ctx, 1);
    expect(drainAiPendingDamage(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

describe('collisions', () => {
  it('applies 10–25 hull damage when moving within the collision distance, gated by cooldown', () => {
    const player = makePlayer({ speedKt: 10, position: { x: 0, y: 0 } });
    const ship = makeEnemy({ position: { x: BALANCE.hull.collisionDistKm / 2, y: 0 } }); // 25 m
    const ctx = makeCtx({ player, enemies: [ship] });
    tick(ctx);
    expect(ctx.player.hull).toBeLessThan(100);
    expect(ctx.player.hull).toBeGreaterThanOrEqual(100 - BALANCE.hull.collisionDamageMax);
    expect(
      ctx.bus.getLog().filter((e) => e.type === 'sub.damaged' && e.payload!.source === 'collision'),
    ).toHaveLength(1);
    const hullAfterFirst = ctx.player.hull;
    // cooldown: no second collision within collisionCooldownS
    for (let i = 0; i < 20; i++) tick(ctx); // 1 s at dt 0.05
    expect(ctx.player.hull).toBe(hullAfterFirst);
    // after the cooldown elapses, a second collision can occur
    ctx.simTime += BALANCE.hull.collisionCooldownS;
    tick(ctx);
    expect(ctx.player.hull).toBeLessThan(hullAfterFirst);
  });

  it('does not collide while stationary', () => {
    const player = makePlayer({ speedKt: 0, position: { x: 0, y: 0 } });
    const ship = makeEnemy({ position: { x: 0.01, y: 0 } });
    const ctx = makeCtx({ player, enemies: [ship] });
    tick(ctx);
    expect(ctx.player.hull).toBe(100);
    expect(ctx.bus.getLog().filter((e) => e.type === 'sub.damaged')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Detection sinks (§8.1, F8)
// ---------------------------------------------------------------------------

describe('detection sinks (pure)', () => {
  it('STOPPED/SILENT + silent running decay rates', () => {
    expect(
      stoppedSilentPerSec(makePlayer({ speedBand: 'STOPPED', silentRunning: true }), BALANCE),
    ).toBe(BALANCE.detection.sinks.stoppedSilentPerSec);
    expect(
      stoppedSilentPerSec(makePlayer({ speedBand: 'STOPPED', silentRunning: false }), BALANCE),
    ).toBe(0);
    expect(
      silentSilentPerSec(makePlayer({ speedBand: 'SILENT', silentRunning: true }), BALANCE),
    ).toBe(BALANCE.detection.sinks.silentSilentPerSec);
    expect(
      silentSilentPerSec(makePlayer({ speedBand: 'CRUISE', silentRunning: true }), BALANCE),
    ).toBe(0);
  });

  it('dive sink fires only when entering Medium/Deep from above', () => {
    expect(diveSink('Shallow', 'Medium', BALANCE)).toBe(
      BALANCE.detection.sinks.diveSurfaceToMedium,
    );
    expect(diveSink('Shallow', 'Deep', BALANCE)).toBe(BALANCE.detection.sinks.diveSurfaceToMedium);
    expect(diveSink('Surface', 'Periscope', BALANCE)).toBe(0);
    expect(diveSink('Medium', 'Deep', BALANCE)).toBe(0);
    expect(diveSink('Deep', 'Shallow', BALANCE)).toBe(0);
  });

  it('decoy-launch sink fires on the count decrease only', () => {
    expect(decoyLaunchSink(2, 1, BALANCE)).toBe(BALANCE.detection.sinks.decoyLaunch);
    expect(decoyLaunchSink(1, 1, BALANCE)).toBe(0);
  });

  it('distance sink applies only beyond the escape distance, escorts only', () => {
    expect(distanceSinkPerSec(4, BALANCE)).toBe(BALANCE.detection.sinks.distancePerSec);
    expect(distanceSinkPerSec(2, BALANCE)).toBe(0);
    expect(distanceSinkPerSec(null, BALANCE)).toBe(0);
  });

  it('nearestEscortKm ignores merchants and sunk ships', () => {
    const ctx = makeCtx({
      enemies: [
        makeEnemy({ id: 'E-01', shipClass: 'Merchant', position: { x: 0.5, y: 0 } }),
        makeEnemy({ id: 'E-02', shipClass: 'Destroyer', position: { x: 3, y: 0 } }),
        makeEnemy({ id: 'E-03', shipClass: 'Frigate', position: { x: 1, y: 0 }, hull: 0 }),
      ],
    });
    expect(nearestEscortKm(ctx)).toBeCloseTo(3, 9);
    expect(nearestEscortKm(makeCtx({ enemies: [makeEnemy()] }))).toBeNull();
  });

  it('bandIndexFor matches the balance bands', () => {
    expect(bandIndexFor(0, BALANCE)).toBe(0);
    expect(bandIndexFor(20, BALANCE)).toBe(0);
    expect(bandIndexFor(21, BALANCE)).toBe(1);
    expect(bandIndexFor(60, BALANCE)).toBe(2);
    expect(bandIndexFor(100, BALANCE)).toBe(4);
  });

  it('minAngleDelta wraps around 360', () => {
    expect(minAngleDelta(350, 10)).toBe(20);
    expect(minAngleDelta(90, 90)).toBe(0);
    expect(minAngleDelta(0, 180)).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// Detection system (slot 8)
// ---------------------------------------------------------------------------

describe('detection system', () => {
  function tickDetection(ctx: SystemContext, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      ctx.bus.setSimTime(ctx.simTime);
      detectionSystem(ctx);
      ctx.simTime += ctx.dt;
    }
  }

  it('applies the STOPPED+silent sink over time and never on the first tick', () => {
    const player = makePlayer({ speedBand: 'STOPPED', silentRunning: true, detection: 50 });
    const ctx = makeCtx({ player });
    tickDetection(ctx, 20); // 1 s at dt 0.05 → −2.5 (t-015: stoppedSilentPerSec 2 → 2.5)
    expect(ctx.player.detection).toBeCloseTo(47.5, 9);
    expect(ctx.bus.getLog().filter((e) => e.type === 'detection.threshold')).toHaveLength(0); // no band crossed
  });

  it('emits detection.threshold when crossing a band boundary', () => {
    const player = makePlayer({ speedBand: 'STOPPED', silentRunning: true, detection: 21 });
    const ctx = makeCtx({ player });
    tickDetection(ctx, 10); // 21 − 1.25 = 19.75 final; boundary 20.0 crossed on tick 8 (t-015: sink 2 → 2.5)
    expect(ctx.player.detection).toBeCloseTo(19.75, 9);
    const events = ctx.bus.getLog().filter((e) => e.type === 'detection.threshold');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload!.band).toBe('Unaware');
    // The event carries the detection at the crossing tick — exactly the 20.0 boundary.
    expect(events[0]!.payload!.detection as number).toBeCloseTo(20, 9);
  });

  it('applies the hard-turn sink once per 30°-in-10s episode', () => {
    const player = makePlayer({ speedBand: 'CRUISE', detection: 60, headingDeg: 0 });
    const ctx = makeCtx({ dt: 0.5, player });
    for (let i = 0; i < 17; i++) {
      player.headingDeg += 2; // cumulative 32° > 30° by tick 17
      tickDetection(ctx, 1);
    }
    expect(ctx.player.detection).toBeCloseTo(60 - BALANCE.detection.sinks.hardTurnDeg30Per10s, 9); // 50
    expect(getDetectionRuntime(ctx).turnHistory).toHaveLength(0); // window reset after the edge
  });

  it('applies the decoy-launch sink on launch and the dive sink on entering Medium', () => {
    const player = makePlayer({ speedBand: 'CRUISE', detection: 60, decoyCount: 2 });
    const ctx = makeCtx({ player });
    tickDetection(ctx, 1); // initialize trackers (no sinks on the first tick)
    player.decoyCount = 1; // submarine launched a decoy (slot 4 ran)
    tickDetection(ctx, 1);
    expect(ctx.player.detection).toBeCloseTo(60 - BALANCE.detection.sinks.decoyLaunch, 9);
    // dive into Medium
    player.depthLayer = 'Medium';
    tickDetection(ctx, 1);
    expect(ctx.player.detection).toBeCloseTo(
      60 - BALANCE.detection.sinks.decoyLaunch - BALANCE.detection.sinks.diveSurfaceToMedium,
      9,
    );
  });

  it('LOCATED at 100: player.located once + 60 s grace, cleared below 60', () => {
    const player = makePlayer({ speedBand: 'CRUISE', detection: 100 });
    const ctx = makeCtx({ player });
    tickDetection(ctx, 1);
    expect(ctx.bus.getLog().filter((e) => e.type === 'player.located')).toHaveLength(1);
    const rt = getDetectionRuntime(ctx);
    expect(rt.locatedActive).toBe(true);
    expect(rt.graceRemainingS).toBeCloseTo(BALANCE.detection.located.graceSeconds - FIXED_DT, 9);
    // no sinks → stays 100; grace counts down to expiry
    tickDetection(ctx, Math.ceil(BALANCE.detection.located.graceSeconds / FIXED_DT));
    expect(rt.graceExpired).toBe(true);
    expect(ctx.bus.getLog().filter((e) => e.type === 'player.located')).toHaveLength(1); // not re-emitted
    // dropping below requiredBelow clears the episode
    player.detection = 50;
    tickDetection(ctx, 1);
    expect(rt.locatedActive).toBe(false);
    expect(rt.graceRemainingS).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('combat determinism', () => {
  it('same seed + same inputs → identical state, torpedoes, and events', () => {
    const run = (): string => {
      const ship = makeEnemy({ hull: 60, position: { x: 0.5, y: 0 } });
      const ctx = makeCtx({
        dt: 0.5,
        enemies: [ship],
        contacts: [makeContact({ rangeKm: 0.5, trueShipId: 'E-01' })],
      });
      tick(ctx, { inputs: { fireTorpedo: 'C-01' } }); // salvo
      for (let i = 0; i < 40; i++) tick(ctx); // run to impact
      // a second fire request at the same contact → notReady (tubes spent)
      tick(ctx, { inputs: { fireTorpedo: 'C-01' } });
      return JSON.stringify({
        player: ctx.player,
        ship,
        torpedoes: ctx.torpedoes,
        stats: ctx.stats,
        events: ctx.bus.getLog(),
      });
    };
    expect(run()).toBe(run());
  });
});
