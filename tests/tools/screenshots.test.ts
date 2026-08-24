/**
 * Headless screenshot generator — renders REAL game states through the REAL
 * renderer (createRenderer + createCamera + createParticleSystem) onto a
 * software canvas, and writes PNGs to assets/screenshots/ for the README.
 *
 * Honesty: these are procedural preview renders (real engine + real renderer,
 * headless software canvas), NOT browser captures. Real in-game screenshots
 * come from the F12 screenshot key. Each PNG is labeled via assets/screenshots/
 * README.md; regenerate with `npx vitest run tests/tools/screenshots.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGame, step } from '../../src/core/engine'
import { getMissionDef } from '../../src/missions/missions'
import { FIXED_DT } from '../../src/core/time'
import { createRenderer } from '../../src/rendering/renderer'
import { createCamera } from '../../src/rendering/camera'
import { createParticleSystem } from '../../src/rendering/particles'
import { injectCanvasFactory } from '../../src/rendering/sprites'
import { SoftCanvas } from './lib/softcanvas'
import { encodePng } from './lib/png'
import type { GameSnapshot, MissionDef, PlayerInputs } from '../../src/core/types'

const OUT_DIR = join(__dirname, '..', '..', 'assets', 'screenshots')
const W = 1280
const H = 720

type Rt = { player: { position: { x: number; y: number }; headingDeg: number }; enemies: { id: string; position: { x: number; y: number } }[] }

const IDLE: PlayerInputs = { throttle: 0, rudder: 0, depthLayerTarget: 'Medium', silentRunning: true, ping: false, fireTorpedo: null, decoy: false, pause: false }

function placePlayer(snap: GameSnapshot, def: MissionDef, offsetKm: number, rt: Rt): void {
  const target = rt.enemies[0]!
  rt.player.position = { x: target.position.x - offsetKm, y: target.position.y }
  rt.player.headingDeg = 90 // east
}

function runTo(handle: ReturnType<typeof createGame>, ticks: number, brain?: (s: GameSnapshot) => PlayerInputs): GameSnapshot {
  let snap = step(handle, FIXED_DT, IDLE)
  let last = IDLE
  for (let i = 0; i < ticks; i++) {
    const inputs = brain ? brain(snap) : IDLE
    if (inputs.ping) last = inputs
    snap = step(handle, FIXED_DT, inputs)
  }
  return snap
}

function renderAndSave(name: string, snapshot: GameSnapshot, def: MissionDef, seed: number, camera: ReturnType<typeof createCamera>, frame?: { ping?: boolean; torpedo?: boolean }): string {
  const canvas = new SoftCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const renderer = createRenderer({ seed, mission: def })
  const particles = createParticleSystem()
  if (frame?.ping) particles.spawnPing(snapshot.playerSub.position.x, snapshot.playerSub.position.y)
  if (frame?.torpedo) {
    for (const t of snapshot.torpedoes) if (t.state === 'RUNNING') particles.spawnWake(t.position.x, t.position.y, t.headingDeg)
  }
  particles.update(0.3)
  // two render passes so wakes/pings look alive
  renderer.render(ctx as unknown as CanvasRenderingContext2D, snapshot, camera, FIXED_DT, {
    particles,
    settings: { mapGrid: true, particlesEnabled: true, showFps: false },
  })
  particles.update(0.2)
  renderer.render(ctx as unknown as CanvasRenderingContext2D, snapshot, camera, FIXED_DT, {
    particles,
    settings: { mapGrid: true, particlesEnabled: true, showFps: false },
  })
  const png = encodePng(W, H, canvas.data)
  const file = join(OUT_DIR, `${name}.png`)
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(file, png)
  return file
}

describe('headless screenshot generator (README previews)', () => {
  injectCanvasFactory(() => new SoftCanvas(64, 64) as unknown as HTMLCanvasElement)

  it('m02-ambush: player + tanker contact + ping ring', () => {
    const def = getMissionDef('M02')
    const h = createGame(def, def.seed)
    const rt = h as unknown as { __internal: Rt }
    placePlayer(step(h, FIXED_DT, IDLE), def, 1.2, rt.__internal)
    // ping to form a ranged contact, then a few ticks for classification
    const snap = runTo(h, 60, (s) => (s.playerSub.pingCooldown <= 0 ? { ...IDLE, ping: true } : IDLE))
    const camera = createCamera({ zoom: 10, center: { x: snap.playerSub.position.x, y: snap.playerSub.position.y }, viewport: { width: W, height: H } })
    const file = renderAndSave('m02-ambush', snap, def, def.seed, camera, { ping: true })
    const buf = readFileSync(file)
    expect(buf[0]).toBe(0x89)
    expect(buf.length).toBeGreaterThan(4_000)
    console.log('wrote', file, buf.length, 'bytes')
  })

  it('m03-convoy: fleet + destroyer + contact ellipses (wide)', () => {
    const def = getMissionDef('M03')
    const h = createGame(def, def.seed)
    const rt = h as unknown as { __internal: Rt }
    // Place the player ~5 km west of the fleet so pings form contacts.
    const alive0 = step(h, FIXED_DT, IDLE).enemies.filter((e) => e.hull > 0)
    const cx0 = alive0.reduce((n, e) => n + e.position.x, 0) / alive0.length
    const cy0 = alive0.reduce((n, e) => n + e.position.y, 0) / alive0.length
    rt.__internal.player.position = { x: cx0 - 5, y: cy0 }
    rt.__internal.player.headingDeg = 90
    // ping every ~30 s so the convoy is sonar-perceived
    const snap = runTo(h, 12_000, (s) => (s.playerSub.pingCooldown <= 0 && s.simTime % 30 < FIXED_DT ? { ...IDLE, ping: true } : IDLE))
    // Player-view composition: camera follows the player (default zoom 8);
    // the convoy cluster + contact ellipses sit east of the sub.
    const camera = createCamera({ zoom: 8, center: { x: snap.playerSub.position.x, y: snap.playerSub.position.y }, viewport: { width: W, height: H } })
    const file = renderAndSave('m03-convoy', snap, def, def.seed, camera)
    const buf = readFileSync(file)
    expect(buf[0]).toBe(0x89)
    expect(buf.length).toBeGreaterThan(4_000)
    console.log('wrote', file, buf.length, 'bytes')
  })

  it('m05-night-fog: weather overlays + player view', () => {
    const def = getMissionDef('M05')
    const h = createGame(def, def.seed)
    const rt = h as unknown as { __internal: Rt }
    // Place the player ~2.5 km from the nearest enemy so pings form a contact
    // in the night/fog scene (sub + contact ellipse + ping ring visible).
    const alive0 = step(h, FIXED_DT, IDLE).enemies.filter((e) => e.hull > 0)
    const near = alive0.reduce((a, b) => (a.position.x < b.position.x ? a : b))
    rt.__internal.player.position = { x: near.position.x - 2.5, y: near.position.y }
    rt.__internal.player.headingDeg = 90
    const snap = runTo(h, 2400, (s) => (s.playerSub.pingCooldown <= 0 ? { ...IDLE, ping: true } : IDLE))
    const camera = createCamera({ zoom: 8, center: { x: snap.playerSub.position.x, y: snap.playerSub.position.y }, viewport: { width: W, height: H } })
    const file = renderAndSave('m05-night-fog', snap, def, def.seed, camera, { ping: true })
    const buf = readFileSync(file)
    expect(buf[0]).toBe(0x89)
    expect(buf.length).toBeGreaterThan(4_000)
    console.log('wrote', file, buf.length, 'bytes')
  })

  it('m02-torpedo: torpedo in flight with wake', () => {
    const def = getMissionDef('M02')
    const h = createGame(def, def.seed)
    const rt = h as unknown as { __internal: Rt }
    placePlayer(step(h, FIXED_DT, IDLE), def, 2.2, rt.__internal)
    let fired = false
    const snap = runTo(h, 400, (s) => {
      const c = s.contacts.find((cc) => cc.rangeKm !== null && cc.trueShipId !== null)
      if (!fired && c !== undefined && s.playerSub.pingCooldown <= 0) {
        fired = true
        return { ...IDLE, ping: true, fireTorpedo: c.id }
      }
      return s.playerSub.pingCooldown <= 0 ? { ...IDLE, ping: true } : IDLE
    })
    const camera = createCamera({ zoom: 6, center: { x: snap.playerSub.position.x + 1.2, y: snap.playerSub.position.y }, viewport: { width: W, height: H } })
    const file = renderAndSave('m02-torpedo', snap, def, def.seed, camera, { torpedo: true })
    const buf = readFileSync(file)
    expect(buf[0]).toBe(0x89)
    expect(buf.length).toBeGreaterThan(4_000)
    console.log('wrote', file, buf.length, 'bytes')
  })

  it('writes the screenshots README with honest labels', () => {
    const lines = [
      '# SILENT DEPTH — 游戏截图 / Screenshots',
      '',
      '> 这些图片是**程序化预览渲染**(真实引擎 + 真实渲染器,无头软件画布),',
      '> 用于 README 展示;并非浏览器实拍。游戏内按 **F12** 可截取真实画面',
      '> (自动下载 PNG 到浏览器下载目录)。重新生成:`npx vitest run tests/tools/screenshots.test.ts`',
      '',
      '| 文件 | 场景 |',
      '|---|---|',
      '| m02-ambush.png | 首次伏击:玩家潜艇 + 油轮接触(不确定性椭圆)+ 声呐 ping 扩散环 |',
      '| m03-convoy.png | 袭击护航队:4 货船 + 驱逐舰护航(接触椭圆,宽视野) |',
      '| m05-night-fog.png | 静默猎手:夜间 + 浓雾天气叠层 |',
      '| m02-torpedo.png | 鱼雷出管航行(尾迹气泡) |',
      '',
    ]
    const file = join(OUT_DIR, 'README.md')
    writeFileSync(file, lines.join('\n'))
    expect(existsSync(file)).toBe(true)
    console.log('wrote', file)
  })
})
