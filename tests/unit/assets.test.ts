// SILENT DEPTH — asset registry + procedural factory tests (t-011 / FR-21)
//
// These tests run in Node (vitest environment: 'node'). They verify:
//   1. registry completeness — every entry has exactly the FR-21 fields
//   2. sha256 — valid 64-char hex AND equal to the REAL on-disk hash of the
//      defining code (src/rendering/sprites.ts), computed via WebCrypto
//   3. path security — registry paths are local relative paths, no external URLs
//   4. ship-class coverage — every ship class in config/balance.json has a sprite
//   5. resolution policy — no raster entry exceeds 512×512; classes 128/256/512
//   6. license gate — every entry is CC0 + procedural + correct licenseUrl
//   7. manifest consistency — assets/registry.json ↔ SPRITE_MANIFEST in code
//
// Importing sprites.ts here also proves the module is importable in Node
// (no DOM at import time, per the sprites.ts Node-compatibility contract).
import { describe, expect, it } from 'vitest';
import { CONTACT_STATE_COLORS, CONTACT_STATES, SPRITE_MANIFEST } from '../../src/rendering/sprites';
import registryRaw from '../../assets/registry.json?raw';
import balanceRaw from '../../config/balance.json?raw';
import spritesSource from '../../src/rendering/sprites.ts?raw';

interface RegistryAsset {
  id: string;
  name: string;
  type: string;
  path: string;
  source: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  sha256: string;
  width: number;
  height: number;
  format: string;
  style: string;
  version: string;
  createdAt: string;
}

interface RegistryFile {
  schema: string;
  assets: RegistryAsset[];
}

const registry = JSON.parse(registryRaw) as RegistryFile;

/** FR-21 required registry fields (artifacts/requirements.md §3). */
const REQUIRED_FIELDS = [
  'id',
  'name',
  'type',
  'path',
  'source',
  'author',
  'license',
  'licenseUrl',
  'attribution',
  'sha256',
  'width',
  'height',
  'format',
  'style',
  'version',
  'createdAt',
] as const;

const SHA256_RE = /^[0-9a-f]{64}$/;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const byId = new Map(registry.assets.map((entry) => [entry.id, entry]));

describe('asset registry — completeness (FR-21)', () => {
  it('has a non-empty asset list with unique ids', () => {
    expect(registry.assets.length).toBeGreaterThan(0);
    expect(byId.size).toBe(registry.assets.length);
  });

  it('every entry carries exactly the FR-21 fields — no missing keys', () => {
    for (const entry of registry.assets) {
      expect(Object.keys(entry).sort(), `fields of ${entry.id}`).toEqual(
        [...REQUIRED_FIELDS].sort(),
      );
    }
  });

  it('every entry has sane non-empty scalar values', () => {
    for (const entry of registry.assets) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.type.length).toBeGreaterThan(0);
      expect(entry.path.length).toBeGreaterThan(0);
      expect(entry.width).toBeGreaterThan(0);
      expect(entry.height).toBeGreaterThan(0);
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
    }
  });
});

describe('asset registry — sha256 integrity (FR-21)', () => {
  it('every sha256 is a valid 64-char hex string', () => {
    for (const entry of registry.assets) {
      expect(entry.sha256, `sha256 of ${entry.id}`).toMatch(SHA256_RE);
    }
  });

  it('every sha256 equals the REAL on-disk hash of the defining code (sprites.ts)', async () => {
    const expected = await sha256Hex(spritesSource);
    expect(expected).toMatch(SHA256_RE);
    for (const entry of registry.assets) {
      expect(entry.sha256, `sha256 of ${entry.id} matches sprites.ts`).toBe(expected);
    }
  });
});

describe('asset registry — path security (GAME_ARCHITECTURE §12)', () => {
  it('no external URLs, absolute paths or drive-letter paths anywhere in path', () => {
    for (const entry of registry.assets) {
      expect(entry.path.startsWith('http://'), `${entry.id} path http://`).toBe(false);
      expect(entry.path.startsWith('https://'), `${entry.id} path https://`).toBe(false);
      expect(entry.path.includes('://'), `${entry.id} path protocol`).toBe(false);
      expect(entry.path.startsWith('/'), `${entry.id} path absolute`).toBe(false);
      expect(entry.path, `${entry.id} path drive-letter`).not.toMatch(/^[a-zA-Z]:[\\/]/);
    }
  });
});

describe('asset registry — ship-class coverage (balance.json ↔ sprites)', () => {
  it('every ship class in balance.json has a ship sprite entry', () => {
    const balance = JSON.parse(balanceRaw) as {
      sonar: { classification: { types: Record<string, unknown> } };
    };
    const shipClasses = Object.keys(balance.sonar.classification.types);
    expect(shipClasses.length).toBeGreaterThanOrEqual(5);
    for (const shipClass of shipClasses) {
      const id = `sprite-${shipClass.toLowerCase()}`;
      const entry = byId.get(id);
      expect(entry, `sprite entry for ship class "${shipClass}" (id ${id})`).toBeDefined();
      expect(entry!.type, `type of ${id}`).toBe('ship');
    }
  });
});

describe('asset registry — resolution policy (VISUAL_STYLE §6)', () => {
  it('no raster entry exceeds 512×512; raster sizes are 128/256/512', () => {
    for (const entry of registry.assets) {
      expect(entry.width, `width of ${entry.id}`).toBeLessThanOrEqual(512);
      expect(entry.height, `height of ${entry.id}`).toBeLessThanOrEqual(512);
      if (entry.format === 'canvas-2d') {
        expect([128, 256, 512], `raster width class of ${entry.id}`).toContain(entry.width);
        expect(entry.width, `square raster of ${entry.id}`).toBe(entry.height);
      }
    }
  });

  it('the 6 ship sprites use the VISUAL_STYLE class sizes (256/512)', () => {
    const shipIds = [
      'sprite-submarine',
      'sprite-merchant',
      'sprite-cargo',
      'sprite-tanker',
      'sprite-destroyer',
      'sprite-frigate',
    ];
    for (const id of shipIds) {
      const entry = byId.get(id);
      expect(entry, `ship sprite ${id}`).toBeDefined();
      expect([256, 512]).toContain(entry!.width);
    }
  });
});

describe('asset registry — license gate (FR-21 §3)', () => {
  it('every entry is CC0 + procedural + factory author + correct licenseUrl (zero third-party)', () => {
    for (const entry of registry.assets) {
      expect(entry.source, `source of ${entry.id}`).toBe('procedural');
      expect(entry.author, `author of ${entry.id}`).toBe('DeepSeek Software Factory');
      expect(entry.license, `license of ${entry.id}`).toBe('CC0');
      expect(entry.licenseUrl, `licenseUrl of ${entry.id}`).toBe(
        'https://creativecommons.org/publicdomain/zero/1.0/',
      );
      expect(entry.attribution, `attribution of ${entry.id}`).toBe('');
      expect(entry.style, `style of ${entry.id}`).toBe('tactical-2d-muted');
    }
  });
});

describe('asset registry — manifest consistency (registry.json ↔ sprites.ts)', () => {
  it('sprites.ts imports cleanly in Node and exposes a complete manifest', () => {
    expect(SPRITE_MANIFEST.length).toBeGreaterThan(0);
    expect(SPRITE_MANIFEST.length).toBe(registry.assets.length);
    expect(CONTACT_STATES.length).toBe(5);
    for (const state of CONTACT_STATES) {
      expect(CONTACT_STATE_COLORS[state], `contact color for ${state}`).toMatch(/^#/);
    }
  });

  it('every registry entry has a matching manifest entry with same dims/format', () => {
    const manifestById = new Map(SPRITE_MANIFEST.map((entry) => [entry.id, entry]));
    for (const entry of registry.assets) {
      const manifest = manifestById.get(entry.id);
      expect(manifest, `manifest entry for ${entry.id}`).toBeDefined();
      expect(entry.width, `width of ${entry.id}`).toBe(manifest!.width);
      expect(entry.height, `height of ${entry.id}`).toBe(manifest!.height);
      expect(entry.format, `format of ${entry.id}`).toBe(manifest!.format);
    }
  });

  it('every manifest entry is registered (no orphan sprites)', () => {
    for (const manifest of SPRITE_MANIFEST) {
      expect(byId.has(manifest.id), `registry entry for ${manifest.id}`).toBe(true);
    }
  });

  it('contact ring state variants are registered for all five states', () => {
    for (const state of CONTACT_STATES) {
      expect(byId.has(`fx-contact-ring-${state}`), `ring for ${state}`).toBe(true);
    }
  });
});
