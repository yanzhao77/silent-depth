/**
 * SILENT DEPTH — sonar system unit tests (tests/unit/sonar.test.ts)
 *
 * Task t-005 acceptance (sonar-gate, P0):
 *   - active ping: range/cooldown/battery/self-exposure, error-bounded
 *     returns, signal bands, sonar.ping / sonar.contact events
 *   - passive: bearing-only contacts, zero self-exposure, bearing
 *     convergence, engine/torpedo/explosion sources, observation cadence
 *   - contacts: stable ids, §5.4 state machine (Unknown → … → Confirmed),
 *     decay/degrade/loss
 *   - uncertainty: ping/passive error convergence, speed/heading errors,
 *     error exemption
 *   - classification: vote outcomes, type naming + locking
 *   - determinism: same seed + same inputs → identical contacts (no
 *     Math.random anywhere)
 *
 * Environment: vitest node. All randomness flows through ctx.forks.sonar
 * (seeded, ADR-004).
 */

import { describe, expect, it } from 'vitest'
import { loadBalance } from '../../src/core/balance'
import type { BalanceConfig } from '../../src/core/balance'
import { createEventBus } from '../../src/core/eventBus'
import type { EventBus } from '../../src/core/eventBus'
import { createRng } from '../../src/core/rng'
import { FIXED_DT } from '../../src/core/time'
import type { SystemContext } from '../../src/core/engine'
import type {
  Contact,
  EnemyShip,
  MissionDef,
  PlayerInputs,
  SubmarineState,
  Torpedo,
} from '../../src/core/types'

import { sonarSystem } from '../../src/sonar/sonar'
import {
  pingBearingErrorDeg,
  pingRangeErrorFrac,
  passiveBearingErrorDeg,
  speedHeadingErrorFrac,
  rangeErrorFracFor,
  errorsExempt,
  TRACKED_RANGE_ERROR_FRAC,
} from '../../src/sonar/uncertainty'
import {
  UNKNOWN_VOTE_THRESHOLD,
  voteClassification,
  pingSignalFor,
  passiveSignalForClass,
  isLargeSurfaceClass,
} from '../../src/sonar/classification'
import {
  PASSIVE_OBS_INTERVAL_S,
  TORPEDO_PASSIVE_INTERVAL_S,
} from '../../src/sonar/passive'
import { compassBearing } from '../../src/sonar/contacts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BALANCE = loadBalance()

function makeMission(seed = 1001, overrides: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'M-TEST',
    name: 'Sonar Test Mission',
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
    playerStart: { x: 0, y: 0, headingDeg: 0 },
    weather: 'Clear',
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed,
    briefingSeconds: 2,
    ...overrides,
  }
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
}

function makePlayer(overrides: Partial<SubmarineState> = {}): SubmarineState {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 0,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: 'Medium',
    targetDepthLayer: 'Medium',
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
  }
}

function makeEnemy(overrides: Partial<EnemyShip> = {}): EnemyShip {
  return {
    id: 'E-01',
    shipClass: 'Destroyer',
    position: { x: 2, y: 0 }, // 2 km east of the player
    headingDeg: 90,
    speedKt: 20,
    hull: 190,
    aiState: 'NORMAL',
    lkp: null,
    depthChargesLeft: 20,
    activePingCooldown: 0,
    inConvoy: false,
    ...overrides,
  }
}

function makeTorpedo(overrides: Partial<Torpedo> = {}): Torpedo {
  return {
    id: 'T-01',
    state: 'RUNNING',
    position: { x: 5, y: 0 },
    headingDeg: 270,
    speedKt: 40,
    ageS: 1,
    distanceKm: 0,
    targetShipId: null,
    targetContactId: null,
    firedAt: 0,
    nearestPass: null,
    ...overrides,
  }
}

interface CtxOptions {
  mission?: MissionDef
  player?: SubmarineState
  enemies?: EnemyShip[]
  torpedoes?: Torpedo[]
  simTime?: number
  dt?: number
  pingEdge?: boolean
  bus?: EventBus
  seed?: number
}

function makeCtx(opts: CtxOptions = {}): SystemContext {
  const mission = opts.mission ?? makeMission(opts.seed ?? 1001)
  const rng = createRng(mission.seed)
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
  }
}

/** One fixed tick: bus simTime sync (engine behaviour), advance, sonar run. */
function tick(ctx: SystemContext): void {
  ctx.simTime += ctx.dt
  ctx.bus.setSimTime(ctx.simTime)
  sonarSystem(ctx)
}

function runTicks(ctx: SystemContext, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(ctx)
}

/** Fire one active ping (edge on/off), resetting the cooldown for speed. */
function doPing(ctx: SystemContext): void {
  ctx.pingEdge = true
  tick(ctx)
  ctx.pingEdge = false
}

/** Angular distance between two compass bearings in degrees. */
function angularDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

// ---------------------------------------------------------------------------
// Active ping
// ---------------------------------------------------------------------------

describe('active ping (GAME_DESIGN §5.1)', () => {
  it('detects an enemy within 10 km with error-bounded bearing and range', () => {
    const enemy = makeEnemy({ position: { x: 8, y: 6 } }) // 10 km
    const ctx = makeCtx({ enemies: [enemy] })
    doPing(ctx)
    expect(ctx.contacts).toHaveLength(1)
    const c = ctx.contacts[0]!
    const trueBearing = compassBearing(ctx.player.position, enemy.position)
    const trueRange = 10
    expect(angularDiffDeg(c.bearingDeg, trueBearing)).toBeLessThanOrEqual(BALANCE.sonar.active.bearingErrorDeg + 1e-9)
    expect(Math.abs(c.rangeKm! - trueRange) / trueRange).toBeLessThanOrEqual(0.1 + 1e-9)
    // the cascade promotes a pinged contact to CLASSIFIED with a range
    expect(c.state).toBe('CLASSIFIED')
    expect(c.rangeKm).not.toBeNull()
  })

  it('ignores enemies beyond 10 km', () => {
    const enemy = makeEnemy({ position: { x: 12, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    doPing(ctx)
    expect(ctx.contacts).toHaveLength(0)
  })

  it('enforces the 6 s cooldown (no battery/detection/contact change)', () => {
    const enemy = makeEnemy({ position: { x: 2, y: 0 } })
    const player = makePlayer({ battery: 100, detection: 0 })
    const ctx = makeCtx({ enemies: [enemy], player })
    doPing(ctx)
    // the ping tick itself consumes one fixed step of the countdown
    expect(ctx.player.pingCooldown).toBe(BALANCE.sonar.active.cooldownSeconds - FIXED_DT)
    expect(ctx.player.battery).toBe(100 - BALANCE.sonar.active.batteryPercent)
    expect(ctx.player.detection).toBe(BALANCE.sonar.active.selfExposureDetection)
    const rangeAfterFirst = ctx.contacts[0]!.rangeKm
    const batteryAfterFirst = ctx.player.battery
    // second edge while on cooldown → no-op
    doPing(ctx)
    expect(ctx.player.battery).toBe(batteryAfterFirst)
    expect(ctx.contacts[0]!.rangeKm).toBe(rangeAfterFirst)
    // after the cooldown elapses, the next ping works
    ctx.player.pingCooldown = 0
    doPing(ctx)
    expect(ctx.player.battery).toBeLessThan(batteryAfterFirst)
  })

  it('drains 2 % battery and adds +8 self-exposure per ping (t-015: 12 → 8)', () => {
    const enemy = makeEnemy()
    const ctx = makeCtx({ enemies: [enemy] })
    doPing(ctx)
    expect(ctx.player.battery).toBe(98)
    expect(ctx.player.detection).toBe(8)
    expect(ctx.player.sonarState).toBe('ping')
  })

  it('does not ping when the battery cannot cover the cost (defensive gate)', () => {
    // 8 km: beyond the 5 km passive range (so no passive contact either),
    // inside the 10 km ping range — any contact here must come from a ping.
    const enemy = makeEnemy({ position: { x: 8, y: 0 } })
    const player = makePlayer({ battery: 1 })
    const ctx = makeCtx({ enemies: [enemy], player })
    doPing(ctx)
    expect(ctx.contacts).toHaveLength(0)
    expect(ctx.player.detection).toBe(0)
    expect(ctx.player.battery).toBe(1)
  })

  it('ping range error converges ×0.8 per ping (10 % → 8 % → 6.4 %)', () => {
    const enemy = makeEnemy({ position: { x: 4, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    doPing(ctx)
    const c1 = ctx.contacts[0]!
    expect(c1.rangeErrorFrac).toBeCloseTo(0.1, 6)
    expect(c1.bearingErrorDeg).toBeCloseTo(0.5, 6)
    ctx.player.pingCooldown = 0
    doPing(ctx)
    const c2 = ctx.contacts[0]!
    expect(c2.rangeErrorFrac).toBeCloseTo(0.08, 6)
    expect(c2.bearingErrorDeg).toBeCloseTo(0.35, 6)
  })

  it('classifies a large merchant echo as Strong regardless of range band', () => {
    expect(pingSignalFor(5, 'Merchant', BALANCE)).toBe('Strong')
    expect(pingSignalFor(5, 'Destroyer', BALANCE)).toBe('Medium')
    expect(pingSignalFor(8, 'Destroyer', BALANCE)).toBe('Weak')
    expect(pingSignalFor(1, 'Destroyer', BALANCE)).toBe('Strong')
  })

  it('emits sonar.ping and sonar.contact with the hit contact ids', () => {
    const enemy = makeEnemy()
    const bus = createEventBus()
    const pings: string[] = []
    const contacts: string[][] = []
    bus.subscribe((ev) => {
      if (ev.type === 'sonar.ping') pings.push(ev.payload?.bearingDeg as string)
      if (ev.type === 'sonar.contact') contacts.push(ev.payload?.contactIds as string[])
    })
    const ctx = makeCtx({ enemies: [enemy], bus })
    doPing(ctx)
    expect(pings).toHaveLength(1)
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toEqual(['C-01'])
  })

  it('walks the §5.4 chain: CLASSIFIED → TRACKED (3 pings + conf ≥ 70) → CONFIRMED', () => {
    // 8 km: outside the passive range so every observation is a ping (+25).
    const enemy = makeEnemy({ position: { x: 8, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    // ping 1 → cascade UNKNOWN → SUSPECTED → CLASSIFIED, confidence 25
    doPing(ctx)
    expect(ctx.contacts[0]!.state).toBe('CLASSIFIED')
    expect(ctx.contacts[0]!.confidence).toBe(25)
    // ping 2 → confidence 50
    ctx.player.pingCooldown = 0
    doPing(ctx)
    expect(ctx.contacts[0]!.state).toBe('CLASSIFIED')
    expect(ctx.contacts[0]!.confidence).toBe(50)
    // ping 3 → confidence 75 + 3 pings → TRACKED
    ctx.player.pingCooldown = 0
    doPing(ctx)
    expect(ctx.contacts[0]!.state).toBe('TRACKED')
    expect(ctx.contacts[0]!.speedErrorFrac).toBeCloseTo(0.05, 6)
    expect(ctx.contacts[0]!.rangeErrorFrac).toBe(TRACKED_RANGE_ERROR_FRAC)
    // ping 4 → confidence 100 → CONFIRMED
    ctx.player.pingCooldown = 0
    doPing(ctx)
    expect(ctx.contacts[0]!.state).toBe('CONFIRMED')
    expect(ctx.contacts[0]!.confidence).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Passive listen
// ---------------------------------------------------------------------------

describe('passive listen (GAME_DESIGN §5.2)', () => {
  it('first contact is bearing-only (range null, state UNKNOWN)', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    runTicks(ctx, 5)
    expect(ctx.contacts).toHaveLength(1)
    const c = ctx.contacts[0]!
    expect(c.rangeKm).toBeNull()
    expect(c.rangeErrorFrac).toBe(0)
    expect(c.state).toBe('UNKNOWN')
    expect(c.classification).toBe('Unknown')
    expect(c.signalStrength).toBe(passiveSignalForClass('Destroyer')) // Medium
  })

  it('adds NO self-exposure (detection unchanged after prolonged listening)', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    runTicks(ctx, 200)
    expect(ctx.player.detection).toBe(0)
  })

  it('bearing error converges from ±3° to ±1° over 30 s of tracking', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    runTicks(ctx, 10)
    const c1 = ctx.contacts[0]!
    expect(c1.bearingErrorDeg).toBeCloseTo(BALANCE.sonar.passive.bearingErrorDegStart, 6)
    runTicks(ctx, 700) // +35 s
    const c2 = ctx.contacts[0]!
    expect(c2.bearingErrorDeg).toBeCloseTo(BALANCE.sonar.passive.bearingErrorDegConverged, 1)
    // the displayed bearing stays inside the error band at all times
    const trueBearing = compassBearing(ctx.player.position, enemy.position)
    expect(angularDiffDeg(c2.bearingDeg, trueBearing)).toBeLessThanOrEqual(c2.bearingErrorDeg + 1e-9)
  })

  it('promotes to SUSPECTED (LargeSurface) after 2 passive observations', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    runTicks(ctx, 1) // obs 1 (creation)
    expect(ctx.contacts[0]!.state).toBe('UNKNOWN')
    runTicks(ctx, Math.ceil(PASSIVE_OBS_INTERVAL_S / FIXED_DT) + 5) // +3 s → obs 2
    expect(ctx.contacts[0]!.state).toBe('SUSPECTED')
    expect(ctx.contacts[0]!.classification).toBe('LargeSurface')
    expect(ctx.contacts[0]!.speedEstimateKt).not.toBeNull() // estimates unlock at SUSPECTED
  })

  it('hears torpedo noise within 10 km (gated per torpedo)', () => {
    const torp = makeTorpedo({ position: { x: 5, y: 0 } })
    const bus = createEventBus()
    const heard: string[] = []
    bus.subscribe((ev) => {
      if (ev.type === 'sonar.passive') heard.push(ev.payload?.source as string)
    })
    const ctx = makeCtx({ torpedoes: [torp], bus })
    runTicks(ctx, 10)
    expect(heard.filter((s) => s === 'torpedo')).toHaveLength(1)
    // gated: no repeated emission within TORPEDO_PASSIVE_INTERVAL_S
    runTicks(ctx, 10)
    expect(heard.filter((s) => s === 'torpedo')).toHaveLength(1)
  })

  it('hears explosions from the event log tail once (dedup)', () => {
    const bus = createEventBus()
    bus.setSimTime(10)
    bus.emit('depthCharge.detonated', { shipId: 'E-01', x: 4, y: 0, distM: 100, dmg: 20 })
    const heard: string[] = []
    bus.subscribe((ev) => {
      if (ev.type === 'sonar.passive') heard.push(ev.payload?.source as string)
    })
    const ctx = makeCtx({ bus, simTime: 10 })
    runTicks(ctx, 10) // the explosion sits in the lookback window
    expect(heard.filter((s) => s === 'explosion')).toHaveLength(1)
  })

  it('source is engine for merchants and propeller for escorts', () => {
    const merchant = makeEnemy({ id: 'E-01', shipClass: 'Merchant', position: { x: 3, y: 0 } })
    const destroyer = makeEnemy({ id: 'E-02', shipClass: 'Destroyer', position: { x: 0, y: 3 } })
    const bus = createEventBus()
    const sources: string[] = []
    bus.subscribe((ev) => {
      if (ev.type === 'sonar.passive') sources.push(ev.payload?.source as string)
    })
    const ctx = makeCtx({ enemies: [merchant, destroyer], bus })
    // margin of a few ticks: the 3 s observation gate lands at t≈3.10 due to
    // fixed-step float accumulation
    runTicks(ctx, Math.ceil(PASSIVE_OBS_INTERVAL_S / FIXED_DT) + 5)
    expect(sources).toContain('engine')
    expect(sources).toContain('propeller')
  })

  it('ignores enemies beyond the 5 km engine range', () => {
    const enemy = makeEnemy({ position: { x: 6, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    runTicks(ctx, 100)
    expect(ctx.contacts).toHaveLength(0)
  })

  it('assigns stable ids C-01, C-02 to distinct ships', () => {
    const a = makeEnemy({ id: 'E-01', shipClass: 'Merchant', position: { x: 3, y: 0 } })
    const b = makeEnemy({ id: 'E-02', shipClass: 'Cargo', position: { x: 0, y: 4 } })
    const ctx = makeCtx({ enemies: [a, b] })
    runTicks(ctx, 5)
    expect(ctx.contacts.map((c) => c.id)).toEqual(['C-01', 'C-02'])
  })
})

// ---------------------------------------------------------------------------
// Contacts: decay / degrade / loss
// ---------------------------------------------------------------------------

describe('contact decay & loss (GAME_DESIGN §5.3/§5.4)', () => {
  it('decays confidence and degrades one state after 90 s without observations', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    // build a CLASSIFIED contact passively (4 observations ≈ 12 s)
    runTicks(ctx, Math.ceil((PASSIVE_OBS_INTERVAL_S * 4) / FIXED_DT) + 2)
    const c = ctx.contacts[0]!
    expect(c.state).toBe('CLASSIFIED')
    expect(c.confidence).toBe(60)
    const confAtClassified = c.confidence
    // move the ship out of range → no more observations → decay begins
    enemy.position = { x: 50, y: 50 }
    runTicks(ctx, Math.ceil(150 / FIXED_DT)) // 150 s
    expect(c.confidence).toBeLessThan(confAtClassified)
    expect(c.state).not.toBe('CLASSIFIED') // degraded at confidence < 30
  })

  it('removes a stale UNKNOWN contact after 120 s (contact.lost emitted)', () => {
    const enemy = makeEnemy({ position: { x: 3, y: 0 } })
    const bus = createEventBus()
    const lost: string[] = []
    bus.subscribe((ev) => {
      if (ev.type === 'contact.lost') lost.push(ev.payload?.contactId as string)
    })
    const ctx = makeCtx({ enemies: [enemy], bus })
    runTicks(ctx, 5)
    expect(ctx.contacts).toHaveLength(1)
    enemy.position = { x: 50, y: 50 } // leave sensor range
    runTicks(ctx, Math.ceil(130 / FIXED_DT))
    expect(ctx.contacts).toHaveLength(0)
    expect(lost).toEqual(['C-01'])
  })

  it('CONFIRMED contacts never degrade (§5.4)', () => {
    const enemy = makeEnemy({ position: { x: 2, y: 0 } })
    const ctx = makeCtx({ enemies: [enemy] })
    for (let i = 0; i < 4; i++) {
      ctx.player.pingCooldown = 0
      doPing(ctx)
    }
    expect(ctx.contacts[0]!.state).toBe('CONFIRMED')
    enemy.position = { x: 50, y: 50 }
    runTicks(ctx, Math.ceil(220 / FIXED_DT)) // 220 s with no observations
    expect(ctx.contacts[0]!.state).toBe('CONFIRMED')
  })

  it('CONFIRMED contacts within 1.5 km are error-exempt (fire-control usable)', () => {
    const enemy = makeEnemy({ position: { x: 1, y: 0 } }) // 1 km
    const ctx = makeCtx({ enemies: [enemy] })
    for (let i = 0; i < 4; i++) {
      ctx.player.pingCooldown = 0
      doPing(ctx)
    }
    const c = ctx.contacts[0]!
    expect(c.state).toBe('CONFIRMED')
    expect(c.bearingErrorDeg).toBe(0)
    expect(c.rangeErrorFrac).toBe(0)
    expect(c.speedErrorFrac).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Uncertainty model (unit)
// ---------------------------------------------------------------------------

describe('uncertainty model (GAME_DESIGN §5.3)', () => {
  it('ping range error: ±10 % → ±8 % → ±6.4 %', () => {
    expect(pingRangeErrorFrac(1, BALANCE)).toBeCloseTo(0.1, 6)
    expect(pingRangeErrorFrac(2, BALANCE)).toBeCloseTo(0.08, 6)
    expect(pingRangeErrorFrac(3, BALANCE)).toBeCloseTo(0.064, 6)
  })

  it('ping bearing error: ±0.5° → ±0.35° (×0.7 per ping)', () => {
    expect(pingBearingErrorDeg(1, BALANCE)).toBeCloseTo(0.5, 6)
    expect(pingBearingErrorDeg(2, BALANCE)).toBeCloseTo(0.35, 6)
  })

  it('passive bearing error converges ±3° → ±1° over 30 s', () => {
    expect(passiveBearingErrorDeg(0, BALANCE)).toBe(3)
    expect(passiveBearingErrorDeg(15, BALANCE)).toBeCloseTo(2, 6)
    expect(passiveBearingErrorDeg(30, BALANCE)).toBeCloseTo(1, 6)
    expect(passiveBearingErrorDeg(120, BALANCE)).toBe(1)
  })

  it('speed/heading error: ±20 % start, ±5 % at TRACKED, ×0.85 per obs', () => {
    expect(speedHeadingErrorFrac('SUSPECTED', 1, BALANCE)).toBeCloseTo(0.2, 6)
    expect(speedHeadingErrorFrac('SUSPECTED', 3, BALANCE)).toBeCloseTo(0.2 * 0.85 * 0.85, 6)
    expect(speedHeadingErrorFrac('TRACKED', 1, BALANCE)).toBeCloseTo(0.05, 6)
  })

  it('range error pins at ±2 % for TRACKED and 0 for CONFIRMED', () => {
    expect(rangeErrorFracFor('SUSPECTED', 0.1)).toBeCloseTo(0.1, 6)
    expect(rangeErrorFracFor('TRACKED', 0.064)).toBe(TRACKED_RANGE_ERROR_FRAC)
    expect(rangeErrorFracFor('CONFIRMED', 0.064)).toBe(0)
  })

  it('error exemption applies only to CONFIRMED contacts under 1.5 km', () => {
    expect(errorsExempt('CONFIRMED', 1.0, BALANCE)).toBe(true)
    expect(errorsExempt('CONFIRMED', 2.0, BALANCE)).toBe(false)
    expect(errorsExempt('TRACKED', 1.0, BALANCE)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Classification (unit)
// ---------------------------------------------------------------------------

describe('classification voting (GAME_DESIGN §5.5)', () => {
  it('votes Merchant for a slow high-noise Strong echo', () => {
    const vote = voteClassification(
      { speedEstimateKt: 9, noise: 76, signal: 'Strong' },
      BALANCE,
    )
    expect(isLargeSurfaceClass(vote.type)).toBe(true)
    expect(vote.type).toBe('Merchant')
    expect(vote.confidence).toBeGreaterThan(30)
  })

  it('votes Destroyer for a fast medium-noise Medium echo', () => {
    const vote = voteClassification(
      { speedEstimateKt: 25, noise: 65, signal: 'Medium' },
      BALANCE,
    )
    expect(vote.type).toBe('Destroyer')
  })

  it('a weak ambiguous vote stays below the naming threshold', () => {
    // speed 9.5 with no signal and shared noise band → merchant classes split
    const vote = voteClassification({ speedEstimateKt: 9.5, noise: 76, signal: null }, BALANCE)
    expect(vote.confidence / 100).toBeLessThan(UNKNOWN_VOTE_THRESHOLD)
  })

  it('type lock threshold comes from balance (60)', () => {
    expect(BALANCE.sonar.classification.lockTypeConfidence).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('sonar determinism (ADR-004)', () => {
  it('same seed + same inputs → identical contacts, battery and detection', () => {
    const build = (): { ctx: SystemContext; enemy: EnemyShip } => {
      const enemy = makeEnemy({ position: { x: 3, y: 1 }, speedKt: 12 })
      const player = makePlayer({ position: { x: 0, y: 0 }, battery: 100 })
      const ctx = makeCtx({ enemies: [enemy], player, seed: 7777 })
      return { ctx, enemy }
    }
    const a = build()
    const b = build()
    const run = (s: { ctx: SystemContext; enemy: EnemyShip }): void => {
      for (let i = 0; i < 400; i++) {
        if (i === 100 || i === 250) {
          s.ctx.pingEdge = true
          tick(s.ctx)
          s.ctx.pingEdge = false
        } else {
          tick(s.ctx)
        }
        // let the target maneuver once to exercise the passive refresh path
        if (i === 300) s.enemy.position = { x: 4, y: 2 }
      }
    }
    run(a)
    run(b)
    expect(a.ctx.contacts).toHaveLength(1)
    expect(a.ctx.contacts[0]).toEqual(b.ctx.contacts[0])
    expect(a.ctx.player.battery).toBe(b.ctx.player.battery)
    expect(a.ctx.player.detection).toBe(b.ctx.player.detection)
    expect(a.ctx.player.pingCooldown).toBe(b.ctx.player.pingCooldown)
  })
})
