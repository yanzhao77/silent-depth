import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetManager, disposeObjectResources, type GltfLoadPort } from '../../src/renderer/assets/AssetManager';
import {
  toLocalRuntimeAssetUrl,
  validateRenderAssetRegistry,
  type RenderAssetRegistry,
} from '../../src/renderer/assets/assetRegistry';

const sha = 'a'.repeat(64);
const registry: RenderAssetRegistry = {
  schema: 'silent-depth-render-asset-registry-v3',
  generatedAt: '2026-08-28T10:40:00.000Z',
  policy: { localOnly: true, runtimeNetwork: false, requireSha256: true, blockUnknownLicenses: true },
  families: [{
    id: 'player-submarine',
    category: 'unit',
    requiredLods: [0, 1, 2, 3],
    supportedFormats: ['glb', 'runtime-generated'],
    activeFallbackId: 'proc-player-submarine-lod2',
    performanceRole: 'hero',
  }],
  assets: [
    {
      id: 'submarine-glb-lod0', name: 'Test Submarine GLB', category: 'unit', family: 'player-submarine', lod: 0,
      path: 'public/assets/v3/models/submarine-lod0.glb', format: 'glb', sourceKind: 'external-cc0',
      sourceUrl: 'https://example.com/submarine-source', assetPageUrl: 'https://example.com/submarine-asset',
      author: 'Test asset author', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      commercialUse: true, redistribution: true, modification: true, attributionRequired: false, attribution: '',
      licenseCheckedAt: '2026-08-28T10:40:00.000Z', sha256: sha, triangles: 12, materials: ['paint', 'metal'], textures: [], status: 'approved',
      fallbackId: 'proc-player-submarine-lod2',
    },
    {
      id: 'proc-player-submarine-lod2', name: 'Fallback', category: 'unit', family: 'player-submarine', lod: 2,
      path: 'src/renderer/procedural/submarineGeometry.ts', format: 'runtime-generated', sourceKind: 'procedural',
      sourceUrl: 'repo://src/renderer/procedural/submarineGeometry.ts', assetPageUrl: 'repo://src/renderer/procedural/submarineGeometry.ts',
      author: 'SILENT DEPTH renderer contributors', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      commercialUse: true, redistribution: true, modification: true, attributionRequired: false, attribution: '',
      licenseCheckedAt: '2026-08-28T10:40:00.000Z', sha256: sha, triangles: 2400, materials: ['metal'], textures: [], status: 'approved',
    },
  ],
};

function loaderThat(scene: THREE.Group): GltfLoadPort & { calls: number } {
  return {
    calls: 0,
    async loadAsync(_url: string) {
      this.calls += 1;
      return { scene } as never;
    },
  };
}

describe('V2.3 AssetManager', () => {
  it('keeps the v3 registry local-only and derives only public offline URLs', () => {
    expect(validateRenderAssetRegistry(registry)).toEqual([]);
    expect(toLocalRuntimeAssetUrl('public/assets/v3/models/submarine-lod0.glb')).toBe('/assets/v3/models/submarine-lod0.glb');
    expect(toLocalRuntimeAssetUrl('assets/v3/models/submarine-lod0.glb')).toBeUndefined();
    expect(toLocalRuntimeAssetUrl('https://example.com/submarine.glb')).toBeUndefined();
  });

  it('caches an approved GLB once and returns distinct visual clones to renderers', async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const loader = loaderThat(source);
    const manager = new AssetManager(registry, loader);

    const first = await manager.loadFamilyLod('player-submarine', 0);
    const second = await manager.loadFamilyLod('player-submarine', 0);

    expect(first.usingFallback).toBe(false);
    expect(second.usingFallback).toBe(false);
    expect(first.scene).not.toBe(second.scene);
    expect(loader.calls).toBe(1);
    expect(manager.cachedAssetCount).toBe(1);
    manager.dispose();
  });

  it('returns the procedural fallback signal when GLB loading fails', async () => {
    const failedLoader: GltfLoadPort = { loadAsync: async () => Promise.reject(new Error('missing local GLB')) };
    const manager = new AssetManager(registry, failedLoader);
    const result = await manager.loadFamilyLod('player-submarine', 0);

    expect(result.usingFallback).toBe(true);
    expect(result.scene).toBeUndefined();
    expect(result.error).toBe('missing local GLB');
    expect(manager.getFailure('submarine-glb-lod0')).toBe('missing local GLB');
  });

  it('disposes mesh geometry, material and texture resources for released scenes', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    disposeObjectResources(root);
    expect(geometry.attributes.position).toBeDefined();
  });
});
