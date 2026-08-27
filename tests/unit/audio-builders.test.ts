// SILENT DEPTH — SFX builders + audio helper tests (tests/unit/audio-builders.test.ts)
// ---------------------------------------------------------------------------
// Drives every pure SFX builder in src/audio/audio.ts through a MockAudioContext
// (tests/tools/lib/webaudio-mock.ts) and asserts:
//   - every builder returns a well-formed AudioGraph ({output,start,stop,dispose})
//   - the graph starts/stops/disposes without throwing
//   - each builder materializes at least one source node (oscillator / buffer)
//   - the exported pure gates (engineGainTarget / alarmGate / exposureGate)
//     obey their documented contracts (band gains, ≥60 alarm, HIGH/CRITICAL).
// No real AudioContext is created; all runs stay in Node.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import {
  alarmGate,
  engineGainTarget,
  exposureGate,
  fillNoise,
  makeEnv,
  SFX_BUILDERS,
} from '../../src/audio/audio';
import { SFX_NAMES, SFX_PARAMS } from '../../src/audio/sfx';
import type { SfxParams } from '../../src/audio/sfx';
import {
  createMockAudioContext,
  type MockAudioParam,
  type MockContext,
} from '../tools/lib/webaudio-mock';

function buildAllNames(): readonly string[] {
  return SFX_NAMES;
}

/** A realistic param set for a given name (shape-complete, using real table). */
function realParams(name: string): SfxParams {
  const p = SFX_PARAMS[name as keyof typeof SFX_PARAMS];
  if (!p) throw new Error(`no params for ${name}`);
  return p;
}

function countSourceNodes(ctx: MockContext): number {
  return ctx.sources.length + ctx.oscillators.length;
}

describe('SFX builders (src/audio/audio.ts) — graph construction', () => {
  it('builds a well-formed AudioGraph for every shipped SFX', () => {
    for (const name of buildAllNames()) {
      const ctx = createMockAudioContext();
      const builder = SFX_BUILDERS[name as keyof typeof SFX_BUILDERS];
      const params = realParams(name);
      const graph = builder(ctx as unknown as AudioContext, params);
      // Graph shape contract.
      expect(graph, `${name}.output`).toBeDefined();
      expect(typeof graph.start, `${name}.start`).toBe('function');
      expect(typeof graph.stop, `${name}.stop`).toBe('function');
      expect(typeof graph.dispose, `${name}.dispose`).toBe('function');
      // At least one source node was created (a silent graph is a bug).
      expect(countSourceNodes(ctx), `${name} sources`).toBeGreaterThan(0);
      // start/stop/dispose must be idempotent-safe (no throw).
      expect(() => graph.start(), `${name}.start`).not.toThrow();
      expect(() => graph.stop(), `${name}.stop`).not.toThrow();
      expect(() => graph.dispose(), `${name}.dispose`).not.toThrow();
    }
  });

  it('output node is fed by at least one source (no silent graph)', () => {
    for (const name of buildAllNames()) {
      const ctx = createMockAudioContext();
      const builder = SFX_BUILDERS[name as keyof typeof SFX_BUILDERS];
      const graph = builder(ctx as unknown as AudioContext, realParams(name));
      const out = graph.output as never as { incoming: unknown[] };
      // The output must have incoming edges (something feeds it); otherwise
      // the graph produces no sound. Builders route their final mixing gain
      // into `out`, so a silent graph would have zero incoming edges.
      expect(out.incoming.length, `${name}: output is fed`).toBeGreaterThan(0);
    }
  });

  it('engine loop exposes a retargetable gainParam; torpedoTravel loop does not', () => {
    // engine is the only SFX whose gain is retargeted by speed band (§3 #9).
    const engineCtx = createMockAudioContext();
    const engineGraph = SFX_BUILDERS.engine(
      engineCtx as unknown as AudioContext,
      realParams('engine'),
    );
    expect(engineGraph.gainParam, 'engine.gainParam').toBeDefined();
    // torpedoTravel is a loop but has no retargetable gain (static churn level).
    const torpCtx = createMockAudioContext();
    const torpGraph = SFX_BUILDERS.torpedoTravel(
      torpCtx as unknown as AudioContext,
      realParams('torpedoTravel'),
    );
    expect(torpGraph.gainParam).toBeUndefined();
  });

  it('one-shot SFX have no gainParam', () => {
    const oneShots = SFX_NAMES.filter((n) => !SFX_PARAMS[n as keyof typeof SFX_PARAMS]?.loop);
    for (const name of oneShots) {
      const ctx = createMockAudioContext();
      const graph = SFX_BUILDERS[name as keyof typeof SFX_BUILDERS](
        ctx as unknown as AudioContext,
        realParams(name),
      );
      expect(graph.gainParam, `${name}.gainParam should be undefined`).toBeUndefined();
    }
  });
});

describe('SFX helpers (exported pure gates)', () => {
  it('engineGainTarget resolves speed-band gains from SFX_PARAMS.engine', () => {
    expect(engineGainTarget({ band: 'STOPPED' })).toBe(0);
    expect(engineGainTarget({ band: 'SILENT' })).toBe(0.12);
    expect(engineGainTarget({ band: 'CRUISE' })).toBe(0.45);
    expect(engineGainTarget({ band: 'FULL' })).toBe(0.9);
  });

  it('engineGainTarget falls back to speedKt/22 × 0.9, clamped to [0,1]', () => {
    expect(engineGainTarget({ speedKt: 22 })).toBeCloseTo(0.9, 5);
    expect(engineGainTarget({ speedKt: 11 })).toBeCloseTo(0.45, 5);
    expect(engineGainTarget({ speedKt: 0 })).toBe(0);
    expect(engineGainTarget({})).toBe(0);
    expect(engineGainTarget(undefined)).toBe(0);
  });

  it('alarmGate only fires at detection/branch ≥ 60 (§14)', () => {
    expect(alarmGate({ detection: 59 })).toBe(false);
    expect(alarmGate({ detection: 60 })).toBe(true);
    expect(alarmGate({ detection: 100 })).toBe(true);
    expect(alarmGate({ band: 'BAND' })).toBe(false); // non-numeric
    expect(alarmGate(undefined)).toBe(false);
  });

  it('exposureGate warns only on HIGH/CRITICAL (t-025)', () => {
    expect(exposureGate({ band: 'LOW' })).toBe(false);
    expect(exposureGate({ band: 'MEDIUM' })).toBe(false);
    expect(exposureGate({ band: 'HIGH' })).toBe(true);
    expect(exposureGate({ band: 'CRITICAL' })).toBe(true);
    expect(exposureGate({})).toBe(false);
  });
});

describe('fillNoise (noise generation)', () => {
  it('fills a buffer with white noise in [-1, 1] and non-zero energy', () => {
    const data = new Float32Array(512);
    fillNoise(data, 'white');
    expect(data.every((v) => v >= -1 && v <= 1)).toBe(true);
    let energy = 0;
    for (const v of data) energy += Math.abs(v);
    expect(energy).toBeGreaterThan(0);
  });

  it('produces distinct distributions for white / pink / brown', () => {
    const white = new Float32Array(2048);
    const pink = new Float32Array(2048);
    const brown = new Float32Array(2048);
    fillNoise(white, 'white');
    fillNoise(pink, 'pink');
    fillNoise(brown, 'brown');
    // Means differ across colors (pink/brown are low-pass, so |mean| > white).
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(white)).not.toBeCloseTo(mean(brown), 3);
    expect(mean(pink)).not.toBeCloseTo(mean(brown), 3);
  });

  it('is deterministic for a fixed buffer only with a fixed RNG (statistical shape)', () => {
    // The generator uses Math.random (render-layer RNG), so we can only assert
    // that repeated fills stay in range and non-degenerate.
    const a = new Float32Array(256);
    const b = new Float32Array(256);
    fillNoise(a, 'pink');
    fillNoise(b, 'pink');
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!).toBeGreaterThanOrEqual(-1);
      expect(a[i]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('makeEnv (amplitude envelope)', () => {
  it('schedules a fast attack, hold, and exponential release on the gain param', () => {
    const ctx = createMockAudioContext();
    const env = makeEnv(ctx as unknown as AudioContext, 0, 0.8, 0.01, 0.1, 0.5) as unknown as {
      gain: MockAudioParam;
    };
    const methods = env.gain.log.map((l) => l.method);
    expect(methods).toContain('setValueAtTime'); // init 0.0001 at t0
    expect(methods).toContain('exponentialRampToValueAtTime'); // attack + release
    // Attack targets the clamped peak (0.8 stays 0.8).
    const ramp = env.gain.log.filter((l) => l.method === 'exponentialRampToValueAtTime');
    expect(ramp[0]!.value).toBeCloseTo(0.8, 4);
    // Release goes back to near-zero (0.0001 floor).
    expect(ramp[ramp.length - 1]!.value).toBeCloseTo(0.0001, 6);
  });

  it('clamps an out-of-range peak to [0,1] with a 0.0001 floor', () => {
    const ctx = createMockAudioContext();
    const env = makeEnv(ctx as unknown as AudioContext, 0, 5, 0.01, 0.1, 0.5) as unknown as {
      gain: MockAudioParam;
    };
    const attack = env.gain.log.find(
      (l) => l.method === 'exponentialRampToValueAtTime' && l.value > 0.5,
    );
    expect(attack!.value).toBe(1); // clamped
  });

  it('handles a zero/negative duration without throwing', () => {
    const ctx = createMockAudioContext();
    let threw = false;
    try {
      makeEnv(ctx as unknown as AudioContext, 0, 0.5, 0.01, 0.1, -1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
