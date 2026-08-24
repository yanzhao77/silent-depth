/**
 * t-028 — live-depth (depthM) engine test + HUD ping-status helper test.
 */

import { describe, expect, it } from 'vitest'
import { createGame, step } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import { loadBalance } from '../../src/core/balance'
import { pingStatus } from '../../src/ui/hud'
import type { PlayerInputs } from '../../src/core/types'

const IDLE: PlayerInputs = { throttle: 0, rudder: 0, depthLayerTarget: 'Medium', silentRunning: true, ping: false, fireTorpedo: null, decoy: false, pause: false }

describe('t-028 live depth (depthM)', () => {
  it('starts at the initial layer midpoint and interpolates during a transition', () => {
    const def = getMissionDef('M02')
    const h = createGame(def, def.seed)
    let snap = step(h, FIXED_DT, IDLE)
    let t = 0
    for (; t < 200 && snap.state !== 'MISSION_RUNNING'; t++) snap = step(h, FIXED_DT, IDLE)
    expect(snap.state).toBe('MISSION_RUNNING')
    // initial layer Shallow → midpoint (11+30)/2 = 20.5
    expect(snap.playerSub.depthM).toBeCloseTo(20.5, 1)
    // drive to Medium (midpoint 50.5): transition takes 1 layer × 3 s = 60 ticks
    for (let i = 0; i < 30; i++) snap = step(h, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' })
    // mid-transition: depthM strictly between the two midpoints and moving
    const mid = snap.playerSub.depthM!
    expect(mid).toBeGreaterThan(20.5)
    expect(mid).toBeLessThan(50.5)
    for (let i = 0; i < 40; i++) snap = step(h, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' })
    expect(snap.playerSub.depthLayer).toBe('Medium')
    expect(snap.playerSub.depthM).toBeCloseTo(50.5, 1)
    // stable: unchanged
    const stable = snap.playerSub.depthM!
    snap = step(h, FIXED_DT, { ...IDLE, depthLayerTarget: 'Medium' })
    expect(snap.playerSub.depthM).toBe(stable)
  })

  it('deterministic: same inputs → identical depthM sequence', () => {
    const def = getMissionDef('M02')
    const run = (): number[] => {
      const h = createGame(def, def.seed)
      const out: number[] = []
      let s = step(h, FIXED_DT, IDLE)
      for (let i = 0; i < 100; i++) {
        s = step(h, FIXED_DT, i === 20 ? { ...IDLE, depthLayerTarget: 'Periscope' } : { ...IDLE, depthLayerTarget: 'Medium' })
        out.push(s.playerSub.depthM!)
      }
      return out
    }
    expect(run()).toEqual(run())
  })
})

describe('t-028 HUD ping status (pingStatus)', () => {
  const balance = loadBalance()

  it('ready when cooldown is 0 and battery is fine', () => {
    const ps = pingStatus({ pingCooldown: 0, lowBattery: false }, balance)
    expect(ps.state).toBe('ready')
    expect(ps.fraction).toBe(1)
  })

  it('cooldown shows remaining seconds and a shrinking fraction', () => {
    const ps = pingStatus({ pingCooldown: 3, lowBattery: false }, balance)
    expect(ps.state).toBe('cooldown')
    expect(ps.seconds).toBe(3)
    expect(ps.fraction).toBeCloseTo(1 - 3 / balance.sonar.active.cooldownSeconds, 5)
  })

  it('unavailable when battery is low even with cooldown ready', () => {
    const ps = pingStatus({ pingCooldown: 0, lowBattery: true }, balance)
    expect(ps.state).toBe('unavailable')
  })
})
