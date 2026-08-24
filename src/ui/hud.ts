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
 *                   detection (5-band + band label) / objectives (collapsible)
 *                   / timer / weather
 *   .hud-tubes    — torpedo tubes (LOADED white / READY green / FIRED empty)
 *                   + salvo selector 1–2
 *   .hud-contacts — header row (ID/TYPE/BRG/RNG/SPD/HDG/CONF/SEEN) + contact
 *                   rows; click selects → fire control card (TARGET / BEARING /
 *                   RANGE / TARGET HDG / SPD / REC. FIRING BRG / HIT
 *                   PROBABILITY / SALVO, §7.3); empty-state line
 *   .hud-log      — event log, mm:ss timestamps, tail 50 (FR-18 wording)
 *
 * i18n (t-022): every user-visible string goes through the translator bound
 * to the HUD's current language (getT). createHud() takes an initial lang;
 * setLanguage(lang) re-translates the static label registry in place — the
 * DOM (log entries, contact rows, tube state) is preserved across switches.
 * formatEvent / formatFireSolution / formatLastSeen accept an optional lang
 * (default 'en') — the canonical EN output is pinned by tests.
 *
 * Pure helpers (exported for Node unit tests, tests/unit/ui.test.ts):
 *   formatTime / formatEvent / formatFireSolution / formatLastSeen /
 *   detectionBandIndex / DETECTION_BAND_COLORS
 *
 * DESIGN DECISIONS:
 *  - Event log lines follow FR-18 exactly for the ten named entries; every
 *    other catalogue event gets a stable uppercase line. The noisy UI events
 *    (sub.speedChanged / sub.depthChanged / ui.click) are suppressed — they
 *    are shell-driven and would flood the log (formatEvent returns null).
 *  - Detection meter colors: 5-band green → yellow → orange → red → deep red
 *    (GAME_DESIGN §11.2 "绿/黄/橙/红/深红"), indexed by
 *    balance.detection.bands; the band label comes from the same config and
 *    is localized via 'hud.bands.<label>'.
 *  - Depth is displayed as the localized layer name + balance min–max
 *    metres (the engine tracks layers, not exact metres).
 *  - The weather chip uses short military codes (CLR/CLD/STM/FOG/NGT) —
 *    monospace-safe glyphs, intentionally unlocalized.
 *  - Classification / contact-state / depth-layer / speed-band names are
 *    keyed by their engine string ('class.Tanker', 'state.TRACKED',
 *    'hud.layer.Shallow', 'hud.band.SILENT') so the i18n keys stay stable
 *    against the engine's enums.
 *
 * Task: t-010 ui-engineer (t-022 i18n wave).
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
import { getT, type Lang, type Translator } from './i18n'
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

  const batteryChip = chip(tt, 'hud.battery', batteryValue, 'hud-chip-battery')
  const hullChip = chip(tt, 'hud.hull', hullValue, 'hud-chip-hull')
  const detectionChip = chip(tt, 'hud.detection', [detectionValue, detectionBar], 'hud-chip-detection')

  let objectivesCollapsed = false
  function renderObjectivesToggle(): void {
    objectivesHeader.textContent = tt('hud.objectives') + (objectivesCollapsed ? ' ▸' : ' ▾')
  }
  const objectivesHeader = el('button', {
    className: 'hud-objectives-toggle',
    onclick: () => {
      objectivesCollapsed = objectivesList.style.display === 'none'
      objectivesList.style.display = objectivesCollapsed ? '' : 'none'
      objectivesCollapsed = !objectivesCollapsed
      renderObjectivesToggle()
      opts.onToggleObjectives?.(objectivesCollapsed)
    },
  })
  renderObjectivesToggle()

  const topbar = el('div', { className: 'hud-topbar' }, [
    chip(tt, 'hud.depth', depthValue),
    chip(tt, 'hud.speed', speedValue),
    chip(tt, 'hud.heading', headingValue),
    batteryChip,
    hullChip,
    chip(tt, 'hud.noise', noiseValue),
    detectionChip,
    el('div', { className: 'hud-objectives' }, [objectivesHeader, objectivesList]),
    el('div', { className: 'hud-timer-chip' }, [label('hud.time', 'hud-label'), timerValue]),
    el('div', { className: 'hud-weather-chip' }, [weatherValue]),
  ])

  // --- torpedo tubes + salvo ------------------------------------------------
  const tubesRow = el('div', { className: 'hud-tubes-row' })
  const salvo1 = salvoButton('1', true)
  const salvo2 = salvoButton('2', false)
  const tubesTitle = el('div', { className: 'hud-tubes-title' })
  labelRegistry.push([tubesTitle, 'hud.torpedoes'])
  setText(tubesTitle, tt('hud.torpedoes'))
  const tubes = el('div', { className: 'hud-tubes' }, [
    tubesTitle,
    tubesRow,
    el('div', { className: 'hud-salvo' }, [
      label('hud.salvo', 'hud-label'),
      salvo1,
      salvo2,
    ]),
  ])

  // --- contact panel + fire control card -----------------------------------
  const contactList = el('div', { className: 'hud-contact-list' })
  // Empty-state hint — reuses the panel-title dim styling (style.css is out
  // of scope for t-022; t-023 redesigns visuals).
  const contactEmpty = el('div', { className: 'hud-panel-title' })
  labelRegistry.push([contactEmpty, 'hud.contacts.empty'])
  setText(contactEmpty, tt('hud.contacts.empty'))
  contactEmpty.style.display = 'none'

  // Header row — reuses the row grid (same 8-column template).
  const headerCells = [
    'hud.contact.id',
    'hud.contact.type',
    'hud.contact.bearing',
    'hud.contact.range',
    'hud.contact.speed',
    'hud.contact.heading',
    'hud.contact.confidence',
    'hud.contact.lastSeen',
  ].map((key) => {
    const cell = el('span', { className: 'hud-contact-cell' })
    labelRegistry.push([cell, key])
    setText(cell, tt(key))
    return cell
  })
  const contactHead = el('div', { className: 'hud-contact-row hud-contact-head' }, headerCells)

  const fcTarget = el('span', { className: 'hud-fc-value' })
  const fcBearing = el('span', { className: 'hud-fc-value' })
  const fcRange = el('span', { className: 'hud-fc-value' })
  const fcHdg = el('span', { className: 'hud-fc-value' })
  const fcSpd = el('span', { className: 'hud-fc-value' })
  const fcFiring = el('span', { className: 'hud-fc-value' })
  const fcHp = el('span', { className: 'hud-fc-value hud-fc-hp' })
  const fcSalvo = el('span', { className: 'hud-fc-value' })
  const fcEstimated = el('div', { className: 'hud-fc-est' })
  labelRegistry.push([fcEstimated, 'hud.fc.estimated'])
  setText(fcEstimated, tt('hud.fc.estimated'))

  const fireCardTitle = el('div', { className: 'hud-firecard-title' })
  labelRegistry.push([fireCardTitle, 'hud.fireControl'])
  setText(fireCardTitle, tt('hud.fireControl'))
  const fireCard = el('div', { className: 'hud-firecard' }, [
    fireCardTitle,
    fcRow(tt, 'hud.fc.target', fcTarget),
    fcRow(tt, 'hud.fc.bearing', fcBearing),
    fcRow(tt, 'hud.fc.range', fcRange),
    fcRow(tt, 'hud.fc.targetHdg', fcHdg),
    fcRow(tt, 'hud.fc.targetSpd', fcSpd),
    fcRow(tt, 'hud.fc.firingBearing', fcFiring),
    fcRow(tt, 'hud.fc.hitProbability', fcHp),
    fcRow(tt, 'hud.fc.salvo', fcSalvo),
    fcEstimated,
  ])
  const contactsTitle = el('div', { className: 'hud-panel-title' })
  labelRegistry.push([contactsTitle, 'hud.contacts'])
  setText(contactsTitle, tt('hud.contacts'))
  const contactsPanel = el('div', { className: 'hud-contacts' }, [
    contactsTitle,
    contactHead,
    contactList,
    contactEmpty,
    fireCard,
  ])

  // --- event log ------------------------------------------------------------
  const logBody = el('div', { className: 'hud-log' })
  const logTitle = el('div', { className: 'hud-panel-title' })
  labelRegistry.push([logTitle, 'hud.log'])
  setText(logTitle, tt('hud.log'))
  const logPanel = el('div', { className: 'hud-log-wrap' }, [logTitle, logBody])

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

    // Depth (localized layer name + balance min–max metres).
    const layerCfg = bal.depthLayers[sub.depthLayer]
    setText(
      depthValue,
      tt('hud.depthValue', {
        layer: tt(`hud.layer.${sub.depthLayer}`),
        min: Math.round(layerCfg.minM),
        max: Math.round(layerCfg.maxM),
      }),
    )

    // Speed (kt + localized band).
    setText(speedValue, tt('hud.speedValue', { v: sub.speedKt.toFixed(1).replace(/\.0$/, ''), band: tt(`hud.band.${sub.speedBand}`) }))

    // Heading.
    setText(headingValue, `${String(Math.round(sub.headingDeg) % 360).padStart(3, '0')}°`)

    // Battery (LOW BATTERY <10 blinks via CSS class).
    setText(batteryValue, `${Math.round(sub.battery)}%${sub.lowBattery ? ' ' + tt('hud.lowBattery') : ''}`)
    toggleClass(batteryChip, 'low', sub.lowBattery)

    // Hull (<30 red).
    setText(hullValue, `${Math.round(sub.hull)}%`)
    toggleClass(hullChip, 'danger', sub.hull < 30)

    // Noise.
    setText(noiseValue, `${Math.round(sub.noise)}`)

    // Detection (0–100, 5-band color; band label folded into the value text
    // — no extra DOM element, style.css untouched for t-022).
    const bandIdx = detectionBandIndex(sub.detection, bal.detection.bands)
    detectionBar.style.width = `${Math.min(100, sub.detection)}%`
    detectionBar.style.background = DETECTION_BAND_COLORS[bandIdx] ?? DETECTION_BAND_COLORS[0]!
    setText(detectionValue, `${Math.round(sub.detection)} ${tt(`hud.bands.${bal.detection.bands[bandIdx]?.label ?? 'Unaware'}`)}`)

    // Objectives (collapsible; diff via id → row map). Localized via the
    // same per-mission keys as the briefing ('mission.<id>.obj.<subgoalId>');
    // falls back to the engine desc for subgoal ids without a key.
    const objectives = snapshot.mission.objectives
    const missionId = extras.mission.id
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
      const key = `mission.${missionId}.obj.${obj.id}`
      const localized = tt(key)
      setText(desc, localized !== key ? localized : obj.desc)
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

    // Contact panel (id → row map, diff minimal; header + empty state).
    const seen = new Set<string>()
    for (const c of snapshot.contacts) {
      seen.add(c.id)
      let row = contactRows.get(c.id)
      if (row === undefined) {
        row = el('button', {
          className: 'hud-contact-row',
          title: `${c.id} · ${tt(`state.${c.state}`)}`,
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
    contactEmpty.style.display = snapshot.contacts.length === 0 ? '' : 'none'

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

  function setLanguage(next: Lang): void {
    lang = next
    tt = getT(lang)
    // Re-translate every registered static label in place (DOM preserved);
    // the next update() re-syncs values (lastSeen / band labels etc.).
    for (const [node, key] of labelRegistry) {
      setText(node, tt(key))
    }
    renderObjectivesToggle()
  }

  return { update, appendLog, reset, setLanguage, root }
}

// ---------------------------------------------------------------------------
// Small construction helpers
// ---------------------------------------------------------------------------

function chip(tt: Translator, key: string, content: Child | Child[], className = ''): HTMLElement {
  const children = Array.isArray(content) ? content : [content]
  return el('div', { className: `hud-chip ${className}` }, [
    el('span', { className: 'hud-label', text: tt(key) }),
    ...children,
  ])
}

function fcRow(tt: Translator, key: string, value: HTMLElement): HTMLElement {
  return el('div', { className: 'hud-fc-row' }, [
    el('span', { className: 'hud-fc-label', text: tt(key) }),
    value,
  ])
}

function salvoButton(n: '1' | '2', active: boolean): HTMLElement {
  return el('button', { className: `hud-salvo-btn${active ? ' active' : ''}`, text: n })
}

/** Render one contact row's cells (all textContent; diff via setText). */
function renderContactRow(row: HTMLElement, c: Contact, now: number, lang: Lang, tt: Translator): void {
  const cells = [
    c.id,
    tt(`class.${c.classification}`),
    `${String(Math.round(c.bearingDeg) % 360).padStart(3, '0')}°`,
    c.rangeKm === null ? '--' : c.rangeKm >= 10 ? `${Math.round(c.rangeKm)}KM` : `${c.rangeKm.toFixed(1)}KM`,
    c.speedEstimateKt === null ? '--' : `${Math.round(c.speedEstimateKt)}KT`,
    c.headingEstimateDeg === null ? '--' : `${String(Math.round(c.headingEstimateDeg) % 360).padStart(3, '0')}°`,
    `${Math.round(c.confidence)}%`,
    formatLastSeen(c.lastDetectedAt, now, lang),
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
