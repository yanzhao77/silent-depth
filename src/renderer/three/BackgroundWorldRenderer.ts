/**
 * SILENT DEPTH V2.7 — Background World Renderer
 *
 * Pure-visual distant naval environment: silhouettes, smoke columns, floating
 * debris, rain curtains, and atmospheric haze. All objects are visual-only —
 * they never enter RenderShip[], contacts, TacticalOverlay, sonar, fire
 * control, targeting, collision, combat, or scoring.
 *
 * Architecture:
 *   resolveBackgroundWorldState() — pure, deterministic layout function
 *   BackgroundWorldRenderer — stateful Three.js manager consuming that state
 *
 * All randomness uses createVisualRng (presentation seed) — never engine RNG.
 *
 * @pure resolveBackgroundWorldState — zero DOM / Three.js references
 */

import * as THREE from 'three';
import { createVisualRng } from '../visualRng';
import type { WeatherVisual } from '../weather';
import type { QualitySettings } from './QualityPresets';

// ---------------------------------------------------------------------------
// Background world configuration (data-driven per mission)
// ---------------------------------------------------------------------------

export interface BackgroundWorldProfile {
  /** Mission identifier. */
  missionId: string;
  /** Maximum distant silhouettes (0 = none). */
  maxSilhouettes: number;
  /** Maximum smoke columns on the horizon. */
  maxSmokeColumns: number;
  /** Maximum floating debris patches. */
  maxDebris: number;
  /** Maximum rain curtain elements (Storm only). */
  maxRainCurtains: number;
  /** Probability [0,1] of distant aircraft silhouette per frame. */
  aircraftChance: number;
  /** Probability [0,1] of seabird flock per frame. */
  seabirdChance: number;
  /** Maximum visible distance (km) for background objects. */
  maxVisibleDistanceKm: number;
  /** Maximum visible distance multiplier for Fog/Night. */
  fogNightDistanceMultiplier: number;
}

/** Pre-configured profiles keyed by mission id. */
const PROFILES: Record<string, BackgroundWorldProfile> = {
  M01: {
    missionId: 'M01',
    maxSilhouettes: 3,
    maxSmokeColumns: 1,
    maxDebris: 2,
    maxRainCurtains: 0,
    aircraftChance: 0.002,
    seabirdChance: 0.005,
    maxVisibleDistanceKm: 18,
    fogNightDistanceMultiplier: 0.4,
  },
  M02: {
    missionId: 'M02',
    maxSilhouettes: 4,
    maxSmokeColumns: 2,
    maxDebris: 3,
    maxRainCurtains: 0,
    aircraftChance: 0.003,
    seabirdChance: 0.004,
    maxVisibleDistanceKm: 20,
    fogNightDistanceMultiplier: 0.4,
  },
  M03: {
    missionId: 'M03',
    maxSilhouettes: 5,
    maxSmokeColumns: 3,
    maxDebris: 4,
    maxRainCurtains: 2,
    aircraftChance: 0.004,
    seabirdChance: 0.003,
    maxVisibleDistanceKm: 22,
    fogNightDistanceMultiplier: 0.35,
  },
  M04: {
    missionId: 'M04',
    maxSilhouettes: 3,
    maxSmokeColumns: 2,
    maxDebris: 3,
    maxRainCurtains: 4,
    aircraftChance: 0.001,
    seabirdChance: 0.001,
    maxVisibleDistanceKm: 15,
    fogNightDistanceMultiplier: 0.3,
  },
  M05: {
    missionId: 'M05',
    maxSilhouettes: 2,
    maxSmokeColumns: 1,
    maxDebris: 2,
    maxRainCurtains: 1,
    aircraftChance: 0.001,
    seabirdChance: 0.002,
    maxVisibleDistanceKm: 12,
    fogNightDistanceMultiplier: 0.25,
  },
};

/** Fallback profile for unknown missions. */
const DEFAULT_PROFILE: BackgroundWorldProfile = {
  missionId: 'default',
  maxSilhouettes: 3,
  maxSmokeColumns: 1,
  maxDebris: 2,
  maxRainCurtains: 0,
  aircraftChance: 0.002,
  seabirdChance: 0.003,
  maxVisibleDistanceKm: 16,
  fogNightDistanceMultiplier: 0.4,
};

export function getBackgroundProfile(missionId: string): BackgroundWorldProfile {
  return PROFILES[missionId] ?? { ...DEFAULT_PROFILE, missionId };
}

// ---------------------------------------------------------------------------
// Budget scaling by quality level
// ---------------------------------------------------------------------------

/** Quality-scaled budget multiplier [0..1]. */
function qualityBudgetFactor(quality: QualitySettings): number {
  const bb = quality.backgroundBudget;
  if (bb <= 0) return 0.0;   // LOW: no background
  if (bb <= 4) return 0.5;   // MEDIUM
  if (bb <= 7) return 0.8;   // HIGH
  return 1.0;                // ULTRA
}

export interface BackgroundBudget {
  silhouettes: number;
  smokeColumns: number;
  debris: number;
  rainCurtains: number;
  aircraft: boolean;
  seabirds: boolean;
  /** Fog/night distance multiplier applied. */
  distanceMultiplier: number;
}

export function resolveBackgroundBudget(
  profile: BackgroundWorldProfile,
  quality: QualitySettings,
  weatherKind: string,
): BackgroundBudget {
  const f = qualityBudgetFactor(quality);
  const isFog = weatherKind === 'Fog';
  const isNight = weatherKind === 'Night';
  const distMult = (isFog || isNight)
    ? profile.fogNightDistanceMultiplier
    : 1.0;

  return {
    silhouettes: Math.floor(profile.maxSilhouettes * f),
    smokeColumns: Math.floor(profile.maxSmokeColumns * f),
    debris: Math.floor(profile.maxDebris * f),
    rainCurtains: weatherKind === 'Storm'
      ? Math.floor(profile.maxRainCurtains * f)
      : 0,
    aircraft: f > 0.5 && quality.backgroundBudget >= 4,
    seabirds: f > 0.0 && quality.backgroundBudget >= 1,
    distanceMultiplier: distMult,
  };
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

/** Classifies a background object. Never overlaps with gameplay entities. */
export type BackgroundObjectClass =
  | 'silhouette'
  | 'smokeColumn'
  | 'debris'
  | 'rainCurtain'
  | 'aircraft'
  | 'seabird';

/** A single background object in world space. All positions in km (Three.js units). */
export interface BackgroundObject {
  class: BackgroundObjectClass;
  /** Visual-only flag — always true. */
  visualOnly: true;
  position: { x: number; y: number; z: number };
  /** Heading in degrees (for silhouettes, aircraft). */
  headingDeg: number;
  /** Scale multiplier (1 = default). */
  scale: number;
  /** Base opacity [0,1]. */
  opacity: number;
  /** Tint colour (0xRRGGBB). */
  tint: number;
}

/** Complete background world state — consumed by BackgroundWorldRenderer. */
export interface BackgroundWorldState {
  profile: BackgroundWorldProfile;
  budget: BackgroundBudget;
  objects: readonly BackgroundObject[];
  /** Whether the player is underwater (suppresses surface objects). */
  underwater: boolean;
}

// ---------------------------------------------------------------------------
// Pure layout function
// ---------------------------------------------------------------------------

/**
 * Deterministic layout of background objects. Same seed + same inputs → same
 * output. The visual RNG must be seeded from a presentation seed, never the
 * engine seed.
 */
export function resolveBackgroundWorldState(opts: {
  missionId: string;
  visualSeed: number;
  cameraX: number;
  cameraZ: number;
  wallTime: number;
  weatherKind: string;
  weatherVisual: WeatherVisual;
  quality: QualitySettings;
  underwater: boolean;
}): BackgroundWorldState {
  const { missionId, visualSeed, cameraX, cameraZ, weatherKind, quality, underwater } = opts;
  const profile = getBackgroundProfile(missionId);
  const budget = resolveBackgroundBudget(profile, quality, weatherKind);

  if (underwater || budget.silhouettes + budget.smokeColumns + budget.debris + budget.rainCurtains === 0) {
    return { profile, budget, objects: [], underwater };
  }

  const rng = createVisualRng(visualSeed);
  const objects: BackgroundObject[] = [];
  const maxDist = profile.maxVisibleDistanceKm * budget.distanceMultiplier;

  // --- Distant silhouettes (ship-shaped boxes on the horizon) ---
  for (let i = 0; i < budget.silhouettes; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(maxDist * 0.4, maxDist);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;
    const heading = rng.range(0, 360);
    const scale = rng.range(0.6, 1.4);
    const brightness = weatherKind === 'Night' ? rng.range(0.08, 0.18) : rng.range(0.15, 0.35);
    const tint = lerpColor(0x222233, 0x556677, brightness);

    objects.push({
      class: 'silhouette',
      visualOnly: true,
      position: { x, y: 0, z },
      headingDeg: heading,
      scale,
      opacity: rng.range(0.25, 0.55),
      tint,
    });
  }

  // --- Smoke columns (vertical particle streaks near horizon) ---
  for (let i = 0; i < budget.smokeColumns; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(maxDist * 0.3, maxDist * 0.8);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;
    const height = rng.range(0.03, 0.08);
    const tint = weatherKind === 'Storm' ? 0x3a3a4a : 0x4a4a5a;

    objects.push({
      class: 'smokeColumn',
      visualOnly: true,
      position: { x, y: height * 0.5, z },
      headingDeg: 0,
      scale: height,
      opacity: rng.range(0.15, 0.35),
      tint,
    });
  }

  // --- Floating debris (small boxes on the surface) ---
  for (let i = 0; i < budget.debris; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(0.5, maxDist * 0.5);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;
    const heading = rng.range(0, 360);
    const scale = rng.range(0.3, 0.8);
    const tint = weatherKind === 'Night' ? 0x1a1a2a : 0x3a3a4a;

    objects.push({
      class: 'debris',
      visualOnly: true,
      position: { x, y: -0.001, z },
      headingDeg: heading,
      scale,
      opacity: rng.range(0.15, 0.30),
      tint,
    });
  }

  // --- Rain curtains (Storm only, vertical transparent planes) ---
  for (let i = 0; i < budget.rainCurtains; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(1.0, maxDist * 0.6);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;
    const height = rng.range(0.04, 0.10);
    const scale = rng.range(0.5, 1.5);

    objects.push({
      class: 'rainCurtain',
      visualOnly: true,
      position: { x, y: height * 0.5, z },
      headingDeg: rng.range(0, 360),
      scale,
      opacity: rng.range(0.06, 0.15),
      tint: 0x556677,
    });
  }

  // --- Distant aircraft (tiny silhouette high above) ---
  if (budget.aircraft && rng.next() < profile.aircraftChance * 60) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(maxDist * 0.5, maxDist);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;

    objects.push({
      class: 'aircraft',
      visualOnly: true,
      position: { x, y: rng.range(0.8, 1.2), z },
      headingDeg: rng.range(0, 360),
      scale: rng.range(0.15, 0.35),
      opacity: weatherKind === 'Night' ? 0.12 : 0.20,
      tint: 0x334455,
    });
  }

  // --- Seabirds (small flocks near the surface) ---
  if (budget.seabirds && rng.next() < profile.seabirdChance * 60) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(0.3, maxDist * 0.3);
    const x = cameraX + Math.cos(angle) * dist;
    const z = cameraZ - Math.sin(angle) * dist;

    objects.push({
      class: 'seabird',
      visualOnly: true,
      position: { x, y: rng.range(0.01, 0.04), z },
      headingDeg: rng.range(0, 360),
      scale: rng.range(0.08, 0.18),
      opacity: weatherKind === 'Night' ? 0.10 : 0.22,
      tint: 0x444455,
    });
  }

  return { profile, budget, objects, underwater };
}

// ---------------------------------------------------------------------------
// Three.js renderer
// ---------------------------------------------------------------------------

/** Pooled instance of a background silhouette. */
interface SilhouetteInstance {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
}

/** Pooled smoke column instance. */
interface SmokeColumnInstance {
  points: THREE.Points;
  targetPos: THREE.Vector3;
}

/** Pooled debris instance. */
interface DebrisInstance {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
}

/** Pooled rain curtain instance. */
interface RainCurtainInstance {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
}

/** Pooled aircraft instance. */
interface AircraftInstance {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
}

/** Pooled seabird instance. */
interface SeabirdInstance {
  points: THREE.Points;
  targetPos: THREE.Vector3;
}

const HULL_GEOMETRY = new THREE.BoxGeometry(0.012, 0.003, 0.004);
const DEBRIS_GEOMETRY = new THREE.BoxGeometry(0.0008, 0.0004, 0.0005);
const RAIN_CURTAIN_GEOMETRY = new THREE.PlaneGeometry(0.04, 0.08);
const AIRCRAFT_GEOMETRY = new THREE.BoxGeometry(0.003, 0.0003, 0.001);

function makeSilhouetteMaterial(tint: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
  });
}

function makeSmokePointsMaterial(tint: number, opacity: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color: tint,
    transparent: true,
    opacity,
    size: 0.004,
    depthWrite: false,
    fog: true,
    sizeAttenuation: true,
  });
}

function makeDebrisMaterial(tint: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
  });
}

function makeRainCurtainMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x8899aa,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
}

function makeAircraftMaterial(tint: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: true,
  });
}

const SEABIRD_GEOMETRY = new THREE.BufferGeometry();
const SEABIRD_POSITIONS = new Float32Array([
  -0.0003, 0, 0,
  0.0003, 0, 0,
  0, 0, 0.0001,
  0, 0, -0.0001,
]);
SEABIRD_GEOMETRY.setAttribute('position', new THREE.BufferAttribute(SEABIRD_POSITIONS, 3));

function makeSeabirdMaterial(tint: number, opacity: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color: tint,
    transparent: true,
    opacity,
    size: 0.0008,
    depthWrite: false,
    fog: true,
    sizeAttenuation: true,
  });
}

/** Maximum pooled instances per class (prevents runaway allocation). */
const MAX_POOL = {
  silhouette: 8,
  smokeColumn: 6,
  debris: 8,
  rainCurtain: 6,
  aircraft: 2,
  seabird: 3,
} as const;

export class BackgroundWorldRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _silhouettes: SilhouetteInstance[] = [];
  private readonly _smokeColumns: SmokeColumnInstance[] = [];
  private readonly _debris: DebrisInstance[] = [];
  private readonly _rainCurtains: RainCurtainInstance[] = [];
  private readonly _aircraft: AircraftInstance[] = [];
  private readonly _seabirds: SeabirdInstance[] = [];
  private readonly _allGroups: THREE.Object3D[];
  private _disposed = false;

  constructor(scene: THREE.Scene) {
    this._scene = scene;

    // Container group for easy hide/show
    const group = new THREE.Group();
    group.name = 'backgroundWorld';
    scene.add(group);
    this._allGroups = [group];

    // Pre-allocate pools
    for (let i = 0; i < MAX_POOL.silhouette; i++) {
      const mesh = new THREE.Mesh(HULL_GEOMETRY, makeSilhouetteMaterial(0x334455, 0.3));
      mesh.visible = false;
      mesh.userData.visualOnly = true;
      group.add(mesh);
      this._silhouettes.push({ mesh, targetPos: new THREE.Vector3() });
    }
    for (let i = 0; i < MAX_POOL.smokeColumn; i++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(18); // 6 particles × 3
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const points = new THREE.Points(geo, makeSmokePointsMaterial(0x4a4a5a, 0.25));
      points.visible = false;
      points.userData.visualOnly = true;
      group.add(points);
      this._smokeColumns.push({ points, targetPos: new THREE.Vector3() });
    }
    for (let i = 0; i < MAX_POOL.debris; i++) {
      const mesh = new THREE.Mesh(DEBRIS_GEOMETRY, makeDebrisMaterial(0x3a3a4a, 0.2));
      mesh.visible = false;
      mesh.userData.visualOnly = true;
      group.add(mesh);
      this._debris.push({ mesh, targetPos: new THREE.Vector3() });
    }
    for (let i = 0; i < MAX_POOL.rainCurtain; i++) {
      const mesh = new THREE.Mesh(RAIN_CURTAIN_GEOMETRY, makeRainCurtainMaterial(0.10));
      mesh.visible = false;
      mesh.userData.visualOnly = true;
      group.add(mesh);
      this._rainCurtains.push({ mesh, targetPos: new THREE.Vector3() });
    }
    for (let i = 0; i < MAX_POOL.aircraft; i++) {
      const mesh = new THREE.Mesh(AIRCRAFT_GEOMETRY, makeAircraftMaterial(0x334455, 0.2));
      mesh.visible = false;
      mesh.userData.visualOnly = true;
      mesh.position.y = 1.0; // high altitude
      group.add(mesh);
      this._aircraft.push({ mesh, targetPos: new THREE.Vector3() });
    }
    for (let i = 0; i < MAX_POOL.seabird; i++) {
      const points = new THREE.Points(SEABIRD_GEOMETRY.clone(), makeSeabirdMaterial(0x444455, 0.2));
      points.visible = false;
      points.userData.visualOnly = true;
      group.add(points);
      this._seabirds.push({ points, targetPos: new THREE.Vector3() });
    }
  }

  /** Update all background objects from the resolved state. */
  update(state: BackgroundWorldState, wallTime: number): void {
    if (this._disposed) return;

    // Classify objects by type
    const byClass = new Map<BackgroundObjectClass, BackgroundObject[]>();
    for (const obj of state.objects) {
      let arr = byClass.get(obj.class);
      if (!arr) {
        arr = [];
        byClass.set(obj.class, arr);
      }
      arr.push(obj);
    }

    // Update silhouettes
    this._updateSilhouettes(byClass.get('silhouette') ?? [], wallTime);
    // Update smoke columns
    this._updateSmokeColumns(byClass.get('smokeColumn') ?? [], wallTime);
    // Update debris
    this._updateDebris(byClass.get('debris') ?? [], wallTime);
    // Update rain curtains
    this._updateRainCurtains(byClass.get('rainCurtain') ?? [], wallTime);
    // Update aircraft
    this._updateAircraft(byClass.get('aircraft') ?? [], wallTime);
    // Update seabirds
    this._updateSeabirds(byClass.get('seabird') ?? [], wallTime);
  }

  private _updateSilhouettes(objs: readonly BackgroundObject[], _wallTime: number): void {
    for (let i = 0; i < this._silhouettes.length; i++) {
      const inst = this._silhouettes[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.mesh.visible = false;
        continue;
      }
      inst.mesh.visible = true;
      inst.targetPos.set(obj.position.x, obj.position.y, obj.position.z);
      inst.mesh.position.lerp(inst.targetPos, 0.1);
      inst.mesh.rotation.y = -obj.headingDeg * (Math.PI / 180);
      inst.mesh.scale.setScalar(obj.scale);
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(obj.tint);
      mat.opacity = obj.opacity;
    }
  }

  private _updateSmokeColumns(objs: readonly BackgroundObject[], wallTime: number): void {
    for (let i = 0; i < this._smokeColumns.length; i++) {
      const inst = this._smokeColumns[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.points.visible = false;
        continue;
      }
      inst.points.visible = true;
      inst.targetPos.set(obj.position.x, obj.position.y, obj.position.z);
      inst.points.position.lerp(inst.targetPos, 0.1);
      // Animate smoke particles upward with slight drift
      const positions = inst.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let p = 0; p < positions.count; p++) {
        const seed = p * 7.13 + i * 31.7;
        const t = (wallTime * 0.02 + seed) % 1;
        positions.setX(p, obj.position.x + Math.sin(seed + wallTime * 0.1) * 0.002);
        positions.setY(p, obj.position.y + t * obj.scale);
        positions.setZ(p, obj.position.z + Math.cos(seed + wallTime * 0.08) * 0.001);
      }
      positions.needsUpdate = true;
      const mat = inst.points.material as THREE.PointsMaterial;
      mat.color.setHex(obj.tint);
      mat.opacity = obj.opacity;
    }
  }

  private _updateDebris(objs: readonly BackgroundObject[], wallTime: number): void {
    for (let i = 0; i < this._debris.length; i++) {
      const inst = this._debris[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.mesh.visible = false;
        continue;
      }
      inst.mesh.visible = true;
      inst.targetPos.set(obj.position.x, obj.position.y, obj.position.z);
      inst.mesh.position.lerp(inst.targetPos, 0.1);
      inst.mesh.rotation.y = -obj.headingDeg * (Math.PI / 180) + wallTime * 0.02;
      inst.mesh.rotation.x = Math.sin(wallTime * 0.3 + i * 2.1) * 0.05;
      inst.mesh.scale.setScalar(obj.scale);
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(obj.tint);
      mat.opacity = obj.opacity;
    }
  }

  private _updateRainCurtains(objs: readonly BackgroundObject[], wallTime: number): void {
    for (let i = 0; i < this._rainCurtains.length; i++) {
      const inst = this._rainCurtains[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.mesh.visible = false;
        continue;
      }
      inst.mesh.visible = true;
      inst.targetPos.set(obj.position.x, obj.position.y, obj.position.z);
      inst.mesh.position.lerp(inst.targetPos, 0.1);
      inst.mesh.rotation.y = -obj.headingDeg * (Math.PI / 180);
      inst.mesh.scale.set(obj.scale, obj.scale * 1.5, 1);
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = obj.opacity * (0.8 + Math.sin(wallTime * 0.5 + i * 1.7) * 0.2);
    }
  }

  private _updateAircraft(objs: readonly BackgroundObject[], wallTime: number): void {
    for (let i = 0; i < this._aircraft.length; i++) {
      const inst = this._aircraft[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.mesh.visible = false;
        continue;
      }
      inst.mesh.visible = true;
      // Aircraft moves across the sky
      const speed = 0.008; // km/s
      const t = wallTime * speed;
      const angle = obj.headingDeg * (Math.PI / 180);
      inst.mesh.position.set(
        obj.position.x + Math.cos(angle) * t,
        obj.position.y,
        obj.position.z - Math.sin(angle) * t,
      );
      inst.mesh.rotation.y = -angle;
      inst.mesh.scale.setScalar(obj.scale);
      const mat = inst.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(obj.tint);
      mat.opacity = obj.opacity;
    }
  }

  private _updateSeabirds(objs: readonly BackgroundObject[], wallTime: number): void {
    for (let i = 0; i < this._seabirds.length; i++) {
      const inst = this._seabirds[i]!;
      const obj = objs[i];
      if (!obj) {
        inst.points.visible = false;
        continue;
      }
      inst.points.visible = true;
      const angle = obj.headingDeg * (Math.PI / 180);
      const speed = 0.001;
      const t = wallTime * speed;
      inst.points.position.set(
        obj.position.x + Math.cos(angle) * t,
        obj.position.y + Math.sin(wallTime * 2 + i * 1.3) * 0.002,
        obj.position.z - Math.sin(angle) * t,
      );
      inst.points.rotation.y = -angle;
      inst.points.scale.setScalar(obj.scale);
      const mat = inst.points.material as THREE.PointsMaterial;
      mat.color.setHex(obj.tint);
      mat.opacity = obj.opacity;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    const disposeMat = (m: THREE.Material | THREE.Material[]) => {
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m.dispose();
    };

    for (const inst of this._silhouettes) {
      if (inst.mesh.geometry !== HULL_GEOMETRY) inst.mesh.geometry.dispose();
      disposeMat(inst.mesh.material);
      this._scene.remove(inst.mesh);
    }
    for (const inst of this._smokeColumns) {
      inst.points.geometry.dispose();
      disposeMat(inst.points.material);
      this._scene.remove(inst.points);
    }
    for (const inst of this._debris) {
      if (inst.mesh.geometry !== DEBRIS_GEOMETRY) inst.mesh.geometry.dispose();
      disposeMat(inst.mesh.material);
      this._scene.remove(inst.mesh);
    }
    for (const inst of this._rainCurtains) {
      if (inst.mesh.geometry !== RAIN_CURTAIN_GEOMETRY) inst.mesh.geometry.dispose();
      disposeMat(inst.mesh.material);
      this._scene.remove(inst.mesh);
    }
    for (const inst of this._aircraft) {
      if (inst.mesh.geometry !== AIRCRAFT_GEOMETRY) inst.mesh.geometry.dispose();
      disposeMat(inst.mesh.material);
      this._scene.remove(inst.mesh);
    }
    for (const inst of this._seabirds) {
      inst.points.geometry.dispose();
      disposeMat(inst.points.material);
      this._scene.remove(inst.points);
    }

    for (const group of this._allGroups) {
      this._scene.remove(group);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}
