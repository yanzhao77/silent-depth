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
import { alarmGate, engineGainTarget, exposureGate, SFX_BUILDERS } from '../../src/audio/audio';
import { SFX_NAMES, SFX_PARAMS } from '../../src/audio/sfx';
import type { SfxParams } from '../../src/audio/sfx';
import { createMockAudioContext, type MockContext } from '../tools/lib/webaudio-mock';

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
