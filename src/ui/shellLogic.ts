/**
 * SILENT DEPTH — shell logic helpers (src/ui/shellLogic.ts)
 *
 * Extractable pure logic from the browser shell (src/main.ts) that is
 * DOM-free and can be unit-tested in Node. main.ts is the boot/glue layer
 * (document, canvas, rAF, localStorage) — it is not Node-importable; these
 * helpers carry the deterministic, testable part of the shell so the
 * 20 Hz sim ↔ HTML shell boundary stays covered by tests.
 *
 * All functions are pure: the same inputs always yield the same result; none
 * touch DOM, storage, timers or RNG.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure — zero DOM / browser-API references.
 */

import type { GameSnapshot, PlayerInputs } from '../core/types';
import type { Camera } from '../rendering/camera';
import type { MissionResult } from '../save/save';

// ---------------------------------------------------------------------------
// Snapshot lookups
// ---------------------------------------------------------------------------

/** Find a torpedo by id in a snapshot (null for non-string / unknown ids). */
export function findTorpedo(
  snap: GameSnapshot,
  id: unknown,
): { id: string; position: { x: number; y: number } } | null {
  if (typeof id !== 'string') return null;
  for (const t of snap.torpedoes) {
    if (t.id === id) return t;
  }
  return null;
}

/** Find an enemy by id in a snapshot (null for non-string / unknown ids). */
export function findEnemy(
  snap: GameSnapshot,
  id: unknown,
): { id: string; position: { x: number; y: number }; shipClass: string; hull: number } | null {
  if (typeof id !== 'string') return null;
  for (const e of snap.enemies) {
    if (e.id === id) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Off-screen test (follow-cam readability)
// ---------------------------------------------------------------------------

/**
 * True when the player is outside (plus a margin) the camera viewport. Used
 * by the shell to hint that the player is off-screen. Pure geometry.
 */
export function isPlayerOffScreen(snap: GameSnapshot, camera: Camera, margin = 48): boolean {
  const p = camera.worldToScreen(snap.playerSub.position.x, snap.playerSub.position.y);
  return (
    p.x < -margin ||
    p.x > camera.viewport.width + margin ||
    p.y < -margin ||
    p.y > camera.viewport.height + margin
  );
}

// ---------------------------------------------------------------------------
// Mission-result construction (from a settled snapshot)
// ---------------------------------------------------------------------------

/**
 * Build the MissionResult object for a settled mission (MISSION_RESULT).
 * `shipsSunkThisRun` is the per-run sink tally; `outcome` is the final
 * victory/defeat verdict. Pure — the caller assigns it to the save store.
 */
export function buildMissionResult(
  missionId: string,
  outcome: 'victory' | 'defeat',
  snap: GameSnapshot,
  shipsSunkThisRun: Record<string, number>,
): MissionResult {
  return {
    missionId,
    completed: outcome === 'victory',
    score: snap.score.total,
    grade: snap.score.grade,
    torpedoesFired: snap.stats.torpedoesFired,
    torpedoesHit: snap.stats.torpedoesHit,
    peakDetection: snap.stats.peakDetection,
    elapsedS: snap.stats.elapsedS,
    shipsSunk: shipsSunkThisRun,
  };
}

// ---------------------------------------------------------------------------
// Input assembly (per fixed step)
// ---------------------------------------------------------------------------

/**
 * Assemble the PlayerInputs for one fixed step from the IO source and the
 * pending pulses. Implements the terminal salvo-2 queued-fire rule:
 *
 *   fireRequest !== null        → fire now; if salvo is 2, latch `queueFire`
 *                                 so the next fire consumes the selected id.
 *   fireRequest === null && queuedFire !== null → replay the queued id now.
 *
 * @param base        base input state from createInput().getInputs()
 * @param fireRequest consumed fire request for this step (or null)
 * @param queuedFire  prior latched fire id (salvo-2), or null
 * @param pulses      one-shot pulse edges for this step
 */
export function assembleInputs(
  base: PlayerInputs,
  fireRequest: string | null,
  queuedFire: string | null,
  pulses: { pause: boolean; periscope: boolean; lock: boolean; dive: boolean },
): { inputs: PlayerInputs; fireTorpedo: string | null; latchQueue: boolean } {
  let fire = fireRequest;
  let latchQueue = false;
  if (fire !== null) {
    latchQueue = true; // caller decides whether to honor (salvo-2) the latch
  } else if (queuedFire !== null) {
    fire = queuedFire;
  }
  const inputs: PlayerInputs = {
    ...base,
    fireTorpedo: fire,
    pause: pulses.pause,
    periscope: pulses.periscope,
    lockTarget: pulses.lock,
    emergencyDive: pulses.dive,
  };
  return { inputs, fireTorpedo: fire, latchQueue };
}
