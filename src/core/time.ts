/**
 * SILENT DEPTH — fixed timestep helper (src/core/time.ts)
 *
 * Simulation runs at a fixed 20 Hz (dt = 0.05 s). Shells (browser rAF,
 * headless runner) accumulate wall time and call step() exactly the number of
 * fixed steps computed here. Pure function — no state, no wall clock.
 *
 * GAME_ARCHITECTURE §8: render 60 Hz / sim 20 Hz; accumulator capped to
 * MAX_FRAME_TIME_S to avoid a spiral of death after tab-switches etc.
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references.
 */

/** Fixed simulation timestep in seconds (20 Hz). */
export const FIXED_DT = 0.05;

/** Simulation tick rate in Hz. */
export const TICK_RATE_HZ = 20;

/** Cap on accumulated frame time (spiral-of-death guard). */
export const MAX_FRAME_TIME_S = 0.25;

export interface FixedStepResult {
  /** Number of fixed steps the caller should run this frame. */
  steps: number;
  /** Unconsumed time to carry into the next frame (in [0, dt)). */
  nextAccumulator: number;
  /** SimTime after consuming `steps` fixed steps. */
  nextSimTime: number;
}

/**
 * Pure fixed-timestep accumulator step.
 *
 * @param accumulator   carried-over time from the previous frame (>= 0)
 * @param frameDtSeconds wall-clock delta for this frame (clamped to >= 0)
 * @param dt            fixed timestep (default FIXED_DT)
 * @param maxFrameSeconds cap for the accumulated time
 * @param simTime       current sim time (advanced by steps * dt)
 */
export function computeFixedSteps(
  accumulator: number,
  frameDtSeconds: number,
  dt: number = FIXED_DT,
  maxFrameSeconds: number = MAX_FRAME_TIME_S,
  simTime: number = 0,
): FixedStepResult {
  const dtSafe = dt > 0 ? dt : FIXED_DT;
  const acc = Math.min(Math.max(0, accumulator) + Math.max(0, frameDtSeconds), maxFrameSeconds);
  // Tiny epsilon guards against binary float drift (e.g. 0.1/0.05 = 2.0000000000000004).
  const steps = Math.floor(acc / dtSafe + 1e-9);
  return {
    steps,
    nextAccumulator: Math.max(0, acc - steps * dtSafe),
    nextSimTime: simTime + steps * dtSafe,
  };
}
