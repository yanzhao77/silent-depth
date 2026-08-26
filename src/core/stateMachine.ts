/**
 * SILENT DEPTH — game state machine (src/core/stateMachine.ts)
 *
 * FR-19, GAME_DESIGN §3.3, GAME_ARCHITECTURE §4.
 *
 *   BOOT → MENU → MISSION_LOADING → MISSION_RUNNING ⇄ PAUSED
 *        → VICTORY | DEFEAT → MISSION_RESULT → MENU
 *
 * DESIGN DECISION — illegal transitions THROW (GameStateTransitionError):
 * an illegal transition is a programming error (the engine guards all
 * user-driven transitions before calling this machine), so we fail fast
 * instead of silently swallowing state bugs. `canTransition()` is provided
 * for guard checks (e.g. shell code deciding whether a request is legal).
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { GameState } from './types';

export class GameStateTransitionError extends Error {
  constructor(from: GameState, to: GameState) {
    super(`illegal game state transition: ${from} → ${to}`);
    this.name = 'GameStateTransitionError';
  }
}

/**
 * Allowed transitions. Additional edges beyond the documented main path:
 *   - MISSION_LOADING → MENU   (abort during briefing)
 *   - MISSION_RUNNING → MENU   (Abort, GAME_DESIGN §3.1)
 *   - PAUSED          → MENU   (Abort from pause)
 * Restart (GAME_DESIGN §3.1) is implemented by the shell as createGame() again
 * with the same seed — no engine edge needed (DESIGN DECISION).
 */
const TRANSITION_TABLE: Record<GameState, readonly GameState[]> = {
  BOOT: ['MENU'],
  MENU: ['MISSION_LOADING'],
  MISSION_LOADING: ['MISSION_RUNNING', 'MENU'],
  MISSION_RUNNING: ['PAUSED', 'VICTORY', 'DEFEAT', 'MENU'],
  PAUSED: ['MISSION_RUNNING', 'MENU'],
  VICTORY: ['MISSION_RESULT'],
  DEFEAT: ['MISSION_RESULT'],
  MISSION_RESULT: ['MENU'],
};

/** Read-only view of the transition table (documentation / tests). */
export const GAME_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = TRANSITION_TABLE;

export class GameStateMachine {
  private current: GameState;

  constructor(initial: GameState = 'BOOT') {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  canTransition(target: GameState): boolean {
    return TRANSITION_TABLE[this.current].includes(target);
  }

  /** Throws GameStateTransitionError on illegal transitions. */
  transition(target: GameState): void {
    if (!this.canTransition(target)) {
      throw new GameStateTransitionError(this.current, target);
    }
    this.current = target;
  }

  /** Full reset to BOOT (used by tests / engine re-init). */
  reset(): void {
    this.current = 'BOOT';
  }
}
