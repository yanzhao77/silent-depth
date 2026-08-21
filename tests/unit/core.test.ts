/**
 * SILENT DEPTH — core runtime unit tests (tests/unit/core.test.ts)
 *
 * Task t-003 acceptance (core-runtime-gate):
 *   - rng determinism / distribution / fork
 *   - event bus ring buffer + monotonic ids
 *   - state machine full transition path + illegal transitions
 *   - engine determinism (same seed + same inputs → identical snapshots)
 *   - pause advances neither simTime nor RNG
 *   - balance loader reads the real config/balance.json (no hardcoded numbers)
 *
 * Environment: vitest node. No Math.random anywhere.
 */

import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/core/rng'
import { createEventBus, EVENT_LOG_CAPACITY } from '../../src/core/eventBus'
import { GameStateMachine, GameStateTransitionError, GAME_TRANSITIONS } from '../../src/core/stateMachine'
import { FIXED_DT, computeFixedSteps } from '../../src/core/time'
import { loadBalance, BalanceConfigError } from '../../src/core/balance'
import {
  createGame,
  endMission,
  goToMenu,
  normalizeInputs,
  step,
  INITIAL_DEPTH_LAYER,
  MISSION_RESULT_DELAY_S,
  type GameHandle,
} from '../../src/core/engine'
import { DEFAULT_BRIEFING_SECONDS } from '../../src/core/types'
import type { GameSnapshot, GameState, MissionDef, PlayerInputs } from '../../src/core/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMission(seed = 1001, overrides: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'M-TEST',
    name: 'Core Test Mission',
    objective: {
      kind: 'sink',
      subgoals: [{ id: 'sink-1', weight: 1, desc: 'Sink one merchant' }],
    },
    patrolArea: { km: 30, gridM: 500 },
    fleet: {
      headingDeg: 90,
      speedKt: 9,
      formation: '2x2',
      colSpacingM: 500,
      rowSpacingM: 400,
      patrolBehavior: 'figure8',
    },
    spawns: [
      { type: 'Merchant', x: 10, y: 10, headingDeg: 90 },
      { type: 'Destroyer', x: 9, y: 10, headingDeg: 90 },
    ],
    playerStart: { x: 5, y: 15, headingDeg: 270 },
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

/** Run `steps` steps with the given per-step input factory. */
function runScript(mission: MissionDef, seed: number, inputs: PlayerInputs[]): GameSnapshot[] {
  const handle = createGame(mission, seed)
  const snapshots: GameSnapshot[] = []
  for (const input of inputs) {
    snapshots.push(step(handle, FIXED_DT, input))
  }
  return snapshots
}

// ---------------------------------------------------------------------------
// rng
// ---------------------------------------------------------------------------

describe('rng (mulberry32)', () => {
  it('same seed produces the same sequence', () => {
    const a = createRng(1001)
    const b = createRng(1001)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds produce different sequences', () => {
    const seq = (seed: number): number[] => {
      const r = createRng(seed)
      return Array.from({ length: 20 }, () => r.next())
    }
    expect(seq(1)).not.toEqual(seq(2))
    expect(seq(1001)).not.toEqual(seq(1002))
  })

  it('range stays within [min, max) and int covers both ends inclusive', () => {
    const r = createRng(4242)
    for (let i = 0; i < 2000; i++) {
      const v = r.range(5, 10)
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThan(10)
    }
    const counts = new Map<number, number>()
    for (let i = 0; i < 4000; i++) {
      const v = r.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    // both endpoints must actually be reachable
    expect(counts.get(1) ?? 0).toBeGreaterThan(0)
    expect(counts.get(6) ?? 0).toBeGreaterThan(0)
  })

  it('chance(0) is always false and chance(1) always true', () => {
    const r = createRng(7)
    for (let i = 0; i < 50; i++) {
      expect(r.chance(0)).toBe(false)
      expect(r.chance(1)).toBe(true)
    }
  })

  it('sign only returns -1 or 1', () => {
    const r = createRng(99)
    for (let i = 0; i < 500; i++) {
      const s = r.sign()
      expect(s === 1 || s === -1).toBe(true)
    }
  })

  it('fork streams are deterministic and label-dependent', () => {
    const r1 = createRng(12345)
    const r2 = createRng(12345)
    r1.next()
    r1.next()
    r2.next()
    r2.next()
    const sonar1 = r1.fork('sonar')
    const sonar2 = r2.fork('sonar')
    const ai1 = r1.fork('ai')
    const s1: number[] = []
    const s2: number[] = []
    const s3: number[] = []
    for (let i = 0; i < 30; i++) {
      s1.push(sonar1.next())
      s2.push(sonar2.next())
      s3.push(ai1.next())
    }
    expect(s1).toEqual(s2) // same (label, seed, state) → same stream
    expect(s1).not.toEqual(s3) // different labels → different streams
  })

  it('fork does not consume the parent stream', () => {
    const p1 = createRng(7)
    const p2 = createRng(7)
    p1.next()
    p2.next() // both parents at the same point
    const expected = p2.next() // draw 2
    p1.fork('x')
    expect(p1.next()).toBe(expected) // p1 draw 2 — fork changed nothing
  })
})

// ---------------------------------------------------------------------------
// eventBus
// ---------------------------------------------------------------------------

describe('eventBus', () => {
  it('emits entries with strictly monotonic ids', () => {
    const bus = createEventBus()
    let lastId = 0
    for (let i = 0; i < 25; i++) {
      const entry = bus.emit('sonar.ping', { bearingDeg: i })
      expect(entry.id).toBeGreaterThan(lastId)
      expect(entry.type).toBe('sonar.ping')
      expect(entry.payload).toEqual({ bearingDeg: i })
      lastId = entry.id
    }
  })

  it('keeps only the tail 50 entries in the ring buffer', () => {
    const bus = createEventBus()
    for (let i = 0; i < EVENT_LOG_CAPACITY + 10; i++) {
      bus.emit('ui.click', { elementId: `btn-${i}` })
    }
    const log = bus.getLog()
    expect(log.length).toBe(EVENT_LOG_CAPACITY)
    expect(log[0]!.id).toBe(11) // dropped 1..10
    expect(log[log.length - 1]!.id).toBe(60)
    // ids remain monotonic
    for (let i = 1; i < log.length; i++) {
      expect(log[i]!.id).toBe(log[i - 1]!.id + 1)
    }
  })

  it('stamps the simTime synced via setSimTime', () => {
    const bus = createEventBus()
    bus.setSimTime(12.5)
    const entry = bus.emit('contact.detected', { contactId: 'C-01' })
    expect(entry.simTime).toBe(12.5)
  })

  it('subscribe receives events in order and unsubscribe stops delivery', () => {
    const bus = createEventBus()
    const seen: number[] = []
    const off = bus.subscribe((entry) => seen.push(entry.id))
    bus.emit('sonar.ping')
    bus.emit('sonar.contact', { contactIds: ['C-01'] })
    off()
    bus.emit('sonar.ping')
    expect(seen).toEqual([1, 2])
  })
})

// ---------------------------------------------------------------------------
// stateMachine
// ---------------------------------------------------------------------------

describe('stateMachine', () => {
  it('walks the full documented path BOOT→MENU→…→MISSION_RESULT→MENU', () => {
    const sm = new GameStateMachine('BOOT')
    expect(sm.state).toBe('BOOT')
    sm.transition('MENU')
    sm.transition('MISSION_LOADING')
    sm.transition('MISSION_RUNNING')
    sm.transition('PAUSED')
    sm.transition('MISSION_RUNNING')
    sm.transition('VICTORY')
    sm.transition('MISSION_RESULT')
    sm.transition('MENU')
    expect(sm.state).toBe('MENU')
  })

  it('walks the defeat branch too', () => {
    const sm = new GameStateMachine('BOOT')
    sm.transition('MENU')
    sm.transition('MISSION_LOADING')
    sm.transition('MISSION_RUNNING')
    sm.transition('DEFEAT')
    sm.transition('MISSION_RESULT')
    expect(sm.state).toBe('MISSION_RESULT')
  })

  it('rejects illegal transitions with GameStateTransitionError', () => {
    const cases: [GameStateMachine, GameState][] = [
      [new GameStateMachine('BOOT'), 'MISSION_RUNNING'],
      [new GameStateMachine('MENU'), 'VICTORY'],
      [new GameStateMachine('MISSION_RUNNING'), 'MISSION_LOADING'],
      [new GameStateMachine('VICTORY'), 'PAUSED'],
      [new GameStateMachine('MISSION_RESULT'), 'MISSION_RUNNING'],
    ]
    for (const [sm, target] of cases) {
      expect(() => sm.transition(target)).toThrow(GameStateTransitionError)
    }
  })

  it('canTransition mirrors the transition table', () => {
    const sm = new GameStateMachine('MISSION_RUNNING')
    expect(sm.canTransition('PAUSED')).toBe(true)
    expect(sm.canTransition('MISSION_RESULT')).toBe(false)
    expect(GAME_TRANSITIONS['MISSION_RUNNING']).toContain('PAUSED')
  })
})

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

describe('fixed timestep', () => {
  it('computes fixed steps and carries the remainder', () => {
    const r = computeFixedSteps(0, 0.12)
    expect(r.steps).toBe(2)
    expect(r.nextAccumulator).toBeCloseTo(0.02, 9)
    expect(r.nextSimTime).toBeCloseTo(0.1, 9)
  })

  it('accumulates a carried remainder with the next frame', () => {
    // 0.02 carried + 0.05 frame = 0.07 → 1 step, 0.02 remainder
    const r = computeFixedSteps(0.02, 0.05)
    expect(r.steps).toBe(1)
    expect(r.nextAccumulator).toBeCloseTo(0.02, 9)
  })

  it('caps the accumulated frame time (spiral-of-death guard)', () => {
    const r = computeFixedSteps(0, 1.0)
    expect(r.steps).toBe(5) // 0.25 cap → 5 × 0.05
    expect(r.nextAccumulator).toBeCloseTo(0, 9)
  })

  it('never runs negative steps for negative frame time', () => {
    const r = computeFixedSteps(0, -0.5)
    expect(r.steps).toBe(0)
    expect(r.nextAccumulator).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// balance loader
// ---------------------------------------------------------------------------

describe('balance loader', () => {
  it('loads the real config/balance.json with expected values', () => {
    const balance = loadBalance()
    expect(balance.speedBands.SILENT.speedMaxKt).toBe(4)
    expect(balance.speedBands.FULL.speedMaxKt).toBe(22)
    expect(balance.torpedo.speedKt).toBe(40)
    expect(balance.torpedo.rangeKm).toBe(6)
    expect(balance.detection.sources.activePing).toBe(12)
    expect(balance.sonar.active.rangeKm).toBe(10)
    expect(balance.enemyAI.depthCharges.perMission).toBe(20)
    expect(balance.decoy.perMission).toBe(2)
    expect(balance.scoring.weights.objective).toBe(0.4)
    expect(balance.missions.length).toBe(5)
    expect(balance.missions[0]!.id).toBe('M01')
    expect(balance.missions[0]!.seed).toBe(1001)
    expect(balance.escape.detectionBelow).toBe(20)
  })

  it('throws a clear error on a missing required key', () => {
    expect(() => loadBalance({})).toThrow(BalanceConfigError)
    expect(() => loadBalance({})).toThrow(/missing required key/)
  })

  it('throws on a malformed nested value', () => {
    const bad = { version: 1, speedBands: { FULL: {} } }
    expect(() => loadBalance(bad)).toThrow(BalanceConfigError)
  })
})

// ---------------------------------------------------------------------------
// engine — lifecycle & state machine integration
// ---------------------------------------------------------------------------

describe('engine lifecycle', () => {
  it('createGame starts in MISSION_LOADING (briefing) with a full skeleton', () => {
    const handle = createGame(makeMission(), 1001)
    expect(handle.mission.id).toBe('M-TEST')
    expect(handle.seed).toBe(1001)

    const snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_LOADING')
    expect(snap.mission.phase).toBe('briefing')
    expect(snap.simTime).toBeCloseTo(0.05, 9)
    expect(snap.playerSub.battery).toBe(100)
    expect(snap.playerSub.hull).toBe(loadBalance().hull.playerMax)
    expect(snap.playerSub.decoyCount).toBe(loadBalance().decoy.perMission)
    expect(snap.playerSub.depthLayer).toBe(INITIAL_DEPTH_LAYER)
    expect(snap.playerSub.position).toEqual({ x: 5, y: 15 })
    expect(snap.playerSub.torpedoTubes).toHaveLength(4)
    expect(snap.playerSub.torpedoTubes[0]!.state).toBe('LOADED')
    expect(snap.enemies).toHaveLength(2)
    expect(snap.enemies[0]!.shipClass).toBe('Merchant')
    expect(snap.enemies[1]!.shipClass).toBe('Destroyer')
    expect(snap.enemies[1]!.depthChargesLeft).toBe(loadBalance().enemyAI.depthCharges.perMission)
    expect(snap.contacts).toEqual([])
    expect(snap.torpedoes).toEqual([])
    expect(snap.decoys).toEqual([])
    expect(snap.eventLog).toEqual([])
    expect(snap.stats.torpedoesRemaining).toBe(4)
    expect(snap.stats.elapsedS).toBeCloseTo(0.05, 9)
  })

  it('transitions to MISSION_RUNNING after the briefing countdown', () => {
    const handle = createGame(makeMission(1001, { briefingSeconds: 2 }), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 38; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_LOADING') // 39 ticks → remaining 0.05s
    snap = step(handle, FIXED_DT, IDLE_INPUT) // 40th tick consumes the last 0.05s
    expect(snap.state).toBe('MISSION_RUNNING')
    expect(snap.mission.phase).toBe('running')
    expect(snap.simTime).toBeCloseTo(2.0, 9)
  })

  it('defaults briefingSeconds to DEFAULT_BRIEFING_SECONDS when omitted', () => {
    expect(DEFAULT_BRIEFING_SECONDS).toBe(2)
    const handle = createGame(makeMission(1001, { briefingSeconds: undefined }), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 38; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_LOADING')
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_RUNNING')
  })

  it('invalid fireTorpedo during briefing is ignored (no event while loading)', () => {
    const handle = createGame(makeMission(), 1001)
    const snap = step(handle, FIXED_DT, { ...IDLE_INPUT, fireTorpedo: 'C-99' })
    expect(snap.state).toBe('MISSION_LOADING')
    expect(snap.eventLog).toEqual([])
  })

  it('invalid fireTorpedo while running emits torpedo.fireRejected(noTarget)', () => {
    const handle = createGame(makeMission(), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_RUNNING')
    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, fireTorpedo: 'C-99' })
    const rejected = snap.eventLog.filter((e) => e.type === 'torpedo.fireRejected')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.payload).toEqual({ reason: 'noTarget', contactId: 'C-99' })
  })

  it('never throws on absurd inputs — clamps are applied deterministically', () => {
    const handle = createGame(makeMission(), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    const wild = {
      ...IDLE_INPUT,
      throttle: 9999,
      rudder: 12345,
      fireTorpedo: 'nope',
      ping: true,
      decoy: true,
    }
    expect(() => step(handle, FIXED_DT, wild)).not.toThrow()
  })

  it('endMission(victory) → VICTORY → auto MISSION_RESULT after the delay', () => {
    const handle = createGame(makeMission(), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_RUNNING')

    endMission(handle, 'victory')
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('VICTORY')
    expect(snap.mission.phase).toBe('complete')
    expect(snap.eventLog.some((e) => e.type === 'mission.victory')).toBe(true)

    // delay in simTime ticks: 3s / 0.05 = 60 ticks; 59 more → still VICTORY
    for (let i = 0; i < 58; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('VICTORY')
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_RESULT')

    // endMission from MISSION_RESULT is an illegal transition → throws
    expect(() => endMission(handle, 'victory')).toThrow(GameStateTransitionError)

    goToMenu(handle)
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MENU')
    expect(snap.simTime).toBeCloseTo(2.0 + MISSION_RESULT_DELAY_S, 9) // frozen at result time
  })

  it('endMission(defeat) → DEFEAT with mission.phase failed', () => {
    const handle = createGame(makeMission(), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    endMission(handle, 'defeat')
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('DEFEAT')
    expect(snap.mission.phase).toBe('failed')
    expect(snap.eventLog.some((e) => e.type === 'mission.defeat')).toBe(true)
  })

  it('abort: goToMenu works from MISSION_RUNNING and throws from MENU', () => {
    const handle = createGame(makeMission(), 1001)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    goToMenu(handle)
    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MENU')
    expect(() => goToMenu(handle)).toThrow(GameStateTransitionError)
  })

  it('createGame validates the mission definition', () => {
    expect(() => createGame({ ...makeMission(), spawns: [{ type: 'Submarine', x: 0, y: 0, headingDeg: 0 }] }, 1)).toThrow(/not supported/)
    expect(() => createGame({ ...makeMission(), torpedoCount: 0 }, 1)).toThrow(/torpedoCount/)
  })
})

// ---------------------------------------------------------------------------
// engine — pause semantics
// ---------------------------------------------------------------------------

describe('engine pause semantics', () => {
  function toRunning(seed: number): GameHandle {
    const handle = createGame(makeMission(), seed)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 39; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('MISSION_RUNNING')
    return handle
  }

  it('pause edge → PAUSED; simTime frozen while paused; resume continues', () => {
    const handle = toRunning(7)
    let snap: GameSnapshot = step(handle, FIXED_DT, IDLE_INPUT)
    for (let i = 0; i < 3; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    const beforePause = snap.simTime

    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, pause: true }) // pause edge
    expect(snap.state).toBe('PAUSED')
    expect(snap.simTime).toBe(beforePause)

    for (let i = 0; i < 3; i++) snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.state).toBe('PAUSED')
    expect(snap.simTime).toBe(beforePause)

    snap = step(handle, FIXED_DT, { ...IDLE_INPUT, pause: true }) // resume edge
    expect(snap.state).toBe('MISSION_RUNNING')
    expect(snap.simTime).toBe(beforePause)

    snap = step(handle, FIXED_DT, IDLE_INPUT)
    expect(snap.simTime).toBeCloseTo(beforePause + FIXED_DT, 9)
  })

  it('paused ticks advance neither simTime nor RNG (deterministic resume)', () => {
    // Advance past the 2s briefing first (40 ticks) — pause only applies
    // inside MISSION_RUNNING/PAUSED (DESIGN DECISION: briefing cannot pause).
    const prefix = Array.from({ length: 40 }, () => IDLE_INPUT)
    // A: 3 running ticks → pause → 2 paused → resume → 2 running ticks.
    // B: 5 straight running ticks. Same simTime at the end (45 × dt).
    const runA: PlayerInputs[] = [
      ...prefix,
      IDLE_INPUT,
      IDLE_INPUT,
      IDLE_INPUT,
      { ...IDLE_INPUT, pause: true }, // pause edge (frozen)
      IDLE_INPUT, // paused (frozen)
      IDLE_INPUT, // paused (frozen)
      { ...IDLE_INPUT, pause: true }, // resume edge (frozen)
      IDLE_INPUT, // running again
      IDLE_INPUT,
    ]
    const runB: PlayerInputs[] = [...prefix, IDLE_INPUT, IDLE_INPUT, IDLE_INPUT, IDLE_INPUT, IDLE_INPUT]

    const mission = makeMission()
    const snapA = runScript(mission, 31337, runA)
    const snapB = runScript(mission, 31337, runB)

    expect(snapA[snapA.length - 1]!.state).toBe('MISSION_RUNNING')
    expect(snapA[snapA.length - 1]!.simTime).toBeCloseTo(45 * FIXED_DT, 9)
    // frozen ticks changed nothing: post-resume snapshots are byte-identical
    // to the straight-through run at the same simTime
    expect(JSON.stringify(snapA[47]!)).toBe(JSON.stringify(snapB[43]!)) // first post-resume tick
    expect(JSON.stringify(snapA[48]!)).toBe(JSON.stringify(snapB[44]!)) // final tick
  })
})

// ---------------------------------------------------------------------------
// engine — determinism & snapshot isolation
// ---------------------------------------------------------------------------

describe('engine determinism', () => {
  const script: PlayerInputs[] = [
    { ...IDLE_INPUT, throttle: 4, rudder: 0.3 },
    { ...IDLE_INPUT, throttle: 9, rudder: -1 },
    { ...IDLE_INPUT, throttle: 22, rudder: 0, fireTorpedo: 'C-01' }, // invalid target
    { ...IDLE_INPUT, throttle: 0, silentRunning: true },
    { ...IDLE_INPUT, pause: true },
    { ...IDLE_INPUT },
    { ...IDLE_INPUT, pause: true },
    { ...IDLE_INPUT, ping: true },
    { ...IDLE_INPUT, rudder: 5, throttle: 99, decoy: true },
    { ...IDLE_INPUT },
  ]

  it('same seed + same inputs → byte-identical snapshot sequences', () => {
    const mission = makeMission(1001)
    const a = runScript(mission, 4242, script)
    const b = runScript(mission, 4242, script)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(JSON.stringify(a[i])).toBe(JSON.stringify(b[i]))
    }
  })

  it('different inputs produce different snapshots (fireRejected surfaces)', () => {
    const mission = makeMission(1001)
    const withFire = runScript(mission, 4242, [
      ...Array.from({ length: 40 }, () => IDLE_INPUT),
      { ...IDLE_INPUT, fireTorpedo: 'C-99' },
    ])
    const withoutFire = runScript(mission, 4242, [
      ...Array.from({ length: 40 }, () => IDLE_INPUT),
      IDLE_INPUT,
    ])
    expect(withFire[withFire.length - 1]!.eventLog.some((e) => e.type === 'torpedo.fireRejected')).toBe(true)
    expect(withoutFire[withoutFire.length - 1]!.eventLog).toEqual([])
    expect(JSON.stringify(withFire[withFire.length - 1])).not.toBe(
      JSON.stringify(withoutFire[withoutFire.length - 1]),
    )
  })

  it('snapshots are read-only views — mutating one does not leak into the engine', () => {
    const mission = makeMission()
    const control = runScript(mission, 777, [IDLE_INPUT, IDLE_INPUT, IDLE_INPUT])

    const handle = createGame(mission, 777)
    const first = step(handle, FIXED_DT, IDLE_INPUT)
    first.playerSub.position.x = 999
    first.contacts.push({} as never)
    first.enemies[0]!.hull = 0
    first.eventLog.length = 0
    const second = step(handle, FIXED_DT, IDLE_INPUT)
    const third = step(handle, FIXED_DT, IDLE_INPUT)

    expect(JSON.stringify(second)).toBe(JSON.stringify(control[1]))
    expect(JSON.stringify(third)).toBe(JSON.stringify(control[2]))
    expect(second.playerSub.position.x).toBe(mission.playerStart.x)
    expect(second.contacts).toEqual([])
    expect(second.enemies[0]!.hull).toBe(loadBalance().enemyAI.shipTypes.Merchant!.hull)
  })
})

// ---------------------------------------------------------------------------
// engine — input normalization (contract: clamp & reject, never throw)
// ---------------------------------------------------------------------------

describe('normalizeInputs', () => {
  it('clamps rudder to [-1,1] and throttle to [0, FULL.speedMaxKt] from balance', () => {
    const balance = loadBalance()
    const maxKt = balance.speedBands.FULL.speedMaxKt // 22 — NOT hardcoded

    const r1 = normalizeInputs({ ...IDLE_INPUT, rudder: 5, throttle: 99 }, balance, new Set())
    expect(r1.inputs.rudder).toBe(1)
    expect(r1.inputs.throttle).toBe(maxKt)
    expect(r1.inputs.throttle).toBe(22) // sanity: balance is the authority

    const r2 = normalizeInputs({ ...IDLE_INPUT, rudder: -5, throttle: -3 }, balance, new Set())
    expect(r2.inputs.rudder).toBe(-1)
    expect(r2.inputs.throttle).toBe(0)

    const r3 = normalizeInputs({ ...IDLE_INPUT, rudder: 0.5, throttle: 7.5 }, balance, new Set())
    expect(r3.inputs.rudder).toBe(0.5)
    expect(r3.inputs.throttle).toBe(7.5)
  })

  it('rejects fireTorpedo with no matching contact and keeps valid ones', () => {
    const balance = loadBalance()
    const empty = normalizeInputs({ ...IDLE_INPUT, fireTorpedo: 'C-01' }, balance, new Set())
    expect(empty.rejections).toEqual([{ reason: 'noTarget', contactId: 'C-01' }])
    expect(empty.inputs.fireTorpedo).toBeNull()

    const withContact = normalizeInputs(
      { ...IDLE_INPUT, fireTorpedo: 'C-01' },
      balance,
      new Set(['C-01']),
    )
    expect(withContact.rejections).toEqual([])
    expect(withContact.inputs.fireTorpedo).toBe('C-01')
  })

  it('fireTorpedo null produces no rejection', () => {
    const balance = loadBalance()
    const r = normalizeInputs(IDLE_INPUT, balance, new Set())
    expect(r.rejections).toEqual([])
    expect(r.inputs.fireTorpedo).toBeNull()
  })
})
