/**
 * SILENT DEPTH — world system (src/world/world.ts)
 *
 * Pipeline position 2 (engine.ts PIPELINE[1], GAME_ARCHITECTURE §7): maintains
 * the per-mission ocean/weather state. The engine's systemWorld stub is
 * replaced by the factory manager (engine.ts is NOT edited by t-009) with
 *
 *   const world = initWorld(mission, seed, balance)
 *   PIPELINE[1] = createWorldSystem(world)
 *
 * DESIGN DECISIONS (wiring contract — engine.ts is frozen for t-009):
 *  - SystemContext has no `world` field. The manager builds ONE WorldState
 *    per game via initWorld(...) and binds it into a closure SystemFn via
 *    createWorldSystem(state). Other systems read the active modifiers from
 *    the same WorldState with weatherModifiersFor(state, ctx.balance) or
 *    activeWeather(state). A WorldState is mutable per-game and MUST never be
 *    shared across game handles.
 *  - The engine owns the sim clock: worldSystem reads ctx.simTime (already
 *    advanced by the state-machine system, position 1) and derives the active
 *    weather segment from it. The system never advances time itself and never
 *    draws from ctx.forks.world — ZERO RNG consumption in steady state
 *    (ADR-004). All randomness lives in initWorld → generateOcean.
 *  - Weather only advances while the gameplay pipeline runs (MISSION_RUNNING):
 *    briefing and end-of-mission ticks set ctx.skip = true, so the world
 *    system does not run (engine.ts step()).
 *  - Weather changes emit no event: the EventType catalogue (types.ts) is
 *    exhaustive and has no weather.* member. Rendering reads activeWeather().
 *  - initWorld takes the seed explicitly — it must be the SAME seed passed to
 *    createGame (the engine's authoritative seed); one seed source per game.
 *
 * Task: t-009 world system (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { MissionDef, WeatherKind } from '../core/types';
import { loadBalance, type BalanceConfig } from '../core/balance';
import type { SystemContext, SystemFn } from '../core/engine';
import { generateOcean, type OceanModel } from './ocean';
import {
  parseWeatherSequence,
  weatherModifiers,
  type WeatherModifiers,
  type WeatherSequenceEntry,
} from './weather';

// ---------------------------------------------------------------------------
// WorldState — per-game mutable world runtime
// ---------------------------------------------------------------------------

export interface WorldState {
  /** Seeded ocean model (static per mission — never regenerated mid-game). */
  ocean: OceanModel;
  /** Weather segments parsed from mission.weather ('A->B' chains allowed). */
  sequence: WeatherSequenceEntry[];
  /** Index of the currently active weather segment. */
  segmentIndex: number;
  /** Active weather kind (drives weatherModifiers). */
  currentWeather: WeatherKind;
}

/**
 * Precompute the world state for a mission — call ONCE per game in the
 * createGame path (before any step). Pure & deterministic: the same
 * (mission, seed, balance) yields a deep-equal WorldState. This is the ONLY
 * place the world consumes randomness (ocean generation).
 */
export function initWorld(
  mission: MissionDef,
  seed: number,
  balance: BalanceConfig = loadBalance(),
): WorldState {
  if (!(mission.parTimeS > 0)) {
    throw new TypeError(
      `initWorld: mission "${mission.id}" parTimeS must be > 0 (got ${mission.parTimeS})`,
    );
  }
  const ocean = generateOcean(seed, balance);
  const sequence = parseWeatherSequence(mission.weather, balance);
  return {
    ocean,
    sequence,
    segmentIndex: 0,
    currentWeather: sequence[0]![0],
  };
}

/** Active weather kind of a world state (rendering/UI getter). */
export function activeWeather(state: WorldState): WeatherKind {
  return state.currentWeather;
}

/**
 * Balance-driven modifiers for the ACTIVE weather of a world state.
 * Convenience for systems that hold the WorldState but not the weather kind.
 */
export function weatherModifiersFor(
  state: WorldState,
  balance: BalanceConfig = loadBalance(),
): WeatherModifiers {
  return weatherModifiers(state.currentWeather, balance);
}

/**
 * Build the pipeline SystemFn (position 2). Steady-state ticks are pure
 * w.r.t. (WorldState, ctx.simTime): the closure advances the weather timeline
 * deterministically and consumes no RNG. `initial` is mutated in place — bind
 * one WorldState per game handle.
 */
export function createWorldSystem(initial: WorldState): SystemFn {
  return (ctx: SystemContext): void => {
    // The engine only runs the pipeline when !ctx.skip (briefing/end ticks
    // skip); guard defensively anyway.
    if (ctx.skip) return;

    const seq = initial.sequence;
    if (seq.length <= 1) return; // single-kind mission: nothing to advance

    const parTimeS = ctx.mission.parTimeS;
    if (!(parTimeS > 0)) return; // invalid parTime (initWorld already rejects): stay on segment 0

    const frac = ctx.simTime / parTimeS;
    // Segments are ordered by start fraction; find the last one we have
    // reached. O(n), n ≤ 5 — trivial per tick.
    let idx = 0;
    for (let i = seq.length - 1; i >= 0; i--) {
      if (frac >= seq[i]![1]) {
        idx = i;
        break;
      }
    }
    if (idx !== initial.segmentIndex) {
      initial.segmentIndex = idx;
      initial.currentWeather = seq[idx]![0];
    }
  };
}
