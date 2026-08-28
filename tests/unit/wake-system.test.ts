import { describe, expect, it } from 'vitest';
import {
  MAX_WAKES,
  collectWakeSources,
  headingToForward,
  makePlayerWake,
  makeShipWake,
  wakeFoamIntensity,
  type WakeSource,
} from '../../src/renderer/three/wake/WakeSystem';
import type { RenderState } from '../../src/renderer/types';

function src(over: Partial<WakeSource> = {}): WakeSource {
  return { x: 0, z: 0, headingRad: 0, speedKt: 8, widthScale: 1, ...over };
}

function minimalState(player: Partial<RenderState['player']> = {}, ships: RenderState['ships'] = []): RenderState {
  return {
    player: {
      position: { x: 0, y: 0, z: 0 },
      headingDeg: 0,
      speedKt: 8,
      depthLayer: 'Medium',
      depthM: 0,
      pitchDeg: 0,
      rollDeg: 0,
      hull: 1,
      battery: 1,
      noise: 0,
      detection: 0,
      periscopeState: { state: 'LOWERED', progress: 0 },
      ...player,
    },
    ships,
  } as unknown as RenderState;
}

describe('V2.4 WakeSystem — heading convention', () => {
  it('maps heading 0 to world-forward (0, -1) matching the model rotation', () => {
    const f = headingToForward(0);
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.z).toBeCloseTo(-1, 5);
  });
  it('maps heading 90 to forward (1, 0)', () => {
    const f = headingToForward(90);
    expect(f.x).toBeCloseTo(1, 5);
    expect(f.z).toBeCloseTo(0, 5);
  });
});

describe('V2.4 WakeSystem — foam shape', () => {
  it('produces no wake when the source is stopped', () => {
    const s = src({ speedKt: 0 });
    expect(wakeFoamIntensity(0, -0.0016, s)).toBe(0);
    expect(wakeFoamIntensity(0, 0.004, s)).toBe(0);
  });

  it('produces a bright bow wave just ahead of the bow', () => {
    const s = src({ speedKt: 9, headingRad: 0 }); // forward = (0, -1)
    const bow = wakeFoamIntensity(0, -0.0016, s);
    expect(bow).toBeGreaterThan(0.3);
  });

  it('produces a turbulent stern wake behind the vessel', () => {
    const s = src({ speedKt: 9, headingRad: 0 });
    const stern = wakeFoamIntensity(0, 0.004, s);
    expect(stern).toBeGreaterThan(0.2);
  });

  it('produces a diverging Kelvin V-wake at ~19 deg off the centreline', () => {
    const s = src({ speedKt: 9, headingRad: 0 });
    const vHalf = 0.354 * 0.006;
    const onLine = wakeFoamIntensity(vHalf, 0.006, s);
    const offLine = wakeFoamIntensity(vHalf * 2.4, 0.006, s);
    expect(onLine).toBeGreaterThan(offLine);
  });

  it('produces no foam far from the vessel', () => {
    const s = src({ speedKt: 9 });
    expect(wakeFoamIntensity(100, 100, s)).toBe(0);
  });

  it('keeps intensity within 0..1', () => {
    const s = src({ speedKt: 12, widthScale: 1.5 });
    for (const z of [0.0005, 0.002, 0.006, 0.02, 0.05]) {
      const v = wakeFoamIntensity(0, z, s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('V2.4 WakeSystem — source collection (RenderState only)', () => {
  it('always includes the player submarine wake', () => {
    const state = minimalState({ speedKt: 6 });
    const sources = collectWakeSources(state);
    expect(sources.length).toBe(1);
    expect(sources[0]).toEqual(makePlayerWake(state.player));
  });

  it('includes only already-visible ships (no gameplay guessing)', () => {
    const ships: RenderState['ships'] = [
      { id: 'a', shipClass: 'Destroyer', position: { x: 1, y: 0, z: 2 }, headingDeg: 90, speedKt: 10, aiState: 'NORMAL', visible: true, variant: 'x', hull: 1 },
      { id: 'b', shipClass: 'Tanker', position: { x: 3, y: 0, z: 4 }, headingDeg: 45, speedKt: 8, aiState: 'NORMAL', visible: false, variant: 'y', hull: 1 },
    ];
    const sources = collectWakeSources(minimalState({ speedKt: 6 }, ships));
    expect(sources.length).toBe(2);
    expect(sources[1]).toEqual(makeShipWake(ships[0]!));
  });

  it('caps the number of wakes at MAX_WAKES', () => {
    const ships: RenderState['ships'] = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`, shipClass: 'Destroyer', position: { x: i, y: 0, z: i },
      headingDeg: 0, speedKt: 10, aiState: 'NORMAL', visible: true, variant: 'v', hull: 1,
    }));
    const sources = collectWakeSources(minimalState({ speedKt: 6 }, ships));
    expect(sources.length).toBe(MAX_WAKES);
  });

  it('assigns wider wakes to tankers than to the submarine', () => {
    const tanker: RenderState['ships'][number] = { shipClass: 'Tanker', position: { x: 0, y: 0, z: 0 }, headingDeg: 0, speedKt: 8, aiState: 'NORMAL', visible: true, variant: 'v', hull: 1, id: 't' };
    expect(makeShipWake(tanker).widthScale)
      .toBeGreaterThan(makePlayerWake(minimalState({ speedKt: 8 }).player).widthScale);
  });
});
