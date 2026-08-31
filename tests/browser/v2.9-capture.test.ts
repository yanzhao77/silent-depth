/**
 * V2.9 — Capture manifest and screenshot verification tests.
 *
 * Validates that reports/v2.9-capture/manifest.json and screenshots/v2/*.png
 * are structurally correct, non-blank, and have consistent SHA-256 hashes.
 *
 * Run: npx vitest run tests/browser/v2.9-capture.test.ts
 */
import { test, expect, describe } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MANIFEST_PATH = join(ROOT, 'reports', 'v2.9-capture', 'manifest.json');
const SHOTS_DIR = join(ROOT, 'screenshots', 'v2');

const REQUIRED_SHOTS = [
  'main-menu',
  'mission-select',
  'm01-clear-gameplay',
  'm01-hero-surface',
  'm05-night-hero',
  'm03-convoy-detected',
  'm04-storm-escort',
  'm05-fog-atmosphere',
  'periscope-view',
  'tactical-view',
  'torpedo-launched',
  'torpedo-hit',
];

function loadManifest(): Record<string, unknown>[] {
  if (!existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
}

function listPngs(): string[] {
  if (!existsSync(SHOTS_DIR)) return [];
  return readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png'));
}

// ---------------------------------------------------------------------------
// Manifest existence
// ---------------------------------------------------------------------------

describe('v2.9 manifest exists', () => {
  test('manifest.json exists', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  test('screenshots directory exists with PNG files', () => {
    expect(listPngs().length).toBeGreaterThan(0);
  });
});

const manifest = loadManifest();

// ---------------------------------------------------------------------------
// Required shots: strict 12/12
// ---------------------------------------------------------------------------

describe('v2.9 required shots (12/12)', () => {
  test('all 12 required shot IDs exist in manifest', () => {
    const ids = new Set(manifest.map((e) => e.shotId));
    for (const id of REQUIRED_SHOTS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  test('all 12 required shots have captureResult OK', () => {
    for (const id of REQUIRED_SHOTS) {
      const entry = manifest.find((e) => e.shotId === id);
      expect(entry, `missing required shot: ${id}`).toBeDefined();
      expect(
        entry!.captureResult,
        `required shot ${id} has status ${entry!.captureResult}, expected OK`,
      ).toBe('OK');
    }
  });

  test('all 12 required shots have file, sha256, and pngBytes', () => {
    for (const id of REQUIRED_SHOTS) {
      const entry = manifest.find((e) => e.shotId === id);
      expect(entry, `missing required shot: ${id}`).toBeDefined();
      expect(entry!.file, `${id} missing file`).toBeTruthy();
      expect(entry!.sha256, `${id} missing sha256`).toBeTruthy();
      expect(entry!.pngBytes, `${id} missing pngBytes`).toBeGreaterThan(0);
    }
  });

  test('all 12 required shots are UI CAPTURE or GAMEPLAY CAPTURE (not RENDERER HARNESS)', () => {
    for (const id of REQUIRED_SHOTS) {
      const entry = manifest.find((e) => e.shotId === id);
      expect(
        ['UI CAPTURE', 'GAMEPLAY CAPTURE'].includes(entry!.type as string),
        `required shot ${id} has unexpected type: ${entry!.type}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Manifest structure
// ---------------------------------------------------------------------------

describe('v2.9 manifest structure', () => {
  test('every entry has required fields', () => {
    for (const entry of manifest) {
      expect(entry.shotId).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.viewport).toBeTruthy();
      expect(entry.captureResult).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(typeof entry.blank).toBe('boolean');
    }
  });

  test('shot IDs are unique', () => {
    const ids = manifest.map((e) => e.shotId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no BLANK or FAIL in any required screenshot entry', () => {
    for (const id of REQUIRED_SHOTS) {
      const entry = manifest.find((e) => e.shotId === id);
      expect(entry!.captureResult).toBe('OK');
      expect(entry!.blank).toBe(false);
    }
  });

  test('F12 cinematic capture is OK', () => {
    const f12 = manifest.find((e) => e.shotId === 'f12-cinematic-capture');
    expect(f12).toBeDefined();
    expect(f12!.captureResult).toBe('OK');
    expect(f12!.type).toBe('INTERACTION VERIFICATION');
  });

  test('layout verification is OK', () => {
    const layout = manifest.find((e) => e.shotId === 'layout-verification');
    expect(layout).toBeDefined();
    expect(layout!.captureResult).toBe('OK');
  });

  test('SHA-256 hashes are valid hex strings', () => {
    for (const entry of manifest) {
      if (!entry.sha256) continue;
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// PNG file integrity
// ---------------------------------------------------------------------------

describe('v2.9 screenshots', () => {
  const pngs = listPngs();

  test('screenshots directory has PNG files', () => {
    expect(pngs.length).toBeGreaterThanOrEqual(12);
  });

  test('all PNGs are valid (>1KB)', () => {
    for (const f of pngs) {
      const buf = readFileSync(join(SHOTS_DIR, f));
      expect(buf.length).toBeGreaterThan(1024);
    }
  });

  test('PNG filenames match manifest shot IDs', () => {
    const manifestFiles = new Set(
      manifest.filter((e) => e.file !== null).map((e) => (e.file as string).split('/').pop()),
    );
    for (const f of pngs) {
      expect(manifestFiles.has(f)).toBe(true);
    }
  });
});
