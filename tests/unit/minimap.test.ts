/**
 * SILENT DEPTH V2.10 — Minimap Overlay Unit Tests (tests/unit/minimap.test.ts)
 *
 * Pure function tests for the WebGL minimap projection (projectMinimap).
 * The DOM/canvas drawing path (drawMinimapOverlay) is browser-only; its honest
 * visibility rule (only visible ships / detected contacts) is enforced in the
 * renderer at the RenderState consumption site. This file covers the
 * deterministic world→map projection contract.
 */

import { describe, expect, it } from 'vitest';
import { projectMinimap } from '../../src/renderer/three/minimap';

describe('projectMinimap', () => {
  const MAP_KM = 30;
  const SIZE = 180;
  const PAD = 8;

  it('maps the south-west corner (0,0) to the bottom-left of the inset box', () => {
    const p = projectMinimap(0, 0, MAP_KM, SIZE, PAD);
    expect(p.x).toBe(PAD);
    expect(p.y).toBe(SIZE - PAD);
  });

  it('maps the north-east corner (mapSize,mapSize) to the top-right of the inset box', () => {
    const p = projectMinimap(MAP_KM, MAP_KM, MAP_KM, SIZE, PAD);
    expect(p.x).toBe(SIZE - PAD);
    expect(p.y).toBe(PAD);
  });

  it('maps the centre to the centre of the inset box (north-up)', () => {
    const p = projectMinimap(MAP_KM / 2, MAP_KM / 2, MAP_KM, SIZE, PAD);
    expect(p.x).toBeCloseTo(SIZE / 2);
    expect(p.y).toBeCloseTo(SIZE / 2);
  });

  it('is north-up: a point further north has a smaller (higher) y', () => {
    const south = projectMinimap(MAP_KM / 2, 5, MAP_KM, SIZE, PAD);
    const north = projectMinimap(MAP_KM / 2, 25, MAP_KM, SIZE, PAD);
    expect(north.y).toBeLessThan(south.y);
  });

  it('fails closed on a degenerate world size (never divides by zero)', () => {
    const p = projectMinimap(1, 1, 0, SIZE, PAD);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
