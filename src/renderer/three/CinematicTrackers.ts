/**
 * SILENT DEPTH V2.5 — Cinematic Trackers (presentation-only state)
 *
 * Two small stateful helpers that the renderer drives from already-presented
 * RenderState each frame:
 *
 *  - EnemyRevealTracker: fires a one-shot "reveal" when a ship transitions from
 *    not-visible to visible (i.e. the player has just detected it via sonar /
 *    periscope). Hidden ships are NEVER reveal subjects — the tracker only ever
 *    reacts to `visible === true`, so it cannot guess gameplay position.
 *  - CombatCueTracker: elevates the active combat presentation cue by priority
 *    and lets it time out, so the camera/shake react to real combat events
 *    without inventing them.
 *
 * Both keep their state internal and never read or write simulation state.
 */

import type { RenderEffect } from '../types';

export type CombatCue = 'impact' | 'depthCharge' | 'launch' | 'splash';

const REVEAL_DURATION_S = 4.0;
const CUE_DURATION_S = 3.0;

/** A minimal ship view the reveal tracker needs. */
export interface RevealShipView {
  id: string;
  visible: boolean;
}

const CUE_PRIORITY: readonly CombatCue[] = ['impact', 'depthCharge', 'launch', 'splash'];

function effectToCue(type: RenderEffect['type']): CombatCue | null {
  switch (type) {
    case 'explosion': return 'impact';
    case 'depthCharge': return 'depthCharge';
    case 'waterSplash': return 'splash';
    case 'bubbleTrail': return 'launch';
    default: return null;
  }
}

export class EnemyRevealTracker {
  private readonly revealed = new Set<string>();
  private currentRevealId: string | null = null;
  private revealUntil = 0;

  /** Advance with the current ship visibility set and wall-clock time (s). */
  update(ships: RevealShipView[], now: number): string | null {
    for (const ship of ships) {
      // A ship that drops out of detection can be re-revealed if it reappears.
      if (!ship.visible) this.revealed.delete(ship.id);
    }

    if (this.currentRevealId !== null && now >= this.revealUntil) {
      this.currentRevealId = null;
    }

    if (this.currentRevealId === null) {
      for (const ship of ships) {
        if (ship.visible && !this.revealed.has(ship.id)) {
          this.currentRevealId = ship.id;
          this.revealed.add(ship.id);
          this.revealUntil = now + REVEAL_DURATION_S;
          break;
        }
      }
    }

    return this.currentRevealId;
  }

  /** The id currently being revealed, or null. */
  get activeRevealId(): string | null {
    return this.currentRevealId;
  }

  reset(): void {
    this.revealed.clear();
    this.currentRevealId = null;
    this.revealUntil = 0;
  }
}

export class CombatCueTracker {
  private activeCue: CombatCue | null = null;
  private cueUntil = 0;

  /** Advance with the active effect list and wall-clock time (s). */
  update(effects: RenderEffect[], now: number): CombatCue | null {
    let best: CombatCue | null = null;
    for (const effect of effects) {
      const cue = effectToCue(effect.type);
      if (cue === null) continue;
      if (best === null || CUE_PRIORITY.indexOf(cue) < CUE_PRIORITY.indexOf(best)) {
        best = cue;
      }
    }

    if (best !== null) {
      this.activeCue = best;
      this.cueUntil = now + CUE_DURATION_S;
    } else if (this.activeCue !== null && now >= this.cueUntil) {
      this.activeCue = null;
    }

    return this.activeCue;
  }

  get cue(): CombatCue | null {
    return this.activeCue;
  }

  reset(): void {
    this.activeCue = null;
    this.cueUntil = 0;
  }
}
