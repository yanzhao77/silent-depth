# SILENT DEPTH 《深海猎手》 — Game Architecture (GAME_ARCHITECTURE.md)

| 字段 | 值 |
|---|---|
| 项目 | p-004 SILENT DEPTH 《深海猎手》 |
| 文档版本 | v1.0 (DRAFT — 待 QA/实现评审) |
| 上游输入 | `requirements.md` rev-001 · `GAME_DESIGN.md` v1.0 (authoritative balance) · `VISUAL_STYLE.md` v1 · `AUDIO_DESIGN.md` v1 · `memory/ADR.md` (ADR-001..005) · `contracts/gates.yaml` |
| 作者 | Game Systems Architect role agent (DeepSeek Software Factory) |
| 状态 | 对应任务 t-002 (game-architect, running) · 出口门禁: `architecture-gate` |

> 本文件是**实现蓝本**：所有模块、接口、事件、数据结构均以本文件为准；平衡数值一律读 `config/balance.json` (NFR-5, ADR-002)，本文件不复制数值。数值权威 = GAME_DESIGN.md §12 / §15。

---

## 目录 (Table of Contents)

1. 架构原则 (Architecture Principles)
2. 运行时架构 (Runtime Architecture)
3. 模块地图 (Module Map)
4. 引擎 API 契约 (Engine API Contract, ADR-005)
5. 确定性策略 (Determinism Policy, ADR-004)
6. 实体与状态接口 (Entity / State Interfaces, TS 草图)
7. 系统交互图 (System Interaction & Event Flow)
8. 渲染管线 (Rendering Pipeline)
9. 存档与设置 (Save / Load & Settings)
10. 测试策略 (Test Strategy)
11. 性能 (Performance)
12. 安全 (Security Notes)
13. 需求覆盖矩阵 (FR → Module Ownership)
14. 事件目录 (Event Catalogue)

---

## 1. 架构原则 (Architecture Principles)

1. **Headless-first (ADR-001)**：整个游戏仿真为纯 TypeScript，零 DOM 依赖，由 seeded RNG 驱动。浏览器层 (Vite + Canvas 2D + 极简 DOM HUD) 只是同一引擎的薄适配器。
2. **单一引擎代码路径 (single engine code path)**：headless sim runner、AI playtest、浏览器游戏共享同一份 `createGame` / `step` 实现——不存在"测试版逻辑"与"游戏版逻辑"两套，杜绝逻辑漂移 (R2)。
3. **确定性 (ADR-004)**：任务生成、世界生成、AI 决策、战斗结算全部消费同一个 seeded RNG (mulberry32)。`step()` 对 (handle, inputs, dt) 是纯函数——无墙钟、无 `Math.random`。
4. **数值单一权威源 (ADR-002)**：所有游戏数值在 `config/balance.json`，运行时读取，禁止硬编码；平衡调整只改该文件。
5. **全程序化资产与音频 (ADR-003)**：精灵/特效 Canvas 程序化绘制，音频 WebAudio 合成；零外部样本/图片 → 零许可风险；`assets/registry.json` 记录 provenance。
6. **信息即资源 (GAME_DESIGN §1)**：声呐/接触/不确定性模型 (P0) 是架构第一公民——引擎输出**带误差的数据**，渲染层负责不确定性椭圆而非红点。
7. **离线 by construction (NFR-2)**：无运行时网络、无 CDN、无外部依赖。
8. **小但完整**：模块按 GAME_DESIGN §13 FR 矩阵一一对应，无新增系统；v1 无 3D/多人/账号/服务器。

---

## 2. 运行时架构 (Runtime Architecture)

三个运行形态共享同一引擎核心：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENGINE (src/) — 纯 TS, 无 DOM                  │
│                                                                     │
│   ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│   │ src/core     │   │ src/gameplay │   │ src/sonar (P0)        │  │
│   │ rng/eventBus │   │ submarine    │   │ ping/passive/contacts │  │
│   │ stateMachine │   │ decoy        │   │ uncertainty/classify  │  │
│   │ time/balance │   │              │   └───────────────────────┘  │
│   └──────┬───────┘   └──────┬───────┘   ┌──────────────┐           │
│          │                  │           │ src/ai       │           │
│   ┌──────▼──────────────────▼────────┐   │ state/convoy │           │
│   │  createGame(missionDef, seed)    │   │ escort/search│           │
│   │  step(handle, dt, inputs)        │   └──────┬───────┘           │
│   │  → GameSnapshot (pure data)      │          │                   │
│   └──────▲──────────────────▲────────┘   ┌──────▼───────┐           │
│          │                  │            │ src/combat   │           │
│   ┌──────┴────────┐   ┌─────┴──────┐     │ torpedo/DC   │           │
│   │ src/missions  │   │ src/world  │     │ fireControl/ │           │
│   │ 5 missions +  │   │ ocean/     │     │ damage/      │           │
│   │ generator     │   │ weather    │     │ detection    │           │
│   └───────────────┘   └────────────┘     └──────────────┘           │
│   ▲ 只被以下三个"外壳"调用，引擎不知道它们存在                       │
└───┼─────────────────────────────────────────────────────────────────┘
    │
    ├──────────────► ① Headless Sim (src/sim)
    │                 runner.ts / playtest.ts — Node 下驱动 step()，
    │                 记录 audit trail → reports/playtest/*.md (NFR-6)
    │
    ├──────────────► ② Browser App (src/main.ts + src/rendering + src/ui)
    │                 Vite 入口 → 60Hz rAF 渲染循环 → 20Hz 固定步长调用
    │                 step() → Canvas 2D 绘制 + 极简 DOM HUD
    │
    └──────────────► ③ Vitest (tests/**)
                      在 Node 中直接 import 引擎 → 单元/集成/回归测试
```

关键点：

- **引擎零 import 浏览器 API**：`src/core|gameplay|sonar|ai|combat|missions|world|sim` 不引用 `window`/`document`/`AudioContext`/`localStorage`。`tsconfig` `lib` 含 DOM 仅为渲染/UI 编译，引擎文件用 `/** @pure */` 注释 + lint 规则约束。
- **`step` 是唯一时间推进口**：浏览器、headless、测试三处都通过 `step(handle, dt, inputs)` 推进仿真，dt 恒为固定步长 (0.05 s = 20 Hz)。
- **快照即契约**：引擎输出 `GameSnapshot` 纯数据对象；渲染/UI/音频只读快照与事件，绝不写回引擎内部 (单向数据流)。
- **事件总线只进不出**：引擎 emit 事件 (含时间戳) 供 UI 事件日志、音频触发、playtest 审计消费；事件不携带可执行代码。

---

## 3. 模块地图 (Module Map)

模块分层与依赖方向（只允许向下依赖，禁止环）：

```
src/core → src/world → src/missions → src/gameplay → src/sonar → src/ai → src/combat
        ↘ 全部模块读 config/balance.json（通过 src/core/balance.ts 类型化读取）

src/rendering → src/core + 各领域模块的公开类型 (读快照)
src/ui        → src/core (事件/状态) + src/rendering (绘制) + src/save (设置)
src/audio     → src/core (事件) + config/settings.json
src/save      → src/core (类型) + localStorage (浏览器外壳注入)
src/sim       → src/core + src/missions (headless 驱动)
src/main.ts   → 装配所有外壳 (浏览器入口)
```

| 模块 | 职责 (GAME_DESIGN 依据) | 关键文件 | 关键接口 |
|---|---|---|---|
| **src/core** | 种子 RNG、事件总线、游戏状态机 (BOOT/MENU/MISSION_LOADING/MISSION_RUNNING/PAUSED/VICTORY/DEFEAT/MISSION_RESULT)、固定时间步、balance 类型化读取 | `rng.ts` `eventBus.ts` `stateMachine.ts` `time.ts` `balance.ts` `engine.ts` `types.ts` | `createRng(seed)` `createGame(missionDef, seed)` `step(handle, dt, inputs)` `loadBalance()` |
| **src/gameplay** | 玩家潜艇：移动/转向/四档速度/五层深度/电池/噪声/船体 (FR-01..03, FR-13)；decoy (FR-12) | `submarine.ts` `decoy.ts` | `updateSubmarine(dt, inputs, world, balance, rng)` `createDecoy(...)` |
| **src/sonar** | P0 声呐：主动 ping、被动监听、接触状态机 (FR-05)、不确定性收敛 (FR-06)、分类 (FR-08) | `sonar.ts` `ping.ts` `passive.ts` `contacts.ts` `uncertainty.ts` `classification.ts` | `runSonarTick(...)` `pingActive(...)` `listenPassive(...)` `updateContacts(...)` |
| **src/ai** | 敌方状态机 (FR-10)、编队/护航 (FR-09)、搜索模式 + LKP (FR-10, F5)、敌方探测率 (B9, F3/F4) | `ship.ts` `aiState.ts` `convoy.ts` `escort.ts` `search.ts` `ai.ts` | `updateEnemyFleet(dt, world, player, rng, balance)` |
| **src/combat** | 鱼雷状态机/无自锁 (FR-11)、火控解算 (F6/F7)、伤害/深水炸弹/甲板炮 (FR-11, §7.5)、探测计与逃脱 (FR-12, F8/F9) | `torpedo.ts` `fireControl.ts` `damage.ts` `depthCharge.ts` `detection.ts` | `updateTorpedoes(...)` `solveFireSolution(contact, player)` `hitProbability(...)` `updateDetection(...)` |
| **src/missions** | 5 任务 (FR-14)、种子生成器 (FR-15)、目标/胜利判定 (§9, §10.1) | `generator.ts` `missions.ts` `objectives.ts` | `generateMission(input): MissionDef` `getMissionDef(id)` `evaluateObjectives(state)` |
| **src/world** | 过程化海洋 (FR-16)、天气/能见度 (FR-17)、洋流 (视觉) | `ocean.ts` `weather.ts` `currents.ts` | `generateOcean(seed)` `weatherModifiers(weather)` |
| **src/rendering** | Canvas 2D 渲染、程序化精灵 (ADR-003, VISUAL_STYLE)、粒子、不确定椭圆、minimap | `renderer.ts` `layers.ts` `sprites.ts` `particles.ts` `minimap.ts` `camera.ts` | `render(ctx, snapshot, camera, dt)` `createParticleSystem(balance)` |
| **src/ui** | 战术 HUD/接触面板/事件日志/菜单/任务简报/MISSION_RESULT (FR-18, §11)；键盘输入 (§11.2) | `hud.ts` `menus.ts` `input.ts` `dom.ts` (安全 DOM helper) | `mountHud(root, engine)` `renderMenu(screen)` `handleKey(ev)` |
| **src/audio** | WebAudio 程序合成 ≥10 SFX + 环境底噪 (FR-22, AUDIO_DESIGN)；懒初始化 (autoplay policy) | `audio.ts` `sfx/*.ts` `ambience.ts` | `createAudio(settings)` `play(sfxName)` `onEngineEvent(ev)` |
| **src/save** | localStorage JSON 存档 (FR-19)：解锁/最高分/统计/设置；导出/导入；版本迁移 | `save.ts` | `loadSave()` `writeSave(save)` `resetSave()` |
| **src/sim** | 无头运行器 + AI playtest 驱动 (NFR-6, ADR-005) | `runner.ts` `playtest.ts` `replay.ts` | `runScripted(missionDef, plan, seed)` `playtestMission(id, seed)` |
| **src/main.ts** | 浏览器装配：状态机驱动菜单、rAF 循环、模块注入 (save/audio/input) | `main.ts` | — |

**所有权矩阵 (每子系统一个拥有模块)**：声呐→`src/sonar`；敌方 AI→`src/ai`；编队/护航→`src/ai/convoy+escort`；搜索/LKP→`src/ai/search`；鱼雷→`src/combat/torpedo`；命中概率→`src/combat/fireControl`；伤害→`src/combat/damage`；深水炸弹→`src/combat/depthCharge`；探测/逃脱→`src/combat/detection`；任务→`src/missions`；世界/天气→`src/world`；UI→`src/ui`；资产→`src/rendering/sprites`+`assets/registry.json`；音频→`src/audio`；存档→`src/save`；确定性基础设施→`src/core`。GAME_DESIGN 每个子系统均有唯一 owner，无孤儿需求。

---

## 4. 引擎 API 契约 (Engine API Contract — ADR-005)

引擎对外只暴露两个函数 + 类型，**与 ADR-005 逐字段一致**：

```ts
// src/core/engine.ts
export interface GameHandle {
  readonly mission: MissionDef
  readonly seed: number
  // 内部可变世界状态 —— 外部 (渲染/UI/测试) 禁止直接读写
  // step() 是唯一修改入口；状态对象引用由实现持有，快照为拷贝/冻结视图
  readonly __internal: unknown // 实现细节，类型层面隐藏
}

export function createGame(missionDef: MissionDef, seed: number): GameHandle

export function step(handle: GameHandle, dtSeconds: number, inputs: PlayerInputs): GameSnapshot
```

**inputs（字段名与 ADR-005 完全一致；`throttle` 单位 = kt 目标速度）**：

```ts
export interface PlayerInputs {
  throttle: number        // 目标速度 (kt) —— ADR-005 字段名；渲染层可别名 throttleKt
  rudder: number          // -1..1，左舵负右舵正；0 = 直舵
  depthLayerTarget: DepthLayer   // 目标深度层 (五层之一)
  silentRunning: boolean  // 静默运行开关
  ping: boolean           // 请求一次主动声呐 ping（边沿触发：true→false 记一次）
  fireTorpedo: string | null     // 目标 contactId；null = 不发射；同 tick 只处理一次
  decoy: boolean          // 发射 decoy（边沿触发）
  pause: boolean          // 请求暂停/恢复（边沿触发）
}
```

> 命名说明：设计稿 prompt 曾写作 `throttleKt`；ADR-005 (ACCEPTED, immutable) 定为 `throttle`（单位 kt）。按约束"engine API matches ADR-005 exactly"，**采用 `throttle`**；若前端需要可读性别名，由 `src/ui/input.ts` 映射，不改变契约。

**GameSnapshot（纯数据，ADR-005 字段全齐）**：

```ts
export interface GameSnapshot {
  simTime: number                 // 仿真秒（固定步长累加，非墙钟）
  state: GameState                // BOOT|MENU|MISSION_LOADING|MISSION_RUNNING|PAUSED|VICTORY|DEFEAT|MISSION_RESULT
  playerSub: SubmarineState       // 位置/航向/速度/深度层/电池/噪声/船体/探测计/sonarState/鱼雷管
  contacts: Contact[]             // 带不确定性字段的接触列表 (FR-05)
  enemies: EnemyShip[]            // 敌船公开视图（含 AI 状态、位置、朝向、船体、弹药）
  torpedoes: Torpedo[]            // 飞行中鱼雷（含状态）
  decoys: Decoy[]
  mission: MissionStatus          // 目标清单 + 完成进度 + 是否已达成
  score: ScoreParts               // §10.1 六个组件分 + 总分（任务进行中为累计）
  eventLog: EventEntry[]          // 事件日志尾（环形缓冲，如最近 50 条）
  stats: MatchStats               // 命中/发射、探测峰值、耗时、剩余鱼雷、最高分
}
```

**不变量**：
1. `step` 幂等可复现：相同 (handle, dt, inputs) 序列 ⇒ 相同快照序列 (同一 seed)。
2. 快照**只读**：渲染/UI 不得修改；引擎每次 step 产出新快照（或版本化复用，见 §11 性能）。
3. 非法输入不崩溃：`rudder` clamp [-1,1]；`throttle` clamp [0, 22]；`fireTorpedo` 指向不存在的 contact → 忽略并 emit `torpedo.fireRejected` 事件。
4. `pause: true` 时 step 仍推进 `simTime`? 否——PAUSED 状态 step 不推进仿真，只翻转状态与快照 state 字段 (见 §5)。

---

## 5. 确定性策略 (Determinism Policy — ADR-004)

1. **单一 RNG 源**：引擎内**唯一**随机来源是 `createRng(seed)`（mulberry32 实现），任务 seed 来自 `MissionDef.seed`（M01–M05 固定 1001–1005）。`src/core/rng.ts`：

   ```ts
   export interface Rng {
     next(): number            // [0,1)
     range(min: number, max: number): number
     int(min: number, max: number): number  // 含两端
     chance(p: number): boolean
     sign(): 1 | -1
     fork(label: string): Rng  // 派生流（如每系统独立子流，见下）
   }
   ```

2. **消费顺序固定**：同一 tick 内各系统按**固定顺序**消费 RNG（§7 的 tick 顺序即 RNG 消费顺序）：`world → missions/objectives → gameplay/submarine → sonar → ai → combat → detection`。任何代码改动不得改变该顺序；新增随机调用必须插到子系统末尾并更新本文档。
3. **禁止项**：引擎内 `Math.random`、`Date.now`、`performance.now`、`setTimeout`、网络时间一律禁止。AI 决策、伤害波动 (90±10)、命中判定 (F7 roll)、搜索模式转弯、编队抖动全部走 RNG。
4. **派生流 (fork)**：为降低"某系统多消耗一次 RNG 导致全剧重演"的耦合风险，每子系统在任务开始用 `rng.fork('sonar')` 等派生独立子流（派生算法确定性）。子系统内部顺序稳定即可。**主 RNG 只用于 fork 与全局决策**。
5. **pause 语义**：PAUSED 时 `step` 返回快照但 `simTime` 不增、无系统 tick、不消费 RNG——暂停不破坏可复现性。
6. **replay**：存档记录 `{missionId, seed}` + 每 tick inputs 序列（可选精简：只记录变更 tick）→ 可完整重放 (NFR-3)。
7. **渲染层例外**：插值动画的墙钟只用于视觉 (rAF 时间戳)，**永不回灌引擎**；粒子系统视觉随机可用渲染层自身 RNG（与引擎无涉）。

---

## 6. 实体与状态接口 (Entity / State Interfaces — TS 草图)

权威定义在 `src/core/types.ts`（实现时唯一出处；UI/渲染/测试均从该文件 import）。

```ts
// ---- 枚举 ----
export type GameState = 'BOOT' | 'MENU' | 'MISSION_LOADING' | 'MISSION_RUNNING'
  | 'PAUSED' | 'VICTORY' | 'DEFEAT' | 'MISSION_RESULT'
export type DepthLayer = 'Surface' | 'Periscope' | 'Shallow' | 'Medium' | 'Deep'
export type SpeedBand = 'STOPPED' | 'SILENT' | 'CRUISE' | 'FULL'
export type SonarState = 'idle' | 'ping' | 'passive'
export type ContactState = 'UNKNOWN' | 'SUSPECTED' | 'CLASSIFIED' | 'TRACKED' | 'CONFIRMED'
export type ShipClass = 'Merchant' | 'Cargo' | 'Tanker' | 'Destroyer' | 'Frigate' | 'Submarine'
export type ContactType = ShipClass | 'Unknown' | 'LargeSurface'
export type AiState = 'NORMAL' | 'SUSPICIOUS' | 'ALERT' | 'SEARCHING' | 'HUNTING' | 'LOST_CONTACT'
export type TorpedoState = 'LOADED' | 'READY' | 'FIRED' | 'RUNNING' | 'HIT' | 'MISSED' | 'EXPIRED'
export type WeatherKind = 'Clear' | 'Cloudy' | 'Storm' | 'Fog' | 'Night'

// ---- 玩家潜艇 (FR-01, §4) ----
export interface SubmarineState {
  position: { x: number; y: number }   // km, x=east, y=north
  headingDeg: number                    // 0..360, north-up
  speedKt: number
  speedBand: SpeedBand
  targetSpeedKt: number                 // 输入目标，档内连续变速
  depthLayer: DepthLayer
  targetDepthLayer: DepthLayer
  depthTransitionT: number | null       // 切换剩余秒数（3s/层, F2）
  battery: number                       // 0..100
  noise: number                         // 0..100（含速度/深度/船体修正, F1）
  hull: number                          // 0..100
  detection: number                     // 0..100 探测计 (FR-12)
  silentRunning: boolean
  sonarState: SonarState
  pingCooldown: number                  // 剩余冷却 s（6s）
  torpedoTubes: { id: string; state: TorpedoState; targetContactId: string | null }[]
  decoyCount: number                    // 每任务 2
  lowBattery: boolean                   // battery < 10 派生的警报位
  outOfBoundsTimer: number              // 越界累计 s（60s 判负）
}

// ---- 接触 (FR-05) —— 引擎对玩家的"感知视图"，永远带误差 ----
export interface Contact {
  id: string                            // 稳定 id（如 'C-01'），跨 tick 不变
  state: ContactState
  bearingDeg: number                    // 相对玩家
  rangeKm: number | null                // null = 纯 bearing（被动）
  bearingErrorDeg: number
  rangeErrorFrac: number                // ±10%→±2% 收敛 (FR-06)
  speedEstimateKt: number | null        // SUSPECTED 起有
  headingEstimateDeg: number | null
  speedErrorFrac: number                // ±20%→±5%
  classification: ContactType
  classifyConfidence: number            // 0..100（类型置信）
  confidence: number                    // 0..100（总置信）
  signalStrength: 'Strong' | 'Medium' | 'Weak'
  lastDetectedAt: number                // simTime
  lastPingAt: number
  lastBearingAt: number
  observations: number                  // 观测次数（分类/收敛依据）
  trueShipId: string | null             // 实现内部关联（对快照可见但 UI 不展示真值）
}

// ---- 敌船公开视图 (FR-09/10, §6.2) ----
export interface EnemyShip {
  id: string
  shipClass: ShipClass
  position: { x: number; y: number }
  headingDeg: number
  speedKt: number
  hull: number
  aiState: AiState
  lkp: { x: number; y: number; errorKm: number } | null   // 护航舰 LKP + 漂移误差 (F5)
  depthChargesLeft: number              // 每任务 20
  activePingCooldown: number            // 4s/6km (SUSPICIOUS) 或 2s (HUNTING)
  inConvoy: boolean
  // 不暴露：内部状态机计时器、队形槽位 —— 通过 aiState 与行为体现
}

// ---- 鱼雷 (FR-11, §7) ----
export interface Torpedo {
  id: string
  state: TorpedoState
  position: { x: number; y: number }
  headingDeg: number                    // 出管后固定（无追踪, DD-04）
  speedKt: number                       // 40
  ageS: number                          // 寿命 300s
  distanceKm: number                    // 累计航程（6km 上限）
  targetShipId: string | null           // 发射时目标（仅用于结算与事件）
  targetContactId: string | null
  firedAt: number
  nearestPass: { distM: number; at: number } | null   // 最近距离记录（40/120m 判定）
}

// ---- Decoy (FR-12) ----
export interface Decoy { id: string; position: { x: number; y: number }; ageS: number /*20s*/; noise: 90 }

// ---- 任务定义 (FR-15) ----
export interface MissionDef {
  id: string                            // 'M01'..'M05' | generated
  name: string
  objective: ObjectiveDef               // { kind: 'find'|'sink'|'sinkAndEscape'|..., params, subgoals: [{id,weight,desc}] }
  patrolArea: { km: 30; gridM: 500 }
  fleet: { headingDeg: number; speedKt: number; formation: '2x2'; colSpacingM: 500; rowSpacingM: 400; patrolBehavior: 'figure8' }
  spawns: { type: ShipClass; x: number; y: number; headingDeg: number }[]
  playerStart: { x: number; y: number; headingDeg: number }
  weather: WeatherKind
  visibilityKm: number
  torpedoCount: number
  batteryStart: number                  // 100
  parTimeS: number                      // §9.1 (900/1200/1800/2100/2400)
  difficulty: 1..5
  seed: number
}

// ---- 快照 (§4) 补充：任务状态与评分 ----
export interface MissionStatus {
  missionId: string
  phase: 'briefing' | 'running' | 'complete' | 'failed'
  objectives: { id: string; desc: string; done: boolean; weight: number }[]
  escaped: boolean                      // F9
  forcedSurface: boolean
}
export interface ScoreParts {
  objective: number; damage: number; stealth: number
  torpedoEfficiency: number; time: number; survival: number
  total: number; grade: 'Perfect'|'Excellent'|'Good'|'Poor'|'Failed'
}

// ---- 事件条目 (FR-18 事件日志) ----
export interface EventEntry {
  id: number                            // 单调递增
  simTime: number                       // mm:ss 由渲染层格式化
  type: EventType
  payload?: Record<string, unknown>     // 纯数据（如 contactId, bearing）
}
export type EventType =
  | 'sonar.ping' | 'sonar.contact' | 'sonar.passive'
  | 'contact.detected' | 'contact.classified' | 'contact.degraded' | 'contact.lost'
  | 'torpedo.ready' | 'torpedo.fired' | 'torpedo.hit' | 'torpedo.missed' | 'torpedo.expired' | 'torpedo.fireRejected'
  | 'ship.sunk' | 'depthCharge.dropped' | 'depthCharge.detonated' | 'deckGun.fired'
  | 'sub.damaged' | 'sub.speedChanged' | 'sub.depthChanged' | 'sub.forcedSurface'
  | 'battery.low' | 'detection.threshold' | 'player.located'
  | 'decoy.launched' | 'escape.escaped'
  | 'mission.victory' | 'mission.defeat' | 'mission.complete'
  | 'ui.click'
```

---

## 7. 系统交互图 (System Interaction & Event Flow)

**固定 tick 顺序（即 RNG 消费顺序，§5.2）**——每 0.05 s 执行一次：

```
step(handle, dt=0.05, inputs)
│
├─ 1. stateMachine: 处理 pause/重启/结束边沿 → 若 PAUSED 直接返回快照
├─ 2. world: 天气状态（静态 per-mission，仅维护计时）→ weatherModifiers
├─ 3. missions: 目标进度快照（读全局状态，不消费 RNG 除非判定随机）
├─ 4. gameplay/submarine: 移动/转向/速度档/深度切换/电池/噪声
│       → emit sub.speedChanged / sub.depthChanged / battery.low / sub.forcedSurface
├─ 5. sonar: 先被动监听（无暴露）→ 若 inputs.ping 且冷却就绪：主动 ping
│       ping → 计算返回（含误差）→ 更新/新建 contacts → emit sonar.ping / sonar.contact
│       同时 ping 被 ≤8km 护航舰"听到"→ 写 ai 感知队列（本 tick 末尾 ai 消费）
├─ 6. ai: 每艘敌船 tick：感知(噪声/事件) → 状态机转移 (NORMAL→…→HUNTING)
│       → 行为（编队/巡逻/搜索/投深弹/主动 ping）→ 更新 ship 状态
│       敌方对玩家的探测率 (F3/F4) 结果写入 detection 增量
├─ 7. combat: 鱼雷更新（航行/命中/近失/过期）→ 伤害结算 → 深弹/甲板炮结算
│       → 更新玩家 hull/detection → emit torpedo.* / ship.sunk / depthCharge.* / sub.damaged
├─ 8. detection: 汇总本 tick 增减（F8）→ 分带阈值事件 detection.threshold
│       → 100 = player.located → 60s 超时判定（基本必死）
├─ 9. missions/objectives: 胜利/失败/逃脱判定 (F9) → VICTORY/DEFEAT → MISSION_RESULT
├─ 10. 事件总线：本 tick 事件入环形缓冲（尾部 50 条）→ 组装 GameSnapshot → 返回
```

**P0 事件流：ping → contacts → detection → AI 反应**：

```
玩家按 Space ──► inputs.ping=true
  ├─ sonar.pingActive(): 10km 内所有敌船 → 返回列表（bearing ±0.5°，
  │    range ±10%→收敛, signalStrength, type guess, confidence）[RNG: 误差抖动]
  │      └─► contacts.update(): 新接触(UNKNOWN, bearing-only) / 已有接触收敛
  │            └─► emit contact.detected / contact.classified（分类链 §5.5）
  ├─ 自身暴露：detection += 12（立即）
  └─ ≤8km 护航舰：感知队列入队 "heardPingAt bearing"
        └─► ai tick: NORMAL→SUSPICIOUS → 开启自身主动 ping (4s/6km)
              └─► 若命中玩家: detection += 8, 获得 bearing ±2° (F4)
                    └─► detection ≥40 → ALERT → 全速扑 LKP
```

---

## 8. 渲染管线 (Rendering Pipeline)

- **双速率**：仿真固定 20 Hz (dt=0.05 s)；渲染 rAF 目标 60 FPS。渲染循环持 `accumulator`，每帧消费固定步长调用 `step()`，多余时间累计（上限防 spiral of death，如 0.25 s）。
- **插值**：`alpha = accumulator / 0.05`；实体绘制位置 = `lerp(prevSnapshot.pos, currentSnapshot.pos, alpha)`。引擎不感知插值。
- **Canvas 层序（自底向上，VISUAL_STYLE §2 调色板）**：

```
L0  ocean bg (#050a12 → 梯度 #0a1626/#0d2233/#14303f)
L1  grid 5km (#1c3a4d, 18% alpha) + range rings (#2e5f74) + LKP 标记
L2  entities: 敌船精灵（程序化, north-up, 按 shipClass 尺寸 40-64px）→ 玩家潜艇（白描边）→ 鱼雷/decoy → 接触不确定性椭圆
L3  particles: ping 扩散环（~1km/s, 1.2s 淡出）· 鱼雷尾迹气泡 · 爆炸粒子 (18-24) · 深弹水花
L4  overlays: Night (#000 35-55%) / Fog (#9fb4c7 12-25%) 全局叠层
L5  minimap（右下，含自身/接触/编队/搜索区）
L6  HUD = DOM 层（非 canvas）：顶栏/接触面板/事件日志/火控卡（§11 UI）
```

- **相机**：俯视 north-up，无旋转 (VISUAL_STYLE §1)；缩放 4–16 px/km（默认 8），滚轮缩放、平移（WASD/拖拽），跟随玩家居中可选。
- **精灵**：全部程序化绘制（`sprites.ts`，ADR-003）；若未来接入 raster 资产则读 `assets/registry.json`（provenance 校验，≤512×512，VISUAL_STYLE §6）。
- **DOM 安全**：所有动态文本用 `textContent` 赋值（禁止 `innerHTML` 拼接引擎数据，见 §12）。

---

## 9. 存档与设置 (Save / Load & Settings — FR-19)

`src/save/save.ts`，浏览器外壳注入 `localStorage`（引擎不直接触碰）；headless 下为 no-op/文件 JSON。

```jsonc
// key: 'silent-depth:save:v1'
{
  "version": 1,
  "unlockedMissions": ["M01", "M02", "M03", "M04", "M05"],   // 顺序解锁链 §9.1
  "bestScores": { "M01": 850, "M02": 0, "M03": 0, "M04": 0, "M05": 0 },
  "statistics": {
    "missionsCompleted": 3,
    "torpedoesFired": 14, "torpedoesHit": 9,
    "peakDetectionSum": 320, "totalPlayTimeS": 5400,
    "shipsSunk": { "Merchant": 4, "Cargo": 3, "Tanker": 1, "Destroyer": 0, "Frigate": 0 }
  },
  "settings": {                        // 与 config/settings.json 同构
    "audio": { "masterVolume": 0.7, "musicVolume": 0.5, "sfxVolume": 0.8 },
    "video": { "showFps": false, "particles": "normal", "mapGrid": true },
    "input": { "sensitivity": 1.0 }
  }
}
```

- 写时机：MISSION_RESULT 结算、设置变更、任务解锁；写入前 JSON.stringify + 版本校验，读入时 schema 校验失败 → 丢弃并重建默认 (不崩溃)。
- 设置项运行时由 `src/ui/menus.ts` (Settings 屏) 修改 → `save.write` → `src/audio`/`src/rendering` 消费。
- 导出/导入：JSON 文件导出 (Blob + a[download]) / 导入 (FileReader → 校验)；"清除存档" = remove key。

---

## 10. 测试策略 (Test Strategy)

| 层 | 工具/位置 | 覆盖 | 证据 |
|---|---|---|---|
| 单元 | Vitest `tests/unit/*.test.ts` | rng 确定性/分布、状态机转移表、接触状态机晋升/降级、F7 命中率公式、F1 噪声、电池/深度/速度、分类投票、存档 schema | `npm test` |
| 集成 | Vitest `tests/integration/*.test.ts` | 完整任务流 (M01 找→分类→跟踪)、ping→接触→AI 反应链路、鱼雷发射→命中→伤害→沉没、探测计升降、逃脱判定 (F9) | `npm test` |
| 确定性/回归 | `tests/integration/determinism.test.ts` | 同 seed 同 inputs 两跑 → 快照逐字段相等（hash 对比）；pause/恢复不破坏序列 | `npm test` |
| 无头仿真 | `tests/sim/*.test.ts` + `npm run sim` | runner 脚本化驱动；audit trail 完整性（事件+快照+inputs） | `npm run sim` |
| AI playtest | `npm run playtest` → `reports/playtest/*.md` | ≥10 次试玩，≥1 任务由 AI 完成 (NFR-6, playtest-gate) | reports/ |
| 浏览器冒烟 | 构建后 `npm run preview` + 手工/脚本 | Canvas 渲染、菜单流转、无 console error | build smoke log |
| 门禁映射 | `contracts/gates.yaml` | core-runtime/submarine/sonar/ai/combat/mission/ui/asset/audio/test/playtest/balance/security/build-gate | 各 gate 证据 |

- 引擎测试在 Node 环境跑（vitest `environment: 'node'` 已配置），零浏览器依赖；渲染/UI/音频模块的纯函数（参数表、绘制命令序列）在 Node 可测，`AudioContext` 图在 Node 跳过（AUDIO_DESIGN §6）。
- 测试禁止 `Math.random` 依赖；所有 fixture 用固定 seed。

---

## 11. 性能 (Performance — NFR-1)

- **目标**：稳定 60 FPS（1080p 内建浏览器）；热循环零每帧分配。
- **对象池**：粒子 (ping 环/尾迹/爆炸/水花)、鱼雷、decoy 用固定容量池 (`src/rendering/particles.ts` 池化；`src/combat` 鱼雷池)；死亡即回收。
- **快照复用**：`GameSnapshot` 采用 copy-on-write：未变字段复用对象引用，变化字段新建（避免整树深拷贝）；渲染只读引用，下一 tick 前完成消费。事件环形缓冲固定 50 条。
- **Canvas**：层缓存 (static layers L0/L1 在相机/网格不变时离屏缓存重绘)，实体按需重绘；避免每帧 `fillStyle` 字符串重建（缓存颜色常量）；粒子上限（如 512）超出丢最旧。
- **精灵**：程序化绘制一次入离屏 canvas 缓存 sprite atlas，之后 drawImage 快路径；尺寸 ≤512² (VISUAL_STYLE §6)。
- **避免**：hot loop 内数组 `filter/map` 分配（用索引循环 + 预分配）；`JSON.stringify` 仅存档/导出时使用。
- 测量：`showFps` 设置 + dev overlay；性能回归测试（如 10000 tick 基准上限）。

---

## 12. 安全 (Security Notes — NFR-4)

- **无 eval / 无动态代码**：`new Function`、`eval` 禁用（lint 规则）；事件 payload 只含纯数据。
- **DOM 注入**：引擎数据一律 `textContent`/`createElement` 渲染；**禁止**把接触名/事件文本拼进 `innerHTML`（XSS 面）。`src/ui/dom.ts` 提供白名单 helper。
- **离线封闭**：零运行时网络请求（`fetch`/`XHR`/`WebSocket` 仅在 dev 工具链存在）；vite `base:'./'` 静态产物，无 CDN；依赖仅 devDependencies (ts/vite/vitest) → 供应链面极小，`npm audit` 纳入 security-gate。
- **存档**：localStorage 数据视为不可信输入——加载时 schema 校验 + 数值 clamp (0..100 等) + version 迁移钩子；导出文件不执行。
- **资产路径**：`assets/registry.json` 仅登记本地相对路径，禁止外部 URL；渲染加载前校验 sha256（registry 记录）——v1 全程序化，此闸门为未来外部资产预留 (requirements §3 license gate)。
- **无文件系统访问**：游戏本体不触碰用户文件系统；导出用浏览器 Blob 下载。

---

## 13. 需求覆盖矩阵 (FR → Module Ownership)

| FR | 需求摘要 | 拥有模块 | 关键文件 | 门禁 |
|---|---|---|---|---|
| FR-01..03 | 潜艇状态/动作/速度/深度 | src/gameplay | submarine.ts | submarine-gate |
| FR-04 | 主动 ping | src/sonar | ping.ts, sonar.ts | sonar-gate |
| FR-05 | 接触五状态 | src/sonar | contacts.ts | sonar-gate |
| FR-06 | 不确定性收敛 | src/sonar | uncertainty.ts | sonar-gate |
| FR-07 | 被动监听 | src/sonar | passive.ts | sonar-gate |
| FR-08 | 分类 | src/sonar | classification.ts | sonar-gate |
| FR-09 | 编队/护航 | src/ai | convoy.ts, escort.ts | ai-gate |
| FR-10 | 敌方 AI + 搜索 | src/ai | aiState.ts, search.ts, ai.ts | ai-gate |
| FR-11 | 鱼雷/火控/命中 | src/combat | torpedo.ts, fireControl.ts | combat-gate |
| FR-12 | 探测计/逃脱/decoy | src/combat (+gameplay/decoy) | detection.ts, decoy.ts | combat-gate |
| FR-13 | 电池/船体 | src/gameplay | submarine.ts | submarine-gate |
| FR-14 | 5 任务 | src/missions | missions.ts | mission-gate |
| FR-15 | 生成器 | src/missions | generator.ts | mission-gate |
| FR-16 | 世界生成 | src/world | ocean.ts | mission-gate |
| FR-17 | 天气 | src/world | weather.ts | mission-gate |
| FR-18 | UI/HUD/事件日志 | src/ui (+rendering) | hud.ts, menus.ts, dom.ts | ui-gate |
| FR-19 | 状态机/存档 | src/core + src/save | stateMachine.ts, save.ts | core-runtime-gate |
| FR-20 | 评分 | src/missions | objectives.ts (+score) | mission-gate |
| FR-21 | 资产 | src/rendering + assets/registry.json | sprites.ts, registry | asset-gate |
| FR-22 | 音频 | src/audio | audio.ts, sfx/* | audio-gate |
| NFR-1 | 60FPS/无抖动 | 全局 (§11) | — | build-gate + ui-gate |
| NFR-2 | 离线 | 全局 (§12) | — | build-gate + security-gate |
| NFR-3 | 确定性 | src/core (ADR-004) | rng.ts, engine.ts | determinism 测试 |
| NFR-5 | balance.json | src/core/balance.ts | balance.ts | balance-gate |
| NFR-6 | 无头 sim | src/sim | runner.ts, playtest.ts | playtest-gate |

---

## 14. 事件目录 (Event Catalogue)

事件 = 引擎 → 外壳的唯一边界。消费方：`src/ui` (事件日志/HUD 动画)、`src/audio` (AUDIO_DESIGN §5 映射)、`src/sim` (audit trail)。

| 事件 | 触发条件 | 关键 payload | 音频映射 |
|---|---|---|---|
| sonar.ping | 主动 ping 发射 | {bearingDeg} | sonarPing |
| sonar.contact | ping 命中任一接触 | {contactIds, pingBearingDeg} | sonarReturn |
| sonar.passive | 被动听到噪声源 | {source:'engine'\|'propeller'\|'torpedo'\|'explosion', bearingDeg} | passiveContact |
| contact.detected | 新接触建立 | {contactId, state:'UNKNOWN'} | — |
| contact.classified | 分类链晋升 | {contactId, classification, confidence} | — |
| contact.degraded / contact.lost | 置信衰减/移除 | {contactId} | — |
| torpedo.ready / torpedo.fired | 装定完成/发射 | {tubeId, targetContactId} | torpedoLaunch |
| torpedo.hit / missed / expired | 命中/近失/过期 | {torpedoId, targetShipId?, distM} | torpedoHit / — |
| torpedo.fireRejected | 非法发射输入 | {reason:'noTarget'\|'notReady'\|'lowBattery'} | — |
| ship.sunk | 敌船沉没 | {shipId, shipClass} | explosion |
| depthCharge.dropped / detonated | 投弹/爆炸 | {shipId, x, y, distM, dmg} | depthCharge |
| deckGun.fired | 甲板炮开火 | {shipId, distM, hit} | — |
| sub.damaged | 玩家受创 | {source, amount, hullLeft} | hullCreak |
| sub.speedChanged | 速度档/噪声变化 | {band, speedKt, noise} | engine (gain retarget) |
| sub.depthChanged | 深度层切换 | {layer} | hullCreak (快速切换) |
| sub.forcedSurface | 电池耗尽强制上浮 | {} | alarm |
| battery.low | battery < 10% | {battery} | alarm |
| detection.threshold | 跨分带 (20/40/60/80) | {detection, band} | alarm (≥60) |
| player.located | detection=100 | {} | alarm |
| decoy.launched | 发射 decoy | {decoyId, x, y} | torpedoLaunch (复用) |
| escape.escaped | F9 逃脱达成 | {missionId} | — |
| mission.victory / defeat | 任务结束 | {scoreParts, grade} | missionSuccess / missionFailed |
| ui.click | 按钮/菜单交互 | {elementId} | uiClick |

事件 id 单调递增；事件日志保留尾 50 条于快照 `eventLog`；音频订阅全部事件但按映射过滤。

---

*文档结束。下一阶段输入：`artifacts/implementation-plan.md`（任务 DAG → 实现步骤）与 `ui-spec.json`（HUD 布局）应以本文模块/接口为权威依据。*
