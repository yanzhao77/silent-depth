/**
 * SILENT DEPTH — ocean currents, visual-only (src/world/currents.ts)
 *
 * FR-16 / GAME_DESIGN §9.3: current vectors at (x, y) from the deterministic
 * noise field. PURE FUNCTION — no state, no RNG, no Math.random: the vector
 * at a point is bilinearly interpolated (toroidal wrap, smoothstep) from the
 * model's precomputed currentField, which is itself a deterministic function
 * of the seed (see ocean.ts). The same (model, xKm, yKm) always returns the
 * identical vector.
 *
 * Visual-only: currents do NOT affect v1 physics (FR-16: "洋流 (不影响 v1
 * 物理，仅视觉)").
 *
 * DESIGN DECISIONS:
 *  - currentAt wraps coordinates toroidally over currentField.extentKm, so
 *    the field tiles seamlessly across the map and off-map lookups stay
 *    well-defined (no clamp artifacts at the map edge).
 *  - The vector is a smoothstep-bilinear blend of the four surrounding grid
 *    vectors — a convex combination, hence always bounded by the field's
 *    visual speed band (CURRENT_SPEED_MIN/MAX).
 *
 * Task: t-009 world system (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import { lerp, smoothstep01, type CurrentVector, type OceanModel } from './ocean'

/**
 * Current vector (east/north components, kt) at map coordinates (xKm, yKm).
 * Coordinates may lie anywhere on the plane — the field tiles seamlessly via
 * toroidal wrap (mapSizeKm = currentField.extentKm). Deterministic and pure.
 */
export function currentAt(model: OceanModel, xKm: number, yKm: number): CurrentVector {
  const field = model.currentField
  const u = (((xKm / field.extentKm) % 1) + 1) % 1
  const v = (((yKm / field.extentKm) % 1) + 1) % 1
  const xf = u * field.size
  const yf = v * field.size
  const i0 = Math.floor(xf) % field.size
  const i1 = (i0 + 1) % field.size
  const j0 = Math.floor(yf) % field.size
  const j1 = (j0 + 1) % field.size
  const fx = smoothstep01(xf - Math.floor(xf))
  const fy = smoothstep01(yf - Math.floor(yf))
  const a = field.vectors[j0 * field.size + i0]!
  const b = field.vectors[j0 * field.size + i1]!
  const c = field.vectors[j1 * field.size + i0]!
  const d = field.vectors[j1 * field.size + i1]!
  return {
    x: lerp(lerp(a.x, b.x, fx), lerp(c.x, d.x, fx), fy),
    y: lerp(lerp(a.y, b.y, fx), lerp(c.y, d.y, fx), fy),
  }
}
