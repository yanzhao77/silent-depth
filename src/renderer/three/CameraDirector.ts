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

/** Resolve the framing parameters for a preset (world-family only). */
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
