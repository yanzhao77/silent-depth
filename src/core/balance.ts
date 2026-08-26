/**
 * SILENT DEPTH — typed balance loader (src/core/balance.ts)
 *
 * ADR-002 / NFR-5: every gameplay number lives in config/balance.json and is
 * read at runtime through this typed loader. NO hardcoded balance values in
 * engine code. `loadBalance()` validates the required keys and throws a clear
 * error when the config is incomplete or malformed.
 *
 * The interfaces below mirror config/balance.json 1:1 (GAME_DESIGN §12 B1-B10
 * + §15 F1-F10 are the authoritative design source).
 *
 * Task: t-003 core runtime (gameplay-engineer).
 *
 * @pure — zero DOM / browser-API references.
 */

import balanceJson from '../../config/balance.json';
import type {
  AiState,
  DepthLayer,
  ScoreGrade,
  SpeedBand,
  TorpedoState,
  WeatherKind,
} from './types';

// ---------------------------------------------------------------------------
// BalanceConfig — mirrors config/balance.json
// ---------------------------------------------------------------------------

export interface SpeedBandConfig {
  speedMinKt: number;
  speedMaxKt: number;
  noiseMin: number;
  noiseMax: number;
  batteryDrainPerSec: number;
  reverseMaxKt?: number;
}

export interface NoiseInterpConfig {
  bandBase: number;
  slopePerKt: number;
}

export interface RudderConfig {
  turnRateDegPerSec: number;
  turnRateDegPerSecFullSpeed: number;
  lowBatteryTurnRateFactor: number;
}

export interface DepthLayerConfig {
  minM: number;
  maxM: number;
  noiseMod: number;
  detectFactor: number;
  chargePerSec: number;
  torpedoAllowed: boolean;
  deckGunTargetable: boolean;
  dcDamageFactor: number;
  extraBatteryPerSec: number;
}

export interface BatteryConfig {
  capacity: number;
  pingCostPercent: number;
  silentRunningExtraPerSec: number;
  emergencyDiveCostPercent: number;
  decoyCostPercent: number;
  lowBatteryThreshold: number;
  lowBatteryMaxSpeedBand: SpeedBand;
  forcedSurfaceDetection: number;
  /** t-028f: fast recharge rate at Surface when speed ≤ surfaceFastChargeMaxBand. */
  surfaceFastChargePerSec: number;
  surfaceFastChargeMaxBand: SpeedBand;
}

export interface HullConfig {
  playerMax: number;
  damagedThreshold: number;
  damagedNoiseBonus: number;
  collisionDamageMin: number;
  collisionDamageMax: number;
  /** t-015: collision detection radius (km). */
  collisionDistKm: number;
  /** t-015: minimum seconds between collision damage events. */
  collisionCooldownS: number;
}

export interface DetectionConfig {
  bands: { max: number; label: string }[];
  sources: {
    activePing: number;
    torpedoFired: number;
    depthChargeHit: number;
    depthChargeNearMiss: number;
    enemyPingHit: number;
    deckGunHit: number;
  };
  sinks: {
    stoppedSilentPerSec: number;
    silentSilentPerSec: number;
    diveSurfaceToMedium: number;
    hardTurnDeg30Per10s: number;
    decoyLaunch: number;
    distancePerSec: number;
  };
  located: { graceSeconds: number; requiredBelow: number };
  noAutoDecay: boolean;
}

export interface SonarConfig {
  active: {
    rangeKm: number;
    cooldownSeconds: number;
    batteryPercent: number;
    selfExposureDetection: number;
    escortHearPingRangeKm: number;
    bearingErrorDeg: number;
    rangeErrorPctStart: number;
    rangeErrorPctPerPingFactor: number;
    bearingErrorPerPingFactor: number;
  };
  passive: {
    engineRangeKm: number;
    torpedoRangeKm: number;
    explosionRangeKm: number;
    bearingErrorDegStart: number;
    bearingErrorDegConverged: number;
    bearingConvergeSeconds: number;
    rangeNeverGiven: boolean;
  };
  signalStrength: { strongMaxKm: number; mediumMaxKm: number };
  contact: {
    decaySecondsWithoutObs: number;
    decayPer10sPct: number;
    degradeConfidence: number;
    removeUnknownSeconds: number;
    convergeSpeedHeadingPctStart: number;
    convergeSpeedHeadingPctTracked: number;
    convergePerObsFactor: number;
    errorExemptRangeKm: number;
  };
  classification: {
    passiveObsConfidenceGain: number;
    pingHitConfidenceGain: number;
    lockTypeConfidence: number;
    types: Record<
      string,
      { speedRangeKt: [number, number]; noiseRange: [number, number]; surfaceOnly: boolean }
    >;
  };
}

export interface ShipTypeConfig {
  speedKt: number | { patrol: number; attack: number };
  hull: number;
  passiveRangeKm: number;
  activePingRangeKm?: number;
  attack: string[] | null;
}

export interface EnemyAIConfig {
  states: AiState[];
  transitions: Record<string, string>;
  shipTypes: Record<string, ShipTypeConfig>;
  /** t-015: turn rates by role (°/s). */
  turnRates: { escort: number; merchant: number };
  /** t-015: acceleration toward target speed (kt/s). */
  accelKtPerS: number;
  /** t-015: SUSPICIOUS cruise speed cap (kt). */
  suspiciousSpeedCapKt: number;
  /** t-015: LOST_CONTACT cruise speed (kt). */
  lostContactSpeedKt: number;
  /** t-015: merchant ALERT behaviour duration (seconds). */
  merchantAlertSeconds: number;
  escort: {
    patrolRadiusKm: number;
    patrolPattern: string;
    patrolPeriodSeconds: number;
    offsetM: number;
    formation: { columns: number; rows: number; colSpacingM: number; rowSpacingM: number };
  };
  activePing: {
    suspiciousIntervalSeconds: number;
    huntingIntervalSeconds: number;
    heavyEscortIntervalSeconds: number;
    rangeKm: number;
    detectionGainOnPlayer: number;
    bearingErrorDeg: number;
  };
  depthCharges: {
    perRound: number;
    roundIntervalSeconds: number;
    volleyIntervalSeconds: number;
    perMission: number;
  };
  searchPatterns: {
    circular: {
      radiusStartKm: number;
      radiusMaxKm: number;
      radiusStepPerLapM: number;
      speedKt: number;
    };
    zigzag: { laneSpacingM: number; laneLengthKm: number; turnRadiusM: number };
    expanding: { radiusStepPer45DegM: number; startRadiusM: number };
  };
  lkp: {
    refreshSeconds: number;
    driftErrorM: number;
    driftMaxKm: number;
    decoyReplaceChance: number;
    decoyReplaceSeconds: number;
  };
  merchant: {
    evadeChanceOnTorpedo: number;
    evadeTurnDeg: number;
    evadeSeconds: number;
    alertSpeedKt: number;
    alertTurnDeg: number;
  };
}

export interface TorpedoConfig {
  countPerMissionMin: number;
  countPerMissionMax: number;
  speedKt: number;
  rangeKm: number;
  lifetimeSeconds: number;
  damageBase: number;
  damageSpread: number;
  hitDistanceM: number;
  nearMissDistanceM: number;
  selfNoiseHearRangeKm: number;
  salvoMax: number;
  states: TorpedoState[];
}

export interface HitProbabilityConfig {
  base: number;
  clampMin: number;
  clampMax: number;
  rangePen: { le2km: number; le4km: number; le6km: number };
  aobPen: { '90deg': number; '45deg': number; '20deg': number; '0deg': number };
  targetSpeedPen: { le5kt: number; '10kt': number; '15kt': number; '20ktPlus': number };
  confidencePen: { ge90: number; '70': number; '50': number; lt30: number };
  maneuverPen: Record<string, number>;
  resolve: { uniformSpread: number; hitThreshold: number };
}

export interface WeaponsConfig {
  depthCharge: {
    directDamage: number;
    nearMissDamage: number;
    farDamage: number;
    directM: number;
    nearM: number;
    farM: number;
    deepLayerFactor: number;
  };
  deckGun: {
    rangeKm: number;
    hitChanceAt0_5km: number;
    hitChanceAt2km: number;
    damageMin: number;
    damageMax: number;
    targets: DepthLayer[];
  };
}

export interface DecoyConfig {
  perMission: number;
  noiseLevel: number;
  durationSeconds: number;
  escortReplaceChance: number;
  replaceRangeKm: number;
  batteryCostPercent: number;
}

export interface WeatherConfig {
  visibilityKm: number;
  sonarFactor: number;
  noiseFactor: number;
  surfaceNoiseBonus?: number;
  /** Effective torpedo range multiplier per weather (t-021; default 1). */
  torpedoRangeFactor?: number;
}

// ---------------------------------------------------------------------------
// Periscope config (t-024)
// ---------------------------------------------------------------------------

export interface PeriscopeConfig {
  raiseTimeS: number;
  lowerTimeS: number;
  /** Lower duration used when the emergency-dive edge triggers the lower. */
  emergencyLowerTimeS: number;
  /** The depth layer the periscope can raise in ('Periscope'). */
  requiredLayer: DepthLayer;
  /** Auto-rise to requiredLayer when the raise command comes from deeper water. */
  autoSurface: boolean;
  /** Half-angle of the visual cone (degrees); target bearing must be within. */
  fovDeg: number;
  /** Max optical range, capped by the active weather visibility. */
  maxVisualRangeKm: number;
  /** Raised-duration thresholds for LOW→MEDIUM→HIGH→CRITICAL (seconds). */
  exposureBandsS: number[];
  /** Detection raise per second per exposure band (LOW..CRITICAL). */
  exposureDetectPerSec: number[];
  /** Confidence set on a visually confirmed contact. */
  observeConfidence: number;
  /** Residual range tolerance reported by the periscope (km). */
  observeRangeErrKm: number;
  /** Residual bearing tolerance reported by the periscope (deg). */
  observeBearingErrDeg: number;
  /** Extra detection added when firing a torpedo while the periscope is up. */
  torpedoFiredWhileRaisedBonus: number;
  /** Max range (km) at which a target can be locked. */
  lockMaxRangeKm: number;
}

export interface MissionConfig {
  id: string;
  name: string;
  objective: string;
  enemies: Record<string, number>;
  escorts: number;
  escortType?: string | string[];
  torpedoes: number;
  weather: string;
  visibility: string;
  difficulty: string;
  parMinutes: number;
  seed: number;
  unlock: string | null;
  escortPingIntervalSeconds?: number;
  escapeRequired?: boolean;
}

export interface ScoringConfig {
  total: number;
  weights: {
    objective: number;
    damage: number;
    detection: number;
    torpedoEfficiency: number;
    time: number;
    survival: number;
  };
  components: {
    objectiveMax: number;
    damageMax: number;
    detectionMax: number;
    torpedoEfficiencyMax: number;
    timeMax: number;
    survivalMax: number;
  };
  damageScores: Record<string, number>;
  expectedHits: Record<string, number>;
  grades: { min: number; label: ScoreGrade }[];
  m05EscapeBonus: number;
}

export interface EscapeConfig {
  detectionBelow: number;
  durationSeconds: number;
  minDistEscortKm: number;
  requiredInM05: boolean;
}

export interface BalanceConfig {
  version: number;
  authority: string;
  source: string;
  world: {
    mapSizeKm: number;
    gridM: number;
    outOfBoundsFailSeconds: number;
    maxGenRetries: number;
    playerSpawnMinDistKm: number;
    merchantSpawnSpreadKm: number;
    escortOffsetM: number;
  };
  speedBands: Record<SpeedBand, SpeedBandConfig>;
  noiseInterp: {
    STOPPED: number;
    SILENT: NoiseInterpConfig;
    CRUISE: NoiseInterpConfig;
    FULL: NoiseInterpConfig;
  };
  rudder: RudderConfig;
  /** t-015: player submarine movement parameters. */
  submarine: {
    /** Acceleration/deceleration toward target speed (kt/s). */
    accelKtPerS: number;
  };
  depthLayers: Record<DepthLayer, DepthLayerConfig>;
  depthTransitionSecondsPerLayer: number;
  battery: BatteryConfig;
  hull: HullConfig;
  detection: DetectionConfig;
  sonar: SonarConfig;
  enemyAI: EnemyAIConfig;
  torpedo: TorpedoConfig;
  hitProbability: HitProbabilityConfig;
  weapons: WeaponsConfig;
  decoy: DecoyConfig;
  periscope: PeriscopeConfig;
  weather: Record<WeatherKind, WeatherConfig>;
  detectionFormula: {
    escortBaseRate: number;
    merchantBaseRate: number;
    perSecond: string;
    distanceFactor: string;
  };
  missions: MissionConfig[];
  scoring: ScoringConfig;
  escape: EscapeConfig;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class BalanceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceConfigError';
  }
}

const REQUIRED_TOP_LEVEL_KEYS = [
  'version',
  'authority',
  'source',
  'world',
  'speedBands',
  'noiseInterp',
  'rudder',
  'depthLayers',
  'depthTransitionSecondsPerLayer',
  'battery',
  'hull',
  'detection',
  'sonar',
  'enemyAI',
  'torpedo',
  'hitProbability',
  'weapons',
  'decoy',
  'periscope',
  'weather',
  'detectionFormula',
  'missions',
  'scoring',
  'escape',
] as const;

/** Deep-check list: critical numbers the runtime reads (throttle clamp etc.). */
const REQUIRED_DEEP_NUMBERS: string[][] = [
  ['speedBands', 'SILENT', 'speedMaxKt'],
  ['speedBands', 'FULL', 'speedMaxKt'],
  ['speedBands', 'STOPPED', 'batteryDrainPerSec'],
  ['depthLayers', 'Surface', 'detectFactor'],
  ['depthLayers', 'Deep', 'dcDamageFactor'],
  ['depthTransitionSecondsPerLayer'],
  ['battery', 'lowBatteryThreshold'],
  ['battery', 'forcedSurfaceDetection'],
  ['battery', 'surfaceFastChargePerSec'],
  ['hull', 'playerMax'],
  ['detection', 'sources', 'activePing'],
  ['detection', 'located', 'graceSeconds'],
  ['sonar', 'active', 'rangeKm'],
  ['sonar', 'active', 'cooldownSeconds'],
  ['sonar', 'passive', 'engineRangeKm'],
  ['enemyAI', 'depthCharges', 'perMission'],
  ['enemyAI', 'activePing', 'rangeKm'],
  ['enemyAI', 'escort', 'patrolRadiusKm'],
  ['torpedo', 'speedKt'],
  ['torpedo', 'rangeKm'],
  ['torpedo', 'lifetimeSeconds'],
  ['torpedo', 'hitDistanceM'],
  ['weapons', 'depthCharge', 'directDamage'],
  ['weapons', 'deckGun', 'rangeKm'],
  ['decoy', 'perMission'],
  ['decoy', 'noiseLevel'],
  ['periscope', 'raiseTimeS'],
  ['periscope', 'lowerTimeS'],
  ['periscope', 'emergencyLowerTimeS'],
  ['periscope', 'maxVisualRangeKm'],
  ['periscope', 'observeConfidence'],
  ['weather', 'Clear', 'visibilityKm'],
  ['weather', 'Storm', 'sonarFactor'],
  ['detectionFormula', 'escortBaseRate'],
  ['scoring', 'total'],
  ['scoring', 'weights', 'objective'],
  ['escape', 'detectionBelow'],
];

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function assertDeepNumber(cfg: Record<string, unknown>, path: string[]): void {
  const value = readPath(cfg, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BalanceConfigError(
      `loadBalance: expected a finite number at "config/balance.json → ${path.join('.')}"`,
    );
  }
}

function assertDeepObject(cfg: Record<string, unknown>, path: string[]): void {
  const value = readPath(cfg, path);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BalanceConfigError(
      `loadBalance: expected an object at "config/balance.json → ${path.join('.')}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let cached: BalanceConfig | null = null;

/**
 * Load and validate the balance config. Throws BalanceConfigError with a
 * clear message when required keys are missing or malformed.
 *
 * @param source test hook: pass a raw object to validate instead of the real
 *               config/balance.json (the shipped file is the default).
 */
export function loadBalance(source: unknown = balanceJson): BalanceConfig {
  if (cached !== null && source === balanceJson) return cached;

  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new BalanceConfigError('loadBalance: config/balance.json must be a JSON object');
  }
  const cfg = source as Record<string, unknown>;

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in cfg)) {
      throw new BalanceConfigError(
        `loadBalance: missing required key "${key}" in config/balance.json`,
      );
    }
  }

  for (const path of REQUIRED_DEEP_NUMBERS) assertDeepNumber(cfg, path);
  assertDeepObject(cfg, ['enemyAI', 'shipTypes', 'Destroyer']);
  assertDeepObject(cfg, ['enemyAI', 'shipTypes', 'Merchant']);

  const missions = readPath(cfg, ['missions']);
  if (!Array.isArray(missions) || missions.length < 5) {
    throw new BalanceConfigError(
      'loadBalance: "missions" must be an array with at least 5 mission definitions',
    );
  }

  const balance = source as BalanceConfig;
  if (source === balanceJson) {
    // Freeze the shipped config so accidental mutation violates ADR-002 loudly.
    cached = deepFreeze(balance);
    return cached;
  }
  return balance;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
