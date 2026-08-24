/**
 * SILENT DEPTH — internationalization (src/ui/i18n.ts)
 *
 * Wave 1 of UI v2 (t-022): full multi-language support — 中文 / English /
 * Français / Русский — switchable in the Settings screen, persisted in the
 * save store (settings.app.language), applied to every UI string.
 *
 * API (stable for t-023 to build on):
 *   type Lang = 'zh' | 'en' | 'fr' | 'ru'
 *   const LANGS: readonly LangInfo[]        // labels in their own language
 *   const translations: Record<Lang, Record<TKey, string>>
 *   function getT(lang: Lang): Translator   // t(key, vars?) with {var}
 *   function detectLanguage(): Lang         // save → navigator → 'en'
 *   function isLang(v: unknown): v is Lang
 *   function langFromNavigator(tag): Lang   // 'zh-CN' → 'zh' etc.
 *   function langFromSettings(raw): Lang | null
 *
 * DESIGN DECISIONS:
 *  - `en` is the canonical dictionary (`const en = {...} as const`); TKey is
 *    derived from it and zh/fr/ru are typed `Record<TKey, string>` — missing
 *    or extra keys are COMPILE-TIME errors, and tests/unit/ui.test.ts also
 *    asserts the four key sets are equal at runtime (belt and braces).
 *  - Missing keys fall back to English, then to the raw key (never crashes).
 *  - Interpolation: '{name}' placeholders replaced by vars (string|number);
 *    values that are not interpolated are left as-is.
 *  - Brand strings (game title, zh subtitle) and technical values (numbers,
 *    km/kt/°/%, contact ids, tube ids, weather chip codes CLR/CLD/STM/FOG/NGT)
 *    stay unlocalized by design.
 *  - detectLanguage() reads the raw save JSON (settings.app.language) first,
 *    then navigator.language, then defaults to 'en'. Node-safe (guards
 *    localStorage / navigator) — the parse is independent of save.ts to avoid
 *    an import cycle at module scope.
 *
 * Task: t-022 i18n (ui-engineer). @pure-at-import — no DOM at module scope.
 */

import { SAVE_KEY } from '../save/save'

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

export type Lang = 'zh' | 'en' | 'fr' | 'ru'

export interface LangInfo {
  code: Lang
  /** Label in its own language (settings picker). */
  label: string
}

export const LANGS: readonly LangInfo[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
]

export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en' || value === 'fr' || value === 'ru'
}

// ---------------------------------------------------------------------------
// Dictionary — `en` is canonical; TKey is derived; zh/fr/ru must match.
// ---------------------------------------------------------------------------

const en = {
  // --- app / boot --------------------------------------------------------
  'app.title': 'SILENT DEPTH',
  'app.subtitle': '深海猎手',
  'app.meta': 'v1.0.0 · OFFLINE · PROCEDURAL ASSETS',
  'app.loading': 'LOADING MISSION…',
  'app.computing': 'COMPUTING SCORE…',

  // --- main menu -----------------------------------------------------------
  'menu.play': 'PLAY',
  'menu.missions': 'MISSIONS',
  'menu.settings': 'SETTINGS',
  'menu.credits': 'CREDITS',
  'menu.back': 'BACK',
  'menu.quickStart': 'Quick start: {id}',
  'menu.nextMission': 'NEXT MISSION {id} · BEST {best}',

  // --- mission select -------------------------------------------------------
  'missions.title': 'MISSIONS',
  'missions.locked': 'LOCKED',
  'missions.unlocked': 'UNLOCKED',
  'missions.rowMeta': 'DIFF {diff} · PAR {par}MIN · BEST {best}',

  // --- briefing -------------------------------------------------------------
  'briefing.title': 'BRIEFING',
  'briefing.objectives': 'OBJECTIVES',
  'briefing.intel': 'INTEL',
  'briefing.weather': 'WEATHER {w} · VIS {vis}KM',
  'briefing.torpedoes': 'TORPEDOES {n} · BATTERY {pct}% · PAR {par}',
  'briefing.countdown': 'MISSION STARTING IN {s}s',
  'intel.report': 'CONVOY REPORT: {merchants} MERCHANTS + {escorts} ESCORTS',
  'intel.none': 'NO KNOWN TARGETS',
  'intel.infoLevel': '(REPORT-LEVEL INFO ONLY)',

  // --- pause / outcome ------------------------------------------------------
  'pause.title': 'PAUSED',
  'pause.resume': 'RESUME',
  'pause.restart': 'RESTART',
  'pause.abort': 'ABORT MISSION',
  'outcome.victory': 'MISSION ACCOMPLISHED',
  'outcome.defeat': 'MISSION FAILED',

  // --- mission result -------------------------------------------------------
  'result.title': 'MISSION RESULT',
  'result.total': 'TOTAL SCORE {score}',
  'result.stats': 'TORPEDOES {hit}/{fired} HIT · {left} LEFT · PEAK DETECTION {d}% · TIME {t}',
  'result.retry': 'RETRY MISSION',
  'result.missions': 'MISSIONS',
  'result.mainMenu': 'MAIN MENU',
  'result.grade.Perfect': 'PERFECT',
  'result.grade.Excellent': 'EXCELLENT',
  'result.grade.Good': 'GOOD',
  'result.grade.Poor': 'POOR',
  'result.grade.Failed': 'FAILED',
  'result.hint.Perfect': 'Perfect ambush: low noise, correct solution, every torpedo on target.',
  'result.hint.Excellent': 'Excellent. Keep the stealth and depth advantage; torpedo efficiency is high.',
  'result.hint.Good': 'Good. Classify and solve the fire solution before firing.',
  'result.hint.Poor': 'Improve: reduce noise (SILENT), use depth layers, avoid needless active pings.',
  'result.hint.Failed': 'Debrief: classify before firing; speed and pings expose you; deep water reduces depth-charge damage.',
  'result.part.objective': 'OBJECTIVES',
  'result.part.damage': 'DAMAGE',
  'result.part.stealth': 'STEALTH',
  'result.part.torpedoEfficiency': 'TORPEDO EFFICIENCY',
  'result.part.time': 'TIME',
  'result.part.survival': 'SURVIVAL',

  // --- settings -------------------------------------------------------------
  'settings.title': 'SETTINGS',
  'settings.audio': 'AUDIO',
  'settings.display': 'DISPLAY',
  'settings.app': 'APP',
  'settings.masterVolume': 'MASTER VOLUME',
  'settings.sfxVolume': 'SFX VOLUME',
  'settings.musicVolume': 'MUSIC VOLUME',
  'settings.showFps': 'SHOW FPS',
  'settings.mapGrid': 'MAP GRID',
  'settings.particles': 'PARTICLES',
  'settings.particles.normal': 'NORMAL',
  'settings.particles.low': 'LOW',
  'settings.particles.off': 'OFF',
  'settings.sensitivity': 'INPUT SENSITIVITY',
  'settings.language': 'LANGUAGE',
  'settings.export': 'EXPORT SAVE',
  'settings.import': 'IMPORT SAVE',
  'settings.clear': 'CLEAR SAVE',
  'settings.clearConfirm': 'Clear save? This cannot be undone.',

  // --- credits ---------------------------------------------------------------
  'credits.line1': 'SILENT DEPTH — a tactical submarine ambush game',
  'credits.line2': 'All art and audio are procedurally generated (src/rendering/sprites.ts · src/audio)',
  'credits.line3': 'THIRD-PARTY ASSETS: NONE — fully offline',
  'credits.line4': 'Zero runtime network requests; dependencies are dev-tooling only (TypeScript / Vite / Vitest)',

  // --- HUD top bar -----------------------------------------------------------
  'hud.depth': 'DEPTH',
  'hud.speed': 'SPEED',
  'hud.heading': 'HEADING',
  'hud.battery': 'BATTERY',
  'hud.hull': 'HULL',
  'hud.noise': 'NOISE',
  'hud.detection': 'DETECTION',
  'hud.time': 'TIME',
  'hud.torpedoes': 'TORPEDOES',
  'hud.salvo': 'SALVO',
  'hud.objectives': 'OBJECTIVES',
  'hud.lowBattery': 'LOW BATTERY',
  'hud.bands.Unaware': 'UNAWARE',
  'hud.bands.Suspicious': 'SUSPICIOUS',
  'hud.bands.Searching': 'SEARCHING',
  'hud.bands.Hunting': 'HUNTING',
  'hud.bands.Located': 'LOCATED',
  'hud.layer.Surface': 'SURFACE',
  'hud.layer.Periscope': 'PERISCOPE',
  'hud.layer.Shallow': 'SHALLOW',
  'hud.layer.Medium': 'MEDIUM',
  'hud.layer.Deep': 'DEEP',
  'hud.band.STOPPED': 'STOPPED',
  'hud.band.SILENT': 'SILENT',
  'hud.band.CRUISE': 'CRUISE',
  'hud.band.FULL': 'FULL',
  'hud.depthValue': '{m}M {layer}',
  'hud.ping.ready': 'PING READY',
  'hud.ping.cooldown': 'PING {s}s',
  'hud.ping.unavailable': 'PING UNAVAILABLE',
  'hud.silent.on': 'SILENT',
  'hud.silent.off': 'NORMAL',
  'hud.decoys': '{n} DECOYS',
  'hud.speedValue': '{v} KT {band}',

  // --- contact panel -----------------------------------------------------------
  'hud.contacts': 'CONTACTS',
  'hud.contacts.empty': 'No active contacts — ping the sonar or approach the convoy.',
  'hud.log': 'EVENT LOG',
  'hud.contact.id': 'ID',
  'hud.contact.type': 'TYPE',
  'hud.contact.bearing': 'BRG',
  'hud.contact.range': 'RNG',
  'hud.contact.speed': 'SPD',
  'hud.contact.heading': 'HDG',
  'hud.contact.confidence': 'CONF',
  'hud.contact.lastSeen': 'SEEN',
  'hud.lastSeen.now': 'NOW',
  'hud.lastSeen.seconds': '{s}S',

  // --- fire control card --------------------------------------------------------
  'hud.fireControl': 'FIRE CONTROL',
  'hud.fc.target': 'TARGET',
  'hud.fc.bearing': 'BEARING',
  'hud.fc.range': 'RANGE',
  'hud.fc.targetHdg': 'TARGET HDG',
  'hud.fc.targetSpd': 'TARGET SPD',
  'hud.fc.firingBearing': 'REC. FIRING BRG',
  'hud.fc.hitProbability': 'HIT PROBABILITY',
  'hud.fc.salvo': 'SALVO (2)',
  'hud.fc.estimated': 'ESTIMATED SOLUTION',

  // --- classification / contact states --------------------------------------------
  // EN keeps the engine's title-case classification names (canonical, pinned
  // by tests); other languages use their own display convention.
  'class.Merchant': 'Merchant',
  'class.Cargo': 'Cargo',
  'class.Tanker': 'Tanker',
  'class.Destroyer': 'Destroyer',
  'class.Frigate': 'Frigate',
  'class.Submarine': 'Submarine',
  'class.Unknown': 'Unknown',
  'class.LargeSurface': 'Large Surface',
  'state.UNKNOWN': 'UNKNOWN',
  'state.SUSPECTED': 'SUSPECTED',
  'state.CLASSIFIED': 'CLASSIFIED',
  'state.TRACKED': 'TRACKED',
  'state.CONFIRMED': 'CONFIRMED',

  // --- event log (FR-18 + full catalogue) ----------------------------------------
  'log.entry': '{text} — {id}',
  'log.sonar.ping': 'ACTIVE PING',
  'log.sonar.contact': 'SONAR RETURN',
  'log.sonar.passive': 'PASSIVE CONTACT',
  'log.contact.detected': 'SONAR CONTACT DETECTED',
  'log.contact.classified': 'CONTACT CLASSIFIED',
  'log.contact.degraded': 'CONTACT DEGRADED',
  'log.contact.lost': 'CONTACT LOST',
  'log.torpedo.ready': 'TORPEDO READY',
  'log.torpedo.fired': 'TORPEDO FIRED',
  'log.torpedo.hit': 'TARGET HIT',
  'log.torpedo.missed': 'TORPEDO MISSED',
  'log.torpedo.expired': 'TORPEDO EXPIRED',
  'log.torpedo.fireRejected': 'FIRE REJECTED',
  'log.ship.sunk': 'SHIP SUNK',
  'log.depthCharge.dropped': 'DEPTH CHARGES DROPPED',
  'log.depthCharge.detonated': 'DEPTH CHARGE DETONATED',
  'log.deckGun.fired': 'DECK GUN FIRED',
  'log.sub.damaged': 'HULL DAMAGED',
  'log.sub.forcedSurface': 'FORCED TO SURFACE',
  'log.battery.low': 'LOW BATTERY',
  'log.detection.threshold': 'DETECTION WARNING',
  'log.player.located': 'PLAYER LOCATED',
  'log.decoy.launched': 'DECOY LAUNCHED',
  'log.escape.escaped': 'ESCAPED',
  'log.mission.victory': 'MISSION ACCOMPLISHED',
  'log.mission.defeat': 'MISSION FAILED',
  'log.mission.complete': 'MISSION COMPLETE',

  // --- weather names (briefing) ---------------------------------------------------
  'weather.Clear': 'CLEAR',
  'weather.Cloudy': 'CLOUDY',
  'weather.Storm': 'STORM',
  'weather.Fog': 'FOG',
  'weather.Night': 'NIGHT',

  // --- mission names + objectives (config/missions.json) ----------------------------
  'mission.M01.name': 'Sonar Training',
  'mission.M02.name': 'First Ambush',
  'mission.M03.name': 'Convoy Attack',
  'mission.M04.name': 'Heavy Escort',
  'mission.M05.name': 'Silent Hunter',
  'mission.M01.obj.find': 'Find a merchant contact',
  'mission.M01.obj.classify': 'Classify the contact',
  'mission.M01.obj.track': 'Track the contact to TRACKED',
  'mission.M02.obj.sink-1': 'Sink the tanker',
  'mission.M03.obj.sink-1': 'Sink the first cargo ship',
  'mission.M03.obj.sink-2': 'Sink a second cargo ship',
  'mission.M04.obj.sink-1': 'Sink the first cargo ship',
  'mission.M04.obj.sink-2': 'Sink a second cargo ship',
  'mission.M04.obj.survive': 'Survive the escort attack',
  'mission.M05.obj.sink-1': 'Sink at least one ship',
  'mission.M05.obj.escape': 'Escape the hunters',

  // --- confirmations ----------------------------------------------------------------
  'confirm.abort': 'Abort mission? Progress will be lost.',
  'confirm.restart': 'Restart mission? Progress will be lost.',

  // --- periscope (t-026) ------------------------------------------------------
  'periscope.title': 'PERISCOPE VIEW',
  'periscope.state.SUBMERGED': 'SUBMERGED',
  'periscope.state.SURFACING': 'SURFACING',
  'periscope.state.RAISING': 'RAISING',
  'periscope.state.RAISED': 'RAISED',
  'periscope.state.OBSERVING': 'OBSERVING',
  'periscope.state.LOWERING': 'LOWERING',
  'periscope.band.NONE': 'NONE',
  'periscope.band.LOW': 'LOW',
  'periscope.band.MEDIUM': 'MEDIUM',
  'periscope.band.HIGH': 'HIGH',
  'periscope.band.CRITICAL': 'CRITICAL',
  'periscope.exposure': 'EXPOSURE',
  'periscope.raisedTime': 'RAISED {t}',
  'periscope.btn.raise': 'RAISE PERISCOPE',
  'periscope.btn.lower': 'LOWER PERISCOPE',
  'periscope.btn.lock': 'LOCK TARGET',
  'periscope.btn.locked': 'TARGET LOCKED',
  'periscope.btn.dive': 'EMERGENCY DIVE',
  'periscope.status.ready': 'PERISCOPE READY',
  'periscope.status.raising': 'RAISING PERISCOPE…',
  'periscope.status.raised': 'PERISCOPE RAISED',
  'periscope.status.cannotRaise': 'CANNOT RAISE PERISCOPE',
  'periscope.reason.tooDeep': 'Too deep — rise to the periscope depth layer',
  'periscope.reason.wrongLayer': 'Wrong depth layer — set depth to periscope',
  'periscope.reason.alreadyActive': 'Periscope already active',
  'periscope.warn.torpedoFired': 'TORPEDO FIRED',
  'periscope.warn.detected': 'ENEMY MAY HAVE DETECTED YOUR POSITION',
  'periscope.warn.exposure': '⚠ ENEMY DETECTION RISK HIGH',
  'periscope.view.bearing': 'BEARING',
  'periscope.view.speed': 'SPEED',
  'periscope.view.course': 'COURSE',
  'periscope.view.classification': 'CLASSIFICATION',
  'periscope.view.confidence': 'CONFIDENCE',
  'fc.status.estimated': 'ESTIMATED',
  'fc.status.visualConfirmed': 'VISUAL CONFIRMED',
  'log.periscope.ready': 'PERISCOPE READY',
  'log.periscope.raising': 'RAISING PERISCOPE',
  'log.periscope.raised': 'PERISCOPE RAISED',
  'log.periscope.visualContact': 'VISUAL CONTACT',
  'log.periscope.classified': 'TARGET CLASSIFIED',
  'log.periscope.locked': 'TARGET LOCKED',
  'log.periscope.unlocked': 'TARGET UNLOCKED',
  'log.periscope.lowered': 'PERISCOPE LOWERED',
  'log.periscope.cannotRaise': 'CANNOT RAISE PERISCOPE',
  'log.periscope.exposure': 'EXPOSURE RISING',
  'log.emergencyDive': 'EMERGENCY DIVE',
  'pause.controls': 'Controls: P periscope · L lock target · X emergency dive · Esc pause',
} as const

export type TKey = keyof typeof en

/** Exact-key dictionary type — zh/fr/ru must cover TKey completely. */
type Dict = Record<TKey, string>

const zh: Dict = {
  'app.title': 'SILENT DEPTH',
  'app.subtitle': '深海猎手',
  'app.meta': 'v1.0.0 · 离线 · 程序化生成资产',
  'app.loading': '加载任务中…',
  'app.computing': '正在结算…',

  'menu.play': '开始游戏',
  'menu.missions': '任务',
  'menu.settings': '设置',
  'menu.credits': '制作名单',
  'menu.back': '返回',
  'menu.quickStart': '快速开始：{id}',
  'menu.nextMission': '下一任务 {id} · 最佳 {best}',

  'missions.title': '任务选择',
  'missions.locked': '未解锁',
  'missions.unlocked': '已解锁',
  'missions.rowMeta': '难度 {diff} · 标准 {par}分 · 最佳 {best}',

  'briefing.title': '任务简报',
  'briefing.objectives': '任务目标',
  'briefing.intel': '情报',
  'briefing.weather': '天气 {w} · 能见度 {vis}KM',
  'briefing.torpedoes': '鱼雷 {n} · 电池 {pct}% · 标准时间 {par}',
  'briefing.countdown': '任务将在 {s} 秒后开始',
  'intel.report': '护航队报告：{merchants} 商船 + {escorts} 护航舰',
  'intel.none': '无已知目标',
  'intel.infoLevel': '（仅此级别信息）',

  'pause.title': '已暂停',
  'pause.resume': '继续',
  'pause.restart': '重新开始',
  'pause.abort': '中止任务',
  'outcome.victory': '任务完成',
  'outcome.defeat': '任务失败',

  'result.title': '任务结算',
  'result.total': '总分 {score}',
  'result.stats': '鱼雷命中 {hit}/{fired} · 剩余 {left} · 最高暴露 {d}% · 用时 {t}',
  'result.retry': '重试任务',
  'result.missions': '任务',
  'result.mainMenu': '主菜单',
  'result.grade.Perfect': '完美',
  'result.grade.Excellent': '优秀',
  'result.grade.Good': '良好',
  'result.grade.Poor': '较差',
  'result.grade.Failed': '失败',
  'result.hint.Perfect': '教科书式伏击：低噪声、正确解算、全目标命中。',
  'result.hint.Excellent': '优秀：保持静默与深度优势，鱼雷效率极高。',
  'result.hint.Good': '良好：注意在开火前完成分类与火控解算。',
  'result.hint.Poor': '改进：降低噪声（静音档）、利用深度层、避免无谓的主动声呐。',
  'result.hint.Failed': '复盘：先分类再射击；高速与主动声呐会暴露位置；深潜可减少深弹伤害。',
  'result.part.objective': '目标',
  'result.part.damage': '伤害',
  'result.part.stealth': '隐蔽',
  'result.part.torpedoEfficiency': '鱼雷效率',
  'result.part.time': '时间',
  'result.part.survival': '生存',

  'settings.title': '设置',
  'settings.audio': '音频',
  'settings.display': '显示',
  'settings.app': '应用',
  'settings.masterVolume': '主音量',
  'settings.sfxVolume': '音效音量',
  'settings.musicVolume': '音乐音量',
  'settings.showFps': '显示 FPS',
  'settings.mapGrid': '地图网格',
  'settings.particles': '粒子效果',
  'settings.particles.normal': '普通',
  'settings.particles.low': '低',
  'settings.particles.off': '关',
  'settings.sensitivity': '操作灵敏度',
  'settings.language': '语言',
  'settings.export': '导出存档',
  'settings.import': '导入存档',
  'settings.clear': '清除存档',
  'settings.clearConfirm': '清除存档？此操作不可恢复。',

  'credits.line1': 'SILENT DEPTH 《深海猎手》 — 战术潜艇伏击游戏',
  'credits.line2': '全部美术与音频均为程序化生成 (src/rendering/sprites.ts · src/audio)',
  'credits.line3': '第三方资产：无 — 完全离线',
  'credits.line4': '运行时零网络请求；第三方依赖仅限开发工具链 (TypeScript / Vite / Vitest)',

  'hud.depth': '深度',
  'hud.speed': '速度',
  'hud.heading': '航向',
  'hud.battery': '电池',
  'hud.hull': '船体',
  'hud.noise': '噪声',
  'hud.detection': '探测',
  'hud.time': '时间',
  'hud.torpedoes': '鱼雷',
  'hud.salvo': '齐射',
  'hud.objectives': '目标',
  'hud.lowBattery': '电池不足',
  'hud.bands.Unaware': '无察觉',
  'hud.bands.Suspicious': '可疑',
  'hud.bands.Searching': '搜索中',
  'hud.bands.Hunting': '追猎',
  'hud.bands.Located': '已定位',
  'hud.layer.Surface': '水面',
  'hud.layer.Periscope': '潜望镜',
  'hud.layer.Shallow': '浅层',
  'hud.layer.Medium': '中层',
  'hud.layer.Deep': '深层',
  'hud.band.STOPPED': '停车',
  'hud.band.SILENT': '静音',
  'hud.band.CRUISE': '巡航',
  'hud.band.FULL': '全速',
  'hud.depthValue': '{m}M {layer}',
  'hud.ping.ready': '声呐就绪',
  'hud.ping.cooldown': '声呐 {s}秒',
  'hud.ping.unavailable': '声呐不可用',
  'hud.silent.on': '静默运行',
  'hud.silent.off': '常规',
  'hud.decoys': '诱饵 {n}',
  'hud.speedValue': '{v} KT {band}',

  'hud.contacts': '接触',
  'hud.contacts.empty': '暂无接触 — 主动声呐或接近护航队。',
  'hud.log': '事件日志',
  'hud.contact.id': '编号',
  'hud.contact.type': '类型',
  'hud.contact.bearing': '方位',
  'hud.contact.range': '距离',
  'hud.contact.speed': '速度',
  'hud.contact.heading': '航向',
  'hud.contact.confidence': '置信',
  'hud.contact.lastSeen': '最近',
  'hud.lastSeen.now': '现在',
  'hud.lastSeen.seconds': '{s}秒',

  'hud.fireControl': '火控解算',
  'hud.fc.target': '目标',
  'hud.fc.bearing': '方位',
  'hud.fc.range': '距离',
  'hud.fc.targetHdg': '目标航向',
  'hud.fc.targetSpd': '目标速度',
  'hud.fc.firingBearing': '建议发射方位',
  'hud.fc.hitProbability': '命中概率',
  'hud.fc.salvo': '齐射 (2)',
  'hud.fc.estimated': '估算解算',

  'class.Merchant': '商船',
  'class.Cargo': '货船',
  'class.Tanker': '油轮',
  'class.Destroyer': '驱逐舰',
  'class.Frigate': '护卫舰',
  'class.Submarine': '潜艇',
  'class.Unknown': '未知',
  'class.LargeSurface': '大型水面目标',
  'state.UNKNOWN': '未知',
  'state.SUSPECTED': '疑似',
  'state.CLASSIFIED': '已分类',
  'state.TRACKED': '已跟踪',
  'state.CONFIRMED': '已确认',

  'log.entry': '{text} — {id}',
  'log.sonar.ping': '主动声呐',
  'log.sonar.contact': '声呐回波',
  'log.sonar.passive': '被动接触',
  'log.contact.detected': '发现声呐接触',
  'log.contact.classified': '接触已分类',
  'log.contact.degraded': '接触质量下降',
  'log.contact.lost': '接触丢失',
  'log.torpedo.ready': '鱼雷就绪',
  'log.torpedo.fired': '鱼雷发射',
  'log.torpedo.hit': '目标命中',
  'log.torpedo.missed': '鱼雷未命中',
  'log.torpedo.expired': '鱼雷失效',
  'log.torpedo.fireRejected': '发射被拒绝',
  'log.ship.sunk': '敌船沉没',
  'log.depthCharge.dropped': '投放深水炸弹',
  'log.depthCharge.detonated': '深水炸弹爆炸',
  'log.deckGun.fired': '甲板炮开火',
  'log.sub.damaged': '船体受损',
  'log.sub.forcedSurface': '被迫上浮',
  'log.battery.low': '电池不足',
  'log.detection.threshold': '探测警告',
  'log.player.located': '潜艇被发现',
  'log.decoy.launched': '发射诱饵',
  'log.escape.escaped': '成功逃脱',
  'log.mission.victory': '任务完成',
  'log.mission.defeat': '任务失败',
  'log.mission.complete': '任务完成',

  'weather.Clear': '晴天',
  'weather.Cloudy': '多云',
  'weather.Storm': '风暴',
  'weather.Fog': '大雾',
  'weather.Night': '夜晚',

  'mission.M01.name': '声呐训练',
  'mission.M02.name': '首次伏击',
  'mission.M03.name': '袭击护航队',
  'mission.M04.name': '重装护航',
  'mission.M05.name': '静默猎手',
  'mission.M01.obj.find': '找到商船接触',
  'mission.M01.obj.classify': '分类接触',
  'mission.M01.obj.track': '跟踪接触至已跟踪',
  'mission.M02.obj.sink-1': '击沉油轮',
  'mission.M03.obj.sink-1': '击沉第一艘货船',
  'mission.M03.obj.sink-2': '击沉第二艘货船',
  'mission.M04.obj.sink-1': '击沉第一艘货船',
  'mission.M04.obj.sink-2': '击沉第二艘货船',
  'mission.M04.obj.survive': '存活至任务结束',
  'mission.M05.obj.sink-1': '击沉至少一艘敌船',
  'mission.M05.obj.escape': '成功逃脱',

  'confirm.abort': '中止任务？进度将丢失。',
  'confirm.restart': '重新开始任务？进度将丢失。',

  // --- periscope (t-026) ------------------------------------------------------
  'periscope.title': '潜望镜观察',
  'periscope.state.SUBMERGED': '已收起',
  'periscope.state.SURFACING': '上浮中',
  'periscope.state.RAISING': '升起中',
  'periscope.state.RAISED': '已升起',
  'periscope.state.OBSERVING': '观察中',
  'periscope.state.LOWERING': '降下中',
  'periscope.band.NONE': '无',
  'periscope.band.LOW': '低',
  'periscope.band.MEDIUM': '中',
  'periscope.band.HIGH': '高',
  'periscope.band.CRITICAL': '危急',
  'periscope.exposure': '暴露',
  'periscope.raisedTime': '升起 {t}',
  'periscope.btn.raise': '升起潜望镜',
  'periscope.btn.lower': '降下潜望镜',
  'periscope.btn.lock': '锁定目标',
  'periscope.btn.locked': '目标已锁定',
  'periscope.btn.dive': '紧急下潜',
  'periscope.status.ready': '潜望镜就绪',
  'periscope.status.raising': '潜望镜升起中…',
  'periscope.status.raised': '潜望镜已升起',
  'periscope.status.cannotRaise': '无法升起潜望镜',
  'periscope.reason.tooDeep': '深度过深 — 请升至潜望镜深度层',
  'periscope.reason.wrongLayer': '深度层错误 — 请将深度设为潜望镜层',
  'periscope.reason.alreadyActive': '潜望镜已处于升起状态',
  'periscope.warn.torpedoFired': '鱼雷已发射',
  'periscope.warn.detected': '敌人可能已发现你的位置',
  'periscope.warn.exposure': '⚠ 敌方侦测风险高',
  'periscope.view.bearing': '方位',
  'periscope.view.speed': '速度',
  'periscope.view.course': '航向',
  'periscope.view.classification': '分类',
  'periscope.view.confidence': '置信度',
  'fc.status.estimated': '估算',
  'fc.status.visualConfirmed': '目视确认',
  'log.periscope.ready': '潜望镜就绪',
  'log.periscope.raising': '潜望镜升起中',
  'log.periscope.raised': '潜望镜已升起',
  'log.periscope.visualContact': '目视接触',
  'log.periscope.classified': '目标已分类',
  'log.periscope.locked': '目标已锁定',
  'log.periscope.unlocked': '目标已解锁',
  'log.periscope.lowered': '潜望镜已降下',
  'log.periscope.cannotRaise': '无法升起潜望镜',
  'log.periscope.exposure': '暴露上升',
  'log.emergencyDive': '紧急下潜',
  'pause.controls': '按键：P 潜望镜 · L 锁定 · X 紧急下潜 · Esc 暂停',
}

const fr: Dict = {
  'app.title': 'SILENT DEPTH',
  'app.subtitle': '深海猎手',
  'app.meta': 'v1.0.0 · HORS LIGNE · ASSETS PROCÉDURAUX',
  'app.loading': 'CHARGEMENT DE LA MISSION…',
  'app.computing': 'CALCUL DU SCORE…',

  'menu.play': 'JOUER',
  'menu.missions': 'MISSIONS',
  'menu.settings': 'PARAMÈTRES',
  'menu.credits': 'CRÉDITS',
  'menu.back': 'RETOUR',
  'menu.quickStart': 'Démarrage rapide : {id}',
  'menu.nextMission': 'PROCHAINE MISSION {id} · RECORD {best}',

  'missions.title': 'MISSIONS',
  'missions.locked': 'VERROUILLÉE',
  'missions.unlocked': 'DÉVERROUILLÉE',
  'missions.rowMeta': 'DIFF {diff} · PAR {par}MIN · RECORD {best}',

  'briefing.title': 'BRIEFING',
  'briefing.objectives': 'OBJECTIFS',
  'briefing.intel': 'RENSEIGNEMENTS',
  'briefing.weather': 'MÉTÉO {w} · VIS {vis}KM',
  'briefing.torpedoes': 'TORPILLES {n} · BATTERIE {pct}% · PAR {par}',
  'briefing.countdown': 'MISSION DANS {s}S',
  'intel.report': 'RAPPORT DE CONVOI : {merchants} MARCHANDS + {escorts} ESCORTES',
  'intel.none': 'AUCUNE CIBLE CONNUE',
  'intel.infoLevel': '(INFOS NIVEAU RAPPORT UNIQUEMENT)',

  'pause.title': 'PAUSE',
  'pause.resume': 'REPRENDRE',
  'pause.restart': 'RECOMMENCER',
  'pause.abort': 'ABANDONNER LA MISSION',
  'outcome.victory': 'MISSION ACCOMPLIE',
  'outcome.defeat': 'MISSION ÉCHOUÉE',

  'result.title': 'RÉSULTAT DE MISSION',
  'result.total': 'SCORE TOTAL {score}',
  'result.stats': 'TORPILLES {hit}/{fired} TOUCHÉES · RESTANT {left} · DÉTECTION MAX {d}% · TEMPS {t}',
  'result.retry': 'RÉESSAYER',
  'result.missions': 'MISSIONS',
  'result.mainMenu': 'MENU PRINCIPAL',
  'result.grade.Perfect': 'PARFAIT',
  'result.grade.Excellent': 'EXCELLENT',
  'result.grade.Good': 'BON',
  'result.grade.Poor': 'MÉDIOCRE',
  'result.grade.Failed': 'ÉCHEC',
  'result.hint.Perfect': 'Embuscade parfaite : faible bruit, solution correcte, toutes les torpilles au but.',
  'result.hint.Excellent': 'Excellent. Conservez l\u2019avantage de la furtivité et de la profondeur.',
  'result.hint.Good': 'Bien. Classez et résolvez la solution de tir avant de tirer.',
  'result.hint.Poor': 'À améliorer : réduisez le bruit (SILENCIEUX), utilisez les couches de profondeur, évitez les pings inutiles.',
  'result.hint.Failed': 'Débrief : classez avant de tirer ; vitesse et pings vous exposent ; la profondeur réduit les dégâts des charges.',
  'result.part.objective': 'OBJECTIFS',
  'result.part.damage': 'DÉGÂTS',
  'result.part.stealth': 'DISCRÉTION',
  'result.part.torpedoEfficiency': 'EFFICACITÉ TORPILLES',
  'result.part.time': 'TEMPS',
  'result.part.survival': 'SURVIE',

  'settings.title': 'PARAMÈTRES',
  'settings.audio': 'AUDIO',
  'settings.display': 'AFFICHAGE',
  'settings.app': 'APPLICATION',
  'settings.masterVolume': 'VOLUME MAÎTRE',
  'settings.sfxVolume': 'VOLUME SFX',
  'settings.musicVolume': 'VOLUME MUSIQUE',
  'settings.showFps': 'AFFICHER FPS',
  'settings.mapGrid': 'GRILLE CARTE',
  'settings.particles': 'PARTICULES',
  'settings.particles.normal': 'NORMAL',
  'settings.particles.low': 'BAS',
  'settings.particles.off': 'DÉSACTIVÉ',
  'settings.sensitivity': 'SENSIBILITÉ',
  'settings.language': 'LANGUE',
  'settings.export': 'EXPORTER LA SAUVEGARDE',
  'settings.import': 'IMPORTER LA SAUVEGARDE',
  'settings.clear': 'EFFACER LA SAUVEGARDE',
  'settings.clearConfirm': 'Effacer la sauvegarde ? Action irréversible.',

  'credits.line1': 'SILENT DEPTH — jeu tactique d\u2019embuscade sous-marine',
  'credits.line2': 'Tout l\u2019art et l\u2019audio sont générés procéduralement (src/rendering/sprites.ts · src/audio)',
  'credits.line3': 'ASSETS TIERS : AUCUN — entièrement hors ligne',
  'credits.line4': 'Zéro requête réseau à l\u2019exécution ; dépendances de dev uniquement (TypeScript / Vite / Vitest)',

  'hud.depth': 'PROFONDEUR',
  'hud.speed': 'VITESSE',
  'hud.heading': 'CAP',
  'hud.battery': 'BATTERIE',
  'hud.hull': 'COQUE',
  'hud.noise': 'BRUIT',
  'hud.detection': 'DÉTECTION',
  'hud.time': 'TEMPS',
  'hud.torpedoes': 'TORPILLES',
  'hud.salvo': 'SALVE',
  'hud.objectives': 'OBJECTIFS',
  'hud.lowBattery': 'BATTERIE FAIBLE',
  'hud.bands.Unaware': 'INCONSCIENT',
  'hud.bands.Suspicious': 'SUSPECT',
  'hud.bands.Searching': 'CHERCHE',
  'hud.bands.Hunting': 'CHASSE',
  'hud.bands.Located': 'LOCALISÉ',
  'hud.layer.Surface': 'SURFACE',
  'hud.layer.Periscope': 'PÉRISCOPE',
  'hud.layer.Shallow': 'FAIBLE',
  'hud.layer.Medium': 'MOYEN',
  'hud.layer.Deep': 'PROFOND',
  'hud.band.STOPPED': 'ARRÊT',
  'hud.band.SILENT': 'SILENCIEUX',
  'hud.band.CRUISE': 'CROISIÈRE',
  'hud.band.FULL': 'PLEINE',
  'hud.depthValue': '{m}M {layer}',
  'hud.ping.ready': 'SONAR PRÊT',
  'hud.ping.cooldown': 'SONAR {s}s',
  'hud.ping.unavailable': 'SONAR INDISPONIBLE',
  'hud.silent.on': 'SILENCIEUX',
  'hud.silent.off': 'NORMAL',
  'hud.decoys': '{n} LEURRES',
  'hud.speedValue': '{v} KT {band}',

  'hud.contacts': 'CONTACTS',
  'hud.contacts.empty': 'Aucun contact actif — sondez ou approchez le convoi.',
  'hud.log': 'JOURNAL D\u2019ÉVÉNEMENTS',
  'hud.contact.id': 'ID',
  'hud.contact.type': 'TYPE',
  'hud.contact.bearing': 'REL',
  'hud.contact.range': 'DIST',
  'hud.contact.speed': 'VIT',
  'hud.contact.heading': 'CAP',
  'hud.contact.confidence': 'CONF',
  'hud.contact.lastSeen': 'VU',
  'hud.lastSeen.now': 'MAINTENANT',
  'hud.lastSeen.seconds': '{s}S',

  'hud.fireControl': 'CONTRÔLE DE TIR',
  'hud.fc.target': 'CIBLE',
  'hud.fc.bearing': 'RELÈVEMENT',
  'hud.fc.range': 'DISTANCE',
  'hud.fc.targetHdg': 'CAP CIBLE',
  'hud.fc.targetSpd': 'VIT. CIBLE',
  'hud.fc.firingBearing': 'REL. DE TIR RECOMMANDÉ',
  'hud.fc.hitProbability': 'PROBABILITÉ DE TOUCHE',
  'hud.fc.salvo': 'SALVE (2)',
  'hud.fc.estimated': 'SOLUTION ESTIMÉE',

  'class.Merchant': 'MARCHAND',
  'class.Cargo': 'CARGO',
  'class.Tanker': 'PÉTROLIER',
  'class.Destroyer': 'DESTROYER',
  'class.Frigate': 'FRÉGATE',
  'class.Submarine': 'SOUS-MARIN',
  'class.Unknown': 'INCONNU',
  'class.LargeSurface': 'GRANDE SURFACE',
  'state.UNKNOWN': 'INCONNU',
  'state.SUSPECTED': 'SOUPÇONNÉ',
  'state.CLASSIFIED': 'CLASSÉ',
  'state.TRACKED': 'SUIVI',
  'state.CONFIRMED': 'CONFIRMÉ',

  'log.entry': '{text} — {id}',
  'log.sonar.ping': 'PING ACTIF',
  'log.sonar.contact': 'ÉCHO SONAR',
  'log.sonar.passive': 'CONTACT PASSIF',
  'log.contact.detected': 'CONTACT SONAR DÉTECTÉ',
  'log.contact.classified': 'CONTACT CLASSÉ',
  'log.contact.degraded': 'CONTACT DÉGRADÉ',
  'log.contact.lost': 'CONTACT PERDU',
  'log.torpedo.ready': 'TORPILLE PRÊTE',
  'log.torpedo.fired': 'TORPILLE LANCÉE',
  'log.torpedo.hit': 'CIBLE TOUCHÉE',
  'log.torpedo.missed': 'TORPILLE MANQUÉE',
  'log.torpedo.expired': 'TORPILLE EXPIRÉE',
  'log.torpedo.fireRejected': 'TIR REFUSÉ',
  'log.ship.sunk': 'NAVIRE COULÉ',
  'log.depthCharge.dropped': 'CHARGES DE PROFONDEUR LARGUÉES',
  'log.depthCharge.detonated': 'CHARGE DE PROFONDEUR DÉTONÉE',
  'log.deckGun.fired': 'CANON DE PONT TIRÉ',
  'log.sub.damaged': 'COQUE ENDOMMAGÉE',
  'log.sub.forcedSurface': 'REMONTÉE FORCÉE',
  'log.battery.low': 'BATTERIE FAIBLE',
  'log.detection.threshold': 'ALERTE DE DÉTECTION',
  'log.player.located': 'SOUS-MARIN LOCALISÉ',
  'log.decoy.launched': 'LEURRE LANCÉ',
  'log.escape.escaped': 'ÉVADÉ',
  'log.mission.victory': 'MISSION ACCOMPLIE',
  'log.mission.defeat': 'MISSION ÉCHOUÉE',
  'log.mission.complete': 'MISSION TERMINÉE',

  'weather.Clear': 'CLAIR',
  'weather.Cloudy': 'NUAGEUX',
  'weather.Storm': 'TEMPÊTE',
  'weather.Fog': 'BROUILLARD',
  'weather.Night': 'NUIT',

  'mission.M01.name': 'Entraînement Sonar',
  'mission.M02.name': 'Première Embuscade',
  'mission.M03.name': 'Attaque de Convoi',
  'mission.M04.name': 'Escorte Lourde',
  'mission.M05.name': 'Chasseur Silencieux',
  'mission.M01.obj.find': 'Trouver un contact marchand',
  'mission.M01.obj.classify': 'Classifier le contact',
  'mission.M01.obj.track': 'Suivre le contact jusqu\u2019à SUIVI',
  'mission.M02.obj.sink-1': 'Couler le pétrolier',
  'mission.M03.obj.sink-1': 'Couler le premier cargo',
  'mission.M03.obj.sink-2': 'Couler un second cargo',
  'mission.M04.obj.sink-1': 'Couler le premier cargo',
  'mission.M04.obj.sink-2': 'Couler un second cargo',
  'mission.M04.obj.survive': 'Survivre à l\u2019attaque de l\u2019escorte',
  'mission.M05.obj.sink-1': 'Couler au moins un navire',
  'mission.M05.obj.escape': 'Échapper aux chasseurs',

  'confirm.abort': 'Abandonner la mission ? La progression sera perdue.',
  'confirm.restart': 'Recommencer la mission ? La progression sera perdue.',

  // --- periscope (t-026) ------------------------------------------------------
  'periscope.title': 'VUE PÉRISCOPE',
  'periscope.state.SUBMERGED': 'IMMERGÉ',
  'periscope.state.SURFACING': 'REMONTÉE',
  'periscope.state.RAISING': 'LEVÉ EN COURS',
  'periscope.state.RAISED': 'LEVÉ',
  'periscope.state.OBSERVING': 'EN OBSERVATION',
  'periscope.state.LOWERING': 'DESCENTE',
  'periscope.band.NONE': 'AUCUNE',
  'periscope.band.LOW': 'FAIBLE',
  'periscope.band.MEDIUM': 'MOYENNE',
  'periscope.band.HIGH': 'ÉLEVÉE',
  'periscope.band.CRITICAL': 'CRITIQUE',
  'periscope.exposure': 'EXPOSITION',
  'periscope.raisedTime': 'LEVÉ {t}',
  'periscope.btn.raise': 'LEVER LE PÉRISCOPE',
  'periscope.btn.lower': 'BAISSER LE PÉRISCOPE',
  'periscope.btn.lock': 'VERROUILLER LA CIBLE',
  'periscope.btn.locked': 'CIBLE VERROUILLÉE',
  'periscope.btn.dive': 'PLONGÉE D\u2019URGENCE',
  'periscope.status.ready': 'PÉRISCOPE PRÊT',
  'periscope.status.raising': 'LEVÉ DU PÉRISCOPE…',
  'periscope.status.raised': 'PÉRISCOPE LEVÉ',
  'periscope.status.cannotRaise': 'LEVÉ IMPOSSIBLE',
  'periscope.reason.tooDeep': 'Trop profond — remontez à la couche périscope',
  'periscope.reason.wrongLayer': 'Mauvaise couche — réglez la profondeur sur périscope',
  'periscope.reason.alreadyActive': 'Périscope déjà levé',
  'periscope.warn.torpedoFired': 'TORPILLE LANCÉE',
  'periscope.warn.detected': 'L\u2019ENNEMI A PEUT-ÊTRE DÉTECTÉ VOTRE POSITION',
  'periscope.warn.exposure': '⚠ RISQUE DE DÉTECTION ÉLEVÉ',
  'periscope.view.bearing': 'RELÈVEMENT',
  'periscope.view.speed': 'VITESSE',
  'periscope.view.course': 'CAP',
  'periscope.view.classification': 'CLASSIFICATION',
  'periscope.view.confidence': 'CONFIANCE',
  'fc.status.estimated': 'ESTIMÉ',
  'fc.status.visualConfirmed': 'CONFIRMÉ VISUELLEMENT',
  'log.periscope.ready': 'PÉRISCOPE PRÊT',
  'log.periscope.raising': 'LEVÉ DU PÉRISCOPE',
  'log.periscope.raised': 'PÉRISCOPE LEVÉ',
  'log.periscope.visualContact': 'CONTACT VISUEL',
  'log.periscope.classified': 'CIBLE CLASSÉE',
  'log.periscope.locked': 'CIBLE VERROUILLÉE',
  'log.periscope.unlocked': 'CIBLE DÉVERROUILLÉE',
  'log.periscope.lowered': 'PÉRISCOPE BAISSÉ',
  'log.periscope.cannotRaise': 'LEVÉ IMPOSSIBLE',
  'log.periscope.exposure': 'EXPOSITION EN HAUSSE',
  'log.emergencyDive': 'PLONGÉE D\u2019URGENCE',
  'pause.controls': 'Commandes : P périscope · L verrouiller · X plongée d\u2019urgence · Esc pause',
}

const ru: Dict = {
  'app.title': 'SILENT DEPTH',
  'app.subtitle': '深海猎手',
  'app.meta': 'v1.0.0 · ОФЛАЙН · ПРОЦЕДУРНЫЕ АССЕТЫ',
  'app.loading': 'ЗАГРУЗКА МИССИИ…',
  'app.computing': 'ПОДСЧЁТ ОЧКОВ…',

  'menu.play': 'ИГРАТЬ',
  'menu.missions': 'МИССИИ',
  'menu.settings': 'НАСТРОЙКИ',
  'menu.credits': 'ТИТРЫ',
  'menu.back': 'НАЗАД',
  'menu.quickStart': 'Быстрый старт: {id}',
  'menu.nextMission': 'СЛЕД. МИССИЯ {id} · РЕКОРД {best}',

  'missions.title': 'МИССИИ',
  'missions.locked': 'ЗАБЛОКИРОВАНО',
  'missions.unlocked': 'ОТКРЫТО',
  'missions.rowMeta': 'СЛОЖН. {diff} · НОРМА {par}МИН · РЕКОРД {best}',

  'briefing.title': 'БРИФИНГ',
  'briefing.objectives': 'ЗАДАЧИ',
  'briefing.intel': 'РАЗВЕДДАННЫЕ',
  'briefing.weather': 'ПОГОДА {w} · ВИДИМОСТЬ {vis}КМ',
  'briefing.torpedoes': 'ТОРПЕДЫ {n} · БАТАРЕЯ {pct}% · НОРМА {par}',
  'briefing.countdown': 'МИССИЯ НАЧНЁТСЯ ЧЕРЕЗ {s} С',
  'intel.report': 'ДОНЕСЕНИЕ: {merchants} ТОРГОВЫХ + {escorts} ЭСКОРТОВ',
  'intel.none': 'ЦЕЛЕЙ НЕ ИЗВЕСТНО',
  'intel.infoLevel': '(ТОЛЬКО УРОВЕНЬ ДОНЕСЕНИЯ)',

  'pause.title': 'ПАУЗА',
  'pause.resume': 'ПРОДОЛЖИТЬ',
  'pause.restart': 'ЗАНОВО',
  'pause.abort': 'ПРЕРВАТЬ МИССИЮ',
  'outcome.victory': 'МИССИЯ ВЫПОЛНЕНА',
  'outcome.defeat': 'МИССИЯ ПРОВАЛЕНА',

  'result.title': 'РЕЗУЛЬТАТ МИССИИ',
  'result.total': 'ИТОГ {score}',
  'result.stats': 'ТОРПЕДЫ {hit}/{fired} ПОПАД. · ОСТАЛОСЬ {left} · МАКС. ОБНАР. {d}% · ВРЕМЯ {t}',
  'result.retry': 'ПОВТОРИТЬ',
  'result.missions': 'МИССИИ',
  'result.mainMenu': 'ГЛАВНОЕ МЕНЮ',
  'result.grade.Perfect': 'ИДЕАЛЬНО',
  'result.grade.Excellent': 'ОТЛИЧНО',
  'result.grade.Good': 'ХОРОШО',
  'result.grade.Poor': 'СЛАБО',
  'result.grade.Failed': 'ПРОВАЛ',
  'result.hint.Perfect': 'Идеальная засада: тихий ход, точное решение, все торпеды в цель.',
  'result.hint.Excellent': 'Отлично. Сохраняйте скрытность и глубину; эффективность торпед высокая.',
  'result.hint.Good': 'Хорошо. Классифицируйте и решайте решение до выстрела.',
  'result.hint.Poor': 'Улучшите: тише ход (ТИХО), глубже погружение, реже активный сонар.',
  'result.hint.Failed': 'Разбор: сначала классификация; скорость и пинг выдают вас; глубина снижает урон от бомб.',
  'result.part.objective': 'ЗАДАЧИ',
  'result.part.damage': 'УРОН',
  'result.part.stealth': 'СКРЫТНОСТЬ',
  'result.part.torpedoEfficiency': 'ЭФФЕКТИВНОСТЬ ТОРПЕД',
  'result.part.time': 'ВРЕМЯ',
  'result.part.survival': 'ВЫЖИВАНИЕ',

  'settings.title': 'НАСТРОЙКИ',
  'settings.audio': 'АУДИО',
  'settings.display': 'ДИСПЛЕЙ',
  'settings.app': 'ПРИЛОЖЕНИЕ',
  'settings.masterVolume': 'ОБЩАЯ ГРОМКОСТЬ',
  'settings.sfxVolume': 'ГРОМКОСТЬ ЭФФЕКТОВ',
  'settings.musicVolume': 'ГРОМКОСТЬ МУЗЫКИ',
  'settings.showFps': 'ПОКАЗЫВАТЬ FPS',
  'settings.mapGrid': 'СЕТКА КАРТЫ',
  'settings.particles': 'ЧАСТИЦЫ',
  'settings.particles.normal': 'ОБЫЧНО',
  'settings.particles.low': 'НИЗКО',
  'settings.particles.off': 'ВЫКЛ',
  'settings.sensitivity': 'ЧУВСТВИТЕЛЬНОСТЬ',
  'settings.language': 'ЯЗЫК',
  'settings.export': 'ЭКСПОРТ',
  'settings.import': 'ИМПОРТ',
  'settings.clear': 'ОЧИСТИТЬ',
  'settings.clearConfirm': 'Очистить сохранение? Это действие необратимо.',

  'credits.line1': 'SILENT DEPTH — тактическая подводная игра-засада',
  'credits.line2': 'Вся графика и звук генерируются процедурно (src/rendering/sprites.ts · src/audio)',
  'credits.line3': 'СТОРОННИЕ АКТИВЫ: НЕТ — полностью офлайн',
  'credits.line4': 'Ноль сетевых запросов в рантайме; зависимости только для разработки (TypeScript / Vite / Vitest)',

  'hud.depth': 'ГЛУБИНА',
  'hud.speed': 'СКОРОСТЬ',
  'hud.heading': 'КУРС',
  'hud.battery': 'БАТАРЕЯ',
  'hud.hull': 'КОРПУС',
  'hud.noise': 'ШУМ',
  'hud.detection': 'ОБНАРУЖЕНИЕ',
  'hud.time': 'ВРЕМЯ',
  'hud.torpedoes': 'ТОРПЕДЫ',
  'hud.salvo': 'ЗАЛП',
  'hud.objectives': 'ЗАДАЧИ',
  'hud.lowBattery': 'НИЗКИЙ ЗАРЯД',
  'hud.bands.Unaware': 'НЕ ЗНАЮТ',
  'hud.bands.Suspicious': 'ПОДОЗРЕВАЮТ',
  'hud.bands.Searching': 'ИЩУТ',
  'hud.bands.Hunting': 'ОХОТЯТСЯ',
  'hud.bands.Located': 'ЛОКАЛИЗОВАН',
  'hud.layer.Surface': 'ПОВЕРХНОСТЬ',
  'hud.layer.Periscope': 'ПЕРИСКОП',
  'hud.layer.Shallow': 'МЕЛКОВОДЬЕ',
  'hud.layer.Medium': 'СРЕДНЯЯ',
  'hud.layer.Deep': 'ГЛУБИНА',
  'hud.band.STOPPED': 'СТОП',
  'hud.band.SILENT': 'ТИХО',
  'hud.band.CRUISE': 'КРЕЙС',
  'hud.band.FULL': 'ПОЛНЫЙ',
  'hud.depthValue': '{m}M {layer}',
  'hud.ping.ready': 'СОНАР ГОТОВ',
  'hud.ping.cooldown': 'СОНАР {s}с',
  'hud.ping.unavailable': 'СОНАР НЕДОСТУПЕН',
  'hud.silent.on': 'ТИХИЙ ХОД',
  'hud.silent.off': 'НОРМАЛЬНЫЙ',
  'hud.decoys': 'ЛОВУШКИ {n}',
  'hud.speedValue': '{v} KT {band}',

  'hud.contacts': 'КОНТАКТЫ',
  'hud.contacts.empty': 'Активных контактов нет — пингуйте сонар или приблизьтесь к конвою.',
  'hud.log': 'ЖУРНАЛ СОБЫТИЙ',
  'hud.contact.id': 'ID',
  'hud.contact.type': 'ТИП',
  'hud.contact.bearing': 'ПЕЛ',
  'hud.contact.range': 'ДИСТ',
  'hud.contact.speed': 'СКОР',
  'hud.contact.heading': 'КУРС',
  'hud.contact.confidence': 'УВЕР',
  'hud.contact.lastSeen': 'ВИДЕН',
  'hud.lastSeen.now': 'СЕЙЧАС',
  'hud.lastSeen.seconds': '{s}С',

  'hud.fireControl': 'УПРАВЛЕНИЕ ОГНЁМ',
  'hud.fc.target': 'ЦЕЛЬ',
  'hud.fc.bearing': 'ПЕЛЕНГ',
  'hud.fc.range': 'ДИСТАНЦИЯ',
  'hud.fc.targetHdg': 'КУРС ЦЕЛИ',
  'hud.fc.targetSpd': 'СКОР. ЦЕЛИ',
  'hud.fc.firingBearing': 'РЕК. ПЕЛЕНГ СТРЕЛЬБЫ',
  'hud.fc.hitProbability': 'ВЕРОЯТНОСТЬ ПОПАДАНИЯ',
  'hud.fc.salvo': 'ЗАЛП (2)',
  'hud.fc.estimated': 'ОЦЕНОЧНОЕ РЕШЕНИЕ',

  'class.Merchant': 'ТОРГОВЕЦ',
  'class.Cargo': 'ГРУЗ',
  'class.Tanker': 'ТАНКЕР',
  'class.Destroyer': 'ЭСМИНЕЦ',
  'class.Frigate': 'ФРЕГАТ',
  'class.Submarine': 'ПОДЛОДКА',
  'class.Unknown': 'НЕИЗВЕСТНО',
  'class.LargeSurface': 'КРУПНАЯ НАДВОДНАЯ',
  'state.UNKNOWN': 'НЕИЗВЕСТНО',
  'state.SUSPECTED': 'ПОДОЗРИТЕЛЬНЫЙ',
  'state.CLASSIFIED': 'КЛАССИФИЦИРОВАН',
  'state.TRACKED': 'ОТСЛЕЖИВАЕТСЯ',
  'state.CONFIRMED': 'ПОДТВЕРЖДЁН',

  'log.entry': '{text} — {id}',
  'log.sonar.ping': 'АКТИВНЫЙ ПИНГ',
  'log.sonar.contact': 'СОНАРНЫЙ ОТВЕТ',
  'log.sonar.passive': 'ПАССИВНЫЙ КОНТАКТ',
  'log.contact.detected': 'ОБНАРУЖЕН КОНТАКТ',
  'log.contact.classified': 'КОНТАКТ КЛАССИФИЦИРОВАН',
  'log.contact.degraded': 'КОНТАКТ УХУДШИЛСЯ',
  'log.contact.lost': 'КОНТАКТ ПОТЕРЯН',
  'log.torpedo.ready': 'ТОРПЕДА ГОТОВА',
  'log.torpedo.fired': 'ТОРПЕДА ПУЩЕНА',
  'log.torpedo.hit': 'ПОПАДАНИЕ В ЦЕЛЬ',
  'log.torpedo.missed': 'ТОРПЕДА МИМО',
  'log.torpedo.expired': 'ТОРПЕДА ИСТЕКЛА',
  'log.torpedo.fireRejected': 'ВЫСТРЕЛ ОТКЛОНЁН',
  'log.ship.sunk': 'КОРАБЛЬ ПОТОПЛЕН',
  'log.depthCharge.dropped': 'СБРОШЕНЫ ГЛУБИННЫЕ БОМБЫ',
  'log.depthCharge.detonated': 'ГЛУБИННАЯ БОМБА ВЗОРВАЛАСЬ',
  'log.deckGun.fired': 'ПАЛУБНОЕ ОРУДИЕ ВЫСТРЕЛИЛО',
  'log.sub.damaged': 'КОРПУС ПОВРЕЖДЁН',
  'log.sub.forcedSurface': 'ВЫНУЖДЕННОЕ ВСПЛЫТИЕ',
  'log.battery.low': 'НИЗКИЙ ЗАРЯД',
  'log.detection.threshold': 'ПРЕДУПРЕЖДЕНИЕ ОБ ОБНАРУЖЕНИИ',
  'log.player.located': 'ПОДЛОДКА ОБНАРУЖЕНА',
  'log.decoy.launched': 'ЛОЖНАЯ ЦЕЛЬ ЗАПУЩЕНА',
  'log.escape.escaped': 'УШЁЛ ОТ ПРЕСЛЕДОВАНИЯ',
  'log.mission.victory': 'МИССИЯ ВЫПОЛНЕНА',
  'log.mission.defeat': 'МИССИЯ ПРОВАЛЕНА',
  'log.mission.complete': 'МИССИЯ ЗАВЕРШЕНА',

  'weather.Clear': 'ЯСНО',
  'weather.Cloudy': 'ОБЛАЧНО',
  'weather.Storm': 'ШТОРМ',
  'weather.Fog': 'ТУМАН',
  'weather.Night': 'НОЧЬ',

  'mission.M01.name': 'Сонар-тренировка',
  'mission.M02.name': 'Первая засада',
  'mission.M03.name': 'Атака конвоя',
  'mission.M04.name': 'Тяжёлый эскорт',
  'mission.M05.name': 'Тихий охотник',
  'mission.M01.obj.find': 'Найти контакт с торговым судном',
  'mission.M01.obj.classify': 'Классифицировать контакт',
  'mission.M01.obj.track': 'Отслеживать контакт до ОТСЛЕЖИВАЕТСЯ',
  'mission.M02.obj.sink-1': 'Потопить танкер',
  'mission.M03.obj.sink-1': 'Потопить первый груз',
  'mission.M03.obj.sink-2': 'Потопить второй груз',
  'mission.M04.obj.sink-1': 'Потопить первый груз',
  'mission.M04.obj.sink-2': 'Потопить второй груз',
  'mission.M04.obj.survive': 'Пережить атаку эскорта',
  'mission.M05.obj.sink-1': 'Потопить хотя бы одно судно',
  'mission.M05.obj.escape': 'Уйти от охотников',

  'confirm.abort': 'Прервать миссию? Прогресс будет потерян.',
  'confirm.restart': 'Начать миссию заново? Прогресс будет потерян.',

  // --- periscope (t-026) ------------------------------------------------------
  'periscope.title': 'ПЕРИСКОП',
  'periscope.state.SUBMERGED': 'ОПУЩЕН',
  'periscope.state.SURFACING': 'ВСПЛЫТИЕ',
  'periscope.state.RAISING': 'ПОДЪЁМ',
  'periscope.state.RAISED': 'ПОДНЯТ',
  'periscope.state.OBSERVING': 'НАБЛЮДЕНИЕ',
  'periscope.state.LOWERING': 'ОПУСКАНИЕ',
  'periscope.band.NONE': 'НЕТ',
  'periscope.band.LOW': 'НИЗКИЙ',
  'periscope.band.MEDIUM': 'СРЕДНИЙ',
  'periscope.band.HIGH': 'ВЫСОКИЙ',
  'periscope.band.CRITICAL': 'КРИТИЧЕСКИЙ',
  'periscope.exposure': 'ЭКСПОЗИЦИЯ',
  'periscope.raisedTime': 'ПОДНЯТ {t}',
  'periscope.btn.raise': 'ПОДНЯТЬ ПЕРИСКОП',
  'periscope.btn.lower': 'ОПУСТИТЬ ПЕРИСКОП',
  'periscope.btn.lock': 'ЗАХВАТИТЬ ЦЕЛЬ',
  'periscope.btn.locked': 'ЦЕЛЬ ЗАХВАЧЕНА',
  'periscope.btn.dive': 'АВАРИЙНОЕ ПОГРУЖЕНИЕ',
  'periscope.status.ready': 'ПЕРИСКОП ГОТОВ',
  'periscope.status.raising': 'ПОДЪЁМ ПЕРИСКОПА…',
  'periscope.status.raised': 'ПЕРИСКОП ПОДНЯТ',
  'periscope.status.cannotRaise': 'НЕВОЗМОЖНО ПОДНЯТЬ',
  'periscope.reason.tooDeep': 'Слишком глубоко — поднимитесь на слой перископа',
  'periscope.reason.wrongLayer': 'Неверный слой — установите слой перископа',
  'periscope.reason.alreadyActive': 'Перископ уже поднят',
  'periscope.warn.torpedoFired': 'ТОРПЕДА ПУЩЕНА',
  'periscope.warn.detected': 'ВРАГ МОГ ЗАСЕЧЬ ВАШУ ПОЗИЦИЮ',
  'periscope.warn.exposure': '⚠ ВЫСОКИЙ РИСК ОБНАРУЖЕНИЯ',
  'periscope.view.bearing': 'ПЕЛЕНГ',
  'periscope.view.speed': 'СКОРОСТЬ',
  'periscope.view.course': 'КУРС',
  'periscope.view.classification': 'КЛАССИФИКАЦИЯ',
  'periscope.view.confidence': 'УВЕРЕННОСТЬ',
  'fc.status.estimated': 'ОЦЕНКА',
  'fc.status.visualConfirmed': 'ВИЗУАЛЬНО ПОДТВЕРЖДЁН',
  'log.periscope.ready': 'ПЕРИСКОП ГОТОВ',
  'log.periscope.raising': 'ПОДЪЁМ ПЕРИСКОПА',
  'log.periscope.raised': 'ПЕРИСКОП ПОДНЯТ',
  'log.periscope.visualContact': 'ВИЗУАЛЬНЫЙ КОНТАКТ',
  'log.periscope.classified': 'ЦЕЛЬ КЛАССИФИЦИРОВАНА',
  'log.periscope.locked': 'ЦЕЛЬ ЗАХВАЧЕНА',
  'log.periscope.unlocked': 'ЦЕЛЬ ОТПУЩЕНА',
  'log.periscope.lowered': 'ПЕРИСКОП ОПУЩЕН',
  'log.periscope.cannotRaise': 'НЕВОЗМОЖНО ПОДНЯТЬ',
  'log.periscope.exposure': 'ЭКСПОЗИЦИЯ РАСТЁТ',
  'log.emergencyDive': 'АВАРИЙНОЕ ПОГРУЖЕНИЕ',
  'pause.controls': 'Управление: P перископ · L захват · X погружение · Esc пауза',
}

export const translations: Record<Lang, Dict> = { en, zh, fr, ru }

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

export type Translator = (key: string, vars?: Record<string, string | number>) => string

/**
 * Create a translator bound to a language. Missing keys fall back to English
 * then to the raw key (never crashes). '{name}' placeholders are replaced
 * from `vars`.
 */
export function getT(lang: Lang): Translator {
  const dict: Record<string, string> = translations[lang] ?? translations.en
  const enDict: Record<string, string> = translations.en
  return (key: string, vars?: Record<string, string | number>): string => {
    let template = dict[key]
    if (template === undefined) template = enDict[key] ?? key
    if (vars !== undefined && template.includes('{')) {
      for (const [name, value] of Object.entries(vars)) {
        template = template.split(`{${name}}`).join(String(value))
      }
    }
    return template
  }
}

/** Default-EN translator — canonical for tests and pure helpers. */
export const t: Translator = getT('en')

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

/**
 * Map a browser language tag to a supported language:
 * zh* → zh, fr* → fr, ru* → ru, everything else → en.
 */
export function langFromNavigator(tag: string | null | undefined): Lang {
  if (typeof tag !== 'string' || tag.length === 0) return 'en'
  const t0 = tag.toLowerCase()
  if (t0.startsWith('zh')) return 'zh'
  if (t0.startsWith('fr')) return 'fr'
  if (t0.startsWith('ru')) return 'ru'
  return 'en'
}

/**
 * Extract the language from a parsed save JSON (settings.app.language).
 * Returns null when the shape is invalid or the value is not a known Lang.
 */
export function langFromSettings(raw: unknown): Lang | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const settings = r['settings']
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return null
  const app = (settings as Record<string, unknown>)['app']
  if (app === null || typeof app !== 'object' || Array.isArray(app)) return null
  const value = (app as Record<string, unknown>)['language']
  return isLang(value) ? value : null
}

/**
 * Detect the UI language: saved settings (localStorage 'silent-depth:save:v1'
 * → settings.app.language) → navigator.language → 'en'. Node-safe.
 */
export function detectLanguage(): Lang {
  if (typeof localStorage !== 'undefined') {
    try {
      const rawText = localStorage.getItem(SAVE_KEY)
      if (rawText !== null) {
        const parsed: unknown = JSON.parse(rawText)
        const fromSave = langFromSettings(parsed)
        if (fromSave !== null) return fromSave
      }
    } catch {
      // Corrupt storage / private mode — fall through to navigator.
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    return langFromNavigator(navigator.language)
  }
  return 'en'
}
