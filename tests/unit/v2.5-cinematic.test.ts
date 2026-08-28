import { describe, expect, it } from 'vitest';
import { selectCameraPreset, resolvePresetParams } from '../../src/renderer/three/CameraDirector';
import {
  EnemyRevealTracker,
  CombatCueTracker,
  type RevealShipView,
} from '../../src/renderer/three/CinematicTrackers';
import {
  collectFrameEvents,
  createEffectFromEvent,
  snapshotToRenderState,
} from '../../src/renderer/adapter';
import { loadBalance } from '../../src/core/balance';
import { createGame, step } from '../../src/core/engine';
import { getMissionDef } from '../../src/missions/missions';
import { FIXED_DT } from '../../src/core/time';
import type { EventEntry, GameSnapshot, PlayerInputs } from '../../src/core/types';
import type { RenderEffect } from '../../src/renderer/types';

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

/** A fully-formed live snapshot (so snapshotToRenderState has every field). */
function realSnapshot(): GameSnapshot {
  const def = getMissionDef('M02');
  const h = createGame(def, def.seed);
  return step(h, FIXED_DT, IDLE);
}

// ---------------------------------------------------------------------------
// Camera preset selection
// ---------------------------------------------------------------------------

describe('V2.5 CameraDirector — preset selection', () => {
  const base = { periscopeRaised: false, depthM: 40, speedKt: 2, override: null };

  it('selects cinematic by default', () => {
    expect(selectCameraPreset(base)).toBe('cinematic');
  });

  it('prioritises periscope when raised', () => {
    expect(selectCameraPreset({ ...base, periscopeRaised: true, depthM: 200, speedKt: 20 })).toBe('periscope');
  });

  it('selects underwater at depth >= 80 m', () => {
    expect(selectCameraPreset({ ...base, depthM: 80 })).toBe('underwater');
    expect(selectCameraPreset({ ...base, depthM: 150 })).toBe('underwater');
  });

  it('selects surface at depth <= 12 m', () => {
    expect(selectCameraPreset({ ...base, depthM: 12 })).toBe('surface');
    expect(selectCameraPreset({ ...base, depthM: 0 })).toBe('surface');
  });

  it('selects chase at speed >= 8 kt in mid-depth', () => {
    expect(selectCameraPreset({ ...base, depthM: 40, speedKt: 8 })).toBe('chase');
    expect(selectCameraPreset({ ...base, depthM: 40, speedKt: 18 })).toBe('chase');
  });

  it('honours a manual override (tactical map)', () => {
    expect(selectCameraPreset({ ...base, override: 'tactical' })).toBe('tactical');
  });

  it('is deterministic for identical input', () => {
    const a = selectCameraPreset(base);
    const b = selectCameraPreset({ ...base });
    expect(a).toBe(b);
  });

  it('resolves underwater framing params with the underwater flag', () => {
    expect(resolvePresetParams('underwater').underwater).toBe(true);
    expect(resolvePresetParams('surface').underwater).toBe(false);
    expect(resolvePresetParams('chase').fov).toBeGreaterThan(resolvePresetParams('cinematic').fov);
  });
});

// ---------------------------------------------------------------------------
// Enemy reveal tracker
// ---------------------------------------------------------------------------

describe('V2.5 EnemyRevealTracker', () => {
  it('never reveals a hidden enemy', () => {
    const t = new EnemyRevealTracker();
    const ships: RevealShipView[] = [{ id: 'a', visible: false }];
    for (let i = 0; i < 5; i++) expect(t.update(ships, i)).toBeNull();
  });

  it('triggers exactly one reveal on visible false → true', () => {
    const t = new EnemyRevealTracker();
    expect(t.update([{ id: 'a', visible: false }], 0)).toBeNull();
    expect(t.update([{ id: 'a', visible: true }], 0.1)).toBe('a');
    // stays the active reveal until the timeout window elapses
    expect(t.update([{ id: 'a', visible: true }], 1)).toBe('a');
  });

  it('releases the reveal after the timeout window', () => {
    const t = new EnemyRevealTracker();
    t.update([{ id: 'a', visible: true }], 0);
    expect(t.update([{ id: 'a', visible: true }], 10)).toBeNull();
  });

  it('reveals queued ships one at a time', () => {
    const t = new EnemyRevealTracker();
    const ships: RevealShipView[] = [
      { id: 'a', visible: true },
      { id: 'b', visible: true },
    ];
    expect(t.update(ships, 0)).toBe('a');
    // After a's window expires, b is revealed next.
    expect(t.update(ships, 10)).toBe('b');
  });

  it('re-detects a ship that dropped and reappeared', () => {
    const t = new EnemyRevealTracker();
    expect(t.update([{ id: 'a', visible: true }], 0)).toBe('a');
    expect(t.update([{ id: 'a', visible: false }], 10)).toBeNull();
    expect(t.update([{ id: 'a', visible: true }], 11)).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Combat cue tracker
// ---------------------------------------------------------------------------

function effect(type: RenderEffect['type'], age = 0): RenderEffect {
  return { type, position: { x: 0, y: 0, z: 0 }, age, maxAge: 2, params: {}, id: `fx-${type}-${age}` };
}

describe('V2.5 CombatCueTracker', () => {
  it('returns null with no combat effects', () => {
    const t = new CombatCueTracker();
    expect(t.update([], 0)).toBeNull();
  });

  it('elevates an explosion to the impact cue', () => {
    const t = new CombatCueTracker();
    expect(t.update([effect('explosion')], 0)).toBe('impact');
  });

  it('gives impact priority over depthCharge', () => {
    const t = new CombatCueTracker();
    expect(t.update([effect('depthCharge'), effect('explosion')], 0)).toBe('impact');
  });

  it('times out after the cue duration', () => {
    const t = new CombatCueTracker();
    t.update([effect('explosion')], 0);
    expect(t.update([], 10)).toBeNull();
  });

  it('uses a launch cue for torpedo bubble trails', () => {
    const t = new CombatCueTracker();
    expect(t.update([effect('bubbleTrail')], 0)).toBe('launch');
  });
});

// ---------------------------------------------------------------------------
// Renderer event starvation fix
// ---------------------------------------------------------------------------

describe('V2.5 collectFrameEvents (no-loss event window)', () => {
  const log: EventEntry[] = [
    { id: 1, simTime: 0, type: 'sonar.ping' },
    { id: 2, simTime: 0, type: 'torpedo.fired' },
    { id: 3, simTime: 0, type: 'torpedo.hit' },
  ];

  it('returns only events newer than sinceId', () => {
    expect(collectFrameEvents(log, 1).map((e) => e.id)).toEqual([2, 3]);
    expect(collectFrameEvents(log, 3)).toEqual([]);
  });

  it('returns all when sinceId is 0', () => {
    expect(collectFrameEvents(log, 0).map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Adapter combat-effect mapping (honest, fail-closed)
// ---------------------------------------------------------------------------

function minimalSnapshot(enemies: GameSnapshot['enemies']): GameSnapshot {
  return {
    playerSub: { position: { x: 0, y: 0 } },
    enemies,
    contacts: [],
    torpedoes: [],
    simTime: 0,
    periscope: { state: 'LOWERED', targetHeadingDeg: 0 },
  } as unknown as GameSnapshot;
}

describe('V2.5 adapter — combat event → effect mapping', () => {
  it('maps torpedo.fired to a waterSplash at the submarine', () => {
    const ev: EventEntry = { id: 1, simTime: 0, type: 'torpedo.fired', payload: { tubeId: 'T1' } };
    const fx = createEffectFromEvent(ev, minimalSnapshot([]));
    expect(fx?.type).toBe('waterSplash');
  });

  it('maps depthCharge.dropped to a waterSplash at real drop coords', () => {
    const ev: EventEntry = { id: 1, simTime: 0, type: 'depthCharge.dropped', payload: { shipId: 's', x: 2, y: 3 } };
    const fx = createEffectFromEvent(ev, minimalSnapshot([]));
    expect(fx?.type).toBe('waterSplash');
    expect(fx?.position).toEqual({ x: 2, y: 0, z: -3 });
  });

  it('maps depthCharge.detonated to a depthCharge effect', () => {
    const ev: EventEntry = { id: 1, simTime: 0, type: 'depthCharge.detonated', payload: { shipId: 's', x: 2, y: 3 } };
    const fx = createEffectFromEvent(ev, minimalSnapshot([]));
    expect(fx?.type).toBe('depthCharge');
  });

  it('locates torpedo.hit from the real target ship (fail-closed)', () => {
    const enemies = [
      { id: 'tgt', shipClass: 'Destroyer', position: { x: 1, y: 2 }, headingDeg: 0, speedKt: 0, aiState: 'NORMAL', hull: 1 },
    ] as unknown as GameSnapshot['enemies'];
    const ev: EventEntry = { id: 1, simTime: 0, type: 'torpedo.hit', payload: { torpedoId: 'T', targetShipId: 'tgt' } };
    const fx = createEffectFromEvent(ev, minimalSnapshot(enemies));
    expect(fx?.type).toBe('explosion');
    expect(fx?.position).toEqual({ x: 1, y: 0, z: -2 });
  });

  it('refuses torpedo.hit when the target ship is gone (no guessing)', () => {
    const ev: EventEntry = { id: 1, simTime: 0, type: 'torpedo.hit', payload: { torpedoId: 'T', targetShipId: 'missing' } };
    const fx = createEffectFromEvent(ev, minimalSnapshot([]));
    expect(fx).toBeNull();
  });

  it('carries every frame event into the active effect list (no loss)', () => {
    const balance = loadBalance();
    const snap = realSnapshot();
    const newEvents: EventEntry[] = [
      { id: 1, simTime: 0, type: 'torpedo.fired', payload: { tubeId: 'T1' } },
      { id: 2, simTime: 0, type: 'depthCharge.detonated', payload: { shipId: 's', x: 0, y: 0 } },
    ];
    const activeEffects: RenderEffect[] = [];
    const state = snapshotToRenderState(snap, {
      balance,
      newEvents,
      activeEffects,
      dt: 0.016,
      cameraMode: 'cinematic',
    });
    const types = state.effects.map((e) => e.type);
    expect(types).toContain('waterSplash');
    expect(types).toContain('depthCharge');
  });

  it('expires and cleans up effects after their max age', () => {
    const balance = loadBalance();
    const snap = realSnapshot();
    const ev: EventEntry = { id: 1, simTime: 0, type: 'depthCharge.detonated', payload: { shipId: 's', x: 0, y: 0 } };
    const activeEffects: RenderEffect[] = [];
    snapshotToRenderState(snap, { balance, newEvents: [ev], activeEffects, dt: 0.1, cameraMode: 'cinematic' });
    expect(activeEffects.length).toBe(1);
    // Advance well past the 1.5 s depth-charge max age with no new events.
    snapshotToRenderState(snap, { balance, newEvents: [], activeEffects, dt: 2.0, cameraMode: 'cinematic' });
    expect(activeEffects.length).toBe(0);
  });

  it('keeps presentation decisions deterministic across calls', () => {
    const balance = loadBalance();
    const snap = realSnapshot();
    const a = snapshotToRenderState(snap, { balance, newEvents: [], activeEffects: [], dt: 0.016, cameraMode: 'surface' });
    const b = snapshotToRenderState(snap, { balance, newEvents: [], activeEffects: [], dt: 0.016, cameraMode: 'surface' });
    expect(a.camera.mode).toBe(b.camera.mode);
  });
});
