/**
 * SILENT DEPTH 《深海猎手》 — boot assembly (src/main.ts)
 *
 * The only DOM bridge in the app (with src/ui + src/rendering). Headless-
 * first: everything under src/core|gameplay|sonar|ai|combat|missions|world
 * stays DOM-free; this module wires the browser shell over the engine.
 *
 * Boot flow (GAME_ARCHITECTURE §8 dual-rate §9 save §14 events):
 *   1. load save + settings (injected localStorage) → apply audio volumes
 *   2. build canvas / HUD / menus / input / camera / particles / save store
 *   3. menu loop (menus.setSection('main'))
 *   4. startMission(id): getMissionDef → createGame(def, seed) → briefing
 *      (MISSION_LOADING) → MISSION_RUNNING
 *   5. rAF loop: computeFixedSteps accumulator (20 Hz sim, 60 Hz render),
 *      step(handle, FIXED_DT, inputs), render L0..L5 + HUD L6, forward new
 *      snapshot events to audio + HUD log + particles
 *   6. MISSION_RESULT → updateOnMissionResult (unlock next / best / stats)
 *      → result screen → menu. Restart = createGame(same seed). Abort =
 *      goToMenu(handle).
 *
 * DESIGN DECISIONS:
 *  - Pause is a one-tick PULSE (inputs.pause=true for exactly one step per
 *    P press): the engine's pauseEdge detects a rising edge each press, so a
 *    held flag would never resume (engine.ts PAUSED path keys on pauseEdge).
 *  - Salvo 2 fires one torpedo this step and queues a second shot for the
 *    next step (same contactId); the engine picks the next READY tube.
 *  - Camera: follow-player ON by default; canvas drag pans and switches to
 *    free camera; if the player leaves the viewport in free mode the camera
 *    re-follows (self-healing, no extra key needed).
 *  - Audio context is created lazily by createAudio on the first play; a
 *    one-shot pointerdown listener plays the UI click inside the first
 *    gesture (autoplay-policy safe).
 *  - The renderer works in CSS pixels; the backing store is scaled by
 *    devicePixelRatio once per resize.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 */

import './style.css'
import { createGame, goToMenu, step } from './core/engine'
import { FIXED_DT, MAX_FRAME_TIME_S, computeFixedSteps } from './core/time'
import type { EventEntry, GameSnapshot, MissionDef, PlayerInputs, WeatherKind } from './core/types'
import { loadBalance, type BalanceConfig } from './core/balance'
import { getMissionDef, listMissionSpecs, MISSION_IDS } from './missions/missions'
import { createCamera, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from './rendering/camera'
import { createParticleSystem } from './rendering/particles'
import { activeWeatherAt, createRenderer, type Renderer } from './rendering/renderer'
import { createHud } from './ui/hud'
import { createMenus, type MenuSection } from './ui/menus'
import { createInput } from './ui/input'
import {
  createSaveStore,
  setKnownMissionIds,
  updateOnMissionResult,
  type MissionResult,
  type SaveData,
  type SaveSettings,
} from './save/save'
import { createAudio, type AudioEngine } from './audio/audio'

// ---------------------------------------------------------------------------
// DOM shell
// ---------------------------------------------------------------------------

const root = document.getElementById('app')!
root.textContent = '' // clear the boot stub

const canvas = document.createElement('canvas')
canvas.id = 'game-canvas'
root.append(canvas)

const hudRoot = document.createElement('div')
hudRoot.id = 'hud-root'
root.append(hudRoot)

const menuRoot = document.createElement('div')
menuRoot.id = 'menu-root'
root.append(menuRoot)

const gfx = canvas.getContext('2d')
if (gfx === null) throw new Error('[silent-depth] Canvas 2D context unavailable')
const ctx2d = gfx

// ---------------------------------------------------------------------------
// Persistent shell state
// ---------------------------------------------------------------------------

const balance: BalanceConfig = loadBalance()
setKnownMissionIds(MISSION_IDS)

const saveStore = createSaveStore(typeof localStorage !== 'undefined' ? localStorage : null)
let save: SaveData = saveStore.load()
let audio: AudioEngine = createAudio({ audio: save.settings.audio })

let handle: ReturnType<typeof createGame> | null = null
let missionDef: MissionDef | null = null
let snapshot: GameSnapshot | null = null
let prevSnapshot: GameSnapshot | null = null
let renderer: Renderer | null = null

let accumulator = 0
let lastEventId = 0
let resultSettled = false
let outcome: 'victory' | 'defeat' | null = null
let shipsSunkThisRun: Record<string, number> = {}
let missionId: string | null = null

let selectedContactId: string | null = null
let salvo: 1 | 2 = 1
let salvoPending = false
let pausePulse = false
let lastShownState: string | null = null
let lastWeather: WeatherKind | null = null

let followPlayer = true
let dragging = false
let dragLast = { x: 0, y: 0 }

let lastTime = performance.now()
let wallT = 0
let fps = 0
let fpsFrames = 0
let fpsWindowStart = lastTime

const camera = createCamera({ mapSizeKm: balance.world.mapSizeKm })
const particles = createParticleSystem(512)

// ---------------------------------------------------------------------------
// Save / settings helpers
// ---------------------------------------------------------------------------

function applySettings(): void {
  audio.setVolume('master', save.settings.audio.masterVolume)
  audio.setVolume('sfx', save.settings.audio.sfxVolume)
  audio.setVolume('music', save.settings.audio.musicVolume)
}

function persistSave(): void {
  saveStore.write(save)
}

// ---------------------------------------------------------------------------
// HUD / menus / input
// ---------------------------------------------------------------------------

const hud = createHud(hudRoot, {
  onSelectContact: (id: string | null) => {
    selectedContactId = id
    input.setSelectedContactId(id)
  },
  onSalvoChange: (n: 1 | 2) => {
    salvo = n
    salvoPending = false
  },
})

const input = createInput({
  maxThrottleKt: balance.speedBands.FULL.speedMaxKt,
  onPause: () => {
    if (handle !== null && snapshot !== null && snapshot.state !== 'MENU') pausePulse = true
  },
  onMenu: () => {
    abortToMenu()
  },
})
input.bind(window)

const menus = createMenus(menuRoot, {
  save: () => save,
  listMissions: () => listMissionSpecs(),
  onPlay: (id: string) => startMission(id),
  onSettingsChanged: (settings: SaveSettings) => {
    save = { ...save, settings }
    persistSave()
    applySettings()
  },
  onClearSave: () => {
    saveStore.reset()
    save = saveStore.load()
    applySettings()
    menus.refresh()
  },
  onExportSave: () => saveStore.export(save),
  onImportSave: (file: File) => {
    saveStore.import(file, (imported) => {
      save = imported
      persistSave()
      applySettings()
      menus.refresh()
    })
  },
  onResume: () => {
    if (handle !== null) pausePulse = true
  },
  onRestart: () => {
    if (missionId !== null) startMission(missionId)
  },
  onAbort: () => abortToMenu(),
  onGoMainMenu: () => {
    setMenuSection('main')
  },
})

function setMenuSection(section: MenuSection): void {
  if (handle !== null && snapshot !== null && snapshot.state !== 'MENU') {
    abortToMenu()
  }
  menus.setSection(section)
}

// Audio unlock on the first user gesture (autoplay policy).
function unlockAudio(): void {
  audio.play('uiClick')
  window.removeEventListener('pointerdown', unlockAudio)
}
window.addEventListener('pointerdown', unlockAudio)

// ---------------------------------------------------------------------------
// Mission lifecycle
// ---------------------------------------------------------------------------

function startMission(id: string): void {
  missionId = id
  missionDef = getMissionDef(id)
  handle = createGame(missionDef, missionDef.seed)
  renderer = createRenderer({ seed: missionDef.seed, mission: missionDef })

  camera.setZoom(DEFAULT_ZOOM)
  camera.follow(missionDef.playerStart.x, missionDef.playerStart.y)
  followPlayer = true
  particles.clear()
  accumulator = 0
  prevSnapshot = null
  snapshot = null
  lastEventId = 0
  resultSettled = false
  outcome = null
  shipsSunkThisRun = {}
  selectedContactId = null
  salvo = 1
  salvoPending = false
  pausePulse = false
  lastShownState = 'BOOT'
  lastWeather = null

  input.reset()
  input.setSelectedContactId(null)
  hud.reset()

  // First tick: initialize the briefing snapshot (MISSION_LOADING).
  snapshot = step(handle, 0, buildInputs())
  processNewEvents(snapshot)
}

function abortToMenu(): void {
  if (handle === null) return
  try {
    goToMenu(handle)
  } catch {
    // Illegal transition (already MENU) — ignore.
  }
  hudRoot.style.display = 'none'
  lastShownState = 'MENU'
  menus.showEngineState('MENU')
}

// ---------------------------------------------------------------------------
// Input assembly (per fixed step)
// ---------------------------------------------------------------------------

function buildInputs(): PlayerInputs {
  const base = input.getInputs()
  let fire = input.consumeFireRequest()
  if (fire !== null) {
    if (salvo === 2) salvoPending = true
  } else if (salvoPending) {
    fire = selectedContactId
    salvoPending = false
  }
  const inputs: PlayerInputs = {
    ...base,
    fireTorpedo: fire,
    pause: pausePulse,
  }
  pausePulse = false
  return inputs
}

// ---------------------------------------------------------------------------
// Event fan-out (events → audio / HUD log / particles / outcome)
// ---------------------------------------------------------------------------

function processNewEvents(snap: GameSnapshot): void {
  const log = snap.eventLog
  for (let i = 0; i < log.length; i++) {
    const ev = log[i]!
    if (ev.id <= lastEventId) continue
    lastEventId = ev.id
    audio.onEngineEvent(ev)
    hud.appendLog(ev)
    applyEventEffect(ev, snap)
  }
}

function applyEventEffect(ev: EventEntry, snap: GameSnapshot): void {
  const p = ev.payload
  switch (ev.type) {
    case 'sonar.ping': {
      const player = snap.playerSub.position
      particles.spawnPing(player.x, player.y)
      break
    }
    case 'torpedo.hit': {
      const torp = findTorpedo(snap, p?.torpedoId)
      if (torp !== null) particles.spawnExplosion(torp.position.x, torp.position.y)
      break
    }
    case 'ship.sunk': {
      const ship = findEnemy(snap, p?.shipId)
      if (ship !== null) {
        particles.spawnExplosion(ship.position.x, ship.position.y)
        const cls = ship.shipClass
        shipsSunkThisRun[cls] = (shipsSunkThisRun[cls] ?? 0) + 1
      }
      break
    }
    case 'depthCharge.detonated': {
      if (typeof p?.x === 'number' && typeof p?.y === 'number') {
        particles.spawnSplash(p.x as number, p.y as number)
      }
      break
    }
    case 'mission.victory':
      outcome = 'victory'
      break
    case 'mission.defeat':
      outcome = 'defeat'
      break
  }
}

function findTorpedo(snap: GameSnapshot, id: unknown): { position: { x: number; y: number } } | null {
  if (typeof id !== 'string') return null
  for (const t of snap.torpedoes) {
    if (t.id === id) return t
  }
  return null
}

function findEnemy(snap: GameSnapshot, id: unknown): { position: { x: number; y: number }; shipClass: string } | null {
  if (typeof id !== 'string') return null
  for (const e of snap.enemies) {
    if (e.id === id) return e
  }
  return null
}

// ---------------------------------------------------------------------------
// Mission-result settlement (save update — once per mission)
// ---------------------------------------------------------------------------

function settleResult(snap: GameSnapshot): void {
  if (missionId === null) return
  const result: MissionResult = {
    missionId,
    completed: outcome === 'victory',
    score: snap.score.total,
    grade: snap.score.grade,
    torpedoesFired: snap.stats.torpedoesFired,
    torpedoesHit: snap.stats.torpedoesHit,
    peakDetection: snap.stats.peakDetection,
    elapsedS: snap.stats.elapsedS,
    shipsSunk: shipsSunkThisRun,
  }
  save = updateOnMissionResult(save, result, MISSION_IDS)
  persistSave()
}

// ---------------------------------------------------------------------------
// Camera interaction (wheel zoom + drag pan)
// ---------------------------------------------------------------------------

canvas.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault()
    const step = e.deltaY < 0 ? 1.5 : -1.5
    camera.setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom + step)))
  },
  { passive: false },
)

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true
  dragLast = { x: e.clientX, y: e.clientY }
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return
  const dx = e.clientX - dragLast.x
  const dy = e.clientY - dragLast.y
  dragLast = { x: e.clientX, y: e.clientY }
  camera.panBy(dx, dy)
  followPlayer = false
})
canvas.addEventListener('pointerup', () => {
  dragging = false
})

// ---------------------------------------------------------------------------
// Resize / DPR
// ---------------------------------------------------------------------------

function resize(): void {
  const dpr = Math.min(2, typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
  camera.setViewport(w, h)
}
window.addEventListener('resize', resize)
resize()

// ---------------------------------------------------------------------------
// Main render loop (rAF, dual-rate)
// ---------------------------------------------------------------------------

function frame(nowMs: number): void {
  requestAnimationFrame(frame)

  const frameDt = Math.min(Math.max(0, (nowMs - lastTime) / 1000), 0.25)
  lastTime = nowMs
  wallT += frameDt

  // FPS measurement.
  fpsFrames++
  if (nowMs - fpsWindowStart >= 500) {
    fps = Math.round((fpsFrames * 1000) / Math.max(1, nowMs - fpsWindowStart))
    fpsFrames = 0
    fpsWindowStart = nowMs
  }

  particles.update(frameDt)

  if (handle === null || snapshot === null) {
    // Menu idle backdrop (deep ocean base).
    ctx2d.fillStyle = '#050a12'
    ctx2d.fillRect(0, 0, camera.viewport.width, camera.viewport.height)
    return
  }

  // --- fixed-step simulation (20 Hz) --------------------------------------
  const fixed = computeFixedSteps(
    accumulator,
    frameDt,
    FIXED_DT,
    MAX_FRAME_TIME_S,
    snapshot.simTime,
  )
  accumulator = fixed.nextAccumulator
  prevSnapshot = snapshot
  for (let i = 0; i < fixed.steps; i++) {
    snapshot = step(handle, FIXED_DT, buildInputs())
    processNewEvents(snapshot)
  }
  // Note: when steps === 0 the sim simply does not tick this frame (standard
  // accumulator pattern). Engine edge latches (pause pulse / ping / decoy)
  // still deliver because the accumulator reaches FIXED_DT every ~3 frames —
  // including while PAUSED, where step() only advances nothing but edge
  // detection. Deliberately NO zero-dt step() calls: dt=0 ticks would run
  // gameplay systems with dt=0 and could consume engine RNG, diverging from
  // the headless runner's (FIXED_DT-only) sequences.

  const snap = snapshot
  const state = snap.state

  // --- mission-result settlement -------------------------------------------
  if (state === 'MISSION_RESULT' && !resultSettled) {
    resultSettled = true
    settleResult(snap)
  }

  // --- camera ---------------------------------------------------------------
  if (followPlayer) {
    camera.follow(snap.playerSub.position.x, snap.playerSub.position.y)
  } else if (playerOffScreen(snap)) {
    followPlayer = true
  }

  // --- weather (audio ambience + HUD chip) ----------------------------------
  if (renderer !== null) {
    const weather = activeWeatherAt(missionDef!.weather, snap.simTime, missionDef!.parTimeS, balance)
    if (weather !== lastWeather) {
      lastWeather = weather
      audio.setWeather(weather)
    }
  }

  // --- render L0..L5 ---------------------------------------------------------
  if (renderer !== null) {
    renderer.render(ctx2d, snap, camera, frameDt, {
      prev: prevSnapshot ?? undefined,
      alpha: accumulator / FIXED_DT,
      particles,
      settings: {
        mapGrid: save.settings.video.mapGrid,
        showFps: save.settings.video.showFps,
        particlesEnabled: save.settings.video.particles !== 'off',
      },
      selectedContactId,
      timeSeconds: wallT,
      fps,
    })
  }

  // --- HUD (L6) / menus ------------------------------------------------------
  const inMission = state !== 'MENU' && state !== 'BOOT'
  hudRoot.style.display = inMission ? '' : 'none'
  if (inMission && renderer !== null) {
    hud.update(snap, {
      selectedContactId,
      salvo,
      weather: lastWeather ?? 'Clear',
      mission: missionDef!,
      balance,
    })
  }

  if (state !== lastShownState) {
    lastShownState = state
    menus.showEngineState(state, { mission: missionDef ?? undefined, snapshot: snap })
  } else if (state === 'MISSION_LOADING' && missionDef !== null) {
    // Live briefing countdown without a full re-render.
    menus.updateBriefingCountdown((missionDef.briefingSeconds ?? 2) - snap.simTime)
  }
}

function playerOffScreen(snap: GameSnapshot): boolean {
  const p = camera.worldToScreen(snap.playerSub.position.x, snap.playerSub.position.y)
  const m = 48
  return (
    p.x < -m || p.x > camera.viewport.width + m || p.y < -m || p.y > camera.viewport.height + m
  )
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

applySettings()
menus.setSection('main')
requestAnimationFrame(frame)
console.log('[silent-depth] shell boot ok')
