/**
 * SILENT DEPTH — enemy AI unit tests (tests/unit/ai.test.ts)
 *
 * Task t-006 acceptance (enemy-ai-gate):
 *   - aiState: full transition table (all triggers + thresholds)
 *   - convoy: 2×2 formation geometry holds, anchor advance, merchant evade
 *   - escort: state transitions driven by perception events (integration
 *     through the aiSystem with a hand-built SystemContext), depth-charge
 *     volley cadence, deck gun, ship.sunk propagation
 *   - search: circular/zig-zag/expanding waypoints sane, LKP F5 drift /
 *     freeze / refresh / decoy replace
 *   - ship: F3 detection monotonic in noise/depth/weather, zero beyond range,
 *     kinematics, applyDamage
 *   - determinism: identical seed + identical tick sequence → identical
 *     results (no Math.random anywhere)
 *
 * Environment: vitest node. No Math.random — all randomness flows through the
 * seeded RNG (src/core/rng.ts) or injected stubs.
 */

import { describe, expect, it } from 'vitest';
import { loadBalance } from '../../src/core/balance';
import { createEventBus } from '../../src/core/eventBus';
import type { EventBus } from '../../src/core/eventBus';
import { createRng } from '../../src/core/rng';
import type { Rng } from '../../src/core/rng';
import { FIXED_DT } from '../../src/core/time';
import type { SystemContext } from '../../src/core/engine';
import type {
  Decoy,
  EnemyShip,
  MissionDef,
  PlayerInputs,
  SubmarineState,
  Torpedo,
  WeatherKind,
} from '../../src/core/types';

import {
  AI_STATES,
  PING_HITS_TO_ALERT,
  SEARCHING_TIMEOUT_S,
  SUSPICIOUS_TIMEOUT_S,
  defaultAiThresholds,
  evaluateAiState,
} from '../../src/ai/aiState';
import type { AiStateTimers, AiTriggers } from '../../src/ai/aiState';
import {
  KT_TO_KM_S,
  applyDamage,
  angleDiffDeg,
  bearingDeg,
  moveShip,
  normalizeDeg,
  passiveDetectionRate,
} from '../../src/ai/ship';
import {
  advanceAnchor,
  formationGeometry,
  formationSlotOffsetM,
  formationSlotPoint,
  runMerchantBehavior,
  slotForMerchantIndex,
} from '../../src/ai/convoy';
import {
  DECK_GUN_COOLDOWN_S,
  escortPost,
  figure8ArcDerivative,
  figure8Point,
} from '../../src/ai/escort';
import {
  initialCircularState,
  initialExpandingState,
  initialZigzagState,
  searchPatternsConfig,
  stepCircular,
  stepExpanding,
  stepZigzag,
  updateLkp,
} from '../../src/ai/search';
import { aiSystem, drainAiPendingDamage, resetAiPendingOutput } from '../../src/ai/ai';
import { createShipRuntime } from '../../src/ai/ship';
import type { WorldState } from '../../src/world/world';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BALANCE = loadBalance();

function makeMission(seed = 1001, overrides: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'M-TEST',
    name: 'AI Test Mission',
    objective: { kind: 'sink', subgoals: [{ id: 's-1', weight: 1, desc: 'sink' }] },
    patrolArea: { km: 30, gridM: 500 },
    fleet: {
      headingDeg: 90,
      speedKt: 9,
      formation: '2x2',
      colSpacingM: 500,
      rowSpacingM: 400,
      patrolBehavior: 'figure8',
    },
    spawns: [],
    playerStart: { x: 0, y: 0, headingDeg: 270 },
    weather: 'Clear',
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed,
    briefingSeconds: 2,
    ...overrides,
  };
}

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

function makePlayer(overrides: Partial<SubmarineState> = {}): SubmarineState {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 270,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: 'Deep',
    targetDepthLayer: 'Deep',
    depthTransitionT: null,
    battery: 100,
    noise: 0,
    hull: 100,
    detection: 0,
    silentRunning: false,
    sonarState: 'idle',
    pingCooldown: 0,
    torpedoTubes: [],
    decoyCount: 2,
    lowBattery: false,
    outOfBoundsTimer: 0,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<EnemyShip> = {}): EnemyShip {
  return {
    id: 'E-01',
    shipClass: 'Destroyer',
    position: { x: 10, y: 10 },
    headingDeg: 90,
    speedKt: 0,
    hull: 190,
    aiState: 'NORMAL',
    lkp: null,
    depthChargesLeft: BALANCE.enemyAI.depthCharges.perMission,
    activePingCooldown: 0,
    inConvoy: false,
    ...overrides,
  };
}

function makeTorpedo(overrides: Partial<Torpedo> = {}): Torpedo {
  return {
    id: 'T-01',
    state: 'RUNNING',
    position: { x: 0, y: 0 },
    headingDeg: 90,
    speedKt: 40,
    ageS: 1,
    distanceKm: 0,
    targetShipId: null,
    targetContactId: null,
    firedAt: 0,
    nearestPass: null,
    ...overrides,
  };
}

interface CtxOptions {
  mission?: MissionDef;
  player?: SubmarineState;
  enemies?: EnemyShip[];
  torpedoes?: Torpedo[];
  decoys?: Decoy[];
  simTime?: number;
  dt?: number;
  pingEdge?: boolean;
  bus?: EventBus;
  seed?: number;
}

/** Build a full SystemContext (live references; aiSystem mutates them). */
function makeCtx(opts: CtxOptions = {}): SystemContext {
  const mission = opts.mission ?? makeMission(opts.seed ?? 1001);
  const rng = createRng(mission.seed);
  return {
    dt: opts.dt ?? FIXED_DT,
    simTime: opts.simTime ?? 0,
    state: 'MISSION_RUNNING',
    pauseEdge: false,
    pingEdge: opts.pingEdge ?? false,
    decoyEdge: false,
    inputs: IDLE_INPUT,
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
    contacts: [],
    enemies: opts.enemies ?? [],
    torpedoes: opts.torpedoes ?? [],
    decoys: opts.decoys ?? [],
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

/** Deterministic fake RNG for unit-level rolls (chance/sign controlled). */
function stubRng(chanceResult: boolean, sign: 1 | -1 = 1): Rng {
  const s = createRng(12345);
  return {
    next: () => s.next(),
    range: (min: number, max: number) => min + s.next() * (max - min),
    int: (min: number, max: number) => Math.floor(s.next() * (max - min + 1)) + min,
    chance: () => chanceResult,
    sign: () => sign,
    fork: (label: string) => s.fork(label),
  };
}

/** Run one fixed tick: sync the event-bus simTime (the engine does this
 * before systems run — GAME_ARCHITECTURE §7 step 2), advance simTime, then
 * run the AI system. */
function tick(ctx: SystemContext): void {
  ctx.simTime += ctx.dt;
  ctx.bus.setSimTime(ctx.simTime);
  aiSystem(ctx);
}

/** Run the aiSystem for `ticks` steps, advancing simTime by FIXED_DT each. */
function runTicks(ctx: SystemContext, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(ctx);
}

const ZERO_TIMERS: AiStateTimers = {
  suspiciousNoContactS: 0,
  searchingNoContactS: 0,
  huntingBelow40S: 0,
  lostContactAtPostS: 0,
};

function triggers(overrides: Partial<AiTriggers> = {}): AiTriggers {
  return {
    noiseSensed: false,
    pingHeard: false,
    detection: 0,
    consecutivePingHits: 0,
    lastPingHitRangeKm: null,
    torpedoNearKm: null,
    explosionHeard: false,
    huntingDisabled: false,
    atPost: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aiState — full transition table
// ---------------------------------------------------------------------------

describe('aiState machine (GAME_DESIGN §6.1)', () => {
  const th = defaultAiThresholds(BALANCE);

  it('exposes the six canonical states in order', () => {
    expect(AI_STATES).toEqual([
      'NORMAL',
      'SUSPICIOUS',
      'ALERT',
      'SEARCHING',
      'HUNTING',
      'LOST_CONTACT',
    ]);
  });

  it('thresholds derive from the balance detection bands (40 / 60)', () => {
    expect(th.alertDetection).toBe(BALANCE.detection.bands[1]!.max);
    expect(th.huntingDetection).toBe(BALANCE.detection.bands[2]!.max);
    expect(th.alertDetection).toBe(40);
    expect(th.huntingDetection).toBe(60);
  });

  it('NORMAL → SUSPICIOUS on player noise or ping, else stays', () => {
    expect(evaluateAiState('NORMAL', triggers(), ZERO_TIMERS, th).next).toBe('NORMAL');
    expect(evaluateAiState('NORMAL', triggers({ noiseSensed: true }), ZERO_TIMERS, th).next).toBe(
      'SUSPICIOUS',
    );
    expect(evaluateAiState('NORMAL', triggers({ pingHeard: true }), ZERO_TIMERS, th).next).toBe(
      'SUSPICIOUS',
    );
  });

  it('NORMAL/SUSPICIOUS → ALERT on torpedo heard within 10 km (§7.2 early warning)', () => {
    expect(evaluateAiState('NORMAL', triggers({ torpedoNearKm: 8 }), ZERO_TIMERS, th).next).toBe(
      'ALERT',
    );
    expect(
      evaluateAiState('SUSPICIOUS', triggers({ torpedoNearKm: 5 }), ZERO_TIMERS, th).next,
    ).toBe('ALERT');
    // beyond hearing range → no escalation
    expect(evaluateAiState('NORMAL', triggers({ torpedoNearKm: 11 }), ZERO_TIMERS, th).next).toBe(
      'NORMAL',
    );
  });

  it('SUSPICIOUS → ALERT when detection ≥ 40', () => {
    expect(evaluateAiState('SUSPICIOUS', triggers({ detection: 39.9 }), ZERO_TIMERS, th).next).toBe(
      'SUSPICIOUS',
    );
    expect(evaluateAiState('SUSPICIOUS', triggers({ detection: 40 }), ZERO_TIMERS, th).next).toBe(
      'ALERT',
    );
  });

  it('SUSPICIOUS → ALERT on 2 consecutive pings with range', () => {
    const oneHit = triggers({ consecutivePingHits: 1, lastPingHitRangeKm: 3 });
    expect(evaluateAiState('SUSPICIOUS', oneHit, ZERO_TIMERS, th).next).toBe('SUSPICIOUS');
    const twoHits = triggers({ consecutivePingHits: PING_HITS_TO_ALERT, lastPingHitRangeKm: 3 });
    expect(evaluateAiState('SUSPICIOUS', twoHits, ZERO_TIMERS, th).next).toBe('ALERT');
  });

  it('SUSPICIOUS → LOST_CONTACT after 60 s without contact', () => {
    const timers: AiStateTimers = {
      ...ZERO_TIMERS,
      suspiciousNoContactS: SUSPICIOUS_TIMEOUT_S - 0.01,
    };
    expect(evaluateAiState('SUSPICIOUS', triggers(), timers, th).next).toBe('SUSPICIOUS');
    timers.suspiciousNoContactS = SUSPICIOUS_TIMEOUT_S;
    expect(evaluateAiState('SUSPICIOUS', triggers(), timers, th).next).toBe('LOST_CONTACT');
  });

  it('ALERT → SEARCHING on torpedo within 3 km or explosion heard', () => {
    expect(evaluateAiState('ALERT', triggers(), ZERO_TIMERS, th).next).toBe('ALERT');
    expect(evaluateAiState('ALERT', triggers({ torpedoNearKm: 3 }), ZERO_TIMERS, th).next).toBe(
      'SEARCHING',
    );
    expect(evaluateAiState('ALERT', triggers({ torpedoNearKm: 2.9 }), ZERO_TIMERS, th).next).toBe(
      'SEARCHING',
    );
    expect(evaluateAiState('ALERT', triggers({ explosionHeard: true }), ZERO_TIMERS, th).next).toBe(
      'SEARCHING',
    );
  });

  it('SEARCHING → HUNTING on detection ≥ 60 or ping confirm < 1.5 km', () => {
    expect(evaluateAiState('SEARCHING', triggers({ detection: 59.9 }), ZERO_TIMERS, th).next).toBe(
      'SEARCHING',
    );
    expect(evaluateAiState('SEARCHING', triggers({ detection: 60 }), ZERO_TIMERS, th).next).toBe(
      'HUNTING',
    );
    expect(
      evaluateAiState(
        'SEARCHING',
        triggers({ detection: 30, lastPingHitRangeKm: 1.49 }),
        ZERO_TIMERS,
        th,
      ).next,
    ).toBe('HUNTING');
  });

  it('SEARCHING → LOST_CONTACT after 120 s without contact', () => {
    const timers: AiStateTimers = { ...ZERO_TIMERS, searchingNoContactS: SEARCHING_TIMEOUT_S };
    expect(evaluateAiState('SEARCHING', triggers(), timers, th).next).toBe('LOST_CONTACT');
  });

  it('SEARCHING can never escalate to HUNTING once hunting is disabled (ammo exhausted)', () => {
    expect(
      evaluateAiState(
        'SEARCHING',
        triggers({ detection: 100, huntingDisabled: true }),
        ZERO_TIMERS,
        th,
      ).next,
    ).toBe('SEARCHING');
  });

  it('HUNTING → SEARCHING after detection < 40 for 30 s', () => {
    const timers: AiStateTimers = { ...ZERO_TIMERS, huntingBelow40S: 30 };
    expect(evaluateAiState('HUNTING', triggers({ detection: 39 }), timers, th).next).toBe(
      'SEARCHING',
    );
    expect(evaluateAiState('HUNTING', triggers({ detection: 39 }), ZERO_TIMERS, th).next).toBe(
      'HUNTING',
    );
    expect(evaluateAiState('HUNTING', triggers({ detection: 40 }), timers, th).next).toBe(
      'HUNTING',
    );
  });

  it('HUNTING → SEARCHING immediately when ammo is exhausted', () => {
    expect(
      evaluateAiState(
        'HUNTING',
        triggers({ huntingDisabled: true, detection: 90 }),
        ZERO_TIMERS,
        th,
      ).next,
    ).toBe('SEARCHING');
  });

  it('LOST_CONTACT → NORMAL after 60 s at post', () => {
    const timers: AiStateTimers = { ...ZERO_TIMERS, lostContactAtPostS: 60 };
    expect(evaluateAiState('LOST_CONTACT', triggers({ atPost: true }), timers, th).next).toBe(
      'NORMAL',
    );
    expect(evaluateAiState('LOST_CONTACT', triggers({ atPost: false }), timers, th).next).toBe(
      'LOST_CONTACT',
    );
    expect(evaluateAiState('LOST_CONTACT', triggers({ atPost: true }), ZERO_TIMERS, th).next).toBe(
      'LOST_CONTACT',
    );
  });

  it('LOST_CONTACT re-contact en route → SUSPICIOUS, or ALERT when detection ≥ 40', () => {
    expect(
      evaluateAiState('LOST_CONTACT', triggers({ noiseSensed: true }), ZERO_TIMERS, th).next,
    ).toBe('SUSPICIOUS');
    expect(
      evaluateAiState('LOST_CONTACT', triggers({ pingHeard: true }), ZERO_TIMERS, th).next,
    ).toBe('SUSPICIOUS');
    expect(evaluateAiState('LOST_CONTACT', triggers({ detection: 41 }), ZERO_TIMERS, th).next).toBe(
      'ALERT',
    );
  });
});

// ---------------------------------------------------------------------------
// ship — F3 detection, kinematics, damage
// ---------------------------------------------------------------------------

describe('ship primitives (F3, kinematics, damage)', () => {
  it('F3 is zero beyond the passive sensor range', () => {
    const escort = makeEnemy({ position: { x: 0, y: 0 } }); // passive 6 km
    const player = makePlayer({ position: { x: 6.1, y: 0 }, noise: 90, depthLayer: 'Surface' });
    expect(passiveDetectionRate(escort, player, BALANCE, 'Clear')).toBe(0);
  });

  it('F3 is monotonic in player noise', () => {
    const escort = makeEnemy({ position: { x: 0, y: 0 } });
    const rates = [20, 50, 80].map((noise) =>
      passiveDetectionRate(
        escort,
        makePlayer({ position: { x: 1, y: 0 }, noise, depthLayer: 'Surface' }),
        BALANCE,
        'Clear',
      ),
    );
    expect(rates[0]!).toBeGreaterThan(0);
    expect(rates[1]!).toBeGreaterThan(rates[0]!);
    expect(rates[2]!).toBeGreaterThan(rates[1]!);
  });

  it('F3 is monotonic in the depth factor (Surface > Shallow > Deep)', () => {
    const escort = makeEnemy({ position: { x: 0, y: 0 } });
    const base = { position: { x: 1, y: 0 }, noise: 80 };
    const surface = passiveDetectionRate(
      escort,
      makePlayer({ ...base, depthLayer: 'Surface' }),
      BALANCE,
      'Clear',
    );
    const shallow = passiveDetectionRate(
      escort,
      makePlayer({ ...base, depthLayer: 'Shallow' }),
      BALANCE,
      'Clear',
    );
    const deep = passiveDetectionRate(
      escort,
      makePlayer({ ...base, depthLayer: 'Deep' }),
      BALANCE,
      'Clear',
    );
    expect(surface).toBeGreaterThan(shallow);
    expect(shallow).toBeGreaterThan(deep);
  });

  it('F3 is monotonic in the weather factor (Clear > Cloudy > Fog)', () => {
    const escort = makeEnemy({ position: { x: 0, y: 0 } });
    const player = makePlayer({ position: { x: 1, y: 0 }, noise: 80, depthLayer: 'Surface' });
    const weathers: WeatherKind[] = ['Clear', 'Cloudy', 'Storm', 'Fog'];
    const rates = weathers.map((w) => passiveDetectionRate(escort, player, BALANCE, w));
    expect(rates[1]!).toBeLessThan(rates[0]!);
    expect(rates[2]!).toBeLessThan(rates[1]!);
    expect(rates[3]!).toBeLessThan(rates[2]!);
  });

  it('F3 merchant baseRate < escort baseRate at equal range/depth/weather', () => {
    const merchant = makeEnemy({ shipClass: 'Merchant', position: { x: 0, y: 0 } });
    const destroyer = makeEnemy({ shipClass: 'Destroyer', position: { x: 0, y: 0 } });
    const player = makePlayer({ position: { x: 1, y: 0 }, noise: 80, depthLayer: 'Shallow' });
    const m = passiveDetectionRate(merchant, player, BALANCE, 'Clear');
    const d = passiveDetectionRate(destroyer, player, BALANCE, 'Clear');
    expect(m).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(m);
    // exact formula spot-check (%/s): noise 80 × escort 0.035 × Shallow 0.9 ×
    // Clear 1.0 × distanceFactor (1 − 1/6) = 2.1 %/s (t-015: baseRate 0.05 → 0.035)
    expect(d).toBeCloseTo(80 * 0.035 * 0.9 * 1.0 * (1 - 1 / 6), 6);
  });

  it('applyDamage clamps hull at 0 and reports the fatal blow once', () => {
    const ship = makeEnemy({ hull: 10 });
    expect(applyDamage(ship, 5)).toBe(false);
    expect(ship.hull).toBe(5);
    expect(applyDamage(ship, 5)).toBe(true);
    expect(ship.hull).toBe(0);
    expect(applyDamage(ship, 100)).toBe(false); // already sunk — not a new fatal blow
    expect(ship.hull).toBe(0);
  });

  it('moveShip turns the shortest way and integrates along the heading', () => {
    const ship = makeEnemy({ position: { x: 0, y: 0 }, headingDeg: 0, speedKt: 0 });
    // target 270° from 0°: shortest way is -90° (via 360)
    moveShip(ship, 270, 10, 1, { turnRateDegPerS: 45, accelKtPerS: 10 });
    expect(ship.headingDeg).toBe(315); // turned 45° toward 270 (i.e. -45 from 0)
    expect(ship.speedKt).toBe(10);
    // position moved along 315° ≈ (-x, -y)
    expect(ship.position.x).toBeCloseTo(Math.cos((315 * Math.PI) / 180) * 10 * KT_TO_KM_S, 6);
    expect(ship.position.y).toBeCloseTo(Math.sin((315 * Math.PI) / 180) * 10 * KT_TO_KM_S, 6);
  });

  it('angleDiffDeg / normalizeDeg wrap correctly', () => {
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(370)).toBe(10);
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(10, 350)).toBe(-20);
    expect(angleDiffDeg(0, 180)).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// convoy — formation geometry + merchant behaviour
// ---------------------------------------------------------------------------

describe('convoy formation (GAME_DESIGN §6.3)', () => {
  const geo = formationGeometry({ colSpacingM: 500, rowSpacingM: 400 }, BALANCE);

  it('assigns 2×2 slots: cols 0/1, rows 0/1', () => {
    expect(slotForMerchantIndex(0, geo)).toEqual({ col: 0, row: 0 });
    expect(slotForMerchantIndex(1, geo)).toEqual({ col: 1, row: 0 });
    expect(slotForMerchantIndex(2, geo)).toEqual({ col: 0, row: 1 });
    expect(slotForMerchantIndex(3, geo)).toEqual({ col: 1, row: 1 });
  });

  it('slot offsets: ±250 m lateral, ±200 m longitudinal (row 0 = front)', () => {
    const s00 = formationSlotOffsetM({ col: 0, row: 0 }, geo);
    expect(s00.lateralM).toBe(-250);
    expect(s00.forwardM).toBe(200);
    const s11 = formationSlotOffsetM({ col: 1, row: 1 }, geo);
    expect(s11.lateralM).toBe(250);
    expect(s11.forwardM).toBe(-200);
  });

  it('slot world points rotate with fleet heading (heading 90° = north)', () => {
    const heading = 90;
    const anchor = { x: 10, y: 10 };
    const s00 = formationSlotPoint(anchor, heading, { col: 0, row: 0 }, geo);
    // heading north: forward = +y, starboard = +x; slot (0,0) is 200 m ahead,
    // 250 m to port (col 0).
    expect(s00.x).toBeCloseTo(10 - 0.25, 6);
    expect(s00.y).toBeCloseTo(10 + 0.2, 6);
  });

  it('anchor advances along the heading at fleet speed', () => {
    const a0 = { x: 10, y: 10 };
    const a1 = advanceAnchor(a0, 90, 10, 1); // heading north → +y
    expect(a1.y).toBeCloseTo(10 + 10 * KT_TO_KM_S, 6);
    expect(a1.x).toBeCloseTo(10, 6);
  });

  it('merchant evade: torpedo-targeted triggers 45° turn for 30 s (30% roll)', () => {
    const ship = makeEnemy({ shipClass: 'Merchant', headingDeg: 0, speedKt: 9 });
    const rt = createShipRuntime({ col: 0, row: 0 });
    const behavior = (rng: Rng): void =>
      runMerchantBehavior({
        ship,
        rt,
        anchor: null, // no formation — pure course behaviour for a clean assertion
        fleetHeadingDeg: 90,
        fleetSpeedKt: 9,
        geo,
        balance: BALANCE,
        dt: 1,
        torpedoTargeted: true,
        convoyMateSunk: false,
        rng,
      });
    // 30 % roll fails → no evade (ship just cruises the fleet course)
    behavior(stubRng(false));
    expect(rt.evadeS).toBe(0);
    expect(rt.evadeHeadingDeg).toBeNull();
    // roll succeeds, sign = -1 → turn -45° from the current heading
    const headingBefore = ship.headingDeg;
    behavior(stubRng(true, -1));
    expect(rt.evadeS).toBeGreaterThan(0);
    expect(rt.evadeS).toBeLessThanOrEqual(BALANCE.enemyAI.merchant.evadeSeconds);
    expect(rt.evadeHeadingDeg).toBe(
      normalizeDeg(headingBefore - BALANCE.enemyAI.merchant.evadeTurnDeg),
    );
    // 4 °/s × 1 s actually turned toward the evade target
    const turned = Math.abs(angleDiffDeg(headingBefore, ship.headingDeg));
    expect(turned).toBeCloseTo(4, 6);
    // second tick: no re-roll (evade already active); timer keeps draining
    const before = rt.evadeS;
    const targetHeld = rt.evadeHeadingDeg;
    behavior(stubRng(true));
    expect(rt.evadeS).toBeLessThan(before);
    expect(rt.evadeHeadingDeg).toBe(targetHeld); // heading target unchanged
  });

  it('merchant convoy-mate evade triggers on a sunk mate, then expires to formation', () => {
    const ship = makeEnemy({ shipClass: 'Merchant', headingDeg: 90, inConvoy: true });
    const rt = createShipRuntime({ col: 1, row: 0 });
    runMerchantBehavior({
      ship,
      rt,
      anchor: { x: 0, y: 0 },
      fleetHeadingDeg: 90,
      fleetSpeedKt: 9,
      geo,
      balance: BALANCE,
      dt: 0.05,
      torpedoTargeted: false,
      convoyMateSunk: true,
      rng: stubRng(true, 1),
    });
    expect(rt.neighborEvadeS).toBeGreaterThan(0);
    expect(rt.neighborEvadeS).toBeLessThanOrEqual(BALANCE.enemyAI.merchant.evadeSeconds);
    expect(rt.evadeS).toBe(0);
  });

  it('merchant in formation steers toward its slot at fleet speed', () => {
    const ship = makeEnemy({
      shipClass: 'Merchant',
      position: { x: 0, y: 0 },
      headingDeg: 90,
      speedKt: 0,
      inConvoy: true,
    });
    const rt = createShipRuntime({ col: 0, row: 0 });
    // anchor at (0,0) heading 90 → slot (0,0) is 200 m ahead, 250 m to port
    const slot = formationSlotPoint({ x: 0, y: 0 }, 90, { col: 0, row: 0 }, geo);
    const targetBearing = bearingDeg({ x: 0, y: 0 }, slot);
    runMerchantBehavior({
      ship,
      rt,
      anchor: { x: 0, y: 0 },
      fleetHeadingDeg: 90,
      fleetSpeedKt: 9,
      geo,
      balance: BALANCE,
      dt: 1,
      torpedoTargeted: false,
      convoyMateSunk: false,
      rng: stubRng(false),
    });
    // 1 s of 4 °/s steering toward the slot bearing
    const diff = angleDiffDeg(90, targetBearing);
    expect(ship.headingDeg).toBeCloseTo(
      normalizeDeg(90 + Math.sign(diff) * Math.min(Math.abs(diff), 4)),
      6,
    );
    // acceleration: 2 kt/s × 1 s toward the 9 kt fleet speed
    expect(ship.speedKt).toBeCloseTo(2, 6);
  });
});

// ---------------------------------------------------------------------------
// search — patterns + LKP F5
// ---------------------------------------------------------------------------

describe('search patterns (GAME_DESIGN §6.4)', () => {
  const cfg = searchPatternsConfig(BALANCE);

  it('circular radius grows per lap and stays within [1.0, 2.5] km', () => {
    let st = initialCircularState(cfg);
    const center = { x: 0, y: 0 };
    expect(st.radiusKm).toBe(1.0);
    // ~3000 s at 20 kt on a 1.0→1.3 km radius → 3 full laps (each lap +300 m)
    let laps = 0;
    const radiusStart = st.radiusKm;
    for (let i = 0; i < 60000; i++) {
      const step = stepCircular(center, st, 20, 0.05, cfg.circular);
      st = step.next;
      if (step.lapCompleted) laps += 1;
      expect(st.radiusKm).toBeLessThanOrEqual(cfg.circular.radiusMaxKm);
      expect(st.radiusKm).toBeGreaterThanOrEqual(cfg.circular.radiusStartKm);
      const d = Math.hypot(step.point.x, step.point.y);
      expect(d).toBeCloseTo(st.radiusKm, 3);
    }
    expect(laps).toBeGreaterThan(2);
    expect(st.radiusKm).toBeGreaterThan(radiusStart); // radius grew with the laps
  });

  it('zig-zag: lane spacing 300 m, lanes sweep outward, progress within lane length', () => {
    let st = initialZigzagState(90); // sweep along north
    const center = { x: 0, y: 0 };
    const laneLength = cfg.zigzag.laneLengthKm;
    let sawLane1 = false;
    for (let i = 0; i < 6000; i++) {
      const step = stepZigzag(center, st, 20, 0.05, cfg.zigzag);
      st = step.next;
      // along-axis progress never exceeds the lane length
      expect(Math.abs(step.point.y)).toBeLessThanOrEqual(laneLength + 1e-9);
      // perpendicular offset is laneIndex × 300 m (sweep axis 90° → across = -x)
      expect(step.point.x).toBeCloseTo(-st.laneIndex * cfg.zigzag.laneSpacingKm, 6);
      if (st.laneIndex >= 1) sawLane1 = true;
    }
    expect(sawLane1).toBe(true);
  });

  it('expanding spiral: radius grows with angle from the 500 m start', () => {
    let st = initialExpandingState(cfg);
    const center = { x: 0, y: 0 };
    expect(st.radiusKm).toBe(0.5);
    const r0 = st.radiusKm;
    for (let i = 0; i < 6000; i++) {
      const step = stepExpanding(center, st, 20, 0.05, cfg.expanding);
      st = step.next;
      expect(st.radiusKm).toBeGreaterThanOrEqual(r0);
    }
    expect(st.radiusKm).toBeGreaterThan(r0 + 0.2); // clearly expanded
  });

  it('LKP refresh in sensor range re-centres on the player with zero error', () => {
    const out = updateLkp({
      lkp: { x: 1, y: 1, errorKm: 0.8 },
      playerPos: { x: 4, y: 5 },
      inSensorRange: true,
      refreshDue: true,
      maneuvers: 0,
      pingHit: false,
      pingRangeKm: 0,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: null,
      decoyReplaceChance: 0.7,
      decoyActive: false,
      rng: stubRng(true),
    });
    expect(out.lkp).toEqual({ x: 4, y: 5, errorKm: 0 });
    expect(out.decoyActive).toBe(false);
  });

  it('LKP freezes when the player is out of sensor range (position unchanged)', () => {
    const out = updateLkp({
      lkp: { x: 1, y: 1, errorKm: 0.1 },
      playerPos: { x: 20, y: 20 },
      inSensorRange: false,
      refreshDue: true,
      maneuvers: 0,
      pingHit: false,
      pingRangeKm: 0,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: null,
      decoyReplaceChance: 0.7,
      decoyActive: false,
      rng: stubRng(false),
    });
    expect(out.lkp!.x).toBe(1);
    expect(out.lkp!.y).toBe(1);
  });

  it('LKP drifts +50 m per maneuver, capped at 1.5 km', () => {
    let lkp = { x: 1, y: 1, errorKm: 0 };
    for (let i = 0; i < 40; i++) {
      const out = updateLkp({
        lkp,
        playerPos: { x: 1, y: 1 },
        inSensorRange: false,
        refreshDue: false,
        maneuvers: 1,
        pingHit: false,
        pingRangeKm: 0,
        bearingErrorDeg: 2,
        driftErrorM: 50,
        driftMaxKm: 1.5,
        newDecoy: null,
        decoyReplaceChance: 0.7,
        decoyActive: false,
        rng: stubRng(false),
      });
      lkp = out.lkp!;
    }
    expect(lkp.errorKm).toBeCloseTo(1.5, 6); // 40 × 50 m = 2 km → capped at 1.5
    expect(lkp.x).toBe(1); // position frozen
  });

  it('LKP ping-hit fix carries the F4 bearing error (range × tan(2°))', () => {
    const out = updateLkp({
      lkp: { x: 1, y: 1, errorKm: 1.4 },
      playerPos: { x: 3, y: 3 },
      inSensorRange: true,
      refreshDue: false,
      maneuvers: 0,
      pingHit: true,
      pingRangeKm: 4,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: null,
      decoyReplaceChance: 0.7,
      decoyActive: false,
      rng: stubRng(false),
    });
    expect(out.lkp!.x).toBe(3);
    expect(out.lkp!.errorKm).toBeCloseTo(4 * Math.tan((2 * Math.PI) / 180), 6);
  });

  it('LKP decoy replace: 70% roll pins the LKP to the decoy for its duration', () => {
    // chance → true: replaced
    const replaced = updateLkp({
      lkp: { x: 1, y: 1, errorKm: 0.5 },
      playerPos: { x: 1, y: 1 },
      inSensorRange: false,
      refreshDue: false,
      maneuvers: 0,
      pingHit: false,
      pingRangeKm: 0,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: { x: 7, y: 8 },
      decoyReplaceChance: 0.7,
      decoyActive: false,
      rng: stubRng(true),
    });
    expect(replaced.lkp).toEqual({ x: 7, y: 8, errorKm: 0 });
    expect(replaced.decoyActive).toBe(true);
    // while pinned, the LKP does not move
    const pinned = updateLkp({
      lkp: replaced.lkp,
      playerPos: { x: 99, y: 99 },
      inSensorRange: true,
      refreshDue: true,
      maneuvers: 2,
      pingHit: false,
      pingRangeKm: 0,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: null,
      decoyReplaceChance: 0.7,
      decoyActive: true,
      rng: stubRng(true),
    });
    expect(pinned.lkp!.x).toBe(7);
    // chance → false: no replacement
    const notReplaced = updateLkp({
      lkp: { x: 1, y: 1, errorKm: 0.5 },
      playerPos: { x: 1, y: 1 },
      inSensorRange: false,
      refreshDue: false,
      maneuvers: 0,
      pingHit: false,
      pingRangeKm: 0,
      bearingErrorDeg: 2,
      driftErrorM: 50,
      driftMaxKm: 1.5,
      newDecoy: { x: 7, y: 8 },
      decoyReplaceChance: 0.7,
      decoyActive: false,
      rng: stubRng(false),
    });
    expect(notReplaced.lkp!.x).toBe(1);
    expect(notReplaced.decoyActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aiSystem — escort state transitions driven by perception (integration)
// ---------------------------------------------------------------------------

describe('aiSystem escort perception → state (GAME_DESIGN §6.1)', () => {
  it('NORMAL → SUSPICIOUS when the player is noisy inside passive range', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 10.5, y: 10 }, noise: 80, depthLayer: 'Shallow' });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 5);
    expect(escort.aiState).toBe('SUSPICIOUS');
  });

  it('NORMAL → SUSPICIOUS when the player pings within 8 km (escort hears it)', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 12, y: 10 }, noise: 0, depthLayer: 'Deep' });
    const ctx = makeCtx({ enemies: [escort], player, pingEdge: true });
    tick(ctx); // ping edge tick
    expect(escort.aiState).toBe('SUSPICIOUS');
  });

  it('merchants do not react to a player ping', () => {
    const merchant = makeEnemy({ shipClass: 'Merchant', position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 12, y: 10 }, noise: 0 });
    const ctx = makeCtx({ enemies: [merchant], player, pingEdge: true });
    tick(ctx);
    expect(merchant.aiState).toBe('NORMAL');
  });

  it('SUSPICIOUS → ALERT when detection crosses 40 (from F3 deltas)', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    // noise 100 + Surface + Clear at 0 km → 7.5 %/s; ~5.3 s to reach 40
    const player = makePlayer({ position: { x: 10, y: 10 }, noise: 100, depthLayer: 'Surface' });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 600); // 30 s
    expect(ctx.player.detection).toBeGreaterThanOrEqual(40);
    expect(escort.aiState).toBe('ALERT');
  });

  it('SUSPICIOUS → ALERT on 2 consecutive own-ping hits with range', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 12, y: 10 }, noise: 0, depthLayer: 'Deep' }); // no F3 noise
    const ctx = makeCtx({ enemies: [escort], player, pingEdge: true });
    tick(ctx); // player ping heard → NORMAL → SUSPICIOUS (ping cadence starts)
    ctx.pingEdge = false;
    runTicks(ctx, 10); // own ping fires at t≈0.1 → hit (2 km) → +8
    expect(escort.aiState).toBe('SUSPICIOUS');
    expect(ctx.player.detection).toBeGreaterThanOrEqual(
      BALANCE.enemyAI.activePing.detectionGainOnPlayer,
    );
    runTicks(ctx, 100); // second ping at t≈4.1 → 2 consecutive hits → ALERT
    expect(escort.aiState).toBe('ALERT');
  });

  it('ALERT → SEARCHING when a torpedo runs within 3 km', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'ALERT',
      lkp: { x: 10, y: 10, errorKm: 0 },
    });
    const player = makePlayer({ position: { x: 10, y: 12 }, noise: 0 });
    const torp = makeTorpedo({ position: { x: 8, y: 10 } }); // 2 km away
    const ctx = makeCtx({ enemies: [escort], player, torpedoes: [torp] });
    tick(ctx);
    expect(escort.aiState).toBe('SEARCHING');
  });

  it('SEARCHING → HUNTING when detection ≥ 60', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'SEARCHING',
      lkp: { x: 10, y: 10, errorKm: 0 },
    });
    const player = makePlayer({ position: { x: 10, y: 10 }, noise: 0, detection: 61 });
    const ctx = makeCtx({ enemies: [escort], player });
    tick(ctx);
    expect(escort.aiState).toBe('HUNTING');
  });

  it('SEARCHING → LOST_CONTACT after 120 s without contact', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'SEARCHING',
      lkp: { x: 10, y: 10, errorKm: 0 },
    });
    const player = makePlayer({ position: { x: 50, y: 50 }, noise: 0 }); // out of range
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 200); // 10 s — still searching
    expect(escort.aiState).toBe('SEARCHING');
    runTicks(ctx, 2500); // +125 s — timed out
    expect(escort.aiState).toBe('LOST_CONTACT');
  });

  it('HUNTING degrades to SEARCHING after detection < 40 for 30 s', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 20,
    });
    const player = makePlayer({ position: { x: 30, y: 30 }, noise: 0, detection: 20 }); // out of range, low detection
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 610); // 30.5 s below 40 → SEARCHING (timer crosses 30 at tick 601)
    expect(escort.aiState).toBe('SEARCHING');
  });

  it('LOST_CONTACT → NORMAL after 60 s at the escort post', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'LOST_CONTACT',
      lkp: null,
    });
    const player = makePlayer({ position: { x: 40, y: 40 }, noise: 0 });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 200); // 10 s
    expect(escort.aiState).toBe('LOST_CONTACT');
    runTicks(ctx, 1100); // +55 s → 65 s total at/heading to post
    expect(escort.aiState).toBe('NORMAL');
  });
});

// ---------------------------------------------------------------------------
// aiSystem — depth charges, deck gun, sunk, convoy, LKP, determinism
// ---------------------------------------------------------------------------

describe('aiSystem attacks and events', () => {
  it('destroyer depth-charge volley cadence: 6 per round at 3 s, 20 s round gap, ammo spent', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 20,
    });
    const player = makePlayer({
      position: { x: 10.001, y: 10 },
      noise: 0,
      detection: 80,
      depthLayer: 'Deep',
    });
    const bus = createEventBus();
    const ctx = makeCtx({ enemies: [escort], player, bus });
    const dropTimes: number[] = [];
    const dropped: string[] = [];
    bus.subscribe((ev) => {
      if (ev.type === 'depthCharge.dropped') {
        dropTimes.push(ev.simTime);
        dropped.push(ev.payload?.shipId as string);
      }
    });
    runTicks(ctx, 800); // 40 s → drops at 0.05..15.05 (round 1) and 35.05, 38.05 (round 2)
    expect(dropTimes.length).toBeGreaterThanOrEqual(7);
    // first 6 drops: 3 s apart
    for (let i = 1; i < Math.min(6, dropTimes.length); i++) {
      expect(dropTimes[i]! - dropTimes[i - 1]!).toBeCloseTo(3, 1);
    }
    // round gap: drop 7 (next round) ≥ 20 s after drop 6
    if (dropTimes.length >= 7) {
      expect(dropTimes[6]! - dropTimes[5]!).toBeGreaterThanOrEqual(19);
    }
    expect(dropped.every((id) => id === 'E-01')).toBe(true);
    expect(escort.depthChargesLeft).toBeLessThan(20);
    expect(escort.depthChargesLeft).toBeGreaterThanOrEqual(0);
    // detonations resolved → pending damage handed to combat
    const pending = drainAiPendingDamage();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((d) => d.source === 'depthCharge')).toBe(true);
  });

  it('depth-charge exhaustion disables HUNTING forever (§6.1 escape window)', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 1,
    });
    const player = makePlayer({
      position: { x: 10.001, y: 10 },
      noise: 0,
      detection: 90,
      depthLayer: 'Deep',
    });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 2);
    expect(escort.depthChargesLeft).toBe(0);
    runTicks(ctx, 2);
    expect(escort.aiState).toBe('SEARCHING');
    // even with detection pinned at 90, the escort can never re-enter HUNTING
    runTicks(ctx, 600);
    expect(escort.aiState).toBe('SEARCHING');
  });

  it('deck gun fires on a Surface player within 2 km with 60%→10% hit chance', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'SUSPICIOUS',
      lkp: { x: 10, y: 10, errorKm: 0 },
    });
    const player = makePlayer({ position: { x: 10.8, y: 10 }, noise: 0, depthLayer: 'Surface' });
    const bus = createEventBus();
    const fired: string[] = [];
    const hits: boolean[] = [];
    bus.subscribe((ev) => {
      if (ev.type === 'deckGun.fired') {
        fired.push(ev.payload?.shipId as string);
        hits.push(ev.payload?.hit as boolean);
      }
    });
    const ctx = makeCtx({ enemies: [escort], player, bus });
    runTicks(ctx, 120); // 6 s → at least one shot (cooldown 5 s)
    expect(fired.length).toBeGreaterThanOrEqual(1);
    expect(fired.every((id) => id === 'E-01')).toBe(true);
    const pending = drainAiPendingDamage();
    const hitCount = hits.filter(Boolean).length;
    expect(pending.filter((d) => d.source === 'deckGun').length).toBe(hitCount);
    // cooldown: shots are ≥ 5 s apart
    const shotTimes: number[] = [];
    bus
      .getLog()
      .filter((ev) => ev.type === 'deckGun.fired')
      .forEach((ev) => shotTimes.push(ev.simTime));
    for (let i = 1; i < shotTimes.length; i++) {
      expect(shotTimes[i]! - shotTimes[i - 1]!).toBeGreaterThanOrEqual(DECK_GUN_COOLDOWN_S);
    }
  });

  it('deck gun never fires on a Deep-layer player (targets Surface/Periscope)', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
    });
    const player = makePlayer({ position: { x: 10.5, y: 10 }, noise: 0, depthLayer: 'Deep' });
    const bus = createEventBus();
    const ctx = makeCtx({ enemies: [escort], player, bus });
    runTicks(ctx, 100);
    const fired = bus.getLog().filter((ev) => ev.type === 'deckGun.fired');
    expect(fired).toHaveLength(0);
  });

  it('ship.sunk emitted once when hull reaches 0; convoy mates evade', () => {
    resetAiPendingOutput();
    const sunk = makeEnemy({
      id: 'E-01',
      shipClass: 'Merchant',
      position: { x: 10, y: 10 },
      hull: 0,
      inConvoy: true,
    });
    const mate = makeEnemy({
      id: 'E-02',
      shipClass: 'Merchant',
      position: { x: 10.5, y: 10 },
      inConvoy: true,
    });
    const player = makePlayer({ position: { x: 30, y: 30 }, noise: 0 });
    const bus = createEventBus();
    const sunkEvents: string[] = [];
    bus.subscribe((ev) => {
      if (ev.type === 'ship.sunk') sunkEvents.push(ev.payload?.shipId as string);
    });
    const ctx = makeCtx({ enemies: [sunk, mate], player, bus });
    runTicks(ctx, 3);
    expect(sunkEvents).toEqual(['E-01']);
    // the mate entered the neighbor-evade (45° / 30 s) — heading diverged from fleet 90°
    expect(mate.headingDeg).not.toBe(90);
    expect(mate.speedKt).toBeGreaterThan(0);
  });

  it('escort active-ping cooldown is published on the public view', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 12, y: 10 }, noise: 0 });
    const ctx = makeCtx({ enemies: [escort], player });
    // ping heard → SUSPICIOUS → pings immediately (nextPingAt = simTime)
    ctx.pingEdge = true;
    tick(ctx);
    ctx.pingEdge = false;
    expect(escort.aiState).toBe('SUSPICIOUS');
    expect(escort.activePingCooldown).toBe(0);
    runTicks(ctx, 1);
    expect(escort.activePingCooldown).toBeGreaterThan(0);
    expect(escort.activePingCooldown).toBeLessThanOrEqual(
      BALANCE.enemyAI.activePing.suspiciousIntervalSeconds,
    );
  });

  it('F3 detection deltas accumulate on the player meter and clamp at 100', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({
      position: { x: 10, y: 10 },
      noise: 100,
      depthLayer: 'Surface',
      detection: 99.9,
    });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 5);
    expect(ctx.player.detection).toBe(100);
  });

  it('F3 tolerates chained mission weather (M03 "Clear->Storm") via the Clear fallback', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({
      position: { x: 10, y: 10 },
      noise: 100,
      depthLayer: 'Surface',
      detection: 0,
    });
    const mission = makeMission(1001, { weather: 'Clear->Storm' as WeatherKind });
    const ctx = makeCtx({ enemies: [escort], player, mission }); // no worldState wired
    tick(ctx); // must not throw; Clear sonarFactor 1.0 → 5.25%/s × 0.05 s (t-015: baseRate 0.05 → 0.035)
    expect(ctx.player.detection).toBeCloseTo(100 * 0.035 * 1.5 * 1.0 * 1.0 * 0.05, 6);
  });

  it('F3 uses the world system active weather when wired (Storm sonarFactor 0.6)', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({
      position: { x: 10, y: 10 },
      noise: 100,
      depthLayer: 'Surface',
      detection: 0,
    });
    const ctx = makeCtx({ enemies: [escort], player });
    // The world system (t-009) publishes its active weather on ctx.worldState.
    ctx.worldState = { currentWeather: 'Storm' } as unknown as WorldState;
    tick(ctx);
    // 100 × 0.035 × 1.5 × 0.6 × 1.0 = 3.15 %/s → 0.1575 per 0.05 s tick (t-015)
    expect(ctx.player.detection).toBeCloseTo(3.15 * 0.05, 6);
  });

  it('determinism: identical seed + identical ticks → identical results (no Math.random)', () => {
    const build = (): { ctx: SystemContext; escort: EnemyShip; player: SubmarineState } => {
      const escort = makeEnemy({ position: { x: 10, y: 10 } });
      const player = makePlayer({ position: { x: 10.3, y: 10 }, noise: 70, depthLayer: 'Shallow' });
      const ctx = makeCtx({ enemies: [escort], player, seed: 4242 });
      return { ctx, escort, player };
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 300; i++) {
      a.ctx.simTime += a.ctx.dt;
      b.ctx.simTime += b.ctx.dt;
      aiSystem(a.ctx);
      aiSystem(b.ctx);
    }
    expect(a.escort.position.x).toBeCloseTo(b.escort.position.x, 10);
    expect(a.escort.position.y).toBeCloseTo(b.escort.position.y, 10);
    expect(a.escort.headingDeg).toBe(b.escort.headingDeg);
    expect(a.escort.speedKt).toBe(b.escort.speedKt);
    expect(a.escort.aiState).toBe(b.escort.aiState);
    expect(a.escort.depthChargesLeft).toBe(b.escort.depthChargesLeft);
    expect(a.player.detection).toBe(b.player.detection);
  });

  it('pending damage buffer accumulates per game until drained, then clears', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 20,
    });
    const player = makePlayer({
      position: { x: 10.001, y: 10 },
      noise: 0,
      detection: 80,
      depthLayer: 'Deep',
    });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 5); // drops at t≈0.05 → 1 damage buffered
    const first = drainAiPendingDamage();
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(drainAiPendingDamage()).toHaveLength(0); // drained → cleared
    runTicks(ctx, 70); // next drop at t≈3.05 → fresh accumulation
    expect(drainAiPendingDamage().length).toBeGreaterThanOrEqual(1);
  });

  it('pending buffer never leaks into a different game instance', () => {
    resetAiPendingOutput();
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'HUNTING',
      lkp: { x: 10, y: 10, errorKm: 0 },
      depthChargesLeft: 20,
    });
    const playerA = makePlayer({
      position: { x: 10.001, y: 10 },
      noise: 0,
      detection: 80,
      depthLayer: 'Deep',
    });
    const ctxA = makeCtx({ enemies: [escort], player: playerA });
    runTicks(ctxA, 3); // game A buffers drops
    const ctxB = makeCtx({ enemies: [makeEnemy()], player: makePlayer() }); // fresh game B
    aiSystem(ctxB); // B ticks → buffer re-keys to B (A's undrained data is dropped, never applied to B)
    expect(drainAiPendingDamage()).toHaveLength(0); // buffer belongs to B now; B dropped nothing
    runTicks(ctxB, 3);
    expect(drainAiPendingDamage()).toHaveLength(0); // B has no HUNTING escort → nothing accumulates
  });
});

// ---------------------------------------------------------------------------
// escort figure-8 geometry
// ---------------------------------------------------------------------------

describe('escort figure-8 patrol geometry (GAME_DESIGN §6.3)', () => {
  it('figure-8 waypoints stay within the patrol radius of the post', () => {
    const post = { x: 5, y: 5 };
    const r = BALANCE.enemyAI.escort.patrolRadiusKm; // 1 km
    for (let phase = 0; phase < 2 * Math.PI; phase += 0.01) {
      const p = figure8Point(post, r, phase);
      const d = Math.hypot(p.x - post.x, p.y - post.y);
      expect(d).toBeLessThanOrEqual(r + 1e-9);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it('figure-8 arc derivative is positive everywhere (no phase stall)', () => {
    for (let phase = 0; phase < 2 * Math.PI; phase += 0.05) {
      expect(figure8ArcDerivative(1, phase)).toBeGreaterThan(0);
    }
  });

  it('escort post sits offsetM behind the formation anchor', () => {
    const post = escortPost({ x: 10, y: 10 }, 800, 90); // heading north → behind = south
    expect(post.y).toBeCloseTo(10 - 0.8, 6);
    expect(post.x).toBeCloseTo(10, 6);
  });
});

// ---------------------------------------------------------------------------
// LKP integration through the aiSystem (F5 refresh/drift in the tick loop)
// ---------------------------------------------------------------------------

describe('aiSystem LKP maintenance (F5)', () => {
  it('LKP is set on first contact and refreshes while the player is in range', () => {
    const escort = makeEnemy({ position: { x: 10, y: 10 } });
    const player = makePlayer({ position: { x: 10.5, y: 10 }, noise: 80, depthLayer: 'Shallow' });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 2);
    expect(escort.aiState).toBe('SUSPICIOUS');
    expect(escort.lkp).not.toBeNull();
    expect(escort.lkp!.x).toBeCloseTo(10.5, 6);
  });

  it('LKP error grows when the player maneuvers out of sensor range (drift, cap 1.5 km)', () => {
    const escort = makeEnemy({
      position: { x: 10, y: 10 },
      aiState: 'SEARCHING',
      lkp: { x: 12, y: 12, errorKm: 0 },
    });
    // player far away (out of sensor range), initially heading 0
    const player = makePlayer({ position: { x: 30, y: 30 }, noise: 0, headingDeg: 0 });
    const ctx = makeCtx({ enemies: [escort], player });
    runTicks(ctx, 1); // prime the maneuver tracker
    expect(escort.lkp!.errorKm).toBe(0);
    ctx.player.headingDeg = 180; // one hard maneuver
    runTicks(ctx, 1);
    // 1 maneuver × 50 m drift
    expect(escort.lkp!.errorKm).toBeCloseTo(0.05, 6);
    expect(escort.lkp!.x).toBe(12); // position frozen (out of sensor range)
  });
});
