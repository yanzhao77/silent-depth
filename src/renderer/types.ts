/**
 * SILENT DEPTH V2.0 — RenderState type definitions (src/renderer/types.ts)
 *
 * The RenderState is the ONE-WAY bridge between the deterministic simulation
 * engine (GameSnapshot) and the Three.js presentation layer. The renderer
 * reads RenderState ONLY and NEVER writes back to engine state.
 *
 * Coordinate system:
 *   Engine: x=east (km), y=north (km), depth positive-down (metres)
 *   Three.js: x=right, y=up, z=toward-camera
 *   Mapping: engineX → threeX, engineY → -threeZ, depth → -threeY
 *
 * @pure — zero DOM / browser-API / Three.js references.
 */

import type {
  AiState,
  ContactState,
  ContactType,
  DepthLayer,
  GameState,
  PeriscopePublicState,
  ShipClass,
  TorpedoState,
  WeatherKind,
} from '../core/types';
import type { WeatherVisual } from './weather';

// ---------------------------------------------------------------------------
// Vector types (plain objects — no Three.js dependency)
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Effect types (visual-only, triggered by engine events)
// ---------------------------------------------------------------------------

export type EffectType =
  | 'sonarPing'
  | 'torpedoWake'
  | 'explosion'
  | 'waterSplash'
  | 'depthCharge'
  | 'shipWake'
  | 'bubbleTrail';

export interface RenderEffect {
  type: EffectType;
  position: Vec3;
  age: number;
  maxAge: number;
  params: Record<string, number>;
  /** Stable id for pool management. */
  id: string;
}

// ---------------------------------------------------------------------------
// Render sub-states
// ---------------------------------------------------------------------------

export interface RenderPlayer {
  position: Vec3;
  headingDeg: number;
  speedKt: number;
  depthLayer: DepthLayer;
  depthM: number;
  pitchDeg: number;
  rollDeg: number;
  hull: number;
  battery: number;
  noise: number;
  detection: number;
  periscopeState: PeriscopePublicState;
}

export interface RenderShip {
  id: string;
  shipClass: ShipClass;
  position: Vec3;
  headingDeg: number;
  speedKt: number;
  aiState: AiState;
  visible: boolean;
  variant: string;
  hull: number;
}

export interface RenderContact {
  id: string;
  state: ContactState;
  estimatedPosition: Vec3;
  uncertaintyRxKm: number;
  uncertaintyRyKm: number;
  uncertaintyRotationDeg: number;
  classification: ContactType;
  confidence: number;
  selected: boolean;
  bearingDeg: number;
  rangeKm: number | null;
}

export interface RenderTorpedo {
  id: string;
  position: Vec3;
  headingDeg: number;
  state: TorpedoState;
  speedKt: number;
}

export interface RenderDecoy {
  id: string;
  position: Vec3;
}

export interface RenderWeather {
  kind: WeatherKind;
  visibilityKm: number;
  waveHeight: number;
  windSpeed: number;
  fogDensity: number;
  isNight: boolean;
  cloudCover: number;
  /** Full derived visual parameter set (V2.6). Pure, deterministic. */
  visual: WeatherVisual;
}

export interface RenderMission {
  id: string;
  name: string;
  phase: string;
  timer: number;
  parTimeS: number;
}

// ---------------------------------------------------------------------------
// Camera state (for smooth transitions)
// ---------------------------------------------------------------------------

/**
 * Cinematic camera presets (V2.5). Three physical cameras back these:
 * periscope → periscopeCamera, tactical → orthographic map, all others → the
 * world perspective camera configured with per-preset parameters.
 */
export type CameraMode =
  | 'tactical'
  | 'cinematic'
  | 'chase'
  | 'surface'
  | 'underwater'
  | 'periscope';

export interface RenderCamera {
  mode: CameraMode;
  position: Vec3;
  target: Vec3;
  fov: number;
  /** 0..1 transition progress between modes. */
  transitionProgress: number;
}

// ---------------------------------------------------------------------------
// Top-level RenderState
// ---------------------------------------------------------------------------

export interface RenderState {
  simTime: number;
  gameState: GameState;
  player: RenderPlayer;
  ships: RenderShip[];
  contacts: RenderContact[];
  torpedoes: RenderTorpedo[];
  decoys: RenderDecoy[];
  weather: RenderWeather;
  effects: RenderEffect[];
  mission: RenderMission;
  camera: RenderCamera;
  /** Wall-clock seconds for visual animations (NOT engine time). */
  wallTime: number;
}
