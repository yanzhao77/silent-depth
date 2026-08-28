/**
 * V2.2 render-asset registry contracts.
 *
 * This module is deliberately renderer-only. It contains no simulation import and
 * never mutates GameSnapshot, RenderState, or game state. The registry provides a
 * conservative admission gate for local visual assets before a renderer consumes
 * them in later V2.2 phases.
 */

export type RenderAssetFormat = 'runtime-generated' | 'glb' | 'gltf' | 'ktx2' | 'png' | 'jpg' | 'svg';
export type RenderAssetSourceKind = 'procedural' | 'external-cc0' | 'external-cc-by' | 'commercial';
export type RenderAssetLicense = 'CC0' | 'CC-BY-4.0' | 'commercial';
export type RenderAssetStatus = 'approved' | 'candidate' | 'blocked';
export type RenderMaterialSemantic =
  | 'metal'
  | 'paint'
  | 'rust'
  | 'wet-metal'
  | 'glass'
  | 'rubber'
  | 'wood'
  | 'water';

export interface RenderTextureDescriptor {
  readonly usage: 'base-color' | 'normal' | 'orm' | 'emissive' | 'environment';
  readonly path: string;
  readonly format: Extract<RenderAssetFormat, 'ktx2' | 'png' | 'jpg'>;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export interface RenderAssetRecord {
  readonly id: string;
  readonly name: string;
  readonly category: 'unit' | 'environment' | 'effect' | 'material';
  readonly family: string;
  readonly lod: 0 | 1 | 2 | 3;
  readonly path: string;
  readonly format: RenderAssetFormat;
  readonly sourceKind: RenderAssetSourceKind;
  readonly sourceUrl: string;
  readonly assetPageUrl: string;
  readonly author: string;
  readonly license: RenderAssetLicense;
  readonly licenseUrl: string;
  readonly commercialUse: boolean;
  readonly redistribution: boolean;
  readonly modification: boolean;
  readonly attributionRequired: boolean;
  readonly attribution: string;
  readonly licenseCheckedAt: string;
  readonly sha256: string;
  readonly triangles: number;
  readonly materials: readonly RenderMaterialSemantic[];
  readonly textures: readonly RenderTextureDescriptor[];
  readonly status: RenderAssetStatus;
  readonly fallbackId?: string;
}

export interface RenderAssetFamily {
  readonly id: string;
  readonly category: 'unit' | 'environment' | 'effect';
  readonly requiredLods: readonly (0 | 1 | 2 | 3)[];
  readonly supportedFormats: readonly RenderAssetFormat[];
  readonly activeFallbackId: string;
  readonly performanceRole: 'hero' | 'standard' | 'far' | 'procedural';
}

export interface RenderAssetRegistry {
  readonly schema: 'silent-depth-render-asset-registry-v2' | 'silent-depth-render-asset-registry-v3';
  readonly generatedAt: string;
  readonly policy: {
    readonly localOnly: true;
    readonly runtimeNetwork: false;
    readonly requireSha256: true;
    readonly blockUnknownLicenses: true;
  };
  readonly families: readonly RenderAssetFamily[];
  readonly assets: readonly RenderAssetRecord[];
}

export interface AssetRegistryIssue {
  readonly assetId: string;
  readonly message: string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const LOCAL_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*:\/\/)[a-zA-Z0-9@._/-]+$/;
const FORMAT_SET = new Set<RenderAssetFormat>([
  'runtime-generated',
  'glb',
  'gltf',
  'ktx2',
  'png',
  'jpg',
  'svg',
]);

/** True only for repository-relative paths that cannot escape or invoke a network protocol. */
export function isLocalAssetPath(path: string): boolean {
  return LOCAL_PATH_RE.test(path) && !path.startsWith('./');
}

/**
 * Validates provenance and operational constraints before an asset can be made
 * available to the renderer. It intentionally does not perform file I/O: build
 * and test tooling own raw-file SHA-256 checks, while runtime loading remains local.
 */
export function validateRenderAssetRegistry(registry: RenderAssetRegistry): readonly AssetRegistryIssue[] {
  const issues: AssetRegistryIssue[] = [];
  const assetIds = new Set<string>();
  const familyIds = new Set<string>();

  if (registry.schema !== 'silent-depth-render-asset-registry-v2' && registry.schema !== 'silent-depth-render-asset-registry-v3') {
    issues.push({ assetId: '<registry>', message: 'unsupported registry schema' });
  }
  if (!registry.policy.localOnly || registry.policy.runtimeNetwork || !registry.policy.requireSha256 || !registry.policy.blockUnknownLicenses) {
    issues.push({ assetId: '<registry>', message: 'registry policy must remain local-only, hashed and conservative' });
  }

  for (const family of registry.families) {
    if (familyIds.has(family.id)) {
      issues.push({ assetId: family.id, message: 'duplicate asset family id' });
    }
    familyIds.add(family.id);
    if (family.requiredLods.length === 0) {
      issues.push({ assetId: family.id, message: 'asset family must declare required LOD levels' });
    }
    if (family.supportedFormats.length === 0) {
      issues.push({ assetId: family.id, message: 'asset family must declare supported local formats' });
    }
  }

  for (const asset of registry.assets) {
    if (assetIds.has(asset.id)) {
      issues.push({ assetId: asset.id, message: 'duplicate asset id' });
    }
    assetIds.add(asset.id);

    if (!familyIds.has(asset.family)) {
      issues.push({ assetId: asset.id, message: 'asset references an unknown family' });
    }
    if (!FORMAT_SET.has(asset.format)) {
      issues.push({ assetId: asset.id, message: 'asset has an unsupported format' });
    }
    if (!isLocalAssetPath(asset.path)) {
      issues.push({ assetId: asset.id, message: 'asset path must be a safe repository-relative path' });
    }
    if (!SHA256_RE.test(asset.sha256)) {
      issues.push({ assetId: asset.id, message: 'asset sha256 must be a lower-case 64-character digest' });
    }
    if (Number.isNaN(Date.parse(asset.licenseCheckedAt))) {
      issues.push({ assetId: asset.id, message: 'asset licenseCheckedAt must be ISO-date parseable' });
    }
    if (!asset.commercialUse || !asset.redistribution || !asset.modification) {
      issues.push({ assetId: asset.id, message: 'asset must explicitly permit commercial use, redistribution and modification' });
    }
    if (asset.attributionRequired && asset.attribution.trim().length === 0) {
      issues.push({ assetId: asset.id, message: 'asset requiring attribution must carry attribution text' });
    }
    if (asset.sourceKind === 'procedural') {
      if (asset.format !== 'runtime-generated' || asset.license !== 'CC0') {
        issues.push({ assetId: asset.id, message: 'procedural assets must be CC0 runtime-generated resources' });
      }
      if (!asset.sourceUrl.startsWith('repo://') || !asset.assetPageUrl.startsWith('repo://')) {
        issues.push({ assetId: asset.id, message: 'procedural provenance must point to repository sources' });
      }
    } else {
      if (!asset.sourceUrl.startsWith('https://') || !asset.assetPageUrl.startsWith('https://')) {
        issues.push({ assetId: asset.id, message: 'external provenance must use verifiable HTTPS source pages' });
      }
      if (asset.license === 'CC-BY-4.0' && !asset.attributionRequired) {
        issues.push({ assetId: asset.id, message: 'CC-BY assets must require attribution' });
      }
    }

    for (const texture of asset.textures) {
      if (!isLocalAssetPath(texture.path)) {
        issues.push({ assetId: asset.id, message: `texture ${texture.usage} must use a safe repository-relative path` });
      }
      if (!SHA256_RE.test(texture.sha256)) {
        issues.push({ assetId: asset.id, message: `texture ${texture.usage} must have a SHA-256 digest` });
      }
      if (texture.width <= 0 || texture.height <= 0) {
        issues.push({ assetId: asset.id, message: `texture ${texture.usage} must have positive dimensions` });
      }
    }
  }

  for (const family of registry.families) {
    const fallback = registry.assets.find((asset) => asset.id === family.activeFallbackId);
    if (!fallback) {
      issues.push({ assetId: family.id, message: 'asset family fallback is not registered' });
    } else if (fallback.status !== 'approved') {
      issues.push({ assetId: family.id, message: 'asset family fallback must be approved' });
    }
  }

  return issues;
}

/** Resolves only an approved local record and otherwise preserves the declared fallback. */
export function resolveApprovedRenderAsset(
  registry: RenderAssetRegistry,
  requestedId: string,
): RenderAssetRecord | undefined {
  const candidate = registry.assets.find((asset) => asset.id === requestedId && asset.status === 'approved');
  if (candidate) return candidate;

  const requested = registry.assets.find((asset) => asset.id === requestedId);
  if (!requested?.fallbackId) return undefined;
  return registry.assets.find((asset) => asset.id === requested.fallbackId && asset.status === 'approved');
}

/**
 * Returns the approved GLB/GLTF asset for a visual family and detail level, or
 * its declared local procedural fallback. This is a renderer-only selection;
 * it deliberately receives no gameplay or simulation state.
 */
export function resolveFamilyLodAsset(
  registry: RenderAssetRegistry,
  familyId: string,
  lod: 0 | 1 | 2 | 3,
): RenderAssetRecord | undefined {
  const glbCandidate = registry.assets.find((asset) => (
    asset.family === familyId
    && asset.lod === lod
    && asset.status === 'approved'
    && (asset.format === 'glb' || asset.format === 'gltf')
  ));
  if (glbCandidate) return glbCandidate;

  const family = registry.families.find((item) => item.id === familyId);
  return family ? resolveApprovedRenderAsset(registry, family.activeFallbackId) : undefined;
}

/** Converts a checked-in `public/` asset record to its offline Vite runtime URL. */
export function toLocalRuntimeAssetUrl(path: string): string | undefined {
  if (!isLocalAssetPath(path) || !path.startsWith('public/')) return undefined;
  return `/${path.slice('public/'.length)}`;
}
