/**
 * SILENT DEPTH — deterministic mission generator (src/missions/generator.ts)
 *
 * FR-15 / GAME_DESIGN §9.2: input {composition, difficulty, weather,
 * visibility, torpedoes, battery, objective, …} + seed → deterministic
 * MissionDef. The five fixed missions (§9.1) are defined as
 * generateMission(tableRow, seed) results with the table seeds 1001–1005
 * (NFR-3 reproducible). Same seed → deep-equal MissionDef; different seeds →
 * different layouts. No Math.random anywhere — the only randomness is
 * createRng(seed).fork('missions-gen').
 *
 * Spawn layout rules (balance numbers are authoritative — ADR-002):
 *   - merchants: placed at their 2×2 formation slots (GAME_DESIGN §6.3,
 *     balance.enemyAI.escort.formation: colSpacingM 500 / rowSpacingM 400)
 *     around a group anchor that sits on the fleet route, jittered within
 *     ±balance.world.merchantSpawnSpreadKm (1.5 km) of the nominal route
 *     point ("商船初始位置沿航路散布 ±1.5 km").
 *   - escorts: balance.world.escortOffsetM (800 m) directly behind the
 *     formation anchor, fanned laterally at formation colSpacing.
 *   - player: 8–12 km ahead of the convoy's leading edge along the fleet
 *     heading, ±2 km lateral, heading perpendicular to the fleet
 *     ("敌编队预计航路前方 8–12 km, 朝向垂直于敌航向"). The stand-off is
 *     measured from the FARTHEST-FORWARD merchant, which guarantees
 *     distance-to-nearest-enemy ≥ balance.world.playerSpawnMinDistKm (8 km).
 *
 * DESIGN DECISIONS:
 *  - RNG fork label 'missions-gen' — independent of the engine's per-system
 *    streams (engine.ts §5.4), so generation is a pure function of (seed,
 *    input) regardless of when it runs or what else consumed engine forks.
 *  - Fleet heading is drawn deterministically from the four cardinals
 *    (N/E/S/W). A uniform 0–360° heading would push the convoy + 8–12 km
 *    player stand-off out of the 30 km map for roughly half of headings; the
 *    cardinal pool keeps every generated layout inside the map (see
 *    buildRouteCenterBand). Mission designers can pin a heading by overriding
 *    the table later.
 *  - GAME_DESIGN §9.2's "间距 ≥ 2 km 避免重叠" is reconciled with the
 *    balance numbers as follows (the prose figure cannot hold literally for a
 *    2×2 convoy: §6.3 mandates 500 m/400 m slot spacing): (a) merchant
 *    groups of DIFFERENT classes are kept ≥ MIN_GROUP_SPACING_KM (2 km) apart
 *    along the route (validated + retried); (b) any two spawns are never
 *    closer than MIN_SPAWN_SEPARATION_KM (0.2 km, an overlap guard); (c) the
 *    player is ≥ 8 km from every enemy. Escorts intentionally sit 800 m
 *    behind (escortOffsetM).
 *  - Formation slot math (slotForMerchantIndex / formationSlotPoint) is
 *    duplicated from src/ai/convoy.ts on purpose: the module graph is
 *    src/core → world → missions → gameplay → sonar → ai → combat, so
 *    missions MUST NOT import from src/ai. Keep the two copies in sync; the
 *    AI re-derives the same slots from the merchant array order.
 *  - Constraint validation + retry: validateSpawns() runs after every build;
 *    on failure the generator retries with seed+1, seed+2, … up to
 *    balance.world.maxGenRetries retries (11 attempts total), then throws a
 *    clear TypeError. Deterministic per seed.
 *  - 'Night+Fog' (M05) is normalized to the '->' chain 'Night->Fog' so the
 *    t-009 world system (parseWeatherSequence) accepts it; the renderer
 *    draws both overlays from the active weather.
 *
 * Task: t-008 missions (level-designer).
 *
 * @pure — zero DOM / browser-API references.
 */

import type { BalanceConfig } from '../core/balance'
import { loadBalance } from '../core/balance'
import { createRng, type Rng } from '../core/rng'
import type { MissionDef, ObjectiveDef, ShipClass, WeatherKind } from '../core/types'

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/**
 * Generator input (GAME_DESIGN §9.2). `enemies` and `escorts` carry the exact
 * composition (enemyCount = Σ enemies values, escortCount = escorts.length) —
 * the five fixed missions differ in merchant classes and escort kits, so a
 * bare count would lose information.
 */
export interface GeneratorInput {
  id: string
  name: string
  /** Merchant composition {class: count} (insertion order = route order). */
  enemies: Record<string, number>
  /** Escort classes in order (e.g. M05: Destroyer, Destroyer, Frigate). */
  escorts: ShipClass[]
  /** Weather spec: 'Clear', 'Clear->Cloudy', or '+'-joined ('Night+Fog'). */
  weather: string
  /** Design label ('high' | 'medium-high' | …) — informational. */
  visibility: string
  torpedoes: number
  battery: number
  objective: ObjectiveDef
  /** GAME_DESIGN §9.1 par time in minutes. */
  parMinutes: number
  /** 1..5. */
  difficulty: number
  /** M05: escape is required for victory. */
  escapeRequired?: boolean
  /** M04: escort active-ping interval override (2 s). */
  escortPingIntervalSeconds?: number
  /** Unlock chain: id of the mission that unlocks this one, or null. */
  unlock?: string | null
}

// ---------------------------------------------------------------------------
// Layout constants (presentation/geometry, not gameplay balance — ADR-002)
// ---------------------------------------------------------------------------

/** §9.2 "间距 ≥ 2 km" between merchant groups of different classes. */
export const MIN_GROUP_SPACING_KM = 2
/** Overlap guard ("避免重叠") — convoy members are 400–640 m apart by design. */
export const MIN_SPAWN_SEPARATION_KM = 0.2
/** Player stand-off range beyond the convoy leading edge: [8, 8+4] km (§9.1). */
export const PLAYER_AHEAD_RANGE_KM = 4
/** Player lateral offset band, km (perpendicular to the fleet heading). */
export const PLAYER_LATERAL_KM = 2
/** Map edge safety margin, km. */
export const MAP_EDGE_MARGIN_KM = 2
/** Escort lateral fan spacing, m (formation colSpacing). */
export const ESCORT_LATERAL_SPACING_M = 500

/** Fleet heading pool — see header DESIGN DECISION (fits the 30 km map). */
const CARDINAL_HEADINGS: readonly number[] = [0, 90, 180, 270]

// ---------------------------------------------------------------------------
// Small geometry helpers (mirror src/ai/convoy.ts — see header)
// ---------------------------------------------------------------------------

interface FormationGeometry {
  columns: number
  rows: number
  colSpacingM: number
  rowSpacingM: number
}

/** 0-based col-major slot for the n-th merchant (mirrors convoy.ts). */
export function slotForMerchantIndex(index: number, geo: FormationGeometry): { col: number; row: number } {
  return { col: index % geo.columns, row: Math.floor(index / geo.columns) % geo.rows }
}

/** World position of a formation slot (mirrors convoy.ts formationSlotPoint). */
export function formationSlotPoint(
  anchor: { x: number; y: number },
  headingDeg: number,
  slot: { col: number; row: number },
  geo: FormationGeometry,
): { x: number; y: number } {
  const forwardM = ((geo.rows - 1) / 2 - slot.row) * geo.rowSpacingM
  const lateralM = (slot.col - (geo.columns - 1) / 2) * geo.colSpacingM
  const h = (headingDeg * Math.PI) / 180
  const fwd = { x: Math.cos(h), y: Math.sin(h) }
  const right = { x: Math.sin(h), y: -Math.cos(h) }
  return {
    x: anchor.x + (fwd.x * forwardM + right.x * lateralM) / 1000,
    y: anchor.y + (fwd.y * forwardM + right.y * lateralM) / 1000,
  }
}

function unitVector(headingDeg: number): { x: number; y: number } {
  const h = (headingDeg * Math.PI) / 180
  return { x: Math.cos(h), y: Math.sin(h) }
}

/** Starboard perpendicular (heading − 90°), north-up. */
function rightVector(headingDeg: number): { x: number; y: number } {
  const h = (headingDeg * Math.PI) / 180
  return { x: Math.sin(h), y: -Math.cos(h) }
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function distKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Patrol speed of a ship class (number = both, or {patrol, attack}). */
function shipPatrolSpeed(balance: BalanceConfig, cls: ShipClass): number {
  const cfg = balance.enemyAI.shipTypes[cls]
  if (cfg === undefined) return 0
  return typeof cfg.speedKt === 'number' ? cfg.speedKt : cfg.speedKt.patrol
}

// ---------------------------------------------------------------------------
// Build + validate
// ---------------------------------------------------------------------------

interface MerchantGroup {
  cls: ShipClass
  count: number
  anchor: { x: number; y: number }
}

/**
 * Build one layout candidate for a given seed. Deterministic; may violate
 * constraints (validateSpawns decides) — the caller retries with seed+1.
 */
function buildMission(input: GeneratorInput, seed: number, balance: BalanceConfig): MissionDef {
  const w = balance.world
  const geo = balance.enemyAI.escort.formation
  const rng: Rng = createRng(seed).fork('missions-gen')

  // -- fleet ---------------------------------------------------------------
  const headingDeg = CARDINAL_HEADINGS[rng.int(0, CARDINAL_HEADINGS.length - 1)]!
  const merchantClasses = Object.keys(input.enemies).filter((c) => (input.enemies[c] ?? 0) > 0) as ShipClass[]
  const leadClass = merchantClasses[0]
  const fleetSpeedKt = leadClass !== undefined ? shipPatrolSpeed(balance, leadClass) : 0
  const fleet = {
    headingDeg,
    speedKt: fleetSpeedKt,
    formation: `${geo.columns}x${geo.rows}`,
    colSpacingM: geo.colSpacingM,
    rowSpacingM: geo.rowSpacingM,
    patrolBehavior: 'figure8',
  }

  const fwd = unitVector(headingDeg)
  const right = rightVector(headingDeg)

  // -- route center (inside a feasible band so the full layout fits the map)
  const forwardSign = headingDeg === 0 || headingDeg === 90 ? 1 : -1
  const backExtentKm = w.merchantSpawnSpreadKm + (geo.rowSpacingM / 1000) + w.escortOffsetM / 1000
  const forwardExtentKm =
    w.merchantSpawnSpreadKm + (geo.rowSpacingM / 1000) + w.playerSpawnMinDistKm + PLAYER_AHEAD_RANGE_KM
  const alongBandLow = forwardSign === 1 ? backExtentKm + MAP_EDGE_MARGIN_KM : forwardExtentKm + MAP_EDGE_MARGIN_KM
  const alongBandHigh =
    forwardSign === 1 ? w.mapSizeKm - forwardExtentKm - MAP_EDGE_MARGIN_KM : w.mapSizeKm - backExtentKm - MAP_EDGE_MARGIN_KM
  // Empty band (e.g. an overridden playerSpawnMinDistKm) → place at the map
  // centre and let validation fail + retry naturally.
  const cAlong = alongBandHigh < alongBandLow ? w.mapSizeKm / 2 : rng.range(alongBandLow, alongBandHigh)
  const cPerp = rng.range(MAP_EDGE_MARGIN_KM + PLAYER_LATERAL_KM, w.mapSizeKm - MAP_EDGE_MARGIN_KM - PLAYER_LATERAL_KM)
  // Heading 0 = east (+x), 90 = north (+y), 180 = west, 270 = south — the
  // along-axis is x for east/west and y for north/south.
  const alongAxisX = headingDeg === 0 || headingDeg === 180
  const routeCenter = alongAxisX ? { x: cAlong, y: cPerp } : { x: cPerp, y: cAlong }

  // -- merchant groups: one anchor per class, ≥ 2 km apart along the route
  const groups: MerchantGroup[] = []
  let routePos = 0
  for (const [cls, count] of Object.entries(input.enemies)) {
    if (count <= 0) continue
    const jitter = rng.range(-w.merchantSpawnSpreadKm, w.merchantSpawnSpreadKm)
    const anchor = {
      x: routeCenter.x + fwd.x * (routePos + jitter),
      y: routeCenter.y + fwd.y * (routePos + jitter),
    }
    groups.push({ cls: cls as ShipClass, count, anchor })
    routePos += MIN_GROUP_SPACING_KM
  }

  // -- spawns: merchants at formation slots (global col-major index, so the
  //    AI's slotForMerchantIndex lands every merchant on its waypoint)
  const spawns: { type: ShipClass; x: number; y: number; headingDeg: number }[] = []
  let merchantIndex = 0
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const slot = slotForMerchantIndex(merchantIndex, geo)
      const pos = formationSlotPoint(g.anchor, headingDeg, slot, geo)
      spawns.push({ type: g.cls, x: pos.x, y: pos.y, headingDeg })
      merchantIndex++
    }
  }

  // -- escorts: escortOffsetM behind the (first) merchant group anchor
  const escortAnchor = groups[0]?.anchor ?? routeCenter
  const behind = {
    x: escortAnchor.x - fwd.x * (w.escortOffsetM / 1000),
    y: escortAnchor.y - fwd.y * (w.escortOffsetM / 1000),
  }
  input.escorts.forEach((cls, i) => {
    const lateralM = (i - (input.escorts.length - 1) / 2) * ESCORT_LATERAL_SPACING_M
    spawns.push({
      type: cls,
      x: behind.x + (right.x * lateralM) / 1000,
      y: behind.y + (right.y * lateralM) / 1000,
      headingDeg,
    })
  })

  // -- player: ahead of the convoy's leading edge, perpendicular heading.
  //    The lateral offset is capped by the stand-off margin (ahead − minDist)
  //    so distance-to-nearest-enemy ≥ minDist holds BY CONSTRUCTION: the
  //    longitudinal separation is ≥ ahead − |lateral| ≥ minDist, and the
  //    merchant lateral offsets (±0.25 km) only increase the distance.
  let merchantForwardMax = -Infinity
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i]!
    if (!(s.type in input.enemies) || (input.enemies[s.type] ?? 0) <= 0) continue
    const along = (s.x - routeCenter.x) * fwd.x + (s.y - routeCenter.y) * fwd.y
    if (along > merchantForwardMax) merchantForwardMax = along
  }
  if (merchantForwardMax === -Infinity) merchantForwardMax = 0
  const ahead = rng.range(w.playerSpawnMinDistKm, w.playerSpawnMinDistKm + PLAYER_AHEAD_RANGE_KM)
  const maxLateral = Math.min(PLAYER_LATERAL_KM, Math.max(0, ahead - w.playerSpawnMinDistKm))
  const lateral = rng.range(-maxLateral, maxLateral)
  const playerPos = {
    x: routeCenter.x + fwd.x * (merchantForwardMax + ahead) + right.x * lateral,
    y: routeCenter.y + fwd.y * (merchantForwardMax + ahead) + right.y * lateral,
  }
  const playerHeading = normalizeDeg(headingDeg + (rng.chance(0.5) ? 90 : -90))

  // -- weather + visibility (balance-driven)
  const weatherSeq = input.weather.replace(/\+/g, '->') // 'Night+Fog' → 'Night->Fog'
  const firstKind = (weatherSeq.split('->')[0] ?? 'Clear') as WeatherKind
  const visibilityKm = balance.weather[firstKind]?.visibilityKm ?? balance.weather.Clear.visibilityKm

  return {
    id: input.id,
    name: input.name,
    objective: input.objective,
    patrolArea: { km: w.mapSizeKm, gridM: w.gridM },
    fleet,
    spawns,
    playerStart: { x: playerPos.x, y: playerPos.y, headingDeg: playerHeading },
    weather: weatherSeq as WeatherKind,
    visibilityKm,
    torpedoCount: input.torpedoes,
    batteryStart: input.battery,
    parTimeS: input.parMinutes * 60,
    difficulty: input.difficulty,
    seed,
  }
}

/**
 * Validate a candidate layout against the generator constraints. Returns an
 * error message, or null when the layout is acceptable.
 */
export function validateSpawns(def: MissionDef, input: GeneratorInput, balance: BalanceConfig): string | null {
  const w = balance.world
  if (def.spawns.length === 0) return 'no enemy spawns'

  // composition: counts must match the table exactly
  const byClass = new Map<string, number>()
  for (const s of def.spawns) byClass.set(s.type, (byClass.get(s.type) ?? 0) + 1)
  // merchants must match the table exactly (consume the expected counts)
  for (const [cls, count] of Object.entries(input.enemies)) {
    const actual = byClass.get(cls) ?? 0
    if (actual !== count) return `composition mismatch: expected ${count}×${cls}, got ${actual}`
    byClass.set(cls, 0)
  }
  // escorts: one spawn per listed escort class
  for (const cls of input.escorts) {
    const remaining = (byClass.get(cls) ?? 0) - 1
    if (remaining < 0) return `composition mismatch: extra escort ${cls}`
    byClass.set(cls, remaining)
  }
  // anything left over is unexpected
  for (const [cls, remaining] of byClass) {
    if (remaining !== 0) return `composition mismatch: unexpected ${cls}×${remaining}`
  }

  // all spawns inside the map (with an edge margin)
  const inMap = (p: { x: number; y: number }, marginKm: number): boolean =>
    p.x >= marginKm && p.x <= w.mapSizeKm - marginKm && p.y >= marginKm && p.y <= w.mapSizeKm - marginKm
  for (const s of def.spawns) {
    if (!inMap(s, MAP_EDGE_MARGIN_KM)) return 'spawn outside map'
  }
  if (!inMap(def.playerStart, 0)) return 'player outside map'

  // overlap guard: no two spawns closer than MIN_SPAWN_SEPARATION_KM
  for (let i = 0; i < def.spawns.length; i++) {
    for (let j = i + 1; j < def.spawns.length; j++) {
      if (distKm(def.spawns[i]!, def.spawns[j]!) < MIN_SPAWN_SEPARATION_KM) return 'spawns too close'
    }
  }

  // §9.2: merchant groups of different classes stay ≥ 2 km apart
  const merchantOfClass = (cls: string): boolean => (input.enemies[cls] ?? 0) > 0
  for (let i = 0; i < def.spawns.length; i++) {
    for (let j = i + 1; j < def.spawns.length; j++) {
      const a = def.spawns[i]!
      const b = def.spawns[j]!
      if (a.type === b.type || !merchantOfClass(a.type) || !merchantOfClass(b.type)) continue
      if (distKm(a, b) < MIN_GROUP_SPACING_KM) return 'merchant groups closer than 2 km'
    }
  }

  // player stand-off: ≥ playerSpawnMinDistKm from every enemy
  for (const s of def.spawns) {
    if (distKm(def.playerStart, s) < w.playerSpawnMinDistKm) return 'player too close to enemy'
  }
  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deterministically generate a MissionDef (FR-15 / §9.2). Same (input, seed)
 * → deep-equal result. On constraint violation the seed is incremented and
 * the layout rebuilt, up to balance.world.maxGenRetries retries, then a
 * TypeError is thrown. Never uses Math.random.
 */
export function generateMission(input: GeneratorInput, seed: number, balance: BalanceConfig = loadBalance()): MissionDef {
  const maxAttempts = balance.world.maxGenRetries + 1 // initial build + maxGenRetries retries
  let lastError: string | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const def = buildMission(input, seed + attempt, balance)
    lastError = validateSpawns(def, input, balance)
    if (lastError === null) return def
  }
  throw new TypeError(
    `generateMission(${input.id}): no valid layout in ${maxAttempts} attempts (last: ${lastError})`,
  )
}
