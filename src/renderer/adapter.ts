/**
 * SILENT DEPTH V2.0 — Snapshot → RenderState Adapter (src/renderer/adapter.ts)
 *
 * Pure function that converts a GameSnapshot (engine output) into a
 * RenderState (renderer input). This is the ONE-WAY bridge between the
 * deterministic simulation and the Three.js presentation layer.
 *
 * Responsibilities:
 *   - Coordinate mapping: engine (x=east km, y=north km) → Three.js (x, y=-depth, z=-north)
 *   - Interpolation: lerp between prev/current snapshots using alpha
 *   - Weather derivation: map WeatherKind to visual parameters
 *   - Contact visibility: only show contacts detected by sonar/periscope
 *   - Ship variant assignment: deterministic visual variant per ship class
 *   - Effect creation: convert engine events to visual effects
 *
 * DESIGN DECISIONS:
 *   - This module NEVER imports Three.js — it produces plain data objects.
 *   - Visual randomness uses visualRng, never engine RNG.
 *   - The adapter is stateless except for effect lifecycle tracking.
 *   - All interpolation is presentation-only; the engine is unaffected.
 *
 * @pure-at-import — no DOM/Three.js at module scope.
 */

import type { BalanceConfig } from '../core/balance';
import type { EventEntry, GameSnapshot, ShipClass, WeatherKind } from '../core/types';
import { weatherModifiers } from '../world/weather';
import type {
  CameraMode,
  RenderCamera,
  RenderContact,
  RenderDecoy,
  RenderEffect,
  RenderMission,
  RenderPlayer,
  RenderShip,
  RenderState,
  RenderTorpedo,
  RenderWeather,
  Vec3,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Scale factor: 1 km in engine = 1 unit in Three.js world space. */
const WORLD_SCALE = 1;

/** Ocean surface is at y=0 in Three.js. Depth goes negative. */
const SURFACE_Y = 0;

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/** Convert engine position (km, x=east, y=north) + depth (metres) to Three.js Vec3. */
export function engineToThree(
  ex: number,
  ey: number,
  depthM: number = 0,
): Vec3 {
  return {
    x: ex * WORLD_SCALE,
    y: SURFACE_Y - depthM / 1000, // depth in km, negative y
    z: -ey * WORLD_SCALE, // north → -z
  };
}

/** Linear interpolation of two Vec3. */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Shortest-path angle interpolation (handles 350°→10° wraps). */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

// ---------------------------------------------------------------------------
// Weather → Visual parameters
// ---------------------------------------------------------------------------

interface WeatherVisualParams {
  waveHeight: number;
  windSpeed: number;
  fogDensity: number;
  cloudCover: number;
}

const WEATHER_VISUALS: Record<WeatherKind, WeatherVisualParams> = {
  Clear: { waveHeight: 0.3, windSpeed: 2, fogDensity: 0.002, cloudCover: 0.1 },
  Cloudy: { waveHeight: 0.6, windSpeed: 5, fogDensity: 0.005, cloudCover: 0.6 },
  Storm: { waveHeight: 2.5, windSpeed: 18, fogDensity: 0.015, cloudCover: 0.95 },
  Fog: { waveHeight: 0.2, windSpeed: 1, fogDensity: 0.04, cloudCover: 0.3 },
  Night: { waveHeight: 0.4, windSpeed: 3, fogDensity: 0.008, cloudCover: 0.2 },
};

function deriveWeather(
  kind: WeatherKind,
  balance: BalanceConfig,
): RenderWeather {
  const mods = weatherModifiers(kind, balance);
  const vis = WEATHER_VISUALS[kind];
  return {
    kind,
    visibilityKm: mods.visibilityKm,
    waveHeight: vis.waveHeight,
    windSpeed: vis.windSpeed,
    fogDensity: vis.fogDensity,
    isNight: kind === 'Night',
    cloudCover: vis.cloudCover,
  };
}

// ---------------------------------------------------------------------------
// Active weather resolution (same logic as renderer.ts activeWeatherAt)
// ---------------------------------------------------------------------------

function resolveActiveWeather(
  weatherSpec: string,
  simTime: number,
  parTimeS: number,
  balance: BalanceConfig,
): WeatherKind {
  // Simple parsing: handle 'A->B' sequences
  const parts = weatherSpec.split('->').map((s) => s.trim()) as WeatherKind[];
  if (parts.length <= 1) return parts[0] ?? 'Clear';
  const frac = parTimeS > 0 ? simTime / parTimeS : 0;
  const segmentLength = 1 / parts.length;
  const idx = Math.min(parts.length - 1, Math.floor(frac / segmentLength));
  return parts[idx] ?? parts[parts.length - 1] ?? 'Clear';
}

// ---------------------------------------------------------------------------
// Ship variant assignment (deterministic from ship id)
// ---------------------------------------------------------------------------

const CARGO_VARIANTS = ['Cargo_A', 'Cargo_B', 'Cargo_C'];
const MERCHANT_VARIANTS = ['Merchant_A', 'Merchant_B'];
const TANKER_VARIANTS = ['Tanker_A', 'Tanker_B'];

function assignVariant(shipClass: ShipClass, shipId: string): string {
  // Deterministic hash from ship id
  let hash = 0;
  for (let i = 0; i < shipId.length; i++) {
    hash = ((hash << 5) - hash + shipId.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);

  switch (shipClass) {
    case 'Cargo':
      return CARGO_VARIANTS[absHash % CARGO_VARIANTS.length]!;
    case 'Merchant':
      return MERCHANT_VARIANTS[absHash % MERCHANT_VARIANTS.length]!;
    case 'Tanker':
      return TANKER_VARIANTS[absHash % TANKER_VARIANTS.length]!;
    default:
      return shipClass; // Destroyer, Frigate, Submarine — single variant
  }
}

// ---------------------------------------------------------------------------
// Effect conversion (engine events → visual effects)
// ---------------------------------------------------------------------------

export type { RenderEffect } from './types';
export type { CameraMode } from './types';

let effectIdCounter = 0;

function createEffectFromEvent(
  ev: EventEntry,
  snapshot: GameSnapshot,
): RenderEffect | null {
  const p = ev.payload;
  switch (ev.type) {
    case 'sonar.ping': {
      const pos = engineToThree(snapshot.playerSub.position.x, snapshot.playerSub.position.y, 0);
      return {
        type: 'sonarPing',
        position: pos,
        age: 0,
        maxAge: 1.2,
        params: { speedKmPerS: 1.0 },
        id: `fx-ping-${effectIdCounter++}`,
      };
    }
    case 'torpedo.hit': {
      // Find torpedo position from snapshot
      const torpId = p?.torpedoId as string | undefined;
      const torp = snapshot.torpedoes.find((t) => t.id === torpId);
      if (!torp) return null;
      const pos = engineToThree(torp.position.x, torp.position.y, 0);
      return {
        type: 'explosion',
        position: pos,
        age: 0,
        maxAge: 2.0,
        params: { scale: 1.0 },
        id: `fx-exp-${effectIdCounter++}`,
      };
    }
    case 'ship.sunk': {
      const shipId = p?.shipId as string | undefined;
      const ship = snapshot.enemies.find((e) => e.id === shipId);
      if (!ship) return null;
      const pos = engineToThree(ship.position.x, ship.position.y, 0);
      return {
        type: 'explosion',
        position: pos,
        age: 0,
        maxAge: 3.0,
        params: { scale: 2.0 },
        id: `fx-sunk-${effectIdCounter++}`,
      };
    }
    case 'depthCharge.detonated': {
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
      const pos = engineToThree(p.x as number, p.y as number, 0);
      return {
        type: 'depthCharge',
        position: pos,
        age: 0,
        maxAge: 1.5,
        params: {},
        id: `fx-dc-${effectIdCounter++}`,
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main adapter function
// ---------------------------------------------------------------------------

export interface AdapterOptions {
  balance: BalanceConfig;
  /** Previous snapshot for interpolation (optional). */
  prevSnapshot?: GameSnapshot | null;
  /** Interpolation alpha [0,1] = accumulator / FIXED_DT. */
  alpha?: number;
  /** Wall-clock seconds for visual animations. */
  wallTime?: number;
  /** New events since last frame (for effect spawning). */
  newEvents?: EventEntry[];
  /** Active effect list to update (mutated in place). */
  activeEffects?: RenderEffect[];
  /** Frame dt for aging effects. */
  dt?: number;
  /** Currently selected contact id. */
  selectedContactId?: string | null;
  /** Current camera mode. */
  cameraMode?: CameraMode;
}

/**
 * Convert a GameSnapshot into a RenderState. Pure except for effect lifecycle
 * mutations on the provided activeEffects array.
 */
export function snapshotToRenderState(
  snapshot: GameSnapshot,
  opts: AdapterOptions,
): RenderState {
  const {
    balance,
    prevSnapshot,
    alpha = 1,
    wallTime = 0,
    newEvents = [],
    activeEffects = [],
    dt = 0.016,
    selectedContactId = null,
    cameraMode = 'world',
  } = opts;

  const t = Math.max(0, Math.min(1, alpha));

  // --- Player ---
  const player = snapshot.playerSub;
  const prevPlayer = prevSnapshot?.playerSub;
  const playerPos = engineToThree(
    prevPlayer
      ? prevPlayer.position.x + (player.position.x - prevPlayer.position.x) * t
      : player.position.x,
    prevPlayer
      ? prevPlayer.position.y + (player.position.y - prevPlayer.position.y) * t
      : player.position.y,
    player.depthM ?? 0,
  );

  const renderPlayer: RenderPlayer = {
    position: playerPos,
    headingDeg: prevPlayer
      ? lerpAngle(prevPlayer.headingDeg, player.headingDeg, t)
      : player.headingDeg,
    speedKt: player.speedKt,
    depthLayer: player.depthLayer,
    depthM: player.depthM ?? 0,
    pitchDeg: player.depthTransitionT !== null ? (player.targetDepthLayer === 'Deep' ? 5 : -3) : 0,
    rollDeg: player.speedKt > 2 ? Math.sin(wallTime * 1.8) * 1.5 : 0,
    hull: player.hull,
    battery: player.battery,
    noise: player.noise,
    detection: player.detection,
    periscopeState: snapshot.periscope,
  };

  // --- Ships (only visible if detected by sonar or periscope) ---
  const detectedShipIds = new Set<string>();
  for (const c of snapshot.contacts) {
    if (c.state !== 'UNKNOWN' && c.trueShipId !== null) {
      detectedShipIds.add(c.trueShipId);
    }
  }

  const ships: RenderShip[] = snapshot.enemies.map((enemy) => {
    const prevEnemy = prevSnapshot?.enemies.find((e) => e.id === enemy.id);
    const pos = engineToThree(
      prevEnemy
        ? prevEnemy.position.x + (enemy.position.x - prevEnemy.position.x) * t
        : enemy.position.x,
      prevEnemy
        ? prevEnemy.position.y + (enemy.position.y - prevEnemy.position.y) * t
        : enemy.position.y,
      0, // ships are on the surface
    );
    return {
      id: enemy.id,
      shipClass: enemy.shipClass,
      position: pos,
      headingDeg: prevEnemy
        ? lerpAngle(prevEnemy.headingDeg, enemy.headingDeg, t)
        : enemy.headingDeg,
      speedKt: enemy.speedKt,
      aiState: enemy.aiState,
      visible: detectedShipIds.has(enemy.id),
      variant: assignVariant(enemy.shipClass, enemy.id),
      hull: enemy.hull,
    };
  });

  // --- Contacts ---
  const contacts: RenderContact[] = snapshot.contacts.map((c) => {
    const range = c.rangeKm ?? 3; // bearing-only fallback
    const brgRad = c.bearingDeg * RAD;
    const estX = player.position.x + Math.sin(brgRad) * range;
    const estY = player.position.y + Math.cos(brgRad) * range;
    const estPos = engineToThree(estX, estY, 0);

    let rxKm: number;
    let ryKm: number;
    if (c.rangeKm === null) {
      rxKm = 2.0;
      ryKm = 0.6;
    } else {
      rxKm = Math.max(0.2, c.rangeKm * Math.max(c.rangeErrorFrac, 0.05));
      ryKm = Math.max(0.15, c.rangeKm * Math.sin((c.bearingErrorDeg * Math.PI) / 180));
    }

    return {
      id: c.id,
      state: c.state,
      estimatedPosition: estPos,
      uncertaintyRxKm: rxKm,
      uncertaintyRyKm: ryKm,
      uncertaintyRotationDeg: c.bearingDeg,
      classification: c.classification,
      confidence: c.confidence,
      selected: c.id === selectedContactId,
      bearingDeg: c.bearingDeg,
      rangeKm: c.rangeKm,
    };
  });

  // --- Torpedoes ---
  const torpedoes: RenderTorpedo[] = snapshot.torpedoes
    .filter((torp) => torp.state === 'RUNNING' || torp.state === 'FIRED')
    .map((torp) => {
      const prevTorp = prevSnapshot?.torpedoes.find((t) => t.id === torp.id);
      const pos = engineToThree(
        prevTorp
          ? prevTorp.position.x + (torp.position.x - prevTorp.position.x) * t
          : torp.position.x,
        prevTorp
          ? prevTorp.position.y + (torp.position.y - prevTorp.position.y) * t
          : torp.position.y,
        0,
      );
      return {
        id: torp.id,
        position: pos,
        headingDeg: torp.headingDeg,
        state: torp.state,
        speedKt: torp.speedKt,
      };
    });

  // --- Decoys ---
  const decoys: RenderDecoy[] = snapshot.decoys.map((d) => ({
    id: d.id,
    position: engineToThree(d.position.x, d.position.y, 0),
  }));

  // --- Weather ---
  const missionDef = { weather: '', parTimeS: 1 }; // Will be overridden
  // We need to extract weather from the snapshot context. Since GameSnapshot
  // doesn't carry the mission def directly, we use a simple approach:
  // The caller should provide the weather kind via opts or we derive from events.
  // For now, use a sensible default — the main loop will override this.
  const activeWeather = resolveActiveWeather(
    opts.balance ? '' : 'Clear', // placeholder — see note below
    snapshot.simTime,
    1800,
    balance,
  );
  const weather = deriveWeather(activeWeather, balance);

  // --- Effects ---
  // Spawn new effects from events
  for (const ev of newEvents) {
    const fx = createEffectFromEvent(ev, snapshot);
    if (fx !== null) activeEffects.push(fx);
  }
  // Age existing effects and remove expired ones
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    activeEffects[i]!.age += dt;
    if (activeEffects[i]!.age >= activeEffects[i]!.maxAge) {
      activeEffects.splice(i, 1);
    }
  }

  // --- Mission ---
  const mission: RenderMission = {
    id: snapshot.mission.missionId,
    name: snapshot.mission.missionId, // Will be enriched by caller
    phase: snapshot.mission.phase,
    timer: snapshot.simTime,
    parTimeS: 1800, // Default — enriched by caller
  };

  // --- Camera ---
  const camera: RenderCamera = {
    mode: cameraMode,
    position: {
      x: playerPos.x,
      y: playerPos.y + 0.5, // Elevated above sub
      z: playerPos.z + 1.5, // Behind sub
    },
    target: playerPos,
    fov: cameraMode === 'periscope' ? 40 : 60,
    transitionProgress: 1,
  };

  return {
    simTime: snapshot.simTime,
    gameState: snapshot.state,
    player: renderPlayer,
    ships,
    contacts,
    torpedoes,
    decoys,
    weather,
    effects: [...activeEffects],
    mission,
    camera,
    wallTime,
  };
}
