/**
 * SILENT DEPTH — periscope system (src/periscope/periscope.ts)
 *
 * t-024 engine wave. Risk-for-reward optical observation:
 *
 *   sonar (low risk / low precision) → PERISCOPE (high risk / high precision)
 *
 * State machine (tick-driven, deterministic — no timers, no RNG):
 *
 *   SUBMERGED ──periscope edge @ Periscope layer──▶ RAISING ──progress≥1──▶ RAISED
 *        ▲                                            │                      │
 *        │ cancel (edge)                              │ depth guard          │ target in FOV+range
 *        │                                            ▼                      ▼
 *      SURFACING ◀── auto-rise from deeper layer   LOWERING ◀──(edge / depth-leave / emergency)── OBSERVING
 *
 *   RAISED ⇄ OBSERVING (target in the view cone). LOWERING → SUBMERGED.
 *
 * Visual observation upgrades a contact to GROUND TRUTH (type / speed /
 * heading / range, confidence 98) and marks it `visuallyConfirmed` — the fire
 * solution then becomes 'VISUAL CONFIRMED' (confidence penalty removed).
 * The risk: exposure accrues while raised (raisedDurationS → exposure bands
 * LOW/MEDIUM/HIGH/CRITICAL) and raises `player.detection` per band; firing a
 * torpedo while raised adds balance.periscope.torpedoFiredWhileRaisedBonus.
 *
 * DESIGN DECISIONS:
 *  - The visual upgrade applies DETERMINISTIC ground truth (no RNG jitter):
 *    the periscope reports exact range/bearing/course; observeRangeErrKm /
 *    observeBearingErrDeg are the reported residual tolerances. This keeps the
 *    system RNG-neutral at pipeline position 6 (the RNG consumption order of
 *    ai/combat — and therefore the scripted playtest outcomes — is untouched).
 *  - autoSurface (balance): raise from a deeper layer (Shallow/Medium/Deep)
 *    auto-rises to the Periscope layer (SURFACING); from the Surface layer the
 *    raise is rejected with 'wrongLayer'. With autoSurface=false any
 *    non-Periscope raise is rejected (periscope.cannotRaise).
 *  - Exposure starts at RAISED (raisedDurationS counts RAISED/OBSERVING only,
 *    per spec); band transitions emit periscope.exposure.
 *  - A periscope edge while RAISED/OBSERVING lowers; while RAISING or
 *    LOWERING it is rejected with cannotRaise 'alreadyActive'; while SURFACING
 *    it cancels the auto-rise.
 *  - Emergency dive: diveEdge lowers immediately at the boosted rate
 *    (emergencyLowerTimeS) and cancels SURFACING.
 *  - The lock survives contact out-of-FOV but is released when the locked
 *    contact is removed from the contact list or its ship sinks (and when the
 *    periscope finishes lowering).
 *  - Public state lives in ctx.periscope (engine-owned); the runtime keeps
 *    only per-game bookkeeping (event dedup, exposure band) in a WeakMap keyed
 *    on the live ctx.player reference (src/ai/ai.ts pattern).
 *
 * Task: t-024 periscope engine (gameplay-engineer).
 *
 * @pure — zero DOM; deterministic (no RNG).
 */

import type { BalanceConfig, PeriscopeConfig } from '../core/balance';
import type { SystemContext, SystemFn } from '../core/engine';
import type {
  Contact,
  DepthLayer,
  EnemyShip,
  ExposureBand,
  PeriscopePublicState,
  WeatherKind,
} from '../core/types';
import { DEPTH_LAYER_ORDER } from '../gameplay/submarine';
import { compassBearing, distKm, normalizeDeg } from '../sonar/contacts';
import { weatherModifiers } from '../world/weather';

/** Exposure band order (index aligns with balance.periscope.exposureDetectPerSec). */
export const EXPOSURE_BANDS: readonly ExposureBand[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// ---------------------------------------------------------------------------
// Runtime (per-game bookkeeping; public state lives in ctx.periscope)
// ---------------------------------------------------------------------------

export interface PeriscopeRuntime {
  /** Contacts that already emitted periscope.visualContact (once per target). */
  visualContactEmitted: Set<string>;
  /** Contacts that already emitted periscope.classified (once per target). */
  classifiedEmitted: Set<string>;
  /** Last emitted exposure band (edge detection for periscope.exposure). */
  prevExposureBand: ExposureBand;
  /** Lowering at the boosted emergency rate (diveEdge-triggered). */
  emergencyLower: boolean;
}

const periscopeRuntimes = new WeakMap<object, PeriscopeRuntime>();

/** Test/manager hook into the per-game periscope runtime. */
export function getPeriscopeRuntime(ctx: SystemContext): PeriscopeRuntime {
  let rt = periscopeRuntimes.get(ctx.player);
  if (rt === undefined) {
    rt = {
      visualContactEmitted: new Set(),
      classifiedEmitted: new Set(),
      prevExposureBand: 'NONE',
      emergencyLower: false,
    };
    periscopeRuntimes.set(ctx.player, rt);
  }
  return rt;
}

/** Fresh public periscope state (engine createGame + defensive init). */
export function createInitialPeriscopeState(): PeriscopePublicState {
  return {
    state: 'SUBMERGED',
    progress: 0,
    raisedDurationS: 0,
    exposure: 0,
    exposureBand: 'NONE',
    canRaise: false,
    cannotRaiseReason: 'none',
    observingContactId: null,
    lockedContactId: null,
    viewBearingDeg: 0,
  };
}

// ---------------------------------------------------------------------------
// The system (pipeline slot 6 — after sonar, before ai)
// ---------------------------------------------------------------------------

export const periscopeSystem: SystemFn = (ctx: SystemContext): void => {
  if (ctx.state !== 'MISSION_RUNNING') return;
  const rt = getPeriscopeRuntime(ctx);
  const p = ensurePublicState(ctx);
  tick(ctx, rt, p);
};

function ensurePublicState(ctx: SystemContext): PeriscopePublicState {
  if (ctx.periscope === undefined) {
    // Hand-built test contexts may omit it; the engine always provides it.
    ctx.periscope = createInitialPeriscopeState();
  }
  return ctx.periscope;
}

function tick(ctx: SystemContext, rt: PeriscopeRuntime, p: PeriscopePublicState): void {
  const balance = ctx.balance;
  const cfg = balance.periscope;
  const player = ctx.player;
  const depthOk = player.depthLayer === cfg.requiredLayer;

  updateCanRaise(p, player, depthOk, cfg.requiredLayer);

  switch (p.state) {
    case 'SUBMERGED': {
      if (!ctx.periscopeEdge) break;
      if (depthOk) {
        startRaising(ctx, p);
      } else if (cfg.autoSurface && isDeeperThan(player.depthLayer, cfg.requiredLayer)) {
        // Auto-rise: the submarine system (slot 4) rises toward the required
        // layer (it holds the depth while periscope.state === 'SURFACING').
        p.state = 'SURFACING';
        p.progress = 0;
        player.targetDepthLayer = cfg.requiredLayer;
      } else {
        const reason = isDeeperThan(player.depthLayer, cfg.requiredLayer)
          ? 'tooDeep'
          : 'wrongLayer';
        ctx.bus.emit('periscope.cannotRaise', { reason });
      }
      break;
    }
    case 'SURFACING': {
      if (ctx.diveEdge || ctx.periscopeEdge) {
        // Cancel the auto-rise (emergency dive or player cancel) — freeze depth.
        p.state = 'SUBMERGED';
        p.progress = 0;
        player.targetDepthLayer = player.depthLayer;
        break;
      }
      if (depthOk) startRaising(ctx, p);
      break;
    }
    case 'RAISING': {
      if (!depthOk) {
        enterLowering(ctx, rt, p, false); // depth guard — can't raise while diving away
        break;
      }
      if (ctx.diveEdge) {
        enterLowering(ctx, rt, p, true);
        break;
      }
      if (ctx.periscopeEdge) {
        ctx.bus.emit('periscope.cannotRaise', { reason: 'alreadyActive' });
        break;
      }
      p.progress += ctx.dt / cfg.raiseTimeS;
      // Epsilon guards binary float drift at the completion boundary
      // (e.g. Σ 0.1 × 10 can land on 0.9999999999999999).
      if (p.progress >= 1 - 1e-9) {
        p.state = 'RAISED';
        p.progress = 1;
        p.raisedDurationS = 0;
        p.viewBearingDeg = player.headingDeg;
        ctx.bus.emit('periscope.ready', {});
        ctx.bus.emit('periscope.raised', {});
      }
      break;
    }
    case 'RAISED':
    case 'OBSERVING': {
      // --- exposure accrues while raised (RAISED/OBSERVING only) ---
      p.raisedDurationS += ctx.dt;
      p.viewBearingDeg = player.headingDeg;
      const maxBandS = cfg.exposureBandsS[cfg.exposureBandsS.length - 1]!;
      p.exposure = Math.min(100, (p.raisedDurationS / maxBandS) * 100);
      const band = exposureBandFor(p.raisedDurationS, cfg);
      if (band !== rt.prevExposureBand) {
        rt.prevExposureBand = band;
        p.exposureBand = band;
        ctx.bus.emit('periscope.exposure', { band });
      }
      const rateIdx = EXPOSURE_BANDS.indexOf(band);
      if (rateIdx >= 0 && rateIdx < cfg.exposureDetectPerSec.length) {
        player.detection = clamp(
          player.detection + cfg.exposureDetectPerSec[rateIdx]! * ctx.dt,
          0,
          100,
        );
      }

      // --- target acquisition / loss ---
      const target = findVisualTarget(ctx, p);
      if (p.state === 'RAISED') {
        if (target !== null) {
          p.state = 'OBSERVING';
          p.observingContactId = target.contact.id;
          applyVisualUpgrade(ctx, target);
          emitVisualEvents(ctx, rt, target.contact);
        }
      } else {
        // OBSERVING
        if (target === null || target.contact.id !== p.observingContactId) {
          p.state = 'RAISED';
          p.observingContactId = null;
          unlockIfLost(ctx, p);
        } else {
          applyVisualUpgrade(ctx, target); // keep the ground truth live each tick
        }
      }

      // --- lock (edge) ---
      if (
        ctx.lockEdge &&
        p.observingContactId !== null &&
        p.lockedContactId !== p.observingContactId
      ) {
        const observed = ctx.contacts.find((c) => c.id === p.observingContactId);
        const rangeKm =
          observed !== undefined
            ? distKm(
                player.position,
                ctx.enemies.find((e) => e.id === observed.trueShipId)?.position ?? player.position,
              )
            : Infinity;
        if (rangeKm <= cfg.lockMaxRangeKm) {
          p.lockedContactId = p.observingContactId;
          ctx.bus.emit('periscope.locked', { contactId: p.observingContactId });
        }
      }
      unlockIfLost(ctx, p);

      // --- lower triggers ---
      if (ctx.periscopeEdge || !depthOk) {
        enterLowering(ctx, rt, p, false);
        break;
      }
      if (ctx.diveEdge) enterLowering(ctx, rt, p, true);
      break;
    }
    case 'LOWERING': {
      const lowerTime = rt.emergencyLower ? cfg.emergencyLowerTimeS : cfg.lowerTimeS;
      p.progress += ctx.dt / lowerTime;
      if (p.progress >= 1 - 1e-9) {
        p.state = 'SUBMERGED';
        p.progress = 0;
        p.raisedDurationS = 0;
        p.exposure = 0;
        p.exposureBand = 'NONE';
        rt.prevExposureBand = 'NONE';
        rt.emergencyLower = false;
        p.observingContactId = null;
        if (p.lockedContactId !== null) {
          ctx.bus.emit('periscope.unlocked', { contactId: p.lockedContactId });
          p.lockedContactId = null;
        }
        ctx.bus.emit('periscope.lowered', {});
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startRaising(ctx: SystemContext, p: PeriscopePublicState): void {
  p.state = 'RAISING';
  p.progress = 0;
  ctx.bus.emit('periscope.raising', {});
}

function enterLowering(
  ctx: SystemContext,
  rt: PeriscopeRuntime,
  p: PeriscopePublicState,
  emergency: boolean,
): void {
  if (p.state === 'LOWERING') return;
  p.state = 'LOWERING';
  p.progress = 0;
  rt.emergencyLower = emergency;
}

/** canRaise / cannotRaiseReason public view (computed every tick). */
function updateCanRaise(
  p: PeriscopePublicState,
  player: SystemContext['player'],
  depthOk: boolean,
  requiredLayer: SystemContext['player']['depthLayer'],
): void {
  if (p.state === 'SUBMERGED') {
    if (depthOk) {
      p.canRaise = true;
      p.cannotRaiseReason = 'none';
    } else {
      p.canRaise = false;
      p.cannotRaiseReason = isDeeperThan(player.depthLayer, requiredLayer)
        ? 'tooDeep'
        : 'wrongLayer';
    }
  } else {
    p.canRaise = false;
    p.cannotRaiseReason = 'alreadyActive';
  }
}

function isDeeperThan(layer: DepthLayer, required: DepthLayer): boolean {
  return DEPTH_LAYER_ORDER.indexOf(layer) > DEPTH_LAYER_ORDER.indexOf(required);
}

/** Exposure band from raised duration (balance.periscope.exposureBandsS). */
export function exposureBandFor(durationS: number, cfg: PeriscopeConfig): ExposureBand {
  const bands = cfg.exposureBandsS;
  if (durationS <= bands[0]!) return 'LOW';
  if (durationS <= bands[1]!) return 'MEDIUM';
  if (durationS <= bands[2]!) return 'HIGH';
  return 'CRITICAL';
}

/** Active weather kind (world state first, mission fallback — ai.ts pattern). */
function activeWeatherKind(ctx: SystemContext): WeatherKind {
  const ws = ctx.worldState as { currentWeather?: WeatherKind } | undefined;
  if (ws?.currentWeather !== undefined) return ws.currentWeather;
  const kind = ctx.mission.weather;
  return kind in ctx.balance.weather ? (kind as WeatherKind) : 'Clear';
}

/** Optical range cap: min(periscope.maxVisualRangeKm, weather visibility). */
export function visualRangeKm(ctx: SystemContext, balance: BalanceConfig = ctx.balance): number {
  const visibilityKm = weatherModifiers(activeWeatherKind(ctx), balance).visibilityKm;
  return Math.min(balance.periscope.maxVisualRangeKm, visibilityKm);
}

interface VisualTarget {
  contact: Contact;
  ship: EnemyShip;
  rangeKm: number;
}

/** Best (nearest) surface ship contact inside the FOV and visual range. */
function findVisualTarget(ctx: SystemContext, p: PeriscopePublicState): VisualTarget | null {
  const balance = ctx.balance;
  const maxRange = visualRangeKm(ctx, balance);
  const halfFov = balance.periscope.fovDeg / 2;
  let best: VisualTarget | null = null;
  for (const contact of ctx.contacts) {
    if (contact.trueShipId === null) continue;
    const ship = ctx.enemies.find((e) => e.id === contact.trueShipId);
    if (ship === undefined || ship.hull <= 0) continue;
    const rangeKm = distKm(ctx.player.position, ship.position);
    if (rangeKm > maxRange) continue;
    const bearing = compassBearing(ctx.player.position, ship.position);
    if (Math.abs(angleDelta(bearing, p.viewBearingDeg)) > halfFov) continue;
    if (best === null || rangeKm < best.rangeKm) best = { contact, ship, rangeKm };
  }
  return best;
}

/** Apply the ground-truth visual upgrade to an observed contact (§4 spec). */
function applyVisualUpgrade(ctx: SystemContext, target: VisualTarget): void {
  const cfg = ctx.balance.periscope;
  const c = target.contact;
  const ship = target.ship;
  c.state = 'CONFIRMED';
  c.classification = ship.shipClass;
  c.classifyConfidence = cfg.observeConfidence;
  c.confidence = cfg.observeConfidence;
  c.rangeKm = target.rangeKm; // exact optical range
  c.rangeErrorFrac = 0;
  c.bearingErrorDeg = cfg.observeBearingErrDeg; // residual tolerance
  c.bearingDeg = compassBearing(ctx.player.position, ship.position); // true bearing
  c.speedEstimateKt = ship.speedKt;
  // Math→compass heading conversion (matches src/sonar/contacts.ts t-020).
  c.headingEstimateDeg = normalizeDeg(90 - ship.headingDeg);
  c.speedErrorFrac = 0;
  c.signalStrength = 'Strong';
  c.lastDetectedAt = ctx.simTime;
  c.observations += 1;
  c.visuallyConfirmed = true;
}

/** Emit the once-per-target visual events. */
function emitVisualEvents(ctx: SystemContext, rt: PeriscopeRuntime, contact: Contact): void {
  if (!rt.visualContactEmitted.has(contact.id)) {
    rt.visualContactEmitted.add(contact.id);
    ctx.bus.emit('periscope.visualContact', {
      contactId: contact.id,
      classification: contact.classification,
    });
  }
  if (!rt.classifiedEmitted.has(contact.id)) {
    rt.classifiedEmitted.add(contact.id);
    ctx.bus.emit('periscope.classified', {
      contactId: contact.id,
      classification: contact.classification,
    });
  }
}

/** Release the lock when the locked contact is gone (removed or sunk). */
function unlockIfLost(ctx: SystemContext, p: PeriscopePublicState): void {
  if (p.lockedContactId === null) return;
  const contact = ctx.contacts.find((c) => c.id === p.lockedContactId);
  const alive =
    contact !== undefined &&
    contact.trueShipId !== null &&
    ctx.enemies.some((e) => e.id === contact.trueShipId && e.hull > 0);
  if (!alive) {
    ctx.bus.emit('periscope.unlocked', { contactId: p.lockedContactId });
    p.lockedContactId = null;
  }
}

/** Smallest signed angle (degrees) between two headings, in (−180, 180]. */
function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
