/**
 * SILENT DEPTH 《深海猎手》 — authoritative engine types (src/core/types.ts)
 *
 * Single source of truth for every engine-facing type (GAME_ARCHITECTURE §6).
 * All modules — gameplay / sonar / ai / combat / missions / world / rendering /
 * ui / sim / tests — import types from here and MUST NOT redefine them locally.
 *
 * Task: t-003 core runtime (gameplay-engineer).
 * Determinism (ADR-004): the engine contains no wall-clock and no Math.random;
 * every random value flows through src/core/rng.ts.
 *
 * @pure — zero DOM / browser-API references by design.
 */

// ---------------------------------------------------------------------------
// Enums (string literal unions — JSON-serializable by construction)
// ---------------------------------------------------------------------------

/** Global game state machine (FR-19, GAME_DESIGN §3.3, GAME_ARCHITECTURE §4). */
export type GameState =
  | 'BOOT'
  | 'MENU'
  | 'MISSION_LOADING'
  | 'MISSION_RUNNING'
  | 'PAUSED'
  | 'VICTORY'
  | 'DEFEAT'
  | 'MISSION_RESULT';

/** Five discrete depth layers (DD-01, GAME_DESIGN §4.4). */
export type DepthLayer = 'Surface' | 'Periscope' | 'Shallow' | 'Medium' | 'Deep';

/** Four speed bands (FR-02, GAME_DESIGN §4.3). */
export type SpeedBand = 'STOPPED' | 'SILENT' | 'CRUISE' | 'FULL';

/** Player sonar mode (FR-04/07). */
export type SonarState = 'idle' | 'ping' | 'passive';

/** Contact state machine (FR-05, GAME_DESIGN §5.4). */
export type ContactState = 'UNKNOWN' | 'SUSPECTED' | 'CLASSIFIED' | 'TRACKED' | 'CONFIRMED';

/** Ship classes (GAME_DESIGN §6.2). */
export type ShipClass = 'Merchant' | 'Cargo' | 'Tanker' | 'Destroyer' | 'Frigate' | 'Submarine';

/** Contact classification pool (FR-08, GAME_DESIGN §5.5). */
export type ContactType = ShipClass | 'Unknown' | 'LargeSurface';

/** Enemy AI state machine (FR-10, GAME_DESIGN §6.1). */
export type AiState = 'NORMAL' | 'SUSPICIOUS' | 'ALERT' | 'SEARCHING' | 'HUNTING' | 'LOST_CONTACT';

/** Torpedo state machine (FR-11, GAME_DESIGN §7.1). */
export type TorpedoState = 'LOADED' | 'READY' | 'FIRED' | 'RUNNING' | 'HIT' | 'MISSED' | 'EXPIRED';

/** Weather kinds (FR-17, GAME_DESIGN §9.1). */
export type WeatherKind = 'Clear' | 'Cloudy' | 'Storm' | 'Fog' | 'Night';

/** Score grade (FR-20, GAME_DESIGN §10). */
export type ScoreGrade = 'Perfect' | 'Excellent' | 'Good' | 'Poor' | 'Failed';

// ---------------------------------------------------------------------------
// Periscope (t-024) — optical observation mechanic (risk-for-reward)
// ---------------------------------------------------------------------------

/**
 * Periscope state machine (tick-driven, deterministic):
 *   SUBMERGED → SURFACING (auto-rise to Periscope layer) → RAISING → RAISED
 *   ⇄ OBSERVING (target in view) — LOWERING → SUBMERGED.
 */
export type PeriscopeState =
  'SUBMERGED' | 'SURFACING' | 'RAISING' | 'RAISED' | 'OBSERVING' | 'LOWERING';

/** Exposure bands derived from balance.periscope.exposureBandsS thresholds. */
export type ExposureBand = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Public periscope view (live in SystemContext, snapshot copy in GameSnapshot). */
export interface PeriscopePublicState {
  state: PeriscopeState;
  /** 0..1 — raising/lowering progress. */
  progress: number;
  /** Seconds the periscope has been up (RAISED/OBSERVING) — drives exposure. */
  raisedDurationS: number;
  /** 0..100 exposure accrued while raised. */
  exposure: number;
  exposureBand: ExposureBand;
  canRaise: boolean;
  cannotRaiseReason: 'tooDeep' | 'wrongLayer' | 'alreadyActive' | 'none';
  /** Contact id currently in the periscope view, or null. */
  observingContactId: string | null;
  /** Locked contact id (fire solution becomes VISUAL CONFIRMED), or null. */
  lockedContactId: string | null;
  /** Sub heading while raised — the view direction (north-up). */
  viewBearingDeg: number;
}

// ---------------------------------------------------------------------------
// Player submarine (FR-01..03, FR-13; GAME_ARCHITECTURE §6)
// ---------------------------------------------------------------------------

export interface TorpedoTube {
  id: string;
  state: TorpedoState;
  targetContactId: string | null;
}

export interface SubmarineState {
  /** km, x = east, y = north (north-up map). */
  position: { x: number; y: number };
  /** 0..360, north-up. */
  headingDeg: number;
  speedKt: number;
  speedBand: SpeedBand;
  /** Input target speed — continuous acceleration inside the band. */
  targetSpeedKt: number;
  depthLayer: DepthLayer;
  targetDepthLayer: DepthLayer;
  /** Remaining seconds of a depth-layer transition, or null when stable (3 s/layer, F2). */
  depthTransitionT: number | null;
  /** Live depth in metres (t-028): layer midpoint, interpolated during a
   *  transition between source and target layer midpoints. HUD/display only —
   *  all gameplay rules still use depthLayer. Optional for hand-built test
   *  fixtures; the engine always sets it and the HUD falls back to the layer
   *  midpoint. */
  depthM?: number;
  /** 0..100. */
  battery: number;
  /** 0..100 (speed/depth/hull modified, F1). */
  noise: number;
  /** 0..100. */
  hull: number;
  /** 0..100 detection meter (FR-12). */
  detection: number;
  silentRunning: boolean;
  sonarState: SonarState;
  /** Remaining active-ping cooldown in seconds (6 s). */
  pingCooldown: number;
  torpedoTubes: TorpedoTube[];
  /** Per mission (2). */
  decoyCount: number;
  /** Derived alarm bit: battery < 10. */
  lowBattery: boolean;
  /** Accumulated out-of-bounds seconds (60 s => mission fail). */
  outOfBoundsTimer: number;
}

// ---------------------------------------------------------------------------
// Contacts (FR-05/06) — the engine's "perceived view", always with error
// ---------------------------------------------------------------------------

export interface Contact {
  /** Stable id (e.g. 'C-01'), unchanged across ticks. */
  id: string;
  state: ContactState;
  /** Bearing relative to the player. */
  bearingDeg: number;
  /** null = bearing-only (passive never gives range, FR-06). */
  rangeKm: number | null;
  bearingErrorDeg: number;
  /** ±10% → ±2% convergence (FR-06). */
  rangeErrorFrac: number;
  /** Available from SUSPECTED onward. */
  speedEstimateKt: number | null;
  headingEstimateDeg: number | null;
  /** ±20% → ±5%. */
  speedErrorFrac: number;
  classification: ContactType;
  /** 0..100 type confidence. */
  classifyConfidence: number;
  /** 0..100 overall confidence. */
  confidence: number;
  signalStrength: 'Strong' | 'Medium' | 'Weak';
  /** simTime of last detection. */
  lastDetectedAt: number;
  lastPingAt: number;
  lastBearingAt: number;
  /** Observation count (classification/convergence basis). */
  observations: number;
  /** Internal link to the true ship; visible in snapshot but never shown by UI. */
  trueShipId: string | null;
  /**
   * Set when the periscope visually confirmed this target (t-024): the
   * contact then carries ground-truth type/speed/heading/range and the fire
   * solution is VISUAL CONFIRMED. Undefined (absent) for sonar-only contacts.
   */
  visuallyConfirmed?: boolean;
}

// ---------------------------------------------------------------------------
// Enemy public view (FR-09/10; GAME_ARCHITECTURE §6)
// ---------------------------------------------------------------------------

export interface EnemyShip {
  id: string;
  shipClass: ShipClass;
  position: { x: number; y: number };
  headingDeg: number;
  speedKt: number;
  hull: number;
  aiState: AiState;
  /** Escort LKP + drift error (F5); null when no LKP. */
  lkp: { x: number; y: number; errorKm: number } | null;
  /** Per mission (20). */
  depthChargesLeft: number;
  /** 4 s / 6 km (SUSPICIOUS) or 2 s (HUNTING). */
  activePingCooldown: number;
  inConvoy: boolean;
}

// ---------------------------------------------------------------------------
// Torpedo & decoy (FR-11/12; GAME_ARCHITECTURE §6)
// ---------------------------------------------------------------------------

export interface Torpedo {
  id: string;
  state: TorpedoState;
  position: { x: number; y: number };
  /** Fixed after launch — no homing (DD-04). */
  headingDeg: number;
  /** 40 kt. */
  speedKt: number;
  /** Lifetime 300 s. */
  ageS: number;
  /** Accumulated run distance (6 km cap). */
  distanceKm: number;
  /** Target at launch (settlement & events only). */
  targetShipId: string | null;
  targetContactId: string | null;
  firedAt: number;
  /** Closest-pass record (40/120 m hit/near-miss thresholds). */
  nearestPass: { distM: number; at: number } | null;
}

export interface Decoy {
  id: string;
  position: { x: number; y: number };
  /** Lifetime 20 s. */
  ageS: number;
  /** Fixed noise level 90 (value from balance.decoy.noiseLevel). */
  noise: number;
}

// ---------------------------------------------------------------------------
// Mission definitions (FR-15; GAME_ARCHITECTURE §6)
// ---------------------------------------------------------------------------

export interface SubgoalDef {
  id: string;
  weight: number;
  desc: string;
}

export interface ObjectiveDef {
  /**
   * Designed kinds (GAME_DESIGN §9.1): 'find' | 'classify' | 'track' |
   * 'sink' | 'sinkMin' | 'sinkAndEscape' | 'escape'. Left as string so the
   * missions module (t-008) owns the closed set.
   */
  kind: string;
  params?: Record<string, unknown>;
  subgoals?: SubgoalDef[];
}

export interface MissionDef {
  id: string;
  name: string;
  objective: ObjectiveDef;
  patrolArea: { km: number; gridM: number };
  fleet: {
    headingDeg: number;
    speedKt: number;
    /** Designed value '2x2'. */
    formation: string;
    colSpacingM: number;
    rowSpacingM: number;
    /** Designed value 'figure8'. */
    patrolBehavior: string;
  };
  spawns: { type: ShipClass; x: number; y: number; headingDeg: number }[];
  playerStart: { x: number; y: number; headingDeg: number };
  weather: WeatherKind;
  visibilityKm: number;
  torpedoCount: number;
  batteryStart: number;
  /** Par time in seconds (GAME_DESIGN §9.1). */
  parTimeS: number;
  /** 1..5. */
  difficulty: number;
  seed: number;
  /** Briefing countdown seconds; defaults to DEFAULT_BRIEFING_SECONDS when omitted. */
  briefingSeconds?: number;
}

/** Default briefing countdown (seconds) when MissionDef.briefingSeconds is omitted. */
export const DEFAULT_BRIEFING_SECONDS = 2;

// ---------------------------------------------------------------------------
// Snapshot supplements: mission status, scoring, stats (GAME_ARCHITECTURE §4/§6)
// ---------------------------------------------------------------------------

export interface MissionStatus {
  missionId: string;
  phase: 'briefing' | 'running' | 'complete' | 'failed';
  objectives: { id: string; desc: string; done: boolean; weight: number }[];
  /** F9. */
  escaped: boolean;
  forcedSurface: boolean;
}

export interface ScoreParts {
  objective: number;
  damage: number;
  stealth: number;
  torpedoEfficiency: number;
  time: number;
  survival: number;
  total: number;
  grade: ScoreGrade;
}

export interface MatchStats {
  torpedoesFired: number;
  torpedoesHit: number;
  peakDetection: number;
  elapsedS: number;
  torpedoesRemaining: number;
  /** All-time best for this mission; engine starts at 0 — shell/save layer overwrites. */
  bestScore: number;
}

// ---------------------------------------------------------------------------
// Events (FR-18; GAME_ARCHITECTURE §14 — catalogue is exhaustive)
// ---------------------------------------------------------------------------

export type EventType =
  | 'sonar.ping'
  | 'sonar.contact'
  | 'sonar.passive'
  | 'contact.detected'
  | 'contact.classified'
  | 'contact.degraded'
  | 'contact.lost'
  | 'torpedo.ready'
  | 'torpedo.fired'
  | 'torpedo.hit'
  | 'torpedo.missed'
  | 'torpedo.expired'
  | 'torpedo.fireRejected'
  | 'ship.sunk'
  | 'depthCharge.dropped'
  | 'depthCharge.detonated'
  | 'deckGun.fired'
  | 'sub.damaged'
  | 'sub.speedChanged'
  | 'sub.depthChanged'
  | 'sub.forcedSurface'
  | 'battery.low'
  | 'detection.threshold'
  | 'player.located'
  | 'decoy.launched'
  | 'escape.escaped'
  | 'mission.victory'
  | 'mission.defeat'
  | 'mission.complete'
  | 'ui.click'
  // t-024 periscope (appended — do not reorder existing members)
  | 'periscope.ready'
  | 'periscope.raising'
  | 'periscope.raised'
  | 'periscope.visualContact'
  | 'periscope.classified'
  | 'periscope.locked'
  | 'periscope.unlocked'
  | 'periscope.lowered'
  | 'periscope.cannotRaise'
  | 'periscope.exposure'
  | 'sub.emergencyDive';

export interface EventEntry {
  /** Monotonic, never reused within a game session. */
  id: number;
  /** simTime at emission; mm:ss formatting is a rendering concern. */
  simTime: number;
  type: EventType;
  /** Pure data only — never executable payloads (security, GAME_ARCHITECTURE §12). */
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Engine API (ADR-005; GAME_ARCHITECTURE §4 — exact field names)
// ---------------------------------------------------------------------------

export interface PlayerInputs {
  /** Target speed in kt (ADR-005 field name; UI may alias throttleKt). */
  throttle: number;
  /** -1..1, negative = port, positive = starboard; 0 = amidships. */
  rudder: number;
  /** Target depth layer (one of five). */
  depthLayerTarget: DepthLayer;
  silentRunning: boolean;
  /** Active-sonar ping request (edge: true→false counts as one). */
  ping: boolean;
  /** Target contactId; null = no launch; at most one handled per tick. */
  fireTorpedo: string | null;
  /** Decoy launch (edge). */
  decoy: boolean;
  /** Pause/resume toggle (edge). */
  pause: boolean;
  /**
   * t-024 periscope: raise/lower request (edge). Optional so legacy test
   * fixtures compile; the engine treats undefined as false and always
   * normalizes it into DEFAULT_INPUTS.
   */
  periscope?: boolean;
  /** Lock the observed target (edge). */
  lockTarget?: boolean;
  /** Emergency dive to Deep (edge): battery cost, instant lower (t-024). */
  emergencyDive?: boolean;
}

export interface GameSnapshot {
  /** Simulation seconds (fixed-step accumulation, never wall clock). */
  simTime: number;
  state: GameState;
  playerSub: SubmarineState;
  contacts: Contact[];
  enemies: EnemyShip[];
  torpedoes: Torpedo[];
  decoys: Decoy[];
  mission: MissionStatus;
  score: ScoreParts;
  /** Event log tail (ring buffer, last 50). */
  eventLog: EventEntry[];
  stats: MatchStats;
  /** Periscope public view (t-024). */
  periscope: PeriscopePublicState;
}
