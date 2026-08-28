import { describe, expect, it } from 'vitest';
import registryRaw from '../../assets/v3/registry.json?raw';
import { validateRenderAssetRegistry, type RenderAssetRegistry } from '../../src/renderer/assets/assetRegistry';

const registry = JSON.parse(registryRaw) as RenderAssetRegistry;
const heroLods = registry.assets
  .filter((asset) => asset.family === 'player-submarine' && asset.format === 'glb')
  .sort((left, right) => left.lod - right.lod);

describe('V2.3 project-owned GLB hero assets', () => {
  it('keeps the checked-in V2.3 registry valid and local-only', () => {
    expect(validateRenderAssetRegistry(registry)).toEqual([]);
    expect(registry.policy).toMatchObject({ localOnly: true, runtimeNetwork: false, requireSha256: true });
  });

  it('registers all required hero-submarine GLB LODs with project provenance and a procedural fallback', () => {
    expect(heroLods.map((asset) => asset.lod)).toEqual([0, 1, 2, 3]);
    for (const asset of heroLods) {
      expect(asset.path).toMatch(/^public\/assets\/v3\/models\/hero-submarine-lod[0-3]\.glb$/);
      expect(asset.sourceKind).toBe('project-owned');
      expect(asset.sourceUrl).toBe('repo://tools/assets/make_submarine_glb.py');
      expect(asset.license).toBe('CC0');
      expect(asset.attributionRequired).toBe(false);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.fallbackId).toBe('proc-player-submarine-lod2');
    }
  });

  it('keeps the actual exported GLB triangle budgets below hero and far-distance limits', () => {
    expect(heroLods[0]?.triangles).toBeLessThanOrEqual(18_000);
    expect(heroLods[1]?.triangles).toBeLessThanOrEqual(12_000);
    expect(heroLods[2]?.triangles).toBeLessThanOrEqual(4_000);
    expect(heroLods[3]?.triangles).toBeLessThanOrEqual(2_500);
  });
});
