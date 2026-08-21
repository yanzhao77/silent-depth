/**
 * SILENT DEPTH — menu screens (src/ui/menus.ts)
 *
 * GAME_DESIGN §11.1 / §11.3 + GAME_ARCHITECTURE §9 (FR-18/19):
 * BOOT / MENU (Play · Missions · Settings · Credits) / MISSION_LOADING
 * (briefing: objectives, convoy intel, weather, torpedo count) / PAUSED /
 * VICTORY / DEFEAT / MISSION_RESULT (score parts bars + grade + stats +
 * 复盘 hints). Mission-running uses the HUD (hud.ts) — this overlay hides.
 *
 * Security (GAME_ARCHITECTURE §12): every string is textContent via
 * dom.ts; engine data never reaches innerHTML. Static labels are fine.
 *
 * DESIGN DECISIONS:
 *  - Engine GameState 'MENU' covers four shell sub-sections (main /
 *    missions / settings / credits) — the shell tracks the active section;
 *    setSection() re-renders the overlay, showEngineState() maps engine
 *    states to screens.
 *  - Briefing intel is convoy-report level only (GAME_DESIGN §11.3: "仅
 *    '护航队报告：N 商船 + M 驱逐舰' 级别信息") — derived from def.spawns.
 *  - Score bars are normalized against balance.scoring.components maxes.
 *  - 复盘 hints are static grade-gated strings (design allows guidance text
 *    on the result screen).
 *
 * Task: t-010 ui-engineer (browser presentation layer).
 * @pure-at-import — DOM touched only inside functions.
 */

import type { BalanceConfig } from '../core/balance'
import { loadBalance } from '../core/balance'
import type { GameSnapshot, GameState, MissionDef, ScoreGrade } from '../core/types'
import type { SaveData, SaveSettings } from '../save/save'
import type { MissionSpec } from '../missions/missions'
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
  root: HTMLElement
}

/** Grade-gated 复盘 hints (design §10.2: 提示). */
const HINTS: Record<ScoreGrade, string> = {
  Perfect: '教科书式伏击：低噪声、正确引信、全目标命中。',
  Excellent: '优秀：保持静默与深度优势，鱼雷效率极高。',
  Good: '良好：注意在开火前完成分类与火控解算。',
  Poor: '改进：降低噪声（SILENT 档）、利用深度层、避免无谓的主动 Ping。',
  Failed: '复盘：先分类再射击；高速与 Ping 会暴露位置；深潜可减少深弹伤害。',
}

/**
 * Build the menu overlay controller. `root` is the persistent full-screen
 * container created by main.ts.
 */
export function createMenus(root: HTMLElement, deps: MenuDeps): MenuController {
  root.className = 'menu-overlay'
  root.style.display = 'none'
  let section: MenuSection = 'main'

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
        el('h1', { className: 'menu-title', text: 'SILENT DEPTH' }),
        el('div', { className: 'menu-subtitle', text: '深海猎手' }),
        el('div', { className: 'menu-spacer' }),
        menuButton('PLAY', () => deps.onPlay(lastUnlocked), `快速开始：${lastUnlocked}`),
        menuButton('MISSIONS', () => setSectionImpl('missions')),
        menuButton('SETTINGS', () => setSectionImpl('settings')),
        menuButton('CREDITS', () => setSectionImpl('credits')),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'menu-meta', text: `NEXT MISSION ${lastUnlocked} · BEST ${best}` }),
        el('div', { className: 'menu-meta dim', text: 'v1.0.0 · OFFLINE · PROCEDURAL ASSETS' }),
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
          onclick: () => {
            if (!locked) deps.onPlay(spec.id)
          },
          attrs: locked ? { disabled: 'disabled', 'aria-disabled': 'true' } : undefined,
        },
        [
          el('span', { className: 'mission-lock', text: locked ? '🔒' : '✓' }),
          el('span', { className: 'mission-name', text: `${spec.id} ${spec.name}` }),
          el('span', { className: 'mission-name-zh', text: spec.nameZh }),
          el('span', { className: 'mission-meta', text: `DIFF ${spec.difficulty} · PAR ${spec.parMinutes}MIN · BEST ${best}` }),
        ],
      )
    })
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: 'MISSIONS' }),
        ...rows,
        el('div', { className: 'menu-spacer' }),
        menuButton('BACK', () => deps.onGoMainMenu()),
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

    const nextSettings: SaveSettings = { ...s, audio: { ...s.audio }, video: { ...s.video }, input: { ...s.input } }
    const commit = (): void => deps.onSettingsChanged(nextSettings)

    const rows: HTMLElement[] = [
      slider('MASTER VOLUME', s.audio.masterVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.masterVolume = v
        commit()
      }),
      slider('SFX VOLUME', s.audio.sfxVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.sfxVolume = v
        commit()
      }),
      slider('MUSIC VOLUME', s.audio.musicVolume, 0, 1, 0.05, (v) => {
        nextSettings.audio.musicVolume = v
        commit()
      }),
      toggle('SHOW FPS', s.video.showFps, (v) => {
        nextSettings.video.showFps = v
        commit()
      }),
      toggle('MAP GRID', s.video.mapGrid, (v) => {
        nextSettings.video.mapGrid = v
        commit()
      }),
      slider('INPUT SENSITIVITY', s.input.sensitivity, 0.1, 5, 0.1, (v) => {
        nextSettings.input.sensitivity = v
        commit()
      }),
      el('div', { className: 'settings-row' }, [
        el('span', { className: 'settings-label', text: 'PARTICLES' }),
        selectParticles(s.video.particles, (v) => {
          nextSettings.video.particles = v
          commit()
        }),
      ]),
    ]

    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: 'SETTINGS' }),
        ...rows,
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'settings-actions' }, [
          menuButton('EXPORT SAVE', () => deps.onExportSave()),
          menuButton('IMPORT SAVE', () => {
            const input = el('input', { attrs: { type: 'file', accept: '.json,application/json' } })
            input.addEventListener('change', () => {
              const file = input.files?.[0]
              if (file !== undefined) deps.onImportSave(file)
            })
            input.click()
          }),
          menuButton('CLEAR SAVE', () => {
            if (confirm('清除存档？此操作不可恢复。')) deps.onClearSave()
          }, 'danger'),
        ]),
        menuButton('BACK', () => deps.onGoMainMenu()),
      ]),
    )
  }

  function renderCredits(): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title small', text: 'CREDITS' }),
        el('p', { className: 'credits-line', text: 'SILENT DEPTH 《深海猎手》 — 战术潜艇伏击游戏' }),
        el('p', { className: 'credits-line dim', text: '全部美术与音频均为程序化生成 (src/rendering/sprites.ts · src/audio)' }),
        el('p', { className: 'credits-line dim', text: 'THIRD-PARTY ASSETS: NONE — 无第三方美术/音频资产 (OFFLINE)' }),
        el('p', { className: 'credits-line dim', text: '运行时零网络请求；第三方依赖仅限开发工具链 (TypeScript / Vite / Vitest)' }),
        el('div', { className: 'menu-spacer' }),
        menuButton('BACK', () => deps.onGoMainMenu()),
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
    const intel = convoyReport(def)
    const remaining = Math.max(0, Math.ceil((def.briefingSeconds ?? 2) - (snapshot?.simTime ?? 0)))
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('div', { className: 'menu-subtitle', text: 'BRIEFING' }),
        el('h1', { className: 'menu-title small', text: `${def.id} ${def.name}` }),
        el('div', { className: 'briefing-section' }, [
          el('div', { className: 'briefing-label', text: 'OBJECTIVES' }),
          ...subgoals.map((g) => el('div', { className: 'briefing-line', text: `— ${g.desc}` })),
        ]),
        el('div', { className: 'briefing-section' }, [
          el('div', { className: 'briefing-label', text: 'INTEL' }),
          el('div', { className: 'briefing-line', text: intel }),
          el('div', { className: 'briefing-line', text: `WEATHER ${def.weather.toUpperCase()} · VIS ${def.visibilityKm}KM` }),
          el('div', { className: 'briefing-line', text: `TORPEDOES ${def.torpedoCount} · BATTERY ${Math.round(def.batteryStart)}% · PAR ${formatPar(def.parTimeS)}` }),
        ]),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'briefing-count', text: `MISSION STARTING IN ${remaining}s` }),
      ]),
    )
  }

  function renderLoading(): void {
    clearChildren(root)
    root.append(el('div', { className: 'menu-panel' }, [el('div', { className: 'menu-subtitle', text: 'LOADING MISSION…' })]))
  }

  function renderPaused(): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: 'menu-title', text: 'PAUSED' }),
        menuButton('RESUME', () => deps.onResume()),
        menuButton('RESTART', () => deps.onRestart()),
        menuButton('ABORT MISSION', () => deps.onAbort()),
      ]),
    )
  }

  function renderVictoryDefeat(state: 'VICTORY' | 'DEFEAT'): void {
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel' }, [
        el('h1', { className: `menu-title ${state === 'VICTORY' ? 'victory' : 'defeat'}`, text: state === 'VICTORY' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED' }),
        el('div', { className: 'menu-subtitle', text: 'COMPUTING SCORE…' }),
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
    const parts: { label: string; value: number; max: number }[] = [
      { label: 'OBJECTIVE', value: score.objective, max: comps.objectiveMax },
      { label: 'DAMAGE', value: score.damage, max: comps.damageMax },
      { label: 'STEALTH', value: score.stealth, max: comps.detectionMax },
      { label: 'TORPEDO EFFICIENCY', value: score.torpedoEfficiency, max: comps.torpedoEfficiencyMax },
      { label: 'TIME', value: score.time, max: comps.timeMax },
      { label: 'SURVIVAL', value: score.survival, max: comps.survivalMax },
    ]
    clearChildren(root)
    root.append(
      el('div', { className: 'menu-panel result' }, [
        el('div', { className: 'menu-subtitle', text: 'MISSION RESULT' }),
        el('h1', { className: `menu-title ${gradeClass(score.grade)}`, text: score.grade.toUpperCase() }),
        el('div', { className: 'result-total', text: `TOTAL SCORE ${score.total}` }),
        ...parts.map((p) => {
          const frac = p.max > 0 ? Math.min(1, p.value / p.max) : 0
          const bar = el('div', { className: 'result-bar-fill' })
          bar.style.width = `${Math.round(frac * 100)}%`
          return el('div', { className: 'result-bar-row' }, [
            el('span', { className: 'result-bar-label', text: p.label }),
            el('div', { className: 'result-bar' }, [bar]),
            el('span', { className: 'result-bar-value', text: `${Math.round(p.value)}` }),
          ])
        }),
        el('div', { className: 'menu-spacer' }),
        el('div', { className: 'result-stats', text: `TORPEDOES ${stats.torpedoesHit}/${stats.torpedoesFired} HIT · PEAK DETECTION ${Math.round(stats.peakDetection)}% · TIME ${formatPar(stats.elapsedS)}` }),
        el('div', { className: 'result-hint', text: HINTS[score.grade] ?? HINTS.Failed }),
        el('div', { className: 'menu-spacer' }),
        menuButton('RETRY MISSION', () => deps.onRestart()),
        menuButton('MISSIONS', () => setSectionImpl('missions')),
        menuButton('MAIN MENU', () => deps.onGoMainMenu()),
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
      section = next
      root.style.display = 'flex'
      renderSection()
    },
    refresh(): void {
      if (root.style.display !== 'none') renderSection()
    },
    updateBriefingCountdown(remaining: number): void {
      const node = root.querySelector<HTMLElement>('.briefing-count')
      if (node !== null) {
        setText(node, `MISSION STARTING IN ${Math.max(0, Math.ceil(remaining))}s`)
      }
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

function menuButton(label: string, onclick: () => void, className = ''): HTMLElement {
  return el('button', { className: `menu-button ${className}`, text: label, onclick })
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

/** Convoy-report-level intel (GAME_DESIGN §11.3) derived from def.spawns. */
function convoyReport(def: MissionDef): string {
  const counts = new Map<string, number>()
  for (const spawn of def.spawns) {
    counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + 1)
  }
  const merchants = (counts.get('Merchant') ?? 0) + (counts.get('Cargo') ?? 0) + (counts.get('Tanker') ?? 0)
  const escorts = (counts.get('Destroyer') ?? 0) + (counts.get('Frigate') ?? 0)
  const parts: string[] = []
  if (merchants > 0) parts.push(`${merchants} 商船`)
  if (escorts > 0) parts.push(`${escorts} 护航舰`)
  return `护航队报告：${parts.length > 0 ? parts.join(' + ') : '无已知目标'}（仅此级别信息）`
}

function selectParticles(current: SaveSettings['video']['particles'], onChange: (v: SaveSettings['video']['particles']) => void): HTMLElement {
  const sel = el('select', {
    onchange: (e) => onChange((e.target as HTMLSelectElement).value as SaveSettings['video']['particles']),
  })
  for (const opt of ['normal', 'low', 'off'] as const) {
    const o = el('option', { text: opt.toUpperCase() })
    if (opt === current) o.selected = true
    sel.append(o)
  }
  return sel
}
