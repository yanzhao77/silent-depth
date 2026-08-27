/**
 * SILENT DEPTH V2.0 — Visual RNG (src/renderer/visualRng.ts)
 *
 * Independent PRNG for visual-only randomness (particle jitter, wave noise,
 * visual variation). NEVER uses the engine's seeded RNG — this keeps the
 * simulation deterministic regardless of rendering behaviour.
 *
 * Algorithm: xorshift32 (fast, 32-bit state, period 2^32-1).
 * Seed derived from wall clock at init time — visual randomness is
 * intentionally non-reproducible across runs.
 *
 * @pure — zero DOM / browser-API references (seed is injected).
 */

export interface VisualRng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns a float in [min, max). */
  range(min: number, max: number): number;
  /** Returns an integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
}

/**
 * Create a visual-only PRNG. The seed should come from Date.now() or
 * performance.now() at init time — never from the engine seed.
 */
export function createVisualRng(seed?: number): VisualRng {
  // xorshift32 state — must be non-zero.
  let state = (seed ?? (Date.now() ^ 0xdeadbeef)) >>> 0;
  if (state === 0) state = 1;

  function next(): number {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    return state / 4294967296; // 2^32
  }

  function range(min: number, max: number): number {
    return min + next() * (max - min);
  }

  function int(min: number, max: number): number {
    return Math.floor(range(min, max + 1));
  }

  return { next, range, int };
}
