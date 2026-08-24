/**
 * SILENT DEPTH — menu screens (src/ui/menus.ts)
 *
 * GAME_DESIGN §11.1 / §11.3 + GAME_ARCHITECTURE §9 (FR-18/19):
 * BOOT / MENU (Play · Missions · Settings · Credits) / MISSION_LOADING
 * (briefing: objectives, convoy intel, weather, torpedo count) / PAUSED /
 * VICTORY / DEFEAT / MISSION_RESULT (score parts bars + grade + stats +
 * 复盘 hints). Mission-running uses the HUD (hud.ts) — this overlay hides.
 *
 * i18n (t-022): every string goes through the translator bound to the
 * screen language. createMenus() takes an initial lang; setLanguage(lang)
 * re-renders the current section (screens are cheap static builds).
 * Mission names / objective descriptions / weather names are localized via
 * stable keys ('mission.<id>.name', 'mission.<id>.obj.<subgoalId>',
 * 'weather.<Kind>' — keyed by the engine/config identifiers).
 *
 * Security (GAME_ARCHITECTURE §12): every string is textContent via
 * dom.ts; engine data never reaches innerHTML.
 *
 * DESIGN DECISIONS:
 *  - Engine GameState 'MENU' covers four shell sub-sections (main /
 *    missions / settings / credits) — the shell tracks the active section;
 *    setSection() re-renders the overlay, showEngineState() maps engine
 *    states to screens.
 *  - Settings is organized into AUDIO / DISPLAY / APP section headers; the
 *    APP section carries the language picker (LANGS labels in their own
 *    language) and save export/import/clear. Input sensitivity lives under
 *    DISPLAY.
 *  - Briefing intel is convoy-report level only (GAME_DESIGN §11.3) — a
 *    localized template with merchant/escort counts interpolated.
 *  - Score bars are normalized against balance.scoring.components maxes;
 *    grade names + hints come from 'result.grade.*' / 'result.hint.*'.
 *  - Destructive confirmations (clear save / restart) use window.confirm
 *    with localized text; the abort confirmation lives in main.ts (Esc).
 *
 * Task: t-010 ui-engineer (t-022 i18n wave).
 * @pure-at-import — DOM touched only inside functions.
 */

import { loadBalance } from '../core/balance'
import type { GameSnapshot, GameState, MissionDef, ScoreGrade } from '../core/types'
import type { SaveData, SaveSettings } from '../save/save'
import type { MissionSpec } from '../missions/missions'
import { getT, LANGS, type Lang, type Translator } from './i18n'
import { clearChildren, el } from './dom'

/** Engine-state screen contexts. */
export interface MenuContext {
  mission?: MissionDef
  snapshot?: GameSnapshot
}

export type MenuSection = 'main' | 'missions' | 'settings' | 'credits'

export interface MenuDeps {
  save: () => SaveData
  listMissions: () => readonly MissionSpec[]
  /** Start a mission by id (Play / mission select / retry). */
  onPlay: (missionId: string) => void
  /** Settings panel changed (persisted by the shell). */
  onSettingsChanged: (settings: SaveSettings) => void
  /** Language picker changed (t-022; shell persists + re-renders). */
  onLanguageChange: (lang: Lang) => void
  onClearSave: () => void
  onExportSave: () => void
  onImportSave: (file: File) => void
  /** Pause overlay. */
  onResume: () => void
  /** Result screen / pause overlay. */
  onRestart: () => void
  onAbort: () => void
  onGoMainMenu: () => void
}

export interface MenuController {
  /** Map an engine GameState to a screen. MISSION_RUNNING hides the overlay. */
  showEngineState(state: GameState, ctx?: MenuContext): void
  /** Render one of the four MENU sub-sections. */
  setSection(section: MenuSection): void
  /** Fresh render of the active section (save/settings changed externally). */
  refresh(): void
  /** Live-update the briefing countdown line (called every frame while
   *  MISSION_LOADING — no full re-render). */
  updateBriefingCountdown(remaining: number): void
  /** Switch UI language and re-render the active section (t-022). */
  setLanguage(lang: Lang): void
  root: HTMLElement
}

/**
 * Build the menu overlay controller. `root` is the persistent full-screen
 * container created by main.ts.
 */
export function createMenus(root: HTMLElement, deps: MenuDeps, initialLang: Lang = 'en'): MenuController {
  root.className = 'menu-overlay'
  root.style.display = 'none'
  let section: MenuSection = 'main'
  let lang: Lang = initialLang
  let tt: Translator = getT(lang)

  /** Switch to a menu sub-section (used by buttons and the controller). */
  function setSectionImpl(next: MenuSection): void {
    section = next
    root.style.display = 'flex'
    renderSection()
  }

  /** Render the current section (or engine screen) into root. */
  function renderSection(): void {
    switch (section) {
      case 'main':
        renderMainMenu()
        break
      case 'missions':
        renderMissionSelect()
        break
      case 'settings':
        renderSettings()
        break
      case 'credits':
        renderCredits()
        break
    }
  }

  function renderMainMenu(): void {
    const save = deps.save()
    const unlocked = save.unlockedMissions
    const lastUnlocked = unlocked[unlocked.length - 1] ?? 'M01'
    const best = save.bestScores[lastUnlocked] ?? 0
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title', text: tt('app.title') }),
        el('div', { className: 'menu-subtitle', text: tt('app.subtitle') }),
        el('div', { className: 'menu-spacer' }),
        menuButton(tt('menu.play'), () => deps.onPlay(lastUnlocked), 'primary', tt('menu.quickStart', { id: lastUnlocked })),
        menuButton(tt('menu.missions'), () => setSectionImpl('missions')),
        menuButton(tt('menu.settings'), () => setSectionImpl('settings')),
        menuButton(tt('menu.credits'), () => setSectionImpl('credits')),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'menu-meta', text: tt('menu.nextMission', { id: lastUnlocked, best }) }),
        el('div', { className: 'menu-meta dim', text: tt('app.meta') }),
      ]),
    )
  }

  function renderMissionSelect(): void {
    const save = deps.save()
    const unlocked = new Set(save.unlockedMissions)
    const specs = deps.listMissions()
    clearChildren(root)
    const rows = specs.map((spec) => {
      const locked = !unlocked.has(spec.id)
      const best = save.bestScores[spec.id] ?? 0
      return el(
        'button',
        {
          className: 'mission-row',
          title: locked ? tt('missions.locked') : tt('missions.unlocked'),
          onclick: () => {
            if (!locked) deps.onPlay(spec.id)
          },
          attrs: locked ? { disabled: 'disabled', 'aria-disabled': 'true' } : undefined,
        },
        [
          el('span', { className: 'mission-lock', text: locked ? '🔒' : '✓' }),
          el('span', { className: 'mission-name', text: `${spec.id} ${tt(`mission.${spec.id}.name`)}` }),
          el('span', { className: 'mission-meta', text: tt('missions.rowMeta', { diff: spec.difficulty, par: spec.parMinutes, best }) }),
        ],
      )
    })
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: tt('missions.title') }),
        ...rows,
        el('div', { className: 'menu-spacer' }),
        menuButton(tt('menu.back'), () => deps.onGoMainMenu()),
      ]),
    )
  }

  function renderSettings(): void {
    const save = deps.save()
    const s = save.settings
    clearChildren(root)

    const slider = (label: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLElement => {
      const out = el('span', { className: 'settings-value', text: value.toFixed(2) })
      const input = el('input', {
        attrs: { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) },
        oninput: (e) => {
          const v = Number((e.target as HTMLInputElement).value)
          onInput(v)
          setText(out, v.toFixed(2))
        },
      })
      return el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', text: label }),
        input,
        out,
      ])
    }

    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement => {
      const cb = el('input', {
        attrs: { type: 'checkbox' },
        onchange: (e) => onChange((e.target as HTMLInputElement).checked),
      })
      if (value) cb.checked = true
      return el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', text: label }),
        cb,
      ])
    }

    const sectionHeader = (label: string): HTMLElement =>
      el('div', { className: 'briefing-label', text: label })

    const nextSettings: SaveSettings = { ...s, audio: { ...s.audio }, video: { ...s.video }, input: { ...s.input }, app: { ...s.app } }
    const commit = (): void => deps.onSettingsChanged(nextSettings)

    const rows: HTMLElement[] = [
      sectionHeader(tt('settings.audio')),
      slider(tt('settings.masterVolume'), s.audio.masterVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.masterVolume = v
        commit()
      }),
      slider(tt('settings.sfxVolume'), s.audio.sfxVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.sfxVolume = v
        commit()
      }),
      slider(tt('settings.musicVolume'), s.audio.musicVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.musicVolume = v
        commit()
      }),
      sectionHeader(tt('settings.display')),
      toggle(tt('settings.showFps'), s.video.showFps, (v) => {
        nextSettings.video.showFps = v
        commit()
      }),
      toggle(tt('settings.mapGrid'), s.video.mapGrid, (v) => {
        nextSettings.video.mapGrid = v
        commit()
      }),
      el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', text: tt('settings.particles') }),
        selectParticles(tt, s.video.particles, (v) => {
          nextSettings.video.particles = v
          commit()
        }),
      ]),
      slider(tt('settings.sensitivity'), s.input.sensitivity, 0.1, 5, 0.1, (v) => {
        nextSettings.input.sensitivity = v
        commit()
      }),
      sectionHeader(tt('settings.app')),
      // Language picker (t-022/t-023) — labels in their own language;
      // segmented control styled in style.css (.lang-btn).
      el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', text: tt('settings.language') }),
        el('div', { className: 'lang-btns' }, LANGS.map((info) =>
          el('button', {
            className: `lang-btn${info.code === lang ? ' active' : ''}`,
            text: info.label,
            title: info.label,
            onclick: () => deps.onLanguageChange(info.code),
          }),
        )),
      ]),
      el('div', { className: 'settings-actions' }, [
        menuButton(tt('settings.export'), () => deps.onExportSave()),
        menuButton(tt('settings.import'), () => {
          const input = el('input', { attrs: { type: 'file', accept: '.json,application/json' } })
          input.addEventListener('change', () => {
            const file = input.files?.[0]
            if (file !== undefined) deps.onImportSave(file)
          })
          input.click()
        }),
        menuButton(tt('settings.clear'), () => {
          if (confirm(tt('settings.clearConfirm'))) deps.onClearSave()
        }, 'danger'),
      ]),
    ]

    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: tt('settings.title') }),
        ...rows,
        el('div', { className: 'menu-spacer' }),
        menuButton(tt('menu.back'), () => deps.onGoMainMenu()),
      ]),
    )
  }

  function renderCredits(): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: tt('menu.credits') }),
        el('p', { className: 'credits-line', text: tt('credits.line1') }),
        el('p', { className: 'credits-line dim', text: tt('credits.line2') }),
        el('p', { className: 'credits-line dim', text: tt('credits.line3') }),
        el('p', { className: 'credits-line dim', text: tt('credits.line4') }),
        el('div', { className: 'menu-spacer' }),
        menuButton(tt('menu.back'), () => deps.onGoMainMenu()),
      ]),
    )
  }

  // --- engine-state screens ----------------------------------------------

  function renderBriefing(ctx: MenuContext): void {
    const def = ctx.mission
    const snapshot = ctx.snapshot
    if (def === undefined) {
      renderLoading()
      return
    }
    const subgoals = def.objective.subgoals ?? []
    const intel = convoyReport(def, tt)
    const remaining = Math.max(0, Math.ceil((def.briefingSeconds ?? 2) - (snapshot?.simTime ?? 0)))
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('div', { className: 'menu-subtitle', text: tt('briefing.title') }),
        el('h1', { className: 'menu-title small', text: `${def.id} ${tt(`mission.${def.id}.name`)}` }),
        el('div', { className: 'briefing-section' }, [
          el('div', { className: 'briefing-label', text: tt('briefing.objectives') }),
          ...subgoals.map((g) => el('div', { className: 'briefing-line', text: `— ${tt(`mission.${def.id}.obj.${g.id}`)}` })),
        ]),
        el('div', { className: 'briefing-section' }, [
          el('div', { className: 'briefing-label', text: tt('briefing.intel') }),
          el('div', { className: 'briefing-line', text: intel }),
          el('div', { className: 'briefing-line', text: tt('briefing.weather', { w: weatherChain(def.weather, tt), vis: def.visibilityKm }) }),
          el('div', { className: 'briefing-line', text: tt('briefing.torpedoes', { n: def.torpedoCount, pct: Math.round(def.batteryStart), par: formatPar(def.parTimeS) }) }),
        ]),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'briefing-count', text: tt('briefing.countdown', { s: remaining }) }),
      ]),
    )
  }

  function renderLoading(): void {
    clearChildren(root)
    root.append(el('div', { className: 'menu-panel' }, [el('div', { className: 'menu-subtitle', text: tt('app.loading') })]))
  }

  function renderPaused(): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title', text: tt('pause.title') }),
        menuButton(tt('pause.resume'), () => deps.onResume()),
        menuButton(tt('pause.restart'), () => {
          if (confirm(tt('confirm.restart'))) deps.onRestart()
        }),
        menuButton(tt('pause.abort'), () => deps.onAbort()),
      ]),
    )
  }

  function renderVictoryDefeat(state: 'VICTORY' | 'DEFEAT'): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: `menu-title ${state === 'VICTORY' ? 'victory' : 'defeat'}`, text: state === 'VICTORY' ? tt('outcome.victory') : tt('outcome.defeat') }),
        el('div', { className: 'menu-subtitle', text: tt('app.computing') }),
      ]),
    )
  }

  function renderResult(ctx: MenuContext): void {
    const snapshot = ctx.snapshot
    const def = ctx.mission
    if (snapshot === undefined || def === undefined) {
      renderLoading()
      return
    }
    const score = snapshot.score
    const stats = snapshot.stats
    const balance = loadBalance()
    const comps = balance.scoring.components
    const parts: { key: string; value: number; max: number }[] = [
      { key: 'objective', value: score.objective, max: comps.objectiveMax },
      { key: 'damage', value: score.damage, max: comps.damageMax },
      { key: 'stealth', value: score.stealth, max: comps.detectionMax },
      { key: 'torpedoEfficiency', value: score.torpedoEfficiency, max: comps.torpedoEfficiencyMax },
      { key: 'time', value: score.time, max: comps.timeMax },
      { key: 'survival', value: score.survival, max: comps.survivalMax },
    ]
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel result' }, [
        el('div', { className: 'menu-subtitle', text: tt('result.title') }),
        el('h1', { className: `menu-title ${gradeClass(score.grade)}`, text: tt(`result.grade.${score.grade}`) }),
        el('div', { className: 'result-total', text: tt('result.total', { score: score.total }) }),
        ...parts.map((p) => {
          const frac = p.max > 0 ? Math.min(1, p.value / p.max) : 0
          const bar = el('div', { className: 'result-bar-fill' })
          bar.style.width = `${Math.round(frac * 100)}%`
          return el('div', { className: 'result-bar-row' }, [
            el('span', { className: 'result-bar-label', text: tt(`result.part.${p.key}`) }),
            el('div', { className: 'result-bar' }, [bar]),
            el('span', { className: 'result-bar-value', text: `${Math.round(p.value)}` }),
          ])
        }),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'result-stats', text: tt('result.stats', { hit: stats.torpedoesHit, fired: stats.torpedoesFired, left: stats.torpedoesRemaining, d: Math.round(stats.peakDetection), t: formatPar(stats.elapsedS) }) }),
        el('div', { className: 'result-hint', text: tt(`result.hint.${score.grade}`) }),
        el('div', { className: 'menu-spacer' }),
        menuButton(tt('result.retry'), () => deps.onRestart(), 'primary'),
        menuButton(tt('result.missions'), () => setSectionImpl('missions')),
        menuButton(tt('result.mainMenu'), () => deps.onGoMainMenu()),
      ]),
    )
  }

  return {
    showEngineState(state: GameState, ctx: MenuContext = {}): void {
      switch (state) {
        case 'MISSION_RUNNING':
          root.style.display = 'none'
          break
        case 'MENU':
          root.style.display = 'flex'
          renderSection()
          break
        case 'MISSION_LOADING':
          root.style.display = 'flex'
          renderBriefing(ctx)
          break
        case 'PAUSED':
          root.style.display = 'flex'
          renderPaused()
          break
        case 'VICTORY':
          root.style.display = 'flex'
          renderVictoryDefeat('VICTORY')
          break
        case 'DEFEAT':
          root.style.display = 'flex'
          renderVictoryDefeat('DEFEAT')
          break
        case 'MISSION_RESULT':
          root.style.display = 'flex'
          renderResult(ctx)
          break
        case 'BOOT':
          root.style.display = 'flex'
          renderLoading()
          break
      }
    },
    setSection(next: MenuSection): void {
      setSectionImpl(next)
    },
    refresh(): void {
      if (root.style.display !== 'none') renderSection()
    },
    updateBriefingCountdown(remaining: number): void {
      const node = root.querySelector<HTMLElement>('.briefing-count')
      if (node !== null) {
        setText(node, tt('briefing.countdown', { s: Math.max(0, Math.ceil(remaining)) }))
      }
    },
    setLanguage(next: Lang): void {
      lang = next
      tt = getT(lang)
      if (root.style.display !== 'none') renderSection()
    },
    root,
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function setText(node: HTMLElement, value: string | number): void {
  if (node.textContent !== String(value)) node.textContent = String(value)
}

function menuButton(label: string, onclick: () => void, className = '', title = ''): HTMLElement {
  return el('button', { className: `menu-button ${className}`, text: label, title, onclick })
}

function gradeClass(grade: ScoreGrade): string {
  switch (grade) {
    case 'Perfect':
      return 'grade-perfect'
    case 'Excellent':
      return 'grade-excellent'
    case 'Good':
      return 'grade-good'
    case 'Poor':
      return 'grade-poor'
    default:
      return 'grade-failed'
  }
}

function formatPar(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Localized weather chain for the briefing line ('Clear->Cloudy'). */
function weatherChain(spec: string, tt: Translator): string {
  return spec
    .split('->')
    .map((w) => tt(`weather.${w.trim()}`))
    .join(' → ')
}

/** Convoy-report-level intel (GAME_DESIGN §11.3) derived from def.spawns. */
function convoyReport(def: MissionDef, tt: Translator): string {
  const counts = new Map<string, number>()
  for (const spawn of def.spawns) {
    counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + 1)
  }
  const merchants = (counts.get('Merchant') ?? 0) + (counts.get('Cargo') ?? 0) + (counts.get('Tanker') ?? 0)
  const escorts = (counts.get('Destroyer') ?? 0) + (counts.get('Frigate') ?? 0)
  if (merchants > 0 || escorts > 0) {
    return `${tt('intel.report', { merchants, escorts })} ${tt('intel.infoLevel')}`
  }
  return tt('intel.none')
}

function selectParticles(tt: Translator, current: SaveSettings['video']['particles'], onChange: (v: SaveSettings['video']['particles']) => void): HTMLElement {
  const sel = el('select', {
    onchange: (e) => onChange((e.target as HTMLSelectElement).value as SaveSettings['video']['particles']),
  })
  for (const opt of ['normal', 'low', 'off'] as const) {
    const o = el('option', { text: tt(`settings.particles.${opt}`) })
    if (opt === current) o.selected = true
    sel.append(o)
  }
  return sel
}
