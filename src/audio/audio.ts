// SILENT DEPTH 《深海猎手》 — procedural audio engine (t-012 · audio engineer)
// ---------------------------------------------------------------------------
// FR-22 · docs/AUDIO_DESIGN.md v1 (§2 master chain, §3 SFX, §4 ambience, §5
// event wiring) · GAME_ARCHITECTURE.md §3/§12/§14.
//
// - Zero external samples: every SFX is synthesized from oscillators + noise +
//   filters + envelopes. Fully offline, no downloads, no new dependencies.
// - Headless-safe: `AudioContext` is only ever touched inside ensureCtx(),
//   reached from play()/onEngineEvent()/setVolume() — NEVER at module top
//   level. Importing this module in Node must not crash; play() is a guarded
//   no-op there (console.warn once, see `warnedNoAudioCtx`).
// - Master chain: masterGain → compressor(threshold -18dB, ratio 3) → dest;
//   SFX routed via shared sfxBus; ambience/atmosphere via musicBus.
// - All 14 builders are pure functions (ctx, params) → playable node graph.
// ---------------------------------------------------------------------------
import {
  AMBIENCE_PARAMS,
  EVENT_SFX_MAP,
  SFX_PARAMS,
} from './sfx'
import type {
  AmbienceParams,
  EventSfxAction,
  FilterSpec,
  NoiseColor,
  SfxName,
  SfxParams,
  SpeedBandName,
  WaveformType,
  WeatherKind,
} from './sfx'

// ---------------------------------------------------------------------------
// Types / public contract
// ---------------------------------------------------------------------------

export interface AudioSettings {
  audio?: { masterVolume?: number; musicVolume?: number; sfxVolume?: number }
}

/** Engine event consumed by the audio layer (shape of src/core EventEntry). */
export interface EngineEvent {
  type: string
  payload?: Record<string, unknown>
}

export type VolumeChannel = 'master' | 'sfx' | 'music'

/** A playable WebAudio node graph returned by every SFX builder. */
export interface AudioGraph {
  output: AudioNode
  start(when?: number): void
  stop(when?: number): void
  dispose(): void
  /** retargetable gain (engine loop / ambience level). */
  gainParam?: AudioParam
}

export type SfxBuilder = (ctx: AudioContext, params: SfxParams) => AudioGraph

export interface AudioEngine {
  /** true when the current runtime exposes an AudioContext constructor. */
  readonly available: boolean
  /** Play a one-shot SFX or (re)start a loop SFX (idempotent). No-op headless. */
  play(name: SfxName): void
  /** Stop a running loop SFX (engine / torpedoTravel). */
  stop(name: SfxName): void
  /** master / sfx / music volume, 0..1 (settings.json audio.*). */
  setVolume(channel: VolumeChannel, v: number): void
  /** Map an engine event to SFX per AUDIO_DESIGN §5. */
  onEngineEvent(ev: EngineEvent): void
  /** Set mission weather; adjusts ambience level (AUDIO_DESIGN §4). */
  setWeather(kind: string): void
  /** Stop everything, disconnect nodes, close the AudioContext. */
  dispose(): void
}

// ---------------------------------------------------------------------------
// Guarded AudioContext access (no browser globals at module top level)
// ---------------------------------------------------------------------------

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof globalThis === 'undefined') return null
  const g = globalThis as unknown as Record<string, unknown>
  const ctor = (g['AudioContext'] ?? g['webkitAudioContext']) as unknown
  return typeof ctor === 'function' ? (ctor as new () => AudioContext) : null
}

/** One global warning when audio is unavailable (headless / non-browser). */
let warnedNoAudioCtx = false

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function p(nums: readonly number[], i: number, dflt: number): number {
  return nums[i] ?? dflt
}

/** Fill a Float32Array with white/pink/brown noise (Paul Kellet pink). */
function fillNoise(data: Float32Array, color: NoiseColor): void {
  if (color === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return
  }
  if (color === 'brown') {
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      data[i] = last * 3.5
    }
    return
  }
  // pink — Paul Kellet economy filter
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}

/** Looping (optional) noise buffer source. */
function noiseSource(ctx: AudioContext, color: NoiseColor, seconds: number): AudioBufferSourceNode {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  fillNoise(buffer.getChannelData(0), color)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  return src
}

function makeFilter(ctx: AudioContext, spec: FilterSpec): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = spec.type as BiquadFilterType
  f.frequency.value = spec.frequency
  if (spec.q !== undefined) f.Q.value = spec.q
  return f
}

/** Filter node, or a unity gain bypass when spec is null. */
function filterOrBypass(ctx: AudioContext, spec: FilterSpec | null | undefined): AudioNode {
  if (spec) return makeFilter(ctx, spec)
  const g = ctx.createGain()
  g.gain.value = 1
  return g
}

/**
 * Envelope: fast attack to `peak`, hold, exponential release to silence.
 * `peak` is linear 0..1; exponential ramps never hit exactly 0 (WebAudio).
 */
function makeEnv(
  ctx: AudioContext,
  t0: number,
  peak: number,
  attack: number,
  release: number,
  dur: number,
): GainNode {
  const g = ctx.createGain()
  const peakV = Math.max(clamp01(peak), 0.0001)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peakV, t0 + attack)
  const releaseStart = Math.min(t0 + dur - release, t0 + attack + 0.001)
  g.gain.setValueAtTime(peakV, releaseStart)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  return g
}

/** Dry + delayed wet mix for the sonarPing subtle echo. */
function echoChain(ctx: AudioContext, input: AudioNode, delaySec: number, wet: number): GainNode {
  const out = ctx.createGain()
  input.connect(out) // dry
  const delay = ctx.createDelay(2)
  delay.delayTime.value = delaySec
  const wetGain = ctx.createGain()
  wetGain.gain.value = clamp01(wet)
  input.connect(delay)
  delay.connect(wetGain)
  wetGain.connect(out)
  return out
}

interface GraphOpts {
  /** per-source start offset in seconds (staggered one-shots). */
  delays?: number[]
  gainParam?: AudioParam
}

function makeGraph(
  ctx: AudioContext,
  sources: AudioScheduledSourceNode[],
  output: AudioNode,
  opts?: GraphOpts,
): AudioGraph {
  const start = (when: number = ctx.currentTime): void => {
    sources.forEach((s, i) => {
      try {
        s.start(when + (opts?.delays?.[i] ?? 0))
      } catch {
        // already started (staggered sources started at build time) — ignore
      }
    })
  }
  const stop = (when: number = ctx.currentTime + 0.05): void => {
    sources.forEach((s) => {
      try {
        s.stop(when)
      } catch {
        // already stopped — ignore
      }
    })
  }
  const dispose = (): void => {
    sources.forEach((s) => {
      try {
        s.stop()
      } catch {
        // already stopped
      }
      try {
        s.disconnect()
      } catch {
        // already disconnected
      }
    })
    try {
      output.disconnect()
    } catch {
      // already disconnected
    }
  }
  const graph: AudioGraph = { output, start, stop, dispose }
  if (opts?.gainParam) graph.gainParam = opts.gainParam
  return graph
}

// ---------------------------------------------------------------------------
// §3 SFX builders — all 14, pure (ctx, params) → playable node graph.
// Note on determinism (ADR-004): the simulation engine must be seeded-RNG
// deterministic, but the audio shell is renderer-side (like particles) and may
// use Math.random — it never feeds back into the engine.
// ---------------------------------------------------------------------------

export function buildSonarPing(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const f0 = p(params.frequencies, 0, 900)
  const f1 = p(params.frequencies, 1, 1250)
  const rampS = p(params.durations, 0, 0.18)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f0, t0)
  osc.frequency.linearRampToValueAtTime(f1, t0 + rampS)
  const env = makeEnv(ctx, t0, p(params.gains, 0, 0.6), 0.01, 0.1, rampS)
  osc.connect(env)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 4kHz
  env.connect(lp)
  const out = echoChain(ctx, lp, params.echoDelay ?? 0.35, params.echoWet ?? 0.25)
  return makeGraph(ctx, [osc], out)
}

export function buildSonarReturn(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const dur = p(params.durations, 0, 0.3)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(p(params.frequencies, 0, 600), t0)
  const env = makeEnv(ctx, t0, p(params.gains, 0, 0.4), 0.02, 0.12, dur)
  osc.connect(env)
  const hp = filterOrBypass(ctx, params.filter) // highpass 1kHz — distant
  env.connect(hp)
  // DESIGN DECISION: AUDIO_DESIGN says "0.5s delay from ping"; the engine emits
  // sonar.contact ~0.5s after sonar.ping, so the return is played immediately
  // on the contact event — the offset is provided by event timing, not audio.
  return makeGraph(ctx, [osc], hp)
}

export function buildPassiveContact(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const dur = p(params.durations, 0, 1.2)
  const attack = p(params.durations, 1, 0.4)
  const src = noiseSource(ctx, params.noise ?? 'pink', dur + 0.3)
  const bp = filterOrBypass(ctx, params.filter) // bandpass 200–500Hz
  src.connect(bp)
  const env = makeEnv(ctx, t0, p(params.gains, 0, 0.3), attack, 0.2, dur)
  bp.connect(env)
  return makeGraph(ctx, [src], env)
}

export function buildTorpedoLaunch(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const whoosh = noiseSource(ctx, params.noise ?? 'white', 0.4)
  const bp = filterOrBypass(ctx, params.filter) // bandpass 300Hz
  whoosh.connect(bp)
  const whooshEnv = makeEnv(ctx, t0, p(params.gains, 0, 0.5), 0.01, 0.1, p(params.durations, 0, 0.3))
  bp.connect(whooshEnv)
  const thump = ctx.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(p(params.frequencies, 1, 90), t0)
  const thumpEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.6), 0.005, 0.04, p(params.durations, 1, 0.08))
  thump.connect(thumpEnv)
  const out = ctx.createGain()
  whooshEnv.connect(out)
  thumpEnv.connect(out)
  return makeGraph(ctx, [whoosh, thump], out)
}

export function buildTorpedoTravel(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  // rhythmic churn: white noise, lowpass 800Hz, amplitude modulated by a 4Hz LFO
  const src = noiseSource(ctx, params.noise ?? 'white', 2)
  src.loop = true
  const lp = filterOrBypass(ctx, params.filter)
  src.connect(lp)
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = p(params.gains, 0, 0.22)
  lp.connect(noiseGain)
  const lfo = ctx.createOscillator()
  lfo.type = 'triangle'
  lfo.frequency.value = params.modRateHz ?? 4
  const lfoScale = ctx.createGain()
  lfoScale.gain.value = p(params.gains, 1, 0.1)
  lfo.connect(lfoScale)
  lfoScale.connect(noiseGain.gain)
  // faint 55Hz propeller tone under the churn
  const tone = ctx.createOscillator()
  tone.type = 'triangle'
  tone.frequency.setValueAtTime(p(params.frequencies, 0, 55), t0)
  const toneGain = ctx.createGain()
  toneGain.gain.value = p(params.gains, 2, 0.05)
  tone.connect(toneGain)
  const out = ctx.createGain()
  noiseGain.connect(out)
  toneGain.connect(out)
  return makeGraph(ctx, [src, lfo, tone], out)
}

export function buildTorpedoHit(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const thud = ctx.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(p(params.frequencies, 0, 60), t0)
  const thudEnv = makeEnv(ctx, t0, p(params.gains, 0, 0.9), 0.005, 0.15, p(params.durations, 0, 0.4))
  thud.connect(thudEnv)
  const splash = noiseSource(ctx, params.noise ?? 'white', 0.6)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 1.5kHz
  splash.connect(lp)
  const splashEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.7), 0.01, 0.15, p(params.durations, 1, 0.5))
  lp.connect(splashEnv)
  const out = ctx.createGain()
  thudEnv.connect(out)
  splashEnv.connect(out)
  return makeGraph(ctx, [thud, splash], out)
}

export function buildExplosion(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const boom = ctx.createOscillator()
  boom.type = 'sine'
  boom.frequency.setValueAtTime(p(params.frequencies, 0, 45), t0)
  const boomEnv = makeEnv(ctx, t0, p(params.gains, 0, 0.9), 0.01, 0.5, p(params.durations, 0, 1.2))
  boom.connect(boomEnv)
  const body = noiseSource(ctx, params.noise ?? 'brown', 1.7)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 600Hz
  body.connect(lp)
  const bodyEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.8), 0.02, 0.6, p(params.durations, 1, 1.5))
  lp.connect(bodyEnv)
  const crackle = noiseSource(ctx, params.noise2 ?? 'white', 0.4)
  const bp = filterOrBypass(ctx, params.filter2) // bandpass 2kHz crackle
  crackle.connect(bp)
  const crackleEnv = makeEnv(ctx, t0, p(params.gains, 2, 0.4), 0.005, 0.1, p(params.durations, 2, 0.3))
  bp.connect(crackleEnv)
  const out = ctx.createGain()
  boomEnv.connect(out)
  bodyEnv.connect(out)
  crackleEnv.connect(out)
  return makeGraph(ctx, [boom, body, crackle], out)
}

export function buildDepthCharge(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const stagger = p(params.durations, 0, 0.4)
  const thumpDur = p(params.durations, 1, 0.25)
  const thumpPeak = p(params.gains, 0, 0.7)
  const makeThump = (at: number): { osc: OscillatorNode; env: GainNode } => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(p(params.frequencies, 0, 70), at)
    const env = makeEnv(ctx, at, thumpPeak, 0.005, 0.08, thumpDur)
    osc.connect(env)
    return { osc, env }
  }
  const a = makeThump(t0)
  const b = makeThump(t0 + stagger)
  const body = noiseSource(ctx, params.noise ?? 'brown', 1.2)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 400Hz
  body.connect(lp)
  const bodyEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.6), 0.02, 0.4, p(params.durations, 2, 1.0))
  lp.connect(bodyEnv)
  const out = ctx.createGain()
  a.env.connect(out)
  b.env.connect(out)
  bodyEnv.connect(out)
  return makeGraph(ctx, [a.osc, b.osc, body], out, { delays: [0, stagger, 0] })
}

export function buildEngine(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const o1 = ctx.createOscillator()
  o1.type = (params.waveform ?? 'sawtooth') as OscillatorType
  o1.frequency.setValueAtTime(p(params.frequencies, 0, 48), t0)
  const o2 = ctx.createOscillator()
  o2.type = (params.waveform ?? 'sawtooth') as OscillatorType
  o2.frequency.setValueAtTime(p(params.frequencies, 1, 96), t0)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 300Hz
  o1.connect(lp)
  o2.connect(lp)
  const g = ctx.createGain()
  g.gain.value = params.bandGains?.SILENT ?? 0.12 // start silent
  lp.connect(g)
  return makeGraph(ctx, [o1, o2], g, { gainParam: g.gain })
}

export function buildHullCreak(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const dur = p(params.durations, 0, 0.8)
  const lo = p(params.frequencies, 0, 80)
  const hi = p(params.frequencies, 1, 140)
  const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(rnd(lo, hi), t0)
  const segs = 3
  for (let i = 1; i <= segs; i++) {
    osc.frequency.linearRampToValueAtTime(rnd(lo, hi), t0 + (dur * i) / (segs + 1))
  }
  const bp = filterOrBypass(ctx, params.filter) // bandpass 600Hz metallic groan
  osc.connect(bp)
  const env = makeEnv(ctx, t0, p(params.gains, 0, 0.35), 0.15, 0.2, dur)
  bp.connect(env)
  return makeGraph(ctx, [osc], env)
}

export function buildAlarm(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const onS = p(params.durations, 0, 0.09)
  const total = p(params.durations, 1, 0.54)
  const peak = p(params.gains, 0, 0.4)
  const osc = ctx.createOscillator()
  osc.type = (params.waveform ?? 'square') as OscillatorType
  osc.frequency.setValueAtTime(p(params.frequencies, 0, 880), t0)
  const hp = filterOrBypass(ctx, params.filter) // highpass 1kHz
  osc.connect(hp)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  const cycle = onS * 2 // 90ms on / 90ms off
  for (let at = 0; at < total; at += cycle) {
    const on = t0 + at
    env.gain.setValueAtTime(0.0001, on)
    env.gain.exponentialRampToValueAtTime(peak, on + 0.005)
    env.gain.setValueAtTime(peak, on + onS)
    env.gain.exponentialRampToValueAtTime(0.0001, on + onS + 0.005)
  }
  hp.connect(env)
  return makeGraph(ctx, [osc], env)
}

export function buildUiClick(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const dur = p(params.durations, 0, 0.025)
  const osc = ctx.createOscillator()
  osc.type = (params.waveform ?? 'sine') as OscillatorType
  osc.frequency.setValueAtTime(p(params.frequencies, 0, 1200), t0)
  const env = makeEnv(ctx, t0, p(params.gains, 0, 0.25), 0.002, 0.02, dur)
  osc.connect(env)
  const out = filterOrBypass(ctx, params.filter) // no filter for uiClick
  env.connect(out)
  return makeGraph(ctx, [osc], out)
}

export function buildMissionSuccess(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const noteDur = p(params.durations, 0, 0.9)
  const padDur = p(params.durations, 1, 2.0)
  // rising major-ish note 220 → 330Hz
  const note = ctx.createOscillator()
  note.type = 'sine'
  note.frequency.setValueAtTime(p(params.frequencies, 0, 220), t0)
  note.frequency.linearRampToValueAtTime(p(params.frequencies, 1, 330), t0 + noteDur)
  const noteEnv = makeEnv(ctx, t0, p(params.gains, 0, 0.3), 0.05, 0.3, noteDur)
  note.connect(noteEnv)
  // warm detuned pad 110/165Hz → lowpass 800Hz
  const padA = ctx.createOscillator()
  padA.type = 'sine'
  padA.frequency.setValueAtTime(p(params.frequencies, 2, 110), t0)
  padA.detune.setValueAtTime(4, t0)
  const padB = ctx.createOscillator()
  padB.type = 'sine'
  padB.frequency.setValueAtTime(p(params.frequencies, 3, 165), t0)
  padB.detune.setValueAtTime(-3, t0)
  const lp = filterOrBypass(ctx, params.filter)
  padA.connect(lp)
  padB.connect(lp)
  const padEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.15), 0.3, 0.8, padDur)
  lp.connect(padEnv)
  const out = ctx.createGain()
  noteEnv.connect(out)
  padEnv.connect(out)
  return makeGraph(ctx, [note, padA, padB], out)
}

export function buildMissionFailed(ctx: AudioContext, params: SfxParams): AudioGraph {
  const t0 = ctx.currentTime
  const dur = p(params.durations, 0, 1.6)
  const fA = p(params.frequencies, 0, 330)
  const fB = p(params.frequencies, 1, 220)
  const fC = p(params.frequencies, 2, 165)
  // cold minor descending 330 → 220 → 165Hz
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(fA, t0)
  osc.frequency.linearRampToValueAtTime(fB, t0 + dur / 3)
  osc.frequency.linearRampToValueAtTime(fC, t0 + (dur * 2) / 3)
  const oscEnv = makeEnv(ctx, t0, p(params.gains, 0, 0.3), 0.05, 0.4, dur)
  osc.connect(oscEnv)
  // dark low noise bed
  const noise = noiseSource(ctx, params.noise ?? 'brown', dur + 0.2)
  const lp = filterOrBypass(ctx, params.filter) // lowpass 300Hz
  noise.connect(lp)
  const noiseEnv = makeEnv(ctx, t0, p(params.gains, 1, 0.12), 0.2, 0.5, dur)
  lp.connect(noiseEnv)
  const out = ctx.createGain()
  oscEnv.connect(out)
  noiseEnv.connect(out)
  return makeGraph(ctx, [osc, noise], out)
}

// ---------------------------------------------------------------------------
// §4 Ambience — ocean bed loop (filtered pink noise, level by weather).
// ---------------------------------------------------------------------------

function buildAmbience(ctx: AudioContext, params: AmbienceParams): AudioGraph {
  const src = noiseSource(ctx, 'pink', params.loopSeconds)
  src.loop = true
  const lp = makeFilter(ctx, params.filter) // lowpass 200Hz
  src.connect(lp)
  const g = ctx.createGain()
  g.gain.value = params.baseGain
  lp.connect(g)
  return makeGraph(ctx, [src], g, { gainParam: g.gain })
}

// ---------------------------------------------------------------------------
// Builder registry — one entry per shipped SFX (all 14).
// ---------------------------------------------------------------------------

export const SFX_BUILDERS: Readonly<Record<SfxName, SfxBuilder>> = {
  sonarPing: buildSonarPing,
  sonarReturn: buildSonarReturn,
  passiveContact: buildPassiveContact,
  torpedoLaunch: buildTorpedoLaunch,
  torpedoTravel: buildTorpedoTravel,
  torpedoHit: buildTorpedoHit,
  explosion: buildExplosion,
  depthCharge: buildDepthCharge,
  engine: buildEngine,
  hullCreak: buildHullCreak,
  alarm: buildAlarm,
  uiClick: buildUiClick,
  missionSuccess: buildMissionSuccess,
  missionFailed: buildMissionFailed,
}

// ---------------------------------------------------------------------------
// AudioEngine factory
// ---------------------------------------------------------------------------

export function createAudio(settings: AudioSettings): AudioEngine {
  const volumes: Record<VolumeChannel, number> = {
    master: clamp01(settings?.audio?.masterVolume ?? 0.7),
    sfx: clamp01(settings?.audio?.sfxVolume ?? 0.8),
    music: clamp01(settings?.audio?.musicVolume ?? 0.5),
  }
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let sfxBus: GainNode | null = null
  let musicBus: GainNode | null = null
  let ambience: AudioGraph | null = null
  let weather: string = 'Clear'
  let disposed = false
  const loops = new Map<SfxName, AudioGraph>()
  const oneShots = new Set<AudioGraph>()

  // -- AudioContext lifecycle (lazy, autoplay-policy safe) -------------------

  function ensureCtx(): AudioContext | null {
    if (ctx) return ctx
    if (disposed) return null
    const Ctor = getAudioContextCtor()
    if (!Ctor) {
      if (!warnedNoAudioCtx) {
        // Headless (Node tests / sim): warn once, then stay silent no-op.
        console.warn('[audio] AudioContext unavailable — procedural SFX disabled (headless or non-browser runtime).')
        warnedNoAudioCtx = true
      }
      return null
    }
    const c = new Ctor()
    // §2 master chain: master gain → compressor (-18dB, ratio 3) → destination
    master = c.createGain()
    master.gain.value = volumes.master
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.knee.value = 6 // DESIGN DECISION: knee/attack/release chosen for a tight limiter feel
    comp.attack.value = 0.01
    comp.release.value = 0.2
    master.connect(comp)
    comp.connect(c.destination)
    sfxBus = c.createGain()
    sfxBus.gain.value = volumes.sfx
    musicBus = c.createGain()
    musicBus.gain.value = volumes.music
    sfxBus.connect(master)
    musicBus.connect(master)
    ctx = c
    startAmbience(c)
    return c
  }

  // -- Ambience --------------------------------------------------------------

  function startAmbience(c: AudioContext): void {
    if (ambience || !musicBus) return
    ambience = buildAmbience(c, AMBIENCE_PARAMS)
    ambience.output.connect(musicBus)
    ambience.start(c.currentTime)
    applyAmbienceLevel(c)
  }

  function applyAmbienceLevel(c: AudioContext): void {
    if (!ambience?.gainParam) return
    let level = AMBIENCE_PARAMS.baseGain
    if (weather === 'Storm') level *= AMBIENCE_PARAMS.stormBoost
    if (AMBIENCE_PARAMS.mutedWeather.includes(weather as WeatherKind)) level = 0
    ambience.gainParam.setTargetAtTime(level, c.currentTime, 0.5)
  }

  // -- Play / stop -----------------------------------------------------------

  function play(name: SfxName): void {
    if (disposed) return
    const c = ensureCtx()
    if (!c) return
    const params = SFX_PARAMS[name]
    const builder = SFX_BUILDERS[name]
    if (!params || !builder) return
    if (params.loop) {
      if (!loops.has(name)) {
        const g = builder(c, params)
        g.output.connect(sfxBus!)
        g.start()
        loops.set(name, g)
      }
      return
    }
    const g = builder(c, params)
    g.output.connect(sfxBus!)
    g.start()
    oneShots.add(g)
    const end = c.currentTime + oneShotEndSeconds(params)
    g.stop(end)
    scheduleDispose(g, end, c)
  }

  function oneShotEndSeconds(params: SfxParams): number {
    let d = 0.25
    for (const dur of params.durations) d = Math.max(d, dur)
    if (params.echoDelay) d = Math.max(d, params.echoDelay + 0.4)
    return d
  }

  function scheduleDispose(g: AudioGraph, end: number, c: AudioContext): void {
    const ms = Math.max(0, (end - c.currentTime) * 1000 + 150)
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        g.dispose()
        oneShots.delete(g)
      }, ms)
    }
  }

  function stop(name: SfxName): void {
    if (disposed) return
    const g = loops.get(name)
    if (!g) return
    g.stop()
    g.dispose()
    loops.delete(name)
  }

  // -- Engine event wiring (§5) ----------------------------------------------

  function retargetEngine(payload: Record<string, unknown> | undefined): void {
    if (disposed) return
    const c = ensureCtx()
    if (!c) return
    play('engine') // ensure the engine loop is running (idempotent)
    const g = loops.get('engine')
    if (!g?.gainParam) return
    g.gainParam.setTargetAtTime(engineGainTarget(payload), c.currentTime, 0.2)
  }

  function engineGainTarget(payload: Record<string, unknown> | undefined): number {
    const bg = SFX_PARAMS.engine.bandGains
    if (bg) {
      const band = payload?.band
      if (typeof band === 'string' && Object.prototype.hasOwnProperty.call(bg, band)) {
        return clamp01((bg as Record<string, number>)[band] ?? 0)
      }
    }
    const kt = typeof payload?.speedKt === 'number' ? payload.speedKt : NaN
    if (Number.isFinite(kt)) return clamp01((kt / 22) * 0.9) // 22kt max throttle
    return 0
  }

  /** GAME_ARCHITECTURE §14: detection.threshold alarms only at ≥60. */
  function alarmGate(payload: Record<string, unknown> | undefined): boolean {
    const raw = payload?.detection ?? payload?.band
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 60
  }

  function onEngineEvent(ev: EngineEvent): void {
    if (disposed || !ev || typeof ev.type !== 'string') return
    const action: EventSfxAction | undefined = EVENT_SFX_MAP[ev.type]
    if (!action || action.kind === 'none') return
    if (ev.type === 'detection.threshold' && !alarmGate(ev.payload)) return
    if (action.kind === 'retargetEngine') {
      retargetEngine(ev.payload)
      return
    }
    if (action.kind === 'stopLoop') {
      stop(action.sfx)
      return
    }
    play(action.sfx)
    if (action.alsoStartLoop) play(action.alsoStartLoop)
    if (action.stopLoop) stop(action.stopLoop)
  }

  // -- Volume / weather / dispose --------------------------------------------

  function setVolume(channel: VolumeChannel, v: number): void {
    const value = clamp01(v)
    volumes[channel] = value
    const c = ctx
    if (!c) return
    const node = channel === 'master' ? master : channel === 'sfx' ? sfxBus : musicBus
    if (node) node.gain.setTargetAtTime(value, c.currentTime, 0.05)
  }

  function setWeather(kind: string): void {
    weather = kind
    if (ctx) applyAmbienceLevel(ctx)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    const c = ctx
    if (!c) return
    for (const g of loops.values()) {
      try {
        g.stop()
      } catch {
        // ignore
      }
      try {
        g.dispose()
      } catch {
        // ignore
      }
    }
    loops.clear()
    if (ambience) {
      try {
        ambience.stop()
      } catch {
        // ignore
      }
      try {
        ambience.dispose()
      } catch {
        // ignore
      }
    }
    ambience = null
    for (const g of oneShots) {
      try {
        g.dispose()
      } catch {
        // ignore
      }
    }
    oneShots.clear()
    try {
      void c.close()
    } catch {
      // ignore (already closed)
    }
    ctx = null
    master = null
    sfxBus = null
    musicBus = null
  }

  return {
    get available() {
      return getAudioContextCtor() !== null
    },
    play,
    stop,
    setVolume,
    onEngineEvent,
    setWeather,
    dispose,
  }
}
