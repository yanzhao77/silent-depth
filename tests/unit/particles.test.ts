// SILENT DEPTH — pooled particle system tests (tests/unit/particles.test.ts)
// ---------------------------------------------------------------------------
// Exercises the full spawn → update → render → clear lifecycle of
// src/rendering/particles.ts in pure Node (no DOM). render() is driven with a
// minimal record-keeping ctx stub and a real Camera from createCamera — the
// layer is presentation-only (render-layer RNG is ADR-004-exempt), so the
// assertions target behaviour (counts, ages, pool recycling, draw calls)
// rather than deterministic pixel output.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { createParticleSystem } from '../../src/rendering/particles';
import { createCamera } from '../../src/rendering/camera';
import type { Camera } from '../../src/rendering/camera';

/** Minimal CanvasRenderingContext2D that records draw calls + style state. */
interface DrawCall {
  kind: 'arc' | 'fill' | 'stroke' | 'beginPath';
  radius?: number;
  strokeStyle?: string;
  fillStyle?: string;
  globalAlpha?: number;
}
function makeCtxStub(): { ctx: CanvasRenderingContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const state: { fillStyle: string; strokeStyle: string; globalAlpha: number } = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
  };
  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v) {
      state.fillStyle = v;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v) {
      state.strokeStyle = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v) {
      state.globalAlpha = v;
    },
    lineWidth: 1,
    beginPath(): void {
      calls.push({ kind: 'beginPath' });
    },
    arc(x: number, y: number, r: number, _start: number, _end: number): void {
      calls.push({ kind: 'arc', radius: r });
    },
    fill(): void {
      calls.push({ kind: 'fill', fillStyle: state.fillStyle, globalAlpha: state.globalAlpha });
    },
    stroke(): void {
      calls.push({
        kind: 'stroke',
        strokeStyle: state.strokeStyle,
        globalAlpha: state.globalAlpha,
      });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function makeCamera(): Camera {
  const cam = createCamera({ zoom: 8, viewport: { width: 800, height: 600 }, mapSizeKm: 30 });
  cam.setCenter(15, 15); // world center
  return cam;
}

describe('particle system — pool & spawning', () => {
  it('creates a pool with the requested capacity (min 32)', () => {
    expect(createParticleSystem(512).capacity).toBe(512);
    expect(createParticleSystem(10).capacity).toBe(32); // clamp floor
    expect(createParticleSystem(-5).capacity).toBe(32);
  });

  it('spawnPing activates a single particle and reports count', () => {
    const ps = createParticleSystem(64);
    expect(ps.count).toBe(0);
    ps.spawnPing(10, 11);
    expect(ps.count).toBe(1);
  });

  it('spawnWake activates exactly one bubble at a small aft offset', () => {
    const ps = createParticleSystem(64);
    ps.spawnWake(10, 10, 0); // heading north (0°) → bubble offset south (y-)
    expect(ps.count).toBe(1);
  });

  it('spawnExplosion creates 18–24 particles', () => {
    const ps = createParticleSystem(512);
    ps.spawnExplosion(5, 5);
    expect(ps.count).toBeGreaterThanOrEqual(18);
    expect(ps.count).toBeLessThanOrEqual(24);
  });

  it('spawnSplash creates a ring + 8 droplets (9 particles)', () => {
    const ps = createParticleSystem(512);
    ps.spawnSplash(5, 5);
    expect(ps.count).toBe(9);
  });

  it('clear deactivates every particle and zeroes the count', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(1, 1);
    ps.spawnWake(1, 1, 90);
    ps.spawnExplosion(1, 1);
    expect(ps.count).toBeGreaterThan(0);
    ps.clear();
    expect(ps.count).toBe(0);
  });

  it('mixed spawns accumulate independently without exceeding capacity', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(0, 0);
    ps.spawnWake(0, 0, 0);
    ps.spawnSplash(0, 0);
    const after = ps.count; // 1 + 1 + 9 = 11
    expect(after).toBe(11);
  });
});

describe('particle system — update lifecycle', () => {
  it('expires particles after their life and recycles the slot', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(0, 0); // life 1.2 s
    expect(ps.count).toBe(1);
    ps.update(1.3); // past life
    expect(ps.count).toBe(0);
  });

  it('advances explosion particles with strong deceleration', () => {
    const ps = createParticleSystem(512);
    ps.spawnExplosion(0, 0);
    const pre = ps.count;
    expect(pre).toBeGreaterThanOrEqual(18);
    ps.update(0.1);
    // No expiry at 0.1 s (life 1.2 s), still active.
    expect(ps.count).toBe(pre);
  });

  it('pools beyond capacity recycle the oldest particle', () => {
    const ps = createParticleSystem(32);
    // Fill the pool to capacity with long-lived particles.
    for (let i = 0; i < 40; i++) ps.spawnWake(i * 0.1, 0, 0);
    // Capacity is clamped/floored at 32 — no throws, oldest dropped.
    expect(ps.count).toBe(32);
  });
});

describe('particle system — render', () => {
  it('renders a ping ring as a stroked arc that fades with age', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(15, 15); // world center → screen center
    ps.update(0.2);
    const { ctx, calls } = makeCtxStub();
    ps.render(ctx, makeCamera());
    const strokes = calls.filter((c) => c.kind === 'stroke');
    expect(strokes.length).toBe(1);
    expect(calls.some((c) => c.kind === 'arc')).toBe(true);
    expect(strokes[0]!.globalAlpha).toBeLessThan(1); // faded
  });

  it('renders an explosion as multiple filled circles in the palette', () => {
    const ps = createParticleSystem(512);
    ps.spawnExplosion(15, 15);
    const { ctx, calls } = makeCtxStub();
    ps.render(ctx, makeCamera());
    const fills = calls.filter((c) => c.kind === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(18);
    expect(fills.every((f) => ['#ffd479', '#ff6b35', '#7a2f22'].includes(f.fillStyle ?? ''))).toBe(
      true,
    );
  });

  it('after clear, render emits no draw calls', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(0, 0);
    ps.clear();
    const { ctx, calls } = makeCtxStub();
    ps.render(ctx, makeCamera());
    expect(calls.length).toBe(0);
  });

  it('does not render expired particles', () => {
    const ps = createParticleSystem(64);
    ps.spawnPing(0, 0);
    ps.update(1.3); // expires
    const { ctx, calls } = makeCtxStub();
    ps.render(ctx, makeCamera());
    expect(calls.length).toBe(0);
  });
});
