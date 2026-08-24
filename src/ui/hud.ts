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
  const suffix = contactId ?? targetId ?? shipId
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
}

/** Format a FireSolution into card strings ("--" for unknown inputs). */
export function formatFireSolution(solution: FireSolution, contact: Contact, lang: Lang = 'en'): FireControlParts {
  const tt = getT(lang)
  const three = (v: number | null): string => (v === null ? '--' : String(Math.round(v)).padStart(3, '0') + '°')
  const rangeStr = (km: number | null): string =>
    km === null ? '--' : km >= 10 ? `${Math.round(km)}KM` : `${km.toFixed(1)}KM`
  const speedStr = (kt: number | null): string => (kt === null ? '--' : `${Math.round(kt)}KT`)
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

/** EventType → timeline severity (t-023; pure, unit-tested). */
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
  // warning
  'torpedo.missed': 'warning',
  'torpedo.expired': 'warning',
  'torpedo.fireRejected': 'warning',
  'contact.degraded': 'warning',
  'sub.damaged': 'warning',
  'battery.low': 'warning',
  'detection.threshold': 'warning',
  'sub.forcedSurface': 'warning',
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

/** Mission-phase group of an event (technical micro-label for the timeline). */
export function eventPhase(type: EventType): string {
  if (type.startsWith('sonar.') || type.startsWith('contact.')) return 'SONAR'
  if (type.startsWith('torpedo.')) return 'TORPEDO'
  if (type.startsWith('depthCharge.') || type.startsWith('deckGun.') || type === 'ship.sunk') return 'COMBAT'
  if (type.startsWith('sub.') || type === 'battery.low' || type === 'detection.threshold' || type === 'player.located' || type === 'decoy.launched') return 'SUB'
  if (type.startsWith('mission.') || type === 'escape.escaped') return 'MISSION'
  return 'SYS'
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
}

export interface HudOptions {
  /** Contact row clicked → select (shell forwards to input + renderer). */
  onSelectContact: (contactId: string | null) => void
  /** Salvo selector changed. */
  onSalvoChange: (salvo: 1 | 2) => void
  /** Top-bar settings / language entry clicked (shell opens Settings). */
  onOpenSettings: () => void
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

  const statusCard = el('div', { className: 'card' }, [
    el('div', { className: 'status-readouts' }, readouts),
    el('div', { className: 'status-bars' }, [
      batteryBar.row,
      hullBar.row,
      noiseBar.row,
      detectionBar.row,
    ]),
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

  const leftCol = el('div', { className: 'hud-left' }, [statusCard, tasksCard, tubesCard])

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

  const rightCol = el('div', { className: 'hud-right' }, [
    el('div', { className: 'card' }, [
      el('div', { className: 'card-head' }, [label('hud.contacts', 'card-title')]),
      contactsEmpty,
      contactList,
    ]),
    fireCard,
  ])

  // --- bottom: activity timeline (K) ------------------------------------------------
  const timelineBody = el('div', { className: 'timeline-body' })
  const timeline = el('div', { className: 'card hud-timeline' }, [
    el('div', { className: 'card-head' }, [label('hud.log', 'card-title')]),
    timelineBody,
  ])

  root.append(topbar, workspace, leftCol, rightCol, timeline)

  // --- state ------------------------------------------------------------------------
  const contactRows = new Map<string, HTMLElement>()
  const objectiveRows = new Map<string, HTMLElement>()
  const tubeEls: HTMLElement[] = []
  let selectedContactId: string | null = null
  let currentSalvo: 1 | 2 = 1
  let lastLogEntryId = 0
  let lastPhase = ''
  const logEntries: EventEntry[] = []

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

    // --- status readouts (G) ---
    const layerCfg = bal.depthLayers[sub.depthLayer]
    setText(
      depthValue,
      tt('hud.depthValue', {
        layer: tt(`hud.layer.${sub.depthLayer}`),
        min: Math.round(layerCfg.minM),
        max: Math.round(layerCfg.maxM),
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
      el('span', { className: `tl-dot ${eventSeverity(entry.type)}` }),
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
    setSalvo(1)
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
  }

  // Initial language chip label.
  const info = LANGS.find((l) => l.code === lang)
  if (info !== undefined) setText(langChip, info.label)

  return { update, appendLog, reset, setLanguage, root }
}

// ---------------------------------------------------------------------------
// Small construction helpers
// ---------------------------------------------------------------------------

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
