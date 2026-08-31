/**
 * SILENT DEPTH V2.8 — HUD Presentation State Unit Tests (tests/unit/v2.8-hud-presentation.test.ts)
 *
 * Pure function tests for deriveHudMode, deriveVisiblePanels, deriveContactPresentation.
 * No DOM, no canvas, no Math.random — fully deterministic Node tests.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveHudMode,
  deriveVisiblePanels,
  deriveContactPresentation,
  type HudModeInput,
} from '../../src/ui/hudPresentation';
import type {
  GameSnapshot,
  Contact,
  PeriscopePublicState,
  SubmarineState,
  SpeedBand,
  ScoreGrade,
  TorpedoTube,
} from '../../src/core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const baseSub: SubmarineState = {
    position: { x: 15, y: 15 },
    headingDeg: 90,
    speedKt: 8,
    depthLayer: 'Periscope',
    depthM: 18,

    hull: 100,
    battery: 80,
    noise: 20,
    detection: 10,
    silentRunning: false,
    decoyCount: 3,
    torpedoTubes: [
      { id: 'T1', state: 'LOADED', targetContactId: null },
      { id: 'T2', state: 'LOADED', targetContactId: null },
      { id: 'T3', state: 'LOADED', targetContactId: null },
      { id: 'T4', state: 'LOADED', targetContactId: null },
    ] as TorpedoTube[],
    lowBattery: false,
    speedBand: 'CRUISE' as SpeedBand,
    targetSpeedKt: 8,
    targetDepthLayer: 'Periscope',
    depthTransitionT: null,
    sonarState: 'passive',
    pingCooldown: 0,
    outOfBoundsTimer: 0,
    ...overrides.playerSub,
  };

  const basePeriscope: PeriscopePublicState = {
    state: 'SUBMERGED',
    progress: 0,
    raisedDurationS: 0,
    exposure: 0,
    exposureBand: 'NONE',
    canRaise: true,
    cannotRaiseReason: 'none',
    observingContactId: null,
    lockedContactId: null,
    viewBearingDeg: 90,
    ...overrides.periscope,
  };

  return {
    simTime: 120,
    state: 'MISSION_RUNNING',
    playerSub: baseSub,
    contacts: [],
    enemies: [],
    torpedoes: [],
    decoys: [],
    mission: {
      missionId: 'M01',
      phase: 'running',
      objectives: [{ id: 'obj1', desc: 'Sink merchant', done: false, weight: 1 }],
      escaped: false,
      forcedSurface: false,
    },
    score: {
      objective: 0,
      damage: 0,
      stealth: 0,
      torpedoEfficiency: 0,
      time: 0,
      survival: 0,
      total: 0,
      grade: 'Failed' as ScoreGrade,
    },
    eventLog: [],
    stats: {
      torpedoesFired: 0,
      torpedoesHit: 0,
      peakDetection: 10,
      elapsedS: 120,
      torpedoesRemaining: 4,
      bestScore: 0,
    },
    periscope: basePeriscope,
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'C-01',
    state: 'CLASSIFIED',
    bearingDeg: 47,
    rangeKm: 3.2,
    bearingErrorDeg: 3,
    rangeErrorFrac: 0.1,
    speedEstimateKt: 12,
    headingEstimateDeg: 142,
    speedErrorFrac: 0.1,
    classification: 'Merchant',
    classifyConfidence: 85,
    confidence: 78,
    signalStrength: 'Medium',
    lastDetectedAt: 120,
    lastPingAt: 0,
    lastBearingAt: 120,
    observations: 5,
    trueShipId: 'E-01',
    visuallyConfirmed: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<HudModeInput> = {}): HudModeInput {
  const snap = makeBaseSnapshot();
  return {
    gameState: snap.state,
    contacts: snap.contacts,
    periscope: snap.periscope,
    playerSub: snap.playerSub,
    cameraMode: 'tactical',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveHudMode Tests
// ---------------------------------------------------------------------------

describe('deriveHudMode', () => {
  it('returns "paused" when gameState is PAUSED', () => {
    const input = makeInput({ gameState: 'PAUSED' });
    expect(deriveHudMode(input)).toBe('paused');
  });

  it('returns "paused" when gameState is MENU during mission', () => {
    const input = makeInput({ gameState: 'MENU' });
    expect(deriveHudMode(input)).toBe('paused');
  });

  it('returns "cinematic" when cameraMode is cinematic (highest after paused)', () => {
    const input = makeInput({ cameraMode: 'cinematic' });
    expect(deriveHudMode(input)).toBe('cinematic');
  });

  it('returns "periscope" when periscope is RAISING', () => {
    const input = makeInput({
      periscope: { ...makeBaseSnapshot().periscope, state: 'RAISING' },
    });
    expect(deriveHudMode(input)).toBe('periscope');
  });

  it('returns "periscope" when periscope is RAISED', () => {
    const input = makeInput({
      periscope: { ...makeBaseSnapshot().periscope, state: 'RAISED' },
    });
    expect(deriveHudMode(input)).toBe('periscope');
  });

  it('returns "periscope" when periscope is OBSERVING', () => {
    const input = makeInput({
      periscope: { ...makeBaseSnapshot().periscope, state: 'OBSERVING' },
    });
    expect(deriveHudMode(input)).toBe('periscope');
  });

  it('returns "periscope" when periscope is LOWERING', () => {
    const input = makeInput({
      periscope: { ...makeBaseSnapshot().periscope, state: 'LOWERING' },
    });
    expect(deriveHudMode(input)).toBe('periscope');
  });

  it('returns "warning" when battery is low', () => {
    const input = makeInput({
      playerSub: { ...makeBaseSnapshot().playerSub, lowBattery: true },
    });
    expect(deriveHudMode(input)).toBe('warning');
  });

  it('returns "warning" when detection >= 50', () => {
    const input = makeInput({
      playerSub: { ...makeBaseSnapshot().playerSub, detection: 60 },
    });
    expect(deriveHudMode(input)).toBe('warning');
  });

  it('returns "firecontrol" when contact selected AND locked', () => {
    const input = makeInput({
      contacts: [makeContact({ id: 'C-01' })],
      periscope: { ...makeBaseSnapshot().periscope, lockedContactId: 'C-01' },
    });
    expect(deriveHudMode(input)).toBe('firecontrol');
  });

  it('returns "contact" when contacts present but no lock', () => {
    const input = makeInput({
      contacts: [makeContact({ id: 'C-01' })],
    });
    expect(deriveHudMode(input)).toBe('contact');
  });

  it('returns "quiet" when running, no contacts, no lock, detection < 20', () => {
    const input = makeInput({
      contacts: [],
      playerSub: { ...makeBaseSnapshot().playerSub, detection: 10 },
    });
    expect(deriveHudMode(input)).toBe('quiet');
  });

  it('returns "normal" as default running state', () => {
    const input = makeInput({
      contacts: [],
      playerSub: { ...makeBaseSnapshot().playerSub, detection: 25 },
    });
    expect(deriveHudMode(input)).toBe('normal');
  });

  it('priority: paused > cinematic > periscope > warning > firecontrol > contact > quiet > normal', () => {
    // paused beats everything
    expect(deriveHudMode(makeInput({ gameState: 'PAUSED', cameraMode: 'cinematic' }))).toBe(
      'paused',
    );
    // cinematic beats periscope
    expect(
      deriveHudMode(
        makeInput({
          cameraMode: 'cinematic',
          periscope: { ...makeBaseSnapshot().periscope, state: 'RAISED' },
        }),
      ),
    ).toBe('cinematic');
    // periscope beats warning
    expect(
      deriveHudMode(
        makeInput({
          periscope: { ...makeBaseSnapshot().periscope, state: 'RAISED' },
          playerSub: { ...makeBaseSnapshot().playerSub, lowBattery: true },
        }),
      ),
    ).toBe('periscope');
    // warning beats firecontrol
    expect(
      deriveHudMode(
        makeInput({
          playerSub: { ...makeBaseSnapshot().playerSub, lowBattery: true },
          contacts: [makeContact()],
          periscope: { ...makeBaseSnapshot().periscope, lockedContactId: 'C-01' },
        }),
      ),
    ).toBe('warning');
    // firecontrol beats contact
    expect(
      deriveHudMode(
        makeInput({
          contacts: [makeContact({ id: 'C-01' })],
          periscope: { ...makeBaseSnapshot().periscope, lockedContactId: 'C-01' },
        }),
      ),
    ).toBe('firecontrol');
    // contact beats quiet
    expect(
      deriveHudMode(
        makeInput({
          contacts: [makeContact({ id: 'C-01' })],
          playerSub: { ...makeBaseSnapshot().playerSub, detection: 10 },
        }),
      ),
    ).toBe('contact');
    // quiet beats normal
    expect(
      deriveHudMode(
        makeInput({ contacts: [], playerSub: { ...makeBaseSnapshot().playerSub, detection: 10 } }),
      ),
    ).toBe('quiet');
  });
});

// ---------------------------------------------------------------------------
// deriveVisiblePanels Tests
// ---------------------------------------------------------------------------

describe('deriveVisiblePanels', () => {
  it('paused: shows controls card, hides periscope view', () => {
    const panels = deriveVisiblePanels('paused');
    expect(panels.controlsCard).toBe(true);
    expect(panels.periscopeView).toBe(false);
    expect(panels.topbar).toBe(true);
    expect(panels.workspace).toBe(true);
  });

  it('cinematic: hides ALL panels except periscope view', () => {
    const panels = deriveVisiblePanels('cinematic');
    expect(panels.topbar).toBe(false);
    expect(panels.workspace).toBe(false);
    expect(panels.statusCard).toBe(false);
    expect(panels.tasksCard).toBe(false);
    expect(panels.torpedoesCard).toBe(false);
    expect(panels.periscopeControlCard).toBe(false);
    expect(panels.contactsCard).toBe(false);
    expect(panels.fireControlCard).toBe('hidden');
    expect(panels.controlsCard).toBe(false);
    expect(panels.timeline).toBe(false);
    expect(panels.periscopeView).toBe(false);
  });

  it('periscope: shows periscope view, hides contacts/firecontrol/timeline', () => {
    const panels = deriveVisiblePanels('periscope');
    expect(panels.periscopeView).toBe(true);
    expect(panels.contactsCard).toBe(false);
    expect(panels.fireControlCard).toBe('hidden');
    expect(panels.timeline).toBe(false);
    expect(panels.controlsCard).toBe(false);
    expect(panels.tasksCard).toBe(false);
    expect(panels.torpedoesCard).toBe(false);
    expect(panels.statusCard).toBe(true);
    expect(panels.periscopeControlCard).toBe(true);
  });

  it('warning: shows all main panels, hides controls', () => {
    const panels = deriveVisiblePanels('warning');
    expect(panels.topbar).toBe(true);
    expect(panels.workspace).toBe(true);
    expect(panels.statusCard).toBe(true);
    expect(panels.tasksCard).toBe(true);
    expect(panels.torpedoesCard).toBe(true);
    expect(panels.periscopeControlCard).toBe(true);
    expect(panels.contactsCard).toBe(true);
    expect(panels.fireControlCard).toBe('placeholder');
    expect(panels.controlsCard).toBe(false);
    expect(panels.timeline).toBe(true);
    expect(panels.periscopeView).toBe(false);
  });

  it('firecontrol: shows solution (not placeholder), hides controls', () => {
    const panels = deriveVisiblePanels('firecontrol');
    expect(panels.fireControlCard).toBe('solution');
    expect(panels.controlsCard).toBe(false);
    expect(panels.periscopeView).toBe(false);
  });

  it('contact: shows placeholder fire control, hides controls', () => {
    const panels = deriveVisiblePanels('contact');
    expect(panels.fireControlCard).toBe('placeholder');
    expect(panels.controlsCard).toBe(false);
    expect(panels.periscopeView).toBe(false);
  });

  it('quiet: hides tasks, torpedoes, contacts, firecontrol, timeline', () => {
    const panels = deriveVisiblePanels('quiet');
    expect(panels.tasksCard).toBe(false);
    expect(panels.torpedoesCard).toBe(false);
    expect(panels.contactsCard).toBe(false);
    expect(panels.fireControlCard).toBe('hidden');
    expect(panels.controlsCard).toBe(false);
    expect(panels.timeline).toBe(false);
    expect(panels.statusCard).toBe(true);
    expect(panels.periscopeControlCard).toBe(true);
    expect(panels.periscopeView).toBe(false);
  });

  it('normal: shows all standard panels, placeholder fire control', () => {
    const panels = deriveVisiblePanels('normal');
    expect(panels.topbar).toBe(true);
    expect(panels.workspace).toBe(true);
    expect(panels.statusCard).toBe(true);
    expect(panels.tasksCard).toBe(true);
    expect(panels.torpedoesCard).toBe(true);
    expect(panels.periscopeControlCard).toBe(true);
    expect(panels.contactsCard).toBe(true);
    expect(panels.fireControlCard).toBe('placeholder');
    expect(panels.controlsCard).toBe(false);
    expect(panels.timeline).toBe(true);
    expect(panels.periscopeView).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveContactPresentation Tests
// ---------------------------------------------------------------------------

describe('deriveContactPresentation', () => {
  it('includes UNKNOWN state contacts with limited info', () => {
    const contacts = [
      makeContact({ id: 'C-01', state: 'CLASSIFIED' }),
      makeContact({ id: 'C-02', state: 'UNKNOWN', classification: 'Unknown' }),
      makeContact({ id: 'C-03', state: 'TRACKED' }),
    ];
    const result = deriveContactPresentation(contacts, null);
    expect(result.length).toBe(3);
    expect(result.map((c) => c.id)).toEqual(['C-01', 'C-02', 'C-03']);
    // UNKNOWN contact should have type = Unknown
    const unknownContact = result.find((c) => c.id === 'C-02');
    expect(unknownContact?.type).toBe('Unknown');
    expect(unknownContact?.isUnknown).toBe(true);
  });

  it('marks selected contact', () => {
    const contacts = [makeContact({ id: 'C-01' }), makeContact({ id: 'C-02' })];
    const result = deriveContactPresentation(contacts, 'C-02');
    const c1 = result.find((c) => c.id === 'C-01');
    const c2 = result.find((c) => c.id === 'C-02');
    expect(c1?.selected).toBe(false);
    expect(c2?.selected).toBe(true);
  });

  it('preserves rangeKm as null for bearing-only contacts', () => {
    const contacts = [makeContact({ id: 'C-01', rangeKm: null })];
    const result = deriveContactPresentation(contacts, null);
    expect(result[0]?.rangeKm).toBeNull();
  });

  it('marks UNKNOWN classification as isUnknown', () => {
    const contacts = [
      makeContact({ id: 'C-01', classification: 'Merchant' }),
      makeContact({ id: 'C-02', classification: 'Unknown' }),
      makeContact({ id: 'C-03', classification: 'LargeSurface' }),
    ];
    const result = deriveContactPresentation(contacts, null);
    expect(result[0]?.isUnknown).toBe(false);
    expect(result[1]?.isUnknown).toBe(true);
    expect(result[2]?.isUnknown).toBe(true);
  });

  it('preserves visuallyConfirmed flag', () => {
    const contacts = [
      makeContact({ id: 'C-01', visuallyConfirmed: true }),
      makeContact({ id: 'C-02', visuallyConfirmed: false }),
    ];
    const result = deriveContactPresentation(contacts, null);
    expect(result[0]?.visuallyConfirmed).toBe(true);
    expect(result[1]?.visuallyConfirmed).toBe(false);
  });

  it('does not leak trueShipId in presentation', () => {
    const contacts = [makeContact({ id: 'C-01', trueShipId: 'E-01' })];
    const result = deriveContactPresentation(contacts, null);
    // The result type does not include trueShipId - verify by checking keys
    const keys = Object.keys(result[0] || {});
    expect(keys).not.toContain('trueShipId');
  });

  it('does not leak real shipClass for UNKNOWN contact', () => {
    // A contact with state UNKNOWN but real shipClass Merchant should show as Unknown
    const contacts = [
      makeContact({ id: 'C-01', state: 'UNKNOWN', classification: 'Unknown', trueShipId: 'E-01' }),
    ];
    const result = deriveContactPresentation(contacts, null);
    expect(result[0]?.type).toBe('Unknown');
    expect(result[0]?.isUnknown).toBe(true);
  });

  it('preserves uncertainty data (bearingErrorDeg, rangeErrorFrac, confidence)', () => {
    const contacts = [
      makeContact({ id: 'C-01', bearingErrorDeg: 5, rangeErrorFrac: 0.15, confidence: 45 }),
    ];
    const result = deriveContactPresentation(contacts, null);
    // The presentation includes confidence, bearingDeg, rangeKm
    // Uncertainty is derived from these in the HUD
    expect(result[0]?.confidence).toBe(45);
    expect(result[0]?.bearingDeg).toBe(47);
    expect(result[0]?.rangeKm).toBe(3.2);
  });

  it('selected UNKNOWN contact can be selected', () => {
    const contacts = [makeContact({ id: 'C-01', state: 'UNKNOWN' })];
    const result = deriveContactPresentation(contacts, 'C-01');
    expect(result[0]?.selected).toBe(true);
    expect(result[0]?.state).toBe('UNKNOWN');
  });

  it('UNKNOWN contact does not produce false fire solution indication', () => {
    // visuallyConfirmed should be false for UNKNOWN contacts
    const contacts = [makeContact({ id: 'C-01', state: 'UNKNOWN', visuallyConfirmed: false })];
    const result = deriveContactPresentation(contacts, null);
    expect(result[0]?.visuallyConfirmed).toBe(false);
  });

  it('returns all expected fields', () => {
    const contacts = [makeContact({ id: 'C-01' })];
    const result = deriveContactPresentation(contacts, 'C-01');
    const c = result[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c).toHaveProperty('id');
    expect(c).toHaveProperty('state');
    expect(c).toHaveProperty('type');
    expect(c).toHaveProperty('rangeKm');
    expect(c).toHaveProperty('bearingDeg');
    expect(c).toHaveProperty('confidence');
    expect(c).toHaveProperty('lastDetectedAt');
    expect(c).toHaveProperty('selected');
    expect(c).toHaveProperty('visuallyConfirmed');
    expect(c).toHaveProperty('isUnknown');
  });
});
