import { afterEach, describe, expect, it } from 'vitest';
import {
  getQualityLevel,
  getQualitySettings,
  setQualityLevel,
  type QualityLevel,
} from '../../src/renderer/three/QualityPresets';

const LEVELS: readonly QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

afterEach(() => setQualityLevel('HIGH'));

describe('V2.2 renderer quality presets', () => {
  it('exposes each supported runtime quality level', () => {
    for (const level of LEVELS) {
      setQualityLevel(level);
      expect(getQualityLevel()).toBe(level);
    }
  });

  it('uses a strictly lighter budget at LOW than HIGH', () => {
    setQualityLevel('LOW');
    const low = getQualitySettings();
    setQualityLevel('HIGH');
    const high = getQualitySettings();

    expect(low.shadowEnabled).toBe(false);
    expect(low.oceanSegments).toBeLessThan(high.oceanSegments);
    expect(low.particleCount).toBeLessThan(high.particleCount);
    expect(low.rainCount).toBeLessThan(high.rainCount);
    expect(low.lodDistanceMultiplier).toBeLessThan(high.lodDistanceMultiplier);
    expect(low.pixelRatioMax).toBeLessThan(high.pixelRatioMax);
    expect(low.postProcessing).toBe(false);
  });

  it('keeps progressively usable, bounded rendering budgets', () => {
    const budgets = LEVELS.map((level) => {
      setQualityLevel(level);
      return getQualitySettings();
    });

    for (let index = 1; index < budgets.length; index++) {
      const previous = budgets[index - 1]!;
      const current = budgets[index]!;
      expect(current.oceanSegments).toBeGreaterThanOrEqual(previous.oceanSegments);
      expect(current.rainCount).toBeGreaterThanOrEqual(previous.rainCount);
      expect(current.shadowMapSize).toBeGreaterThanOrEqual(previous.shadowMapSize);
      expect(current.pixelRatioMax).toBeGreaterThanOrEqual(previous.pixelRatioMax);
    }
  });
});
