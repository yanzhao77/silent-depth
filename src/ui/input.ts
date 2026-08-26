/**
 * SILENT DEPTH — keyboard input (src/ui/input.ts)
 *
 * GAME_DESIGN §11.2 keyboard mapping (FR-18):
 *   W/S    speed up/down (target speed, ±2 kt, clamped [0, maxKt])
 *   A/D    rudder (A = port −1, D = starboard +1, 0 when released)
 *   Q/E    depth layer up/down (one step per keydown edge)
 *   Space  active-sonar ping (edge)
 *   F      fire torpedo at the selected contact (edge, one-shot)
 *   R      silent running toggle (edge)
 *   G      decoy launch (edge)
 *   P      raise/lower periscope (edge, t-026 — pause moved to the Esc menu)
 *   L      lock periscope target (edge, t-026)
 *   X      emergency dive (edge, t-026)
 *   Esc    pause menu (edge → onMenu callback)
 *   F12    screenshot (dev)
 *
 * Architecture: the module maps raw key CODES to PlayerInputs; the browser
 * binding (bind()) is a thin window-keyboard wrapper that preventDefaults
 * handled keys and feeds handleKey(code, pressed). Pure mapping is exposed
 * for Node unit tests via handleKey directly — no window required.
 *
 * DESIGN DECISIONS:
 *  - Edge inputs (ping / decoy / fire / periscope / lock / dive / depth-step /
 *    menu) are latched and consumed: ping/decoy stay true until getInputs()
 *    is read, fireRequest until consumeFireRequest(), periscope/lock/dive
 *    until their consume*Request() — the engine's own edge detection sees
 *    exactly one true tick.
 *  - t-026 hotkeys: P = periscope raise/lower (per user spec — pause moved to
 *    the Esc menu, reachable via menus.ts), L = lock target, X = emergency
 *    dive (X was unused — no conflict).
 *  - Throttle is a persistent target speed (engine integrates acceleration);
 *    steps of ±2 kt keep the value balance-driven via maxThrottleKt
 *    (balance.speedBands.FULL.speedMaxKt, never hardcoded).
 *  - Repeated keydown (OS key-repeat) is ignored for edges — only the first
 *    press latches (binding checks e.repeat).
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — no window/document at module scope.
 */

import type { DepthLayer, PlayerInputs } from '../core/types';
import { DEPTH_LAYER_ORDER } from '../world/ocean';

/** Throttle step in kt per W/S press. */
export const THROTTLE_STEP_KT = 2;

/** Key codes handled by the shell (for preventDefault + tests). */
export const HANDLED_KEYS: readonly string[] = [
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
  'KeyE',
  'Space',
  'KeyF',
  'KeyR',
  'KeyG',
  'KeyP',
  'KeyL',
  'KeyX',
  'Escape',
];

/** Minimal event-target surface the binding needs (window in the browser). */
export interface KeyEventTarget {
  addEventListener(type: string, cb: (e: unknown) => void): void;
  removeEventListener(type: string, cb: (e: unknown) => void): void;
}

export interface InputOptions {
  /** Throttle clamp (balance.speedBands.FULL.speedMaxKt). */
  maxThrottleKt: number;
  /** Called on the Esc keydown edge (shell opens the pause menu). */
  onMenu?: () => void;
  /** Called on the F12 keydown edge (shell saves a screenshot PNG). */
  onScreenshot?: () => void;
}

export interface InputController {
  /** Current PlayerInputs for this frame (edge latches consumed on read). */
  getInputs(): PlayerInputs;
  /** One-shot fire request: returns the selected contactId (or null) and
   *  clears the latch. Call once per frame after getInputs(). */
  consumeFireRequest(): string | null;
  /** One-shot periscope raise/lower edge (t-026, key P). */
  consumePeriscopeRequest(): boolean;
  /** One-shot periscope lock-target edge (t-026, key L). */
  consumeLockRequest(): boolean;
  /** One-shot emergency-dive edge (t-026, key X). */
  consumeDiveRequest(): boolean;
  /** The contact the fire control card / salvo targets. */
  setSelectedContactId(id: string | null): void;
  /** Raw key mapping — pure and testable. `pressed` true = keydown. */
  handleKey(code: string, pressed: boolean): void;
  /** Attach browser key listeners to a window-like target. */
  bind(target: KeyEventTarget): () => void;
  /** Reset all held state (mission start). */
  reset(): void;
  /** Remove listeners (target bound via bind). */
  dispose(): void;
}

export function createInput(opts: InputOptions): InputController {
  const maxThrottleKt = opts.maxThrottleKt > 0 ? opts.maxThrottleKt : 20;

  // Persistent state.
  let throttle = 0;
  let depthTargetIdx = DEPTH_LAYER_ORDER.indexOf('Shallow'); // engine starts at Shallow
  let silentRunning = false;
  const held = new Set<string>();
  let selectedContactId: string | null = null;

  // Edge latches.
  let pingLatch = false;
  let decoyLatch = false;
  let fireRequest: string | null = null;
  let periscopeLatch = false;
  let lockLatch = false;
  let diveLatch = false;

  let bound: {
    target: KeyEventTarget;
    down: (e: unknown) => void;
    up: (e: unknown) => void;
  } | null = null;

  function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
  }

  function handleKey(code: string, pressed: boolean): void {
    if (pressed) {
      held.add(code);
    } else {
      held.delete(code);
    }
    if (!pressed) return; // edges latch on keydown only

    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        throttle = clamp(throttle + THROTTLE_STEP_KT, 0, maxThrottleKt);
        break;
      case 'KeyS':
      case 'ArrowDown':
        throttle = clamp(throttle - THROTTLE_STEP_KT, 0, maxThrottleKt);
        break;
      case 'KeyQ': {
        const next = depthTargetIdx - 1;
        if (next >= 0) depthTargetIdx = next;
        break;
      }
      case 'KeyE': {
        const next = depthTargetIdx + 1;
        if (next < DEPTH_LAYER_ORDER.length) depthTargetIdx = next;
        break;
      }
      case 'Space':
        pingLatch = true;
        break;
      case 'KeyF':
        fireRequest = selectedContactId;
        break;
      case 'KeyR':
        silentRunning = !silentRunning;
        break;
      case 'KeyG':
        decoyLatch = true;
        break;
      case 'KeyP':
        periscopeLatch = true;
        break;
      case 'KeyL':
        lockLatch = true;
        break;
      case 'KeyX':
        diveLatch = true;
        break;
      case 'Escape':
        opts.onMenu?.();
        break;
      case 'F12':
        opts.onScreenshot?.();
        break;
    }
  }

  function getInputs(): PlayerInputs {
    let rudder = 0;
    if (held.has('KeyA') || held.has('ArrowLeft')) rudder -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) rudder += 1;

    const inputs: PlayerInputs = {
      throttle,
      rudder,
      depthLayerTarget: DEPTH_LAYER_ORDER[depthTargetIdx] as DepthLayer,
      silentRunning,
      ping: pingLatch,
      fireTorpedo: null, // one-shot via consumeFireRequest()
      decoy: decoyLatch,
      pause: false, // shell-owned (onPause callback flips the shell flag)
    };
    // Consume latches after read (engine edge detection sees one true tick).
    pingLatch = false;
    decoyLatch = false;
    return inputs;
  }

  function consumeFireRequest(): string | null {
    const req = fireRequest;
    fireRequest = null;
    return req;
  }

  function consumePeriscopeRequest(): boolean {
    const v = periscopeLatch;
    periscopeLatch = false;
    return v;
  }

  function consumeLockRequest(): boolean {
    const v = lockLatch;
    lockLatch = false;
    return v;
  }

  function consumeDiveRequest(): boolean {
    const v = diveLatch;
    diveLatch = false;
    return v;
  }

  function bind(target: KeyEventTarget): () => void {
    const handled = new Set(HANDLED_KEYS);
    const down = (e: unknown): void => {
      const code = (e as { code?: string; repeat?: boolean }).code;
      if (typeof code !== 'string' || !handled.has(code)) return;
      if ((e as { repeat?: boolean }).repeat) return; // ignore OS key-repeat
      (e as { preventDefault?: () => void }).preventDefault?.();
      handleKey(code, true);
    };
    const up = (e: unknown): void => {
      const code = (e as { code?: string }).code;
      if (typeof code !== 'string' || !handled.has(code)) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      handleKey(code, false);
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    bound = { target, down, up };
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      bound = null;
    };
  }

  function reset(): void {
    throttle = 0;
    depthTargetIdx = DEPTH_LAYER_ORDER.indexOf('Shallow');
    silentRunning = false;
    selectedContactId = null;
    pingLatch = false;
    decoyLatch = false;
    fireRequest = null;
    periscopeLatch = false;
    lockLatch = false;
    diveLatch = false;
    held.clear();
  }

  function dispose(): void {
    if (bound) {
      bound.target.removeEventListener('keydown', bound.down);
      bound.target.removeEventListener('keyup', bound.up);
      bound = null;
    }
  }

  return {
    getInputs,
    consumeFireRequest,
    consumePeriscopeRequest,
    consumeLockRequest,
    consumeDiveRequest,
    setSelectedContactId: (id: string | null) => {
      selectedContactId = id;
    },
    handleKey,
    bind,
    reset,
    dispose,
  };
}
