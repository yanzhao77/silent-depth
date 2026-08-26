/**
 * t-027 integration finding — regression: raising the periscope from a deeper
 * layer must auto-surface (SURFACING → RAISING → RAISED) even when the player's
 * depth input is STALE (still pointing at the old layer), i.e. the player only
 * presses P and does not touch Q/E. The submarine's transition timer must start
 * when the periscope hold pre-sets targetDepthLayer.
 */

import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../src/core/engine';
import { getMissionDef } from '../../src/missions/missions';
import { FIXED_DT } from '../../src/core/time';
import type { PlayerInputs } from '../../src/core/types';

const BASE: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: 'Shallow',
  silentRunning: true,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
};

describe('periscope auto-surface with stale depth input (t-027)', () => {
  it('P from Shallow with stale input reaches RAISED without touching Q/E', () => {
    const def = getMissionDef('M02');
    const h = createGame(def, def.seed);
    let snap = step(h, FIXED_DT, BASE);
    // wait for the briefing to end (MISSION_RUNNING)
    let t = 0;
    for (; t < 200 && snap.state !== 'MISSION_RUNNING'; t++) snap = step(h, FIXED_DT, BASE);
    expect(snap.state).toBe('MISSION_RUNNING');
    expect(snap.playerSub.depthLayer).toBe('Shallow');
    let pressed = false;
    let raised = false;
    for (; t < 4000; t++) {
      const periscope = !pressed && t > 100;
      if (periscope) pressed = true;
      snap = step(h, FIXED_DT, { ...BASE, depthLayerTarget: 'Shallow', periscope });
      if (snap.periscope.state === 'RAISED') {
        raised = true;
        break;
      }
    }
    expect(pressed).toBe(true);
    expect(raised).toBe(true);
    expect(snap.playerSub.depthLayer).toBe('Periscope');
    expect(snap.periscope.state).toBe('RAISED');
    // and the stale input does NOT yank the depth back down
    const snap2 = step(h, FIXED_DT, { ...BASE, depthLayerTarget: 'Shallow' });
    expect(snap2.playerSub.depthLayer).toBe('Periscope');
  });
});
