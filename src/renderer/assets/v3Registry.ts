import registryRaw from '../../../assets/v3/registry.json?raw';
import { validateRenderAssetRegistry, type RenderAssetRegistry } from './assetRegistry';

const parsed = JSON.parse(registryRaw) as RenderAssetRegistry;
const issues = validateRenderAssetRegistry(parsed);
if (issues.length > 0) {
  throw new Error(`Invalid V2.3 render asset registry: ${issues.map((issue) => `${issue.assetId}: ${issue.message}`).join('; ')}`);
}

/** Checked-in, local-only V2.3 render asset catalogue. */
export const V3_RENDER_ASSET_REGISTRY: RenderAssetRegistry = parsed;
