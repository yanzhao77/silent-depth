/**
 * SILENT DEPTH — procedural ocean model (src/world/ocean.ts)
 *
 * FR-16 / GAME_DESIGN §9.3: seeded procedural ocean — color gradient
 * (shallow→deep), depth gradient (per depth layer), noise ripples, and a
 * visual-only current field. No external maps (FR-16). Colors follow
 * VISUAL_STYLE §2 (muted · military · cold palette: #050a12 base →
 * #0a1626 → #0d2233 → #14303f shallow tint).
 *
 * Determinism (ADR-004): generateOcean(seed, balance) is a PURE function —
 * the same seed always yields the identical model (deep-equal). Every random
 * value flows through createRng(seed).fork('world-ocean') — a fork label that
 * never aliases the engine's per-system streams (engine.ts §5.4) and consumes
 * NO parent stream. There is no Math.random anywhere in this module.
 *
 * DESIGN DECISIONS:
 *  - Ocean visuals use their own RNG fork label ('world-ocean') so the model
 *    is independent of the engine's per-system forks AND of call timing:
 *    generateOcean(seed, …) === generateOcean(seed, …) always, wherever it is
 *    called (mission init path, tests, rendering).
 *  - Grid sizes (64×64 ripple, 16×16 current) are presentation/layout
 *    constants, NOT gameplay-balance numbers: ADR-002 governs gameplay
 *    numbers in balance.json; visual tessellation lives here. The ripple
 *    cell ≈ 30 km / 64 ≈ 470 m ≈ the 500 m design grid (balance.world.gridM).
 *  - The ripple lattice is 16×16 with 2 octaves, bilinearly smooth-stepped
 *    (smoothstep value noise) up to 64×64 cells → large-scale, wave-like
 *    variation rather than per-cell white noise.
 *  - The current field is DERIVED from the ripple grid with ZERO extra RNG
 *    draws: each 16×16 cell center samples the ripple noise (toroidal wrap)
 *    at two phase-shifted coordinates → meandering, seamless visual flow.
 *    Currents are visual-only (FR-16: no v1 physics).
 *  - depthGradient tints are linear RGB interpolations between the palette's
 *    shallow tint (#14303f) and deep base (#050a12), monotonic with depth —
 *    "within the VISUAL_STYLE palette family" by construction (Surface is the
 *    lightest, Deep the darkest).
 *
 * Task: t-009 world system (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { DepthLayer } from '../core/types';
import { createRng, type Rng } from '../core/rng';
import type { BalanceConfig } from '../core/balance';

// ---------------------------------------------------------------------------
// VISUAL_STYLE §2 ocean palette (single source for all ocean colors)
// ---------------------------------------------------------------------------

/** Muted military ocean palette (VISUAL_STYLE §2) — shallow → deep. */
export const OCEAN_PALETTE = {
  base: '#050a12', // deep ocean base (background fill)
  deep: '#0a1626', // ocean gradient deep (open water)
  mid: '#0d2233', // ocean gradient mid (tactical zone)
  shallow: '#14303f', // ocean shallow tint (coastal/浅海 hint)
} as const;

/** Hex grid line color (VISUAL_STYLE §2) — exposed for the rendering layer. */
export const OCEAN_GRID_COLOR = '#1c3a4d';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One gradient stop; t ascends with depth (0 = shallowest, 1 = deepest). */
export interface OceanColorStop {
  t: number;
  color: string;
}

/**
 * Deterministic value-noise grid (smoothstep-bilinear upsampled lattice).
 * cells[row * size + col] ∈ [0, 1], row-major.
 */
export interface ValueNoiseGrid {
  size: number;
  /** Lattice cells per side of the first octave. */
  lattice: number;
  octaves: number;
  cells: number[];
}

/** Visual-only current vector (east/north components, kt). */
export interface CurrentVector {
  x: number;
  y: number;
}

/** Precomputed current vector field covering the whole map (visual only). */
export interface CurrentField {
  /** Cells per side (16). */
  size: number;
  /** World extent covered, km (balance.world.mapSizeKm). */
  extentKm: number;
  /** size × size vectors, row-major, at cell centers. */
  vectors: CurrentVector[];
}

/** Complete seeded ocean model (FR-16) — plain data, deep-equal comparable. */
export interface OceanModel {
  /** VISUAL_STYLE §2 deep ocean base. */
  backgroundColor: string;
  /** Gradient stops shallow→deep (VISUAL_STYLE §2 palette family). */
  colorStops: OceanColorStop[];
  /** Per-depth-layer tint (Surface lightest → Deep darkest). */
  depthGradient: Record<DepthLayer, string>;
  /** Deterministic 64×64 ripple value-noise grid. */
  rippleNoise: ValueNoiseGrid;
  /** Deterministic visual-only current vectors. */
  currentField: CurrentField;
}

// ---------------------------------------------------------------------------
// Layout constants (presentation, not gameplay balance — see header)
// ---------------------------------------------------------------------------

/** Ripple grid cells per side (64). */
export const RIPPLE_GRID_SIZE = 64;
/** Ripple lattice cells per side of the first octave (16). */
export const RIPPLE_LATTICE = 16;
/** Ripple octaves (2) — amplitude halves per octave. */
export const RIPPLE_OCTAVES = 2;
/** Current field cells per side (16). */
export const CURRENT_GRID_SIZE = 16;
/** Visual current speed band, kt (visual-only). */
export const CURRENT_SPEED_MIN = 0.5;
export const CURRENT_SPEED_MAX = 2.0;

/** Depth-layer order, shallowest → deepest (mirrors types.ts union order). */
export const DEPTH_LAYER_ORDER: readonly DepthLayer[] = [
  'Surface',
  'Periscope',
  'Shallow',
  'Medium',
  'Deep',
];

/** Fixed gradient stops shallow→deep (VISUAL_STYLE §2). */
export const OCEAN_COLOR_STOPS: readonly OceanColorStop[] = [
  { t: 0, color: OCEAN_PALETTE.shallow },
  { t: 1 / 3, color: OCEAN_PALETTE.mid },
  { t: 2 / 3, color: OCEAN_PALETTE.deep },
  { t: 1, color: OCEAN_PALETTE.base },
];

// ---------------------------------------------------------------------------
// Math helpers (exported for currents.ts and the rendering layer)
// ---------------------------------------------------------------------------

/** Linear interpolation, t clamped to [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return a + (b - a) * tt;
}

/** Hermite smoothstep of a fraction in [0, 1]: 3t² − 2t³. */
export function smoothstep01(t: number): number {
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return tt * tt * (3 - 2 * tt);
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (m === null) throw new TypeError(`interpolateHex: invalid hex color "${hex}"`);
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

function toHex(v: number): string {
  return v.toString(16).padStart(2, '0');
}

/**
 * Linear RGB interpolation between two #rrggbb colors (t clamped to [0, 1]).
 * Used to derive the depth gradient inside the VISUAL_STYLE palette family.
 */
export function interpolateHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const bl = Math.round(a.b + (b.b - a.b) * tt);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

// ---------------------------------------------------------------------------
// Value noise (deterministic, seeded)
// ---------------------------------------------------------------------------

/** Bilinear + smoothstep sample of one lattice octave at (u, v) ∈ [0, 1]. */
function sampleLattice(lattice: number[], dim: number, u: number, v: number): number {
  const sx = clamp01(u) * (dim - 1);
  const sy = clamp01(v) * (dim - 1);
  const i0 = Math.min(Math.floor(sx), dim - 1);
  const i1 = Math.min(i0 + 1, dim - 1);
  const j0 = Math.min(Math.floor(sy), dim - 1);
  const j1 = Math.min(j0 + 1, dim - 1);
  const fx = smoothstep01(sx - Math.floor(sx));
  const fy = smoothstep01(sy - Math.floor(sy));
  const a = lattice[j0 * dim + i0]!;
  const b = lattice[j0 * dim + i1]!;
  const c = lattice[j1 * dim + i0]!;
  const d = lattice[j1 * dim + i1]!;
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/**
 * Generate a deterministic smooth value-noise grid from a seeded RNG.
 * Lattice values are drawn row-major per octave (fixed draw order); each cell
 * is the amplitude-weighted average of the smooth-stepped octaves (0.5, 0.25,
 * …) normalized to [0, 1]. Same seed → same lattice → same cells.
 */
export function generateValueNoise(
  size: number,
  rng: Rng,
  lattice = RIPPLE_LATTICE,
  octaves = RIPPLE_OCTAVES,
): ValueNoiseGrid {
  const dims: number[] = [];
  const lattices: number[][] = [];
  for (let o = 0; o < octaves; o++) {
    const dim = Math.max(2, lattice >> o);
    dims.push(dim);
    const vals: number[] = new Array(dim * dim);
    for (let i = 0; i < vals.length; i++) vals[i] = rng.next();
    lattices.push(vals);
  }
  let totalWeight = 0;
  for (let o = 0; o < octaves; o++) totalWeight += Math.pow(0.5, o);

  const cells: number[] = new Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      let sum = 0;
      for (let o = 0; o < octaves; o++) {
        sum += Math.pow(0.5, o) * sampleLattice(lattices[o]!, dims[o]!, u, v);
      }
      cells[y * size + x] = sum / totalWeight;
    }
  }
  return { size, lattice, octaves, cells };
}

/**
 * Continuous sample of a value-noise grid at (u, v) ∈ [0, 1] (edge-clamped),
 * via smoothstep-bilinear interpolation of the final cells.
 */
export function sampleValueNoise(grid: ValueNoiseGrid, u: number, v: number): number {
  return sampleGridScalar(grid.cells, grid.size, clamp01(u), clamp01(v), false);
}

/**
 * Continuous sample with toroidal wrap: (u, v) may be any real number; the
 * grid is treated as seamless. Used for the meandering current field.
 */
export function sampleValueNoiseWrapped(grid: ValueNoiseGrid, u: number, v: number): number {
  return sampleGridScalar(grid.cells, grid.size, u, v, true);
}

function sampleGridScalar(
  cells: number[],
  size: number,
  u: number,
  v: number,
  wrap: boolean,
): number {
  const xf = wrap ? (((u % 1) + 1) % 1) * size : clamp01(u) * (size - 1);
  const yf = wrap ? (((v % 1) + 1) % 1) * size : clamp01(v) * (size - 1);
  const fx = wrap ? smoothstep01(xf - Math.floor(xf)) : smoothstep01(xf - Math.floor(xf));
  const fy = wrap ? smoothstep01(yf - Math.floor(yf)) : smoothstep01(yf - Math.floor(yf));
  const i0 = wrap ? Math.floor(xf) % size : Math.min(Math.floor(xf), size - 1);
  const i1 = wrap ? (i0 + 1) % size : Math.min(i0 + 1, size - 1);
  const j0 = wrap ? Math.floor(yf) % size : Math.min(Math.floor(yf), size - 1);
  const j1 = wrap ? (j0 + 1) % size : Math.min(j0 + 1, size - 1);
  const a = cells[j0 * size + i0]!;
  const b = cells[j0 * size + i1]!;
  const c = cells[j1 * size + i0]!;
  const d = cells[j1 * size + i1]!;
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

// ---------------------------------------------------------------------------
// Current field (visual-only, derived from the ripple grid — zero RNG draws)
// ---------------------------------------------------------------------------

function generateCurrentField(
  ripple: ValueNoiseGrid,
  size: number,
  extentKm: number,
): CurrentField {
  const vectors: CurrentVector[] = new Array(size * size);
  for (let gy = 0; gy < size; gy++) {
    const v = (gy + 0.5) / size;
    for (let gx = 0; gx < size; gx++) {
      const u = (gx + 0.5) / size;
      // Two phase-shifted, wrapped samples → decorrelated angle & speed with
      // seamless tileability across the map.
      const n1 = sampleValueNoiseWrapped(ripple, u, v);
      const n2 = sampleValueNoiseWrapped(ripple, (u + 0.5) % 1, (v + 0.25) % 1);
      // Two full rotations across the field → long meanders, not noisy jitter.
      const angle = n1 * Math.PI * 4;
      const speedKt = CURRENT_SPEED_MIN + n2 * (CURRENT_SPEED_MAX - CURRENT_SPEED_MIN);
      vectors[gy * size + gx] = { x: Math.cos(angle) * speedKt, y: Math.sin(angle) * speedKt };
    }
  }
  return { size, extentKm, vectors };
}

// ---------------------------------------------------------------------------
// Depth gradient (VISUAL_STYLE §2 family, monotonic shallow→deep)
// ---------------------------------------------------------------------------

function buildDepthGradient(): Record<DepthLayer, string> {
  const out = {} as Record<DepthLayer, string>;
  const n = DEPTH_LAYER_ORDER.length;
  for (let i = 0; i < n; i++) {
    // t = i / (n − 1): Surface = shallow tint, Deep = deep base.
    out[DEPTH_LAYER_ORDER[i]!] = interpolateHex(
      OCEAN_PALETTE.shallow,
      OCEAN_PALETTE.base,
      i / (n - 1),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the deterministic ocean model for a seed (FR-16). Pure: same
 * (seed, balance) → deep-equal model. All randomness comes from
 * createRng(seed).fork('world-ocean'); never Math.random.
 */
export function generateOcean(seed: number, balance: BalanceConfig): OceanModel {
  const rng = createRng(seed).fork('world-ocean');
  const rippleNoise = generateValueNoise(RIPPLE_GRID_SIZE, rng);
  const currentField = generateCurrentField(
    rippleNoise,
    CURRENT_GRID_SIZE,
    balance.world.mapSizeKm,
  );
  return {
    backgroundColor: OCEAN_PALETTE.base,
    colorStops: [...OCEAN_COLOR_STOPS],
    depthGradient: buildDepthGradient(),
    rippleNoise,
    currentField,
  };
}
