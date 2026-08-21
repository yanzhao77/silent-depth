/**
 * SILENT DEPTH — fixed mission definitions (src/missions/missions.ts)
 *
 * FR-14 / GAME_DESIGN §9.1: the five fixed missions (M01–M05) with their full
 * table fields, read from config/missions.json (import JSON — single source
 * of the table) and turned into engine MissionDefs by the seeded generator
 * (GAME_DESIGN §9.2: "五任务的固定定义 = 用上表参数跑生成器 (同一 seed) 的
 * 结果" — getMissionDef(id) === generateMission(tableRow, seed)).
 *
 * The table is checked against balance.json.missions for consistency (ids,
 * torpedoes, parMinutes, seeds, escort composition, weather labels) in
 * tests/unit/missions.test.ts.
 *
 * DESIGN DECISIONS:
 *  - M05 weather "Night+Fog" (simultaneous) is normalized to the '->' chain
 *    'Night->Fog' for MissionDef.weather so the t-009 world system accepts it
 *    (parseWeatherSequence splits on '->'); the renderer draws the fog
 *    overlay from the active weather. The table keeps the design label
 *    'Night+Fog' (also matching balance.json.missions).
 *  - MissionDef.visibilityKm = balance.weather[startingKind].visibilityKm
 *    (the weather table's per-kind visibility, GAME_DESIGN §9.1). The world
 *    system exposes the per-active-weather visibility anyway; this field is
 *    the static starting value the shell may show in the briefing.
 *  - batteryStart = balance.battery.capacity (100) for every mission
 *    (§9.1: "任务开始玩家初始：电池 100%").
 *  - fleet.speedKt = the lead merchant's patrol speed (balance
 *    enemyAI.shipTypes); formation = `${cols}x${rows}` and spacings from
 *    balance.enemyAI.escort.formation; patrolBehavior 'figure8' per §9.2.
 *  - The escape requirement (M05) and the escort ping interval (M04) are
 *    table fields consumed by the objectives/ai layers via the mission id /
 *    objective kind — MissionDef has no fields for them (types.ts frozen).
 *
 * Task: t-008 missions (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import missionsJson from '../../config/missions.json'
import type { BalanceConfig } from '../core/balance'
import { loadBalance } from '../core/balance'
import type { MissionDef, ObjectiveDef, ShipClass } from '../core/types'
import { generateMission, type GeneratorInput } from './generator'

// ---------------------------------------------------------------------------
// Mission table (config/missions.json — single source of the 5 missions)
// ---------------------------------------------------------------------------

export interface MissionSpec {
  id: string
  name: string
  nameZh: string
  objectiveKind: string
  objective: ObjectiveDef
  /** Merchant composition {class: count}. */
  enemies: Record<string, number>
  /** Escort classes in order. */
  escorts: ShipClass[]
  torpedoCount: number
  /** Weather label: 'Clear', 'Clear->Cloudy', 'Night+Fog', … */
  weather: string
  /** Design visibility label ('high' | 'medium-high' | …). */
  visibility: string
  difficulty: string
  /** 1..5 (GAME_DESIGN difficulty ordering). */
  difficultyLevel: number
  parMinutes: number
  seed: number
  /** Unlock chain: previous mission id, or null for M01. */
  unlock: string | null
  escapeRequired: boolean
  /** M04: escort active-ping interval override (2 s). */
  escortPingIntervalSeconds: number | null
}

const SPECS: readonly MissionSpec[] = missionsJson.missions as unknown as MissionSpec[]

export function listMissionSpecs(): readonly MissionSpec[] {
  return SPECS
}

export function getMissionSpec(id: string): MissionSpec | undefined {
  return SPECS.find((s) => s.id === id)
}

export const MISSION_IDS: readonly string[] = SPECS.map((s) => s.id)

// ---------------------------------------------------------------------------
// getMissionDef
// ---------------------------------------------------------------------------

/**
 * Build the engine MissionDef for a fixed mission id (FR-14 / §9.1+§9.2).
 * Deterministic: the same id always yields the deep-equal def (generator
 * seeded by the table seed). Throws TypeError for an unknown id.
 */
export function getMissionDef(id: string, balance: BalanceConfig = loadBalance()): MissionDef {
  const spec = getMissionSpec(id)
  if (spec === undefined) {
    throw new TypeError(`getMissionDef: unknown mission id "${id}" (expected one of ${MISSION_IDS.join(', ')})`)
  }
  const input: GeneratorInput = {
    id: spec.id,
    name: spec.name,
    enemies: spec.enemies,
    escorts: spec.escorts,
    weather: spec.weather,
    visibility: spec.visibility,
    torpedoes: spec.torpedoCount,
    battery: balance.battery.capacity, // §9.1: start at 100%
    objective: spec.objective,
    parMinutes: spec.parMinutes,
    difficulty: spec.difficultyLevel,
    escapeRequired: spec.escapeRequired,
    escortPingIntervalSeconds: spec.escortPingIntervalSeconds ?? undefined,
    unlock: spec.unlock,
  }
  return generateMission(input, spec.seed, balance)
}

// Re-export the weather normalization for the shell/renderer (M05 'Night+Fog').
export function normalizeWeatherSpec(spec: string): string {
  return spec.replace(/\+/g, '->')
}
