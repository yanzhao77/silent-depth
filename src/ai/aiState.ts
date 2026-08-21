/**
 * SILENT DEPTH — enemy AI state machine (src/ai/aiState.ts)
 *
 * FR-10, GAME_DESIGN §6.1. Pure transition logic — no side effects, no RNG,
 * no timers. The ship-behavior layer (src/ai/ai.ts) owns the timers and calls
 * `evaluateAiState` once per ship per tick.
 *
 *   NORMAL ──(noise/ping)──▶ SUSPICIOUS ──(detection≥40 | 2 pings)──▶ ALERT
 *     ▲                       │   │                                      │
 *     │                       │   └─(60s no contact)                     │(torpedo≤3km | explosion)
 *     │                       │                                          ▼
 *   LOST_CONTACT ◀──(120s no contact)────────────────────────────── SEARCHING
 *     ▲                                                              │   │
 *     │                                                              │   └─(detection≥60 | ping<1.5km)
 *     │                                                              ▼
 *     └──(60s at post)── LOST_CONTACT ◀──(detection<40 for 30s)── HUNTING
 *
 * Trigger semantics (GAME_DESIGN §6.1 table + §7.2 note):
 *   - NORMAL → SUSPICIOUS : player passive noise detected (F3 > 0) OR player
 *     active ping heard (escorts ≤ 8 km).
 *   - NORMAL|SUSPICIOUS → ALERT : torpedo heard (≤ 10 km, §7.2 "提前预警 ALERT
 *     触发") — DESIGN DECISION: the §6.1 table only lists ALERT→SEARCHING for
 *     torpedoes, but §7.2 explicitly grants torpedo-noise an ALERT escalation;
 *     we honour §7.2 (escorts only).
 *   - SUSPICIOUS → ALERT : detection ≥ 40 OR 2 consecutive own-ping hits that
 *     returned range.
 *   - SUSPICIOUS → LOST_CONTACT : 60 s without any contact.
 *   - ALERT → SEARCHING : torpedo within 3 km ("seen") OR explosion heard.
 *   - SEARCHING → HUNTING : detection ≥ 60 OR own ping confirms < 1.5 km.
 *     Blocked forever once the escort runs out of depth charges (§6.1:
 *     "用完转 SEARCHING 无限期" — the player's escape window).
 *   - SEARCHING → LOST_CONTACT : 120 s without any contact.
 *   - HUNTING → SEARCHING : detection < 40 for 30 s (LKP kept / updated) OR
 *     depth-charge ammo exhausted.
 *   - LOST_CONTACT → NORMAL : 60 s at the escort post.
 *   - LOST_CONTACT re-contact en route ("途中再接触 → 相应状态") : noise/ping →
 *     SUSPICIOUS; detection ≥ 40 → ALERT.
 *
 * Thresholds that have no balance.json entry (they are GAME_DESIGN §6.1
 * numbers) are exported as documented design constants. Detection-band
 * thresholds (40 / 60) are derived from balance.detection.bands so the meter
 * bands stay the single source of truth.
 *
 * Task: t-006 enemy ai (ai-engineer).
 *
 * @pure — zero DOM / browser-API references; no RNG; no module state.
 */

import type { AiState } from '../core/types'
import type { BalanceConfig } from '../core/balance'

/** The six AI states in canonical order (GAME_DESIGN §6.1). */
export const AI_STATES: readonly AiState[] = [
  'NORMAL',
  'SUSPICIOUS',
  'ALERT',
  'SEARCHING',
  'HUNTING',
  'LOST_CONTACT',
]

// ---------------------------------------------------------------------------
// Design constants (GAME_DESIGN §6.1 — no balance.json counterpart)
// ---------------------------------------------------------------------------

/** SUSPICIOUS: seconds without contact before LOST_CONTACT (§6.1 row). */
export const SUSPICIOUS_TIMEOUT_S = 60
/** SEARCHING: seconds without contact before LOST_CONTACT (§6.1 row). */
export const SEARCHING_TIMEOUT_S = 120
/** HUNTING: detection must stay < 40 for this long before degrading (§6.1). */
export const HUNTING_DEGRADE_BELOW = 40
export const HUNTING_DEGRADE_S = 30
/** LOST_CONTACT: seconds at the escort post before NORMAL (§6.1 row). */
export const LOST_AT_POST_S = 60
/** ALERT → SEARCHING: torpedo within this range is "seen" (§6.1 row). */
export const TORPEDO_NEAR_KM = 3
/** SEARCHING → HUNTING: own-ping confirm closer than this (§6.1 row). */
export const PING_CONFIRM_KM = 1.5
/** Torpedo self-noise hearing range for the §7.2 early-warning escalation. */
export const TORPEDO_HEARD_KM = 10
/** Consecutive own-ping hits with range that escalate SUSPICIOUS → ALERT. */
export const PING_HITS_TO_ALERT = 2

/** All thresholds consumed by `evaluateAiState` (injectable for tests). */
export interface AiThresholds {
  /** detection >= this → ALERT (default: balance.detection.bands[1].max = 40). */
  alertDetection: number
  /** detection >= this → HUNTING (default: balance.detection.bands[2].max = 60). */
  huntingDetection: number
  suspiciousTimeoutS: number
  searchingTimeoutS: number
  /** detection < this for huntingDegradeS → SEARCHING (default 40). */
  huntingDegradeBelow: number
  huntingDegradeS: number
  lostAtPostS: number
  torpedoNearKm: number
  torpedoHeardKm: number
  pingConfirmKm: number
  pingHitsToAlert: number
}

/** Balance-driven thresholds: 40/60 come from the detection bands (B9/§8.1). */
export function defaultAiThresholds(balance: BalanceConfig): AiThresholds {
  return {
    alertDetection: balance.detection.bands[1]?.max ?? 40,
    huntingDetection: balance.detection.bands[2]?.max ?? 60,
    suspiciousTimeoutS: SUSPICIOUS_TIMEOUT_S,
    searchingTimeoutS: SEARCHING_TIMEOUT_S,
    huntingDegradeBelow: HUNTING_DEGRADE_BELOW,
    huntingDegradeS: HUNTING_DEGRADE_S,
    lostAtPostS: LOST_AT_POST_S,
    torpedoNearKm: TORPEDO_NEAR_KM,
    torpedoHeardKm: TORPEDO_HEARD_KM,
    pingConfirmKm: PING_CONFIRM_KM,
    pingHitsToAlert: PING_HITS_TO_ALERT,
  }
}

/** Per-tick perception snapshot handed to the state machine. */
export interface AiTriggers {
  /** Player passive noise detected this tick (F3 rate > 0). */
  noiseSensed: boolean
  /** Player active ping heard this tick (escort within 8 km). */
  pingHeard: boolean
  /** Player detection meter value (0..100) — the shared meter (§8.1). */
  detection: number
  /** Own active-ping hits with range while in SUSPICIOUS (consecutive). */
  consecutivePingHits: number
  /** Range of the last own-ping hit (km), or null when none yet. */
  lastPingHitRangeKm: number | null
  /** Nearest RUNNING torpedo (km), or null when none in range of interest. */
  torpedoNearKm: number | null
  /** Explosion (torpedo hit / depth-charge detonation / sinking) heard. */
  explosionHeard: boolean
  /** Escort has no depth charges left — can never HUNT again (§6.1). */
  huntingDisabled: boolean
  /** True while the escort is within patrol radius of its post. */
  atPost: boolean
}

/** State-residence accumulators (seconds) maintained by the behavior layer. */
export interface AiStateTimers {
  /** SUSPICIOUS: seconds elapsed without any contact signal. */
  suspiciousNoContactS: number
  /** SEARCHING: seconds elapsed without any contact signal. */
  searchingNoContactS: number
  /** HUNTING: seconds elapsed with detection below huntingDegradeBelow. */
  huntingBelow40S: number
  /** LOST_CONTACT: seconds elapsed at the escort post. */
  lostContactAtPostS: number
}

export interface AiTransitionResult {
  next: AiState
  /** Human-readable reason — used in tests and debug tooling. */
  reason: string
}

const NEVER: AiStateTimers = Object.freeze({
  suspiciousNoContactS: 0,
  searchingNoContactS: 0,
  huntingBelow40S: 0,
  lostContactAtPostS: 0,
})

/**
 * Evaluate the enemy AI state machine for one ship (pure).
 *
 * The ship-behavior layer feeds the perception triggers and the timer
 * accumulators; this function returns the next state plus a reason string.
 * Illegal or unlisted conditions leave the state unchanged.
 */
export function evaluateAiState(
  current: AiState,
  t: AiTriggers,
  timers: AiStateTimers,
  th: AiThresholds,
): AiTransitionResult {
  switch (current) {
    case 'NORMAL': {
      if (t.pingHeard) return { next: 'SUSPICIOUS', reason: 'player ping heard' }
      if (t.noiseSensed) return { next: 'SUSPICIOUS', reason: 'player noise detected' }
      if (t.torpedoNearKm !== null && t.torpedoNearKm <= th.torpedoHeardKm) {
        return { next: 'ALERT', reason: `torpedo heard at ${t.torpedoNearKm.toFixed(2)}km (${'§7.2 early warning'})` }
      }
      return { next: 'NORMAL', reason: 'no contact' }
    }
    case 'SUSPICIOUS': {
      if (t.detection >= th.alertDetection) {
        return { next: 'ALERT', reason: `detection ${t.detection.toFixed(1)} >= ${th.alertDetection}` }
      }
      if (t.consecutivePingHits >= th.pingHitsToAlert) {
        return { next: 'ALERT', reason: `${th.pingHitsToAlert} consecutive pings with range` }
      }
      if (t.torpedoNearKm !== null && t.torpedoNearKm <= th.torpedoHeardKm) {
        return { next: 'ALERT', reason: `torpedo heard at ${t.torpedoNearKm.toFixed(2)}km (${'§7.2 early warning'})` }
      }
      if (timers.suspiciousNoContactS >= th.suspiciousTimeoutS) {
        return { next: 'LOST_CONTACT', reason: `${th.suspiciousTimeoutS}s without contact` }
      }
      return { next: 'SUSPICIOUS', reason: 'investigating' }
    }
    case 'ALERT': {
      if (t.torpedoNearKm !== null && t.torpedoNearKm <= th.torpedoNearKm) {
        return { next: 'SEARCHING', reason: `torpedo within ${th.torpedoNearKm}km` }
      }
      if (t.explosionHeard) return { next: 'SEARCHING', reason: 'explosion heard' }
      return { next: 'ALERT', reason: 'closing on LKP' }
    }
    case 'SEARCHING': {
      if (!t.huntingDisabled && t.detection >= th.huntingDetection) {
        return { next: 'HUNTING', reason: `detection ${t.detection.toFixed(1)} >= ${th.huntingDetection}` }
      }
      if (
        !t.huntingDisabled &&
        t.lastPingHitRangeKm !== null &&
        t.lastPingHitRangeKm < th.pingConfirmKm
      ) {
        return { next: 'HUNTING', reason: `ping confirm ${t.lastPingHitRangeKm.toFixed(2)}km < ${th.pingConfirmKm}` }
      }
      if (timers.searchingNoContactS >= th.searchingTimeoutS) {
        return { next: 'LOST_CONTACT', reason: `${th.searchingTimeoutS}s without contact` }
      }
      return { next: 'SEARCHING', reason: 'searching' }
    }
    case 'HUNTING': {
      if (t.huntingDisabled) {
        return { next: 'SEARCHING', reason: 'depth charges exhausted — hunting disabled forever' }
      }
      if (t.detection < th.huntingDegradeBelow && timers.huntingBelow40S >= th.huntingDegradeS) {
        return { next: 'SEARCHING', reason: `detection < ${th.huntingDegradeBelow} for ${th.huntingDegradeS}s` }
      }
      return { next: 'HUNTING', reason: 'hunting' }
    }
    case 'LOST_CONTACT': {
      if (t.detection >= th.alertDetection) {
        return { next: 'ALERT', reason: `re-contact with detection ${t.detection.toFixed(1)}` }
      }
      if (t.pingHeard || t.noiseSensed) return { next: 'SUSPICIOUS', reason: 're-contact en route' }
      if (t.atPost && timers.lostContactAtPostS >= th.lostAtPostS) {
        return { next: 'NORMAL', reason: `${th.lostAtPostS}s at escort post` }
      }
      return { next: 'LOST_CONTACT', reason: 'returning to post' }
    }
  }
}

/** Zero timers helper (state-entry reset). */
export function zeroAiTimers(): AiStateTimers {
  return { suspiciousNoContactS: 0, searchingNoContactS: 0, huntingBelow40S: 0, lostContactAtPostS: 0 }
}

/**
 * Frozen zero-timer baseline (avoids per-call allocation where immutability
 * is acceptable; timers are copied before mutation by callers).
 */
export function defaultAiTimers(): AiStateTimers {
  return { ...NEVER }
}
