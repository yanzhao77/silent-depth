/**
 * SILENT DEPTH — UI layer unit tests (tests/unit/ui.test.ts)
 *
 * Task t-010 acceptance (ui-gate): Node-testable pure parts of the browser
 * presentation layer — no DOM, no canvas, no Math.random:
 *
 *   camera   — worldToScreen/screenToWorld roundtrip, pan roundtrip, zoom
 *              clamping, north-up orientation, follow/bounds
 *   save     — schema validate + clamp + corrupt-recovery with an injected
 *              storage; write/load roundtrip; reset; updateOnMissionResult
 *   input    — key code → PlayerInputs mapping (W/S/A/D/Q/E/Space/F/R/G),
 *              edge latch consumption, reset, bind() with a fake target
 *   events   — formatEvent FR-18 wording + suppressed noisy events
 *   firecard — formatFireSolution display strings
 *   minimap  — minimapProject coordinate math, lerpAngle wrap,
 *              activeWeatherAt segment semantics
 *
 * Environment: vitest node. All fixtures are plain data.
 */

import { describe, expect, it } from 'vitest'
import { createCamera, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../../src/rendering/camera'
import { MISSION_IDS } from '../../src/missions/missions'
import {
  createSaveStore,
  defaultSave,
  setKnownMissionIds,
  updateOnMissionResult,
  validateAndClamp,
  type MissionResult,
  type SaveData,
  type StorageLike,
} from '../../src/save/save'
import { createInput } from '../../src/ui/input'
import {
  DETECTION_BAND_COLORS,
  detectionBandIndex,
  formatEvent,
  formatFireSolution,
  formatLastSeen,
  formatTime,
  type FireControlParts,
} from '../../src/ui/hud'
import type { Contact, EventEntry } from '../../src/core/types'
import {
  activeWeatherAt,
  lerpAngle,
  lerpPos,
  minimapProject,
} from '../../src/rendering/renderer'
import type { FireSolution } from '../../src/combat/fireControl'

setKnownMissionIds(MISSION_IDS)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'C-01',
    state: 'CLASSIFIED',
    bearingDeg: 47,
    rangeKm: 3.2,
    bearingErrorDeg: 3,
    rangeErrorFrac: 0.1,
    speedEstimateKt: 12,
    headingEstimateDeg: 142,
    speedErrorFrac: 0.2,
    classification: 'Tanker',
    classifyConfidence: 80,
    confidence: 70,
    signalStrength: 'Medium',
    lastDetectedAt: 100,
    lastPingAt: 100,
    lastBearingAt: 100,
    observations: 4,
    trueShipId: 'E-01',
    ...overrides,
  }
}

function makeEvent(type: EventEntry['type'], payload?: Record<string, unknown>): EventEntry {
  return { id: 1, simTime: 10, type, payload }
}

function makeSolution(overrides: Partial<FireSolution> = {}): FireSolution {
  return {
    bearingDeg: 53,
    leadAngleDeg: 6,
    rangeKm: 3.2,
    targetHeadingDeg: 142,
    targetSpeedKt: 12,
    aobDeg: 60,
    hitProbability: 0.72,
    salvoHitProbability: 0.92,
    estimated: false,
    ...overrides,
  }
}

function makeFakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
    removeItem: (k: string) => {
      data.delete(k)
    },
  }
}

// ---------------------------------------------------------------------------
// Camera (src/rendering/camera.ts)
// ---------------------------------------------------------------------------

describe('camera', () => {
  it('worldToScreen/screenToWorld roundtrip (north-up)', () => {
    const cam = createCamera({ zoom: 8, center: { x: 15, y: 15 }, viewport: { width: 800, height: 600 } })
    const s = cam.worldToScreen(15, 15)
    expect(s.x).toBe(400)
    expect(s.y).toBe(300)
    const w = cam.screenToWorld(400, 300)
    expect(w.x).toBeCloseTo(15, 6)
    expect(w.y).toBeCloseTo(15, 6)
  })

  it('north (world +y) maps to smaller screen y', () => {
    const cam = createCamera({ zoom: 8, center: { x: 15, y: 15 }, viewport: { width: 800, height: 600 } })
    const north = cam.worldToScreen(15, 17)
    const south = cam.worldToScreen(15, 13)
    expect(north.y).toBeLessThan(south.y)
    expect(north.x).toBe(400)
  })

  it('zoom is clamped to [4, 16] px/km', () => {
    const cam = createCamera({ zoom: 8 })
    cam.setZoom(2)
    expect(cam.zoom).toBe(MIN_ZOOM)
    cam.setZoom(20)
    expect(cam.zoom).toBe(MAX_ZOOM)
    cam.zoomBy(-100)
    expect(cam.zoom).toBe(MIN_ZOOM)
    cam.zoomBy(100)
    expect(cam.zoom).toBe(MAX_ZOOM)
    expect(DEFAULT_ZOOM).toBe(8)
  })

  it('zoom scales world→screen linearly', () => {
    const cam = createCamera({ zoom: 8, center: { x: 15, y: 15 }, viewport: { width: 800, height: 600 } })
    const far = cam.worldToScreen(16, 15) // 1 km east
    cam.setZoom(16)
    const near = cam.worldToScreen(16, 15)
    expect(far.x - 400).toBeCloseTo(8, 6)
    expect(near.x - 400).toBeCloseTo(16, 6)
  })

  it('panBy moves the center opposite to the drag (roundtrip)', () => {
    const cam = createCamera({ zoom: 8, center: { x: 15, y: 15 } })
    cam.panBy(80, 60)
    // dx/zoom = 10 km west; dy/zoom = 7.5 km north.
    expect(cam.center.x).toBeCloseTo(5, 6)
    expect(cam.center.y).toBeCloseTo(22.5, 6)
    cam.panBy(-80, -60)
    expect(cam.center.x).toBeCloseTo(15, 6)
    expect(cam.center.y).toBeCloseTo(15, 6)
  })

  it('center is clamped to the world bounds', () => {
    const cam = createCamera({ mapSizeKm: 30, center: { x: 15, y: 15 } })
    cam.setCenter(-5, 40)
    expect(cam.center.x).toBe(0)
    expect(cam.center.y).toBe(30)
    cam.follow(2, 28)
    expect(cam.center.x).toBe(2)
    expect(cam.center.y).toBe(28)
  })

  it('setViewport changes the projection center point', () => {
    const cam = createCamera({ zoom: 8, center: { x: 15, y: 15 }, viewport: { width: 800, height: 600 } })
    cam.setViewport(1000, 800)
    const s = cam.worldToScreen(15, 15)
    expect(s.x).toBe(500)
    expect(s.y).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Save (src/save/save.ts)
// ---------------------------------------------------------------------------

describe('save schema', () => {
  it('validateAndClamp: null/corrupt → default save', () => {
    const d = validateAndClamp(null, MISSION_IDS)
    expect(d.version).toBe(1)
    expect(d.unlockedMissions).toEqual(['M01'])
    expect(d.statistics.torpedoesFired).toBe(0)
  })

  it('validateAndClamp: unknown version → default', () => {
    const d = validateAndClamp({ version: 2, unlockedMissions: ['M01', 'M05'] }, MISSION_IDS)
    expect(d.unlockedMissions).toEqual(['M01'])
  })

  it('validateAndClamp: whitelists ids, dedupes, clamps numbers', () => {
    const d = validateAndClamp(
      {
        version: 1,
        unlockedMissions: ['M01', 'M99', 'M02', 'M02'],
        bestScores: { M01: 9999, M99: 5, M02: -3 },
        statistics: {
          torpedoesFired: 1e9,
          torpedoesHit: -5,
          peakDetectionSum: 12.7,
          shipsSunk: { Merchant: 2, Alien: 9, Destroyer: 1 },
        },
        settings: { audio: { masterVolume: 5, sfxVolume: -1, musicVolume: 0.5 }, video: { showFps: 'yes', mapGrid: true } },
      },
      MISSION_IDS,
    )
    expect(d.unlockedMissions).toEqual(['M01', 'M02'])
    expect(d.bestScores).toEqual({ M01: 9999, M02: 0 })
    expect(d.statistics.torpedoesFired).toBe(1_000_000)
    expect(d.statistics.torpedoesHit).toBe(0)
    expect(d.statistics.shipsSunk).toEqual({ Merchant: 2, Destroyer: 1 })
    expect(d.settings.audio.masterVolume).toBe(1)
    expect(d.settings.audio.sfxVolume).toBe(0)
    expect(d.settings.video.showFps).toBe(false)
    expect(d.settings.video.mapGrid).toBe(true)
  })

  it('store: write → load roundtrip through injected storage', () => {
    const store = createSaveStore(makeFakeStorage())
    const save = defaultSave()
    save.bestScores['M01'] = 850
    store.write(save)
    const loaded = store.load()
    expect(loaded.bestScores['M01']).toBe(850)
    expect(loaded.version).toBe(1)
  })

  it('store: corrupt JSON → default, never throws', () => {
    const store = createSaveStore(makeFakeStorage({ 'silent-depth:save:v1': 'not json {{{' }))
    const loaded = store.load()
    expect(loaded.unlockedMissions).toEqual(['M01'])
  })

  it('store: reset removes the key', () => {
    const storage = makeFakeStorage()
    const store = createSaveStore(storage)
    store.write(defaultSave())
    expect(storage.data.has('silent-depth:save:v1')).toBe(true)
    store.reset()
    expect(storage.data.has('silent-depth:save:v1')).toBe(false)
  })

  it('store: null storage is a safe no-op', () => {
    const store = createSaveStore(null)
    expect(store.load().unlockedMissions).toEqual(['M01'])
    expect(() => store.write(defaultSave())).not.toThrow()
    expect(() => store.reset()).not.toThrow()
  })

  it('updateOnMissionResult: victory unlocks the next mission + best score', () => {
    const save = defaultSave() // M01 unlocked
    const result: MissionResult = {
      missionId: 'M01',
      completed: true,
      score: 850,
      grade: 'Good',
      torpedoesFired: 4,
      torpedoesHit: 3,
      peakDetection: 45,
      elapsedS: 900,
      shipsSunk: { Merchant: 1 },
    }
    const next = updateOnMissionResult(save, result, MISSION_IDS)
    expect(next.unlockedMissions).toEqual(['M01', 'M02'])
    expect(next.bestScores['M01']).toBe(850)
    expect(next.statistics.missionsCompleted).toBe(1)
    expect(next.statistics.torpedoesFired).toBe(4)
    expect(next.statistics.torpedoesHit).toBe(3)
    expect(next.statistics.shipsSunk['Merchant']).toBe(1)
    // Original save is untouched (functional update).
    expect(save.unlockedMissions).toEqual(['M01'])
  })

  it('updateOnMissionResult: bestScore keeps the max; defeat does not unlock', () => {
    let save = defaultSave()
    const win: MissionResult = {
      missionId: 'M01',
      completed: true,
      score: 500,
      grade: 'Good',
      torpedoesFired: 2,
      torpedoesHit: 1,
      peakDetection: 30,
      elapsedS: 600,
      shipsSunk: {},
    }
    save = updateOnMissionResult(save, win, MISSION_IDS)
    expect(save.bestScores['M01']).toBe(500)

    const loss: MissionResult = {
      missionId: 'M02',
      completed: false,
      score: 120,
      grade: 'Poor',
      torpedoesFired: 3,
      torpedoesHit: 0,
      peakDetection: 80,
      elapsedS: 400,
      shipsSunk: {},
    }
    save = updateOnMissionResult(save, loss, MISSION_IDS)
    expect(save.bestScores['M02']).toBe(120)
    expect(save.unlockedMissions).toEqual(['M01', 'M02']) // M03 NOT unlocked
    expect(save.statistics.missionsCompleted).toBe(1)
    expect(save.statistics.peakDetectionSum).toBe(110)
  })
})

// ---------------------------------------------------------------------------
// Input (src/ui/input.ts)
// ---------------------------------------------------------------------------

describe('input mapping', () => {
  it('W/S adjust the target throttle with clamping', () => {
    const input = createInput({ maxThrottleKt: 22 })
    input.handleKey('KeyW', true)
    input.handleKey('KeyW', true)
    expect(input.getInputs().throttle).toBe(4)
    input.handleKey('KeyS', true)
    expect(input.getInputs().throttle).toBe(2)
    for (let i = 0; i < 30; i++) input.handleKey('KeyW', true)
    expect(input.getInputs().throttle).toBe(22)
    for (let i = 0; i < 30; i++) input.handleKey('KeyS', true)
    expect(input.getInputs().throttle).toBe(0)
  })

  it('A/D hold produce rudder -1/+1/0', () => {
    const input = createInput({ maxThrottleKt: 22 })
    input.handleKey('KeyA', true)
    expect(input.getInputs().rudder).toBe(-1)
    input.handleKey('KeyD', true)
    expect(input.getInputs().rudder).toBe(0)
    input.handleKey('KeyA', false)
    expect(input.getInputs().rudder).toBe(1)
    input.handleKey('KeyD', false)
    expect(input.getInputs().rudder).toBe(0)
  })

  it('Q/E step through the five depth layers with clamping', () => {
    const input = createInput({ maxThrottleKt: 22 })
    expect(input.getInputs().depthLayerTarget).toBe('Shallow')
    input.handleKey('KeyQ', true)
    expect(input.getInputs().depthLayerTarget).toBe('Periscope')
    input.handleKey('KeyQ', true)
    expect(input.getInputs().depthLayerTarget).toBe('Surface')
    input.handleKey('KeyQ', true)
    expect(input.getInputs().depthLayerTarget).toBe('Surface') // clamp
    for (let i = 0; i < 6; i++) input.handleKey('KeyE', true)
    expect(input.getInputs().depthLayerTarget).toBe('Deep') // clamp
  })

  it('Space ping and G decoy are edge latches consumed on read', () => {
    const input = createInput({ maxThrottleKt: 22 })
    input.handleKey('Space', true)
    const a = input.getInputs()
    expect(a.ping).toBe(true)
    expect(input.getInputs().ping).toBe(false)
    input.handleKey('KeyG', true)
    expect(input.getInputs().decoy).toBe(true)
    expect(input.getInputs().decoy).toBe(false)
  })

  it('F queues a one-shot fire request for the selected contact', () => {
    const input = createInput({ maxThrottleKt: 22 })
    input.setSelectedContactId('C-01')
    input.handleKey('KeyF', true)
    expect(input.consumeFireRequest()).toBe('C-01')
    expect(input.consumeFireRequest()).toBeNull()
    input.setSelectedContactId(null)
    input.handleKey('KeyF', true)
    expect(input.consumeFireRequest()).toBeNull()
  })

  it('R toggles silent running', () => {
    const input = createInput({ maxThrottleKt: 22 })
    expect(input.getInputs().silentRunning).toBe(false)
    input.handleKey('KeyR', true)
    expect(input.getInputs().silentRunning).toBe(true)
    input.handleKey('KeyR', true)
    expect(input.getInputs().silentRunning).toBe(false)
  })

  it('P and Escape invoke their callbacks (not inputs)', () => {
    let pauses = 0
    let menus = 0
    const input = createInput({
      maxThrottleKt: 22,
      onPause: () => pauses++,
      onMenu: () => menus++,
    })
    input.handleKey('KeyP', true)
    input.handleKey('Escape', true)
    expect(pauses).toBe(1)
    expect(menus).toBe(1)
    // pause stays shell-owned (input value false).
    expect(input.getInputs().pause).toBe(false)
  })

  it('bind() maps window events and ignores OS key-repeat', () => {
    const input = createInput({ maxThrottleKt: 22 })
    const handlers = new Map<string, (e: unknown) => void>()
    const fakeTarget: Parameters<typeof input.bind>[0] = {
      addEventListener: (t, cb) => handlers.set(t, cb),
      removeEventListener: (t) => handlers.delete(t),
    }
    const unbind = input.bind(fakeTarget)
    const down = handlers.get('keydown')!
    const up = handlers.get('keyup')!
    expect(down).toBeDefined()
    expect(up).toBeDefined()

    const prevent = (): void => undefined
    down({ code: 'KeyW', repeat: false, preventDefault: prevent })
    down({ code: 'KeyW', repeat: true, preventDefault: prevent }) // ignored
    expect(input.getInputs().throttle).toBe(2)

    down({ code: 'KeyA', repeat: false, preventDefault: prevent })
    expect(input.getInputs().rudder).toBe(-1)
    up({ code: 'KeyA', repeat: false, preventDefault: prevent })
    expect(input.getInputs().rudder).toBe(0)

    unbind()
    expect(handlers.size).toBe(0)
  })

  it('reset() returns every input to mission-start defaults', () => {
    const input = createInput({ maxThrottleKt: 22 })
    input.handleKey('KeyW', true)
    input.handleKey('KeyR', true)
    input.handleKey('KeyQ', true)
    input.handleKey('KeyA', true)
    input.setSelectedContactId('C-02')
    input.reset()
    const i = input.getInputs()
    expect(i.throttle).toBe(0)
    expect(i.depthLayerTarget).toBe('Shallow')
    expect(i.silentRunning).toBe(false)
    expect(i.rudder).toBe(0)
    expect(input.consumeFireRequest()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// HUD formatters (src/ui/hud.ts)
// ---------------------------------------------------------------------------

describe('HUD formatters', () => {
  it('formatTime renders mm:ss', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65)).toBe('01:05')
    expect(formatTime(599)).toBe('09:59')
    expect(formatTime(-5)).toBe('00:00')
  })

  it('formatLastSeen renders NOW / seconds / mm:ss', () => {
    expect(formatLastSeen(100, 100.4)).toBe('NOW')
    expect(formatLastSeen(100, 112.6)).toBe('13S')
    expect(formatLastSeen(100, 200)).toBe('01:40')
  })

  it('formatEvent maps the ten FR-18 entries to exact wording', () => {
    expect(formatEvent(makeEvent('contact.detected', { contactId: 'C-01' }))).toBe('SONAR CONTACT DETECTED — C-01')
    expect(formatEvent(makeEvent('contact.classified'))).toBe('CONTACT CLASSIFIED')
    expect(formatEvent(makeEvent('torpedo.ready'))).toBe('TORPEDO READY')
    expect(formatEvent(makeEvent('torpedo.fired'))).toBe('TORPEDO FIRED')
    expect(formatEvent(makeEvent('torpedo.hit'))).toBe('TARGET HIT')
    expect(formatEvent(makeEvent('torpedo.missed'))).toBe('TORPEDO MISSED')
    expect(formatEvent(makeEvent('depthCharge.dropped'))).toBe('DEPTH CHARGES DROPPED')
    expect(formatEvent(makeEvent('battery.low'))).toBe('LOW BATTERY')
    expect(formatEvent(makeEvent('escape.escaped'))).toBe('ESCAPED')
    expect(formatEvent(makeEvent('mission.complete'))).toBe('MISSION COMPLETE')
  })

  it('formatEvent covers the rest of the catalogue with stable wording', () => {
    expect(formatEvent(makeEvent('ship.sunk', { shipId: 'E-01' }))).toBe('SHIP SUNK — E-01')
    expect(formatEvent(makeEvent('sonar.ping'))).toBe('ACTIVE PING')
    expect(formatEvent(makeEvent('player.located'))).toBe('PLAYER LOCATED')
    expect(formatEvent(makeEvent('sub.forcedSurface'))).toBe('FORCED TO SURFACE')
    expect(formatEvent(makeEvent('torpedo.fireRejected'))).toBe('FIRE REJECTED')
    expect(formatEvent(makeEvent('mission.victory'))).toBe('MISSION ACCOMPLISHED')
    expect(formatEvent(makeEvent('mission.defeat'))).toBe('MISSION FAILED')
  })

  it('formatEvent suppresses shell-noise events', () => {
    expect(formatEvent(makeEvent('sub.speedChanged'))).toBeNull()
    expect(formatEvent(makeEvent('sub.depthChanged'))).toBeNull()
    expect(formatEvent(makeEvent('ui.click'))).toBeNull()
  })

  it('detectionBandIndex picks the 5-band color by value', () => {
    const bands = [
      { max: 20, label: 'Unaware' },
      { max: 40, label: 'Suspicious' },
      { max: 60, label: 'Searching' },
      { max: 80, label: 'Hunting' },
      { max: 100, label: 'Located' },
    ]
    expect(detectionBandIndex(0, bands)).toBe(0)
    expect(detectionBandIndex(20, bands)).toBe(0)
    expect(detectionBandIndex(21, bands)).toBe(1)
    expect(detectionBandIndex(99, bands)).toBe(4)
    expect(DETECTION_BAND_COLORS.length).toBe(5)
  })

  it('formatFireSolution produces the §7.3 card strings', () => {
    const contact = makeContact()
    const parts: FireControlParts = formatFireSolution(makeSolution(), contact)
    expect(parts.target).toBe('C-01 Tanker')
    expect(parts.bearing).toBe('047°')
    expect(parts.range).toBe('3.2KM')
    expect(parts.targetHeading).toBe('142°')
    expect(parts.targetSpeed).toBe('12KT')
    expect(parts.firingBearing).toBe('053°')
    expect(parts.hitProbability).toBe('72%')
    expect(parts.salvoProbability).toBe('92%')
    expect(parts.estimated).toBe(false)
  })

  it('formatFireSolution shows -- for unknown inputs (bearing-only)', () => {
    const contact = makeContact({ rangeKm: null, headingEstimateDeg: null, speedEstimateKt: null })
    const parts = formatFireSolution(
      makeSolution({ rangeKm: null, targetHeadingDeg: null, targetSpeedKt: null, estimated: true }),
      contact,
    )
    expect(parts.range).toBe('--')
    expect(parts.targetHeading).toBe('--')
    expect(parts.targetSpeed).toBe('--')
    expect(parts.estimated).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Renderer pure math (src/rendering/renderer.ts)
// ---------------------------------------------------------------------------

describe('renderer pure math', () => {
  it('minimapProject maps world → minimap (north-up, padded)', () => {
    const size = 180
    const pad = 8
    const p = minimapProject(0, 0, 30, size, pad)
    expect(p.x).toBeCloseTo(pad, 6)
    expect(p.y).toBeCloseTo(size - pad, 6)
    const north = minimapProject(15, 30, 30, size, pad)
    const south = minimapProject(15, 0, 30, size, pad)
    expect(north.y).toBeLessThan(south.y)
    // Center of the map → center of the minimap.
    const c = minimapProject(15, 15, 30, size, pad)
    expect(c.x).toBeCloseTo(size / 2, 6)
    expect(c.y).toBeCloseTo(size / 2, 6)
  })

  it('minimapProject roundtrips through the inverse transform', () => {
    const size = 180
    const pad = 8
    const inner = size - pad * 2
    const p = minimapProject(21.5, 4.25, 30, size, pad)
    const wx = ((p.x - pad) / inner) * 30
    const wy = (1 - (p.y - pad) / inner) * 30
    expect(wx).toBeCloseTo(21.5, 6)
    expect(wy).toBeCloseTo(4.25, 6)
  })

  it('lerpPos interpolates linearly', () => {
    const p = lerpPos({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)
    expect(p.x).toBeCloseTo(2.5, 6)
    expect(p.y).toBeCloseTo(5, 6)
  })

  it('lerpAngle takes the shortest path across 0/360', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6)
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6)
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45, 6)
  })

  it('activeWeatherAt follows segment fractions (Clear->Cloudy)', () => {
    expect(activeWeatherAt('Clear->Cloudy', 0, 100)).toBe('Clear')
    expect(activeWeatherAt('Clear->Cloudy', 49, 100)).toBe('Clear')
    expect(activeWeatherAt('Clear->Cloudy', 50, 100)).toBe('Cloudy')
    expect(activeWeatherAt('Clear->Cloudy', 100, 100)).toBe('Cloudy')
    expect(activeWeatherAt('Storm', 999, 100)).toBe('Storm')
  })
})
