import { describe, expect, it } from 'vitest';
import combatEffectsSource from '../../../renderer/three/EffectsManager.ts?raw';
import oceanSource from '../../../renderer/three/OceanRenderer.ts?raw';
import skySource from '../../../renderer/three/SkyRenderer.ts?raw';
import shipSource from '../../../renderer/procedural/shipGeometry.ts?raw';
import submarineSource from '../../../renderer/procedural/submarineGeometry.ts?raw';
import registryRaw from '../../../assets/v2/registry.json?raw';
import {
  isLocalAssetPath,
  resolveApprovedRenderAsset,
  validateRenderAssetRegistry,
  type RenderAssetRegistry,
} from '../assets/assetRegistry';

const registry = JSON.parse(registryRaw) as RenderAssetRegistry;

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const sourceByPath: Readonly<Record<string, string>> = {
  'src/renderer/procedural/submarineGeometry.ts': submarineSource,
  'src/renderer/procedural/shipGeometry.ts': shipSource,
  'src/renderer/three/OceanRenderer.ts': oceanSource,
  'src/renderer/three/SkyRenderer.ts': skySource,
  'src/renderer/three/EffectsManager.ts': combatEffectsSource,
};

describe('V2.2 renderer asset pipeline', () => {
  it('uses a local-only conservative registry that is valid before any third-party import', () => {
    expect(registry.policy).toEqual({
      localOnly: true,
      runtimeNetwork: false,
      requireSha256: true,
      blockUnknownLicenses: true,
    });
    expect(validateRenderAssetRegistry(registry)).toEqual([]);
  });

  it('declares the hero submarine and five hostile ship families with LOD plans and approved procedural fallbacks', () => {
    const familyById = new Map(registry.families.map((family) => [family.id, family]));
    const submarine = familyById.get('player-submarine');
    expect(submarine?.requiredLods).toEqual([0, 1, 2, 3]);
    expect(submarine?.activeFallbackId).toBe('proc-player-submarine-lod2');

    for (const familyId of ['merchant', 'cargo', 'tanker', 'destroyer', 'frigate']) {
      const family = familyById.get(familyId);
      expect(family, `${familyId} family`).toBeDefined();
      expect(family?.requiredLods).toContain(2);
      expect(registry.assets.find((asset) => asset.id === family?.activeFallbackId)?.status).toBe('approved');
    }
  });

  it('records actual hashes for all current runtime-generated fallback source files', async () => {
    for (const asset of registry.assets) {
      expect(asset.sourceKind, `${asset.id} source kind`).toBe('procedural');
      expect(asset.format, `${asset.id} format`).toBe('runtime-generated');
      expect(asset.license, `${asset.id} license`).toBe('CC0');
      const source = sourceByPath[asset.path];
      expect(source, `${asset.id} source file`).toBeDefined();
      await expect(sha256Hex(source!)).resolves.toBe(asset.sha256);
    }
  });

  it('rejects remote, absolute, traversal and platform-specific asset paths', () => {
    for (const invalidPath of [
      'https://cdn.example.com/submarine.glb',
      'http://cdn.example.com/texture.ktx2',
      '/assets/submarine.glb',
      '../assets/submarine.glb',
      'assets/../secret.glb',
      'C:\\assets\\submarine.glb',
      './assets/submarine.glb',
    ]) {
      expect(isLocalAssetPath(invalidPath), invalidPath).toBe(false);
    }
    expect(isLocalAssetPath('assets/v2/units/submarine-lod0.glb')).toBe(true);
  });

  it('resolves only approved local assets and retains the declared fallback behavior', () => {
    expect(resolveApprovedRenderAsset(registry, 'proc-player-submarine-lod2')?.id).toBe(
      'proc-player-submarine-lod2',
    );
    expect(resolveApprovedRenderAsset(registry, 'not-a-registered-asset')).toBeUndefined();
  });
});
