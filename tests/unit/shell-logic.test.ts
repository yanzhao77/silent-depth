// SILENT DEPTH — shell logic helper tests (tests/unit/shell-logic.test.ts)
// ---------------------------------------------------------------------------
// The extracted pure functions from the browser shell (src/ui/shellLogic.ts)
// are Node-importable (module-scope is DOM-free). These cover the snapshot
// lookups, the off-screen camera test, mission-result construction, and the
// salvo-2 input assembly rule that previously lived only inside main.ts (which
// is not Node-importable and reported 0% coverage).
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import {
  assembleInputs,
  buildMissionResult,
  findEnemy,
  findTorpedo,
  isPlayerOffScreen,
} from '../../src/ui/shellLogic';
import { createCamera } from '../../src/rendering/camera';
import type { GameSnapshot, PlayerInputs } from '../../src/core/types';

const BASE_INPUTS: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Medium',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
  periscope: false,
  lockTarget: false,
  emergencyDive: false,
};

function makeSnap(): GameSnapshot {
  return {
    simTime: 0,
    state: 'MISSION_RUNNING',
    mission: { id: 'M01' } as unknown as GameSnapshot['mission'],
    playerSub: {
      position: { x: 15, y: 15 },
      headingDeg: 0,
      speedKt: 0,
      hull: 100,
      battery: 100,
      depthLayer: 'Medium',
      detection: 0,
    } as GameSnapshot['playerSub'],
    enemies: [
      {
        id: 'E-01',
        shipClass: 'Tanker',
        position: { x: 20, y: 20 },
        hull: 100,
      },
    ] as unknown as GameSnapshot['enemies'],
    torpedoes: [
      { id: 'T-01', position: { x: 5, y: 5 } },
      { id: 'T-02', position: { x: 6, y: 6 } },
    ] as unknown as GameSnapshot['torpedoes'],
    contacts: [],
    decoys: [],
    eventLog: [],
    score: { total: 850, grade: 'Good' } as GameSnapshot['score'],
    stats: {
      torpedoesFired: 4,
      torpedoesHit: 3,
      peakDetection: 45,
      elapsedS: 900,
      torpedoesRemaining: 4,
      bestScore: 0,
    } as GameSnapshot['stats'],
  } as unknown as GameSnapshot;
}

describe('shell logic — snapshot lookups', () => {
  it('findTorpedo returns the torpedo for a matching string id', () => {
    expect(findTorpedo(makeSnap(), 'T-01')?.id).toBe('T-01');
  });

  it('findTorpedo returns null for non-strings and unknown ids', () => {
    expect(findTorpedo(makeSnap(), 5)).toBeNull();
    expect(findTorpedo(makeSnap(), 'NOPE')).toBeNull();
  });

  it('findEnemy returns the enemy for a matching string id', () => {
    expect(findEnemy(makeSnap(), 'E-01')?.shipClass).toBe('Tanker');
  });

  it('findEnemy returns null for non-strings and unknown ids', () => {
    expect(findEnemy(makeSnap(), undefined)).toBeNull();
    expect(findEnemy(makeSnap(), 'NOPE')).toBeNull();
  });
});

describe('shell logic — off-screen camera test', () => {
  it('is false when the player is inside the viewport', () => {
    const cam = createCamera({ zoom: 8, viewport: { width: 800, height: 600 }, mapSizeKm: 30 });
    cam.setCenter(15, 15);
    expect(isPlayerOffScreen(makeSnap(), cam)).toBe(false);
  });

  it('is true when the player is far off the viewport', () => {
    // 200×200 viewport @ 16 px/km ⇒ ±6.25 km half-extent. Player at world
    // (0,0) vs center (15,15) is 15 km away → far beyond the viewport.
    const cam = createCamera({ zoom: 16, viewport: { width: 200, height: 200 }, mapSizeKm: 30 });
    cam.setCenter(15, 15);
    const snap = makeSnap();
    snap.playerSub = { ...snap.playerSub, position: { x: 0, y: 0 } } as GameSnapshot['playerSub'];
    expect(isPlayerOffScreen(snap, cam)).toBe(true);
  });
});

describe('shell logic — mission result construction', () => {
  it('marks a victory as completed with the snapshot score/stats', () => {
    const snap = makeSnap();
    const result = buildMissionResult('M01', 'victory', snap, { Cargo: 2 });
    expect(result.missionId).toBe('M01');
    expect(result.completed).toBe(true);
    expect(result.score).toBe(850);
    expect(result.grade).toBe('Good');
    expect(result.torpedoesFired).toBe(4);
    expect(result.torpedoesHit).toBe(3);
    expect(result.peakDetection).toBe(45);
    expect(result.elapsedS).toBe(900);
    expect(result.shipsSunk).toEqual({ Cargo: 2 });
  });

  it('marks a defeat as not completed', () => {
    const result = buildMissionResult('M02', 'defeat', makeSnap(), {});
    expect(result.completed).toBe(false);
  });
});

describe('shell logic — salvo input assembly', () => {
  it('passes through base inputs and pulse edges', () => {
    const { inputs } = assembleInputs(BASE_INPUTS, null, null, {
      pause: true,
      periscope: true,
      lock: false,
      dive: false,
    });
    expect(inputs.pause).toBe(true);
    expect(inputs.periscope).toBe(true);
    expect(inputs.lockTarget).toBe(false);
    expect(inputs.emergencyDive).toBe(false);
    expect(inputs.fireTorpedo).toBeNull();
  });

  it('honors an immediate fire request and latches the queue flag', () => {
    const out = assembleInputs(BASE_INPUTS, 'C-01', null, {
      pause: false,
      periscope: false,
      lock: false,
      dive: false,
    });
    expect(out.fireTorpedo).toBe('C-01');
    expect(out.latchQueue).toBe(true);
  });

  it('replays a queued fire when no fresh request arrives', () => {
    const out = assembleInputs(BASE_INPUTS, null, 'C-02', {
      pause: false,
      periscope: false,
      lock: false,
      dive: false,
    });
    expect(out.fireTorpedo).toBe('C-02');
    expect(out.latchQueue).toBe(false);
  });

  it('a fresh request overrides the queued one', () => {
    const out = assembleInputs(BASE_INPUTS, 'C-NEW', 'C-OLD', {
      pause: false,
      periscope: false,
      lock: false,
      dive: false,
    });
    expect(out.fireTorpedo).toBe('C-NEW');
    expect(out.latchQueue).toBe(true);
  });
});
