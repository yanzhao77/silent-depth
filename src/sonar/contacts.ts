/**
 * SILENT DEPTH — sonar contact store + state machine (src/sonar/contacts.ts)
 *
 * FR-05/FR-06, GAME_DESIGN §5.3–§5.4. Owns the Contact lifecycle:
 *
 *   - stable ids (C-01, C-02, …) and a per-ship link (trueShipId);
 *   - creation (emits contact.detected) and removal (contact.lost);
 *   - the contact state machine with the §5.4 promotion cascade and the
 *     balance-driven decay/degrade rules (§5.3: 90 s without observation →
 *     confidence −10 %/10 s; confidence < degradeConfidence → degrade one
 *     step; UNKNOWN removed after removeUnknownSeconds);
 *   - observation application (shared by ping.ts / passive.ts): confidence
 *     gain (+pingHitConfidenceGain / +passiveObsConfidenceGain), the
 *     classification vote + type lock (contact.classified), speed/heading
 *     estimate refresh with the uncertainty model, and the §5.3 error
 *     exemption for CONFIRMED contacts closer than errorExemptRangeKm.
 *
 * Also hosts the small geometry helpers (distKm / normalizeDeg /
 * compassBearing — 0° = north, matching the submarine module's heading
 * convention) and the per-ship sonar track bookkeeping. The runtime itself
 * (SonarRuntime / SonarShipTrack) is declared in src/sonar/sonar.ts; this
 * module imports it type-only (no runtime cycle).
 *
 * DESIGN DECISIONS:
 *   - Bearing convention: COMPASS (0° = north, clockwise) — consistent with
 *     the player submarine's moveSubmarine (src/gameplay/submarine.ts:
 *     heading 0 → +y). The AI module's internal bearings use the math
 *     convention (0° = east); the mismatch is cosmetic (positions are
 *     convention-free) and flagged for the manager to unify.
 *   - Classification lags the state: a contact enters SUSPECTED as
 *     'LargeSurface' and only gains a named type once the vote clears
 *     UNKNOWN_VOTE_THRESHOLD; the type locks at lockTypeConfidence.
 *   - Speed/heading estimates unlock at SUSPECTED (§5.3) with ±20 %,
 *     tightening to ±5 % at TRACKED; heading error scales as
 *     ±errorFrac×180° (see uncertainty.ts).
 *
 * Task: t-005 sonar (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; RNG injected; no module state.
 */

import type { BalanceConfig } from '../core/balance';
import type { SystemContext } from '../core/engine';
import type { Rng } from '../core/rng';
import type { Contact, ContactState, ContactType, EnemyShip } from '../core/types';
import {
  errorsExempt,
  headingErrorDeg,
  passiveBearingErrorDeg,
  pingBearingErrorDeg,
  pingRangeErrorFrac,
  rangeErrorFracFor,
  speedHeadingErrorFrac,
} from './uncertainty';
import { UNKNOWN_VOTE_THRESHOLD, voteClassification } from './classification';
import type { SignalStrength } from './classification';
import type { SonarRuntime, SonarShipTrack } from './sonar';

/** Decay step: confidence −decayPer10sPct every 10 s past the grace period. */
export const DECAY_STEP_S = 10;

// ---------------------------------------------------------------------------
// Geometry helpers (shared by ping/passive)
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export function distKm(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Wrap an angle to [0, 360). */
export function normalizeDeg(h: number): number {
  const m = h % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * Compass bearing from `a` to `b`: 0° = north, 90° = east, … (matches the
 * player submarine heading convention; see module header).
 */
export function compassBearing(a: Point, b: Point): number {
  return normalizeDeg((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI);
}

// ---------------------------------------------------------------------------
// Track bookkeeping
// ---------------------------------------------------------------------------

/** Get (or lazily create) the per-ship sonar track. */
export function getOrCreateTrack(rt: SonarRuntime, shipId: string): SonarShipTrack {
  let track = rt.tracks.get(shipId);
  if (track === undefined) {
    track = {
      contactId: null,
      pingCount: 0,
      passiveObsCount: 0,
      lastObservedAt: -1e9,
      lastPassiveObsAt: -1e9,
      passiveTrackStartAt: -1e9,
      lastDecayAt: -1e9,
      classifyConfidence: 0,
      typeLocked: false,
      lastNoise: 50,
    };
    rt.tracks.set(shipId, track);
  }
  return track;
}

export function contactForShip(rt: SonarRuntime, shipId: string): Contact | null {
  return rt.contactsByShip.get(shipId) ?? null;
}

// ---------------------------------------------------------------------------
// Creation / removal
// ---------------------------------------------------------------------------

function nextContactId(rt: SonarRuntime): string {
  const n = rt.nextContactId;
  rt.nextContactId += 1;
  return `C-${String(n).padStart(2, '0')}`;
}

function createContact(
  ctx: SystemContext,
  rt: SonarRuntime,
  ship: EnemyShip,
  init: {
    bearingDeg: number;
    signal: SignalStrength;
  },
): Contact {
  const balance = ctx.balance;
  const contact: Contact = {
    id: nextContactId(rt),
    state: 'UNKNOWN',
    bearingDeg: init.bearingDeg,
    rangeKm: null,
    bearingErrorDeg: balance.sonar.passive.bearingErrorDegStart,
    rangeErrorFrac: 0,
    speedEstimateKt: null,
    headingEstimateDeg: null,
    speedErrorFrac: balance.sonar.contact.convergeSpeedHeadingPctStart,
    classification: 'Unknown',
    classifyConfidence: 0,
    confidence: 0,
    signalStrength: init.signal,
    lastDetectedAt: ctx.simTime,
    lastPingAt: 0,
    lastBearingAt: ctx.simTime,
    observations: 0,
    trueShipId: ship.id,
  };
  ctx.contacts.push(contact);
  rt.contactsByShip.set(ship.id, contact);
  ctx.bus.emit('contact.detected', { contactId: contact.id, state: 'UNKNOWN' });
  return contact;
}

/** Remove a contact (UNKNOWN timeout / mission cleanup) — emits contact.lost. */
export function removeContact(
  ctx: SystemContext,
  rt: SonarRuntime,
  contact: Contact,
  reason: string,
): void {
  const idx = ctx.contacts.indexOf(contact);
  if (idx >= 0) ctx.contacts.splice(idx, 1);
  if (contact.trueShipId !== null) rt.contactsByShip.delete(contact.trueShipId);
  ctx.bus.emit('contact.lost', { contactId: contact.id });
  void reason;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

function promotionTarget(contact: Contact, track: SonarShipTrack): ContactState | null {
  switch (contact.state) {
    case 'UNKNOWN':
      if (track.pingCount >= 1 || contact.observations >= 2) return 'SUSPECTED';
      return null;
    case 'SUSPECTED':
      if (track.pingCount >= 1 || contact.confidence >= 50) return 'CLASSIFIED';
      return null;
    case 'CLASSIFIED':
      if (track.pingCount >= 3 && contact.confidence >= 70) return 'TRACKED';
      return null;
    case 'TRACKED':
      if (contact.confidence >= 90) return 'CONFIRMED';
      return null;
    default:
      return null;
  }
}

function transitionContact(ctx: SystemContext, contact: Contact, target: ContactState): void {
  contact.state = target;
  if (target === 'SUSPECTED') {
    contact.classification = 'LargeSurface';
    ctx.bus.emit('contact.classified', {
      contactId: contact.id,
      classification: contact.classification,
      confidence: contact.confidence,
    });
  } else if (target === 'CLASSIFIED' || target === 'TRACKED' || target === 'CONFIRMED') {
    ctx.bus.emit('contact.classified', {
      contactId: contact.id,
      classification: contact.classification,
      confidence: contact.confidence,
    });
  }
}

/** Run the §5.4 promotion cascade (may promote several states in one call). */
function evaluatePromotions(ctx: SystemContext, contact: Contact, track: SonarShipTrack): void {
  let target = promotionTarget(contact, track);
  let guard = 0;
  while (target !== null && target !== contact.state && guard < 8) {
    transitionContact(ctx, contact, target);
    target = promotionTarget(contact, track);
    guard += 1;
  }
}

/** Degrade one step (decay path). CONFIRMED never degrades (§5.4). */
function degrade(ctx: SystemContext, contact: Contact): void {
  if (contact.state === 'CONFIRMED' || contact.state === 'UNKNOWN') return;
  const next: ContactState =
    contact.state === 'TRACKED'
      ? 'CLASSIFIED'
      : contact.state === 'CLASSIFIED'
        ? 'SUSPECTED'
        : 'UNKNOWN';
  contact.state = next;
  if (next === 'UNKNOWN') {
    contact.classification = 'Unknown';
    contact.speedEstimateKt = null;
    contact.headingEstimateDeg = null;
  } else if (next === 'SUSPECTED') {
    contact.classification = 'LargeSurface';
  }
  ctx.bus.emit('contact.degraded', { contactId: contact.id });
}

// ---------------------------------------------------------------------------
// Observation application (shared by ping.ts / passive.ts)
// ---------------------------------------------------------------------------

export interface ObservationInput {
  ship: EnemyShip;
  /** Returned (jittered) bearing, compass 0° = north. */
  bearingDeg: number;
  /** Ping return range (km), or null for passive (never given). */
  rangeKm: number | null;
  signal: SignalStrength;
  /** Measured noise signature (0..100). */
  noise: number;
  isPing: boolean;
  rng: Rng;
}

/** Best available bearing error (ping ×0.7/ping vs passive 3°→1°). */
function bearingErrorFor(contact: Contact, track: SonarShipTrack, balance: BalanceConfig): number {
  const errors: number[] = [];
  if (track.pingCount > 0) errors.push(pingBearingErrorDeg(track.pingCount, balance));
  if (track.passiveObsCount > 0) {
    const elapsed = Math.max(0, contact.lastBearingAt - track.passiveTrackStartAt);
    errors.push(passiveBearingErrorDeg(elapsed, balance));
  }
  return errors.length > 0 ? Math.min(...errors) : balance.sonar.passive.bearingErrorDegStart;
}

/** Recompute state-dependent error fields + speed/heading estimates. */
function refreshContactData(
  ctx: SystemContext,
  contact: Contact,
  track: SonarShipTrack,
  ship: EnemyShip,
  balance: BalanceConfig,
): void {
  // Bearing error: best of ping / passive convergence.
  contact.bearingErrorDeg = bearingErrorFor(contact, track, balance);
  // Range error: only meaningful when a range exists.
  contact.rangeErrorFrac =
    contact.rangeKm === null
      ? 0
      : rangeErrorFracFor(contact.state, pingRangeErrorFrac(track.pingCount, balance));
  // Speed/heading error fraction by state + observations.
  contact.speedErrorFrac = speedHeadingErrorFrac(contact.state, contact.observations, balance);
  // Estimates unlock at SUSPECTED (§5.3).
  if (
    contact.state === 'SUSPECTED' ||
    contact.state === 'CLASSIFIED' ||
    contact.state === 'TRACKED' ||
    contact.state === 'CONFIRMED'
  ) {
    const spdErr = contact.speedErrorFrac;
    contact.speedEstimateKt = ship.speedKt * (1 + ctx.forks.sonar.range(-1, 1) * spdErr);
    const hdgErr = headingErrorDeg(spdErr);
    // REMEDIATION t-020: enemy headingDeg is stored in math convention
    // (0=east, CCW — ai/ship.ts moveShip: x+=cos, y+=sin), while contact
    // bearings and the player/torpedo use compass (0=north, CW). Convert to
    // compass here so fire control (F6 AOB) and HUD display are consistent:
    // compass = normalizeDeg(90 − math). Verified analytically: F6 lead with
    // compass heading matches the true intercept; old math-convention lead was
    // ~24° off at 2 km (QA t-013 finding; M02/M03 accuracy).
    contact.headingEstimateDeg = normalizeDeg(
      90 - ship.headingDeg + ctx.forks.sonar.range(-1, 1) * hdgErr,
    );
  }
  // §5.3 exemption: CONFIRMED + close → treated as exact.
  if (errorsExempt(contact.state, contact.rangeKm, balance)) {
    contact.bearingErrorDeg = 0;
    contact.rangeErrorFrac = 0;
    contact.speedErrorFrac = 0;
  }
}

/** Apply the classification vote: name the type / ratchet confidence / lock. */
function applyVote(
  ctx: SystemContext,
  contact: Contact,
  track: SonarShipTrack,
  noise: number,
  balance: BalanceConfig,
): void {
  const vote = voteClassification(
    { speedEstimateKt: contact.speedEstimateKt, noise, signal: contact.signalStrength },
    balance,
  );
  track.lastNoise = noise;
  const share = vote.confidence / 100;
  track.classifyConfidence = Math.max(track.classifyConfidence, vote.confidence);
  if (!track.typeLocked && share >= UNKNOWN_VOTE_THRESHOLD) {
    const named = vote.type as ContactType;
    if (named !== contact.classification) {
      contact.classification = named;
      ctx.bus.emit('contact.classified', {
        contactId: contact.id,
        classification: named,
        confidence: track.classifyConfidence,
      });
    }
  }
  if (track.classifyConfidence >= balance.sonar.classification.lockTypeConfidence) {
    if (!track.typeLocked) {
      track.typeLocked = true;
      ctx.bus.emit('contact.classified', {
        contactId: contact.id,
        classification: contact.classification,
        confidence: track.classifyConfidence,
      });
    }
  }
}

/**
 * Apply one observation (ping hit or passive reading) to the contact:
 * create-or-update, confidence gain, classification vote, promotions,
 * estimate/error refresh. Returns the contact.
 */
export function recordObservation(
  ctx: SystemContext,
  rt: SonarRuntime,
  track: SonarShipTrack,
  input: ObservationInput,
): Contact {
  const balance = ctx.balance;
  const ship = input.ship;

  let contact = rt.contactsByShip.get(ship.id);
  if (contact === undefined) {
    contact = createContact(ctx, rt, ship, { bearingDeg: input.bearingDeg, signal: input.signal });
    // First contact: passive tracking convergence starts now.
    track.passiveTrackStartAt = ctx.simTime;
  }

  // Sensor data.
  contact.bearingDeg = input.bearingDeg;
  contact.lastBearingAt = ctx.simTime;
  if (input.rangeKm !== null) contact.rangeKm = input.rangeKm;
  contact.signalStrength = input.signal;
  if (input.isPing) contact.lastPingAt = ctx.simTime;

  // Observation bookkeeping.
  contact.observations += 1;
  if (input.isPing) track.pingCount += 1;
  else track.passiveObsCount += 1;
  track.lastObservedAt = ctx.simTime;
  // Decay clock: next decay step may apply no earlier than
  // decaySecondsWithoutObs after this observation.
  track.lastDecayAt = ctx.simTime + balance.sonar.contact.decaySecondsWithoutObs;

  // Confidence gain (§5.5): +25 ping / +15 passive.
  const gain = input.isPing
    ? balance.sonar.classification.pingHitConfidenceGain
    : balance.sonar.classification.passiveObsConfidenceGain;
  contact.confidence = Math.min(100, contact.confidence + gain);

  // Classification vote (uses speed estimate if already unlocked).
  applyVote(ctx, contact, track, input.noise, balance);

  // §5.4 promotions (cascade), then state-dependent data.
  evaluatePromotions(ctx, contact, track);
  refreshContactData(ctx, contact, track, ship, balance);

  return contact;
}

// ---------------------------------------------------------------------------
// Decay / degradation / removal
// ---------------------------------------------------------------------------

/**
 * Time-based contact decay (§5.3): confidence drops decayPer10sPct every
 * DECAY_STEP_S once the grace period (decaySecondsWithoutObs) after the last
 * observation has elapsed; below degradeConfidence the contact degrades one
 * state; UNKNOWN contacts are removed after removeUnknownSeconds.
 */
export function applyDecay(ctx: SystemContext, rt: SonarRuntime): void {
  const balance = ctx.balance;
  const c = balance.sonar.contact;
  for (const [shipId, track] of rt.tracks) {
    const contact = rt.contactsByShip.get(shipId);
    if (contact === undefined) continue;
    // lastDecayAt already encodes the grace end (set on each observation).
    while (track.lastDecayAt + DECAY_STEP_S <= ctx.simTime) {
      track.lastDecayAt += DECAY_STEP_S;
      contact.confidence = Math.max(0, contact.confidence - c.decayPer10sPct);
      if (contact.confidence < c.degradeConfidence) degrade(ctx, contact);
    }
    const sinceObs = ctx.simTime - track.lastObservedAt;
    if (contact.state === 'UNKNOWN' && sinceObs > c.removeUnknownSeconds) {
      removeContact(ctx, rt, contact, 'unknown contact timed out');
    }
  }
}
