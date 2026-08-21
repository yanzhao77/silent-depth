/**
 * SILENT DEPTH — tactical HUD (src/ui/hud.ts)
 *
 * GAME_DESIGN §11.2 / FR-18 — the DOM overlay layer (L6). Built with the
 * safe helpers from dom.ts: every value is textContent, never innerHTML
 * (GAME_ARCHITECTURE §12). Updated from GameSnapshot each render frame with
 * diff-minimal writes (setText only touches changed values).
 *
 * Layout (CSS classes in src/style.css):
 *   .hud-topbar   — depth / speed / heading / battery / hull / noise /
 *                   detection (5-band) / objectives (collapsible) / timer /
 *                   weather
 *   .hud-tubes    — torpedo tubes (LOADED white / READY green / FIRED empty)
 *                   + salvo selector 1–2
 *   .hud-contacts — contact rows `id | type | bearing | range | speed |
 *                   heading | confidence | lastSeen`; click selects →
 *                   fire control card (TARGET / BEARING / RANGE / TARGET HDG /
 *                   SPD / RECOMMENDED FIRING BEARING / HIT PROBABILITY, §7.3)
 *   .hud-log      — event log, mm:ss timestamps, tail 50 (FR-18 wording)
 *
 * Pure helpers (exported for Node unit tests, tests/unit/ui.test.ts):
 *   formatTime / formatEvent / formatFireSolution / formatLastSeen /
 *   detectionBandIndex / DETECTION_BAND_COLORS
 *
 * DESIGN DECISIONS:
 *  - Event log lines follow FR-18 exactly for the ten named entries
 *    (SONAR CONTACT DETECTED … MISSION COMPLETE); every other catalogue
 *    event gets a stable uppercase line. The noisy UI events
 *    (sub.speedChanged / sub.depthChanged / ui.click) are suppressed — they
 *    are shell-driven and would flood the log (formatEvent returns null).
 *  - Detection meter colors: 5-band green → yellow → orange → red → deep red
 *    (GAME_DESIGN §11.2 "绿/黄/橙/红/深红"), indexed by
 *    balance.detection.bands.
 *  - Depth is displayed as the layer name + its balance min–max metres
 *    (the engine tracks layers, not exact metres).
 *  - The weather chip uses short military codes (CLR/CLD/STM/FOG/NGT) —
 *    monospace-safe glyphs instead of emoji that render inconsistently
 *    across fonts.
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — DOM touched only inside functions; importable in Node.
 */

import type { BalanceConfig } from '../core/balance'
import { solveFireSolution, type FireSolution } from '../combat/fireControl'
import type {
  Contact,
  DepthLayer,
  EventEntry,
  EventType,
  GameSnapshot,
  MissionDef,
  WeatherKind,
} from '../core/types'
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
export function formatEvent(entry: EventEntry): string | null {
  const label = EVENT_LABELS[entry.type]
  if (label === undefined) return null
  const payload = entry.payload
  const contactId =
    typeof payload?.contactId === 'string' ? (payload.contactId as string) : null
  const targetId = typeof payload?.targetId === 'string' ? (payload.targetId as string) : null
  const shipId = typeof payload?.shipId === 'string' ? (payload.shipId as string) : null
  const suffix = contactId ?? targetId ?? shipId
  return suffix !== null && suffix.length > 0 ? `${label} — ${suffix}` : label
}

/** EventType → FR-18 log text (all catalogue members; null = suppressed). */
const EVENT_LABELS: Partial<Record<EventType, string>> = {
  'sonar.ping': 'ACTIVE PING',
  'sonar.contact': 'SONAR RETURN',
  'sonar.passive': 'PASSIVE CONTACT',
  'contact.detected': 'SONAR CONTACT DETECTED',
  'contact.classified': 'CONTACT CLASSIFIED',
  'contact.degraded': 'CONTACT DEGRADED',
  'contact.lost': 'CONTACT LOST',
  'torpedo.ready': 'TORPEDO READY',
  'torpedo.fired': 'TORPEDO FIRED',
  'torpedo.hit': 'TARGET HIT',
  'torpedo.missed': 'TORPEDO MISSED',
  'torpedo.expired': 'TORPEDO EXPIRED',
  'torpedo.fireRejected': 'FIRE REJECTED',
  'ship.sunk': 'SHIP SUNK',
  'depthCharge.dropped': 'DEPTH CHARGES DROPPED',
  'depthCharge.detonated': 'DEPTH CHARGE DETONATED',
  'deckGun.fired': 'DECK GUN FIRED',
  'sub.damaged': 'HULL DAMAGED',
  'sub.forcedSurface': 'FORCED TO SURFACE',
  'battery.low': 'LOW BATTERY',
  'detection.threshold': 'DETECTION WARNING',
  'player.located': 'PLAYER LOCATED',
  'decoy.launched': 'DECOY LAUNCHED',
  'escape.escaped': 'ESCAPED',
  'mission.victory': 'MISSION ACCOMPLISHED',
  'mission.defeat': 'MISSION FAILED',
  'mission.complete': 'MISSION COMPLETE',
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
export function formatFireSolution(solution: FireSolution, contact: Contact): FireControlParts {
  const three = (v: number | null): string => (v === null ? '--' : String(Math.round(v)).padStart(3, '0') + '°')
  const rangeStr = (km: number | null): string =>
    km === null ? '--' : km >= 10 ? `${Math.round(km)}KM` : `${km.toFixed(1)}KM`
  const speedStr = (kt: number | null): string => (kt === null ? '--' : `${Math.round(kt)}KT`)
  return {
    target: `${contact.id} ${contact.classification}`,
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
export function formatLastSeen(lastDetectedAt: number, now: number): string {
  const dt = Math.max(0, Math.round(now - lastDetectedAt))
  if (dt < 1) return 'NOW'
  if (dt < 60) return `${dt}S`
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

/** Weather chip codes (monospace-safe). */
export const WEATHER_CODES: Record<WeatherKind, string> = {
  Clear: 'CLR',
  Cloudy: 'CLD',
  Storm: 'STM',
  Fog: 'FOG',
  Night: 'NGT',
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
}

export interface HudOptions {
  /** Contact row clicked → select (shell forwards to input + renderer). */
  onSelectContact: (contactId: string | null) => void
  /** Salvo selector changed. */
  onSalvoChange: (salvo: 1 | 2) => void
  /** Mission objectives panel collapsed/expanded. */
  onToggleObjectives?: (collapsed: boolean) => void
}

export interface Hud {
  /** Diff-minimal update from the latest snapshot. */
  update(snapshot: GameSnapshot, extras: HudExtras): void
  /** Append one log line (main forwards new snapshot events). */
  appendLog(entry: EventEntry): void
  /** Reset per-mission state (tubes, log, selection). */
  reset(): void
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

  // --- top bar ------------------------------------------------------------
  const depthValue = el('span', { className: 'hud-value' })
  const speedValue = el('span', { className: 'hud-value' })
  const headingValue = el('span', { className: 'hud-value' })
  const batteryValue = el('span', { className: 'hud-value' })
  const hullValue = el('span', { className: 'hud-value' })
  const noiseValue = el('span', { className: 'hud-value' })
  const detectionValue = el('span', { className: 'hud-value' })
  const detectionBar = el('div', { className: 'hud-meter-bar' })
  const objectivesList = el('div', { className: 'hud-objectives-list' })
  const timerValue = el('span', { className: 'hud-value hud-timer' })
  const weatherValue = el('span', { className: 'hud-weather' })

  const batteryChip = chip('BATTERY', batteryValue, 'hud-chip-battery')
  const hullChip = chip('HULL', hullValue, 'hud-chip-hull')
  const detectionChip = chip('DETECTION', [detectionValue, detectionBar], 'hud-chip-detection')

  const objectivesHeader = el(
    'button',
    {
      className: 'hud-objectives-toggle',
      text: 'OBJECTIVES ▾',
      onclick: () => {
        const collapsed = objectivesList.style.display === 'none'
        objectivesList.style.display = collapsed ? '' : 'none'
        objectivesHeader.textContent = collapsed ? 'OBJECTIVES ▾' : 'OBJECTIVES ▸'
        opts.onToggleObjectives?.(!collapsed)
      },
    },
  )

  const topbar = el('div', { className: 'hud-topbar' }, [
    chip('DEPTH', depthValue),
    chip('SPEED', speedValue),
    chip('HEADING', headingValue),
    batteryChip,
    hullChip,
    chip('NOISE', noiseValue),
    detectionChip,
    el('div', { className: 'hud-objectives' }, [objectivesHeader, objectivesList]),
    el('div', { className: 'hud-timer-chip' }, [el('span', { className: 'hud-label', text: 'TIME' }), timerValue]),
    el('div', { className: 'hud-weather-chip' }, [weatherValue]),
  ])

  // --- torpedo tubes + salvo ------------------------------------------------
  const tubesRow = el('div', { className: 'hud-tubes-row' })
  const salvo1 = salvoButton('1', true)
  const salvo2 = salvoButton('2', false)
  const tubes = el('div', { className: 'hud-tubes' }, [
    el('div', { className: 'hud-tubes-title' }, ['TORPEDOES']),
    tubesRow,
    el('div', { className: 'hud-salvo' }, [
      el('span', { className: 'hud-label', text: 'SALVO' }),
      salvo1,
      salvo2,
    ]),
  ])

  // --- contact panel + fire control card -----------------------------------
  const contactList = el('div', { className: 'hud-contact-list' })
  const fcTarget = el('span', { className: 'hud-fc-value' })
  const fcBearing = el('span', { className: 'hud-fc-value' })
  const fcRange = el('span', { className: 'hud-fc-value' })
  const fcHdg = el('span', { className: 'hud-fc-value' })
  const fcSpd = el('span', { className: 'hud-fc-value' })
  const fcFiring = el('span', { className: 'hud-fc-value' })
  const fcHp = el('span', { className: 'hud-fc-value hud-fc-hp' })
  const fcSalvo = el('span', { className: 'hud-fc-value' })
  const fcEstimated = el('div', { className: 'hud-fc-est', text: 'ESTIMATED SOLUTION' })

  const fireCard = el('div', { className: 'hud-firecard' }, [
    el('div', { className: 'hud-firecard-title', text: 'FIRE CONTROL' }),
    fcRow('TARGET', fcTarget),
    fcRow('BEARING', fcBearing),
    fcRow('RANGE', fcRange),
    fcRow('TARGET HDG', fcHdg),
    fcRow('TARGET SPD', fcSpd),
    fcRow('REC. FIRING BRG', fcFiring),
    fcRow('HIT PROBABILITY', fcHp),
    fcRow('SALVO (2)', fcSalvo),
    fcEstimated,
  ])
  const contactsPanel = el('div', { className: 'hud-contacts' }, [
    el('div', { className: 'hud-panel-title', text: 'CONTACTS' }),
    contactList,
    fireCard,
  ])

  // --- event log ------------------------------------------------------------
  const logBody = el('div', { className: 'hud-log' })
  const logPanel = el('div', { className: 'hud-log-wrap' }, [
    el('div', { className: 'hud-panel-title', text: 'EVENT LOG' }),
    logBody,
  ])

  root.append(topbar, tubes, contactsPanel, logPanel)

  // --- state ----------------------------------------------------------------
  const contactRows = new Map<string, HTMLElement>()
  const objectiveRows = new Map<string, HTMLElement>()
  const tubeEls: HTMLElement[] = []
  let selectedContactId: string | null = null
  let currentSalvo: 1 | 2 = 1
  let lastLogEntryId = 0
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

  // --- update --------------------------------------------------------------
  function update(snapshot: GameSnapshot, extras: HudExtras): void {
    const sub = snapshot.playerSub
    const bal = extras.balance
    const now = snapshot.simTime

    // Depth (layer name + balance min–max metres).
    const layerCfg = bal.depthLayers[sub.depthLayer]
    setText(depthValue, `${sub.depthLayer.toUpperCase()} ${Math.round(layerCfg.minM)}–${Math.round(layerCfg.maxM)}M`)

    // Speed (kt + band).
    setText(speedValue, `${sub.speedKt.toFixed(1).replace(/\.0$/, '')} KT ${sub.speedBand}`)

    // Heading.
    setText(headingValue, `${String(Math.round(sub.headingDeg) % 360).padStart(3, '0')}°`)

    // Battery (LOW BATTERY <10 blinks via CSS class).
    setText(batteryValue, `${Math.round(sub.battery)}%${sub.lowBattery ? ' LOW BATTERY' : ''}`)
    toggleClass(batteryChip, 'low', sub.lowBattery)

    // Hull (<30 red).
    setText(hullValue, `${Math.round(sub.hull)}%`)
    toggleClass(hullChip, 'danger', sub.hull < 30)

    // Noise.
    setText(noiseValue, `${Math.round(sub.noise)}`)

    // Detection (0–100, 5-band color).
    setText(detectionValue, `${Math.round(sub.detection)}`)
    const bandIdx = detectionBandIndex(sub.detection, bal.detection.bands)
    detectionBar.style.width = `${Math.min(100, sub.detection)}%`
    detectionBar.style.background = DETECTION_BAND_COLORS[bandIdx] ?? DETECTION_BAND_COLORS[0]!

    // Objectives (collapsible; diff via id → row map).
    const objectives = snapshot.mission.objectives
    for (const [id, row] of objectiveRows) {
      if (!objectives.some((o) => o.id === id)) row.remove()
      objectiveRows.delete(id)
    }
    for (const obj of objectives) {
      let row = objectiveRows.get(obj.id)
      if (row === undefined) {
        row = el('div', { className: 'hud-objective-row' }, [
          el('span', { className: 'hud-objective-mark' }),
          el('span', { className: 'hud-objective-desc' }),
        ])
        objectiveRows.set(obj.id, row)
        objectivesList.append(row)
      }
      const mark = row.firstChild as HTMLElement
      const desc = row.lastChild as HTMLElement
      mark.textContent = obj.done ? '✓' : '○'
      toggleClass(row, 'done', obj.done)
      setText(desc, obj.desc)
    }

    // Timer + weather.
    setText(timerValue, formatTime(now))
    setText(weatherValue, WEATHER_CODES[extras.weather] ?? 'CLR')

    // Torpedo tubes (built once per mission; state class updated cheaply).
    const tubesDef = sub.torpedoTubes
    if (tubeEls.length !== tubesDef.length) {
      tubesRow.textContent = ''
      tubeEls.length = 0
      for (const tube of tubesDef) {
        const t = el('div', {
          className: 'hud-tube',
          title: `${tube.id} — ${tube.state}`,
          attrs: { 'aria-label': tube.id },
        }, [el('span', { className: 'hud-tube-id', text: tube.id })])
        tubeEls.push(t)
        tubesRow.append(t)
      }
    }
    for (let i = 0; i < tubesDef.length; i++) {
      const tube = tubesDef[i]!
      const t = tubeEls[i]
      if (t === undefined) continue
      t.className = 'hud-tube'
      toggleClass(t, 'loaded', tube.state === 'LOADED')
      toggleClass(t, 'ready', tube.state === 'READY')
      toggleClass(t, 'fired', tube.state === 'FIRED' || tube.state === 'RUNNING' || tube.state === 'HIT' || tube.state === 'MISSED' || tube.state === 'EXPIRED')
    }

    // Contact panel (id → row map, diff minimal).
    const seen = new Set<string>()
    for (const c of snapshot.contacts) {
      seen.add(c.id)
      let row = contactRows.get(c.id)
      if (row === undefined) {
        row = el('button', {
          className: 'hud-contact-row',
          onclick: () => selectContact(c.id === selectedContactId ? null : c.id),
        })
        contactRows.set(c.id, row)
        contactList.append(row)
      }
      renderContactRow(row, c, now)
      toggleClass(row, 'selected', c.id === selectedContactId)
    }
    for (const [id, row] of contactRows) {
      if (!seen.has(id)) {
        row.remove()
        contactRows.delete(id)
        if (id === selectedContactId) selectContact(null)
      }
    }

    // Fire control card for the selected contact.
    const sel = snapshot.contacts.find((c) => c.id === selectedContactId)
    if (sel === undefined) {
      if (selectedContactId !== null) selectContact(null)
      fireCard.classList.add('empty')
      setText(fcTarget, '—')
      for (const cell of [fcBearing, fcRange, fcHdg, fcSpd, fcFiring, fcHp, fcSalvo]) setText(cell, '--')
      fcEstimated.style.display = 'none'
    } else {
      fireCard.classList.remove('empty')
      const sol = solveFireSolution(sel, sub, bal)
      const parts = formatFireSolution(sol, sel)
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
    const line = formatEvent(entry)
    if (line === null) return
    logEntries.push(entry)
    if (logEntries.length > LOG_CAPACITY) logEntries.shift()
    const row = el('div', { className: 'hud-log-row' }, [
      el('span', { className: 'hud-log-time', text: formatTime(entry.simTime) }),
      el('span', { className: 'hud-log-text', text: line }),
    ])
    logBody.append(row)
    // Trim DOM rows to the capacity (keep scroll at bottom).
    while (logBody.childElementCount > LOG_CAPACITY) {
      logBody.removeChild(logBody.firstChild as Node)
    }
    logBody.scrollTop = logBody.scrollHeight
  }

  function reset(): void {
    selectedContactId = null
    lastLogEntryId = 0
    logEntries.length = 0
    logBody.textContent = ''
    contactRows.clear()
    contactList.textContent = ''
    objectiveRows.clear()
    objectivesList.textContent = ''
    tubeEls.length = 0
    tubesRow.textContent = ''
    fireCard.classList.add('empty')
    setSalvo(1)
  }

  return { update, appendLog, reset, root }
}

// ---------------------------------------------------------------------------
// Small construction helpers
// ---------------------------------------------------------------------------

function chip(label: string, content: Child | Child[], className = ''): HTMLElement {
  const children = Array.isArray(content) ? content : [content]
  return el('div', { className: `hud-chip ${className}` }, [
    el('span', { className: 'hud-label', text: label }),
    ...children,
  ])
}

function fcRow(label: string, value: HTMLElement): HTMLElement {
  return el('div', { className: 'hud-fc-row' }, [
    el('span', { className: 'hud-fc-label', text: label }),
    value,
  ])
}

function salvoButton(n: '1' | '2', active: boolean): HTMLElement {
  return el('button', { className: `hud-salvo-btn${active ? ' active' : ''}`, text: n })
}

/** Render one contact row's cells (all textContent; diff via setText). */
function renderContactRow(row: HTMLElement, c: Contact, now: number): void {
  const cells = [
    c.id,
    c.classification,
    `${String(Math.round(c.bearingDeg) % 360).padStart(3, '0')}°`,
    c.rangeKm === null ? '--' : c.rangeKm >= 10 ? `${Math.round(c.rangeKm)}KM` : `${c.rangeKm.toFixed(1)}KM`,
    c.speedEstimateKt === null ? '--' : `${Math.round(c.speedEstimateKt)}KT`,
    c.headingEstimateDeg === null ? '--' : `${String(Math.round(c.headingEstimateDeg) % 360).padStart(3, '0')}°`,
    `${Math.round(c.confidence)}%`,
    formatLastSeen(c.lastDetectedAt, now),
  ]
  // Build cells once, then diff-update text in place.
  if (row.childElementCount === 0) {
    for (const cell of cells) {
      row.append(el('span', { className: 'hud-contact-cell' }))
    }
  }
  const children = row.children
  for (let i = 0; i < cells.length; i++) {
    const node = children[i] as HTMLElement | undefined
    if (node !== undefined) setText(node, cells[i]!)
  }
}
