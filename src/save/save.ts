/**
 * SILENT DEPTH — save / load & settings (src/save/save.ts)
 *
 * GAME_ARCHITECTURE §9 (FR-19): localStorage JSON schema v1, key
 * 'silent-depth:save:v1'. The engine never touches storage — this module is
 * the browser-shell boundary. Node-safe: storage is injected (tests pass a
 * fake StorageLike); with a null store every operation is a warned no-op.
 *
 * Schema (version 1):
 *   {
 *     "version": 1,
 *     "unlockedMissions": ["M01", ...],            // sequential unlock chain
 *     "bestScores": { "M01": 850, ... },
 *     "statistics": { missionsCompleted, torpedoesFired, torpedoesHit,
 *                     peakDetectionSum, totalPlayTimeS, shipsSunk {class: n} },
 *     "settings": { audio {master/music/sfxVolume}, video {showFps,
 *                   particles, mapGrid}, input {sensitivity} }
 *   }
 *
 * Security (GAME_ARCHITECTURE §12): localStorage content is UNTRUSTED input —
 * load() runs validateAndClamp() (schema check + numeric clamps + whitelisted
 * ids); any corruption falls back to the default save (never crashes). Export
 * downloads a JSON Blob; import reads via FileReader and re-validates. No
 * innerHTML, no eval, no executable payloads.
 *
 * DESIGN DECISIONS:
 *  - Settings defaults mirror config/settings.json (the architecture says the
 *    saved settings block is "与 config/settings.json 同构").
 *  - updateOnMissionResult() returns a NEW save object (functional update);
 *    the shell writes it via store.write(). The next mission unlocks only on
 *    victory; bestScore is a max; statistics accumulate.
 *  - Clamp ranges: volumes/sensitivity from settings.json semantics (0..1,
 *    0.1..5), percentages 0..100, elapsed >= 0, counts >= 0.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — zero DOM at module scope; Blob/URL/FileReader guarded at
 * call sites. Importable in Node for unit tests.
 */

import settingsJson from '../../config/settings.json';
import type { ScoreGrade, ShipClass } from '../core/types';
import { isLang, type Lang } from '../ui/i18n';

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'silent-depth:save:v1';

/** Known ship classes (statistics.shipsSunk whitelist — types.ts union). */
export const SHIP_CLASSES: readonly ShipClass[] = [
  'Merchant',
  'Cargo',
  'Tanker',
  'Destroyer',
  'Frigate',
  'Submarine',
];

export interface SaveSettings {
  audio: { masterVolume: number; musicVolume: number; sfxVolume: number };
  video: { showFps: boolean; particles: 'normal' | 'low' | 'off'; mapGrid: boolean };
  input: { sensitivity: number };
  /** UI language (t-022 i18n; 'en' default). */
  app: { language: Lang };
}

export interface SaveStatistics {
  missionsCompleted: number;
  torpedoesFired: number;
  torpedoesHit: number;
  peakDetectionSum: number;
  totalPlayTimeS: number;
  /** Ships sunk by class (statistics aggregation across missions). */
  shipsSunk: Record<string, number>;
}

export interface SaveData {
  version: number;
  unlockedMissions: string[];
  bestScores: Record<string, number>;
  statistics: SaveStatistics;
  settings: SaveSettings;
}

/** Storage abstraction — localStorage in the browser, fake in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Mission result payload for the MISSION_RESULT settlement hook. */
export interface MissionResult {
  missionId: string;
  /** true = victory (unlocks the next mission). */
  completed: boolean;
  score: number;
  grade: ScoreGrade;
  torpedoesFired: number;
  torpedoesHit: number;
  peakDetection: number;
  elapsedS: number;
  shipsSunk: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS_RAW = settingsJson as unknown as SaveSettings;

/** Clamp helper (NaN → fallback). */
function clamp(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function clampSettings(raw: unknown): SaveSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const audio = (r['audio'] ?? {}) as Record<string, unknown>;
  const video = (r['video'] ?? {}) as Record<string, unknown>;
  const input = (r['input'] ?? {}) as Record<string, unknown>;
  const app = (r['app'] ?? {}) as Record<string, unknown>;
  const particles = video['particles'];
  const lang = app['language'];
  return {
    audio: {
      masterVolume: clamp(audio['masterVolume'], 0, 1, DEFAULT_SETTINGS_RAW.audio.masterVolume),
      musicVolume: clamp(audio['musicVolume'], 0, 1, DEFAULT_SETTINGS_RAW.audio.musicVolume),
      sfxVolume: clamp(audio['sfxVolume'], 0, 1, DEFAULT_SETTINGS_RAW.audio.sfxVolume),
    },
    video: {
      showFps: bool(video['showFps'], DEFAULT_SETTINGS_RAW.video.showFps),
      particles:
        particles === 'low' || particles === 'off' || particles === 'normal'
          ? particles
          : DEFAULT_SETTINGS_RAW.video.particles,
      mapGrid: bool(video['mapGrid'], DEFAULT_SETTINGS_RAW.video.mapGrid),
    },
    input: {
      sensitivity: clamp(input['sensitivity'], 0.1, 5, DEFAULT_SETTINGS_RAW.input.sensitivity),
    },
    app: {
      // t-022: language whitelist — unknown values fall back to the default.
      language: isLang(lang) ? lang : DEFAULT_SETTINGS_RAW.app.language,
    },
  };
}

/**
 * Build the default save (M01 unlocked, zeroed stats, settings.json defaults).
 */
export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedMissions: ['M01'],
    bestScores: {},
    statistics: {
      missionsCompleted: 0,
      torpedoesFired: 0,
      torpedoesHit: 0,
      peakDetectionSum: 0,
      totalPlayTimeS: 0,
      shipsSunk: {},
    },
    settings: clampSettings(undefined),
  };
}

/**
 * Validate and normalize untrusted raw JSON into a SaveData.
 * Any malformed section falls back to its default — never throws
 * (GAME_ARCHITECTURE §9: "读入时 schema 校验失败 → 丢弃并重建默认 (不崩溃)").
 *
 * @param raw parsed JSON (any shape)
 * @param knownMissionIds whitelist for unlockedMissions / bestScores keys
 */
export function validateAndClamp(raw: unknown, knownMissionIds: readonly string[]): SaveData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaultSave();
  const r = raw as Record<string, unknown>;

  // Version gate: only v1 is understood (future versions migrate → for now
  // they reset, per GAME_ARCHITECTURE §9 "version 迁移钩子" placeholder).
  if (r['version'] !== SAVE_VERSION) return defaultSave();

  const idSet = new Set(knownMissionIds);

  // unlockedMissions — whitelisted, unique, M01 always present.
  const unlockedRaw = Array.isArray(r['unlockedMissions']) ? r['unlockedMissions'] : [];
  const unlocked: string[] = [];
  for (const id of unlockedRaw) {
    if (typeof id === 'string' && idSet.has(id) && !unlocked.includes(id)) unlocked.push(id);
  }
  if (!unlocked.includes('M01')) unlocked.unshift('M01');

  // bestScores — string keys (whitelisted), numeric values clamped >= 0.
  const bestScores: Record<string, number> = {};
  const bs = r['bestScores'];
  if (bs !== null && typeof bs === 'object' && !Array.isArray(bs)) {
    for (const [id, score] of Object.entries(bs as Record<string, unknown>)) {
      if (idSet.has(id)) bestScores[id] = clamp(score, 0, 1_000_000, 0);
    }
  }

  // statistics — clamp all numbers; shipsSunk keyed by known class.
  const statsRaw = (r['statistics'] ?? {}) as Record<string, unknown>;
  const shipsRaw = (statsRaw['shipsSunk'] ?? {}) as Record<string, unknown>;
  const shipsSunk: Record<string, number> = {};
  for (const cls of SHIP_CLASSES) {
    const n = shipsRaw[cls];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) shipsSunk[cls] = Math.floor(n);
  }
  const statistics: SaveStatistics = {
    missionsCompleted: Math.floor(clamp(statsRaw['missionsCompleted'], 0, 1_000_000, 0)),
    torpedoesFired: Math.floor(clamp(statsRaw['torpedoesFired'], 0, 1_000_000, 0)),
    torpedoesHit: Math.floor(clamp(statsRaw['torpedoesHit'], 0, 1_000_000, 0)),
    peakDetectionSum: Math.floor(clamp(statsRaw['peakDetectionSum'], 0, 1_000_000_000, 0)),
    totalPlayTimeS: Math.floor(clamp(statsRaw['totalPlayTimeS'], 0, 1_000_000_000, 0)),
    shipsSunk,
  };

  return {
    version: SAVE_VERSION,
    unlockedMissions: unlocked,
    bestScores,
    statistics,
    settings: clampSettings(r['settings']),
  };
}

// ---------------------------------------------------------------------------
// Store (injected storage)
// ---------------------------------------------------------------------------

export interface SaveStore {
  /** Load + validate the save (corrupt → default). Never throws. */
  load(): SaveData;
  /** JSON.stringify + version check, then write. */
  write(save: SaveData): void;
  /** Remove the storage key ("清除存档"). */
  reset(): void;
  /** Export as a JSON Blob download (guarded no-op headless). */
  export(save: SaveData): void;
  /** Import from a JSON File (FileReader + validation). */
  import(file: File, onDone: (save: SaveData) => void): void;
}

let warnedNoStorage = false;

function warnNoStorage(): void {
  if (!warnedNoStorage) {
    warnedNoStorage = true;
    console.warn('[save] No storage backend available (headless / Node) — save is a no-op.');
  }
}

/**
 * Create a save store over an injected storage backend.
 *
 * @param storage localStorage in the browser; a fake for tests; null = no-op.
 * @param key storage key (default SAVE_KEY).
 */
export function createSaveStore(storage: StorageLike | null, key: string = SAVE_KEY): SaveStore {
  const hasStorage = storage !== null;

  function load(): SaveData {
    if (!hasStorage) {
      warnNoStorage();
      return defaultSave();
    }
    try {
      const rawText = storage.getItem(key);
      if (rawText === null) return defaultSave();
      const parsed: unknown = JSON.parse(rawText);
      return validateAndClamp(parsed, SAVE_KNOWN_MISSION_IDS);
    } catch {
      // Corrupt JSON / quota errors → default (never crash).
      return defaultSave();
    }
  }

  function write(save: SaveData): void {
    if (!hasStorage) {
      warnNoStorage();
      return;
    }
    const normalized = validateAndClamp(save, SAVE_KNOWN_MISSION_IDS);
    try {
      storage.setItem(key, JSON.stringify(normalized));
    } catch {
      console.warn('[save] write failed (quota / private mode) — ignored.');
    }
  }

  function reset(): void {
    if (!hasStorage) {
      warnNoStorage();
      return;
    }
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function exportSave(save: SaveData): void {
    if (
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof document === 'undefined' ||
      typeof document.createElement !== 'function'
    ) {
      warnNoStorage();
      return;
    }
    const blob = new Blob(
      [JSON.stringify(validateAndClamp(save, SAVE_KNOWN_MISSION_IDS), null, 2)],
      {
        type: 'application/json',
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${key}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSave(file: File, onDone: (save: SaveData) => void): void {
    if (typeof FileReader === 'undefined') {
      warnNoStorage();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        onDone(validateAndClamp(parsed, SAVE_KNOWN_MISSION_IDS));
      } catch {
        onDone(defaultSave());
      }
    };
    reader.onerror = () => onDone(defaultSave());
    reader.readAsText(file);
  }

  return { load, write, reset, export: exportSave, import: importSave };
}

/**
 * Mission-result settlement (GAME_ARCHITECTURE §9 write triggers). Pure —
 * returns a NEW save; the shell persists it with store.write().
 * Unlock chain: completing mission at index i adds missionIds[i+1].
 */
export function updateOnMissionResult(
  save: SaveData,
  result: MissionResult,
  missionIds: readonly string[],
): SaveData {
  const next: SaveData = {
    ...save,
    unlockedMissions: [...save.unlockedMissions],
    bestScores: { ...save.bestScores },
    statistics: {
      ...save.statistics,
      shipsSunk: { ...save.statistics.shipsSunk },
    },
    settings: save.settings,
  };

  const prevBest = next.bestScores[result.missionId] ?? 0;
  if (result.score > prevBest) next.bestScores[result.missionId] = Math.floor(result.score);

  if (result.completed) {
    const idx = missionIds.indexOf(result.missionId);
    if (idx >= 0 && idx < missionIds.length - 1) {
      const nextId = missionIds[idx + 1]!;
      if (!next.unlockedMissions.includes(nextId)) next.unlockedMissions.push(nextId);
    }
    next.statistics.missionsCompleted += 1;
  }

  next.statistics.torpedoesFired += Math.max(0, Math.floor(result.torpedoesFired));
  next.statistics.torpedoesHit += Math.max(0, Math.floor(result.torpedoesHit));
  next.statistics.peakDetectionSum += Math.max(0, Math.floor(result.peakDetection));
  next.statistics.totalPlayTimeS += Math.max(0, Math.floor(result.elapsedS));
  for (const [cls, n] of Object.entries(result.shipsSunk)) {
    if (typeof n === 'number' && n > 0) {
      next.statistics.shipsSunk[cls] = (next.statistics.shipsSunk[cls] ?? 0) + Math.floor(n);
    }
  }

  return next;
}

/**
 * Known mission ids (unlock/bestScores whitelist). Populated by main.ts at
 * boot (imports missions.ts); the fallback keeps the module importable and
 * lets createSaveStore work before the mission table loads (validation then
 * accepts only ids present in this set — an empty set means only M01 stays).
 */
let SAVE_KNOWN_MISSION_IDS: readonly string[] = ['M01'];

/** Set the mission-id whitelist (called once at boot by the shell). */
export function setKnownMissionIds(ids: readonly string[]): void {
  SAVE_KNOWN_MISSION_IDS = ids.length > 0 ? [...ids] : ['M01'];
}
