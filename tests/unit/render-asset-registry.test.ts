import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import combatEffectsSource from '../../src/renderer/three/EffectsManager.ts?raw';
import oceanSource from '../../src/renderer/three/OceanRenderer.ts?raw';
import skySource from '../../src/renderer/three/SkyRenderer.ts?raw';
import shipSource from '../../src/renderer/procedural/shipGeometry.ts?raw';
import { createShipGeometry, createShipLodGeometry } from '../../src/renderer/procedural/shipGeometry';
import submarineSource from '../../src/renderer/procedural/submarineGeometry.ts?raw';
import { createSubmarineGeometry } from '../../src/renderer/procedural/submarineGeometry';
import registryRaw from '../../assets/v2/registry.json?raw';
import {
  isLocalAssetPath,
  resolveApprovedRenderAsset,
  validateRenderAssetRegistry,
  type RenderAssetRegistry,
} from '../../src/renderer/assets/assetRegistry';

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

  it('builds all four local submarine detail levels with the hero silhouette parts and lower far-detail density', () => {
    const lod0 = createSubmarineGeometry(0);
    const lod1 = createSubmarineGeometry(1);
    const lod2 = createSubmarineGeometry(2);
    const lod3 = createSubmarineGeometry(3);

    for (const parts of [lod0, lod1, lod2, lod3]) {
      expect(parts.group.name).toMatch(/^player-submarine-lod[0-3]$/);
      expect(parts.group.getObjectByName('pressure-hull')).toBeDefined();
      expect(parts.group.getObjectByName('conning-tower')).toBeDefined();
      expect(parts.group.getObjectByName('periscope-shaft')).toBeDefined();
      expect(parts.group.getObjectByName('rudder')).toBeDefined();
      expect(parts.group.getObjectByName('five-blade-propeller')).toBeDefined();
    }
    expect(lod0.group.children.length).toBeGreaterThan(lod1.group.children.length);
    expect(lod1.group.children.length).toBeGreaterThan(lod2.group.children.length);
    expect(lod2.group.children.length).toBeGreaterThan(lod3.group.children.length);
    expect(lod0.group.getObjectByName('forward-torpedo-tube')).toBeDefined();
    expect(lod3.group.getObjectByName('forward-torpedo-tube')).toBeUndefined();
  });

  it('builds five visually distinct local ship classes and preserves each class at every LOD', () => {
    const requiredPartByClass: Readonly<Record<string, string>> = {
      Merchant: 'merchant-crane-arm',
      Cargo: 'cargo-container',
      Tanker: 'tanker-deck-tank',
      Destroyer: 'destroyer-forward-gun-turret',
      Frigate: 'frigate-flight-deck',
    };
    const partCounts = new Set<number>();
    for (const [shipClass, requiredPart] of Object.entries(requiredPartByClass)) {
      const lod0 = createShipGeometry(shipClass, 0);
      const lod3 = createShipGeometry(shipClass, 3);
      expect(lod0.getObjectByName('ship-hull'), `${shipClass} hull`).toBeDefined();
      expect(lod0.getObjectByName(requiredPart), `${shipClass} identifying silhouette part`).toBeDefined();
      expect(lod0.children.length, `${shipClass} near detail`).toBeGreaterThan(lod3.children.length);
      partCounts.add(lod0.children.length);

      const lodRoot = createShipLodGeometry(shipClass);
      expect(lodRoot.children).toHaveLength(1);
      expect((lodRoot.children[0] as THREE.LOD).levels).toHaveLength(4);
    }
    expect(partCounts.size).toBeGreaterThanOrEqual(3);
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
