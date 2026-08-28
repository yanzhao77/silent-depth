import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  resolveFamilyLodAsset,
  toLocalRuntimeAssetUrl,
  type RenderAssetRecord,
  type RenderAssetRegistry,
} from './assetRegistry';

export interface GltfLoadPort {
  loadAsync(url: string): Promise<GLTF>;
}

export interface RenderAssetLoadResult {
  readonly record: RenderAssetRecord | undefined;
  readonly scene: THREE.Group | undefined;
  readonly usingFallback: boolean;
  readonly error?: string;
}

/**
 * Local-only visual asset lifecycle manager.
 *
 * It intentionally owns no simulation data. The caller asks for a visual
 * family and LOD, and receives either an approved checked-in GLB scene clone
 * or an explicit signal to retain its procedural fallback.
 */
export class AssetManager {
  private readonly cache = new Map<string, Promise<THREE.Group>>();
  private readonly failures = new Map<string, string>();
  private disposed = false;

  constructor(
    private readonly registry: RenderAssetRegistry,
    private readonly loader: GltfLoadPort = new GLTFLoader(),
  ) {}

  async loadFamilyLod(
    familyId: string,
    lod: 0 | 1 | 2 | 3,
  ): Promise<RenderAssetLoadResult> {
    if (this.disposed) {
      return { record: undefined, scene: undefined, usingFallback: true, error: 'asset manager disposed' };
    }

    const record = resolveFamilyLodAsset(this.registry, familyId, lod);
    if (!record || (record.format !== 'glb' && record.format !== 'gltf')) {
      return { record, scene: undefined, usingFallback: true };
    }

    const runtimeUrl = toLocalRuntimeAssetUrl(record.path);
    if (!runtimeUrl) {
      return {
        record,
        scene: undefined,
        usingFallback: true,
        error: 'asset path is not a checked-in public runtime path',
      };
    }

    try {
      const cachedScene = await this.loadRecord(record, runtimeUrl);
      return { record, scene: cachedScene.clone(true), usingFallback: false };
    } catch (error) {
      return {
        record,
        scene: undefined,
        usingFallback: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getFailure(assetId: string): string | undefined {
    return this.failures.get(assetId);
  }

  get cachedAssetCount(): number {
    return this.cache.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.cache.values()) {
      void pending.then((scene) => disposeObjectResources(scene)).catch(() => undefined);
    }
    this.cache.clear();
    this.failures.clear();
  }

  private loadRecord(record: RenderAssetRecord, runtimeUrl: string): Promise<THREE.Group> {
    const existing = this.cache.get(record.id);
    if (existing) return existing;

    const pending = this.loader.loadAsync(runtimeUrl)
      .then((gltf) => {
        const scene = gltf.scene;
        scene.name = record.id;
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        return scene;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.failures.set(record.id, message);
        this.cache.delete(record.id);
        throw error;
      });

    this.cache.set(record.id, pending);
    return pending;
  }
}

export function disposeObjectResources(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}
