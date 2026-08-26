/**
 * SILENT DEPTH — missions unit tests (tests/unit/missions.test.ts)
 *
 * Task t-008 acceptance (mission-gate / FR-14, FR-15, FR-20, F9):
 *   - config/missions.json ↔ balance.json.missions consistency (ids,
 *     torpedoes, parMinutes, seeds, escort composition, weather, unlock)
 *   - getMissionDef: valid MissionDefs for all five ids (fields per §9.1/§9.2,
 *     engine-validate compatible, weather chains normalized, world-integrated)
 *   - generator: determinism (same seed → deep-equal; different seeds differ),
 *     constraints (player ≥ 8 km, in-map, ≥ 2 km merchant-group rule, convoy
 *     formation spacing, escort offset), retry cap (≤ maxGenRetries)
 *   - objectives: M01 find+classify+track (no sink), M02/M03 sink victory,
 *     defeat on hull 0 / out-of-bounds 60 s, M05 escape required, F9 escape
 *     timer semantics
 *   - scoring: all six components (§10.1) + grade thresholds; M01 damage from
 *     tracking; M05 escape survival bonus
 *   - source hygiene: no Math.random / DOM in src/missions
 *
 * Environment: vitest node. No Math.random anywhere.
 */

import { describe, expect, it } from 'vitest';
import { loadBalance, type BalanceConfig } from '../../src/core/balance';
import { createEventBus } from '../../src/core/eventBus';
import { createRng } from '../../src/core/rng';
import { FIXED_DT } from '../../src/core/time';
import type { SystemContext } from '../../src/core/engine';
import type {
  Contact,
  ContactState,
  ContactType,
  EnemyShip,
  MissionDef,
  MissionStatus,
  PlayerInputs,
  ScoreParts,
  ShipClass,
  SubmarineState,
} from '../../src/core/types';
import { getMissionDef, getMissionSpec, listMissionSpecs } from '../../src/missions/missions';
import { generateMission, validateSpawns, type GeneratorInput } from '../../src/missions/generator';
import {
  computeGrade,
  computeScoreParts,
  missionRequiresEscape,
  missionsSystem,
  objectivesSystem,
} from '../../src/missions/objectives';
import { initWorld } from '../../src/world/world';

import missionsSrc from '../../src/missions/missions.ts?raw';
import generatorSrc from '../../src/missions/generator.ts?raw';
import objectivesSrc from '../../src/missions/objectives.ts?raw';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

let contactSeq = 0;

function makeContact(
  state: ContactState,
  classification: ContactType,
  trueShipId: string | null = null,
): Contact {
  contactSeq += 1;
  return {
    id: `C-${String(contactSeq).padStart(2, '0')}`,
    state,
    bearingDeg: 0,
    rangeKm: 10,
    bearingErrorDeg: 1,
    rangeErrorFrac: 0.1,
    speedEstimateKt: null,
    headingEstimateDeg: null,
    speedErrorFrac: 0.2,
    classification,
    classifyConfidence: 50,
    confidence: 50,
    signalStrength: 'Medium',
    lastDetectedAt: 0,
    lastPingAt: 0,
    lastBearingAt: 0,
    observations: 1,
    trueShipId,
  };
}

function makeEnemy(
  id: string,
  shipClass: ShipClass,
  x: number,
  y: number,
  hull: number,
): EnemyShip {
  return {
    id,
    shipClass,
    position: { x, y },
    headingDeg: 90,
    speedKt: 9,
    hull,
    aiState: 'NORMAL',
    lkp: null,
    depthChargesLeft: 20,
    activePingCooldown: 0,
    inConvoy: true,
  };
}

function enemiesFromMission(mission: MissionDef, balance: BalanceConfig): EnemyShip[] {
  return mission.spawns.map((s, i) => {
    const cfg = balance.enemyAI.shipTypes[s.type]!;
    return makeEnemy(`E-${String(i + 1).padStart(2, '0')}`, s.type, s.x, s.y, cfg.hull);
  });
}

function makePlayer(
  mission: MissionDef,
  balance: BalanceConfig,
  overrides: Partial<SubmarineState> = {},
): SubmarineState {
  return {
    position: { x: mission.playerStart.x, y: mission.playerStart.y },
    headingDeg: mission.playerStart.headingDeg,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: 'Shallow',
    targetDepthLayer: 'Shallow',
    depthTransitionT: null,
    battery: mission.batteryStart,
    noise: 0,
    hull: balance.hull.playerMax,
    detection: 0,
    silentRunning: false,
    sonarState: 'idle',
    pingCooldown: 0,
    torpedoTubes: [],
    decoyCount: balance.decoy.perMission,
    lowBattery: false,
    outOfBoundsTimer: 0,
    ...overrides,
  };
}

function makeMissionStatus(mission: MissionDef): MissionStatus {
  return {
    missionId: mission.id,
    phase: 'running',
    objectives: (mission.objective.subgoals ?? []).map((s) => ({
      id: s.id,
      desc: s.desc,
      done: false,
      weight: s.weight,
    })),
    escaped: false,
    forcedSurface: false,
  };
}

function zeroScore(): ScoreParts {
  return {
    objective: 0,
    damage: 0,
    stealth: 0,
    torpedoEfficiency: 0,
    time: 0,
    survival: 0,
    total: 0,
    grade: 'Failed',
  };
}

function makeCtx(mission: MissionDef, overrides: Partial<SystemContext> = {}): SystemContext {
  const balance = loadBalance();
  const rng = createRng(mission.seed);
  const ctx: SystemContext = {
    dt: FIXED_DT,
    simTime: 0,
    state: 'MISSION_RUNNING',
    pauseEdge: false,
    pingEdge: false,
    decoyEdge: false,
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
    player: makePlayer(mission, balance),
    contacts: [],
    enemies: enemiesFromMission(mission, balance),
    torpedoes: [],
    decoys: [],
    missionStatus: makeMissionStatus(mission),
    score: zeroScore(),
    stats: {
      torpedoesFired: 0,
      torpedoesHit: 0,
      peakDetection: 0,
      elapsedS: 0,
      torpedoesRemaining: mission.torpedoCount,
      bestScore: 0,
    },
    skip: false,
    ...overrides,
  };
  return ctx;
}

/** setOutcome spy that mirrors engine applyOutcome (phase + outcome log). */
function attachOutcomeSpy(ctx: SystemContext): string[] {
  const outcomes: string[] = [];
  ctx.setOutcome = (o) => {
    outcomes.push(o);
    ctx.missionStatus.phase = o === 'victory' ? 'complete' : 'failed';
  };
  return outcomes;
}

/** One objectives tick: missionsSystem (slot 3) → objectivesSystem (slot 9). */
function objectivesTick(ctx: SystemContext, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.bus.setSimTime(ctx.simTime);
    missionsSystem(ctx);
    objectivesSystem(ctx);
    ctx.simTime += ctx.dt;
  }
}

function distKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function subgoal(ctx: SystemContext, id: string): { done: boolean } {
  const sg = ctx.missionStatus.objectives.find((o) => o.id === id);
  if (sg === undefined) throw new Error(`no subgoal "${id}" in ${ctx.mission.id}`);
  return sg;
}

// ---------------------------------------------------------------------------
// config/missions.json ↔ balance.json.missions consistency
// ---------------------------------------------------------------------------

describe('config/missions.json ↔ balance.json.missions', () => {
  const balance = loadBalance();

  it('has exactly the five missions with matching ids in order', () => {
    const specs = listMissionSpecs();
    expect(specs.map((s) => s.id)).toEqual(['M01', 'M02', 'M03', 'M04', 'M05']);
    expect(balance.missions.map((m) => m.id)).toEqual(['M01', 'M02', 'M03', 'M04', 'M05']);
  });

  it('matches balance for torpedoes, parMinutes, seeds, weather, escorts and unlock', () => {
    for (const bal of balance.missions) {
      const spec = getMissionSpec(bal.id);
      expect(spec, `spec for ${bal.id}`).toBeDefined();
      expect(spec!.torpedoCount).toBe(bal.torpedoes);
      expect(spec!.parMinutes).toBe(bal.parMinutes);
      expect(spec!.seed).toBe(bal.seed);
      expect(spec!.weather).toBe(bal.weather);
      expect(spec!.objectiveKind).toBe(bal.objective);
      expect(spec!.unlock).toBe(bal.unlock);
      expect(spec!.escorts.length).toBe(bal.escorts);
      // balance.escortType is a class LABEL (singular for a uniform escort
      // group, e.g. M04 "Destroyer" × 2); compare the class SET + the count.
      const balClasses = new Set(
        Array.isArray(bal.escortType)
          ? bal.escortType
          : bal.escortType !== undefined
            ? [bal.escortType]
            : [],
      );
      const specClasses = new Set(spec!.escorts);
      expect(specClasses).toEqual(balClasses);
      expect(spec!.difficultyLevel).toBeGreaterThanOrEqual(1);
      expect(spec!.difficultyLevel).toBeLessThanOrEqual(5);
    }
  });

  it('carries the M04 ping interval and M05 escape requirement', () => {
    expect(getMissionSpec('M04')!.escortPingIntervalSeconds).toBe(2);
    expect(getMissionSpec('M05')!.escapeRequired).toBe(true);
    expect(getMissionSpec('M05')!.escorts).toEqual(['Destroyer', 'Destroyer', 'Frigate']);
  });

  it('subgoal weights sum to the objective max (400) for every mission', () => {
    for (const spec of listMissionSpecs()) {
      const sum = (spec.objective.subgoals ?? []).reduce((acc, s) => acc + s.weight, 0);
      expect(sum, `${spec.id} subgoal weights`).toBe(balance.scoring.components.objectiveMax);
    }
  });
});

// ---------------------------------------------------------------------------
// getMissionDef (FR-14 / §9.1 + §9.2)
// ---------------------------------------------------------------------------

describe('getMissionDef', () => {
  const balance = loadBalance();
  const ids = ['M01', 'M02', 'M03', 'M04', 'M05'] as const;

  it('produces a valid MissionDef for every id (table fields + §9.2 defaults)', () => {
    for (const id of ids) {
      const spec = getMissionSpec(id)!;
      const def = getMissionDef(id, balance);
      expect(def.id).toBe(id);
      expect(def.name).toBe(spec.name);
      expect(def.seed).toBe(spec.seed);
      expect(def.torpedoCount).toBe(spec.torpedoCount);
      expect(def.parTimeS).toBe(spec.parMinutes * 60);
      expect(def.difficulty).toBe(spec.difficultyLevel);
      expect(def.batteryStart).toBe(balance.battery.capacity);
      expect(def.patrolArea).toEqual({ km: balance.world.mapSizeKm, gridM: balance.world.gridM });
      expect(def.fleet.formation).toBe('2x2');
      expect(def.fleet.colSpacingM).toBe(balance.enemyAI.escort.formation.colSpacingM);
      expect(def.fleet.rowSpacingM).toBe(balance.enemyAI.escort.formation.rowSpacingM);
      expect(def.fleet.patrolBehavior).toBe('figure8');
      expect(def.fleet.speedKt).toBeGreaterThan(0);
      expect(def.spawns.length).toBeGreaterThan(0);
      expect(def.objective.subgoals?.length).toBeGreaterThan(0);
      expect(def.visibilityKm).toBe(
        balance.weather[def.weather.split('->')[0] as keyof typeof balance.weather]!.visibilityKm,
      );
    }
  });

  it('normalizes weather chains and the M05 Night+Fog label', () => {
    expect(getMissionDef('M02', balance).weather).toBe('Clear->Cloudy');
    expect(getMissionDef('M03', balance).weather).toBe('Cloudy->Storm');
    expect(getMissionDef('M04', balance).weather).toBe('Storm->Fog');
    expect(getMissionDef('M05', balance).weather).toBe('Night->Fog'); // table: 'Night+Fog'
  });

  it('spawn compositions match the table (merchants + escorts)', () => {
    const byId: Record<string, [Record<string, number>, ShipClass[]]> = {
      M01: [{ Merchant: 1 }, []],
      M02: [{ Tanker: 1 }, []],
      M03: [{ Cargo: 4 }, ['Destroyer']],
      M04: [{ Cargo: 4 }, ['Destroyer', 'Destroyer']],
      M05: [{ Cargo: 4 }, ['Destroyer', 'Destroyer', 'Frigate']],
    };
    for (const [id, [enemies, escorts]] of Object.entries(byId)) {
      const def = getMissionDef(id, balance);
      const counts = new Map<string, number>();
      for (const s of def.spawns) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
      for (const [cls, n] of Object.entries(enemies))
        expect(counts.get(cls), `${id} ${cls}`).toBe(n);
      const escortCounts = new Map<string, number>();
      for (const cls of escorts) escortCounts.set(cls, (escortCounts.get(cls) ?? 0) + 1);
      for (const [cls, n] of escortCounts) expect(counts.get(cls), `${id} escort ${cls}`).toBe(n);
      const totalEnemies = Object.values(enemies).reduce((a, b) => a + b, 0) + escorts.length;
      expect(def.spawns).toHaveLength(totalEnemies);
    }
  });

  it('passes the engine validateMissionDef contract for every id', () => {
    for (const id of ids) {
      const def = getMissionDef(id, balance);
      expect(def.id.length).toBeGreaterThan(0);
      expect(typeof def.objective.kind).toBe('string');
      expect(Number.isInteger(def.playerStart.x) || typeof def.playerStart.x === 'number').toBe(
        true,
      );
      for (const s of def.spawns) {
        expect(s.type in balance.enemyAI.shipTypes, `${id} spawn type ${s.type}`).toBe(true);
        expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.headingDeg)).toBe(
          true,
        );
      }
      expect(Number.isInteger(def.torpedoCount) && def.torpedoCount > 0).toBe(true);
      expect(def.batteryStart).toBeGreaterThanOrEqual(0);
      expect(def.batteryStart).toBeLessThanOrEqual(balance.battery.capacity);
    }
  });

  it('is deterministic and world-compatible (initWorld parses the weather chain)', () => {
    for (const id of ids) {
      const a = getMissionDef(id, balance);
      const b = getMissionDef(id, balance);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(() => initWorld(a, a.seed, balance)).not.toThrow();
    }
  });

  it('throws a clear TypeError for an unknown id', () => {
    expect(() => getMissionDef('M99', balance)).toThrow(/unknown mission id/);
  });
});

// ---------------------------------------------------------------------------
// generator (FR-15 / §9.2)
// ---------------------------------------------------------------------------

describe('generator', () => {
  const balance = loadBalance();

  const baseInput = (overrides: Partial<GeneratorInput> = {}): GeneratorInput => ({
    id: 'M-TEST',
    name: 'Generator Test',
    enemies: { Cargo: 4 },
    escorts: ['Destroyer'],
    weather: 'Cloudy->Storm',
    visibility: 'medium',
    torpedoes: 5,
    battery: 100,
    objective: { kind: 'sink_ge2_merchants', subgoals: [{ id: 'sink-1', weight: 200, desc: 'x' }] },
    parMinutes: 30,
    difficulty: 3,
    ...overrides,
  });

  it('same seed → deep-equal MissionDef; different seeds → different layouts', () => {
    const a = generateMission(baseInput(), 1003, balance);
    const b = generateMission(baseInput(), 1003, balance);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateMission(baseInput(), 1004, balance);
    expect(c).not.toEqual(a);
    const spawnsDiffer = a.spawns.some((s, i) => {
      const t = c.spawns[i]!;
      return s.x !== t.x || s.y !== t.y;
    });
    expect(spawnsDiffer).toBe(true);
  });

  it('places the player ≥ 8 km from every enemy (balance.world.playerSpawnMinDistKm)', () => {
    for (const id of ['M01', 'M02', 'M03', 'M04', 'M05']) {
      const def = getMissionDef(id, balance);
      for (const s of def.spawns) {
        expect(distKm(def.playerStart, s), `${id}: player vs ${s.type}`).toBeGreaterThanOrEqual(
          balance.world.playerSpawnMinDistKm - 1e-9,
        );
      }
    }
  });

  it('keeps every spawn inside the map', () => {
    for (const id of ['M01', 'M02', 'M03', 'M04', 'M05']) {
      const def = getMissionDef(id, balance);
      for (const s of def.spawns) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(balance.world.mapSizeKm);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(balance.world.mapSizeKm);
      }
      expect(def.playerStart.x).toBeGreaterThanOrEqual(0);
      expect(def.playerStart.x).toBeLessThanOrEqual(balance.world.mapSizeKm);
      expect(def.playerStart.y).toBeGreaterThanOrEqual(0);
      expect(def.playerStart.y).toBeLessThanOrEqual(balance.world.mapSizeKm);
    }
  });

  it('convoy merchants sit at their 2×2 formation slots (≥ 400 m apart)', () => {
    for (const id of ['M03', 'M04', 'M05']) {
      const def = getMissionDef(id, balance);
      const cargo = def.spawns.filter((s) => s.type === 'Cargo');
      expect(cargo).toHaveLength(4);
      let minPair = Infinity;
      for (let i = 0; i < cargo.length; i++) {
        for (let j = i + 1; j < cargo.length; j++) {
          minPair = Math.min(minPair, distKm(cargo[i]!, cargo[j]!));
        }
      }
      // formation min spacing = rowSpacingM 400 m (diagonal ≈ 640 m)
      expect(minPair).toBeGreaterThanOrEqual(
        balance.enemyAI.escort.formation.rowSpacingM / 1000 - 1e-9,
      );
    }
  });

  it('merchant groups of different classes stay ≥ 2 km apart (§9.2 rule)', () => {
    const input = baseInput({ enemies: { Merchant: 1, Tanker: 1 }, escorts: [] });
    const def = generateMission(input, 4242, balance);
    const merchants = def.spawns.filter((s) => s.type === 'Merchant' || s.type === 'Tanker');
    expect(merchants).toHaveLength(2);
    expect(distKm(merchants[0]!, merchants[1]!)).toBeGreaterThanOrEqual(2 - 1e-9);
    // validateSpawns itself rejects closer groups (overlap guard / group rule)
    const def2 = generateMission(input, 4242, balance);
    def2.spawns[0]!.x = def2.spawns[1]!.x;
    def2.spawns[0]!.y = def2.spawns[1]!.y;
    expect(validateSpawns(def2, input, balance)).toMatch(
      /merchant groups closer than 2 km|spawns too close/,
    );
  });

  it('places escorts about 800 m behind the merchant formation', () => {
    const def = getMissionDef('M03', balance);
    const cargo = def.spawns.filter((s) => s.type === 'Cargo');
    const escort = def.spawns.find((s) => s.type === 'Destroyer')!;
    const cx = cargo.reduce((acc, s) => acc + s.x, 0) / cargo.length;
    const cy = cargo.reduce((acc, s) => acc + s.y, 0) / cargo.length;
    const d = distKm(escort, { x: cx, y: cy });
    expect(d).toBeGreaterThan(balance.world.escortOffsetM / 1000 - 0.2);
    expect(d).toBeLessThan(balance.world.escortOffsetM / 1000 + 0.6);
    // behind the fleet: projection along the heading is negative
    const h = (def.fleet.headingDeg * Math.PI) / 180;
    const along = (escort.x - cx) * Math.cos(h) + (escort.y - cy) * Math.sin(h);
    expect(along).toBeLessThan(0);
  });

  it('retries with seed++ up to maxGenRetries then throws for unsatisfiable constraints', () => {
    const bad = JSON.parse(JSON.stringify(balance)) as BalanceConfig;
    bad.world.playerSpawnMinDistKm = 100; // impossible inside a 30 km map
    const attempts = bad.world.maxGenRetries + 1;
    expect(() => generateMission(baseInput(), 1003, bad)).toThrow(TypeError);
    expect(() => generateMission(baseInput(), 1003, bad)).toThrow(/no valid layout/);
    expect(() => generateMission(baseInput(), 1003, bad)).toThrow(
      new RegExp(`${attempts} attempts`),
    );
  });

  it('never uses Math.random (seeded RNG only)', () => {
    expect(generatorSrc.match(/Math\.random\s*\(/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// objectives — M01 find/classify/track (FR-20)
// ---------------------------------------------------------------------------

describe('objectives — M01 (find + classify + track, no sink)', () => {
  const balance = loadBalance();

  it('completes on classify+track without sinking anything', () => {
    const mission = getMissionDef('M01', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    // the merchant contact arrives (sonar t-005 would create it)
    ctx.contacts.push(makeContact('UNKNOWN', 'Merchant', 'E-01'));

    objectivesTick(ctx);
    expect(subgoal(ctx, 'find').done).toBe(true);
    expect(subgoal(ctx, 'classify').done).toBe(false);
    expect(subgoal(ctx, 'track').done).toBe(false);
    expect(outcomes).toEqual([]);

    ctx.contacts[0]!.state = 'CLASSIFIED';
    objectivesTick(ctx);
    expect(subgoal(ctx, 'classify').done).toBe(true);
    expect(outcomes).toEqual([]);

    ctx.contacts[0]!.state = 'TRACKED';
    objectivesTick(ctx);
    expect(subgoal(ctx, 'track').done).toBe(true);
    expect(outcomes).toEqual(['victory']);
    // no enemy ever sank
    for (const e of ctx.enemies) expect(e.hull).toBeGreaterThan(0);
  });

  it('is idempotent after the outcome (no repeated victory calls)', () => {
    const mission = getMissionDef('M01', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    ctx.contacts.push(makeContact('TRACKED', 'Merchant', 'E-01'));
    objectivesTick(ctx);
    expect(outcomes).toEqual(['victory']);
    objectivesTick(ctx); // phase already 'complete'
    objectivesTick(ctx);
    expect(outcomes).toEqual(['victory']);
  });
});

// ---------------------------------------------------------------------------
// objectives — sink missions & defeat (FR-20)
// ---------------------------------------------------------------------------

describe('objectives — sink objectives & defeat', () => {
  const balance = loadBalance();

  it('M02: victory once the tanker is sunk', () => {
    const mission = getMissionDef('M02', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    objectivesTick(ctx);
    expect(outcomes).toEqual([]);
    ctx.enemies[0]!.hull = 0;
    objectivesTick(ctx);
    expect(subgoal(ctx, 'sink-1').done).toBe(true);
    expect(outcomes).toEqual(['victory']);
  });

  it('M03: victory at ≥ 2 cargo sunk, not before', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    const cargo = ctx.enemies.filter((e) => e.shipClass === 'Cargo');
    cargo[0]!.hull = 0;
    objectivesTick(ctx);
    expect(subgoal(ctx, 'sink-1').done).toBe(true);
    expect(subgoal(ctx, 'sink-2').done).toBe(false);
    expect(outcomes).toEqual([]);

    cargo[1]!.hull = 0;
    objectivesTick(ctx);
    expect(subgoal(ctx, 'sink-2').done).toBe(true);
    expect(outcomes).toEqual(['victory']);
  });

  it('defeat on hull 0 (precedence over victory on the same tick)', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    ctx.enemies.filter((e) => e.shipClass === 'Cargo').forEach((e) => (e.hull = 0)); // victory would otherwise apply
    ctx.player.hull = 0;
    objectivesTick(ctx);
    expect(outcomes).toEqual(['defeat']);
  });

  it('defeat on out-of-bounds ≥ 60 s (balance.world.outOfBoundsFailSeconds)', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    ctx.player.outOfBoundsTimer = balance.world.outOfBoundsFailSeconds - 0.01;
    objectivesTick(ctx);
    expect(outcomes).toEqual([]);
    ctx.player.outOfBoundsTimer = balance.world.outOfBoundsFailSeconds;
    objectivesTick(ctx);
    expect(outcomes).toEqual(['defeat']);
  });

  it('updates score as running totals each tick', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = makeCtx(mission);
    ctx.simTime = mission.parTimeS;
    objectivesTick(ctx);
    const first = { ...ctx.score };
    expect(first.total).toBeGreaterThan(0);
    ctx.enemies
      .filter((e) => e.shipClass === 'Cargo')
      .slice(0, 2)
      .forEach((e) => (e.hull = 0));
    objectivesTick(ctx);
    expect(ctx.score.objective).toBeGreaterThan(first.objective);
  });
});

// ---------------------------------------------------------------------------
// objectives — M05 escape (F9)
// ---------------------------------------------------------------------------

describe('objectives — M05 escape required (F9)', () => {
  const balance = loadBalance();

  it('sink alone is NOT victory — escape is required', () => {
    const mission = getMissionDef('M05', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    ctx.enemies.filter((e) => e.shipClass === 'Cargo')[0]!.hull = 0;
    objectivesTick(ctx);
    expect(subgoal(ctx, 'sink-1').done).toBe(true);
    expect(subgoal(ctx, 'escape').done).toBe(false);
    expect(outcomes).toEqual([]);
    expect(missionRequiresEscape(ctx)).toBe(true);
  });

  it('escape completes after detection < threshold (25, t-015) for 30 s with escorts far away', () => {
    const mission = getMissionDef('M05', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    // silence + escorts far from the player
    ctx.player.detection = 10;
    for (const e of ctx.enemies) {
      if (e.shipClass === 'Destroyer' || e.shipClass === 'Frigate') {
        e.position = { x: ctx.player.position.x + 5, y: ctx.player.position.y };
      }
    }
    ctx.dt = 1; // accelerate the timer: 30 ticks = 30 s
    ctx.enemies.filter((e) => e.shipClass === 'Cargo')[0]!.hull = 0; // sink done

    objectivesTick(ctx, 15);
    expect(ctx.missionStatus.escaped).toBe(false);
    objectivesTick(ctx, 16); // total 31 s
    expect(ctx.missionStatus.escaped).toBe(true);
    expect(subgoal(ctx, 'escape').done).toBe(true);
    expect(outcomes).toEqual(['victory']);
    const escapedEvent = ctx.bus.getLog().find((e) => e.type === 'escape.escaped');
    expect(escapedEvent).toBeDefined();
    expect(escapedEvent!.payload).toEqual({
      missionId: 'M05',
      durationSeconds: balance.escape.durationSeconds,
    });
  });

  it('a nearby escort or detection ≥ threshold (25, t-015) resets the escape timer', () => {
    const mission = getMissionDef('M05', balance);
    const ctx = makeCtx(mission);
    const outcomes = attachOutcomeSpy(ctx);
    ctx.dt = 1;
    ctx.player.detection = 10;
    const escort = ctx.enemies.find((e) => e.shipClass === 'Destroyer')!;
    escort.position = { x: ctx.player.position.x + 1, y: ctx.player.position.y }; // too close
    objectivesTick(ctx, 40);
    expect(ctx.missionStatus.escaped).toBe(false);
    expect(outcomes).toEqual([]);

    escort.position = { x: ctx.player.position.x + 5, y: ctx.player.position.y }; // far now
    ctx.player.detection = 50; // but loud — blocks
    objectivesTick(ctx, 20);
    expect(ctx.missionStatus.escaped).toBe(false);

    ctx.player.detection = 10;
    objectivesTick(ctx, 29);
    expect(ctx.missionStatus.escaped).toBe(false); // 29 s < 30
    objectivesTick(ctx, 1);
    expect(ctx.missionStatus.escaped).toBe(true); // 30 s sustained
  });

  it('escape emits exactly once', () => {
    const mission = getMissionDef('M05', balance);
    const ctx = makeCtx(mission);
    ctx.dt = 1;
    ctx.player.detection = 10;
    objectivesTick(ctx, 60);
    const events = ctx.bus.getLog().filter((e) => e.type === 'escape.escaped');
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// scoring (GAME_DESIGN §10.1)
// ---------------------------------------------------------------------------

describe('scoring', () => {
  const balance = loadBalance();

  function scoreCtx(mission: MissionDef, overrides: Partial<SystemContext> = {}): SystemContext {
    const ctx = makeCtx(mission, overrides);
    return ctx;
  }

  it('computes all six components for M03 (2 cargo sunk, 40 peak detection)', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = scoreCtx(mission);
    ctx.simTime = mission.parTimeS;
    ctx.stats.peakDetection = 40;
    ctx.stats.torpedoesHit = 2;
    ctx.enemies
      .filter((e) => e.shipClass === 'Cargo')
      .slice(0, 2)
      .forEach((e) => (e.hull = 0));
    ctx.missionStatus.objectives.forEach((o) => (o.done = true)); // both sink subgoals

    const parts = computeScoreParts(ctx);
    expect(parts.objective).toBe(400);
    expect(parts.damage).toBe(120); // 2 × Cargo 60, capped at 200
    expect(parts.stealth).toBeCloseTo(150 * (1 - 40 / 100), 9);
    expect(parts.torpedoEfficiency).toBe(100); // 2/2 expected
    expect(parts.time).toBe(100); // par / actual = 1
    expect(parts.survival).toBe(50); // hull 100
    expect(parts.total).toBe(860);
    expect(parts.grade).toBe('Excellent');
  });

  it('caps damage at 200 and reaches Perfect (1000)', () => {
    const mission = getMissionDef('M03', balance);
    const ctx = scoreCtx(mission);
    ctx.simTime = mission.parTimeS;
    ctx.stats.torpedoesHit = 2;
    ctx.enemies.filter((e) => e.shipClass === 'Cargo').forEach((e) => (e.hull = 0)); // 4 × 60 = 240 → cap 200
    ctx.missionStatus.objectives.forEach((o) => (o.done = true));
    const parts = computeScoreParts(ctx);
    expect(parts.damage).toBe(200);
    expect(parts.total).toBe(1000);
    expect(parts.grade).toBe('Perfect');
  });

  it('M05 escaped adds the survival bonus (max 100) and can exceed 1000', () => {
    const mission = getMissionDef('M05', balance);
    const ctx = scoreCtx(mission);
    ctx.simTime = mission.parTimeS;
    ctx.stats.torpedoesHit = 1;
    ctx.missionStatus.escaped = true;
    ctx.missionStatus.objectives.forEach((o) => (o.done = true));
    ctx.enemies.filter((e) => e.shipClass === 'Cargo').forEach((e) => (e.hull = 0)); // damage 240 → cap 200
    const parts = computeScoreParts(ctx);
    expect(parts.survival).toBe(50 + balance.scoring.m05EscapeBonus); // 100
    expect(parts.total).toBe(1050);
    expect(parts.grade).toBe('Perfect');
  });

  it('M01 damage component comes from tracking progress (§10.1.2)', () => {
    const mission = getMissionDef('M01', balance);
    const ctx = scoreCtx(mission);
    ctx.contacts.push(makeContact('TRACKED', 'Merchant', 'E-01'));
    ctx.missionStatus.objectives.forEach((o) => (o.done = true));
    expect(computeScoreParts(ctx).damage).toBe(100); // damageMax / 2
    ctx.contacts[0]!.state = 'CONFIRMED';
    expect(computeScoreParts(ctx).damage).toBe(200); // damageMax
  });

  it('torpedo efficiency is always 100 for M01 (expectedHits 0)', () => {
    const mission = getMissionDef('M01', balance);
    const ctx = scoreCtx(mission);
    ctx.stats.torpedoesHit = 0;
    expect(computeScoreParts(ctx).torpedoEfficiency).toBe(100);
  });

  it('time component scales with par/actual', () => {
    const mission = getMissionDef('M02', balance);
    const ctx = scoreCtx(mission);
    ctx.simTime = mission.parTimeS / 2;
    expect(computeScoreParts(ctx).time).toBeCloseTo(100, 9);
    ctx.simTime = mission.parTimeS * 2;
    expect(computeScoreParts(ctx).time).toBeCloseTo(50, 9);
    ctx.simTime = 0;
    expect(computeScoreParts(ctx).time).toBe(100); // just started: on pace
  });

  it('grade thresholds: 1000/800/600/400 (balance.scoring.grades)', () => {
    const cases: Array<[number, string]> = [
      [1000, 'Perfect'],
      [999, 'Excellent'],
      [800, 'Excellent'],
      [799, 'Good'],
      [600, 'Good'],
      [599, 'Poor'],
      [400, 'Poor'],
      [399, 'Failed'],
      [0, 'Failed'],
    ];
    for (const [total, grade] of cases) {
      expect(computeGrade(total, balance)).toBe(grade);
    }
  });
});

// ---------------------------------------------------------------------------
// engine integration (getMissionDef output feeds the real engine pipeline)
// ---------------------------------------------------------------------------

describe('engine integration', () => {
  const balance = loadBalance();

  it('createGame accepts every generated MissionDef (validate + enemies + world)', async () => {
    const { createGame, step } = await import('../../src/core/engine');
    for (const id of ['M01', 'M02', 'M03', 'M04', 'M05']) {
      const def = getMissionDef(id, balance);
      const handle = createGame(def, def.seed);
      const snap = step(handle, FIXED_DT, { ...IDLE_INPUT });
      expect(snap.state).toBe('MISSION_LOADING');
      expect(snap.enemies).toHaveLength(def.spawns.length);
      expect(snap.mission.objectives.length).toBe((def.objective.subgoals ?? []).length);
    }
  });

  it('M05 Night->Fog weather chain drives the world system without throwing', () => {
    const def = getMissionDef('M05', balance);
    const world = initWorld(def, def.seed, balance);
    expect(world.sequence.map(([k]) => k)).toEqual(['Night', 'Fog']);
    expect(world.currentWeather).toBe('Night');
  });
});

// ---------------------------------------------------------------------------
// source hygiene (ADR-004 / @pure)
// ---------------------------------------------------------------------------

describe('src/missions source hygiene', () => {
  it('contains no Math.random calls and no DOM references', () => {
    for (const [name, src] of [
      ['missions.ts', missionsSrc],
      ['generator.ts', generatorSrc],
      ['objectives.ts', objectivesSrc],
    ] as const) {
      expect(src.match(/Math\.random\s*\(/), `${name} must not call Math.random`).toBeNull();
      expect(
        src.match(/\bwindow\b|\bdocument\b|localStorage|AudioContext|performance\.now|Date\.now/),
        `${name} must stay @pure`,
      ).toBeNull();
    }
  });
});
