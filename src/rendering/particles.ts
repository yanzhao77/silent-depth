/**
 * SILENT DEPTH — pooled particle system (src/rendering/particles.ts)
 *
 * VISUAL_STYLE §10 + GAME_ARCHITECTURE §11 (performance): a fixed-capacity
 * object pool (default 512) with zero per-frame allocations in the hot path.
 * Particles live in WORLD km coordinates; rendering converts via the camera
 * (north-up, zoom px/km). Kinds:
 *
 *   ping       — active-sonar ring: expands ~1 km/s, alpha 0.9 → 0 over 1.2 s
 *   wake       — torpedo stern wake bubbles, ~1.5 s life, drift behind
 *   explosion  — 18–24 particles, palette #ffd479 → #ff6b35 → #7a2f22,
 *                1.2 s life, strong deceleration, no gravity (top-down)
 *   splash     — depth-charge splash: white ring + 8 droplets, 0.8 s
 *
 * ADR-004 scope note: the determinism rule (GAME_ARCHITECTURE §5) applies to
 * the ENGINE (src/core|gameplay|sonar|ai|combat|missions|world|sim). The
 * rendering layer is explicitly allowed render-layer RNG (task brief: "render-
 * layer RNG allowed") — every spawn/update here is presentation-only.
 *
 * DESIGN DECISIONS:
 *  - Pool overflow (cap 512) drops the OLDEST active particle
 *    (GAME_ARCHITECTURE §11: "超出丢最旧") — never allocates a new object.
 *  - Particle objects are preallocated once; slot recycling via swap-remove
 *    (no array splice in update()).
 *  - update(dt) advances ages in seconds; render(ctx, camera) draws only
 *    active particles. The renderer calls both from its L3 layer.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — no DOM at module scope; CanvasRenderingContext2D is a
 * type-only reference. Importable in Node for unit tests.
 */

import type { Camera } from './camera'

/** Particle kinds (VISUAL_STYLE §10). */
export type ParticleKind = 'ping' | 'wake' | 'explosion' | 'splash'

/** Explosion palette — VISUAL_STYLE §2 / §10 (flash → hot → ember). */
const EXPLOSION_COLORS = ['#ffd479', '#ff6b35', '#7a2f22'] as const

interface Particle {
  active: boolean
  kind: ParticleKind
  /** World position, km. */
  x: number
  y: number
  /** Age / total life, seconds. */
  age: number
  life: number
  /** Velocity, km/s (explosion blast / splash droplets). */
  vx: number
  vy: number
  /** Base screen size, px (scaled by zoom factor in render). */
  sizePx: number
  /** Heading, deg (wake: direction of travel; splash: ring orientation). */
  headingDeg: number
  /** 0..1 palette pick for explosion gradient. */
  hue: number
  /** Per-particle random seed for stable droplet geometry. */
  seed: number
}

export interface ParticleSystem {
  /** Capacity of the pool (fixed). */
  readonly capacity: number
  /** Number of active particles (debug / tests). */
  readonly count: number
  /** Spawn an active-sonar ping ring at a world position. */
  spawnPing(x: number, y: number): void
  /** Spawn wake bubbles astern of a moving torpedo (call ~10 Hz per torpedo). */
  spawnWake(x: number, y: number, headingDeg: number): void
  /** Spawn a full explosion (18–24 particles) at a world position. */
  spawnExplosion(x: number, y: number): void
  /** Spawn a depth-charge splash (ring + droplets) at a world position. */
  spawnSplash(x: number, y: number): void
  /** Advance all particles by dt seconds. */
  update(dt: number): void
  /** Draw all active particles (layer L3). */
  render(ctx: CanvasRenderingContext2D, camera: Camera): void
  /** Deactivate every particle (mission restart). */
  clear(): void
}

/** Deterministic per-slot RNG for render-only randomness (no Math.random
 *  allocation concerns; a tiny LCG keeps sequences stable across calls). */
function slotRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Session-scoped seed counter (render-layer RNG source; no wall clock). */
let rngSeedCounter = 1

/** Degrees → radians. */
function rad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Create a pooled particle system.
 *
 * @param capacity pool size (default 512, GAME_ARCHITECTURE §11 cap).
 */
export function createParticleSystem(capacity = 512): ParticleSystem {
  const cap = Math.max(32, Math.floor(capacity))
  const pool: Particle[] = new Array(cap)
  for (let i = 0; i < cap; i++) {
    pool[i] = {
      active: false,
      kind: 'ping',
      x: 0,
      y: 0,
      age: 0,
      life: 1,
      vx: 0,
      vy: 0,
      sizePx: 4,
      headingDeg: 0,
      hue: 0,
      seed: (i * 2654435761) >>> 0,
    }
  }
  let activeCount = 0

  /** Find a free slot; on overflow recycle the oldest active particle. */
  function acquire(): Particle {
    for (let i = 0; i < cap; i++) {
      const p = pool[i]!
      if (!p.active) {
        p.active = true
        activeCount++
        return p
      }
    }
    // Pool full — drop the oldest (GAME_ARCHITECTURE §11).
    let oldest = pool[0]!
    for (let i = 1; i < cap; i++) {
      if (pool[i]!.age > oldest.age) oldest = pool[i]!
    }
    oldest.active = true // stays active; just resets its fields below
    return oldest
  }

  function release(p: Particle): void {
    p.active = false
    activeCount--
  }

  function spawn(p: Particle, kind: ParticleKind, x: number, y: number, life: number, sizePx: number): void {
    p.kind = kind
    p.x = x
    p.y = y
    p.age = 0
    p.life = life
    p.sizePx = sizePx
    p.vx = 0
    p.vy = 0
    p.headingDeg = 0
    p.hue = 0
  }

  return {
    get capacity(): number {
      return cap
    },
    get count(): number {
      return activeCount
    },

    spawnPing(x: number, y: number): void {
      const p = acquire()
      spawn(p, 'ping', x, y, 1.2, 8)
      // seed drives the ring phase; headingDeg unused for rings
    },

    spawnWake(x: number, y: number, headingDeg: number): void {
      const p = acquire()
      spawn(p, 'wake', x, y, 1.5, 3 + (p.seed % 3))
      p.headingDeg = headingDeg
      // Bubble starts slightly astern and drifts with the wake.
      const stern = rad(headingDeg + 180)
      const back = 0.02 + (p.seed % 5) * 0.004
      p.x = x + Math.sin(stern) * back
      p.y = y + Math.cos(stern) * back
      p.vx = Math.sin(stern) * (0.01 + (p.seed % 3) * 0.005)
      p.vy = Math.cos(stern) * (0.01 + (p.seed % 3) * 0.005)
    },

    spawnExplosion(x: number, y: number): void {
      const rnd = slotRng((rngSeedCounter++ * 2654435761) >>> 0 ^ pool.length)
      const n = 18 + Math.floor(rnd() * 7) // 18–24 particles (VISUAL_STYLE §10)
      for (let i = 0; i < n; i++) {
        const p = acquire()
        spawn(p, 'explosion', x, y, 1.2, 4 + rnd() * 6)
        const angle = rnd() * Math.PI * 2
        const speed = 0.02 + rnd() * 0.06 // km/s blast
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed
        p.hue = rnd()
        p.seed = Math.floor(rnd() * 1e6)
      }
    },

    spawnSplash(x: number, y: number): void {
      const rnd = slotRng((rngSeedCounter++ * 2654435761) >>> 0 ^ (pool.length << 3))
      const ring = acquire()
      spawn(ring, 'splash', x, y, 0.8, 10)
      ring.seed = 0 // ring marker
      for (let i = 0; i < 8; i++) {
        const p = acquire()
        spawn(p, 'splash', x, y, 0.8, 2 + rnd() * 2)
        const angle = (i / 8) * Math.PI * 2 + rnd() * 0.4
        p.vx = Math.cos(angle) * (0.05 + rnd() * 0.05)
        p.vy = Math.sin(angle) * (0.05 + rnd() * 0.05)
        p.seed = 1 // droplet marker
      }
    },

    update(dt: number): void {
      const d = dt > 0 ? dt : 0
      for (let i = 0; i < cap; i++) {
        const p = pool[i]!
        if (!p.active) continue
        p.age += d
        if (p.age >= p.life) {
          release(p)
          continue
        }
        // Motion per kind.
        if (p.kind === 'explosion') {
          // Strong deceleration (VISUAL_STYLE §10): v *= e^(−3t).
          const k = Math.exp(-3 * d)
          p.vx *= k
          p.vy *= k
          p.x += p.vx
          p.y += p.vy
        } else if (p.kind === 'splash' && p.seed === 1) {
          p.x += p.vx
          p.y += p.vy
        } else if (p.kind === 'wake') {
          p.x += p.vx
          p.y += p.vy
        }
      }
    },

    render(ctx: CanvasRenderingContext2D, camera: Camera): void {
      const z = camera.zoom / 8 // VISUAL_STYLE §5: sizes are authored at 8 px/km
      for (let i = 0; i < cap; i++) {
        const p = pool[i]!
        if (!p.active) continue
        const t = p.age / p.life // 0..1 progress
        const s = camera.worldToScreen(p.x, p.y)
        switch (p.kind) {
          case 'ping': {
            const radius = p.age * 1.0 * camera.zoom // ~1 km/s expansion
            ctx.globalAlpha = 0.9 * (1 - t)
            ctx.strokeStyle = '#7fd8d8' // sonarPing
            ctx.lineWidth = Math.max(1, 1.5 * z)
            ctx.beginPath()
            ctx.arc(s.x, s.y, radius, 0, Math.PI * 2)
            ctx.stroke()
            break
          }
          case 'wake': {
            ctx.globalAlpha = 0.35 * (1 - t)
            ctx.fillStyle = '#e8e8e8' // torpedoTrail base
            ctx.beginPath()
            ctx.arc(s.x, s.y, p.sizePx * z * (0.6 + t * 0.8), 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case 'explosion': {
            // Palette gradient flash → hot → ember; size swells then shrinks.
            const color =
              p.hue < 0.33
                ? EXPLOSION_COLORS[0]
                : p.hue < 0.66
                  ? EXPLOSION_COLORS[1]
                  : EXPLOSION_COLORS[2]
            ctx.globalAlpha = 1 - t * t
            ctx.fillStyle = color
            const swell = 1 + 2.2 * t * (1 - t)
            ctx.beginPath()
            ctx.arc(s.x, s.y, p.sizePx * z * swell, 0, Math.PI * 2)
            ctx.fill()
            break
          }
          case 'splash': {
            if (p.seed === 0) {
              // White expanding ring.
              const radius = p.age * 0.5 * camera.zoom
              ctx.globalAlpha = 0.7 * (1 - t)
              ctx.strokeStyle = '#e8e8e8'
              ctx.lineWidth = Math.max(1, 1.2 * z)
              ctx.beginPath()
              ctx.arc(s.x, s.y, radius, 0, Math.PI * 2)
              ctx.stroke()
            } else {
              // White droplet.
              ctx.globalAlpha = 0.8 * (1 - t)
              ctx.fillStyle = '#e8e8e8'
              ctx.beginPath()
              ctx.arc(s.x, s.y, p.sizePx * z, 0, Math.PI * 2)
              ctx.fill()
            }
            break
          }
        }
      }
      ctx.globalAlpha = 1
    },

    clear(): void {
      for (let i = 0; i < cap; i++) pool[i]!.active = false
      activeCount = 0
    },
  }
}
