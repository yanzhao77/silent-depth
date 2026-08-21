/**
 * SILENT DEPTH — seeded RNG (src/core/rng.ts)
 *
 * mulberry32 implementation — the ONLY random source in the engine (ADR-004).
 * No Math.random / Date.now / performance.now anywhere else in src/core.
 *
 * Determinism contract:
 *   - same seed  → same sequence
 *   - fork(label) derives a deterministic, independent stream from the
 *     current (label, seed, state) — forking does NOT consume the parent.
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [min, max). Requires max >= min. */
  range(min: number, max: number): number
  /** Uniform integer in [min, max], both ends inclusive. Requires max >= min. */
  int(min: number, max: number): number
  /** True with probability p (p clamped to [0, 1]). */
  chance(p: number): boolean
  /** -1 or +1 with equal probability. */
  sign(): 1 | -1
  /**
   * Deterministic derived stream, e.g. per-system sub-streams
   * (GAME_ARCHITECTURE §5.4: rng.fork('sonar') etc.).
   * Same (label, seed, parent-state) always yields the same stream.
   */
  fork(label: string): Rng
}

/** FNV-1a 32-bit string hash — deterministic, dependency-free. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * Create a seeded RNG. `seed` is normalized to uint32 (negative seeds are
 * wrapped deterministically, so any finite number is a valid seed).
 */
export function createRng(seed: number): Rng {
  return new Mulberry32(seed >>> 0)
}

class Mulberry32 implements Rng {
  private readonly seed: number
  private state: number

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.state = this.seed
  }

  next(): number {
    let a = this.state
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    this.state = a
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  int(min: number, max: number): number {
    const span = Math.floor(max) - Math.ceil(min) + 1
    return Math.floor(this.next() * span) + Math.ceil(min)
  }

  chance(p: number): boolean {
    const prob = p <= 0 ? 0 : p >= 1 ? 1 : p
    return this.next() < prob
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1
  }

  fork(label: string): Rng {
    // Deterministic derivation from (label, original seed, current state).
    // Using the current state means two forks of the same label at different
    // points in the parent stream produce different — but reproducible —
    // streams; the same fork point is always identical.
    const derived = (hashString(`${label}|${this.seed}`) ^ this.state) >>> 0
    return new Mulberry32(derived)
  }
}
