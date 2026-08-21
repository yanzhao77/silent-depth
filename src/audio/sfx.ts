// SILENT DEPTH 《深海猎手》 — SFX parameter tables (t-012 · audio engineer)
// ---------------------------------------------------------------------------
// PURE DATA ONLY: no browser globals, no AudioContext, no side effects.
// This module is imported by tests in Node and must be importable anywhere.
// Authoritative spec: docs/AUDIO_DESIGN.md §3 (SFX), §4 (ambience), §5 (events).
// Builders that turn these tables into WebAudio node graphs live in audio.ts.
// ---------------------------------------------------------------------------

export type SfxName =
  | 'sonarPing'
  | 'sonarReturn'
  | 'passiveContact'
  | 'torpedoLaunch'
  | 'torpedoTravel'
  | 'torpedoHit'
  | 'explosion'
  | 'depthCharge'
  | 'engine'
  | 'hullCreak'
  | 'alarm'
  | 'uiClick'
  | 'missionSuccess'
  | 'missionFailed'

/** All 14 SFX shipped in v1 (requirement: ≥10 distinct). */
export const SFX_NAMES: readonly SfxName[] = [
  'sonarPing',
  'sonarReturn',
  'passiveContact',
  'torpedoLaunch',
  'torpedoTravel',
  'torpedoHit',
  'explosion',
  'depthCharge',
  'engine',
  'hullCreak',
  'alarm',
  'uiClick',
  'missionSuccess',
  'missionFailed',
]

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle'
export type NoiseColor = 'white' | 'pink' | 'brown'
export type FilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'allpass'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'

export const FILTER_TYPES: readonly FilterType[] = [
  'lowpass',
  'highpass',
  'bandpass',
  'notch',
  'allpass',
  'peaking',
  'lowshelf',
  'highshelf',
]

/** Speed bands of the player submarine (GAME_ARCHITECTURE §6). */
export type SpeedBandName = 'STOPPED' | 'SILENT' | 'CRUISE' | 'FULL'

/** Weather kinds (GAME_ARCHITECTURE §6) — ambience level varies by weather. */
export type WeatherKind = 'Clear' | 'Cloudy' | 'Storm' | 'Fog' | 'Night'

export interface FilterSpec {
  type: FilterType
  /** center/cutoff frequency in Hz (audio range). */
  frequency: number
  /** quality factor (bandwidth) for bandpass/notch/peaking. */
  q?: number
}

/**
 * One SFX parameter entry. Frequencies are audio-range Hz (20–4000),
 * durations are segment seconds (0.02–3), gains are linear 0–1.
 * Loop SFX (engine, torpedoTravel) carry no end duration — they run until
 * explicitly stopped; `bandGains` maps the engine loop gain per speed band.
 */
export interface SfxParams {
  name: SfxName
  /** short purpose string (AUDIO_DESIGN §3 "Purpose"). */
  description: string
  /** true = sustained loop (engine / torpedoTravel), false = one-shot. */
  loop: boolean
  /** primary oscillator waveform. */
  waveform?: WaveformType
  /** primary noise color. */
  noise?: NoiseColor
  /** secondary noise color (e.g. explosion crackle over brown body). */
  noise2?: NoiseColor
  /** oscillator / carrier frequencies in Hz (audio range, 20–4000). */
  frequencies: number[]
  /** segment durations in seconds (0.02–3); empty for loops. */
  durations: number[]
  /** linear gain values (0–1). */
  gains: number[]
  /** primary filter; null = no filter (bypass gain). */
  filter: FilterSpec | null
  /** optional secondary filter (e.g. crackle bandpass on explosion). */
  filter2?: FilterSpec | null
  /** non-audio modulation rate in Hz (e.g. torpedo churn LFO). */
  modRateHz?: number
  /** echo/delay time in seconds (sonarPing). */
  echoDelay?: number
  /** echo wet mix 0–1 (sonarPing subtle echo). */
  echoWet?: number
  /** engine loop gain per speed band (sub.speedChanged retarget). */
  bandGains?: Record<SpeedBandName, number>
}

// ---------------------------------------------------------------------------
// §3 SFX parameter table — one entry per AUDIO_DESIGN row (14 total).
// ---------------------------------------------------------------------------

export const SFX_PARAMS: Record<SfxName, SfxParams> = {
  sonarPing: {
    name: 'sonarPing',
    description: 'active ping outbound — short bright 1.2kHz blip with subtle echo',
    loop: false,
    waveform: 'sine',
    frequencies: [900, 1250],
    durations: [0.18, 0.35],
    gains: [0.6, 0.25],
    filter: { type: 'lowpass', frequency: 4000 },
    echoDelay: 0.35,
    echoWet: 0.25,
  },
  sonarReturn: {
    name: 'sonarReturn',
    description: 'echo return on contact — darker, distant blip (highpass 1kHz)',
    loop: false,
    waveform: 'sine',
    frequencies: [600],
    durations: [0.3, 0.5],
    gains: [0.4],
    filter: { type: 'highpass', frequency: 1000 },
  },
  passiveContact: {
    name: 'passiveContact',
    description: 'passive noise rise — low rumble swell (pink noise, slow attack)',
    loop: false,
    noise: 'pink',
    frequencies: [350],
    durations: [1.2, 0.4],
    gains: [0.3],
    filter: { type: 'bandpass', frequency: 350, q: 1.2 },
  },
  torpedoLaunch: {
    name: 'torpedoLaunch',
    description: 'compressed-air launch — whoosh + low thump',
    loop: false,
    waveform: 'sine',
    noise: 'white',
    frequencies: [300, 90],
    durations: [0.3, 0.08],
    gains: [0.5, 0.6],
    filter: { type: 'bandpass', frequency: 300, q: 0.8 },
  },
  torpedoTravel: {
    name: 'torpedoTravel',
    description: 'running torpedo loop — rhythmic churn (AM noise + 55Hz tone)',
    loop: true,
    waveform: 'triangle',
    noise: 'white',
    frequencies: [55, 800],
    durations: [],
    gains: [0.22, 0.1, 0.05],
    filter: { type: 'lowpass', frequency: 800 },
    modRateHz: 4,
  },
  torpedoHit: {
    name: 'torpedoHit',
    description: 'impact — loud thud + splash',
    loop: false,
    waveform: 'sine',
    noise: 'white',
    frequencies: [60, 1500],
    durations: [0.4, 0.5],
    gains: [0.9, 0.7],
    filter: { type: 'lowpass', frequency: 1500 },
  },
  explosion: {
    name: 'explosion',
    description: 'ship sunk — deep boom + brown noise body + crackle',
    loop: false,
    waveform: 'sine',
    noise: 'brown',
    noise2: 'white',
    frequencies: [45, 600, 2000],
    durations: [1.2, 1.5, 0.3],
    gains: [0.9, 0.8, 0.4],
    filter: { type: 'lowpass', frequency: 600 },
    filter2: { type: 'bandpass', frequency: 2000, q: 1.0 },
  },
  depthCharge: {
    name: 'depthCharge',
    description: 'enemy DC splash/detonation — two heavy underwater blasts',
    loop: false,
    waveform: 'sine',
    noise: 'brown',
    frequencies: [70, 400],
    durations: [0.4, 0.25, 1.0],
    gains: [0.7, 0.6],
    filter: { type: 'lowpass', frequency: 400 },
  },
  engine: {
    name: 'engine',
    description: 'own engine loop — steady thrum, gain retargeted by speed band',
    loop: true,
    waveform: 'sawtooth',
    frequencies: [48, 96, 300],
    durations: [],
    gains: [0.12],
    filter: { type: 'lowpass', frequency: 300 },
    bandGains: { STOPPED: 0, SILENT: 0.12, CRUISE: 0.45, FULL: 0.9 },
  },
  hullCreak: {
    name: 'hullCreak',
    description: 'pressure/stress — random slow sine glides, metallic groan',
    loop: false,
    waveform: 'sine',
    frequencies: [80, 140, 600],
    durations: [0.8],
    gains: [0.35],
    filter: { type: 'bandpass', frequency: 600, q: 1.5 },
  },
  alarm: {
    name: 'alarm',
    description: 'detection rising / low battery — urgent square beeps x3',
    loop: false,
    waveform: 'square',
    frequencies: [880, 1000],
    durations: [0.09, 0.54],
    gains: [0.4],
    filter: { type: 'highpass', frequency: 1000 },
  },
  uiClick: {
    name: 'uiClick',
    description: 'menu/button — short bright tick',
    loop: false,
    waveform: 'sine',
    frequencies: [1200],
    durations: [0.025],
    gains: [0.25],
    filter: null,
  },
  missionSuccess: {
    name: 'missionSuccess',
    description: 'victory sting — low warm major-ish rise + soft detuned pad',
    loop: false,
    waveform: 'sine',
    frequencies: [220, 330, 110, 165, 800],
    durations: [0.9, 2.0],
    gains: [0.3, 0.15],
    filter: { type: 'lowpass', frequency: 800 },
  },
  missionFailed: {
    name: 'missionFailed',
    description: 'defeat sting — cold minor descending line + dark low noise',
    loop: false,
    waveform: 'sine',
    noise: 'brown',
    frequencies: [330, 220, 165, 300],
    durations: [1.6],
    gains: [0.3, 0.12],
    filter: { type: 'lowpass', frequency: 300 },
  },
}

// ---------------------------------------------------------------------------
// §4 Ambience — ocean bed loop (filtered pink noise, very low gain).
// ---------------------------------------------------------------------------

export interface AmbienceParams {
  /** base linear gain ≈ -30 dB. */
  baseGain: number
  /** storm multiplier ≈ +1 dB. */
  stormBoost: number
  /** weathers in which the ocean bed is muted (fog/night atmosphere). */
  mutedWeather: readonly WeatherKind[]
  /** loop buffer length in seconds. */
  loopSeconds: number
  filter: FilterSpec
}

export const AMBIENCE_PARAMS: AmbienceParams = {
  baseGain: 0.0316, // ≈ 10^(-30/20) = -30 dB
  stormBoost: 1.122, // ≈ 10^(1/20) = +1 dB
  mutedWeather: ['Fog', 'Night'],
  loopSeconds: 4,
  filter: { type: 'lowpass', frequency: 200 },
}

// ---------------------------------------------------------------------------
// §5 Audio-event wiring (engine events → SFX). Pure data consumed by
// audio.ts `onEngineEvent`. Event names follow GAME_ARCHITECTURE §14
// catalogue; `torpedo.running` is the one AUDIO_DESIGN row with no matching
// catalogue event yet — kept defensively (see audio.ts comment).
// ---------------------------------------------------------------------------

export type EventSfxAction =
  | { kind: 'play'; sfx: SfxName; alsoStartLoop?: SfxName; stopLoop?: SfxName }
  | { kind: 'stopLoop'; sfx: SfxName }
  | { kind: 'retargetEngine' }
  | { kind: 'none' }

const EVENT_SFX_MAP_RAW = {
  'sonar.ping': { kind: 'play', sfx: 'sonarPing' },
  'sonar.contact': { kind: 'play', sfx: 'sonarReturn' },
  'sonar.passive': { kind: 'play', sfx: 'passiveContact' },
  'torpedo.fired': { kind: 'play', sfx: 'torpedoLaunch', alsoStartLoop: 'torpedoTravel' },
  // AUDIO_DESIGN §5 lists torpedo.running → torpedoTravel; GAME_ARCHITECTURE §14
  // has no torpedo.running event yet (torpedo states drive fired/hit/missed/
  // expired). Mapped defensively so it works either way.
  'torpedo.running': { kind: 'play', sfx: 'torpedoTravel' },
  'torpedo.hit': { kind: 'play', sfx: 'torpedoHit', stopLoop: 'torpedoTravel' },
  'torpedo.missed': { kind: 'stopLoop', sfx: 'torpedoTravel' },
  'torpedo.expired': { kind: 'stopLoop', sfx: 'torpedoTravel' },
  'ship.sunk': { kind: 'play', sfx: 'explosion' },
  'depthCharge.detonated': { kind: 'play', sfx: 'depthCharge' },
  'depthCharge.dropped': { kind: 'play', sfx: 'depthCharge' },
  'sub.speedChanged': { kind: 'retargetEngine' },
  'sub.damaged': { kind: 'play', sfx: 'hullCreak' },
  'sub.depthChanged': { kind: 'play', sfx: 'hullCreak' },
  'sub.forcedSurface': { kind: 'play', sfx: 'alarm' },
  'battery.low': { kind: 'play', sfx: 'alarm' },
  // Alarm only ≥60 (GAME_ARCHITECTURE §14: "alarm (≥60)") — gate in audio.ts.
  'detection.threshold': { kind: 'play', sfx: 'alarm' },
  'player.located': { kind: 'play', sfx: 'alarm' },
  // §14 reuses the launch SFX for decoys.
  'decoy.launched': { kind: 'play', sfx: 'torpedoLaunch' },
  'ui.click': { kind: 'play', sfx: 'uiClick' },
  'mission.victory': { kind: 'play', sfx: 'missionSuccess' },
  'mission.defeat': { kind: 'play', sfx: 'missionFailed' },
} as const satisfies Readonly<Record<string, EventSfxAction>>

/** Runtime event→action map (widened for index access by audio.ts). */
export const EVENT_SFX_MAP: Readonly<Record<string, EventSfxAction>> = EVENT_SFX_MAP_RAW

/** Literal union of every mapped engine event name (compile-time checks). */
export type EventSfxMapKeys = keyof typeof EVENT_SFX_MAP_RAW
