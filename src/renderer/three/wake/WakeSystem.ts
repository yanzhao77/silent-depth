/**
 * SILENT DEPTH V2.4 — Wake System (presentation-only)
 *
 * Builds visual wake sources strictly from the RenderState contract. The wake
 * field is the headline ocean-interaction feature of V2.4: it drives bow waves,
 * stern foam, turbulent wakes and Kelvin V-wakes for both the player submarine
 * and every *already visible* enemy ship.
 *
 * Hard rules enforced by this module:
 *   - ONLY reads RenderState (position / heading / speed / visible).
 *   - NEVER writes back to simulation, AI, sonar or physics.
 *   - Enemy ship wakes are emitted only when the ship is already visible
 *     (i.e. detected by sonar / periscope). It does not guess gameplay state.
 *   - Speed below a small threshold produces no wake (a stopped sub/ship is
 *     clean in the water).
 *
 * The GLSL ocean shader mirrors `wakeFoamIntensity` exactly so unit tests and
 * the GPU agree on wake shape.
 */

import type { RenderShip, RenderState } from '../../types';

const RAD = Math.PI / 180;

/** Maximum simultaneous wakes the ocean shader will resolve (player + ships). */
export const MAX_WAKES = 12;

/** A single visual wake emitter in Three.js world XZ space (kilometre units). */
export interface WakeSource {
  /** World X (east, km). */
  x: number;
  /** World Z (north → -z, km). */
  z: number;
  /** Heading in radians, matching the renderer's world-forward convention. */
  headingRad: number;
  /** Surface speed in knots. */
  speedKt: number;
  /** Lateral scale of the wake (submarines narrow, tankers wide). */
  widthScale: number;
}

/** World forward unit vector for a heading, matching model rotation.y = -h+π/2. */
export function headingToForward(headingDeg: number): { x: number; z: number } {
  const h = headingDeg * RAD;
  return { x: Math.sin(h), z: -Math.cos(h) };
}

/**
 * Width scale per ship class. Submarines are slim; merchants/tankers displace
 * far more water and throw a broader, more turbulent wake.
 */
const SHIP_WAKE_WIDTH: Record<string, number> = {
  Destroyer: 1.0,
  Frigate: 0.95,
  Corvette: 0.9,
  Tanker: 1.35,
  Cargo: 1.2,
  Merchant: 1.15,
};

const SUBMARINE_WAKE_WIDTH = 0.6;
const WAKE_MIN_SPEED_KT = 0.8;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function makePlayerWake(player: RenderState['player']): WakeSource {
  return {
    x: player.position.x,
    z: player.position.z,
    headingRad: player.headingDeg * RAD,
    speedKt: player.speedKt,
    widthScale: SUBMARINE_WAKE_WIDTH,
  };
}

export function makeShipWake(ship: RenderShip): WakeSource {
  return {
    x: ship.position.x,
    z: ship.position.z,
    headingRad: ship.headingDeg * RAD,
    speedKt: ship.speedKt,
    widthScale: SHIP_WAKE_WIDTH[ship.shipClass] ?? 1.0,
  };
}

/**
 * Collect every wake the ocean must render this frame. The player submarine is
 * always included; enemy ships only when their RenderState visibility flag is
 * already true (derived by the adapter from sonar/periscope detection).
 */
export function collectWakeSources(state: RenderState): WakeSource[] {
  const sources: WakeSource[] = [makePlayerWake(state.player)];
  for (const ship of state.ships) {
    if (!ship.visible) continue;
    sources.push(makeShipWake(ship));
    if (sources.length >= MAX_WAKES) break;
  }
  return sources;
}

/**
 * Pure wake foam intensity at a world XZ point for one source, range 0..1.
 * Mirrors the GLSL `shipWake` function in OceanRenderer.
 *
 * Components:
 *   - bow wave: bright foam crest just ahead of the bow
 *   - stern foam: turbulent central band trailing the stern, widening with distance
 *   - Kelvin V-wake: two diverging lines at ~19° behind the vessel
 *   - turbulent texture: low-frequency breakup so the wake is not a clean stripe
 */
export function wakeFoamIntensity(px: number, pz: number, src: WakeSource): number {
  const fwd = headingToForward(src.headingRad / RAD);
  const rx = fwd.z;
  const rz = -fwd.x;
  const dx = px - src.x;
  const dz = pz - src.z;
  const along = dx * fwd.x + dz * fwd.z; // + ahead of bow
  const lateral = dx * rx + dz * rz; // + to starboard

  const speedF = smoothstep(WAKE_MIN_SPEED_KT, 9.0, src.speedKt);
  if (speedF <= 0.001) return 0;

  // Bow wave — a compact crescent just forward of the bow.
  const bow = smoothstep(0.0055, 0.0006, Math.abs(along - 0.0016))
    * smoothstep(0.0042, 0.0004, Math.abs(lateral));

  // Stern turbulent wake — trails behind, length & width grow with speed.
  const behind = -along;
  const reach = 0.020 + src.speedKt * 0.0042;
  const sternMask = smoothstep(0.0, 0.0022, behind) * (1 - smoothstep(reach * 0.45, reach, behind));
  const halfWidth = (0.0014 + behind * 0.085) * src.widthScale;
  const center = 1 - smoothstep(halfWidth * 0.5, halfWidth, Math.abs(lateral));
  const turbulent = sternMask * center;

  // Kelvin V-wake — two diverging lines at ~19.5° (tan ≈ 0.354) behind the bow.
  const vHalf = 0.354 * behind;
  const vLine = (1 - smoothstep(0.0007, 0.0026, Math.abs(Math.abs(lateral) - vHalf)))
    * smoothstep(0.001, 0.018, behind)
    * (1 - smoothstep(reach * 0.7, reach * 1.15, behind));

  // Break up the stern band with a faint transverse ripple.
  const breakup = 0.78 + 0.22 * Math.sin(behind * 150 - lateral * 70 + src.x * 9);

  const raw = Math.max(bow, turbulent * breakup, vLine);
  return Math.min(1, raw * speedF);
}
