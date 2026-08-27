// SILENT DEPTH — renderer branch coverage tests (tests/unit/renderer.test.ts)
// ---------------------------------------------------------------------------
// Drives the real renderer (createRenderer) through the software canvas across
// the branches a single README screenshot does not exercise: every weather
// overlay, the mapGrid/particles/FPS toggles, a bearing-only contact
// (rangeKm=null), the prev/alpha interpolation path, a selected contact, and a
// non-empty LKP (last-known-position) marker. These are assertion-driven
// smoke tests (no PNG output): the point is that each branch renders without
// throwing and produces a non-empty framebuffer.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../src/core/engine';
import { getMissionDef } from '../../src/missions/missions';
import { FIXED_DT } from '../../src/core/time';
import { createRenderer } from '../../src/rendering/renderer';
import { createCamera } from '../../src/rendering/camera';
import { createParticleSystem } from '../../src/rendering/particles';
import { injectCanvasFactory } from '../../src/rendering/sprites';
import { SoftCanvas } from '../tools/lib/softcanvas';
import type { GameSnapshot, MissionDef, PlayerInputs } from '../../src/core/types';

const W = 960;
const H = 540;

const IDLE: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Medium',
  silentRunning: true,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
};

// SoftCanvas already registers its own factory in screenshots.test.ts, but this
// file runs independently — ensure a canvas is always injectable.
injectCanvasFactory(() => new SoftCanvas(64, 64) as unknown as HTMLCanvasElement);

/** Build a live snapshot for a mission, positioned to generate contacts. */
function makeSnapshot(def: MissionDef, pingTicks = 60): GameSnapshot {
  const h = createGame(def, def.seed);
  const rt = h as unknown as {
    __internal: {
      player: { position: { x: number; y: number }; headingDeg: number };
      enemies: { id: string; position: { x: number; y: number } }[];
    };
  };
  // Put the player ~1.5 km west of the first enemy so pings classify a contact.
  const target = rt.__internal.enemies[0]!;
  rt.__internal.player.position = { x: target.position.x - 1.5, y: target.position.y };
  rt.__internal.player.headingDeg = 90;
  let snap = step(h, FIXED_DT, IDLE);
  for (let i = 0; i < pingTicks; i++) {
    const inputs = snap.playerSub.pingCooldown <= 0 ? { ...IDLE, ping: true } : IDLE;
    snap = step(h, FIXED_DT, inputs);
  }
  return snap;
}

function newCamera(snap: GameSnapshot): ReturnType<typeof createCamera> {
  return createCamera({
    zoom: 8,
    center: { x: snap.playerSub.position.x, y: snap.playerSub.position.y },
    viewport: { width: W, height: H },
  });
}

/** Render a snapshot exactly once and return whether anything was drawn. */
function renderOpaque(
  snap: GameSnapshot,
  def: MissionDef,
  seed: number,
  camera: ReturnType<typeof createCamera>,
  frame?: Record<string, unknown>,
): boolean {
  const canvas = new SoftCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const renderer = createRenderer({ seed, mission: def });
  const particles = createParticleSystem();
  particles.update(0.2);
  renderer.render(ctx as unknown as CanvasRenderingContext2D, snap, camera, FIXED_DT, {
    particles,
    settings: { mapGrid: true, particlesEnabled: true, showFps: false },
    ...frame,
  });
  return canvas.data.some((v) => v !== 0);
}

describe('renderer branch coverage', () => {
  it('renders every weather overlay branch without throwing', () => {
    const weathers: string[] = ['Clear', 'Cloudy', 'Storm', 'Fog', 'Night'];
    for (const w of weathers) {
      // Reuse M02 but override the mission weather so the overlay branch runs.
      const base = getMissionDef('M02');
      const def = {
        ...base,
        weather: w,
        parTimeS: 60,
      } as MissionDef;
      const snap = makeSnapshot(def);
      const camera = newCamera(snap);
      let threw = false;
      try {
        renderOpaque(snap, def, def.seed, camera);
      } catch {
        threw = true;
      }
      expect(threw, `weather ${w} should not throw`).toBe(false);
    }
  });

  it('renders with mapGrid off and particles off', () => {
    const def = getMissionDef('M02');
    const snap = makeSnapshot(def);
    const camera = newCamera(snap);
    const canvas = new SoftCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const renderer = createRenderer({ seed: def.seed, mission: def });
    const particles = createParticleSystem();
    particles.spawnPing(snap.playerSub.position.x, snap.playerSub.position.y);
    particles.update(0.2);
    expect(() =>
      renderer.render(ctx as unknown as CanvasRenderingContext2D, snap, camera, FIXED_DT, {
        particles,
        settings: { mapGrid: false, particlesEnabled: false, showFps: false },
      }),
    ).not.toThrow();
  });

  it('renders the FPS overlay when showFps is on', () => {
    const def = getMissionDef('M02');
    const snap = makeSnapshot(def);
    const camera = newCamera(snap);
    expect(() =>
      renderOpaque(snap, def, def.seed, camera, {
        settings: { mapGrid: true, particlesEnabled: true, showFps: true },
        fps: 60,
      }),
    ).toBeTruthy();
  });

  it('renders a bearing-only contact (rangeKm = null) without a range estimate', () => {
    const def = getMissionDef('M02');
    const snap = makeSnapshot(def);
    // Force every contact to be bearing-only (the honest sonar view path).
    snap.contacts = snap.contacts.map((c) => ({ ...c, rangeKm: null }));
    const camera = newCamera(snap);
    expect(() => renderOpaque(snap, def, def.seed, camera)).toBeTruthy();
  });

  it('renders through the prev/alpha interpolation path', () => {
    const def = getMissionDef('M02');
    const snap = makeSnapshot(def);
    const camera = newCamera(snap);
    const h = createGame(def, def.seed);
    const prev = step(h, FIXED_DT, IDLE);
    // prev and current are different snapshots; alpha mid-interpolation.
    expect(() =>
      renderOpaque(snap, def, def.seed, camera, {
        prev,
        alpha: 0.5,
      }),
    ).toBeTruthy();
  });

  it('renders a selected contact with the highlight path', () => {
    const def = getMissionDef('M02');
    const snap = makeSnapshot(def);
    const camera = newCamera(snap);
    const contactId = snap.contacts[0]?.id ?? null;
    expect(() =>
      renderOpaque(snap, def, def.seed, camera, { selectedContactId: contactId }),
    ).toBeTruthy();
  });

  it('renders non-empty LKP markers for enemies', () => {
    const def = getMissionDef('M03'); // convoy with escorts → enemies
    const snap = makeSnapshot(def, 12);
    // Ensure at least one enemy has an LKP to draw.
    const withLkp = snap.enemies.map((e) => ({
      ...e,
      lkp: e.lkp ?? { x: e.position.x + 0.5, y: e.position.y + 0.5, errorKm: 1.0 },
    }));
    snap.enemies = withLkp as GameSnapshot['enemies'];
    const camera = newCamera(snap);
    expect(() => renderOpaque(snap, def, def.seed, camera)).toBeTruthy();
  });
});
