/**
 * SILENT DEPTH V2.6 — Weather / Night / Underwater atmosphere tests
 *
 * Pure visual derivation only. These tests guard against hard cuts at depth
 * thresholds, non-distinct weather moods, leaked nav lights on hidden ships,
 * and non-deterministic lightning.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveWeatherVisuals,
  stormLightningIntensity,
  deriveUnderwaterVisuals,
  isUnderwaterDepth,
  colorDistance,
  type UnderwaterQuality,
} from '../../src/renderer/weather';
import { shipNavLights } from '../../src/renderer/three/ShipRenderer';
import type { RenderShip } from '../../src/renderer/types';
import { getQualitySettings, setQualityLevel } from '../../src/renderer/three/QualityPresets';

const WEATHER_KINDS = ['Clear', 'Cloudy', 'Fog', 'Storm', 'Night'] as const;

describe('V2.6 weather visuals are distinct', () => {
  it('five weather kinds produce unique fog, sky and ocean palettes', () => {
    const visuals = WEATHER_KINDS.map((k) => deriveWeatherVisuals(k));
    const fogSet = new Set(visuals.map((v) => v.fogColor));
    const skySet = new Set(visuals.map((v) => v.skyTop));
    const oceanSet = new Set(visuals.map((v) => v.oceanDeep));
    expect(fogSet.size).toBe(5);
    expect(skySet.size).toBe(5);
    expect(oceanSet.size).toBe(5);
  });

  it('Night is flagged as night and Storm as storm with lightning', () => {
    expect(deriveWeatherVisuals('Night').isNight).toBe(true);
    expect(deriveWeatherVisuals('Storm').storm).toBe(true);
    expect(deriveWeatherVisuals('Storm').lightning).toBe(true);
    expect(deriveWeatherVisuals('Clear').lightning).toBe(false);
  });
});

describe('V2.6 underwater depth visuals are continuous', () => {
  const q: UnderwaterQuality = { underwaterParticles: 35, underwaterCaustics: 0.7 };

  it('no hard cut at the 20m band', () => {
    const before = deriveUnderwaterVisuals(19.9, q);
    const after = deriveUnderwaterVisuals(20.1, q);
    expect(colorDistance(before.fogColor, after.fogColor)).toBeLessThan(0.05);
    expect(colorDistance(before.waterTint, after.waterTint)).toBeLessThan(0.05);
  });

  it('no hard cut at the 80m band', () => {
    const before = deriveUnderwaterVisuals(79.9, q);
    const after = deriveUnderwaterVisuals(80.1, q);
    expect(colorDistance(before.fogColor, after.fogColor)).toBeLessThan(0.05);
  });

  it('no hard cut at the 150m band', () => {
    const before = deriveUnderwaterVisuals(149.9, q);
    const after = deriveUnderwaterVisuals(150.1, q);
    expect(colorDistance(before.fogColor, after.fogColor)).toBeLessThan(0.05);
  });

  it('caustics fade to exactly 0 by 20m and are present at the surface', () => {
    expect(deriveUnderwaterVisuals(0, q).causticsIntensity).toBeGreaterThan(0);
    expect(deriveUnderwaterVisuals(20, q).causticsIntensity).toBe(0);
    expect(deriveUnderwaterVisuals(80, q).causticsIntensity).toBe(0);
  });

  it('light attenuation and fog density fall monotonically with depth', () => {
    const shallow = deriveUnderwaterVisuals(5, q);
    const mid = deriveUnderwaterVisuals(60, q);
    const deep = deriveUnderwaterVisuals(160, q);
    expect(mid.lightAttenuation).toBeLessThan(shallow.lightAttenuation);
    expect(deep.lightAttenuation).toBeLessThan(mid.lightAttenuation);
    expect(mid.fogDensity).toBeGreaterThan(shallow.fogDensity);
    expect(deep.fogDensity).toBeGreaterThan(mid.fogDensity);
  });

  it('isUnderwaterDepth gates the surface correctly', () => {
    expect(isUnderwaterDepth(0)).toBe(false);
    expect(isUnderwaterDepth(0.01)).toBe(true);
    expect(isUnderwaterDepth(90)).toBe(true);
  });
});

describe('V2.6 underwater quality gating', () => {
  it('LOW disables caustics entirely', () => {
    setQualityLevel('LOW');
    const low = getQualitySettings();
    const vis = deriveUnderwaterVisuals(2, low);
    expect(vis.causticsIntensity).toBe(0);
    setQualityLevel('HIGH');
  });

  it('ULTRA shows caustics when shallow', () => {
    setQualityLevel('ULTRA');
    const ultra = getQualitySettings();
    const vis = deriveUnderwaterVisuals(2, ultra);
    expect(vis.causticsIntensity).toBeGreaterThan(0);
    setQualityLevel('HIGH');
  });

  it('particle count never exceeds the quality budget', () => {
    setQualityLevel('HIGH');
    const high = getQualitySettings();
    const vis = deriveUnderwaterVisuals(8, high);
    expect(vis.particleCount).toBeLessThanOrEqual(high.underwaterParticles);
    setQualityLevel('HIGH');
  });
});

describe('V2.6 storm lightning is deterministic and rhythmic', () => {
  it('sequence is reproducible (pure function of time)', () => {
    const a = Array.from({ length: 200 }, (_, i) => stormLightningIntensity(i * 0.1));
    const b = Array.from({ length: 200 }, (_, i) => stormLightningIntensity(i * 0.1));
    expect(a).toEqual(b);
  });

  it('intensity stays in [0,1] and begins dark', () => {
    for (let t = 0; t < 60; t += 0.137) {
      const v = stormLightningIntensity(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(stormLightningIntensity(0)).toBe(0);
  });

  it('produces a flash during a storm cycle and returns to dark', () => {
    // Probe a window that contains the first flash cycle.
    let sawFlash = false;
    let returnedToDark = false;
    for (let t = 0; t < 3.5; t += 0.02) {
      const v = stormLightningIntensity(t);
      if (v > 0.3) sawFlash = true;
      if (sawFlash && v === 0) returnedToDark = true;
    }
    expect(sawFlash).toBe(true);
    expect(returnedToDark).toBe(true);
  });
});

describe('V2.6 nav lights obey visibility truth (fail-closed)', () => {
  const visibleShip: RenderShip = {
    id: 'e1',
    shipClass: 'Destroyer',
    position: { x: 0, y: 0, z: 0 },
    headingDeg: 0,
    visible: true,
    classification: 'destroyer',
    aiState: 'PATROL',
    speedKt: 10,
    rangeKm: 4,
  } as unknown as RenderShip;

  const hiddenShip: RenderShip = { ...visibleShip, visible: false } as RenderShip;

  it('returns three lights for a visible ship', () => {
    const lights = shipNavLights(visibleShip);
    expect(lights).not.toBeNull();
    expect(lights!.length).toBe(3);
  });

  it('returns null for a hidden ship (no leak)', () => {
    expect(shipNavLights(hiddenShip)).toBeNull();
  });
});
