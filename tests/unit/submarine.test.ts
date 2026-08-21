/**
 * SILENT DEPTH — submarine system unit tests (tests/unit/submarine.test.ts)
 *
 * Task t-004 acceptance (submarine-gate):
 *   - speed band transitions + F1 noise monotonicity (faster ⇒ noisier)
 *   - depth layer effects (noise mod, detect factor from balance)
 *   - battery drain rates per band (+ silent running, surface/deep charge)
 *   - LOW BATTERY enforcement (no ping / speed cap SILENT / rudder halved)
 *   - forced surface at 0 battery
 *   - decoy launch limits (2 max, battery cost) + decoy aging
 *   - out-of-bounds timer
 *   - determinism (same inputs → same state; no Math.random)
 *
 * The submarine system is not wired into the engine pipeline yet (the factory
 * manager wires it after t-004/t-006/t-009) — these tests drive it through a
 * hand-built SystemContext exactly like the engine would.
 *
 * Environment: vitest node. All balance numbers come from config/balance.json.
 */

import { describe, expect, it } from 'vitest'
import { loadBalance } from '../../src/core/balance'
import { createEventBus } from '../../src/core/eventBus'
import { createRng } from '../../src/core/rng'
import { FIXED_DT } from '../../src/core/time'
import type { SystemContext } from '../../src/core/engine'
import {
  applyHullDamage,
  bandForTargetSpeed,
  bandNoise,
  clampSpeedToBand,
  computeNoise,
  layerDistance,
  submarineSystem,
  KNOTS_TO_KM_PER_SEC,
  SUB_ACCEL_KT_PER_S,
} from '../../src/gameplay/submarine'
import { createDecoy, updateDecoys } from '../../src/gameplay/decoy'
import type { DepthLayer, MissionDef, PlayerInputs, SubmarineState } from '../../src/core/types'

// ---------------------------------------------------------------------------
// Fixtures & harness
// ---------------------------------------------------------------------------

const DEFAULT_INPUTS: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
}

function makeMission(weather: MissionDef['weather'] = 'Clear'): MissionDef {
  return {
    id: 'M-T',
    name: 'Test Mission',
    objective: { kind: 'sink', subgoals: [{ id: 'sink-1', weight: 1, desc: 'Sink one merchant' }] },
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
    weather,
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed: 1001,
    briefingSeconds: 2,
  }
}

function makePlayer(overrides: Partial<SubmarineState> = {}): SubmarineState {
  const balance = loadBalance()
  return {
    position: { x: 15, y: 15 },
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
    torpedoTubes: [{ id: 'T-01', state: 'LOADED', targetContactId: null }],
    decoyCount: balance.decoy.perMission,
    lowBattery: false,
    outOfBoundsTimer: 0,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<SystemContext> = {}): SystemContext {
  const balance = loadBalance()
  const bus = createEventBus()
  const rng = createRng(1)
  const ctx: SystemContext = {
    dt: FIXED_DT,
    simTime: 0,
    state: 'MISSION_RUNNING',
    pauseEdge: false,
    pingEdge: false,
    decoyEdge: false,
    inputs: { ...DEFAULT_INPUTS },
    bus,
    balance,
    mission: makeMission(),
    forks: {
      world: rng,
      missions: rng,
      submarine: rng,
      sonar: rng,
      ai: rng,
      combat: rng,
      detection: rng,
      objectives: rng,
    },
    player: makePlayer(),
    contacts: [],
    enemies: [],
    torpedoes: [],
    decoys: [],
    missionStatus: { missionId: 'M-T', phase: 'running', objectives: [], escaped: false, forcedSurface: false },
    score: { objective: 0, damage: 0, stealth: 0, torpedoEfficiency: 0, time: 0, survival: 0, total: 0, grade: 'Failed' },
    stats: { torpedoesFired: 0, torpedoesHit: 0, peakDetection: 0, elapsedS: 0, torpedoesRemaining: 4, bestScore: 0 },
    skip: false,
    ...overrides,
  }
  return ctx
}

interface TickOpts {
  inputs?: Partial<PlayerInputs>
  decoyEdge?: boolean
  pingEdge?: boolean
}

/** One fixed tick, mirroring the engine: sync bus simTime, set edges, run. */
function tick(ctx: SystemContext, opts: TickOpts = {}): void {
  ctx.inputs = { ...DEFAULT_INPUTS, ...opts.inputs }
  ctx.decoyEdge = opts.decoyEdge ?? false
  ctx.pingEdge = opts.pingEdge ?? false
  ctx.bus.setSimTime(ctx.simTime)
  submarineSystem(ctx)
  ctx.simTime += ctx.dt
}

// ---------------------------------------------------------------------------
// Speed bands (§4.3) & F1 noise
// ---------------------------------------------------------------------------

describe('speed bands', () => {
  it('maps target speeds to bands (gaps snap to the faster band)', () => {
    const b = loadBalance()
    expect(bandForTargetSpeed(0, b)).toBe('STOPPED')
    expect(bandForTargetSpeed(3, b)).toBe('SILENT')
    expect(bandForTargetSpeed(4, b)).toBe('SILENT')
    expect(bandForTargetSpeed(6, b)).toBe('CRUISE')
    expect(bandForTargetSpeed(12, b)).toBe('CRUISE')
    expect(bandForTargetSpeed(15, b)).toBe('FULL')
    expect(bandForTargetSpeed(22, b)).toBe('FULL')
  })

  it('clamps targets into the band range (continuous in-band speed)', () => {
    const b = loadBalance()
    expect(clampSpeedToBand('SILENT', 1, b)).toBe(2) // gap below SILENT min
    expect(clampSpeedToBand('SILENT', 3, b)).toBe(3)
    expect(clampSpeedToBand('CRUISE', 6, b)).toBe(8)
    expect(clampSpeedToBand('CRUISE', 10, b)).toBe(10)
    expect(clampSpeedToBand('FULL', 15, b)).toBe(18)
    expect(clampSpeedToBand('FULL', 22, b)).toBe(22)
    expect(clampSpeedToBand('STOPPED', 5, b)).toBe(0)
  })

  it('integrates speed toward the target with continuous acceleration', () => {
    const ctx = makeCtx()
    // throttle 10 kt → CRUISE; accelerates 2 kt/s
    const accelTicks = Math.ceil(10 / (SUB_ACCEL_KT_PER_S * FIXED_DT)) // 100 ticks = 5 s
    for (let i = 0; i < accelTicks; i++) tick(ctx, { inputs: { throttle: 10 } })
    expect(ctx.player.speedBand).toBe('CRUISE')
    expect(ctx.player.targetSpeedKt).toBe(10)
    expect(ctx.player.speedKt).toBeCloseTo(10, 6)
    // and it decelerates back toward 0
    for (let i = 0; i < accelTicks; i++) tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.player.speedBand).toBe('STOPPED')
    expect(ctx.player.speedKt).toBeCloseTo(0, 6)
  })

  it('emits sub.speedChanged only on band changes', () => {
    const ctx = makeCtx()
    tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.bus.getLog().filter((e) => e.type === 'sub.speedChanged')).toHaveLength(0)
    tick(ctx, { inputs: { throttle: 10 } }) // STOPPED → CRUISE
    let events = ctx.bus.getLog().filter((e) => e.type === 'sub.speedChanged')
    expect(events).toHaveLength(1)
    expect(events[0]!.payload).toMatchObject({ band: 'CRUISE' })
    expect(typeof events[0]!.payload!.speedKt).toBe('number')
    expect(typeof events[0]!.payload!.noise).toBe('number')
    for (let i = 0; i < 50; i++) tick(ctx, { inputs: { throttle: 11 } }) // same band
    events = ctx.bus.getLog().filter((e) => e.type === 'sub.speedChanged')
    expect(events).toHaveLength(1)
    tick(ctx, { inputs: { throttle: 20 } }) // CRUISE → FULL
    expect(ctx.bus.getLog().filter((e) => e.type === 'sub.speedChanged')).toHaveLength(2)
  })

  it('moves the submarine along its heading (north-up, kt → km)', () => {
    const ctx = makeCtx()
    ctx.player.headingDeg = 0 // north
    for (let i = 0; i < 300; i++) tick(ctx, { inputs: { throttle: 10 } }) // 15 s
    // accel phase 5 s (0→10 kt, Σ speeds = 505 kt·s × 0.05 = 25.25 kt·s) + 10 s at 10 kt (100 kt·s)
    const expectedKm = (125.25 * KNOTS_TO_KM_PER_SEC)
    expect(ctx.player.position.x).toBeCloseTo(15, 6)
    expect(ctx.player.position.y).toBeCloseTo(15 + expectedKm, 5)
  })
})

describe('F1 noise', () => {
  it('matches the GAME_DESIGN F1 table at band anchor points', () => {
    const b = loadBalance()
    expect(bandNoise('STOPPED', 0, b)).toBe(b.noiseInterp.STOPPED) // 1
    expect(bandNoise('SILENT', 2, b)).toBe(8)
    expect(bandNoise('SILENT', 4, b)).toBe(12)
    expect(bandNoise('CRUISE', 8, b)).toBe(30)
    expect(bandNoise('CRUISE', 12, b)).toBe(46)
    expect(bandNoise('FULL', 18, b)).toBe(70)
    expect(bandNoise('FULL', 22, b)).toBe(90)
  })

  it('is monotone non-decreasing in speed (iron rule: faster ⇒ noisier)', () => {
    const b = loadBalance()
    let prev = -1
    for (let s = 0; s <= 22.0001; s += 0.25) {
      const band = bandForTargetSpeed(s, b)
      const noise = computeNoise({
        band,
        speedKt: s,
        depthLayer: 'Shallow',
        transitionLayer: null,
        hull: 100,
        weather: 'Clear',
        balance: b,
      })
      expect(noise).toBeGreaterThanOrEqual(prev)
      prev = noise
    }
  })

  it('applies depth-layer noise mods (B2) and the F2 transition mean', () => {
    const b = loadBalance()
    const base = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Shallow', transitionLayer: null, hull: 100, weather: 'Clear', balance: b })
    const surface = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Surface', transitionLayer: null, hull: 100, weather: 'Clear', balance: b })
    const deep = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Deep', transitionLayer: null, hull: 100, weather: 'Clear', balance: b })
    expect(surface).toBe(base + b.depthLayers.Surface.noiseMod) // +15
    expect(deep).toBe(base + b.depthLayers.Deep.noiseMod) // −10
    // transition Shallow → Deep: mean of the two layer mods (0 + −10) / 2 = −5
    const transit = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Shallow', transitionLayer: 'Deep', hull: 100, weather: 'Clear', balance: b })
    expect(transit).toBe(base + (b.depthLayers.Shallow.noiseMod + b.depthLayers.Deep.noiseMod) / 2)
    // detect factor stays in balance for the detection system (t-007)
    expect(b.depthLayers.Surface.detectFactor).toBe(1.5)
    expect(b.depthLayers.Deep.detectFactor).toBe(0.5)
  })

  it('adds hull-damaged and storm-surface bonuses', () => {
    const b = loadBalance()
    const base = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Shallow', transitionLayer: null, hull: 100, weather: 'Clear', balance: b })
    const damaged = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Shallow', transitionLayer: null, hull: 30, weather: 'Clear', balance: b })
    expect(damaged).toBe(base + b.hull.damagedNoiseBonus) // +5
    const stormSurface = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Surface', transitionLayer: null, hull: 100, weather: 'Storm', balance: b })
    const clearSurface = computeNoise({ band: 'SILENT', speedKt: 3, depthLayer: 'Surface', transitionLayer: null, hull: 100, weather: 'Clear', balance: b })
    expect(stormSurface).toBe(clearSurface + (b.weather.Storm.surfaceNoiseBonus ?? 0)) // +10
    expect(balanceClamp(computeNoise({ band: 'FULL', speedKt: 0, depthLayer: 'Deep', transitionLayer: null, hull: 100, weather: 'Clear', balance: b }))).toBeGreaterThanOrEqual(0)
  })
})

function balanceClamp(v: number): number {
  return Math.min(100, Math.max(0, v))
}

// ---------------------------------------------------------------------------
// Battery (§4.5, B7)
// ---------------------------------------------------------------------------

describe('battery', () => {
  it('drains per band rate (1 s ≈ 20 ticks)', () => {
    const b = loadBalance()
    const drain = (band: 'STOPPED' | 'SILENT' | 'CRUISE' | 'FULL', throttle: number): number => {
      const ctx = makeCtx({ player: makePlayer({ battery: 100 }) })
      for (let i = 0; i < 20; i++) tick(ctx, { inputs: { throttle } })
      return 100 - ctx.player.battery
    }
    expect(drain('STOPPED', 0)).toBeCloseTo(b.speedBands.STOPPED.batteryDrainPerSec, 6)
    expect(drain('SILENT', 3)).toBeCloseTo(b.speedBands.SILENT.batteryDrainPerSec, 6)
    expect(drain('CRUISE', 10)).toBeCloseTo(b.speedBands.CRUISE.batteryDrainPerSec, 6)
    expect(drain('FULL', 20)).toBeCloseTo(b.speedBands.FULL.batteryDrainPerSec, 6)
  })

  it('adds the silent-running extra drain', () => {
    const b = loadBalance()
    const ctx = makeCtx({ player: makePlayer({ battery: 100 }) })
    for (let i = 0; i < 20; i++) tick(ctx, { inputs: { throttle: 10, silentRunning: true } })
    const expected = b.speedBands.CRUISE.batteryDrainPerSec + b.battery.silentRunningExtraPerSec
    expect(100 - ctx.player.battery).toBeCloseTo(expected, 6)
  })

  it('recharges at Surface and gains the Deep ballast bonus', () => {
    const b = loadBalance()
    const surface = makeCtx({ player: makePlayer({ battery: 50, depthLayer: 'Surface' }) })
    for (let i = 0; i < 20; i++) tick(surface, { inputs: { throttle: 0 } })
    // STOPPED drain 0.02 + Surface charge 0.4 → net +0.38/s
    expect(surface.player.battery).toBeCloseTo(50 + (b.depthLayers.Surface.chargePerSec - b.speedBands.STOPPED.batteryDrainPerSec), 6)

    const deep = makeCtx({ player: makePlayer({ battery: 50, depthLayer: 'Deep' }) })
    for (let i = 0; i < 20; i++) tick(deep, { inputs: { throttle: 0 } })
    // STOPPED drain 0.02 + Deep extra 0.05 → net +0.03/s
    expect(deep.player.battery).toBeCloseTo(50 + (b.depthLayers.Deep.extraBatteryPerSec - b.speedBands.STOPPED.batteryDrainPerSec), 6)
  })

  it('clamps battery to [0, capacity]', () => {
    const b = loadBalance()
    const ctx = makeCtx({ player: makePlayer({ battery: 99.99, depthLayer: 'Surface' }) })
    for (let i = 0; i < 40; i++) tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.player.battery).toBeLessThanOrEqual(b.battery.capacity)
  })
})

// ---------------------------------------------------------------------------
// LOW BATTERY (§4.5, B7)
// ---------------------------------------------------------------------------

describe('low battery', () => {
  it('derives the flag and emits battery.low on the crossing edge', () => {
    const b = loadBalance()
    const ctx = makeCtx({ player: makePlayer({ battery: 10.05 }) })
    let lowEventSeen = false
    for (let i = 0; i < 120; i++) {
      tick(ctx, { inputs: { throttle: 0 } }) // STOPPED: 0.02/s drain → crosses 10 at ~50 ticks
      if (ctx.bus.getLog().some((e) => e.type === 'battery.low')) lowEventSeen = true
      if (ctx.player.lowBattery) break
    }
    expect(ctx.player.lowBattery).toBe(true)
    expect(ctx.player.battery).toBeLessThan(b.battery.lowBatteryThreshold)
    expect(lowEventSeen).toBe(true)
    // single edge: keep draining, no second battery.low event
    const countBefore = ctx.bus.getLog().filter((e) => e.type === 'battery.low').length
    for (let i = 0; i < 20; i++) tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.bus.getLog().filter((e) => e.type === 'battery.low').length).toBe(countBefore)
  })

  it('caps speed intent at SILENT max and halves the rudder rate', () => {
    const ctx = makeCtx({ player: makePlayer({ battery: 5, lowBattery: true }) })
    tick(ctx, { inputs: { throttle: 20, rudder: 1 } })
    expect(ctx.player.speedBand).toBe('SILENT')
    expect(ctx.player.targetSpeedKt).toBe(loadBalance().speedBands.SILENT.speedMaxKt) // 4

    // rudder: heading change per tick = 3.0 × 0.5 × dt = 0.075
    expect(ctx.player.headingDeg).toBeCloseTo(loadBalance().rudder.turnRateDegPerSec * loadBalance().rudder.lowBatteryTurnRateFactor * FIXED_DT, 9)

    const normal = makeCtx()
    normal.player.lowBattery = false
    tick(normal, { inputs: { throttle: 10, rudder: 1 } })
    expect(normal.player.headingDeg).toBeCloseTo(loadBalance().rudder.turnRateDegPerSec * FIXED_DT, 9)
  })

  it('suppresses the ping edge for the sonar system', () => {
    const ctx = makeCtx({ player: makePlayer({ battery: 5, lowBattery: true }) })
    tick(ctx, { inputs: { throttle: 0 }, pingEdge: true })
    expect(ctx.pingEdge).toBe(false)

    const ok = makeCtx({ player: makePlayer({ battery: 50 }) })
    tick(ok, { inputs: { throttle: 0 }, pingEdge: true })
    expect(ok.pingEdge).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Forced surface (§3.1, §4.5)
// ---------------------------------------------------------------------------

describe('forced surface', () => {
  it('triggers once at 0 battery: Surface layer, detection 100, event', () => {
    const b = loadBalance()
    const ctx = makeCtx({ player: makePlayer({ battery: 0.03, silentRunning: true }) })
    let forced = false
    for (let i = 0; i < 100; i++) {
      tick(ctx, { inputs: { throttle: 0 } })
      if (ctx.missionStatus.forcedSurface) { forced = true; break }
    }
    expect(forced).toBe(true)
    expect(ctx.player.battery).toBe(0)
    expect(ctx.player.depthLayer).toBe('Surface')
    expect(ctx.player.targetDepthLayer).toBe('Surface')
    expect(ctx.player.depthTransitionT).toBeNull()
    expect(ctx.player.silentRunning).toBe(false)
    expect(ctx.player.detection).toBe(b.battery.forcedSurfaceDetection) // 100
    expect(ctx.bus.getLog().filter((e) => e.type === 'sub.forcedSurface')).toHaveLength(1)
    // edge once: keep ticking, no second event
    for (let i = 0; i < 50; i++) tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.bus.getLog().filter((e) => e.type === 'sub.forcedSurface')).toHaveLength(1)
  })

  it('after forced surface the sub recharges at Surface and retains depth control', () => {
    const ctx = makeCtx({ player: makePlayer({ battery: 0.03 }) })
    for (let i = 0; i < 100 && !ctx.missionStatus.forcedSurface; i++) {
      tick(ctx, { inputs: { throttle: 0 } })
    }
    expect(ctx.missionStatus.forcedSurface).toBe(true)
    expect(ctx.player.depthLayer).toBe('Surface')
    expect(ctx.player.battery).toBe(0)
    // Surface recharge (DD-05): battery recovers
    for (let i = 0; i < 20; i++) tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.player.battery).toBeGreaterThan(0)
    // depth control is player agency: a Deep request starts a new transition
    tick(ctx, { inputs: { depthLayerTarget: 'Deep', throttle: 0 } })
    expect(ctx.player.depthTransitionT).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Depth layers (§4.4, F2)
// ---------------------------------------------------------------------------

describe('depth transitions', () => {
  it('takes 3 s per layer (F2) and emits sub.depthChanged on completion', () => {
    const b = loadBalance()
    const ctx = makeCtx()
    expect(ctx.player.depthLayer).toBe('Shallow')
    tick(ctx, { inputs: { depthLayerTarget: 'Deep' } }) // Shallow→Deep = 2 layers
    // the starting tick also consumes dt: 6 s − 0.05 s remain
    expect(ctx.player.depthTransitionT).toBeCloseTo(2 * b.depthTransitionSecondsPerLayer - FIXED_DT, 9)
    expect(ctx.player.depthLayer).toBe('Shallow') // still transitioning
    // 119 ticks ≈ 5.95 s: still transitioning
    for (let i = 0; i < 118; i++) tick(ctx, { inputs: { depthLayerTarget: 'Deep' } })
    expect(ctx.player.depthLayer).toBe('Shallow')
    expect(ctx.player.depthTransitionT).toBeGreaterThan(0)
    tick(ctx, { inputs: { depthLayerTarget: 'Deep' } }) // 120th tick completes it
    expect(ctx.player.depthLayer).toBe('Deep')
    expect(ctx.player.depthTransitionT).toBeNull()
    const depthEvents = ctx.bus.getLog().filter((e) => e.type === 'sub.depthChanged')
    expect(depthEvents).toHaveLength(1)
    expect(depthEvents[0]!.payload).toEqual({ layer: 'Deep' })
  })

  it('restarts from the current layer on retarget, and cancels when returning', () => {
    const b = loadBalance()
    const ctx = makeCtx()
    tick(ctx, { inputs: { depthLayerTarget: 'Deep' } })
    for (let i = 0; i < 40; i++) tick(ctx, { inputs: { depthLayerTarget: 'Deep' } }) // 2 s in
    // retarget to Surface mid-transition: restart from current layer (Shallow)
    tick(ctx, { inputs: { depthLayerTarget: 'Surface' } })
    expect(ctx.player.targetDepthLayer).toBe('Surface')
    // starting tick also consumes dt: 6 s − 0.05 s remain
    expect(ctx.player.depthTransitionT).toBeCloseTo(2 * b.depthTransitionSecondsPerLayer - FIXED_DT, 9)
    // cancel: target back to the current layer
    tick(ctx, { inputs: { depthLayerTarget: 'Shallow' } })
    expect(ctx.player.depthTransitionT).toBeNull()
    expect(ctx.player.depthLayer).toBe('Shallow')
    expect(ctx.player.targetDepthLayer).toBe('Shallow')
  })

  it('exposes layer distances', () => {
    expect(layerDistance('Surface', 'Deep')).toBe(4)
    expect(layerDistance('Shallow', 'Deep')).toBe(2)
    expect(layerDistance('Medium', 'Medium')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Decoy (FR-12, §8.2)
// ---------------------------------------------------------------------------

describe('decoy', () => {
  it('launches on edge: count −1, battery −1%, event, at player position', () => {
    const b = loadBalance()
    const ctx = makeCtx()
    ctx.player.position = { x: 20, y: 12 }
    tick(ctx, { decoyEdge: true })
    expect(ctx.player.decoyCount).toBe(b.decoy.perMission - 1)
    // launch tick also drains STOPPED battery (0.02/s × dt)
    const drainThisTick = b.speedBands.STOPPED.batteryDrainPerSec * FIXED_DT
    expect(ctx.player.battery).toBeCloseTo(100 - b.decoy.batteryCostPercent - drainThisTick, 9)
    expect(ctx.decoys).toHaveLength(1)
    expect(ctx.decoys[0]!.position).toEqual({ x: 20, y: 12 })
    expect(ctx.decoys[0]!.noise).toBe(b.decoy.noiseLevel) // 90
    // launched at the start of the tick, then aged by this tick's dt
    expect(ctx.decoys[0]!.ageS).toBeCloseTo(FIXED_DT, 9)
    const ev = ctx.bus.getLog().filter((e) => e.type === 'decoy.launched')
    expect(ev).toHaveLength(1)
    expect(ev[0]!.payload).toEqual({ decoyId: 'D-01', x: 20, y: 12 })
  })

  it('respects the 2-per-mission limit and the battery cost', () => {
    const b = loadBalance()
    const ctx = makeCtx()
    tick(ctx, { decoyEdge: true }) // D-01
    tick(ctx, { decoyEdge: true }) // D-02
    expect(ctx.decoys).toHaveLength(2)
    expect(ctx.player.decoyCount).toBe(0)
    tick(ctx, { decoyEdge: true }) // out of decoys — ignored silently
    expect(ctx.decoys).toHaveLength(2)
    expect(ctx.player.decoyCount).toBe(0)
    expect(ctx.bus.getLog().filter((e) => e.type === 'decoy.launched')).toHaveLength(2)

    const broke = makeCtx({ player: makePlayer({ battery: 0.5 }) })
    tick(broke, { decoyEdge: true })
    expect(broke.decoys).toHaveLength(0)
    expect(broke.player.decoyCount).toBe(b.decoy.perMission)
  })

  it('ages decoys and removes them after the duration (20 s)', () => {
    const b = loadBalance()
    const decoys = [createDecoy('D-01', 1, 2, b), createDecoy('D-02', 3, 4, b)]
    for (let i = 0; i < 199; i++) updateDecoys(decoys, FIXED_DT, b) // 9.95 s
    expect(decoys).toHaveLength(2)
    expect(decoys[0]!.ageS).toBeCloseTo(199 * FIXED_DT, 9)
    updateDecoys(decoys, FIXED_DT, b) // 10.0 s… still < 20 s
    expect(decoys).toHaveLength(2)
    for (let i = 0; i < 200; i++) updateDecoys(decoys, FIXED_DT, b) // +10 s → 20 s
    expect(decoys).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Out of bounds & hull
// ---------------------------------------------------------------------------

describe('out of bounds & hull', () => {
  it('accumulates the out-of-bounds timer and caps it at the fail threshold', () => {
    const b = loadBalance()
    const ctx = makeCtx({ player: makePlayer({ position: { x: 31, y: 15 } }) })
    for (let i = 0; i < 20; i++) tick(ctx, { inputs: { throttle: 0 } }) // 1 s
    expect(ctx.player.outOfBoundsTimer).toBeCloseTo(1, 6)
    for (let i = 0; i < 2000; i++) tick(ctx, { inputs: { throttle: 0 } }) // 100 s
    expect(ctx.player.outOfBoundsTimer).toBe(b.world.outOfBoundsFailSeconds) // 60
    ctx.player.position = { x: 15, y: 15 }
    tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.player.outOfBoundsTimer).toBe(0)
  })

  it('applyHullDamage reduces hull, clamps at 0, and emits sub.damaged', () => {
    const ctx = makeCtx()
    applyHullDamage(ctx, 'depthCharge', 25)
    expect(ctx.player.hull).toBe(75)
    expect(ctx.bus.getLog()).toEqual([expect.objectContaining({ type: 'sub.damaged', payload: { source: 'depthCharge', amount: 25, hullLeft: 75 } })])
    applyHullDamage(ctx, 'collision', 999)
    expect(ctx.player.hull).toBe(0)
    // noise bonus when hull ≤ 30%: reflected in the next tick's noise
    tick(ctx, { inputs: { throttle: 0 } })
    expect(ctx.player.noise).toBeGreaterThanOrEqual(loadBalance().hull.damagedNoiseBonus)
  })
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  const script: Array<TickOpts> = [
    { inputs: { throttle: 4, rudder: 0.3 } },
    { inputs: { throttle: 10, rudder: -1 } },
    { inputs: { throttle: 18, rudder: 0.7 } },
    { inputs: { throttle: 0, silentRunning: true } },
    { inputs: { depthLayerTarget: 'Deep' } },
    { inputs: { depthLayerTarget: 'Medium', throttle: 6 } },
    { decoyEdge: true },
    { inputs: { throttle: 22, rudder: 0.2 } },
    { inputs: { throttle: 0, depthLayerTarget: 'Shallow' } },
    { decoyEdge: true },
    { inputs: { throttle: 12, silentRunning: true } },
  ]

  it('same inputs → identical state, events, and decoys (no Math.random)', () => {
    const run = (): string => {
      const ctx = makeCtx()
      for (let i = 0; i < 60; i++) tick(ctx, script[i % script.length]!)
      return JSON.stringify({ player: ctx.player, decoys: ctx.decoys, events: ctx.bus.getLog() })
    }
    expect(run()).toBe(run())
  })
})
