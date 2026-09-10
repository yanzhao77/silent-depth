/**
 * SILENT DEPTH V2.10 — WebGL minimap overlay (bottom-right).
 *
 * A 2D canvas drawn over the Three.js viewport that mirrors the legacy Canvas2D
 * L5 minimap in behaviour, but reads ONLY the authoritative RenderState:
 *
 *   - own submarine (heading tick + speed vector)
 *   - contacts (honest, uncertain estimated position — never an exact enemy
 *     coordinate)
 *   - ship markers ONLY for ships with RenderShip.visible === true
 *
 * Hidden ships (visible === false) are never drawn here. Presentation never
 * infers a position that the simulation did not expose, so the minimap fails
 * closed (no marker for a ship the player has not detected). It also never
 * consumes engine RNG — colours/geometry are pure functions of RenderState.
 *
 * Coordinate mapping (RenderState Three space → engine planar space):
 *   engineX = pos.x   (east, km)
 *   engineY = -pos.z  (north, km)
 *
 * North is up; world extent [0, mapSizeKm]² is inset by `padding`.
 *
 * @pure-at-import — DOM/canvas touched only inside drawMinimapOverlay().
 */

import type { RenderState } from '../types';

const RAD = Math.PI / 180;

/** Square minimap size in CSS pixels (mirrors legacy MINIMAP_SIZE_PX). */
export const MINIMAP_SIZE_PX = 180;
/** Inset for the world-bounds rectangle, px. */
const MINIMAP_PADDING = 8;
/** Speed-vector line scale on the minimap: px per knot (capped per entity). */
const VECTOR_PX_PER_KT = 1.3;

/** Contact state → marker colour (consistent with the tactical overlay). */
const STATE_COLORS: Record<string, string> = {
  UNKNOWN: '#6b7280',
  SUSPECTED: '#fbbf24',
  CLASSIFIED: '#22d3ee',
  TRACKED: '#60a5fa',
  CONFIRMED: '#f87171',
};

// Palette (hex values match the legacy Canvas2D minimap).
const FRAME_BG = 'rgba(11,21,32,0.88)';
const FRAME_BORDER = '#2a4a5e';
const WORLD_EDGE = '#5b7385';
const ESCORT_COLOR = '#c0392b';
const SHIP_COLOR = '#7a8a9a';
const PLAYER_COLOR = 'rgba(255,255,255,0.60)';

/** World (engine km) → minimap local px, north-up, top-left origin, inset. */
export function projectMinimap(
  wx: number,
  wy: number,
  mapSizeKm: number,
  sizePx: number,
  padding = MINIMAP_PADDING,
): { x: number; y: number } {
  const inner = Math.max(1, sizePx - padding * 2);
  const u = Math.max(1e-6, mapSizeKm);
  return {
    x: padding + (wx / u) * inner,
    y: padding + (1 - wy / u) * inner,
  };
}

/**
 * Draw the honest minimap into `canvas` from `state`. `sizePx` is the CSS size
 * of the square map; `mapSizeKm` is the world extent (balance.world.mapSizeKm).
 * The canvas backing store is scaled by devicePixelRatio.
 */
export function drawMinimapOverlay(
  canvas: HTMLCanvasElement,
  state: RenderState,
  mapSizeKm: number,
  requestedSizePx = 0,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sizePx =
    requestedSizePx > 0
      ? requestedSizePx
      : canvas.clientWidth > 0
        ? canvas.clientWidth
        : MINIMAP_SIZE_PX;
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const px = Math.round(sizePx * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sizePx, sizePx);

  const size = sizePx;
  const pad = MINIMAP_PADDING;
  const sizeKm = Math.max(1e-6, mapSizeKm);
  // Projection from engine (km) to minimap local px.
  const project = (wx: number, wy: number) => projectMinimap(wx, wy, sizeKm, size, pad);
  // RenderState position (Three space) → engine planar (km).
  const planar = (p: { x: number; z: number }) => ({ x: p.x, y: -p.z });

  // Frame + world bounds.
  ctx.fillStyle = FRAME_BG;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = FRAME_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  const tl = project(0, sizeKm);
  const br = project(sizeKm, 0);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = WORLD_EDGE;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.globalAlpha = 1;

  // Visible ships only — a hidden ship must never appear on the minimap.
  for (const ship of state.ships) {
    if (!ship.visible) continue;
    const e = planar(ship.position);
    const p = project(e.x, e.y);
    const escort = ship.shipClass === 'Destroyer' || ship.shipClass === 'Frigate';
    const color = escort ? ESCORT_COLOR : SHIP_COLOR;
    const vLen = Math.min(9, Math.max(2, ship.speedKt * VECTOR_PX_PER_KT));
    const hx = Math.sin(ship.headingDeg * RAD);
    const hy = Math.cos(ship.headingDeg * RAD);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + hx * vLen, p.y - hy * vLen);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Contacts — honest, state-coloured estimated dots.
  for (const c of state.contacts) {
    const ep = planar(c.estimatedPosition);
    const p = project(ep.x, ep.y);
    ctx.fillStyle = STATE_COLORS[c.state] ?? '#6b7280';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Own submarine — heading triangle + speed vector.
  const pp = planar(state.player.position);
  const p = project(pp.x, pp.y);
  const vLen = Math.min(14, Math.max(0, state.player.speedKt * VECTOR_PX_PER_KT));
  if (vLen >= 1) {
    const hx = Math.sin(state.player.headingDeg * RAD);
    const hy = Math.cos(state.player.headingDeg * RAD);
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + hx * vLen, p.y - hy * vLen);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(state.player.headingDeg * RAD);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.moveTo(0, -4.5);
  ctx.lineTo(3, 4);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
