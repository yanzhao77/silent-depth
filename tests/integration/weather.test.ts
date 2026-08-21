/**
 * SILENT DEPTH — weather effect on torpedo range (t-021, replan-v2 drill).
 *
 * Storm weather reduces effective torpedo range ×0.85 (balance.weather.Storm.
 * torpedoRangeFactor = 0.85 → 6 km × 0.85 = 5.1 km). Verified end-to-end:
 * a torpedo fired at a FAR contact (9 km away — unreachable in both weathers)
 * expires by RANGE at ~5.1 km in Storm vs ~6.0 km in Clear.
 *
 * Uses the documented test-harness pattern (direct __internal access to place
 * the player at a controlled offset — same pattern as the defeat-path test in
 * gameplay.test.ts).
 */

import { describe, expect, it } from 'vitest'
import { createGame, step } from '../../src/core/engine'
import { generateMission } from '../../src/missions/generator'
import { FIXED_DT } from '../../src/core/time'
import type { PlayerInputs } from '../../src/core/types'

const IDLE: PlayerInputs = { throttle: 0, rudder: 0, depthLayerTarget: 'Medium', silentRunning: true, ping: false, fireTorpedo: null, decoy: false, pause: false }

function runShot(weather: string, seed: number): { maxDistKm: number; states: string[] } {
  const def = generateMission(
    {
      id: 'TST',
      name: 'Weather Range Test',
      enemies: { Merchant: 1 },
      escorts: [],
      weather,
      visibility: 'medium',
      torpedoes: 4,
      battery: 100,
      objective: { kind: 'sink', params: { count: 1 }, subgoals: [{ id: 'sink1', desc: 'sink', weight: 400 }] },
      parMinutes: 20,
      difficulty: 1,
    },
    seed,
  )
  const handle = createGame(def, def.seed)
  const rt = (handle as unknown as { __internal: { player: { position: { x: number; y: number } }; enemies: { position: { x: number; y: number } }[] } }).__internal
  const target = rt.enemies[0]!
  // Player 9 km west of the target — within ping range (10 km), unreachable by torpedo.
  rt.player.position = { x: target.position.x - 9.0, y: target.position.y }
  let snap = step(handle, FIXED_DT, IDLE)
  let last = IDLE
  let fired = false
  let maxDistKm = 0
  const states: string[] = []
  for (let t = 0; t < 40000; t++) {
    const contact = snap.contacts.find((c) => c.rangeKm !== null && c.trueShipId !== null)
    let inputs = IDLE
    if (!fired && contact !== undefined && snap.playerSub.pingCooldown <= 0) {
      inputs = { ...IDLE, fireTorpedo: contact.id }
      fired = true
    } else if (!fired && snap.playerSub.pingCooldown <= 0 && !last.ping) {
      inputs = { ...IDLE, ping: true }
    }
    last = inputs
    snap = step(handle, FIXED_DT, inputs)
    for (const tp of snap.torpedoes) {
      if (tp.state === 'RUNNING') maxDistKm = Math.max(maxDistKm, tp.distanceKm)
      if (tp.state !== 'RUNNING') states.push(tp.state)
    }
    for (const e of snap.eventLog) {
      if (e.type.startsWith('torpedo.') && e.type !== 'torpedo.fired' && e.type !== 'torpedo.ready') states.push(e.type)
    }
    if (fired && snap.torpedoes.length === 0 && t > 200) break
  }
  return { maxDistKm, states: [...new Set(states)] }
}

describe('t-021 storm torpedo range factor (replan-v2 drill)', () => {
  it('Storm: torpedo expires by range at ~5.1 km (6 × 0.85)', () => {
    const r = runShot('Storm', 4242)
    expect(r.states).toContain('torpedo.expired')
    expect(r.maxDistKm).toBeGreaterThanOrEqual(4.9)
    expect(r.maxDistKm).toBeLessThanOrEqual(5.3)
  })

  it('Clear: the same geometry expires at ~6.0 km (full range)', () => {
    const r = runShot('Clear', 4343)
    expect(r.states).toContain('torpedo.expired')
    expect(r.maxDistKm).toBeGreaterThanOrEqual(5.7)
    expect(r.maxDistKm).toBeLessThanOrEqual(6.3)
  })
})
