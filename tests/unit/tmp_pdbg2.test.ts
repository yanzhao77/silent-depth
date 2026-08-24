import { describe, expect, it } from 'vitest'
import { createGame, step } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import type { PlayerInputs } from '../../src/core/types'
const BASE: PlayerInputs = { throttle: 0, rudder: 0, depthLayerTarget: 'Shallow', silentRunning: true, ping: false, fireTorpedo: null, decoy: false, pause: false }
describe('pdbg2', () => {
  it('trace', () => {
    const def = getMissionDef('M02')
    const h = createGame(def, def.seed)
    let snap = step(h, FIXED_DT, BASE)
    let t = 0
    for (; t < 200 && snap.state !== 'MISSION_RUNNING'; t++) snap = step(h, FIXED_DT, BASE)
    console.log('mission running at t=' + t)
    let pressed = false
    for (; t < 400; t++) {
      const periscope = !pressed && t > 100
      if (periscope) pressed = true
      snap = step(h, FIXED_DT, { ...BASE, depthLayerTarget: 'Shallow', periscope })
      if (t % 10 === 0 || (snap.periscope.state !== 'SUBMERGED' && snap.periscope.state !== 'SURFACING')) {
        console.log('t=' + t, 'state=' + snap.periscope.state, 'prog=' + snap.periscope.progress.toFixed(2), 'depth=' + snap.playerSub.depthLayer, 'tgt=' + snap.playerSub.targetDepthLayer, 'transT=' + snap.playerSub.depthTransitionT)
      }
      if (snap.periscope.state === 'RAISED') { console.log('RAISED at t=' + t); break }
    }
    expect(true).toBe(true)
  })
})
