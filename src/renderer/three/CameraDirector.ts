/**
 * SILENT DEPTH V2.5 — Camera Director (pure, presentation-only)
 *
 * Selects a cinematic camera preset from the RenderState and resolves the
 * per-preset framing parameters used by CameraManager. No gameplay state is
 * read or written; every decision is a pure function of already-presented data
 * (periscope state, depth, speed, and an optional manual override).
 *
 * Presets:
 *   tactical    — top-down orthographic map (manual override only)
 *   cinematic   — default low three-quarter gameplay framing
 *   chase       — higher, wider follow for high-speed running
 *   surface     — near-waterline framing close to the surface
 *   underwater  — true submerged follow, camera kept below the surface
 *   periscope   — first-person optics (drive by simulation-owned periscope state)
 */

import type { CameraMode } from '../types';

/** Inputs the director needs. Kept minimal so the selector stays unit-testable. */
export interface CameraSelectionInput {
  /** True when the simulation-owned periscope is RAISED or OBSERVING. */
  periscopeRaised: boolean;
  /** Player depth in metres (negative-down; 0 = surface). */
  depthM: number;
  /** Player speed in knots. */
  speedKt: number;
  /** Manual override (e.g. the player toggled the tactical map). Null = auto. */
  override: CameraMode | null;
}

export interface PresetParams {
  /** Horizontal follow distance behind the hull (km). */
  distance: number;
  /** Camera height above (or, underwater, below) the hull (km). */
  height: number;
  /** Lateral offset so the camera sits off the quarter, not dead-astem. */
  sideOffset: number;
  /** How far ahead of the sail the camera aims (keeps the sub low in frame). */
  lookAhead: number;
  /** Vertical aim bias above the hull to push the subject into the lower third. */
  lookUpBias: number;
  /** Field of view for the world perspective camera. */
  fov: number;
  /** True when the camera must be positioned below the sea surface. */
  underwater: boolean;
  /** Position smoothing rate (higher = snappier). */
  smoothing: number;
}

/** FOV per preset (used directly by the renderer camera). */
export const PRESET_FOV: Record<CameraMode, number> = {
  tactical: 50,
  cinematic: 50,
  chase: 62,
  surface: 56,
  underwater: 64,
  periscope: 38,
};

/** Framing parameters for the four world-family presets. */
export const PRESET_PARAMS: Record<'cinematic' | 'chase' | 'surface' | 'underwater', PresetParams> = {
  cinematic: {
    distance: 0.20, height: 0.085, sideOffset: 0.10, lookAhead: 0.06,
    lookUpBias: 0.020, fov: PRESET_FOV.cinematic, underwater: false, smoothing: 4,
  },
  chase: {
    distance: 0.30, height: 0.105, sideOffset: 0.16, lookAhead: 0.11,
    lookUpBias: 0.018, fov: PRESET_FOV.chase, underwater: false, smoothing: 6,
  },
  surface: {
    distance: 0.16, height: 0.045, sideOffset: 0.06, lookAhead: 0.05,
    lookUpBias: 0.012, fov: PRESET_FOV.surface, underwater: false, smoothing: 5,
  },
  underwater: {
    distance: 0.13, height: 0.012, sideOffset: 0.05, lookAhead: 0.05,
    lookUpBias: 0.010, fov: PRESET_FOV.underwater, underwater: true, smoothing: 5,
  },
};

/** Depth (m) thresholds for the surface / underwater presets. */
export const SURFACE_DEPTH_M = 12;
export const DEEP_DEPTH_M = 80;
/** Speed (kt) above which the chase preset is preferred. */
export const CHASE_SPEED_KT = 8;

/** A preset that is rendered by the world perspective camera. */
export function isWorldFamily(mode: CameraMode): boolean {
  return mode === 'cinematic' || mode === 'chase' || mode === 'surface' || mode === 'underwater';
}

/**
 * Pure preset selection. Deterministic: identical input always yields the same
 * preset. Priority is override → periscope → depth → speed → default cinematic.
 */
export function selectCameraPreset(input: CameraSelectionInput): CameraMode {
  if (input.override !== null) return input.override;
  if (input.periscopeRaised) return 'periscope';
  if (input.depthM >= DEEP_DEPTH_M) return 'underwater';
  if (input.depthM <= SURFACE_DEPTH_M) return 'surface';
  if (input.speedKt >= CHASE_SPEED_KT) return 'chase';
  return 'cinematic';
}

/**
 * Resolve the framing parameters for a preset (world-family only).
 */
export function resolvePresetParams(mode: CameraMode): PresetParams {
  switch (mode) {
    case 'chase': return PRESET_PARAMS.chase;
    case 'surface': return PRESET_PARAMS.surface;
    case 'underwater': return PRESET_PARAMS.underwater;
    case 'cinematic':
    default:
      return PRESET_PARAMS.cinematic;
  }
}

// ---------------------------------------------------------------------------
// V2.7 — M03 Convoy Composition (pure function)
// ---------------------------------------------------------------------------

/** A minimal ship view the convoy framing function needs. */
export interface ConvoyShipView {
  id: string;
  visible: boolean;
  position: { x: number; z: number };
  headingDeg: number;
}

/** Framing hint returned by resolveConvoyFraming. */
export interface ConvoyFramingHint {
  /** Position to frame toward (km, engine coords). */
  targetX: number;
  targetZ: number;
  /** Additional distance scale (1 = default preset distance, >1 = further). */
  distanceScale: number;
  /** FOV adjustment in degrees (added to preset FOV). */
  fovAdjust: number;
}

/**
 * M03 convoy composition: given visible ships, suggest a framing target that
 * creates a cinematic layered composition (player → escort → merchants).
 *
 * Pure function — no DOM, no Three.js, no gameplay mutation.
 * Only consumes visible ships; hidden ships are ignored.
 * Returns null when no visible ships exist (safe fallback).
 */
export function resolveConvoyFraming(
  playerX: number,
  playerZ: number,
  playerHeadingDeg: number,
  visibleShips: readonly ConvoyShipView[],
): ConvoyFramingHint | null {
  const visible = visibleShips.filter((s) => s.visible);
  if (visible.length === 0) return null;

  // Find the nearest visible ship to the player
  let bestDist = Infinity;
  let bestShip: ConvoyShipView | null = null;
  for (const ship of visible) {
    const dx = ship.position.x - playerX;
    const dz = ship.position.z - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestShip = ship;
    }
  }

  if (bestShip === null) return null;

  // Frame toward the nearest visible ship, slightly offset to show
  // the convoy line when multiple ships are present

  // If multiple ships, offset the framing point to show the line
  let targetX = bestShip.position.x;
  let targetZ = bestShip.position.z;
  if (visible.length >= 2) {
    // Average position of all visible ships, biased toward the nearest
    let sumX = bestShip.position.x * 2;
    let sumZ = bestShip.position.z * 2;
    let weight = 2;
    for (const ship of visible) {
      if (ship.id === bestShip.id) continue;
      sumX += ship.position.x;
      sumZ += ship.position.z;
      weight += 1;
    }
    targetX = sumX / weight;
    targetZ = sumZ / weight;
  }

  // Distance scale: closer ships → pull back slightly to show context
  const distanceScale = bestDist < 1.5 ? 1.2 : bestDist < 3 ? 1.0 : 0.9;

  // FOV: widen slightly when ships are spread, narrow when close
  const fovAdjust = visible.length >= 3 ? 4 : visible.length >= 2 ? 2 : 0;

  return { targetX, targetZ, distanceScale, fovAdjust };
}
