/**
 * t-028f — surfaced fast recharge: at the Surface depth layer with LOW/MEDIUM
 * speed (≤ CRUISE) the battery recharges fast (surfaceFastChargePerSec);
 * FULL speed keeps only the base surface rate.
 */

import { describe, expect, it } from 'vitest'
import { createGame, step } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import { loadBalance } from '../../src/core/balance'
import type { PlayerInputs } from '../../src/core/types'

const balance = loadBalance()

function setup(depthTarget: 'Surface' | 'Periscope', battery: number): { step: (i: PlayerInputs) => ReturnType<typeof step> } {
  const def = getMissionDef('M02')
  const h = createGame(def, def.seed)
  const rt = h as unknown as { __internal: { player: { battery: number } } }
  rt.__internal.player.battery = battery
  let snap = step(h, FIXED_DT, { throttle: 0, rudder: 0, depthLayerTarget: depthTarget, silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false })
  let t = 0
  for (; t < 400 && (snap.state !== 'MISSION_RUNNING' || snap.playerSub.depthLayer !== depthTarget); t++) {
    snap = step(h, FIXED_DT, { throttle: 0, rudder: 0, depthLayerTarget: depthTarget, silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false })
  }
  expect(snap.playerSub.depthLayer).toBe(depthTarget)
  return {
    step: (i: PlayerInputs) => {
      snap = step(h, FIXED_DT, i)
      return snap
    },
  }
}

describe('t-028f surfaced fast recharge', () => {
  it('Surface + SILENT → fast recharge (~surfaceFastChargePerSec net)', () => {
    const g = setup('Surface', 40)
    const before = g.step({ throttle: 2, rudder: 0, depthLayerTarget: 'Surface', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    let s = before
    for (let i = 0; i < 40; i++) s = g.step({ throttle: 2, rudder: 0, depthLayerTarget: 'Surface', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    // net ≈ fast 2.0 − SILENT drain 0.10 = +1.90 %/s → +3.8 % over 2 s
    expect(s - before).toBeGreaterThan(3.0)
    expect(s - before).toBeLessThan(4.5)
  })

  it('Surface + FULL → only base rate (no fast charge)', () => {
    const g = setup('Surface', 40)
    const before = g.step({ throttle: 22, rudder: 0, depthLayerTarget: 'Surface', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    let s = before
    for (let i = 0; i < 40; i++) s = g.step({ throttle: 22, rudder: 0, depthLayerTarget: 'Surface', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    // net ≈ base 0.5 − FULL drain 0.60 = −0.10 %/s → −0.2 % over 2 s (no fast charge)
    expect(s - before).toBeLessThan(0.5)
  })

  it('Periscope depth → no surface charge at all', () => {
    const g = setup('Periscope', 40)
    const before = g.step({ throttle: 2, rudder: 0, depthLayerTarget: 'Periscope', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    let s = before
    for (let i = 0; i < 40; i++) s = g.step({ throttle: 2, rudder: 0, depthLayerTarget: 'Periscope', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    // no charge at Periscope → battery only drains (SILENT 0.10 %/s)
    expect(s).toBeLessThan(before)
  })

  it('fast charge caps at 100%', () => {
    const g = setup('Surface', 99)
    let s = 99
    for (let i = 0; i < 120; i++) s = g.step({ throttle: 2, rudder: 0, depthLayerTarget: 'Surface', silentRunning: false, ping: false, fireTorpedo: null, decoy: false, pause: false }).playerSub.battery
    expect(s).toBeLessThanOrEqual(balance.battery.capacity)
  })
})
