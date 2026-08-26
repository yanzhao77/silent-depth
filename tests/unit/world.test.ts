/**
 * SILENT DEPTH — world system unit tests (tests/unit/world.test.ts)
 *
 * Task t-009 acceptance (mission-gate / FR-16 + FR-17):
 *   - same seed → identical ocean model (deep-equal); different seeds differ
 *   - color stops within the VISUAL_STYLE §2 palette family; depth gradient
 *     tints darken with depth
 *   - weather modifiers match balance.weather for all five kinds, incl. the
 *     Storm surface noise bonus (normalized to 0 elsewhere)
 *   - parseWeatherSequence handles 'Clear->Cloudy' chains and single kinds
 *   - currents are deterministic pure queries of the seeded field
 *   - worldSystem advances weather from ctx.simTime with zero RNG
 *   - no Math.random / DOM in any src/world module (source-text grep)
 *
 * Environment: vitest node. No Math.random anywhere.
 */

import { describe, expect, it } from 'vitest';
import { loadBalance, type BalanceConfig } from '../../src/core/balance';
import type { SystemContext } from '../../src/core/engine';
import { createRng } from '../../src/core/rng';
import type { DepthLayer, MissionDef, WeatherKind } from '../../src/core/types';
import {
  CURRENT_GRID_SIZE,
  CURRENT_SPEED_MAX,
  CURRENT_SPEED_MIN,
  OCEAN_PALETTE,
  RIPPLE_GRID_SIZE,
  generateOcean,
  generateValueNoise,
  sampleValueNoise,
} from '../../src/world/ocean';
import { currentAt } from '../../src/world/currents';
import { parseWeatherSequence, weatherModifiers } from '../../src/world/weather';
import {
  activeWeather,
  createWorldSystem,
  initWorld,
  weatherModifiersFor,
} from '../../src/world/world';

import oceanSrc from '../../src/world/ocean.ts?raw';
import weatherSrc from '../../src/world/weather.ts?raw';
import currentsSrc from '../../src/world/currents.ts?raw';
import worldSrc from '../../src/world/world.ts?raw';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WEATHER_KINDS: readonly WeatherKind[] = ['Clear', 'Cloudy', 'Storm', 'Fog', 'Night'];

function makeMission(seed = 1001, overrides: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'M-WORLD',
    name: 'World Test Mission',
    objective: { kind: 'sink' },
    patrolArea: { km: 30, gridM: 500 },
    fleet: {
      headingDeg: 90,
      speedKt: 9,
      formation: '2x2',
      colSpacingM: 500,
      rowSpacingM: 400,
      patrolBehavior: 'figure8',
    },
    spawns: [{ type: 'Merchant', x: 10, y: 10, headingDeg: 90 }],
    playerStart: { x: 5, y: 15, headingDeg: 270 },
    weather: 'Clear',
    visibilityKm: 10,
    torpedoCount: 4,
    batteryStart: 100,
    parTimeS: 900,
    difficulty: 1,
    seed,
    ...overrides,
  };
}

/** Minimal SystemContext with the fields worldSystem reads (cast is fine). */
function fakeCtx(simTime: number, mission: MissionDef, balance: BalanceConfig): SystemContext {
  return { simTime, mission, balance, skip: false } as unknown as SystemContext;
}

function vecMagnitude(v: { x: number; y: number }): number {
  return Math.hypot(v.x, v.y);
}

// ---------------------------------------------------------------------------
// ocean generation (FR-16)
// ---------------------------------------------------------------------------

describe('ocean generation (FR-16)', () => {
  const balance = loadBalance();

  it('same seed → identical model (deep-equal)', () => {
    const a = generateOcean(1001, balance);
    const b = generateOcean(1001, balance);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds → different models (ripple and currents differ)', () => {
    const a = generateOcean(1001, balance);
    const b = generateOcean(1002, balance);
    expect(a).not.toEqual(b);
    expect(a.rippleNoise.cells).not.toEqual(b.rippleNoise.cells);
    const someRippleDiffers = a.rippleNoise.cells.some((v, i) => v !== b.rippleNoise.cells[i]);
    expect(someRippleDiffers).toBe(true);
    const someCurrentDiffers = a.currentField.vectors.some((v, i) => {
      const w = b.currentField.vectors[i]!;
      return v.x !== w.x || v.y !== w.y;
    });
    expect(someCurrentDiffers).toBe(true);
  });

  it('ripple noise grid has the expected shape and values in [0, 1]', () => {
    const model = generateOcean(4242, balance);
    expect(model.rippleNoise.size).toBe(RIPPLE_GRID_SIZE);
    expect(model.rippleNoise.cells).toHaveLength(RIPPLE_GRID_SIZE * RIPPLE_GRID_SIZE);
    for (const v of model.rippleNoise.cells) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // not a flat field (has variation)
    const unique = new Set(model.rippleNoise.cells);
    expect(unique.size).toBeGreaterThan(10);
  });

  it('color stops are within the VISUAL_STYLE §2 palette family', () => {
    const model = generateOcean(7, balance);
    const family: ReadonlySet<string> = new Set(Object.values(OCEAN_PALETTE));
    for (const stop of model.colorStops) {
      expect(family.has(stop.color)).toBe(true);
    }
    // ascending t, first 0 (shallowest) → last 1 (deepest)
    expect(model.colorStops[0]!.t).toBe(0);
    expect(model.colorStops[model.colorStops.length - 1]!.t).toBe(1);
    for (let i = 1; i < model.colorStops.length; i++) {
      expect(model.colorStops[i]!.t).toBeGreaterThan(model.colorStops[i - 1]!.t);
    }
    expect(model.backgroundColor).toBe(OCEAN_PALETTE.base);
  });

  it('depth gradient covers all five layers and darkens monotonically with depth', () => {
    const model = generateOcean(99, balance);
    const layers = Object.keys(model.depthGradient).sort();
    expect(layers).toEqual(['Deep', 'Medium', 'Periscope', 'Shallow', 'Surface']);
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    const toChannels = (hex: string): [number, number, number] => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const shallow = toChannels(OCEAN_PALETTE.shallow);
    const base = toChannels(OCEAN_PALETTE.base);
    const order: DepthLayer[] = ['Surface', 'Periscope', 'Shallow', 'Medium', 'Deep'];
    let prev: [number, number, number] | null = null;
    for (const layer of order) {
      const hex = model.depthGradient[layer]!;
      expect(hex).toMatch(hexRe);
      const c = toChannels(hex);
      // within the shallow→base family bounds, component-wise
      expect(c[0]).toBeGreaterThanOrEqual(Math.min(shallow[0], base[0]));
      expect(c[0]).toBeLessThanOrEqual(Math.max(shallow[0], base[0]));
      expect(c[1]).toBeGreaterThanOrEqual(Math.min(shallow[1], base[1]));
      expect(c[1]).toBeLessThanOrEqual(Math.max(shallow[1], base[1]));
      expect(c[2]).toBeGreaterThanOrEqual(Math.min(shallow[2], base[2]));
      expect(c[2]).toBeLessThanOrEqual(Math.max(shallow[2], base[2]));
      // strictly darkening with depth (every channel non-increasing, at least one strictly)
      if (prev !== null) {
        expect(c[0]).toBeLessThanOrEqual(prev[0]);
        expect(c[1]).toBeLessThanOrEqual(prev[1]);
        expect(c[2]).toBeLessThanOrEqual(prev[2]);
        expect(c[0] + c[1] + c[2]).toBeLessThan(prev[0] + prev[1] + prev[2]);
      }
      prev = c;
    }
    expect(model.depthGradient.Surface).toBe(OCEAN_PALETTE.shallow);
    expect(model.depthGradient.Deep).toBe(OCEAN_PALETTE.base);
  });

  it('value noise sampling is deterministic and bounded', () => {
    const a = generateOcean(31337, balance);
    const b = generateOcean(31337, balance);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        expect(sampleValueNoise(a.rippleNoise, u, v)).toBe(sampleValueNoise(b.rippleNoise, u, v));
        const s = sampleValueNoise(a.rippleNoise, u, v);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('generateValueNoise is deterministic for a fixed draw sequence', () => {
    const n1 = generateValueNoise(8, createRng(5).fork('test-a'));
    const n2 = generateValueNoise(8, createRng(5).fork('test-a'));
    expect(n1.cells).toEqual(n2.cells);
    expect(n1.cells).not.toEqual(generateValueNoise(8, createRng(6).fork('test-a')).cells);
  });
});

// ---------------------------------------------------------------------------
// currents (FR-16 — visual only)
// ---------------------------------------------------------------------------

describe('currents (visual-only, FR-16)', () => {
  const balance = loadBalance();

  it('currentAt is deterministic for the same model', () => {
    const model = generateOcean(2024, balance);
    const p = currentAt(model, 12.34, 5.67);
    expect(p).toEqual(currentAt(model, 12.34, 5.67));
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('identical models give identical currents (pure function of the model)', () => {
    const a = generateOcean(2024, balance);
    const b = generateOcean(2024, balance);
    for (const [x, y] of [
      [0, 0],
      [7.3, 9.1],
      [29.99, 0.01],
      [15, 15],
    ] as const) {
      expect(currentAt(a, x, y)).toEqual(currentAt(b, x, y));
    }
  });

  it('vectors stay within the visual speed band and are bounded anywhere', () => {
    const model = generateOcean(77, balance);
    const field = model.currentField;
    expect(field.size).toBe(CURRENT_GRID_SIZE);
    expect(field.vectors).toHaveLength(CURRENT_GRID_SIZE * CURRENT_GRID_SIZE);
    // stored grid vectors have magnitude == speedKt ∈ [min, max]
    for (const v of field.vectors) {
      const m = vecMagnitude(v);
      expect(m).toBeGreaterThanOrEqual(CURRENT_SPEED_MIN - 1e-9);
      expect(m).toBeLessThanOrEqual(CURRENT_SPEED_MAX + 1e-9);
    }
    // bilinear interpolation is a convex combination → bounded above by max;
    // partial cancellation may dip below min, but never below 0.
    const check = (xKm: number, yKm: number): number => {
      const v = currentAt(model, xKm, yKm);
      expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      const m = vecMagnitude(v);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(CURRENT_SPEED_MAX + 1e-9);
      return m;
    };
    for (let gy = 0; gy < field.size; gy++) {
      for (let gx = 0; gx < field.size; gx++) {
        check(
          ((gx + 0.5) / field.size) * field.extentKm,
          ((gy + 0.5) / field.size) * field.extentKm,
        );
      }
    }
    // arbitrary (possibly off-map, wrapped) points stay bounded too
    for (let i = 0; i < 50; i++) check(i * 1.3, i * 2.7 - 5);
  });

  it('the field is not uniform (has directional variation)', () => {
    const model = generateOcean(123, balance);
    const first = model.currentField.vectors[0]!;
    const anyDifferent = model.currentField.vectors.some((v) => v.x !== first.x || v.y !== first.y);
    expect(anyDifferent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// weather modifiers (FR-17)
// ---------------------------------------------------------------------------

describe('weather modifiers (FR-17)', () => {
  const balance = loadBalance();

  it('returns balance values for all five weather kinds', () => {
    for (const kind of WEATHER_KINDS) {
      const cfg = balance.weather[kind]!;
      expect(weatherModifiers(kind, balance)).toEqual({
        visibilityKm: cfg.visibilityKm,
        sonarFactor: cfg.sonarFactor,
        noiseFactor: cfg.noiseFactor,
        surfaceNoiseBonus: cfg.surfaceNoiseBonus ?? 0,
      });
    }
  });

  it('Storm carries the surface noise bonus from balance; others normalize to 0', () => {
    const storm = weatherModifiers('Storm', balance);
    expect(storm.surfaceNoiseBonus).toBe(balance.weather.Storm.surfaceNoiseBonus ?? 0);
    expect(storm.surfaceNoiseBonus).toBeGreaterThan(0);
    for (const kind of ['Clear', 'Cloudy', 'Fog', 'Night'] as const) {
      expect(weatherModifiers(kind, balance).surfaceNoiseBonus).toBe(0);
    }
  });

  it('throws a clear TypeError for an unknown kind', () => {
    expect(() => weatherModifiers('Sunny' as WeatherKind, balance)).toThrow(TypeError);
    expect(() => weatherModifiers('Sunny' as WeatherKind, balance)).toThrow(/unknown weather kind/);
  });
});

// ---------------------------------------------------------------------------
// weather transitions ('Clear->Cloudy', FR-17 / GAME_DESIGN §9.1)
// ---------------------------------------------------------------------------

describe('weather sequences', () => {
  const balance = loadBalance();

  it('parses single kinds and chains with even transition fractions', () => {
    expect(parseWeatherSequence('Storm', balance)).toEqual([['Storm', 0]]);
    expect(parseWeatherSequence('Clear->Cloudy', balance)).toEqual([
      ['Clear', 0],
      ['Cloudy', 0.5],
    ]);
    expect(parseWeatherSequence('Clear->Cloudy->Fog', balance)).toEqual([
      ['Clear', 0],
      ['Cloudy', 1 / 3],
      ['Fog', 2 / 3],
    ]);
    // every balance kind parses as a single-segment sequence
    for (const kind of WEATHER_KINDS) {
      expect(parseWeatherSequence(kind, balance)).toEqual([[kind, 0]]);
    }
  });

  it('tolerates whitespace and rejects unknown kinds / empty specs', () => {
    expect(parseWeatherSequence(' Clear -> Cloudy ', balance)).toEqual([
      ['Clear', 0],
      ['Cloudy', 0.5],
    ]);
    expect(() => parseWeatherSequence('Clear->Sunny', balance)).toThrow(TypeError);
    expect(() => parseWeatherSequence('Clear->Sunny', balance)).toThrow(/unknown weather kind/);
    expect(() => parseWeatherSequence('', balance)).toThrow(TypeError);
    expect(() => parseWeatherSequence('->', balance)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// world system (t-009, pipeline position 2)
// ---------------------------------------------------------------------------

describe('world system (t-009)', () => {
  const balance = loadBalance();

  it('initWorld builds a deterministic world state', () => {
    const mission = makeMission(1001);
    const a = initWorld(mission, 1001, balance);
    const b = initWorld(mission, 1001, balance);
    expect(a).toEqual(b);
    expect(a.currentWeather).toBe('Clear');
    expect(a.segmentIndex).toBe(0);
    expect(a.sequence).toEqual([['Clear', 0]]);
    // different seeds → different oceans
    const c = initWorld(mission, 1002, balance);
    expect(c.ocean).not.toEqual(a.ocean);
  });

  it('initWorld rejects a mission without a positive par time', () => {
    const mission = makeMission(1001, { parTimeS: 0 });
    expect(() => initWorld(mission, 1001, balance)).toThrow(TypeError);
  });

  it('worldSystem advances weather with simTime — zero RNG, ocean untouched', () => {
    const mission = makeMission(1001, {
      weather: 'Clear->Cloudy' as unknown as WeatherKind,
      parTimeS: 100,
    });
    const state = initWorld(mission, 1001, balance);
    const oceanBefore = JSON.stringify(state.ocean);
    const system = createWorldSystem(state);

    expect(activeWeather(state)).toBe('Clear');
    system(fakeCtx(10, mission, balance)); // 10% — Clear segment
    expect(activeWeather(state)).toBe('Clear');
    system(fakeCtx(49.99, mission, balance)); // just before the midpoint
    expect(activeWeather(state)).toBe('Clear');
    system(fakeCtx(50, mission, balance)); // exactly 0.5 → Cloudy takes over
    expect(activeWeather(state)).toBe('Cloudy');
    expect(state.segmentIndex).toBe(1);
    system(fakeCtx(200, mission, balance)); // past par time → still last segment
    expect(activeWeather(state)).toBe('Cloudy');
    expect(state.segmentIndex).toBe(1);

    // steady-state ticks never touch the ocean (no RNG, no mutation)
    expect(JSON.stringify(state.ocean)).toBe(oceanBefore);
    expect(weatherModifiersFor(state, balance)).toEqual(weatherModifiers('Cloudy', balance));
  });

  it('single-kind missions never transition', () => {
    const mission = makeMission(1001, { weather: 'Storm', parTimeS: 60 });
    const state = initWorld(mission, 1001, balance);
    const system = createWorldSystem(state);
    system(fakeCtx(0, mission, balance));
    system(fakeCtx(30, mission, balance));
    system(fakeCtx(999, mission, balance));
    expect(activeWeather(state)).toBe('Storm');
    expect(state.segmentIndex).toBe(0);
  });

  it('a chain of three kinds hands over at 1/3 and 2/3', () => {
    const mission = makeMission(1001, {
      weather: 'Clear->Cloudy->Storm' as unknown as WeatherKind,
      parTimeS: 90,
    });
    const state = initWorld(mission, 1001, balance);
    const system = createWorldSystem(state);
    system(fakeCtx(29, mission, balance));
    expect(activeWeather(state)).toBe('Clear');
    system(fakeCtx(30, mission, balance)); // 1/3
    expect(activeWeather(state)).toBe('Cloudy');
    system(fakeCtx(60, mission, balance)); // 2/3
    expect(activeWeather(state)).toBe('Storm');
  });
});

// ---------------------------------------------------------------------------
// source hygiene: no Math.random / DOM in src/world (ADR-004 / @pure)
// ---------------------------------------------------------------------------

describe('src/world source hygiene', () => {
  const sources: ReadonlyArray<readonly [string, string]> = [
    ['ocean.ts', oceanSrc],
    ['weather.ts', weatherSrc],
    ['currents.ts', currentsSrc],
    ['world.ts', worldSrc],
  ];

  it('contains no Math.random and no browser/DOM API references', () => {
    for (const [name, src] of sources) {
      // grep for the CALL form — header comments may mention the ban
      expect(src.match(/Math\.random\s*\(/), `${name} must not call Math.random`).toBeNull();
      expect(
        src.match(/\bwindow\b|\bdocument\b|localStorage|AudioContext|performance\.now|Date\.now/),
        `${name} must stay @pure`,
      ).toBeNull();
    }
  });
});
