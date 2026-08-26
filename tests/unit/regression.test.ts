/**
 * SILENT DEPTH — regression guards exposed by the integration playtests
 * (tests/unit/regression.test.ts)
 *
 * t-013 QA: the gameplay integration suite scripts real victories (M02) and
 * F9 escape (M05). These regressions lock the *repeatability* of those scripted
 * outcomes so a future change to the pipeline (RNG order, contact promotion,
 * fire control, escape timer) that breaks a win is caught here even if the
 * assertion wording in gameplay.test.ts evolves.
 *
 * Environment: vitest node. Deterministic — no Math.random anywhere.
 */

import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../src/core/engine';
import { getMissionDef } from '../../src/missions/missions';
import { FIXED_DT } from '../../src/core/time';
import { compassBearing, distKm } from '../../src/sonar/contacts';
import type { GameSnapshot, PlayerInputs } from '../../src/core/types';

const IDLE: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

describe('M02 scripted torpedo victory is repeatable (same seed → same outcome)', () => {
  const def = getMissionDef('M02');
  const tankerPos = def.spawns[0]!;

  function play(): GameSnapshot {
    const handle = createGame(def, def.seed);
    let last = IDLE;
    let lastPingAt = -1e9;
    let snap = step(handle, FIXED_DT, IDLE);
    for (let t = 0; t < 120000; t++) {
      const contact = snap.contacts.find((c) => c.rangeKm !== null && c.trueShipId !== null);
      const range =
        contact !== undefined ? contact.rangeKm! : distKm(snap.playerSub.position, tankerPos);
      const tanker = snap.enemies.find((e) => e.id === contact?.trueShipId);
      const torpedoRunning = snap.torpedoes.some(
        (tp) => tp.targetShipId === tanker?.id && tp.state === 'RUNNING',
      );
      const canFire =
        contact !== undefined &&
        range <= 1.2 &&
        snap.playerSub.pingCooldown <= 0 &&
        !torpedoRunning &&
        snap.state === 'MISSION_RUNNING' &&
        snap.playerSub.torpedoTubes.some((tb) => tb.state === 'LOADED' || tb.state === 'READY');
      const fire = canFire ? contact!.id : null;
      // Stationary ambush (t-020): hold position, ping for range, fire with
      // the lead-corrected fire solution (compass heading convention).
      const wantRangePing =
        snap.playerSub.pingCooldown <= 0 && t - lastPingAt >= 3000 && !last.ping;
      const ping = (fire !== null && !last.ping) || wantRangePing;
      if (ping) lastPingAt = t;
      const rudder = clamp(
        angleDelta(snap.playerSub.headingDeg, contact !== undefined ? contact.bearingDeg : 0) / 15,
        -1,
        1,
      );
      const inputs: PlayerInputs = {
        throttle: 0,
        rudder,
        depthLayerTarget: 'Medium',
        silentRunning: false,
        ping,
        fireTorpedo: fire,
        decoy: false,
        pause: false,
      };
      last = inputs;
      snap = step(handle, FIXED_DT, inputs);
      if (snap.state === 'VICTORY' || snap.state === 'DEFEAT' || snap.state === 'MISSION_RESULT')
        break;
    }
    return snap;
  }

  it('two plays produce the identical victory score and sunk set', () => {
    const a = play();
    const b = play();
    expect(a.state).toBe('VICTORY');
    expect(b.state).toBe('VICTORY');
    expect(a.score).toEqual(b.score);
    expect(a.enemies.map((e) => e.hull)).toEqual(b.enemies.map((e) => e.hull));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('F9 escape event fires exactly once per game', () => {
  const def = getMissionDef('M05');

  function play(): GameSnapshot {
    const handle = createGame(def, def.seed);
    let snap = step(handle, FIXED_DT, IDLE);
    for (let t = 0; t < 2000; t++) {
      const escorts = snap.enemies.filter((e) => e.hull > 0 && e.shipClass !== 'Cargo');
      const awayBearing =
        escorts.length > 0
          ? compassBearing(snap.playerSub.position, escorts[0]!.position) + 180
          : snap.playerSub.headingDeg;
      const inputs: PlayerInputs = {
        throttle: 4,
        rudder: clamp(angleDelta(snap.playerSub.headingDeg, awayBearing) / 15, -1, 1),
        depthLayerTarget: 'Medium',
        silentRunning: true,
        ping: false,
        fireTorpedo: null,
        decoy: false,
        pause: false,
      };
      snap = step(handle, FIXED_DT, inputs);
      if (snap.mission.escaped) break;
    }
    return snap;
  }

  it('missionStatus.escaped latches and the event is emitted once', () => {
    const snap = play();
    expect(snap.mission.escaped).toBe(true);
    expect(snap.eventLog.filter((e) => e.type === 'escape.escaped').length).toBe(1);
  });
});
