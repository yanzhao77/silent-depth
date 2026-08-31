/**
 * SILENT DEPTH V2.8 — HUD Presentation State (src/ui/hudPresentation.ts)
 *
 * Pure functions to derive HUD mode and panel visibility from the authoritative
 * GameSnapshot and RenderState. No DOM, no side effects, fully unit-testable.
 *
 * Mode priority (highest first):
 *   paused      — game is paused (state PAUSED or MENU during mission)
 *   cinematic   — F12 cinematic capture active (cinematicCaptureActive === true)
 *   periscope   — periscope raised/observing
 *   warning     — battery low or detection threshold exceeded
 *   firecontrol — contact selected AND fire solution exists (non-estimated preferred)
 *   contact     — contacts present (any state)
 *   quiet       — running, no contacts, no lock, detection < 20
 *   normal      — default running state
 *
 * Panel visibility is a separate derivation so tests can assert exact cards.
 */

import type { GameSnapshot, GameState } from '../core/types';

/** HUD presentation mode — controls which CSS class is applied to .hud root. */
export type HudMode =
  'paused' | 'cinematic' | 'periscope' | 'warning' | 'firecontrol' | 'contact' | 'quiet' | 'normal';

/** Which panels should be visible/collapsed in each mode. */
export interface PanelVisibility {
  /** Top bar (brand, mission, weather, settings, FPS) — always visible except cinematic. */
  topbar: boolean;
  /** Workspace header (mission id, timer, speed, zoom). */
  workspace: boolean;
  /** Left column: sub status card. */
  statusCard: boolean;
  /** Left column: tasks/objectives card. */
  tasksCard: boolean;
  /** Left column: torpedoes card. */
  torpedoesCard: boolean;
  /** Left column: periscope control card. */
  periscopeControlCard: boolean;
  /** Right column: contacts card. */
  contactsCard: boolean;
  /** Right column: fire control card (solution or placeholder). */
  fireControlCard: 'hidden' | 'placeholder' | 'solution';
  /** Right column: controls/keybindings card. */
  controlsCard: boolean;
  /** Bottom: event log timeline. */
  timeline: boolean;
  /** Periscope view overlay (full-screen optical view). */
  periscopeView: boolean;
}

/** Input for deriveHudMode — everything it needs from snapshot + render state. */
export interface HudModeInput {
  gameState: GameState;
  contacts: GameSnapshot['contacts'];
  periscope: GameSnapshot['periscope'];
  playerSub: GameSnapshot['playerSub'];
  /** Whether F12 cinematic capture is currently active (not the camera preset). */
  cinematicCaptureActive: boolean;
}

/**
 * Derive the current HUD mode from simulation state.
 * Pure function — same inputs always produce same output.
 */
export function deriveHudMode(input: HudModeInput): HudMode {
  const { gameState, contacts, periscope, playerSub, cinematicCaptureActive } = input;

  // 1. Paused — highest priority, covers PAUSED and MENU during mission
  if (gameState === 'PAUSED' || gameState === 'MENU') {
    return 'paused';
  }

  // 2. Cinematic — F12 capture mode (explicit capture flag, NOT camera preset)
  if (cinematicCaptureActive) {
    return 'cinematic';
  }

  // 3. Periscope — raised or observing
  if (
    periscope.state === 'RAISING' ||
    periscope.state === 'RAISED' ||
    periscope.state === 'OBSERVING' ||
    periscope.state === 'LOWERING'
  ) {
    return 'periscope';
  }

  // 4. Warning — battery low or detection threshold exceeded
  if (playerSub.lowBattery || playerSub.detection >= 50) {
    return 'warning';
  }

  // 5. Fire control — contact selected AND fire solution available
  const hasSelectedContact = contacts.some((c) => c.id === periscope.lockedContactId);
  const hasFireSolution = hasSelectedContact && periscope.lockedContactId !== null;
  if (hasFireSolution) {
    return 'firecontrol';
  }

  // 6. Contact — any contacts present
  if (contacts.length > 0) {
    return 'contact';
  }

  // 7. Quiet — running, no contacts, no lock, low detection
  if (
    gameState === 'MISSION_RUNNING' &&
    contacts.length === 0 &&
    periscope.lockedContactId === null &&
    playerSub.detection < 20
  ) {
    return 'quiet';
  }

  // 8. Normal — default running state
  return 'normal';
}

/**
 * Derive which panels should be visible for a given mode.
 * Pure function — same inputs always produce same output.
 */
export function deriveVisiblePanels(mode: HudMode): PanelVisibility {
  const base: PanelVisibility = {
    topbar: true,
    workspace: true,
    statusCard: true,
    tasksCard: true,
    torpedoesCard: true,
    periscopeControlCard: true,
    contactsCard: true,
    fireControlCard: 'placeholder',
    controlsCard: false,
    timeline: true,
    periscopeView: false,
  };

  switch (mode) {
    case 'paused':
      return {
        ...base,
        controlsCard: true, // show keybindings in pause menu context
        timeline: true,
      };
    case 'cinematic':
      return {
        ...base,
        topbar: false,
        workspace: false,
        statusCard: false,
        tasksCard: false,
        torpedoesCard: false,
        periscopeControlCard: false,
        contactsCard: false,
        fireControlCard: 'hidden',
        controlsCard: false,
        timeline: false,
        periscopeView: false,
      };
    case 'periscope':
      return {
        ...base,
        workspace: true,
        tasksCard: false,
        torpedoesCard: false,
        contactsCard: false,
        fireControlCard: 'hidden',
        controlsCard: false,
        timeline: false,
        periscopeView: true,
      };
    case 'warning':
      return {
        ...base,
        controlsCard: false,
        timeline: true,
      };
    case 'firecontrol':
      return {
        ...base,
        fireControlCard: 'solution',
        controlsCard: false,
        timeline: true,
      };
    case 'contact':
      return {
        ...base,
        fireControlCard: 'placeholder',
        controlsCard: false,
        timeline: true,
      };
    case 'quiet':
      return {
        ...base,
        tasksCard: false,
        torpedoesCard: false,
        contactsCard: false,
        fireControlCard: 'hidden',
        controlsCard: false,
        timeline: false,
      };
    case 'normal':
    default:
      return base;
  }
}

/**
 * Derive contact presentation data for the contacts list.
 * UNKNOWN contacts are shown with limited info (classification = Unknown).
 * Hidden ships (visible === false) are filtered at render state level, not here.
 */
export function deriveContactPresentation(
  contacts: GameSnapshot['contacts'],
  selectedId: string | null,
): Array<{
  id: string;
  state: string;
  type: string;
  rangeKm: number | null;
  bearingDeg: number;
  confidence: number;
  lastDetectedAt: number;
  selected: boolean;
  visuallyConfirmed: boolean;
  isUnknown: boolean;
}> {
  return contacts.map((c) => ({
    id: c.id,
    state: c.state,
    type: c.classification,
    rangeKm: c.rangeKm,
    bearingDeg: c.bearingDeg,
    confidence: c.confidence,
    lastDetectedAt: c.lastDetectedAt,
    selected: c.id === selectedId,
    visuallyConfirmed: c.visuallyConfirmed === true,
    isUnknown: c.classification === 'Unknown' || c.classification === 'LargeSurface',
  }));
}
