/**
 * SILENT DEPTH — full-mission determinism regression (tests/integration/determinism.test.ts)
 *
 * t-013 QA acceptance (ADR-004): step() is pure w.r.t. (handle, inputs, dt).
 * This suite proves it end-to-end over a full scripted M03 play:
 *
 *   - Same seed + same scripted inputs → byte-identical JSON.stringify(snapshot)
 *     at every 50th tick across a 3000-tick mission.
 *   - A different engine seed → snapshots diverge.
 *   - Pause-then-resume vs an uninterrupted run → byte-identical (frozen
 *     pause/resume edge ticks advance neither simTime nor RNG).
 *
 * The scripted brain is a pure function of (snapshot, lastInputs) — no wall
 * clock, no external state — so the two runs of the same seed consume the
 * identical input sequence, and the pause run resumes on the identical
 * pre-pause snapshot. Every mutable system runtime is keyed on the per-game
 * player object (WeakMap pattern), so sequential createGame() handles never
 * leak state — this suite is the guard for that contract.
 *
 * Environment: vitest node. No Math.random anywhere.
 */

import { describe, expect, it } from 'vitest'
import { createGame, step } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import { compassBearing, distKm } from '../../src/sonar/contacts'
import type { GameSnapshot, MissionDef, PlayerInputs } from '../../src/core/types'

const IDLE: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180
}

/**
 * Scripted M03 player: ping whenever the cooldown is ready (6 s cadence),
 * steer toward the nearest tracked cargo contact, and ping+fire a salvo at a
 * contact inside 1.7 km. ALL decisions derive from the snapshot (never from
 * the tick counter), so the pause variant resumes identically.
 */
function scriptedBrain(snap: GameSnapshot, last: PlayerInputs): PlayerInputs {
  const aliveCargoIds = new Set(
    snap.enemies.filter((e) => e.hull > 0 && e.shipClass === 'Cargo').map((e) => e.id),
  )
  const contacts = snap.contacts
    .filter((c) => c.trueShipId !== null && aliveCargoIds.has(c.trueShipId) && c.rangeKm !== null)
    .sort((a, b) => a.rangeKm! - b.rangeKm!)
  const target = contacts[0]
  const bearing = target !== undefined ? target.bearingDeg : 270 // briefing: convoy west
  const rudder = clamp(angleDelta(snap.playerSub.headingDeg, bearing) / 20, -1, 1)

  const pingReady = snap.playerSub.pingCooldown <= 0 && !last.ping
  let fire: string | null = null
  if (target !== undefined && target.rangeKm! <= 1.7 && snap.playerSub.pingCooldown <= 0 && snap.state === 'MISSION_RUNNING') {
    fire = target.id
  }
  return {
    throttle: 12,
    rudder,
    depthLayerTarget: 'Surface',
    silentRunning: false,
    ping: pingReady || fire !== null,
    fireTorpedo: fire,
    decoy: false,
    pause: false,
  }
}

const MISSION_TICKS = 3000
const SAMPLE_EVERY = 50

/** Run the scripted mission and return { snapshots at sample ticks, final }.
 *  Pause window (when opts.pauseAtTick ≥ 0), in loop-tick order:
 *    pause-edge (pause=true, frozen) → frozenTicks × (pause=true, frozen) →
 *    prevPause reset (pause=false, frozen) → resume-edge (pause=true, frozen)
 *  — the engine only resumes on a fresh pause EDGE (pause=true after
 *  prevPause=false), and every one of these ticks is frozen (no simTime/RNG). */
function runScripted(
  def: MissionDef,
  seed: number,
  opts: { pauseAtTick?: number; frozenTicks?: number } = {},
): { samples: string[]; final: GameSnapshot } {
  const handle = createGame(def, seed)
  let last = IDLE
  let snap = step(handle, FIXED_DT, IDLE)
  const samples: string[] = []
  let runningTicks = 0
  const pauseAt = opts.pauseAtTick ?? -1
  const frozen = opts.frozenTicks ?? 0
  const pauseEnd = pauseAt >= 0 ? pauseAt + frozen + 3 : -1
  const total = MISSION_TICKS + (pauseAt >= 0 ? frozen + 3 : 0)
  for (let t = 0; t < total; t++) {
    const inPause = pauseAt >= 0 && t >= pauseAt && t < pauseEnd
    let inputs: PlayerInputs
    if (inPause) {
      const i = t - pauseAt
      if (i === frozen + 2) inputs = { ...IDLE, pause: true } // resume edge (frozen)
      else if (i === frozen + 1) inputs = { ...IDLE, pause: false } // prevPause reset (frozen)
      else inputs = { ...IDLE, pause: true } // pause edge + frozen middle
    } else {
      inputs = scriptedBrain(snap, last)
      last = inputs
    }
    snap = step(handle, FIXED_DT, inputs)
    if (!inPause) {
      runningTicks += 1
      if (runningTicks % SAMPLE_EVERY === 0 || runningTicks === MISSION_TICKS) {
        samples.push(JSON.stringify(snap))
      }
      if (runningTicks >= MISSION_TICKS) break
    }
  }
  return { samples, final: snap }
}

describe('full-mission determinism (scripted M03 play, 3000 ticks)', () => {
  const def = getMissionDef('M03')

  it('same seed + same script → byte-identical snapshots at every sampled tick', () => {
    const a = runScripted(def, def.seed)
    const b = runScripted(def, def.seed)
    expect(a.samples.length).toBe(b.samples.length)
    for (let i = 0; i < a.samples.length; i++) {
      expect(a.samples[i], `sample index ${i}`).toBe(b.samples[i])
    }
    expect(a.samples.length).toBe(MISSION_TICKS / SAMPLE_EVERY) // 60 samples
  })

  it('a different engine seed → snapshots differ', () => {
    const a = runScripted(def, def.seed)
    const b = runScripted(def, def.seed + 1)
    // The very first sample may coincide (no RNG consumed before the first
    // ping) — divergence is guaranteed once pings/estimates draw RNG.
    let diverged = false
    for (let i = 0; i < a.samples.length; i++) {
      if (a.samples[i] !== b.samples[i]) {
        diverged = true
        break
      }
    }
    expect(diverged).toBe(true)
    expect(JSON.stringify(a.final)).not.toBe(JSON.stringify(b.final))
  })

  it('pause-then-resume vs no-pause → byte-identical final snapshot and samples', () => {
    const plain = runScripted(def, def.seed)
    const paused = runScripted(def, def.seed, { pauseAtTick: 1500, frozenTicks: 9 })
    expect(paused.final.simTime).toBe(plain.final.simTime)
    expect(paused.samples).toEqual(plain.samples)
    expect(JSON.stringify(paused.final)).toBe(JSON.stringify(plain.final))
  })

  it('same def+seed → identical first tick (fresh game bootstrap)', () => {
    const a = runScripted(def, def.seed)
    const b = runScripted(def, def.seed)
    expect(a.samples[0]).toBe(b.samples[0])
  })
})

describe('determinism across the five fixed missions (bootstrap + 100 ticks)', () => {
  for (const id of ['M01', 'M02', 'M03', 'M04', 'M05']) {
    it(`${id}: two fresh games with the same def+seed are byte-identical after 100 ticks`, () => {
      const def = getMissionDef(id)
      const run = (): string => {
        const handle = createGame(def, def.seed)
        let snap = step(handle, FIXED_DT, IDLE)
        for (let i = 0; i < 99; i++) snap = step(handle, FIXED_DT, IDLE)
        return JSON.stringify(snap)
      }
      expect(run()).toBe(run())
    })
  }
})
