/**
 * SILENT DEPTH — weather system (src/world/weather.ts)
 *
 * FR-17 / GAME_DESIGN §9.1: five weather kinds with balance-driven modifiers.
 * weatherModifiers(weather) reads balance.weather (typed, frozen) — the single
 * source of truth (ADR-002); no hardcoded numbers anywhere.
 *
 * DESIGN DECISIONS:
 *  - balance.weather[].surfaceNoiseBonus is optional; the normalized
 *    WeatherModifiers always carries a number (0 when the kind has no bonus —
 *    e.g. Storm carries +10). Downstream systems therefore never handle
 *    `undefined` for a balance lookup.
 *  - parseWeatherSequence accepts both a plain kind ('Storm') and a chained
 *    mission spec ('Clear->Cloudy', GAME_DESIGN §9.1 M02..M05). Tokens are
 *    validated against the balance.weather keys, so the helper can never
 *    drift from the config. Unknown kinds throw TypeError (programming error,
 *    mirroring engine.validateMissionDef).
 *  - transitionAtFraction semantics: the mission duration is split into n
 *    equal segments; segment i begins at fraction i/n of mission time
 *    (i = 0 → 0, i = n − 1 → (n − 1)/n < 1). 'Clear->Cloudy' therefore hands
 *    over at the midpoint; 'Clear->Cloudy->Fog' at 1/3 and 2/3. Fractions are
 *    relative to MissionDef.parTimeS — the deterministic mission-length scale.
 *  - No RNG, no state: both helpers are pure functions.
 *
 * Task: t-009 world system (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { WeatherKind } from '../core/types'
import { loadBalance, type BalanceConfig } from '../core/balance'

// ---------------------------------------------------------------------------
// WeatherModifiers — normalized view of balance.weather[weather]
// ---------------------------------------------------------------------------

export interface WeatherModifiers {
  /** Surface visual range in km (waterline/visual/deck gun, GAME_DESIGN §9.1). */
  visibilityKm: number
  /** Sonar correction factor — enemy detection of player AND player ping hit chance. */
  sonarFactor: number
  /** Ambient noise multiplier on the player submarine. */
  noiseFactor: number
  /** Extra player noise at the Surface layer (Storm), normalized to 0 elsewhere. */
  surfaceNoiseBonus: number
}

/**
 * Balance-driven weather modifiers for one weather kind (FR-17). Pure.
 * Throws TypeError for a kind the config does not define (programming error).
 */
export function weatherModifiers(weather: WeatherKind, balance: BalanceConfig = loadBalance()): WeatherModifiers {
  const cfg = balance.weather[weather]
  if (cfg === undefined) {
    throw new TypeError(`weatherModifiers: unknown weather kind "${String(weather)}" (not in balance.weather)`)
  }
  return {
    visibilityKm: cfg.visibilityKm,
    sonarFactor: cfg.sonarFactor,
    noiseFactor: cfg.noiseFactor,
    // Normalize the optional bonus: kinds without one get 0 (see header).
    surfaceNoiseBonus: cfg.surfaceNoiseBonus ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Weather sequences ('Clear->Cloudy') — FR-17 mission weather chains
// ---------------------------------------------------------------------------

/** One weather segment: [kind, transitionAtFraction] (see header semantics). */
export type WeatherSequenceEntry = readonly [WeatherKind, number]

/**
 * Parse a weather spec into an ordered sequence of segments with their
 * start fractions of mission time. Accepts 'Storm' (single kind) or
 * 'Clear->Cloudy' / 'Clear->Cloudy->Fog' chains; whitespace is tolerated.
 * Throws TypeError on an unknown kind or an empty segment (programming error).
 */
export function parseWeatherSequence(
  spec: string | WeatherKind,
  balance: BalanceConfig = loadBalance(),
): WeatherSequenceEntry[] {
  const tokens = spec.split('->').map((t) => t.trim())
  if (tokens.length === 0 || tokens.some((t) => t.length === 0)) {
    throw new TypeError(`parseWeatherSequence: empty weather spec "${String(spec)}"`)
  }
  const kinds: WeatherKind[] = []
  for (const token of tokens) {
    if (!(token in balance.weather)) {
      throw new TypeError(`parseWeatherSequence: unknown weather kind "${token}" (not in balance.weather)`)
    }
    kinds.push(token as WeatherKind)
  }
  const n = kinds.length
  // DESIGN DECISION: n equal segments; segment i starts at fraction i/n.
  return kinds.map((kind, i) => [kind, i / n] as const)
}
