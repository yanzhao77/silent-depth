/**
 * SILENT DEPTH V2.6 — Weather & underwater visual derivation (src/renderer/weather.ts)
 *
 * Pure, deterministic presentation-only parameter derivation for the V2.6
 * atmosphere system. NO engine state is read or written here; the renderer feeds
 * these results into the Three.js layer. Every function is a pure mapping of its
 * inputs so the cinematic mood is reproducible and unit-testable.
 *
 * Lightning timing is derived from `simTime` with a fixed visual cadence and a
 * deterministic per-cycle jitter hash — it never consumes engine RNG and never
 * produces engine-side effects.
 *
 * @pure — zero DOM / Three.js references.
 */

import type { WeatherKind } from '../core/types';
import type { Vec3 } from './types';

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear interpolation between two 0xRRGGBB colours, returns 0xRRGGBB. */
export function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

/** Max per-channel distance between two 0xRRGGBB colours, normalised to [0,1]. */
export function colorDistance(a: number, b: number): number {
  const dr = Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) / 255;
  const dg = Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) / 255;
  const db = Math.abs((a & 0xff) - (b & 0xff)) / 255;
  return Math.max(dr, dg, db);
}

// ---------------------------------------------------------------------------
// Weather visuals
// ---------------------------------------------------------------------------

export interface WeatherVisual {
  kind: WeatherKind;
  isNight: boolean;
  storm: boolean;

  // Sky dome gradient
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;

  // Sun (or moon, at night) key light
  sunDirection: Vec3;
  sunColor: number;
  sunIntensity: number;

  // Moon specifics (only meaningful at night)
  moonColor: number;
  moonIntensity: number;
  moonDirection: Vec3;
  starIntensity: number;

  // Cloud mass
  cloudColor: number;
  cloudCover: number;

  // Scene fog (distance haze)
  fogColor: number;
  fogDensity: number;
  visibilityKm: number;

  // Three-point lighting (fill + rim)
  ambientTop: number;
  ambientBottom: number;
  ambientIntensity: number;
  rimColor: number;
  rimIntensity: number;

  // Ocean surface palette
  oceanDeep: number;
  oceanShallow: number;
  oceanFoam: number;
  oceanSubsurface: number;

  /** Whether this weather drives storm lightning. */
  lightning: boolean;
}

function dir(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

const WEATHER_VISUALS: Record<WeatherKind, WeatherVisual> = {
  Clear: {
    kind: 'Clear', isNight: false, storm: false,
    skyTop: 0x1a3a5c, skyHorizon: 0x4a6a8a, skyBottom: 0x030a14,
    sunDirection: dir(0.46, 0.76, 0.34), sunColor: 0xfff0d0, sunIntensity: 1.0,
    moonColor: 0xbcd0e6, moonIntensity: 0, moonDirection: dir(0.22, 0.62, 0.48), starIntensity: 0,
    cloudColor: 0xc9d6e0, cloudCover: 0.12,
    fogColor: 0x0c2638, fogDensity: 0.002, visibilityKm: 16,
    ambientTop: 0x3a6a88, ambientBottom: 0x030a14, ambientIntensity: 0.35,
    rimColor: 0x88aacc, rimIntensity: 0.25,
    oceanDeep: 0x03111e, oceanShallow: 0x1a4e68, oceanFoam: 0xd4e2e7, oceanSubsurface: 0x2e7887,
    lightning: false,
  },
  Cloudy: {
    kind: 'Cloudy', isNight: false, storm: false,
    skyTop: 0x22384a, skyHorizon: 0x5a7a90, skyBottom: 0x0a1828,
    sunDirection: dir(0.40, 0.60, 0.30), sunColor: 0xdfeaf2, sunIntensity: 0.55,
    moonColor: 0xbcd0e6, moonIntensity: 0, moonDirection: dir(0.22, 0.62, 0.48), starIntensity: 0,
    cloudColor: 0x9fb0bd, cloudCover: 0.6,
    fogColor: 0x102435, fogDensity: 0.006, visibilityKm: 12,
    ambientTop: 0x566b79, ambientBottom: 0x0d2233, ambientIntensity: 0.36,
    rimColor: 0x99afbd, rimIntensity: 0.24,
    oceanDeep: 0x04111c, oceanShallow: 0x1a3a4d, oceanFoam: 0xaab9c4, oceanSubsurface: 0x1d4655,
    lightning: false,
  },
  Fog: {
    kind: 'Fog', isNight: false, storm: false,
    skyTop: 0x5a6a7a, skyHorizon: 0x8898a8, skyBottom: 0x5a6a7a,
    sunDirection: dir(0.50, 0.50, 0.30), sunColor: 0xccc9bb, sunIntensity: 0.5,
    moonColor: 0xbcd0e6, moonIntensity: 0, moonDirection: dir(0.22, 0.62, 0.48), starIntensity: 0,
    cloudColor: 0x9aa7b2, cloudCover: 0.3,
    fogColor: 0x788d9b, fogDensity: 0.04, visibilityKm: 4,
    ambientTop: 0x647786, ambientBottom: 0x0d2233, ambientIntensity: 0.39,
    rimColor: 0x7c91a0, rimIntensity: 0.20,
    oceanDeep: 0x071420, oceanShallow: 0x2b4859, oceanFoam: 0xa7b4bd, oceanSubsurface: 0x2b505c,
    lightning: false,
  },
  Storm: {
    kind: 'Storm', isNight: false, storm: true,
    skyTop: 0x111d2a, skyHorizon: 0x34485a, skyBottom: 0x0b1929,
    sunDirection: dir(0.20, 0.30, 0.40), sunColor: 0x9aaec0, sunIntensity: 0.5,
    moonColor: 0xbcd0e6, moonIntensity: 0, moonDirection: dir(0.22, 0.62, 0.48), starIntensity: 0,
    cloudColor: 0x4a5560, cloudCover: 0.95,
    fogColor: 0x112235, fogDensity: 0.015, visibilityKm: 6,
    ambientTop: 0x3d5969, ambientBottom: 0x07111f, ambientIntensity: 0.41,
    rimColor: 0x63859b, rimIntensity: 0.27,
    oceanDeep: 0x020914, oceanShallow: 0x112c3d, oceanFoam: 0xaebdc5, oceanSubsurface: 0x173b4a,
    lightning: true,
  },
  Night: {
    kind: 'Night', isNight: true, storm: false,
    skyTop: 0x030c17, skyHorizon: 0x102438, skyBottom: 0x02070d,
    sunDirection: dir(0.22, 0.62, 0.48), sunColor: 0xaec4dc, sunIntensity: 0.5,
    moonColor: 0xbcd0e6, moonIntensity: 0.6, moonDirection: dir(0.22, 0.62, 0.48), starIntensity: 0.5,
    cloudColor: 0x35414e, cloudCover: 0.2,
    fogColor: 0x02080e, fogDensity: 0.008, visibilityKm: 9,
    ambientTop: 0x21495d, ambientBottom: 0x02070d, ambientIntensity: 0.36,
    rimColor: 0x5c8bab, rimIntensity: 0.36,
    oceanDeep: 0x01070e, oceanShallow: 0x0b2130, oceanFoam: 0x627b8a, oceanSubsurface: 0x0b2834,
    lightning: false,
  },
};

/**
 * Pure mapping of a weather kind to its full visual parameter set. The five
 * kinds are intentionally distinct (sky, fog, sun and ocean palettes all
 * differ) so each environment is recognisable at a glance.
 */
export function deriveWeatherVisuals(kind: WeatherKind): WeatherVisual {
  return WEATHER_VISUALS[kind];
}

// ---------------------------------------------------------------------------
// Storm lightning (deterministic, visual-only)
// ---------------------------------------------------------------------------

const LIGHTNING_PERIOD = 9.0; // seconds per candidate cycle
const FLASH_DURATION = 0.10; // bright flash
const AFTERGLOW_DURATION = 0.55; // dim afterglow before returning to dark

/** Deterministic [0,1] hash so each cycle's jitter is reproducible. */
function cycleHash(cycle: number): number {
  const v = Math.sin(cycle * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Deterministic storm lightning intensity for a given time, producing the
 * required `dark → flash → afterglow → dark` rhythm. No engine RNG is used;
 * identical `simTime` always yields identical output, so the sequence is
 * reproducible and unit-testable.
 */
export function stormLightningIntensity(simTime: number): number {
  if (simTime < 0) return 0;
  const cycle = Math.floor(simTime / LIGHTNING_PERIOD);
  const jitter = cycleHash(cycle);
  // Some cycles stay dark (no flash) for a calmer, less twitchy sky.
  if (jitter > 0.72) return 0;
  const t = simTime - cycle * LIGHTNING_PERIOD;
  const flashStart = 0.4 + jitter * 1.6;
  if (t < flashStart) return 0;
  const ft = t - flashStart;
  if (ft < FLASH_DURATION) {
    // Quick rise to peak then partial decay within the flash window.
    const p = ft / FLASH_DURATION;
    return 0.4 + 0.6 * Math.sin(p * Math.PI);
  }
  const at = ft - FLASH_DURATION;
  if (at < AFTERGLOW_DURATION) {
    // Afterglow decays smoothly back to dark.
    const p = at / AFTERGLOW_DURATION;
    return 0.25 * (1 - p);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Underwater depth visuals (continuous 0m → abyss)
// ---------------------------------------------------------------------------

export interface UnderwaterVisual {
  depthM: number;
  /** Scene fog colour seen in the water volume. */
  fogColor: number;
  /** Scene fog density (higher = lower visibility). */
  fogDensity: number;
  /** Colour used to tint the ocean surface from below. */
  waterTint: number;
  /** Fraction of top-side light that survives to this depth (1 = surface). */
  lightAttenuation: number;
  /** Caustic light intensity — present only in shallow water, 0 by 20m. */
  causticsIntensity: number;
  /** Suspended particle activity factor [0,1] for the renderer. */
  particleFactor: number;
  /** Resolved particle count after quality scaling. */
  particleCount: number;
  /** Apparent visibility in km. */
  visibilityKm: number;
  /** Red channel absorption factor [0,1] (deep water reads bluer). */
  redAbsorption: number;
}

export interface UnderwaterQuality {
  underwaterParticles: number;
  underwaterCaustics: number;
}

/**
 * Continuous depth → underwater visual mapping. Built entirely from smoothstep
 * blends between depth bands (0–20 / 20–80 / 80–150 / 150m+), so there is no
 * hard cut at any threshold: 19.9m, 20m and 20.1m read as a smooth gradient,
 * never a sudden colour change. Caustics fade to exactly 0 by 20m so deep
 * water never shows shallow-water light patterns.
 */
export function deriveUnderwaterVisuals(depthM: number, quality: UnderwaterQuality): UnderwaterVisual {
  const d = Math.max(0, depthM);

  // --- Fog colour: cold blue → deep blue → near-black ---
  let fogColor = lerpHex(0x1b4a63, 0x0c2c44, smoothstep(0, 20, d));
  fogColor = lerpHex(fogColor, 0x06121f, smoothstep(20, 80, d));
  fogColor = lerpHex(fogColor, 0x02060c, smoothstep(80, 150, d));
  fogColor = lerpHex(fogColor, 0x01040a, smoothstep(150, 200, d));

  // --- Water surface tint (from below) ---
  let waterTint = lerpHex(0x103a52, 0x0a2236, smoothstep(0, 20, d));
  waterTint = lerpHex(waterTint, 0x04101c, smoothstep(20, 80, d));
  waterTint = lerpHex(waterTint, 0x02080f, smoothstep(80, 150, d));
  waterTint = lerpHex(waterTint, 0x01040a, smoothstep(150, 200, d));

  // --- Fog density (visibility falls with depth) ---
  let fogDensity = lerp(0.02, 0.07, smoothstep(0, 20, d));
  fogDensity = lerp(fogDensity, 0.13, smoothstep(20, 80, d));
  fogDensity = lerp(fogDensity, 0.20, smoothstep(80, 150, d));
  fogDensity = lerp(fogDensity, 0.28, smoothstep(150, 200, d));

  // --- Top-side light survival ---
  let lightAttenuation = lerp(1.0, 0.82, smoothstep(0, 20, d));
  lightAttenuation = lerp(lightAttenuation, 0.45, smoothstep(20, 80, d));
  lightAttenuation = lerp(lightAttenuation, 0.18, smoothstep(80, 150, d));
  lightAttenuation = lerp(lightAttenuation, 0.06, smoothstep(150, 200, d));

  // --- Caustics: only shallow water, exactly 0 by 20m ---
  const causticsIntensity = (1 - smoothstep(0, 20, d)) * quality.underwaterCaustics;

  // --- Suspended particles: ramp in, sparse in the abyss ---
  let particleFactor = smoothstep(0, 12, d) * (1 - smoothstep(140, 200, d));
  // Keep a small floor so the water never looks perfectly empty mid-depth.
  particleFactor = Math.max(particleFactor, smoothstep(0, 20, d) * 0.25);

  const particleCount = Math.max(0, Math.round(quality.underwaterParticles * particleFactor));

  const visibilityKm = lerp(12, 1.5, smoothstep(0, 150, d));
  const redAbsorption = smoothstep(20, 150, d);

  return {
    depthM: d,
    fogColor,
    fogDensity,
    waterTint,
    lightAttenuation,
    causticsIntensity,
    particleFactor,
    particleCount,
    visibilityKm,
    redAbsorption,
  };
}

/** Whether a depth should be rendered as an underwater (sub-surface) view. */
export function isUnderwaterDepth(depthM: number): boolean {
  return depthM > 0.001;
}
