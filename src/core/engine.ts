/**
 * SILENT DEPTH — engine core (src/core/engine.ts)
 *
 * ADR-005 public surface (GAME_ARCHITECTURE §4, exact field names):
 *
 *   createGame(missionDef, seed) → GameHandle
 *   step(handle, dtSeconds, inputs) → GameSnapshot
 *   endMission(handle, 'victory' | 'defeat')   — transition API for the
 *                                                objectives system (t-008)
 *   goToMenu(handle)                           — shell navigation (Abort/Result)
 *
 * Lifecycle: createGame walks BOOT → MENU → MISSION_LOADING immediately;
 * briefing countdown (MissionDef.briefingSeconds, default 2 s of simTime)
 * moves the game to MISSION_RUNNING. Abort/Restart is the shell calling
 * createGame() again (GAME_DESIGN §3.1). VICTORY/DEFEAT auto-transition to
 * MISSION_RESULT after MISSION_RESULT_DELAY_S of simTime (or immediately via
 * shell).
 *
 * System pipeline (fixed order = RNG consumption order, §5.2 / §7):
 *   stateMachine → world → missions → submarine → sonar → ai → combat →
 *   detection → objectives → (snapshot assembly).
 * Systems not implemented in t-003 (world/missions/submarine/sonar/ai/combat/
 * detection/objectives) are explicit no-op stubs with TODO markers pointing at
 * the owning task (t-004..t-009); the order and per-system RNG forks are
 * already final so later tasks slot in without reordering.
 *
 * Determinism (ADR-004): step() is pure w.r.t. (handle, inputs, dt). All
 * mutable state lives in the handle's __internal runtime; the only random
 * source is rng.ts. PAUSED ticks advance neither simTime nor RNG.
 *
 * Input sanitation (invariant #3 of §4): rudder clamped to [-1,1], throttle
 * clamped to [0, FULL.speedMaxKt] (from balance — never hardcoded), and an
 * invalid fireTorpedo contactId is ignored and reported via a
 * torpedo.fireRejected event. step() never throws on bad inputs.
 *
 * DESIGN DECISIONS (documented):
 *  - Illegal state-machine transitions throw (see stateMachine.ts) — the
 *    engine guards user inputs first, so only programming errors throw.
 *  - Pause/resume edge ticks are frozen: neither the pause edge nor the
 *    resume edge tick advances simTime (see tests: pause/no-RNG contract).
 *  - Briefing ticks advance simTime but run no gameplay systems.
 *  - VICTORY/DEFEAT ticks advance simTime (drives the result delay) but run
 *    no gameplay systems.
 *  - simTime advances only in MISSION_LOADING / MISSION_RUNNING /
 *    VICTORY / DEFEAT.
 *  - Player starts at depth layer 'Shallow' (design doc leaves it open).
 *  - MISSION_RESULT_DELAY_S = 3 (UX constant, not a balance number).
 *  - Fork labels for per-system RNG sub-streams: 'world' 'missions'
 *    'submarine' 'sonar' 'ai' 'combat' 'detection' 'objectives'.
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references (no window/document/AudioContext/
 * localStorage/performance.now/Date.now/Math.random).
 */

import { loadBalance, type BalanceConfig } from './balance'
import { createRng, type Rng } from './rng'
import { createEventBus, type EventBus } from './eventBus'
import { GameStateMachine, GameStateTransitionError } from './stateMachine'
import { FIXED_DT } from './time'
import { DEFAULT_BRIEFING_SECONDS } from './types'
import type {
  Contact,
  Decoy,
  DepthLayer,
  EnemyShip,
  EventEntry,
  GameSnapshot,
  GameState,
  MatchStats,
  MissionDef,
  MissionStatus,
  PlayerInputs,
  ScoreParts,
  SubmarineState,
  Torpedo,
} from './types'

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface GameHandle {
  readonly mission: MissionDef
  readonly seed: number
  /**
   * Opaque internal runtime. The reference is held by the implementation;
   * external code (rendering/UI/tests) must not read or write it directly —
   * step() is the only mutation entry point.
   */
  readonly __internal: unknown
}

/** Per-system RNG fork labels (GAME_ARCHITECTURE §5.4) — final, do not rename. */
export type SystemName =
  | 'world'
  | 'missions'
  | 'submarine'
  | 'sonar'
  | 'ai'
  | 'combat'
  | 'detection'
  | 'objectives'

export type TorpedoFireRejectionReason = 'noTarget' | 'notReady' | 'lowBattery'

export interface TorpedoFireRejection {
  reason: TorpedoFireRejectionReason
  contactId: string | null
}

export interface NormalizedInputs {
  inputs: PlayerInputs
  rejections: TorpedoFireRejection[]
}

// ---------------------------------------------------------------------------
// Internal runtime (mutable engine state — not exported for mutation)
// ---------------------------------------------------------------------------

interface EngineRuntime {
  stateMachine: GameStateMachine
  simTime: number
  /**
   * Briefing countdown in FIXED_DT ticks (integer — exact & deterministic;
   * a float-seconds countdown drifts across the boundary, e.g. 3 − 59×0.05
   * can exceed 0.05 after rounding).
   */
  briefingTicksRemaining: number
  /** VICTORY/DEFEAT display delay in FIXED_DT ticks (see above). */
  resultDelayTicksRemaining: number
  rng: Rng
  forks: Record<SystemName, Rng>
  bus: EventBus
  balance: BalanceConfig
  mission: MissionDef
  player: SubmarineState
  contacts: Contact[]
  enemies: EnemyShip[]
  torpedoes: Torpedo[]
  decoys: Decoy[]
  missionStatus: MissionStatus
  score: ScoreParts
  stats: MatchStats
  prevPause: boolean
  prevPing: boolean
  prevDecoy: boolean
}

/**
 * Context handed to every pipeline system. Fields are LIVE references to the
 * runtime's canonical objects — systems mutate them directly. Later system
 * tasks (t-004..t-009) import this type and swap the stubs below.
 */
export interface SystemContext {
  dt: number
  simTime: number
  state: GameState
  pauseEdge: boolean
  pingEdge: boolean
  decoyEdge: boolean
  /** Normalized (clamped/validated) inputs — set before systems 2..9 run. */
  inputs: PlayerInputs
  bus: EventBus
  balance: BalanceConfig
  mission: MissionDef
  forks: Record<SystemName, Rng>
  player: SubmarineState
  contacts: Contact[]
  enemies: EnemyShip[]
  torpedoes: Torpedo[]
  decoys: Decoy[]
  missionStatus: MissionStatus
  score: ScoreParts
  stats: MatchStats
  /** Set by the state-machine system to stop the rest of the pipeline. */
  skip: boolean
}

export type SystemFn = (ctx: SystemContext) => void

// ---------------------------------------------------------------------------
// Constants (UX/core constants only — balance numbers come from balance.ts)
// ---------------------------------------------------------------------------

/** Player start depth layer (DESIGN DECISION: doc leaves starting depth open). */
export const INITIAL_DEPTH_LAYER: DepthLayer = 'Shallow'

/** Seconds spent in VICTORY/DEFEAT before auto-transition to MISSION_RESULT. */
export const MISSION_RESULT_DELAY_S = 3

const DEFAULT_INPUTS: PlayerInputs = {
  throttle: 0,
  rudder: 0,
  depthLayerTarget: INITIAL_DEPTH_LAYER,
  silentRunning: false,
  ping: false,
  fireTorpedo: null,
  decoy: false,
  pause: false,
}

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------

/**
 * Create a game instance: walks BOOT → MENU → MISSION_LOADING (briefing) and
 * pre-derives the per-system RNG fork streams from `seed`.
 */
export function createGame(missionDef: MissionDef, seed: number): GameHandle {
  validateMissionDef(missionDef)
  const balance = loadBalance()

  const rng = createRng(seed)
  const forks: Record<SystemName, Rng> = {
    world: rng.fork('world'),
    missions: rng.fork('missions'),
    submarine: rng.fork('submarine'),
    sonar: rng.fork('sonar'),
    ai: rng.fork('ai'),
    combat: rng.fork('combat'),
    detection: rng.fork('detection'),
    objectives: rng.fork('objectives'),
  }

  const stateMachine = new GameStateMachine('BOOT')
  stateMachine.transition('MENU') // boot → menu
  stateMachine.transition('MISSION_LOADING') // menu → loading (createGame = start mission)

  const runtime: EngineRuntime = {
    stateMachine,
    simTime: 0,
    briefingTicksRemaining: secondsToTicks(missionDef.briefingSeconds ?? DEFAULT_BRIEFING_SECONDS),
    resultDelayTicksRemaining: secondsToTicks(MISSION_RESULT_DELAY_S),
    rng,
    forks,
    bus: createEventBus(),
    balance,
    mission: missionDef,
    player: initialSubmarineState(missionDef, balance),
    contacts: [],
    enemies: initialEnemies(missionDef, balance),
    torpedoes: [],
    decoys: [],
    missionStatus: initialMissionStatus(missionDef),
    score: initialScore(),
    stats: initialStats(missionDef),
    prevPause: false,
    prevPing: false,
    prevDecoy: false,
  }

  return { mission: missionDef, seed, __internal: runtime }
}

function validateMissionDef(def: MissionDef): void {
  const fail = (msg: string): never => {
    throw new TypeError(`createGame: invalid MissionDef — ${msg}`)
  }
  if (typeof def.id !== 'string' || def.id.length === 0) fail('"id" must be a non-empty string')
  if (typeof def.name !== 'string' || def.name.length === 0) fail('"name" must be a non-empty string')
  if (def.objective === null || typeof def.objective !== 'object' || typeof def.objective.kind !== 'string') {
    fail('"objective.kind" must be a string')
  }
  if (typeof def.playerStart?.x !== 'number' || typeof def.playerStart?.y !== 'number' || typeof def.playerStart?.headingDeg !== 'number') {
    fail('"playerStart" must have numeric x/y/headingDeg')
  }
  if (!Array.isArray(def.spawns)) fail('"spawns" must be an array')
  const balance = loadBalance()
  for (const spawn of def.spawns) {
    if (!(spawn.type in balance.enemyAI.shipTypes)) {
      fail(`spawn type "${spawn.type}" is not supported by balance.enemyAI.shipTypes`)
    }
    if (typeof spawn.x !== 'number' || typeof spawn.y !== 'number' || typeof spawn.headingDeg !== 'number') {
      fail('each spawn must have numeric x/y/headingDeg')
    }
  }
  if (!Number.isInteger(def.torpedoCount) || def.torpedoCount <= 0) fail('"torpedoCount" must be a positive integer')
  if (typeof def.batteryStart !== 'number' || def.batteryStart < 0 || def.batteryStart > balance.battery.capacity) {
    fail(`"batteryStart" must be within [0, ${balance.battery.capacity}]`)
  }
  if (def.briefingSeconds !== undefined && (typeof def.briefingSeconds !== 'number' || def.briefingSeconds < 0)) {
    fail('"briefingSeconds" must be a non-negative number when provided')
  }
}

function initialSubmarineState(mission: MissionDef, balance: BalanceConfig): SubmarineState {
  const tubes: SubmarineState['torpedoTubes'] = Array.from({ length: mission.torpedoCount }, (_, i) => ({
    id: `T-${String(i + 1).padStart(2, '0')}`,
    state: 'LOADED',
    targetContactId: null,
  }))
  return {
    position: { x: mission.playerStart.x, y: mission.playerStart.y },
    headingDeg: mission.playerStart.headingDeg,
    speedKt: 0,
    speedBand: 'STOPPED',
    targetSpeedKt: 0,
    depthLayer: INITIAL_DEPTH_LAYER,
    targetDepthLayer: INITIAL_DEPTH_LAYER,
    depthTransitionT: null,
    battery: mission.batteryStart,
    noise: 0,
    hull: balance.hull.playerMax,
    detection: 0,
    silentRunning: false,
    sonarState: 'idle',
    pingCooldown: 0,
    torpedoTubes: tubes,
    decoyCount: balance.decoy.perMission,
    lowBattery: false,
    outOfBoundsTimer: 0,
  }
}

function initialEnemies(mission: MissionDef, balance: BalanceConfig): EnemyShip[] {
  return mission.spawns.map((spawn, i) => {
    const cfg = balance.enemyAI.shipTypes[spawn.type]
    if (cfg === undefined) {
      // validateMissionDef() runs first; this is a defensive invariant.
      throw new TypeError(`initialEnemies: no ship type config for "${spawn.type}"`)
    }
    const isEscort = cfg.attack !== null && cfg.attack !== undefined
    const speedKt = typeof cfg.speedKt === 'number' ? cfg.speedKt : cfg.speedKt.patrol
    return {
      id: `E-${String(i + 1).padStart(2, '0')}`,
      shipClass: spawn.type,
      position: { x: spawn.x, y: spawn.y },
      headingDeg: spawn.headingDeg,
      speedKt,
      hull: cfg.hull,
      aiState: 'NORMAL',
      lkp: null,
      depthChargesLeft: isEscort ? balance.enemyAI.depthCharges.perMission : 0,
      activePingCooldown: 0,
      inConvoy: mission.spawns.length > 1,
    }
  })
}

function initialMissionStatus(mission: MissionDef): MissionStatus {
  return {
    missionId: mission.id,
    phase: 'briefing',
    objectives: (mission.objective.subgoals ?? []).map((s) => ({
      id: s.id,
      desc: s.desc,
      done: false,
      weight: s.weight,
    })),
    escaped: false,
    forcedSurface: false,
  }
}

function initialScore(): ScoreParts {
  // Skeleton: totals/grade are only meaningful once the objectives system
  // (t-008) scores the mission at MISSION_RESULT.
  return {
    objective: 0,
    damage: 0,
    stealth: 0,
    torpedoEfficiency: 0,
    time: 0,
    survival: 0,
    total: 0,
    grade: 'Failed',
  }
}

function initialStats(mission: MissionDef): MatchStats {
  return {
    torpedoesFired: 0,
    torpedoesHit: 0,
    peakDetection: 0,
    elapsedS: 0,
    torpedoesRemaining: mission.torpedoCount,
    // Engine starts at 0; the shell/save layer overwrites with the real best.
    bestScore: 0,
  }
}

// ---------------------------------------------------------------------------
// step
// ---------------------------------------------------------------------------

/**
 * Advance the simulation by one fixed timestep. Pure w.r.t. (handle, inputs,
 * dt): identical sequences produce identical snapshots. Never throws on bad
 * inputs; PAUSED ticks advance neither simTime nor RNG.
 */
export function step(handle: GameHandle, dtSeconds: number, inputs: PlayerInputs): GameSnapshot {
  const rt = getRuntime(handle)
  const dt = dtSeconds > 0 ? dtSeconds : 0

  // Edge detection runs on every tick (also while paused) so a held input
  // does not re-fire after resume.
  const pauseEdge = inputs.pause && !rt.prevPause
  const pingEdge = inputs.ping && !rt.prevPing
  const decoyEdge = inputs.decoy && !rt.prevDecoy
  rt.prevPause = inputs.pause
  rt.prevPing = inputs.ping
  rt.prevDecoy = inputs.decoy

  const ctx: SystemContext = {
    dt,
    simTime: rt.simTime,
    state: rt.stateMachine.state,
    pauseEdge,
    pingEdge,
    decoyEdge,
    inputs: DEFAULT_INPUTS,
    bus: rt.bus,
    balance: rt.balance,
    mission: rt.mission,
    forks: rt.forks,
    player: rt.player,
    contacts: rt.contacts,
    enemies: rt.enemies,
    torpedoes: rt.torpedoes,
    decoys: rt.decoys,
    missionStatus: rt.missionStatus,
    score: rt.score,
    stats: rt.stats,
    skip: false,
  }

  // 1. state machine system — pause/briefing/end-of-mission handling
  systemStateMachine(ctx, rt)

  if (!ctx.skip) {
    // 2. input sanitation (never throws; invalid fireTorpedo → fireRejected)
    const { inputs: normalized, rejections } = normalizeInputs(inputs, rt.balance, contactIdSet(rt))
    ctx.inputs = normalized
    for (const rejection of rejections) {
      rt.bus.emit('torpedo.fireRejected', { reason: rejection.reason, contactId: rejection.contactId })
    }
    rt.bus.setSimTime(rt.simTime)

    // 3..10. fixed-order gameplay systems (RNG consumption order, §5.2/§7)
    for (let i = 1; i < PIPELINE.length; i++) {
      PIPELINE[i]!(ctx)
    }
  }

  updateStats(rt)
  return buildSnapshot(rt)
}

/**
 * Pure input sanitation: clamps rudder to [-1,1] and throttle to
 * [0, balance.speedBands.FULL.speedMaxKt] (balance-driven, never hardcoded),
 * and validates fireTorpedo against the current contact set.
 */
export function normalizeInputs(
  inputs: PlayerInputs,
  balance: BalanceConfig,
  contactIds: ReadonlySet<string>,
): NormalizedInputs {
  const maxThrottleKt = balance.speedBands.FULL.speedMaxKt
  const rudder = clampFinite(inputs.rudder, -1, 1, 0)
  const throttle = clampFinite(inputs.throttle, 0, maxThrottleKt, 0)

  const rejections: TorpedoFireRejection[] = []
  let fireTorpedo = inputs.fireTorpedo
  if (fireTorpedo !== null && !contactIds.has(fireTorpedo)) {
    rejections.push({ reason: 'noTarget', contactId: fireTorpedo })
    fireTorpedo = null
  }

  return {
    inputs: { ...inputs, rudder, throttle, fireTorpedo },
    rejections,
  }
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value < min ? min : value > max ? max : value
}

function contactIdSet(rt: EngineRuntime): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const c of rt.contacts) ids.add(c.id)
  return ids
}

function updateStats(rt: EngineRuntime): void {
  rt.stats.elapsedS = rt.simTime
  if (rt.player.detection > rt.stats.peakDetection) {
    rt.stats.peakDetection = rt.player.detection
  }
  let remaining = 0
  for (const tube of rt.player.torpedoTubes) {
    if (tube.state === 'LOADED' || tube.state === 'READY') remaining++
  }
  rt.stats.torpedoesRemaining = remaining
}

// ---------------------------------------------------------------------------
// Transition API (for the objectives system and the shell)
// ---------------------------------------------------------------------------

/**
 * Mission outcome hook — called by the objectives system (t-008) when the
 * victory/defeat conditions resolve. Only legal from MISSION_RUNNING;
 * otherwise GameStateTransitionError is thrown (programming error).
 */
export function endMission(handle: GameHandle, outcome: 'victory' | 'defeat'): void {
  const rt = getRuntime(handle)
  const target: GameState = outcome === 'victory' ? 'VICTORY' : 'DEFEAT'
  rt.stateMachine.transition(target)
  rt.missionStatus.phase = outcome === 'victory' ? 'complete' : 'failed'
  rt.resultDelayTicksRemaining = secondsToTicks(MISSION_RESULT_DELAY_S)
  rt.bus.setSimTime(rt.simTime)
  rt.bus.emit(outcome === 'victory' ? 'mission.victory' : 'mission.defeat', {
    scoreParts: clone(rt.score),
  })
}

/**
 * Shell navigation back to MENU (Abort / after MISSION_RESULT). Legal from
 * MISSION_LOADING, MISSION_RUNNING, PAUSED, VICTORY, DEFEAT, MISSION_RESULT.
 */
export function goToMenu(handle: GameHandle): void {
  getRuntime(handle).stateMachine.transition('MENU')
}

// ---------------------------------------------------------------------------
// System pipeline (fixed order — do not reorder; stubs are replaced in-place)
// ---------------------------------------------------------------------------

/**
 * 1. State machine: pause toggle, briefing countdown, end-of-mission delay.
 * `rt` is optional only so the function is assignable to SystemFn for the
 * pipeline array below; step() always calls it with the runtime.
 */
function systemStateMachine(ctx: SystemContext, rt?: EngineRuntime): void {
  const runtime = rt as EngineRuntime
  const st = runtime.stateMachine.state

  switch (st) {
    case 'BOOT':
    case 'MENU':
      // Nothing to simulate outside a mission.
      ctx.skip = true
      break
    case 'MISSION_LOADING':
      runtime.simTime += ctx.dt
      runtime.briefingTicksRemaining -= 1
      if (runtime.briefingTicksRemaining <= 0) {
        runtime.stateMachine.transition('MISSION_RUNNING')
        runtime.missionStatus.phase = 'running'
      }
      // Briefing ticks advance simTime but run no gameplay systems.
      ctx.skip = true
      break
    case 'MISSION_RUNNING':
      if (ctx.pauseEdge) {
        // Pause edge tick is frozen (no simTime advance, no systems, no RNG).
        runtime.stateMachine.transition('PAUSED')
        ctx.skip = true
        break
      }
      runtime.simTime += ctx.dt
      break
    case 'PAUSED':
      if (ctx.pauseEdge) {
        // Resume edge tick is frozen too (DESIGN DECISION, see file header).
        runtime.stateMachine.transition('MISSION_RUNNING')
      }
      ctx.skip = true
      break
    case 'VICTORY':
    case 'DEFEAT':
      runtime.simTime += ctx.dt
      runtime.resultDelayTicksRemaining -= 1
      if (runtime.resultDelayTicksRemaining <= 0) {
        runtime.stateMachine.transition('MISSION_RESULT')
      }
      ctx.skip = true
      break
    case 'MISSION_RESULT':
      ctx.skip = true
      break
  }

  ctx.simTime = runtime.simTime
  ctx.state = runtime.stateMachine.state
}

/** 2. World (t-009): ocean/weather state — static per mission, only timers. */
function systemWorld(ctx: SystemContext): void {
  // TODO(t-009 world): maintain weather timers; expose weatherModifiers(weather).
  void ctx
}

/** 3. Missions (t-008): objective progress snapshot — reads global state. */
function systemMissions(ctx: SystemContext): void {
  // TODO(t-008 missions): update missionStatus.objectives progress.
  void ctx
}

/** 4. Gameplay/submarine (t-004): movement/turn/speed band/depth/battery/noise. */
function systemSubmarine(ctx: SystemContext): void {
  // TODO(t-004 submarine): apply inputs.throttle/rudder/depthLayerTarget/silentRunning.
  void ctx
}

/** 5. Sonar (t-005): passive listening then active ping; contact updates. */
function systemSonar(ctx: SystemContext): void {
  // TODO(t-005 sonar): passive listen; on ctx.pingEdge run active ping.
  void ctx
}

/** 6. Enemy AI (t-006): perception → state machine → behavior per ship. */
function systemAI(ctx: SystemContext): void {
  // TODO(t-006 ai): consume ctx.forks.ai; update ctx.enemies.
  void ctx
}

/** 7. Combat (t-007): torpedoes, depth charges, deck gun, damage. */
function systemCombat(ctx: SystemContext): void {
  // TODO(t-007 combat): torpedo lifecycle; consume ctx.forks.combat.
  void ctx
}

/** 8. Detection (t-007): aggregate detection-meter deltas (F8) + thresholds. */
function systemDetection(ctx: SystemContext): void {
  // TODO(t-007 combat/detection): detection rise/fall per §8.1; band events.
  void ctx
}

/** 9. Objectives (t-008): victory/defeat/escape evaluation → endMission(). */
function systemObjectives(ctx: SystemContext): void {
  // TODO(t-008 objectives): evaluate victory/defeat/escape; call endMission().
  void ctx
}

/** Pipeline order is the RNG consumption order — do not reorder. */
const PIPELINE: readonly SystemFn[] = [
  systemStateMachine, // 1
  systemWorld, // 2
  systemMissions, // 3
  systemSubmarine, // 4
  systemSonar, // 5
  systemAI, // 6
  systemCombat, // 7
  systemDetection, // 8
  systemObjectives, // 9
  // step 10 (snapshot assembly) is buildSnapshot() in step() — GAME_ARCHITECTURE §7.
]

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

function buildSnapshot(rt: EngineRuntime): GameSnapshot {
  return {
    simTime: rt.simTime,
    state: rt.stateMachine.state,
    playerSub: clone(rt.player),
    contacts: clone(rt.contacts),
    enemies: clone(rt.enemies),
    torpedoes: clone(rt.torpedoes),
    decoys: clone(rt.decoys),
    mission: clone(rt.missionStatus),
    score: clone(rt.score),
    eventLog: clone(rt.bus.getLog()) as EventEntry[],
    stats: clone(rt.stats),
  }
}

/** Deep clone of plain JSON data — snapshots are detached, read-only views. */
function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = clone((value as Record<string, unknown>)[key])
    }
    return out as T
  }
  return value
}

function getRuntime(handle: GameHandle): EngineRuntime {
  return handle.__internal as EngineRuntime
}

/** Convert seconds to whole FIXED_DT ticks (exact, deterministic countdown). */
function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds / FIXED_DT))
}

// Re-export for system implementers (t-004..t-009) and tests.
export { GameStateTransitionError }
