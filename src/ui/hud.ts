/**
 * SILENT DEPTH — tactical HUD (src/ui/hud.ts)
 *
 * UI v2 (t-023) — Modern AI Mission Control. The DOM overlay layer (L6) over
 * the canvas map becomes an app shell:
 *
 *   .hud-topbar     — brand (SILENT DEPTH + 深海猎手) · mission name + status
 *                     chip · spacer · weather / language / settings / FPS
 *   .hud-workspace  — the framed central Mission Workspace (canvas L0–L5
 *                     shows through; header row: mission id + timer + zoom)
 *   .hud-left       — Submarine Status card (depth/speed/heading readouts +
 *                     battery/hull/noise/detection bars + torpedo chips),
 *                     Tasks card (weighted progress + status glyphs),
 *                     Torpedoes card (chips + salvo)
 *   .hud-right      — Contacts card (compact rows + empty state) + Fire
 *                     control card (placeholder when nothing selected)
 *   .hud-timeline   — Activity timeline: severity dot + mono timestamp +
 *                     phase divider + localized message (tail 50)
 *
 * i18n (t-022): every user-visible string goes through the translator bound
 * to the HUD's current language; setLanguage() re-translates the static
 * label registry in place. Status codes (RUNNING/PAUSED/BRIEFING…), phase
 * tags (SONAR/TORPEDO/…) and weather codes are technical mono data —
 * deliberately i18n-neutral (no dictionary changes allowed for t-023).
 *
 * Pure helpers (exported for Node unit tests, tests/unit/ui.test.ts):
 *   formatTime / formatEvent / formatFireSolution / formatLastSeen /
 *   detectionBandIndex / DETECTION_BAND_COLORS / eventSeverity / eventPhase
 *
 * DESIGN DECISIONS:
 *  - Event log follows FR-18 wording; noisy shell events (sub.speedChanged /
 *    sub.depthChanged / ui.click) are suppressed (formatEvent → null).
 *  - Timeline rows carry a semantic severity dot (success/info/warning/error)
 *    and a phase divider is inserted when the event phase changes, grouping
 *    the log by mission phase (GAME_DESIGN §11.2 "事件日志").
 *  - Task list: one row per objective with ✓ done / ● active / ○ pending
 *    glyphs and a single overall weighted progress bar (per-row progress is
 *    not available in the snapshot — DESIGN DECISION, bar is overall).
 *  - Fire-control card shows a muted placeholder (all values '--') when no
 *    contact is selected.
 *  - Detection meter keeps the 5-band colors (GAME_DESIGN §11.2) with the
 *    localized band label appended to the value.
 *  - Depth shows the localized layer name + balance min–max metres.
 *
 * Task: t-010 ui-engineer (t-022 i18n · t-023 UI v2).
 * @pure-at-import — DOM touched only inside functions; importable in Node.
 */

import type { BalanceConfig } from '../core/balance'
import { solveFireSolution, type FireSolution } from '../combat/fireControl'
import type {
  Contact,
  EventEntry,
  EventType,
  GameSnapshot,
  GameState,
  MissionDef,
  WeatherKind,
} from '../core/types'
import { getT, LANGS, type Lang, type Translator } from './i18n'
import { el, setText, toggleClass, type Child } from './dom'

// ---------------------------------------------------------------------------
// Pure formatting helpers (unit-testable)
// ---------------------------------------------------------------------------

/** Seconds → "mm:ss" (missions ≤ 99 min; hours not needed). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** FR-18 log wording for an event; null = suppress (noisy shell events). */
export function formatEvent(entry: EventEntry, lang: Lang = 'en'): string | null {
  const key = EVENT_LOG_KEYS[entry.type]
  if (key === undefined) return null
  const tt = getT(lang)
  const label = tt(key)
  const payload = entry.payload
  const contactId =
    typeof payload?.contactId === 'string' ? (payload.contactId as string) : null
  const targetId = typeof payload?.targetId === 'string' ? (payload.targetId as string) : null
  const shipId = typeof payload?.shipId === 'string' ? (payload.shipId as string) : null
  let suffix = contactId ?? targetId ?? shipId
  // t-026: periscope exposure events carry the exposure band — append its
  // localized name ('EXPOSURE RISING — HIGH').
  if (suffix === null && entry.type === 'periscope.exposure' && typeof payload?.band === 'string') {
    const bandKey = payload.band as string
    suffix = tt(`periscope.band.${bandKey}`)
    if (suffix === `periscope.band.${bandKey}`) suffix = bandKey
  }
  return suffix !== null && suffix.length > 0 ? tt('log.entry', { text: label, id: suffix }) : label
}

/** EventType → i18n log key (all catalogue members; null = suppressed). */
const EVENT_LOG_KEYS: Partial<Record<EventType, string>> = {
  'sonar.ping': 'log.sonar.ping',
  'sonar.contact': 'log.sonar.contact',
  'sonar.passive': 'log.sonar.passive',
  'contact.detected': 'log.contact.detected',
  'contact.classified': 'log.contact.classified',
  'contact.degraded': 'log.contact.degraded',
  'contact.lost': 'log.contact.lost',
  'torpedo.ready': 'log.torpedo.ready',
  'torpedo.fired': 'log.torpedo.fired',
  'torpedo.hit': 'log.torpedo.hit',
  'torpedo.missed': 'log.torpedo.missed',
  'torpedo.expired': 'log.torpedo.expired',
  'torpedo.fireRejected': 'log.torpedo.fireRejected',
  'ship.sunk': 'log.ship.sunk',
  'depthCharge.dropped': 'log.depthCharge.dropped',
  'depthCharge.detonated': 'log.depthCharge.detonated',
  'deckGun.fired': 'log.deckGun.fired',
  'sub.damaged': 'log.sub.damaged',
  'sub.forcedSurface': 'log.sub.forcedSurface',
  'battery.low': 'log.battery.low',
  'detection.threshold': 'log.detection.threshold',
  'player.located': 'log.player.located',
  'decoy.launched': 'log.decoy.launched',
  'escape.escaped': 'log.escape.escaped',
  'mission.victory': 'log.mission.victory',
  'mission.defeat': 'log.mission.defeat',
  'mission.complete': 'log.mission.complete',
  // t-026 periscope catalogue.
  'periscope.ready': 'log.periscope.ready',
  'periscope.raising': 'log.periscope.raising',
  'periscope.raised': 'log.periscope.raised',
  'periscope.visualContact': 'log.periscope.visualContact',
  'periscope.classified': 'log.periscope.classified',
  'periscope.locked': 'log.periscope.locked',
  'periscope.unlocked': 'log.periscope.unlocked',
  'periscope.lowered': 'log.periscope.lowered',
  'periscope.cannotRaise': 'log.periscope.cannotRaise',
  'periscope.exposure': 'log.periscope.exposure',
  'sub.emergencyDive': 'log.emergencyDive',
  // Suppressed (shell-driven noise): sub.speedChanged, sub.depthChanged,
  // ui.click — deliberately absent from the map (formatEvent → null).
}

/** Fire-control card display parts (§7.3 / §7.4 — pure formatting). */
export interface FireControlParts {
  target: string
  bearing: string
  range: string
  targetHeading: string
  targetSpeed: string
  firingBearing: string
  hitProbability: string
  salvoProbability: string
  estimated: boolean
  /** t-024/026: fire-solution quality ('ESTIMATED' | 'VISUAL CONFIRMED'). */
  status: 'ESTIMATED' | 'VISUAL CONFIRMED'
  /** Localized status label (fc.status.*). */
  statusText: string
}

/** Format a FireSolution into card strings ("--" for unknown inputs). */
export function formatFireSolution(solution: FireSolution, contact: Contact, lang: Lang = 'en'): FireControlParts {
  const tt = getT(lang)
  const three = (v: number | null): string => (v === null ? '--' : String(Math.round(v)).padStart(3, '0') + '°')
  const rangeStr = (km: number | null): string =>
    km === null ? '--' : km >= 10 ? `${Math.round(km)}KM` : `${km.toFixed(1)}KM`
  const speedStr = (kt: number | null): string => (kt === null ? '--' : `${Math.round(kt)}KT`)
  const status: 'ESTIMATED' | 'VISUAL CONFIRMED' = solution.status ?? 'ESTIMATED'
  return {
    target: `${contact.id} ${tt(`class.${contact.classification}`)}`,
    bearing: three(contact.bearingDeg),
    range: rangeStr(contact.rangeKm),
    targetHeading: three(contact.headingEstimateDeg),
    targetSpeed: speedStr(contact.speedEstimateKt),
    firingBearing: three(solution.bearingDeg),
    hitProbability: `${Math.round(solution.hitProbability * 100)}%`,
    salvoProbability: `${Math.round(solution.salvoHitProbability * 100)}%`,
    estimated: solution.estimated,
    status,
    statusText: tt(`fc.status.${status === 'VISUAL CONFIRMED' ? 'visualConfirmed' : 'estimated'}`),
  }
}

/** "NOW" / "12S" / "1:05" — seconds since last detection. */
export function formatLastSeen(lastDetectedAt: number, now: number, lang: Lang = 'en'): string {
  const tt = getT(lang)
  const dt = Math.max(0, Math.round(now - lastDetectedAt))
  if (dt < 1) return tt('hud.lastSeen.now')
  if (dt < 60) return tt('hud.lastSeen.seconds', { s: dt })
  return formatTime(dt)
}

/** Index into balance.detection.bands for a 0..100 detection value. */
export function detectionBandIndex(detection: number, bands: readonly { max: number; label: string }[]): number {
  const v = Math.max(0, Math.min(100, detection))
  for (let i = 0; i < bands.length; i++) {
    if (v <= (bands[i]?.max ?? 0)) return i
  }
  return Math.max(0, bands.length - 1)
}

/** 5-band meter colors (GAME_DESIGN §11.2: 绿/黄/橙/红/深红). */
export const DETECTION_BAND_COLORS = ['#3f9d5a', '#e8a33d', '#e07b39', '#d9534f', '#a8322e'] as const

/** Weather chip codes (monospace-safe, intentionally unlocalized). */
export const WEATHER_CODES: Record<WeatherKind, string> = {
  Clear: 'CLR',
  Cloudy: 'CLD',
  Storm: 'STM',
  Fog: 'FOG',
  Night: 'NGT',
}

/** Semantic severity of an event for the timeline dot. */
export type EventSeverity = 'success' | 'info' | 'warning' | 'error'

/** EventType → timeline severity (t-023/t-026; pure, unit-tested). */
const EVENT_SEVERITIES: Partial<Record<EventType, EventSeverity>> = {
  // success
  'torpedo.ready': 'success',
  'torpedo.hit': 'success',
  'ship.sunk': 'success',
  'contact.classified': 'success',
  'decoy.launched': 'success',
  'escape.escaped': 'success',
  'mission.victory': 'success',
  'mission.complete': 'success',
  'periscope.visualContact': 'success',
  'periscope.classified': 'success',
  'periscope.locked': 'success',
  // warning
  'torpedo.missed': 'warning',
  'torpedo.expired': 'warning',
  'torpedo.fireRejected': 'warning',
  'contact.degraded': 'warning',
  'sub.damaged': 'warning',
  'battery.low': 'warning',
  'detection.threshold': 'warning',
  'sub.forcedSurface': 'warning',
  'periscope.cannotRaise': 'warning',
  'periscope.exposure': 'warning',
  'sub.emergencyDive': 'warning',
  // error
  'contact.lost': 'error',
  'player.located': 'error',
  'mission.defeat': 'error',
  // everything else → info
}

/** Severity of an event type (default 'info'). */
export function eventSeverity(type: EventType): EventSeverity {
  return EVENT_SEVERITIES[type] ?? 'info'
}

/**
 * Timeline dot severity for an entry — refines periscope.exposure by the
 * band payload (CRITICAL/HIGH → error, MEDIUM → warning, LOW/NONE → info).
 */
export function eventSeverityFor(entry: EventEntry): EventSeverity {
  if (entry.type === 'periscope.exposure') {
    const band = entry.payload?.band
    if (band === 'CRITICAL' || band === 'HIGH') return 'error'
    if (band === 'MEDIUM') return 'warning'
    return 'info'
  }
  return eventSeverity(entry.type)
}

/** Mission-phase group of an event (technical micro-label for the timeline). */
export function eventPhase(type: EventType): string {
  if (type.startsWith('periscope.')) return 'PERISCOPE'
  if (type.startsWith('sonar.') || type.startsWith('contact.')) return 'SONAR'
  if (type.startsWith('torpedo.')) return 'TORPEDO'
  if (type.startsWith('depthCharge.') || type.startsWith('deckGun.') || type === 'ship.sunk') return 'COMBAT'
  if (type.startsWith('sub.') || type === 'battery.low' || type === 'detection.threshold' || type === 'player.located' || type === 'decoy.launched') return 'SUB'
  if (type.startsWith('mission.') || type === 'escape.escaped') return 'MISSION'
  return 'SYS'
}

/** Exposure band → color (t-026; LOW green → CRITICAL red). */
export function exposureBandColor(band: string): string {
  switch (band) {
    case 'NONE':
      return '#64748b'
    case 'LOW':
      return '#34d399'
    case 'MEDIUM':
      return '#fbbf24'
    case 'HIGH':
      return '#fb923c'
    case 'CRITICAL':
      return '#f87171'
    default:
      return '#64748b'
  }
}

/** Short technical status code per GameState (mono chip — i18n-neutral). */
const STATUS_CODE: Partial<Record<GameState, { code: string; cls: string }>> = {
  MISSION_LOADING: { code: 'BRIEFING', cls: 'is-info' },
  MISSION_RUNNING: { code: 'RUNNING', cls: 'is-running' },
  PAUSED: { code: 'PAUSED', cls: 'is-paused' },
  VICTORY: { code: 'VICTORY', cls: 'is-success' },
  DEFEAT: { code: 'DEFEAT', cls: 'is-error' },
  MISSION_RESULT: { code: 'RESULT', cls: 'is-info' },
}

// ---------------------------------------------------------------------------
// HUD element wiring
// ---------------------------------------------------------------------------

/** Per-frame extra data the snapshot does not carry (shell-owned). */
export interface HudExtras {
  selectedContactId: string | null
  salvo: 1 | 2
  weather: WeatherKind
  mission: MissionDef
  balance: BalanceConfig
  /** Current camera zoom px/km (workspace hint). */
  zoom: number
  /** Measured FPS (dev chip when settings.video.showFps). */
  fps: number
  showFps: boolean
  /** Wall-clock seconds (post-fire warning banner timing). */
  wallT: number
}

export interface HudOptions {
  /** Contact row clicked → select (shell forwards to input + renderer). */
  onSelectContact: (contactId: string | null) => void
  /** Salvo selector changed. */
  onSalvoChange: (salvo: 1 | 2) => void
  /** Top-bar settings / language entry clicked (shell opens Settings). */
  onOpenSettings: () => void
  /** t-026: periscope raise/lower edge (P or button). */
  onPeriscopeToggle: () => void
  /** t-026: lock the observed target (L or button). */
  onLockTarget: () => void
  /** t-026: emergency dive (X or button). */
  onDive: () => void
  /** Initial UI language (t-022; default 'en'). */
  lang?: Lang
}

export interface Hud {
  /** Diff-minimal update from the latest snapshot. */
  update(snapshot: GameSnapshot, extras: HudExtras): void
  /** Append one log line (main forwards new snapshot events). */
  appendLog(entry: EventEntry): void
  /** Reset per-mission state (tubes, log, selection). */
  reset(): void
  /** Switch UI language: re-translates the static labels in place. */
  setLanguage(lang: Lang): void
  /** t-026: show the post-fire exposure warning banner (~6 s). */
  showFireWarning(): void
  /** The HUD root element (CSS class 'hud'). */
  root: HTMLElement
}

const LOG_CAPACITY = 50

/**
 * Build the HUD overlay. `root` is the persistent DOM container (created by
 * main.ts). Construction touches the DOM — browser only.
 */
export function createHud(root: HTMLElement, opts: HudOptions): Hud {
  root.className = 'hud'
  root.style.display = 'none'

  let lang: Lang = opts.lang ?? 'en'
  let tt: Translator = getT(lang)

  /** Label registry — re-translated by setLanguage() without rebuilding. */
  const labelRegistry: [HTMLElement, string][] = []
  function label(key: string, className: string): HTMLElement {
    const node = el('span', { className })
    labelRegistry.push([node, key])
    setText(node, tt(key))
    return node
  }

  // --- top bar (J) -----------------------------------------------------------
  const missionNameEl = el('span', { className: 'hud-mission-name' })
  const statusChip = el('span', { className: 'status-chip' })
  const weatherValue = el('span', { className: 'mono' })
  const timerValue = el('span', { className: 'mono' })
  const fpsValue = el('span', { className: 'mono' })
  const langChip = el('button', {
    className: 'meta-chip hud-lang-chip',
    title: tt('settings.language'),
    onclick: () => opts.onOpenSettings(),
  })
  const settingsBtn = el('button', {
    className: 'icon-btn',
    text: tt('settings.title'),
    onclick: () => opts.onOpenSettings(),
  })
  const fpsChip = el('span', { className: 'meta-chip' }, [el('span', { text: 'FPS' }), fpsValue])
  fpsChip.style.display = 'none'

  const topbar = el('div', { className: 'hud-topbar' }, [
    el('div', { className: 'hud-brand' }, [
      el('div', { className: 'hud-brand-mark', text: '◈' }),
      el('div', { className: 'hud-brand-text' }, [
        el('div', { className: 'hud-brand-name', text: tt('app.title') }),
        el('div', { className: 'hud-brand-sub', text: tt('app.subtitle') }),
      ]),
    ]),
    el('div', { className: 'hud-mission' }, [missionNameEl, statusChip]),
    el('div', { className: 'hud-spacer' }),
    el('div', { className: 'hud-topmeta' }, [
      el('span', { className: 'meta-chip' }, [el('span', { text: tt('hud.time') }), timerValue]),
      el('span', { className: 'meta-chip' }, [weatherValue]),
      langChip,
      settingsBtn,
      fpsChip,
    ]),
  ])
  // Brand strings are not re-translated (canonical) — register only the rest.
  labelRegistry.push([settingsBtn, 'settings.title'])

  // --- central Mission Workspace (F) -------------------------------------------
  const wsId = el('span', { className: 'ws-id' })
  const wsTimer = el('span', { className: 'mono-strong' })
  const wsZoom = el('span', { className: 'mono-strong' })
  const workspace = el('div', { className: 'hud-workspace' }, [
    el('div', { className: 'ws-header' }, [
      wsId,
      el('div', { className: 'ws-meta' }, [wsTimer, wsZoom]),
    ]),
  ])

  // --- left column ---------------------------------------------------------------
  const depthValue = el('span', { className: 'status-value' })
  const speedValue = el('span', { className: 'status-value' })
  const headingValue = el('span', { className: 'status-value' })

  const readouts = [
    { key: 'hud.depth', value: depthValue },
    { key: 'hud.speed', value: speedValue },
    { key: 'hud.heading', value: headingValue },
  ].map((r) =>
    el('div', { className: 'status-readout' }, [
      label(r.key, 'status-label'),
      r.value,
    ]),
  )

  const bars: { labelKey: string; fill: HTMLElement; value: HTMLElement; row: HTMLElement }[] = []
  function barRow(labelKey: string): { fill: HTMLElement; value: HTMLElement; row: HTMLElement } {
    const fill = el('div', { className: 'bar-fill' })
    const value = el('span', { className: 'bar-value' })
    const row = el('div', { className: 'bar-row' }, [
      label(labelKey, 'bar-label'),
      el('div', { className: 'bar-track' }, [fill]),
      value,
    ])
    bars.push({ labelKey, fill, value, row })
    return bars[bars.length - 1]!
  }
  const batteryBar = barRow('hud.battery')
  const hullBar = barRow('hud.hull')
  const noiseBar = barRow('hud.noise')
  const detectionBar = barRow('hud.detection')

  // t-026 periscope row in the status card: state chip + exposure bar.
  const pScopeChip = el('span', { className: 'pc-mini-chip' })
  const pExposureFill = el('div', { className: 'bar-fill' })
  const pExposureValue = el('span', { className: 'bar-value' })
  const pScopeRow = el('div', { className: 'bar-row periscope-row' }, [
    pScopeChip,
    el('div', { className: 'bar-track' }, [pExposureFill]),
    pExposureValue,
  ])

  // t-028: active-sonar availability row (chip + cooldown bar + seconds).
  const pingChip = el('span', { className: 'pc-mini-chip' })
  const pingFill = el('div', { className: 'bar-fill' })
  const pingValue = el('span', { className: 'bar-value' })
  const pingRow = el('div', { className: 'bar-row ping-row' }, [
    pingChip,
    el('div', { className: 'bar-track' }, [pingFill]),
    pingValue,
  ])

  // t-028: system chips — silent running + decoys remaining.
  const silentChip = el('span', { className: 'sys-chip' })
  const decoyChip = el('span', { className: 'sys-chip' })
  const chipsRow = el('div', { className: 'sys-chips' }, [silentChip, decoyChip])

  const statusCard = el('div', { className: 'card' }, [
    el('div', { className: 'status-readouts' }, readouts),
    el('div', { className: 'status-bars' }, [
      batteryBar.row,
      hullBar.row,
      noiseBar.row,
      detectionBar.row,
      pingRow,
      pScopeRow,
    ]),
    chipsRow,
  ])

  // --- tasks (objectives) card (H) ------------------------------------------------
  const taskProgressFill = el('div', { className: 'task-progress-fill' })
  const taskList = el('div', { className: 'task-list' })
  const tasksCard = el('div', { className: 'card' }, [
    el('div', { className: 'card-head' }, [
      label('hud.objectives', 'card-title'),
      el('div', { className: 'task-progress' }, [taskProgressFill]),
    ]),
    taskList,
  ])

  // --- torpedo tubes card (G) ------------------------------------------------------
  const tubesRow = el('div', { className: 'tubes-row' })
  const salvo1 = salvoButton('1', true)
  const salvo2 = salvoButton('2', false)
  const tubesCard = el('div', { className: 'card' }, [
    el('div', { className: 'card-head' }, [
      label('hud.torpedoes', 'card-title'),
      el('div', { className: 'salvo-select' }, [salvo1, salvo2]),
    ]),
    tubesRow,
  ])

  // --- periscope control card (t-026) -----------------------------------------------
  const pcStatus = el('span', { className: 'pc-status' })
  const pcProgressFill = el('div', { className: 'pc-progress-fill' })
  const pcProgressPct = el('span', { className: 'mono pc-pct' })
  const pcProgress = el('div', { className: 'pc-progress-row' }, [
    el('div', { className: 'pc-progress' }, [pcProgressFill]),
    pcProgressPct,
  ])
  pcProgress.style.display = 'none'
  const pcReason = el('div', { className: 'pc-reason' })
  pcReason.style.display = 'none'

  const raiseBtn = el('button', {
    className: 'btn btn-primary pc-btn',
    text: tt('periscope.btn.raise'),
    onclick: () => opts.onPeriscopeToggle(),
  })
  const lockBtn = el('button', {
    className: 'btn pc-btn',
    text: tt('periscope.btn.lock'),
    onclick: () => opts.onLockTarget(),
  })
  const lowerBtn = el('button', {
    className: 'btn pc-btn',
    text: tt('periscope.btn.lower'),
    onclick: () => opts.onPeriscopeToggle(),
  })
  const diveBtn = el('button', {
    className: 'btn pc-btn pc-danger',
    text: tt('periscope.btn.dive'),
    onclick: () => opts.onDive(),
  })
  labelRegistry.push([raiseBtn, 'periscope.btn.raise'])
  labelRegistry.push([lockBtn, 'periscope.btn.lock'])
  labelRegistry.push([lowerBtn, 'periscope.btn.lower'])
  labelRegistry.push([diveBtn, 'periscope.btn.dive'])

  const periscopeCard = el('div', { className: 'card periscope-control' }, [
    el('div', { className: 'card-head' }, [
      label('periscope.title', 'card-title'),
      pcStatus,
    ]),
    pcProgress,
    pcReason,
    el('div', { className: 'pc-actions' }, [raiseBtn, lockBtn, lowerBtn, diveBtn]),
  ])

  const leftCol = el('div', { className: 'hud-left' }, [statusCard, tasksCard, tubesCard, periscopeCard])

  // --- right column: contacts + fire control (I) -------------------------------------
  const contactList = el('div', { className: 'contact-list' })
  const emptyTitle = el('div', { className: 'empty-title' })
  const emptyHint = el('div', { className: 'empty-hint' })
  const contactsEmpty = el('div', { className: 'contacts-empty' }, [
    el('div', { className: 'empty-icon', text: '◎' }),
    emptyTitle,
    emptyHint,
  ])
  contactsEmpty.style.display = 'none'

  const fcTarget = el('span', { className: 'fc-value' })
  const fcBearing = el('span', { className: 'fc-value' })
  const fcRange = el('span', { className: 'fc-value' })
  const fcHdg = el('span', { className: 'fc-value' })
  const fcSpd = el('span', { className: 'fc-value' })
  const fcFiring = el('span', { className: 'fc-value' })
  const fcHp = el('span', { className: 'fc-value hp' })
  const fcSalvo = el('span', { className: 'fc-value' })
  const fcEstimated = el('div', { className: 'fc-est' })
  labelRegistry.push([fcEstimated, 'hud.fc.estimated'])
  setText(fcEstimated, tt('hud.fc.estimated'))

  const fireCard = el('div', { className: 'card firecard placeholder' }, [
    el('div', { className: 'card-head' }, [label('hud.fireControl', 'card-title')]),
    el('div', { className: 'fc-grid' }, [
      fcRow(tt, 'hud.fc.target', fcTarget, 'wide'),
      fcRow(tt, 'hud.fc.bearing', fcBearing),
      fcRow(tt, 'hud.fc.range', fcRange),
      fcRow(tt, 'hud.fc.targetHdg', fcHdg),
      fcRow(tt, 'hud.fc.targetSpd', fcSpd),
      fcRow(tt, 'hud.fc.firingBearing', fcFiring, 'wide'),
      fcRow(tt, 'hud.fc.hitProbability', fcHp, 'wide'),
      fcRow(tt, 'hud.fc.salvo', fcSalvo, 'wide'),
      fcEstimated,
    ]),
  ])

  // t-028c: operations & key reference panel (below the fire control card).
  const controlsCard = el('div', { className: 'card controls-card' }, [
    el('div', { className: 'card-head' }, [label('hud.controls.title', 'card-title')]),
    el(
      'div',
      { className: 'controls-list' },
      CONTROL_BINDINGS.map((b) => {
        const keyChip = el('span', { className: 'key-chip mono', text: b.key })
        const lbl = el('span', { className: 'controls-label' })
        labelRegistry.push([lbl, b.labelKey])
        setText(lbl, tt(b.labelKey))
        return el('div', { className: 'controls-row' }, [keyChip, lbl])
      }),
    ),
  ])

  const rightCol = el('div', { className: 'hud-right' }, [
    el('div', { className: 'card' }, [
      el('div', { className: 'card-head' }, [label('hud.contacts', 'card-title')]),
      contactsEmpty,
      contactList,
    ]),
    fireCard,
    controlsCard,
  ])

  // --- bottom: activity timeline (K) ------------------------------------------------
  const timelineBody = el('div', { className: 'timeline-body' })
  const timeline = el('div', { className: 'card hud-timeline' }, [
    el('div', { className: 'card-head' }, [label('hud.log', 'card-title')]),
    timelineBody,
  ])

  // --- PERISCOPE VIEW overlay (t-026) ----------------------------------------------
  // Optical observation mode over the central workspace (RAISED/OBSERVING).
  // Restrained: vignette + scanlines + an optical reticle; no cyberpunk glow.
  const pvBearing = el('span', { className: 'pv-bearing mono' })
  const pvTargetType = el('span', { className: 'pv-value pv-type' })
  const pvBearingVal = el('span', { className: 'pv-value mono' })
  const pvRangeVal = el('span', { className: 'pv-value mono' })
  const pvSpeedVal = el('span', { className: 'pv-value mono' })
  const pvCourseVal = el('span', { className: 'pv-value mono' })
  const pvClassVal = el('span', { className: 'pv-value mono' })
  const pvConfVal = el('span', { className: 'pv-value mono' })
  const pvStatusChip = el('span', { className: 'status-chip' })

  function pvRow(labelKey: string, value: HTMLElement): HTMLElement {
    const lb = el('span', { className: 'pv-label' })
    labelRegistry.push([lb, labelKey])
    setText(lb, tt(labelKey))
    return el('div', { className: 'pv-row' }, [lb, value])
  }

  const pvLockBtn = el('button', {
    className: 'btn btn-primary pv-btn',
    text: tt('periscope.btn.lock'),
    onclick: () => opts.onLockTarget(),
  })
  const pvLowerBtn = el('button', {
    className: 'btn pv-btn',
    text: tt('periscope.btn.lower'),
    onclick: () => opts.onPeriscopeToggle(),
  })
  const pvDiveBtn = el('button', {
    className: 'btn pv-btn pv-danger',
    text: tt('periscope.btn.dive'),
    onclick: () => opts.onDive(),
  })
  labelRegistry.push([pvLockBtn, 'periscope.btn.lock'])
  labelRegistry.push([pvLowerBtn, 'periscope.btn.lower'])
  labelRegistry.push([pvDiveBtn, 'periscope.btn.dive'])

  const pvExposureFill = el('div', { className: 'pv-exposure-fill' })
  const pvExposureValue = el('span', { className: 'mono' })
  const pvRaisedTime = el('span', { className: 'mono' })

  // t-028b: real periscope scene — sky, sea, horizon, weather, ship silhouettes.
  const pvSky = el('div', { className: 'pv-sky' })
  const pvSea = el('div', { className: 'pv-sea' })
  const pvHorizon = el('div', { className: 'pv-horizon' })
  const pvWeather = el('div', { className: 'pv-weather' })
  const pvMarks = el('div', { className: 'pv-marks' })
  const pvShips = el('div', { className: 'pv-ships' })
  const shipEls = new Map<string, HTMLElement>()

  const periscopeView = el('div', { className: 'periscope-view' }, [
    pvSky,
    pvSea,
    pvHorizon,
    pvMarks,
    pvShips,
    pvWeather,
    el('div', { className: 'pv-vignette' }),
    el('div', { className: 'pv-reticle' }, [
      el('div', { className: 'pv-ring pv-ring-outer' }),
      el('div', { className: 'pv-ring pv-ring-inner' }),
      el('div', { className: 'pv-cross pv-cross-h' }),
      el('div', { className: 'pv-cross pv-cross-v' }),
      pvBearing,
    ]),
    el('div', { className: 'pv-target card' }, [
      el('div', { className: 'pv-target-head' }, [
        label('periscope.title', 'card-title'),
        pvStatusChip,
      ]),
      pvRow('hud.contact.type', pvTargetType),
      pvRow('periscope.view.bearing', pvBearingVal),
      pvRow('hud.fc.range', pvRangeVal),
      pvRow('periscope.view.speed', pvSpeedVal),
      pvRow('periscope.view.course', pvCourseVal),
      pvRow('periscope.view.classification', pvClassVal),
      pvRow('periscope.view.confidence', pvConfVal),
    ]),
    el('div', { className: 'pv-status' }, [
      el('div', { className: 'pv-exposure' }, [
        label('periscope.exposure', 'pv-label'),
        el('div', { className: 'pv-exposure-track' }, [pvExposureFill]),
        pvExposureValue,
      ]),
      pvRaisedTime,
    ]),
    el('div', { className: 'pv-actions' }, [pvLockBtn, pvLowerBtn, pvDiveBtn]),
  ])
  periscopeView.style.display = 'none'

  // --- post-fire exposure warning banner (t-026) --------------------------------------
  const fireWarnText = el('div', { className: 'fw-text' })
  const fwLowerBtn = el('button', {
    className: 'btn fw-btn',
    text: tt('periscope.btn.lower'),
    onclick: () => opts.onPeriscopeToggle(),
  })
  const fwDiveBtn = el('button', {
    className: 'btn fw-btn fw-danger',
    text: tt('periscope.btn.dive'),
    onclick: () => opts.onDive(),
  })
  labelRegistry.push([fwLowerBtn, 'periscope.btn.lower'])
  labelRegistry.push([fwDiveBtn, 'periscope.btn.dive'])
  const fireWarn = el('div', { className: 'fire-warning' }, [
    el('span', { className: 'fw-icon', text: '⚠' }),
    fireWarnText,
    fwLowerBtn,
    fwDiveBtn,
  ])
  fireWarn.style.display = 'none'

  root.append(topbar, workspace, leftCol, rightCol, timeline, periscopeView, fireWarn)

  // --- state ------------------------------------------------------------------------
  const contactRows = new Map<string, HTMLElement>()
  const objectiveRows = new Map<string, HTMLElement>()
  const tubeEls: HTMLElement[] = []
  let selectedContactId: string | null = null
  let currentSalvo: 1 | 2 = 1
  let lastLogEntryId = 0
  let lastPhase = ''
  const logEntries: EventEntry[] = []
  /** t-026: post-fire warning banner until wallT (null = hidden). */
  let fireWarningUntil: number | null = null
  let lastWallT = 0

  function setSalvo(n: 1 | 2): void {
    currentSalvo = n
    salvo1.classList.toggle('active', n === 1)
    salvo2.classList.toggle('active', n === 2)
    opts.onSalvoChange(n)
  }
  salvo1.addEventListener('click', () => setSalvo(1))
  salvo2.addEventListener('click', () => setSalvo(2))

  function selectContact(id: string | null): void {
    selectedContactId = id
    for (const [cid, row] of contactRows) {
      toggleClass(row, 'selected', cid === id)
    }
    opts.onSelectContact(id)
  }

  // --- update ----------------------------------------------------------------------
  function update(snapshot: GameSnapshot, extras: HudExtras): void {
    const sub = snapshot.playerSub
    const bal = extras.balance
    const now = snapshot.simTime

    // Mission identity + status chip (top bar) + workspace meta.
    setText(missionNameEl, tt(`mission.${extras.mission.id}.name`))
    const status = STATUS_CODE[snapshot.state]
    if (status !== undefined) {
      setText(statusChip, status.code)
      statusChip.className = `status-chip ${status.cls}`
    }
    setText(wsId, extras.mission.id)
    setText(wsTimer, formatTime(now))
    setText(wsZoom, `ZOOM ${Math.round(extras.zoom)} PX/KM`)

    // Top-bar meta.
    setText(timerValue, formatTime(now))
    setText(weatherValue, WEATHER_CODES[extras.weather] ?? 'CLR')
    setText(fpsValue, String(Math.round(extras.fps)))
    fpsChip.style.display = extras.showFps ? '' : 'none'

    // --- status readouts (G, t-028: live metres) ---
    const layerCfg = bal.depthLayers[sub.depthLayer]
    const depthM = sub.depthM ?? (layerCfg.minM + layerCfg.maxM) / 2
    setText(
      depthValue,
      tt('hud.depthValue', {
        m: Math.round(depthM),
        layer: tt(`hud.layer.${sub.depthLayer}`),
      }),
    )
    setText(speedValue, tt('hud.speedValue', { v: sub.speedKt.toFixed(1).replace(/\.0$/, ''), band: tt(`hud.band.${sub.speedBand}`) }))
    setText(headingValue, `${String(Math.round(sub.headingDeg) % 360).padStart(3, '0')}°`)

    // --- bars ---
    // Battery: success → warning when low.
    setBar(batteryBar, sub.battery, 'success')
    toggleClass(batteryBar.row, 'low', sub.lowBattery)
    setText(
      batteryBar.value,
      `${Math.round(sub.battery)}%${sub.lowBattery ? ' ' + tt('hud.lowBattery') : ''}`,
    )
    // Hull: success → error when damaged (<30).
    setBar(hullBar, sub.hull, 'success')
    toggleClass(hullBar.row, 'danger', sub.hull < 30)
    setText(hullBar.value, `${Math.round(sub.hull)}%`)
    // Noise: info.
    setBar(noiseBar, sub.noise, 'info')
    setText(noiseBar.value, `${Math.round(sub.noise)}`)
    // Detection: 5-band color + localized band label.
    const bandIdx = detectionBandIndex(sub.detection, bal.detection.bands)
    setBar(detectionBar, sub.detection, 'info')
    detectionBar.fill.style.background = DETECTION_BAND_COLORS[bandIdx] ?? DETECTION_BAND_COLORS[0]!
    setText(
      detectionBar.value,
      `${Math.round(sub.detection)} ${tt(`hud.bands.${bal.detection.bands[bandIdx]?.label ?? 'Unaware'}`)}`,
    )

    // t-028: active sonar availability + cooldown.
    const pingState = pingStatus(sub, bal)
    if (pingState.state === 'ready') {
      setText(pingChip, tt('hud.ping.ready'))
      pingChip.className = 'pc-mini-chip ping-ready'
      setText(pingValue, '')
    } else if (pingState.state === 'cooldown') {
      setText(pingChip, tt('hud.ping.cooldown', { s: pingState.seconds.toFixed(1) }))
      pingChip.className = 'pc-mini-chip ping-cooldown'
      setText(pingValue, '')
    } else {
      setText(pingChip, tt('hud.ping.unavailable'))
      pingChip.className = 'pc-mini-chip ping-unavailable'
      setText(pingValue, '')
    }
    setBar(
      { fill: pingFill, row: pingRow },
      pingState.fraction * 100,
      pingState.state === 'ready' ? 'success' : pingState.state === 'cooldown' ? 'warning' : 'error',
    )

    // t-028: system chips — silent running + decoys.
    setText(silentChip, sub.silentRunning ? tt('hud.silent.on') : tt('hud.silent.off'))
    silentChip.className = sub.silentRunning ? 'sys-chip chip-on' : 'sys-chip chip-off'
    setText(decoyChip, tt('hud.decoys', { n: sub.decoyCount }))

    // --- tasks (H) ---
    const objectives = snapshot.mission.objectives
    const missionId = extras.mission.id
    let doneWeight = 0
    let totalWeight = 0
    for (const obj of objectives) totalWeight += obj.weight
    for (const [id, row] of objectiveRows) {
      if (!objectives.some((o) => o.id === id)) row.remove()
      objectiveRows.delete(id)
    }
    let activeSeen = false
    for (const obj of objectives) {
      if (obj.done) doneWeight += obj.weight
      let row = objectiveRows.get(obj.id)
      if (row === undefined) {
        row = el('div', { className: 'task-row' }, [
          el('span', { className: 'task-mark' }),
          el('span', { className: 'task-text' }),
        ])
        objectiveRows.set(obj.id, row)
        taskList.append(row)
      }
      const mark = row.firstChild as HTMLElement
      const text = row.lastChild as HTMLElement
      const key = `mission.${missionId}.obj.${obj.id}`
      const localized = tt(key)
      setText(text, localized !== key ? localized : obj.desc)
      if (obj.done) {
        row.className = 'task-row done'
        mark.textContent = '✓'
      } else if (!activeSeen) {
        activeSeen = true
        row.className = 'task-row active'
        mark.textContent = '●'
      } else {
        row.className = 'task-row pending'
        mark.textContent = ''
      }
    }
    taskProgressFill.style.width = `${totalWeight > 0 ? (doneWeight / totalWeight) * 100 : 0}%`

    // --- torpedo tubes (G) ---
    const tubesDef = sub.torpedoTubes
    if (tubeEls.length !== tubesDef.length) {
      tubesRow.textContent = ''
      tubeEls.length = 0
      for (const tube of tubesDef) {
        const t = el('span', {
          className: 'tube-chip',
          title: `${tube.id} — ${tube.state}`,
          attrs: { 'aria-label': tube.id },
        }, [el('span', { className: 'tube-dot' }), el('span', { className: 'mono', text: tube.id })])
        tubeEls.push(t)
        tubesRow.append(t)
      }
    }
    for (let i = 0; i < tubesDef.length; i++) {
      const tube = tubesDef[i]!
      const t = tubeEls[i]
      if (t === undefined) continue
      t.className = 'tube-chip'
      toggleClass(t, 'loaded', tube.state === 'LOADED')
      toggleClass(t, 'ready', tube.state === 'READY')
      toggleClass(t, 'fired', tube.state === 'FIRED' || tube.state === 'RUNNING' || tube.state === 'HIT' || tube.state === 'MISSED' || tube.state === 'EXPIRED')
    }

    // --- contacts (I) ---
    const seen = new Set<string>()
    for (const c of snapshot.contacts) {
      seen.add(c.id)
      let row = contactRows.get(c.id)
      if (row === undefined) {
        row = el('button', {
          className: 'contact-row',
          onclick: () => selectContact(c.id === selectedContactId ? null : c.id),
        })
        contactRows.set(c.id, row)
        contactList.append(row)
      }
      renderContactRow(row, c, now, lang, tt)
      toggleClass(row, 'selected', c.id === selectedContactId)
    }
    for (const [id, row] of contactRows) {
      if (!seen.has(id)) {
        row.remove()
        contactRows.delete(id)
        if (id === selectedContactId) selectContact(null)
      }
    }
    // Empty state: split the localized key on ' — ' into title + hint line.
    const emptyText = tt('hud.contacts.empty')
    const sep = emptyText.indexOf(' — ')
    contactsEmpty.style.display = snapshot.contacts.length === 0 ? '' : 'none'
    if (sep >= 0) {
      setText(emptyTitle, emptyText.slice(0, sep))
      setText(emptyHint, emptyText.slice(sep + 3))
    } else {
      setText(emptyTitle, emptyText)
      setText(emptyHint, '')
    }

    // --- fire control card (I) ---
    const sel = snapshot.contacts.find((c) => c.id === selectedContactId)
    if (sel === undefined) {
      if (selectedContactId !== null) selectContact(null)
      fireCard.classList.add('placeholder')
      setText(fcTarget, '—')
      for (const cell of [fcBearing, fcRange, fcHdg, fcSpd, fcFiring, fcHp, fcSalvo]) setText(cell, '--')
      fcEstimated.style.display = 'none'
    } else {
      fireCard.classList.remove('placeholder')
      const sol = solveFireSolution(sel, sub, bal)
      const parts = formatFireSolution(sol, sel, lang)
      setText(fcTarget, parts.target)
      setText(fcBearing, parts.bearing)
      setText(fcRange, parts.range)
      setText(fcHdg, parts.targetHeading)
      setText(fcSpd, parts.targetSpeed)
      setText(fcFiring, parts.firingBearing)
      setText(fcHp, parts.hitProbability)
      setText(fcSalvo, parts.salvoProbability)
      fcEstimated.style.display = parts.estimated ? '' : 'none'
    }

    // --- periscope (t-026) -----------------------------------------------------------
    lastWallT = extras.wallT
    const ps = snapshot.periscope
    const pst = ps?.state ?? 'SUBMERGED'
    const pExposure = ps?.exposure ?? 0
    const pBand = ps?.exposureBand ?? 'NONE'

    // Status-card row: state chip (colored) + exposure bar (band color).
    setText(pScopeChip, tt(`periscope.state.${pst}`))
    pScopeChip.className = `pc-mini-chip ${pcStateClass(pst)}`
    pExposureFill.style.width = `${Math.min(100, pExposure)}%`
    pExposureFill.style.background = exposureBandColor(pBand)
    setText(pExposureValue, `${Math.round(pExposure)}%`)

    // Control card: status text, progress, reason, buttons.
    const transitioning = pst === 'SURFACING' || pst === 'RAISING' || pst === 'LOWERING'
    pcProgress.style.display = transitioning ? '' : 'none'
    if (transitioning) {
      pcProgressFill.style.width = `${Math.round((ps?.progress ?? 0) * 100)}%`
      setText(pcProgressPct, `${Math.round((ps?.progress ?? 0) * 100)}%`)
    }
    const cannotRaise = ps !== undefined && !ps.canRaise && ps.cannotRaiseReason !== 'none'
    if (cannotRaise) {
      setText(pcStatus, tt('periscope.status.cannotRaise'))
      setText(pcReason, tt(`periscope.reason.${ps!.cannotRaiseReason}`))
      pcReason.style.display = ''
    } else {
      pcReason.style.display = 'none'
      if (pst === 'SUBMERGED') setText(pcStatus, tt('periscope.status.ready'))
      else if (pst === 'SURFACING' || pst === 'RAISING') setText(pcStatus, tt('periscope.status.raising'))
      else if (pst === 'LOWERING') setText(pcStatus, tt(`periscope.state.${pst}`))
      else setText(pcStatus, tt('periscope.status.raised'))
    }
    const raised = pst === 'RAISED' || pst === 'OBSERVING'
    raiseBtn.style.display = pst === 'SUBMERGED' || pst === 'SURFACING' ? '' : 'none'
    raiseBtn.disabled = !(ps?.canRaise ?? true)
    raiseBtn.title = cannotRaise ? tt(`periscope.reason.${ps!.cannotRaiseReason}`) : ''
    lockBtn.style.display = raised ? '' : 'none'
    lowerBtn.style.display = raised ? '' : 'none'
    diveBtn.style.display = raised ? '' : 'none'
    const locked = ps?.lockedContactId !== null && ps?.lockedContactId !== undefined
    lockBtn.disabled = ps?.observingContactId === null || ps?.observingContactId === undefined || locked
    const lockLabel = locked ? tt('periscope.btn.locked') : tt('periscope.btn.lock')
    setText(lockBtn, lockLabel)
    setText(pvLockBtn, lockLabel)

    // Periscope VIEW overlay.
    periscopeView.style.display = raised ? '' : 'none'
    if (raised && ps !== undefined) {
      setText(pvBearing, `VIEW ${String(Math.round(ps.viewBearingDeg) % 360).padStart(3, '0')}°`)
      setText(pvRaisedTime, tt('periscope.raisedTime', { t: formatTime(ps.raisedDurationS) }))
      pvExposureFill.style.width = `${Math.min(100, pExposure)}%`
      pvExposureFill.style.background = exposureBandColor(pBand)
      setText(pvExposureValue, `${Math.round(pExposure)}%`)

      // --- periscope scene (t-028b): ships on the horizon ---
      pvWeather.className = `pv-weather pv-w-${String(extras.weather ?? 'Clear').toLowerCase().replace('->', '-').split('-')[0]!.replace('+', '-')}`
      const viewBearing = ps.viewBearingDeg ?? sub.headingDeg
      const seenShips = new Set<string>()
      for (const c of snapshot.contacts) {
        if (c.trueShipId === null || c.rangeKm === null || c.state === 'UNKNOWN') continue
        const ship = snapshot.enemies.find((e) => e.id === c.trueShipId)
        if (ship === undefined || ship.hull <= 0) continue
        const placement = periscopePlacement(c.bearingDeg, viewBearing, c.rangeKm)
        if (placement === null) continue
        seenShips.add(c.id)
        let shipEl = shipEls.get(c.id)
        if (shipEl === undefined) {
          shipEl = el('div', { className: 'pv-ship' })
          shipEls.set(c.id, shipEl)
          pvShips.append(shipEl)
        }
        shipEl.style.left = `${placement.xPct}%`
        shipEl.style.width = `${Math.round(72 * placement.scale)}px`
        shipEl.className = 'pv-ship' + (c.id === ps.observingContactId ? ' observed' : '')
        shipEl.textContent = ''
        shipEl.append(shipSilhouetteEl(ship.shipClass))
      }
      for (const [id, shipEl] of shipEls) {
        if (!seenShips.has(id)) {
          shipEl.remove()
          shipEls.delete(id)
        }
      }
      const obs = ps.observingContactId === null ? undefined : snapshot.contacts.find((c) => c.id === ps.observingContactId)
      if (obs === undefined) {
        setText(pvTargetType, tt('class.Unknown'))
        setText(pvBearingVal, '--')
        setText(pvRangeVal, '--')
        setText(pvSpeedVal, '--')
        setText(pvCourseVal, '--')
        setText(pvClassVal, '--')
        setText(pvConfVal, '--')
        pvStatusChip.style.display = 'none'
      } else {
        const cls = tt(`class.${obs.classification}`)
        setText(pvTargetType, cls)
        setText(pvBearingVal, `${String(Math.round(obs.bearingDeg) % 360).padStart(3, '0')}°`)
        setText(pvRangeVal, obs.rangeKm === null ? '--' : `${obs.rangeKm.toFixed(2)}KM`)
        setText(pvSpeedVal, obs.speedEstimateKt === null ? '--' : `${Math.round(obs.speedEstimateKt)}KT`)
        setText(pvCourseVal, obs.headingEstimateDeg === null ? '--' : `${String(Math.round(obs.headingEstimateDeg) % 360).padStart(3, '0')}°`)
        setText(pvClassVal, `${cls} · ${Math.round(obs.confidence)}%`)
        setText(pvConfVal, `${Math.round(obs.confidence)}%`)
        pvStatusChip.style.display = ''
        if (obs.visuallyConfirmed) {
          setText(pvStatusChip, tt('fc.status.visualConfirmed'))
          pvStatusChip.className = 'status-chip is-success'
        } else {
          setText(pvStatusChip, tt('fc.status.estimated'))
          pvStatusChip.className = 'status-chip is-info'
        }
      }
      pvLockBtn.disabled = ps.observingContactId === null || locked
    }

    // Fire-warning banner timing (6 s from showFireWarning()).
    if (fireWarningUntil !== null && extras.wallT >= fireWarningUntil) {
      fireWarningUntil = null
      fireWarn.style.display = 'none'
    }
  }

  function appendLog(entry: EventEntry): void {
    if (entry.id <= lastLogEntryId) return
    lastLogEntryId = entry.id
    const line = formatEvent(entry, lang)
    if (line === null) return
    logEntries.push(entry)
    if (logEntries.length > LOG_CAPACITY) logEntries.shift()
    // Phase divider groups the timeline by mission phase.
    const phase = eventPhase(entry.type)
    if (phase !== lastPhase) {
      lastPhase = phase
      timelineBody.append(el('div', { className: 'tl-phase', text: phase }))
    }
    const row = el('div', { className: 'tl-row' }, [
      el('span', { className: `tl-dot ${eventSeverityFor(entry)}` }),
      el('span', { className: 'tl-time', text: formatTime(entry.simTime) }),
      el('span', { className: 'tl-text', text: line }),
    ])
    timelineBody.append(row)
    while (timelineBody.childElementCount > LOG_CAPACITY + 8) {
      timelineBody.removeChild(timelineBody.firstChild as Node)
    }
    timelineBody.scrollTop = timelineBody.scrollHeight
  }

  function reset(): void {
    selectedContactId = null
    lastLogEntryId = 0
    lastPhase = ''
    logEntries.length = 0
    timelineBody.textContent = ''
    contactRows.clear()
    contactList.textContent = ''
    objectiveRows.clear()
    taskList.textContent = ''
    tubeEls.length = 0
    tubesRow.textContent = ''
    fireCard.classList.add('placeholder')
    periscopeView.style.display = 'none'
    fireWarningUntil = null
    fireWarn.style.display = 'none'
    setSalvo(1)
  }

  /** t-026: show the post-fire exposure warning banner (~6 s wall time). */
  function showFireWarning(): void {
    fireWarningUntil = lastWallT + 6
    setText(fireWarnText, `${tt('periscope.warn.torpedoFired')} — ${tt('periscope.warn.detected')}`)
    fireWarn.style.display = ''
  }

  function setLanguage(next: Lang): void {
    lang = next
    tt = getT(lang)
    for (const [node, key] of labelRegistry) {
      setText(node, tt(key))
    }
    // Language chip label (own-language) + settings button.
    const info = LANGS.find((l) => l.code === lang)
    if (info !== undefined) setText(langChip, info.label)
    // Re-compose dynamic text that mixes two keys.
    if (fireWarn.style.display !== 'none') {
      setText(fireWarnText, `${tt('periscope.warn.torpedoFired')} — ${tt('periscope.warn.detected')}`)
    }
    setText(lockBtn, tt('periscope.btn.lock'))
    setText(pvLockBtn, tt('periscope.btn.lock'))
  }

  // Initial language chip label.
  const info = LANGS.find((l) => l.code === lang)
  if (info !== undefined) setText(langChip, info.label)

  return { update, appendLog, reset, setLanguage, showFireWarning, root }
}

// ---------------------------------------------------------------------------
// Small construction helpers
// ---------------------------------------------------------------------------

/** Periscope state → chip CSS class (t-026). */
function pcStateClass(state: string): string {
  switch (state) {
    case 'RAISED':
    case 'OBSERVING':
      return 'pc-up'
    case 'RAISING':
    case 'SURFACING':
      return 'pc-raising'
    case 'LOWERING':
      return 'pc-lowering'
    default:
      return 'pc-down'
  }
}

/** Compass wrap to [-180, 180). */
function wrapDeg(d: number): number {
  return ((d + 540) % 360) - 180
}

/**
 * t-028b: periscope scene placement — where a contact appears on the horizon
 * view given the periscope's view bearing. Pure + testable.
 * - delta = wrapped bearing offset from the view centre; FOV ±22° (+6° edge);
 * - xPct: screen X as a percentage (6..94), centre = view bearing;
 * - scale: ship size multiplier from range (closer = bigger, 3 km = 1.0).
 * Returns null when the contact is outside the view cone.
 */
export function periscopePlacement(
  bearingDeg: number,
  viewBearingDeg: number,
  rangeKm: number,
): { xPct: number; scale: number } | null {
  const delta = wrapDeg(bearingDeg - viewBearingDeg)
  const fovHalf = 22
  if (Math.abs(delta) > fovHalf + 6) return null
  const xPct = Math.max(6, Math.min(94, 50 + (delta / fovHalf) * 44))
  const scale = Math.max(0.5, Math.min(2.5, 3 / Math.max(0.5, rangeKm)))
  return { xPct, scale }
}

/** Per-class ship silhouette (side view) as SVG shapes. */
const SHIP_SILHOUETTES: Record<string, [string, Record<string, number | string>][]> = {
  Merchant: [
    ['path', { d: 'M26 68 h188 v-10 q0 -8 -12 -8 h-34 l-10 -14 h-26 l-8 14 h-96 q-12 0 -12 8 z' }],
    ['rect', { x: '72', y: '30', width: '3', height: '38' }],
    ['rect', { x: '65', y: '25', width: '17', height: '6' }],
    ['rect', { x: '152', y: '34', width: '3', height: '34' }],
    ['rect', { x: '104', y: '44', width: '20', height: '12' }],
    ['rect', { x: '124', y: '39', width: '9', height: '12' }],
  ],
  Cargo: [
    ['path', { d: 'M24 68 h192 v-10 q0 -8 -12 -8 h-36 l-10 -14 h-26 l-8 14 h-98 q-12 0 -12 8 z' }],
    ['rect', { x: '58', y: '44', width: '28', height: '14' }],
    ['rect', { x: '90', y: '44', width: '28', height: '14' }],
    ['rect', { x: '58', y: '33', width: '28', height: '11' }],
    ['rect', { x: '90', y: '33', width: '28', height: '11' }],
    ['rect', { x: '148', y: '44', width: '22', height: '12' }],
    ['rect', { x: '168', y: '37', width: '9', height: '11' }],
  ],
  Tanker: [
    ['path', { d: 'M14 68 h212 v-12 q0 -8 -12 -8 h-38 l-8 -10 h-104 q-10 0 -10 8 v-2 h-28 q-12 0 -12 8 z' }],
    ['rect', { x: '158', y: '46', width: '24', height: '12' }],
    ['rect', { x: '174', y: '41', width: '9', height: '8' }],
    ['rect', { x: '96', y: '36', width: '3', height: '32' }],
    ['rect', { x: '122', y: '36', width: '3', height: '32' }],
  ],
  Destroyer: [
    ['path', { d: 'M8 68 h224 l-8 -18 q-10 -6 -22 -4 l-4 -6 h-24 l6 10 q-64 -10 -118 -6 l-46 4 q-12 2 -12 10 z' }],
    ['rect', { x: '58', y: '40', width: '18', height: '8' }],
    ['rect', { x: '64', y: '35', width: '5', height: '7' }],
    ['rect', { x: '118', y: '37', width: '11', height: '17' }],
    ['rect', { x: '178', y: '44', width: '15', height: '6' }],
  ],
  Frigate: [
    ['path', { d: 'M14 68 h212 l-6 -14 q-8 -4 -18 -2 l-2 -4 h-20 l4 6 q-50 -8 -96 -6 l-60 4 q-12 2 -14 8 z' }],
    ['rect', { x: '50', y: '44', width: '13', height: '6' }],
    ['rect', { x: '102', y: '39', width: '10', height: '15' }],
    ['rect', { x: '140', y: '36', width: '3', height: '30' }],
  ],
  Submarine: [
    ['path', { d: 'M10 68 h220 v-10 q0 -6 -10 -6 h-200 q-10 0 -10 6 z' }],
    ['rect', { x: '104', y: '48', width: '32', height: '14' }],
  ],
}

/** t-028c: in-HUD controls & key reference (below the fire control card). */
export const CONTROL_BINDINGS: readonly { key: string; labelKey: string }[] = [
  { key: 'W / S', labelKey: 'hud.controls.throttle' },
  { key: 'A / D', labelKey: 'hud.controls.rudder' },
  { key: 'Q / E', labelKey: 'hud.controls.depth' },
  { key: 'SPACE', labelKey: 'hud.controls.ping' },
  { key: 'F', labelKey: 'hud.controls.fire' },
  { key: 'R', labelKey: 'hud.controls.silent' },
  { key: 'G', labelKey: 'hud.controls.decoy' },
  { key: 'P', labelKey: 'hud.controls.periscope' },
  { key: 'L', labelKey: 'hud.controls.lock' },
  { key: 'X', labelKey: 'hud.controls.dive' },
  { key: 'ESC', labelKey: 'hud.controls.pause' },
  { key: 'F12', labelKey: 'hud.controls.screenshot' },
]

/** Build a per-class silhouette as an inline SVG element (Node-safe: only
 *  called from the DOM update path). */
function shipSilhouetteEl(cls: string): HTMLElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 240 80')
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet')
  const shapes = SHIP_SILHOUETTES[cls] ?? SHIP_SILHOUETTES['Merchant']!
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(ns, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
    svg.append(node)
  }
  return svg as unknown as HTMLElement
}

/**
 * t-028: active-sonar availability for the HUD. Pure + testable.
 * - low battery (sub.lowBattery) → 'unavailable' (the submarine system blocks
 *   pings below balance.battery.lowBatteryThreshold);
 * - pingCooldown > 0 → 'cooldown' with remaining seconds + bar fraction
 *   (full when ready; fraction = 1 − remaining/cooldownSeconds);
 * - else 'ready'.
 */
export function pingStatus(
  sub: { pingCooldown: number; lowBattery: boolean },
  balance: BalanceConfig,
): { state: 'ready' | 'cooldown' | 'unavailable'; seconds: number; fraction: number } {
  if (sub.lowBattery) return { state: 'unavailable', seconds: 0, fraction: 1 }
  const cd = Math.max(0, sub.pingCooldown)
  if (cd > 0) {
    const total = balance.sonar.active.cooldownSeconds
    return { state: 'cooldown', seconds: cd, fraction: Math.max(0, Math.min(1, 1 - cd / total)) }
  }
  return { state: 'ready', seconds: 0, fraction: 1 }
}

function setBar(bar: { fill: HTMLElement; row: HTMLElement }, value: number, semantic: 'success' | 'info' | 'warning' | 'error'): void {
  bar.fill.style.width = `${Math.min(100, Math.max(0, value))}%`
  bar.fill.className = `bar-fill ${semantic}`
}

function fcRow(tt: Translator, key: string, value: HTMLElement, wide = ''): HTMLElement {
  const className = wide !== '' ? `fc-row ${wide}` : 'fc-row'
  return el('div', { className }, [
    el('span', { className: 'fc-label', text: tt(key) }),
    value,
  ])
}

function salvoButton(n: '1' | '2', active: boolean): HTMLElement {
  return el('button', { className: `salvo-btn${active ? ' active' : ''}`, text: n })
}

/** Render one contact row (primary: type+range; secondary: bearing/conf/seen). */
function renderContactRow(row: HTMLElement, c: Contact, now: number, lang: Lang, tt: Translator): void {
  if (row.childElementCount === 0) {
    row.append(
      el('div', { className: 'contact-primary' }, [
        el('span', { className: 'contact-type' }),
        el('span', { className: 'contact-id' }),
        el('span', { className: 'contact-range' }),
      ]),
      el('div', { className: 'contact-meta' }, [
        el('span', { className: 'mono' }),
        el('span', { className: 'mono' }),
        el('span', { className: 'mono' }),
      ]),
    )
  }
  const primary = row.children[0] as HTMLElement
  const meta = row.children[1] as HTMLElement
  const typeEl = primary.children[0] as HTMLElement
  const idEl = primary.children[1] as HTMLElement
  const rangeEl = primary.children[2] as HTMLElement
  const bearingEl = meta.children[0] as HTMLElement
  const confEl = meta.children[1] as HTMLElement
  const seenEl = meta.children[2] as HTMLElement

  setText(typeEl, tt(`class.${c.classification}`))
  setText(idEl, c.id)
  setText(rangeEl, c.rangeKm === null ? '--' : c.rangeKm >= 10 ? `${Math.round(c.rangeKm)}KM` : `${c.rangeKm.toFixed(1)}KM`)
  setText(bearingEl, `${tt('hud.contact.bearing')} ${String(Math.round(c.bearingDeg) % 360).padStart(3, '0')}°`)
  setText(confEl, `${tt('hud.contact.confidence')} ${Math.round(c.confidence)}%`)
  setText(seenEl, `${tt('hud.contact.lastSeen')} ${formatLastSeen(c.lastDetectedAt, now, lang)}`)
}
