/**
 * SILENT DEPTH — gameplay integration tests (tests/integration/gameplay.test.ts)
 *
 * t-013 QA acceptance: full headless gameplay loops through the REAL engine
 * (createGame → step, dt = FIXED_DT = 0.05 s), scripted inputs only. No src/
 * changes, no mocked systems — every assertion runs the complete fixed-order
 * pipeline (stateMachine → world → missions → submarine → sonar → ai →
 * combat → detection → objectives → snapshot).
 *
 * Coverage:
 *   - M01 Sonar Training : find → classify → track → VICTORY (no sink);
 *     §10.1.2 tracking damage component (TRACKED +100; CONFIRMED +200 is
 *     covered at unit level, tests/unit/missions.test.ts:763).
 *   - M02 First Ambush  : approach → ping+fire salvo → hit → tanker sunk →
 *     VICTORY; torpedo fired→hit→ship.sunk events + scoring (§10.1).
 *   - M03 Convoy Attack : contact formation/classification, detection-meter
 *     exposure (F3 + ping), torpedo fire pipeline, destroyer AI escalation.
 *     Full double-sink victory is NOT achieved — see TEST_REPORT.md (the
 *     fire-control accuracy + merchant ALERT scatter + destroyer passive
 *     detection make a clean scripted victory impossible in this build; the
 *     victory path is exercised by M02 and the unit sink-objective suite).
 *   - Defeat paths      : endMission('defeat') API and the hull≤0 → DEFEAT
 *     conversion through the real objectives pipeline (test harness writes
 *     the opaque __internal only — documented).
 *   - Mission restart   : createGame(same def, same seed) twice → byte-
 *     identical initial + progressed snapshots (no cross-game state leak).
 *   - Pause/resume      : pausing mid-mission yields the same snapshot as an
 *     uninterrupted run (frozen pause/resume edge ticks, ADR-004).
 *   - F9 escape (M05)   : detection < 20 with escorts > 3 km sustained 30 s
 *     → escape.escaped event + missionStatus.escaped.
 *
 * Environment: vitest node. Deterministic — no Math.random anywhere.
 */

import { describe, expect, it } from 'vitest'
import { createGame, endMission, step, type GameHandle } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import { compassBearing, distKm } from '../../src/sonar/contacts'
import type { GameSnapshot, MissionDef, PlayerInputs, SubmarineState } from '../../src/core/types'

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

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

/** Signed smallest-angle difference a→b in degrees, wrapped to (−180, 180]. */
function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180
}

/** Run a game with a scripted brain until it ends or maxTicks elapse. */
function runGame(
  def: MissionDef,
  brain: (snap: GameSnapshot, last: PlayerInputs, ctx: { pings: number; fireInputs: number; tick: number }) => PlayerInputs,
  maxTicks: number,
): { final: GameSnapshot; pings: number; fireInputs: number } {
  const handle = createGame(def, def.seed)
  let last = IDLE
  let snap = step(handle, FIXED_DT, IDLE)
  const st = { pings: 0, fireInputs: 0, tick: 0 }
  for (let t = 0; t < maxTicks; t++) {
    st.tick = t
    const inputs = brain(snap, last, st)
    if (inputs.ping) st.pings += 1
    if (inputs.fireTorpedo !== null) st.fireInputs += 1
    last = inputs
    snap = step(handle, FIXED_DT, inputs)
    if (snap.state === 'VICTORY' || snap.state === 'DEFEAT' || snap.state === 'MISSION_RESULT') break
  }
  return { final: snap, pings: st.pings, fireInputs: st.fireInputs }
}

function eventsOf(snap: GameSnapshot, types: readonly string[]): string[] {
  return snap.eventLog.filter((e) => types.includes(e.type)).map((e) => `${e.type}@${e.simTime.toFixed(1)}`)
}

function steerInputs(snap: GameSnapshot, bearing: number, throttle: number, extra: Partial<PlayerInputs> = {}): PlayerInputs {
  return {
    throttle,
    rudder: clamp(angleDelta(snap.playerSub.headingDeg, bearing) / 15, -1, 1),
    depthLayerTarget: 'Shallow',
    silentRunning: false,
    ping: false,
    fireTorpedo: null,
    decoy: false,
    pause: false,
    ...extra,
  }
}

/** Test harness: direct write to the opaque engine runtime (documented). */
function setPlayerHull(handle: GameHandle, hull: number): void {
  const rt = handle.__internal as { player: SubmarineState }
  rt.player.hull = hull
}

// ---------------------------------------------------------------------------
// M01 Sonar Training — find / classify / track (no sink)
// ---------------------------------------------------------------------------

describe('M01 Sonar Training — find → classify → track → VICTORY', () => {
  const def = getMissionDef('M01')
  const merchantPos = def.spawns[0]!

  it('full pipeline victory with §10.1.2 tracking damage (TRACKED +100)', () => {
    const { final: snap } = runGame(
      def,
      (snap, last) => {
        const contact = snap.contacts[0]
        // Briefing knowledge: convoy reported ahead (west). Steer by the sonar
        // contact once one exists, else by the reported merchant position.
        const bearing = contact !== undefined ? contact.bearingDeg : compassBearing(snap.playerSub.position, merchantPos)
        const inRange = distKm(snap.playerSub.position, merchantPos) < 10
        const wantPing = inRange && snap.playerSub.pingCooldown <= 0 && !last.ping && snap.state === 'MISSION_RUNNING'
        return steerInputs(snap, bearing, 22, { ping: wantPing })
      },
      20000,
    )

    expect(snap.state).toBe('VICTORY')
    expect(snap.mission.phase).toBe('complete')
    // M01 subgoals: find (100) + classify (150) + track (150) = 400.
    expect(snap.mission.objectives.every((o) => o.done)).toBe(true)
    expect(snap.score.objective).toBe(400)
    // §10.1.2: no sink requirement → damage = tracking 折算 (damageMax 200):
    // TRACKED +100. (CONFIRMED +200 is unit-covered: missions.test.ts:763.)
    expect(snap.score.damage).toBe(100)
    expect(snap.score.survival).toBe(50) // hull 100 → 50 × 1.0
    // The contact must have reached TRACKED and be classified (a merchant type).
    const contact = snap.contacts[0]
    expect(contact).toBeDefined()
    expect(contact!.state).toBe('TRACKED')
    expect(contact!.trueShipId).toBe('E-01')
    // Event chain: detected → classified → victory.
    const ev = eventsOf(snap, ['contact.detected', 'contact.classified', 'mission.victory'])
    expect(ev.some((e) => e.startsWith('contact.detected'))).toBe(true)
    expect(ev.some((e) => e.startsWith('contact.classified'))).toBe(true)
    expect(ev.some((e) => e.startsWith('mission.victory'))).toBe(true)
    // Grade: total ≥ 800 (Excellent band). Stealth reflects the ping exposure.
    expect(snap.score.total).toBeGreaterThanOrEqual(800)
    expect(['Excellent', 'Perfect']).toContain(snap.score.grade)
  })
})

// ---------------------------------------------------------------------------
// M02 First Ambush — torpedo → hit → sink → VICTORY
// ---------------------------------------------------------------------------

describe('M02 First Ambush — torpedo salvo sinks the tanker', () => {
  const def = getMissionDef('M02')
  const tankerPos = def.spawns[0]!

  it('stationary ambush: stopped + quiet, ping for range, lead-corrected salvo sinks the tanker (§10.1 scoring)', () => {
    // The M02 tanker steams south right past the player's spawn zone
    // (x-offset ~0.5 km). Strategy: hold position (STOPPED, Medium depth,
    // silent running OFF → battery 0.02 %/s, noise ≈ 0 → detection stays ~0),
    // wait for the tanker to close, ping sparingly for range, then fire
    // point-blank salvos; the fire solution's lead (compass heading, t-020
    // remediation) intercepts the moving target.
    let lastPingAt = -1e9
    const { final: snap } = runGame(
      def,
      (snap, last, st) => {
        const contact = snap.contacts.find((c) => c.rangeKm !== null && c.trueShipId !== null)
        const range = contact !== undefined ? contact.rangeKm! : distKm(snap.playerSub.position, tankerPos)
        const tanker = snap.enemies.find((e) => e.id === contact?.trueShipId)
        const torpedoRunning = snap.torpedoes.some((tp) => tp.targetShipId === tanker?.id && tp.state === 'RUNNING')
        const tubesReady = snap.playerSub.torpedoTubes.some((tb) => tb.state === 'LOADED' || tb.state === 'READY')
        const canFire =
          contact !== undefined &&
          range <= 1.2 &&
          snap.playerSub.pingCooldown <= 0 &&
          !torpedoRunning &&
          snap.state === 'MISSION_RUNNING' &&
          tubesReady
        const fire = canFire ? contact!.id : null
        // Ping to acquire/refresh range every 150 s; fire immediately on ping
        // if in range (one ping per salvo to keep detection < 40).
        const wantRangePing = snap.playerSub.pingCooldown <= 0 && st.tick - lastPingAt >= 3000 && !last.ping
        const ping = (fire !== null && !last.ping) || wantRangePing
        if (ping) lastPingAt = st.tick
        // Hold position; face the contact so tubes align; stay quiet.
        const rudder = clamp(angleDelta(snap.playerSub.headingDeg, contact !== undefined ? contact.bearingDeg : 0) / 15, -1, 1)
        return {
          throttle: 0,
          rudder,
          depthLayerTarget: 'Medium',
          silentRunning: false,
          ping,
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        }
      },
      120000,
    )

    expect(snap.state).toBe('VICTORY')
    expect(snap.mission.phase).toBe('complete')
    // Torpedo pipeline events: fired → hit → ship.sunk.
    const ev = eventsOf(snap, ['torpedo.fired', 'torpedo.hit', 'torpedo.missed', 'ship.sunk', 'mission.victory'])
    expect(ev.some((e) => e.startsWith('torpedo.fired'))).toBe(true)
    expect(ev.some((e) => e.startsWith('torpedo.hit'))).toBe(true)
    expect(ev.some((e) => e.startsWith('ship.sunk'))).toBe(true)
    expect(ev.some((e) => e.startsWith('mission.victory'))).toBe(true)
    // The tanker (E-01, hull 130 > 2× torpedo damage) needs 2 hits — a salvo.
    expect(snap.stats.torpedoesHit).toBeGreaterThanOrEqual(2)
    expect(snap.enemies.find((e) => e.id === 'E-01')!.hull).toBe(0)
    // §10.1 scoring: objective 400 (sink-1), damage 70 (Tanker), survival 50.
    expect(snap.score.objective).toBe(400)
    expect(snap.score.damage).toBe(70)
    expect(snap.score.survival).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// M03 Convoy Attack — partial pipeline play (see TEST_REPORT for the victory gap)
// ---------------------------------------------------------------------------

describe('M03 Convoy Attack — perception, detection exposure & fire pipeline', () => {
  const def = getMissionDef('M03')

  it('pings raise the detection meter (F3/ping exposure); fire pipeline runs; destroyer escalates', () => {
    const { final: snap } = runGame(
      def,
      (snap, last) => {
        const alive = snap.enemies.filter((e) => e.hull > 0)
        const cargos = alive.filter((e) => e.shipClass === 'Cargo')
        // Nearest tracked cargo contact (contact id, not ship id — the engine
        // rejects ship ids as fireTorpedo targets with noTarget).
        let nearest: { contactId: string; d: number; bearing: number } | null = null
        for (const c of cargos) {
          const contact = snap.contacts.find((x) => x.trueShipId === c.id && x.rangeKm !== null)
          if (contact === undefined) continue
          const d = distKm(snap.playerSub.position, c.position)
          if (nearest === null || d < nearest.d) nearest = { contactId: contact.id, d, bearing: contact.bearingDeg }
        }
        // Probe pings early (detection-meter exposure), then fire at range.
        const wantPing = snap.playerSub.pingCooldown <= 0 && !last.ping && snap.state === 'MISSION_RUNNING' && snap.simTime < 120
        let fire: string | null = null
        if (nearest !== null && nearest.d <= 2.4 && snap.playerSub.pingCooldown <= 0 && snap.state === 'MISSION_RUNNING') {
          fire = nearest.contactId
        }
        return {
          throttle: 22,
          rudder: nearest !== null ? clamp(angleDelta(snap.playerSub.headingDeg, nearest.bearing) / 15, -1, 1) : 0,
          depthLayerTarget: 'Surface',
          silentRunning: false,
          ping: wantPing || (fire !== null && !last.ping),
          fireTorpedo: fire,
          decoy: false,
          pause: false,
        }
      },
      14000, // ~700 s sim — capped before the destroyer inevitably sinks the sub
    )

    // Sonar perception: contacts formed and reached CLASSIFIED (or better).
    expect(snap.contacts.length).toBeGreaterThan(0)
    expect(snap.contacts.some((c) => c.state === 'CLASSIFIED' || c.state === 'TRACKED' || c.state === 'CONFIRMED')).toBe(true)
    // Detection-meter exposure (F3 + ping self-exposure +12, §8.1).
    expect(snap.playerSub.detection).toBeGreaterThan(20)
    expect(snap.stats.peakDetection).toBeGreaterThanOrEqual(20)
    // Torpedo fire pipeline started (fired → RUNNING entities were created).
    expect(snap.stats.torpedoesFired).toBeGreaterThanOrEqual(1)
    // The destroyer's perception escalated out of NORMAL (F3 noise / pings).
    const destroyer = snap.enemies.find((e) => e.shipClass === 'Destroyer')
    expect(destroyer).toBeDefined()
    expect(destroyer!.aiState).not.toBe('NORMAL')
  })
})

// ---------------------------------------------------------------------------
// Defeat paths
// ---------------------------------------------------------------------------

describe('defeat paths — DEFEAT → MISSION_RESULT', () => {
  const def = getMissionDef('M01')

  function pastBriefing(): GameHandle {
    const handle = createGame(def, def.seed)
    let snap = step(handle, FIXED_DT, IDLE)
    for (let i = 0; i < 50; i++) snap = step(handle, FIXED_DT, IDLE) // 2 s briefing + margin
    expect(snap.state).toBe('MISSION_RUNNING')
    return handle
  }

  it('endMission("defeat") transitions DEFEAT → mission.defeat → MISSION_RESULT after the delay', () => {
    const handle = pastBriefing()
    endMission(handle, 'defeat')
    let snap = step(handle, FIXED_DT, IDLE)
    expect(snap.state).toBe('DEFEAT')
    expect(snap.mission.phase).toBe('failed')
    expect(snap.eventLog.some((e) => e.type === 'mission.defeat')).toBe(true)
    // After MISSION_RESULT_DELAY_S (3 s = 60 ticks) the game reaches MISSION_RESULT.
    for (let i = 0; i < 61; i++) snap = step(handle, FIXED_DT, IDLE)
    expect(snap.state).toBe('MISSION_RESULT')
  })

  it('hull ≤ 0 converts to DEFEAT through the real objectives pipeline (harness writes the opaque runtime)', () => {
    const handle = pastBriefing()
    // Test harness: no public hull-setter exists; the objectives system decides
    // defeat from player.hull ≤ 0 (§9 victory/defeat rule), so drive it there.
    setPlayerHull(handle, 0)
    const snap = step(handle, FIXED_DT, IDLE)
    expect(snap.state).toBe('DEFEAT')
    expect(snap.mission.phase).toBe('failed')
    expect(snap.eventLog.some((e) => e.type === 'mission.defeat')).toBe(true)
    expect(snap.playerSub.hull).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Mission restart (deterministic re-creation, no cross-game state leak)
// ---------------------------------------------------------------------------

describe('mission restart — createGame(same def, same seed) is byte-identical', () => {
  const def = getMissionDef('M02')

  it('two fresh games with the same def+seed produce identical snapshots', () => {
    const run = (): GameSnapshot[] => {
      const handle = createGame(def, def.seed)
      const snaps: GameSnapshot[] = []
      let s = step(handle, FIXED_DT, IDLE)
      snaps.push(s)
      for (let i = 0; i < 39; i++) s = step(handle, FIXED_DT, IDLE)
      snaps.push(s)
      return snaps
    }
    const [s1, s2] = run()
    const [t1, t2] = run()
    expect(JSON.stringify(s1)).toBe(JSON.stringify(t1))
    expect(JSON.stringify(s2)).toBe(JSON.stringify(t2))
  })

  it('a different seed yields a different run once RNG-driven state exists', () => {
    // M03: the cargo convoy starts inside active-ping range (8.1 km < 10 km),
    // so pings produce jittered contacts — RNG-driven state that must differ
    // across seeds. (M02's tanker starts outside ping range, so idle runs are
    // seed-independent — verified by the bootstrap determinism suite.)
    const m03 = getMissionDef('M03')
    const run = (seed: number): GameSnapshot => {
      const handle = createGame(m03, seed)
      let last = IDLE
      let snap = step(handle, FIXED_DT, IDLE)
      for (let t = 0; t < 299; t++) {
        const wantPing = snap.playerSub.pingCooldown <= 0 && !last.ping && snap.state === 'MISSION_RUNNING'
        last = { ...IDLE, ping: wantPing }
        snap = step(handle, FIXED_DT, last)
      }
      return snap
    }
    const a = run(m03.seed)
    const b = run(m03.seed + 1)
    expect(a.contacts.length).toBeGreaterThan(0) // pings hit the convoy
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

// ---------------------------------------------------------------------------
// Pause / resume determinism
// ---------------------------------------------------------------------------

describe('pause/resume — frozen pause edges keep the run byte-identical', () => {
  const def = getMissionDef('M01')
  const merchantPos = def.spawns[0]!

  function brain(snap: GameSnapshot, last: PlayerInputs): PlayerInputs {
    const contact = snap.contacts[0]
    const bearing = contact !== undefined ? contact.bearingDeg : compassBearing(snap.playerSub.position, merchantPos)
    const inRange = distKm(snap.playerSub.position, merchantPos) < 10
    const wantPing = inRange && snap.playerSub.pingCooldown <= 0 && !last.ping && snap.state === 'MISSION_RUNNING'
    return steerInputs(snap, bearing, 22, { ping: wantPing })
  }

  it('pausing for 10 ticks mid-mission then resuming matches the uninterrupted run', () => {
    const runA = (): GameSnapshot => {
      const handle = createGame(def, def.seed)
      let last = IDLE
      let snap = step(handle, FIXED_DT, IDLE)
      for (let t = 0; t < 2000; t++) {
        const inputs = brain(snap, last)
        last = inputs
        snap = step(handle, FIXED_DT, inputs)
      }
      return snap
    }
    const runB = (): GameSnapshot => {
      const handle = createGame(def, def.seed)
      let last = IDLE
      let snap = step(handle, FIXED_DT, IDLE)
      // Pause window at running-tick 1000: pause-edge → 9 frozen → prevPause
      // reset (pause=false) → resume-edge (pause=true). All 12 window ticks
      // are frozen; the engine only resumes on a fresh pause EDGE.
      const pauseAt = 1000
      const frozen = 9
      const pauseEnd = pauseAt + frozen + 3
      for (let t = 0; t < 2000 + frozen + 3; t++) {
        let inputs: PlayerInputs
        if (t >= pauseAt && t < pauseEnd) {
          const i = t - pauseAt
          if (i === frozen + 2) inputs = { ...IDLE, pause: true }
          else if (i === frozen + 1) inputs = { ...IDLE, pause: false }
          else inputs = { ...IDLE, pause: true }
        } else {
          inputs = brain(snap, last)
          last = inputs
        }
        snap = step(handle, FIXED_DT, inputs)
      }
      return snap
    }
    const a = runA()
    const b = runB()
    // Same simTime (paused ticks advance neither simTime nor RNG) and byte-identical state.
    expect(b.simTime).toBe(a.simTime)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

// ---------------------------------------------------------------------------
// F9 escape (M05 Silent Hunter)
// ---------------------------------------------------------------------------

describe('M05 — F9 escape: detection < 20, escorts > 3 km, sustained 30 s', () => {
  const def = getMissionDef('M05')

  it('silent + dive + move away → escape.escaped within 60 s', () => {
    const handle = createGame(def, def.seed)
    let snap = step(handle, FIXED_DT, IDLE)
    let escapedAt: GameSnapshot | null = null
    for (let t = 0; t < 2000; t++) {
      // Go quiet and deep, then creep away from the convoy (north, away from
      // the escorts south-west of the start).
      const escorts = snap.enemies.filter((e) => e.hull > 0 && e.shipClass !== 'Cargo')
      const awayBearing =
        escorts.length > 0
          ? compassBearing(snap.playerSub.position, escorts[0]!.position) + 180
          : snap.playerSub.headingDeg
      const inputs: PlayerInputs = {
        throttle: 4,
        rudder: clamp(angleDelta(snap.playerSub.headingDeg, awayBearing) / 15, -1, 1),
        depthLayerTarget: 'Medium',
        silentRunning: true,
        ping: false,
        fireTorpedo: null,
        decoy: false,
        pause: false,
      }
      snap = step(handle, FIXED_DT, inputs)
      if (snap.mission.escaped) {
        escapedAt = snap
        break
      }
    }
    expect(escapedAt).not.toBeNull()
    // F9: the escape requires detection < 20 and fires the event once.
    expect(escapedAt!.playerSub.detection).toBeLessThan(20)
    expect(escapedAt!.simTime).toBeLessThan(60)
    expect(escapedAt!.eventLog.filter((e) => e.type === 'escape.escaped').length).toBe(1)
    expect(escapedAt!.mission.escaped).toBe(true)
  })
})
