# SILENT DEPTH 《深海猎手》 — Implementation Plan (implementation-plan.md)

| 字段 | 值 |
|---|---|
| 项目 | p-004 SILENT DEPTH 《深海猎手》 |
| 文档版本 | v1.0 (DRAFT) |
| 上游输入 | `requirements.md` rev-001 · `GAME_DESIGN.md` v1.0 · `VISUAL_STYLE.md` · `AUDIO_DESIGN.md` · `GAME_ARCHITECTURE.md` v1.0 · `memory/ADR.md` (ADR-001..005) · `contracts/gates.yaml` |
| 作者 | Game Systems Architect role agent |
| 对应任务 | t-002 (game-architect) 的一部分 → 产出后门禁 `architecture-gate` |

> 本文档把既有任务 DAG (t-001..t-019, `projects/p-004/tasks/`) 映射为**具体实现步骤**：每任务给出关键文件、关键接口、验收标准 (映射 gates.yaml)。任务依赖以 `tasks/*.yaml` 的 `dependsOn` 为准，本文档只做顺序编排与并行建议，**不改动 DAG**。

---

## 目录 (Table of Contents)

1. 背景与工程约定 (Context & Conventions)
2. 工作区现状 (Workspace Baseline)
3. 任务 DAG 总览 (Task DAG)
4. 构建顺序与并行化 (Build Order & Parallelization)
5. 任务级实现步骤 (t-001..t-019, Per-Task Steps)
6. 质量门禁检查表 (Gate Checklist)
7. 风险与缓解 (Risks & Mitigations)
8. 完成定义 (Definition of Done)

---

## 1. 背景与工程约定 (Context & Conventions)

- **Headless-first (ADR-001)**：引擎纯 TS 无 DOM，`src/core|gameplay|sonar|ai|combat|missions|world|sim` 禁止引用浏览器 API；`createGame/step` 是唯一仿真入口 (ADR-005)。
- **确定性 (ADR-004)**：全部随机走 mulberry32 seeded RNG；引擎禁 `Math.random`/墙钟；子系统按 GAME_ARCHITECTURE §7 tick 顺序消费。
- **数值 (ADR-002)**：所有平衡数值进 `config/balance.json`，类型化读取 (src/core/balance.ts)。GAME_DESIGN §12 B1-B10 + §15 F1-F10 是权威来源，实现时**逐项迁移**。
- **工程约定**：
  - 目录：`src/` (引擎+外壳)、`tests/` (vitest)、`config/`、`assets/` (registry.json + THIRD_PARTY_ASSETS.md)、`reports/` (playtest/qa/balance/build)。
  - 脚本 (package.json 已有)：`dev` `build` (`tsc --noEmit && vite build`) `test` (`vitest run`) `sim` (`node --experimental-strip-types src/sim/runner.ts`) `playtest` (`node --experimental-strip-types src/sim/playtest.ts`) `lint` (`tsc --noEmit`)。
  - 类型唯一权威：`src/core/types.ts`；UI/渲染/测试只从该文件 import。
  - 事件：引擎 emit (GAME_ARCHITECTURE §14 目录)；UI/音频/playtest 订阅。
  - 测试命名：`tests/{unit,integration,sim}/<module>.test.ts`；固定 seed fixture。
  - 提交粒度：每个任务一个 commit，消息含任务 id (如 `t-004: submarine movement/speed/depth/battery/noise`)。

## 2. 工作区现状 (Workspace Baseline)

已存在 (骨架，待填充)：
- `package.json` / `tsconfig.json` (strict, noUncheckedIndexedAccess) / `vite.config.ts` (offline `base:'./'`) / `vitest.config.ts` (node env) ✓
- `src/main.ts` (12 行占位) / `src/style.css` (占位) / `index.html` ✓
- `config/settings.json` (audio/video/input 默认) ✓
- `tests/toolchain.test.ts` (冒烟占位) ✓
- `docs/` (GAME_DESIGN / VISUAL_STYLE / AUDIO_DESIGN / **GAME_ARCHITECTURE**) ✓
- `assets/registry.json`、`reports/`、`dist/` 目录存在 (内容待建)

缺失 (本计划产出路径)：
- `config/balance.json` ← t-002/t-003 建骨架，t-015 依 playtest 证据迭代
- `src/core/*` … `src/sim/*` 全部源码 ← t-003..t-012
- `assets/registry.json` 完整条目 + `THIRD_PARTY_ASSETS.md` ← t-011
- `reports/playtest|qa|balance|build/*` ← t-013..t-017

## 3. 任务 DAG 总览 (Task DAG)

```
t-001 game-design (done)
  └─▶ t-002 architecture + implementation plan (THIS, running)
        ├─▶ t-003 core runtime (gameplay-engineer)
        │     ├─▶ t-004 submarine (gameplay-engineer)
        │     │     └─▶ t-005 sonar P0 (ai-engineer)
        │     │           └──────────┐
        │     ├─▶ t-006 enemy AI (ai-engineer) ─────────┤
        │     │                                        ▼
        │     ├─▶ t-007 combat (gameplay-engineer) ◀───┤ (dep: t-004,t-005,t-006)
        │     ├─▶ t-008 missions (level-designer) ─────┘
        │     └─▶ t-009 world (level-designer)
        ├─▶ t-011 assets (asset-engineer) ──┐
        └─▶ t-012 audio (audio-engineer) ───┤
              t-010 UI (ui-engineer) ◀───────────── (dep: t-003..t-009)
                                            ▼
        t-013 tests (qa) ◀── (dep: t-003..t-009, t-011, t-012)
        ├─▶ t-014 playtest (playtest) ◀── (dep: t-008, t-013)
        │     └─▶ t-015 balance (balance) ◀── (dep: t-014)
        ├─▶ t-016 build (build-release) ◀── (dep: t-010, t-013)
        └─▶ t-017 security (security) ◀── (dep: t-011, t-013)
              └─▶ t-018 final trial (factory-manager) ◀── (dep: t-015, t-016, t-017)
                    └─▶ t-019 release docs (build-release) ◀── (dep: t-018)
```

## 4. 构建顺序与并行化 (Build Order & Parallelization)

按依赖 + 角色可用性给出 6 波 (wave)，与 DAG 一致；并行项由 Factory Manager 以独立 subagent 派发：

| 波 | 任务 | 说明 | 出口门禁 |
|---|---|---|---|
| W0 | t-002 | 本文档 + GAME_ARCHITECTURE.md | architecture-gate |
| W1 | t-003 | 核心运行时 (RNG/状态机/事件总线/engine.ts/createGame/step + balance.json 骨架) | core-runtime-gate |
| W2 (并行) | t-004 submarine · t-006 enemy AI · t-008 missions · t-009 world | 都只依赖 t-003；四路并行，各自独立领域 | submarine-gate / ai-gate / mission-gate |
| W3 | t-005 sonar (P0) | 依赖 t-004 (玩家位置/噪声/电池) + t-008 (spawn 提供真船) + t-006 (敌船感知)——实现按 DAG 只等 t-004，但**集成测试**需 t-006/t-008 就绪；建议 W2 启动时即并行开发，W3 收口集成 | sonar-gate |
| W4 | t-007 combat | 依赖 t-004/t-005/t-006 全就绪；鱼雷/火控/伤害/深弹/探测计/逃脱 | combat-gate |
| W5 (并行) | t-010 UI · t-011 assets · t-012 audio | t-010 依赖全部引擎模块；t-011/t-012 只依赖 t-002+文档，**可提前到 W1 并行** (建议，不改变 DAG) | ui-gate / asset-gate / audio-gate |
| W6 (并行) | t-013 tests (QA 全量) · t-016 build (等 t-010) · t-017 security (等 t-011/t-013) | QA 收口后触发 build/security | test-gate / build-gate / security-gate |
| W7 | t-014 playtest (≥10 次, ≥1 任务完成) | 依赖 t-008 + t-013 | playtest-gate |
| W8 | t-015 balance | 依 playtest 证据改 balance.json | balance-gate |
| W9 | t-018 final trial (需求变更演练 + 失败恢复演练 + 验收矩阵) | 依赖 t-015/t-016/t-017 | — |
| W10 | t-019 release docs | RELEASE_NOTES + 交付包 | — |

**并行建议汇总**：W2 四路并行；W5 三路并行；W6 三路并行；t-011/t-012 可前移与 t-003 并行（资产/音频工程师独立于引擎工程师）。t-005 建议在 W2 期间与 t-006/t-008 并行实现、W3 统一集成测试，以压缩关键路径。

---

## 5. 任务级实现步骤 (t-001..t-019, Per-Task Steps)

> 记号：`🔑` 关键接口 · `✅` 验收标准 (映射 gates.yaml)。所有数值引用 GAME_DESIGN §编号；类型引用 GAME_ARCHITECTURE §6。

### t-001 游戏设计文档 (DONE — 仅记录)

- 产出：`docs/GAME_DESIGN.md` (702 行) + `docs/VISUAL_STYLE.md` + `docs/AUDIO_DESIGN.md`。已过 game-design-gate。本任务无需再动。

### t-002 架构 + 实现计划 (RUNNING — 本文档)

- 产出：`docs/GAME_ARCHITECTURE.md` + 本文件 (artifacts/implementation-plan.md)。
- ✅ architecture-gate：GAME_ARCHITECTURE.md 覆盖 runtime/state/entity/systems/events/rendering/input/AI/save/asset/audio + headless sim 设计；任务 DAG 在 `tasks/`。

### t-003 核心运行时 (gameplay-engineer)

- 关键文件：
  - `src/core/rng.ts` — mulberry32 + `Rng` 接口 (next/range/int/chance/sign/fork)
  - `src/core/eventBus.ts` — emit/on/off + 50 条环形缓冲 + 单调事件 id
  - `src/core/stateMachine.ts` — GameState 转移表 (BOOT→MENU→MISSION_LOADING→MISSION_RUNNING⇄PAUSED→VICTORY|DEFEAT→MISSION_RESULT→MENU)
  - `src/core/time.ts` — 固定步长 0.05 s 累加器 + simTime
  - `src/core/balance.ts` — `loadBalance()` 类型化读取 `config/balance.json` (B1-B10 迁移骨架)
  - `src/core/types.ts` — GAME_ARCHITECTURE §6 全部接口 (唯一权威)
  - `src/core/engine.ts` — `createGame(missionDef, seed)` / `step(handle, dt, inputs)` → GameSnapshot；引擎装配器 (subsystem tick 顺序)
  - `config/balance.json` — 骨架 (含 B1/B2/B4/B7 初始值, ESTIMATED 标注)
- 🔑 接口：`createGame` `step` `PlayerInputs` `GameSnapshot` (ADR-005 逐字段)。
- ✅ core-runtime-gate：`vitest tests/unit/core*.test.ts` green——rng 确定性 (同 seed 同序列)、状态机非法转移拒绝、空任务 tick 不崩溃、pause 不推进 simTime。

### t-004 潜艇操控 (gameplay-engineer)

- 关键文件：`src/gameplay/submarine.ts` (全部) + `src/gameplay/decoy.ts` (decoy 实体)
- 实现点：四档速度与档内连续变速 (F1 噪声插值: SILENT 8/2、CRUISE 30/4、FULL 70/5、STOPPED=1)；转向率 (CRUISE≤3.0°/s、FULL 1.5°/s、reverse 限 4 kt)；深度层切换 (3s/层, F2 噪声均值)；电池 (速度档 %/s + silent +0.08 + emergency dive 3% + decoy 1%；Surface 充电 +0.4%；<10% LOW BATTERY 禁 ping/限速/转向减半；0% 强制上浮+detection=100)；噪声叠加 (深度修正 B2 + hull<30% +5)；越界计时 (60 s)。
- 🔑 `updateSubmarine(dt, inputs, world, balance, rng)`；`SubmarineState`。
- ✅ submarine-gate：`tests/unit/submarine*.test.ts` — 各档噪声/电池表驱动断言 (B1/B2 全行)、深度切换耗时、LOW BATTERY 限制、强制上浮路径。

### t-005 声呐 P0 (ai-engineer) — **最高优先 (P0)**

- 关键文件：`src/sonar/sonar.ts` (编排) · `ping.ts` (主动) · `passive.ts` (被动) · `contacts.ts` (接触状态机) · `uncertainty.ts` (误差收敛) · `classification.ts` (分类)
- 实现点：ping 10 km/6 s 冷却/2% 电池/+12 暴露/≤8 km 护航舰听到；返回列表 (bearing ±0.5°、range ±10%→×0.8/ping、signalStrength 分级、type guess、confidence)；被动 5 km 引擎/10 km 鱼雷/15 km 爆炸、bearing ±3°→30 s 收敛 ±1°、永不给 range；接触状态机 UNKNOWN→SUSPECTED→CLASSIFIED→TRACKED→CONFIRMED 晋升/降级表 (GAME_DESIGN §5.4)；衰减 (90 s −10%/10 s、<30% 降级、UNKNOWN 120 s 移除)；分类投票 (速度/噪声谱/深度特征, passive +15%·ping +25%)。
- 🔑 `Contact` `ContactState`；事件 `sonar.*` `contact.*` (§14)。
- ✅ sonar-gate：`tests/unit/sonar*.test.ts` — ping 误差收敛序列 (首次 only-bearing → ping1 ±10% → ping2 ±8%)、被动无 range 不变式、状态机晋升/降级全路径、分类链 (Unknown→Large Surface→Merchant 72%→Confirmed)。

### t-006 敌方 AI (ai-engineer)

- 关键文件：`src/ai/ship.ts` (船型参数表 §6.2) · `aiState.ts` (状态机) · `convoy.ts` (2×2 编队, 500/400 m) · `escort.ts` (figure-8 巡逻 1 km/90 s、响应优先级 鱼雷>爆炸>噪声、主动 ping 4 s/2 s) · `search.ts` (Circular/Zig-zag/Expanding + LKP F5) · `ai.ts` (tick 编排 + 感知输入)
- 实现点：状态转移表 NORMAL→SUSPICIOUS→ALERT→SEARCHING→HUNTING→LOST_CONTACT (§6.1 全部触发/离开条件 + 计时器)；商船个体 (队形跟随、30% 规避 45°/30 s、邻船沉没规避)；深弹投掷 (HUNTING: 6 枚/轮 3 s 间隔/20 s 轮隔/20 枚总量)；敌方探测率 F3/F4 (baseRate 0.05/0.015、weatherFactor、depthFactor、distanceFactor)；LKP 漂移 (+50 m/机动, 上限 1.5 km, decoy 70% 替换 20 s)。
- 🔑 `EnemyShip` `AiState` `updateEnemyFleet(dt, world, player, rng, balance)`。
- ✅ ai-gate：`tests/unit/ai*.test.ts` — 状态机全转移、商船规避概率 (seed 固定)、深弹轮次计数与弹尽转 SEARCHING、LKP 漂移上限。

### t-007 战斗 (gameplay-engineer)

- 关键文件：`src/combat/torpedo.ts` · `fireControl.ts` (F6/F7) · `damage.ts` · `depthCharge.ts` · `detection.ts`
- 实现点：鱼雷状态机 LOADED→READY→FIRED→RUNNING→HIT|MISSED|EXPIRED (40 kt、6 km、300 s、无追踪 DD-04)；命中判定 (≤40 m HIT / 40–120 m 近失 MISSED / 寿命尽 MISSED)；火控解算 (leadAngle F6, vTorpedo=40 kt≈20.6 m/s；HP F7: base 0.85 − rangePen − aobPen − speedPen − confPen − maneuverPen, clamp 5–95%；齐射 1−(1−HP)²；实际判定 HP+uniform(−0.1,0.1)≥0.5)；伤害 90±10 vs 船体表 (§7.5)；深弹对玩家 (直接 35/近失 20/远 10、Deep ×1.5)；甲板炮 (2 km、60%→10%、8–15、仅 Surface/Periscope)；碰撞 10–25；探测计 (F8: 上升/下降全表 §8.1、分带阈值、100=LOCATED、逃脱判定 F9: <20 持续 30 s 且最近护航 >3 km)。
- 🔑 `Torpedo` `solveFireSolution(contact, player, balance)` `hitProbability(...)` `updateDetection(...)`；事件 `torpedo.*` `ship.sunk` `depthCharge.*` `detection.threshold` `player.located` `escape.escaped`。
- ✅ combat-gate：`tests/unit/combat*.test.ts` — F7 全惩罚表断言、确定性 roll (固定 seed)、齐射概率、深弹三档伤害×深度层、逃脱判定时序。

### t-008 任务系统 (level-designer)

- 关键文件：`src/missions/generator.ts` (FR-15) · `missions.ts` (M01–M05 固定定义) · `objectives.ts` (目标评估 + 评分 §10.1 F10)
- 实现点：`generateMission({difficulty, enemyCount, escortCount, weather, visibility, torpedoes, battery, objective, seed})` → MissionDef；布局规则 (商船沿航线 ±1.5 km、护航 800 m 后、玩家距最近敌 ≥8 km)；校验失败 seed+1 重试 ≤10 次；五任务表 (§9.1 全字段: 目标/编成/鱼雷/天气/难度/Par/seed)；解锁链；评分组件 (目标 400/伤害 200/探测 150/鱼雷效率 100/时间 100/存活 50, M05 逃脱 +50)。
- 🔑 `MissionDef` `MissionStatus` `ScoreParts`；事件 `mission.victory|defeat|complete`。
- ✅ mission-gate：`tests/unit/missions*.test.ts` — 五任务生成可复现 (同 seed 同 def)、约束校验 (≥2 km 间距、玩家 ≥8 km)、M01 可完成 (find/classify/track)、M03 目标 sink≥2 判定、评分边界 (Perfect/Failed)。

### t-009 世界生成 (level-designer)

- 关键文件：`src/world/ocean.ts` (FR-16) · `weather.ts` (FR-17) · `currents.ts` (视觉)
- 实现点：seeded 海洋 (调色板梯度 VISUAL_STYLE §2、500 m 网格、波纹噪声)；天气表 (Clear/Cloudy/Storm/Fog/Night: 能见度/声呐修正/噪声修正/氛围, Storm Surface +10)；洋流仅视觉 (v1 无物理)；`weatherModifiers(weather)` 供 sonar/ai/detection 读取。
- 🔑 `WeatherKind` `generateOcean(seed)` `weatherModifiers(weather)`。
- ✅ mission-gate (world 并入)：`tests/unit/world*.test.ts` — 同 seed 同海洋数据、天气修正表全行、洋流不改变引擎状态 (纯视觉不变式)。

### t-010 UI/HUD (ui-engineer)

- 关键文件：`src/ui/hud.ts` · `menus.ts` · `input.ts` · `dom.ts` (安全 helper) + `src/rendering/renderer.ts` 配合
- 实现点：战术 HUD (§11.2 顶栏 8 项 + 鱼雷管 + 接触面板 (id/type/bearing/range/speed/heading/confidence/lastSeen) + 火控卡 (§7.3 格式) + 事件日志 (mm:ss) + 中央战术图 (潜艇箭头/不确定椭圆/LKP/鱼雷轨迹/ping 环/decoy/编队图标, 缩放平移)；菜单 (BOOT/MENU/MISSIONS/SETTINGS/CREDITS + 任务简报 + MISSION_RESULT 评分条+统计+复盘提示)；快捷键 (W/S A/D Q/E Space F R G P Esc §11.2)；渲染管线 (20 Hz sim / 60 Hz 插值, §8)。
- 🔑 `mountHud(root, engine)` `renderMenu(screen)`；消费 `GameSnapshot` 与事件 (§14)。
- ✅ ui-gate：`npm run build` OK + 浏览器冒烟 (canvas 渲染、无 console error、菜单流转 M01 可进) + `tests/unit/dom*.test.ts` (无 innerHTML 拼接引擎数据)。

### t-011 程序化资产 + 注册表 (asset-engineer)

- 关键文件：`src/rendering/sprites.ts` (程序化精灵: 潜艇/商船/货船/油轮/驱逐舰/护卫舰/鱼雷/decoy, VISUAL_STYLE §6 尺寸 40-64 px 绘制) · `src/rendering/particles.ts` (ping 环/尾迹/爆炸/深弹水花) · `assets/registry.json` (全量条目: id/name/type/path/source=procedural/author/license=CC0/sha256/width/height/format/style/version/createdAt) · `THIRD_PARTY_ASSETS.md` (空外部资产声明) · `scripts/validate-registry.ts` (校验脚本)
- 实现点：全部 source=procedural；许可证闸门保留 (CC0 自动通过、Unknown 阻断, requirements §3)；sha256 计算入 registry。
- 🔑 `SpriteFactory` `drawShip(ctx, shipClass, size, palette)`。
- ✅ asset-gate：registry 校验脚本通过 (无外部 URL、sha256 匹配、样式一致性 checklist VISUAL_STYLE §11) + 冒烟渲染无错。

### t-012 程序化音频 (audio-engineer)

- 关键文件：`src/audio/audio.ts` (AudioContext 懒初始化/主链 master→compressor→dest/sfxBus) · `sfx/*.ts` (14 个合成函数, AUDIO_DESIGN §3 参数表) · `ambience.ts` (海洋底噪, 随天气 ±dB)
- 实现点：全部 WebAudio 合成零样本；引擎事件映射 (§14 ↔ AUDIO_DESIGN §5)；engine 循环随 speedBand 变速 (SILENT→FULL gain)；headless 安全 (Node 跳过 AudioNode 图, 只测参数表)。
- 🔑 `createAudio(settings)` `play(name)` `onEngineEvent(ev)`。
- ✅ audio-gate：`tests/unit/audio*.test.ts` — 14 个 SFX 参数表存在且合法 (频率/时长/滤波参数范围)、事件→SFX 映射全覆盖、Node 环境无 AudioContext 崩溃。

### t-013 全面测试 (qa)

- 关键文件：`tests/unit/*` · `tests/integration/*` · `tests/sim/*` (全部补齐) · `tests/integration/determinism.test.ts` (同 seed 同 inputs 快照 hash 相等) · `tests/integration/mission-flow.test.ts` (M01 全流程 headless 完成) · `reports/qa/TEST_REPORT.md`
- 实现点：补全单元覆盖率 (核心门禁模块 ≥90% 行覆盖目标)、集成链路 (ping→接触→AI→鱼雷→沉没→评分)、回归套件 (含 toolchain 冒烟保留)。
- ✅ test-gate：`npm test` 全绿 (失败修复不得 skip)；`npm run lint` 通过；TEST_REPORT.md 记录覆盖率与失败修复历史。

### t-014 无头 playtest (playtest)

- 关键文件：`src/sim/runner.ts` (脚本化驱动: 载入 MissionDef → 每 tick 决策函数 → 记录 audit trail) · `src/sim/playtest.ts` (≥10 次试玩编排) · `src/sim/playbook.ts` (M01..M05 策略: 巡航→被动→ping→跟踪→伏击→发射→逃脱) · `reports/playtest/*.md` (每次试玩: seed/事件序列/结果/失败原因)
- 实现点：runner 只调 `createGame/step` (ADR-005)；记录事件流 + 快照抽样 + 结果 (victory/defeat/score)；失败 → 按 failure policy 记录并反馈 t-015。
- 🔑 `runScripted(missionDef, playbook, seed)` `playtestMission(id, seed)`。
- ✅ playtest-gate：`npm run playtest` ≥10 次试玩记录、≥1 任务由 AI 完成、失败已记录并驱动后续修复/平衡。

### t-015 平衡调整 (balance)

- 关键文件：`config/balance.json` (唯一可改数值文件) · `reports/balance/BALANCE_REPORT.md` (改动 + 依据)
- 实现点：按 playtest 证据调 ESTIMATED 数值 (如 商船规避概率 30%、逃脱距离衰减 −0.5%/s、深弹伤害、鱼雷数量)；**改动必须回到 GAME_DESIGN §12 同步标注** (DD-06)；重新跑 t-013 回归 + t-014 抽样验证。
- ✅ balance-gate：BALANCE_REPORT.md 记录每次改动的 playtest 证据 (非感觉)；`balance.json` diff 可见；回归全绿。

### t-016 离线生产构建 (build-release)

- 关键文件：`vite.config.ts` (已配 base './') · 构建产物 `dist/` · `reports/build/build-report.md` · 冒烟脚本 `scripts/smoke.mjs` (起 preview + 无头检查 index/canvas 挂载)
- 实现点：`npm run build` (tsc --noEmit && vite build)；产物离线自包含 (无外部 URL)；preview 冒烟。
- ✅ build-gate：build 成功日志 + dist 离线冒烟通过 (打开页面 canvas 渲染、菜单可用、无网络请求)。

### t-017 安全审计 (security)

- 关键文件：`reports/qa/security-report.md` · (可加) `scripts/audit-deps.mjs`
- 实现点：OWASP 清单过一遍 (XSS/injection/unsafe file access/untrusted asset path/external network/供应链)；依赖审计 (`npm audit` devDeps)；代码审查 (无 eval、无 innerHTML 拼接引擎数据、localStorage schema 校验、registry 无外部 URL)。
- ✅ security-gate：security-report.md 无未缓解高危项；依赖审计通过；资产 provenance 干净。

### t-018 需求变更演练 + 失败恢复演练 + 验收矩阵 (factory-manager)

- 关键文件：`reports/trial/change-drill.md` · `reports/trial/failure-drill.md` · `reports/trial/acceptance-matrix.md`
- 实现点：需求变更演练 (如"护航舰增加主动声呐"→ requirement-set → impact → replan-propose → 批准 → 仅受影响任务重跑)；失败恢复演练 (如"鱼雷命中判定失败"→ failure-record → recover → 修复 → 重测)；最终验收矩阵 (requirements §6 全部条目逐条过)。
- ✅ 门禁：两演练报告 + 验收矩阵 100% 覆盖。

### t-019 最终交付 (build-release)

- 关键文件：`RELEASE_NOTES.md` · `reports/build/release-manifest.md` (产物清单+校验和)
- 实现点：汇总全部证据 (测试/playtest/balance/security/build/试玩报告)；RELEASE_NOTES (版本/特性/已知限制/如何运行)；交付包 = dist/ + docs/ + assets/registry.json + 报告。
- ✅ 门禁：所有核心 gate 已 PASS 的汇总证据齐全；交付物可在离线环境运行。

---

## 6. 质量门禁检查表 (Gate Checklist)

| 波 | 任务 | 门禁 | 证据 |
|---|---|---|---|
| W0 | t-002 | architecture-gate | GAME_ARCHITECTURE.md + 本文档 + tasks/ DAG |
| W1 | t-003 | core-runtime-gate | vitest core 全绿 |
| W2 | t-004/t-006/t-008/t-009 | submarine/ai/mission-gate | 各自 vitest 全绿 |
| W3 | t-005 | sonar-gate | vitest sonar 全绿 (P0) |
| W4 | t-007 | combat-gate | vitest combat 全绿 |
| W5 | t-010/t-011/t-012 | ui/asset/audio-gate | build OK + registry 校验 + audio 测试 |
| W6 | t-013/t-016/t-017 | test/build/security-gate | `npm test` 全绿 + dist 冒烟 + 安全报告 |
| W7 | t-014 | playtest-gate | ≥10 playtest 报告, ≥1 完成 |
| W8 | t-015 | balance-gate | BALANCE_REPORT + diff |
| W9 | t-018 | — | 演练报告 + 验收矩阵 |
| W10 | t-019 | — | RELEASE_NOTES + manifest |

## 7. 风险与缓解 (Risks & Mitigations)

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 声呐不确定性数学复杂 (P0) | 延期 | 先最小可玩 (bearing-only + 简单误差) 再迭代；单元测试先行固化行为 |
| R2 headless/browser 漂移 | 逻辑双轨 | 单一引擎代码路径；渲染只读快照；同套测试双跑 |
| R3 平衡差 (商船规避/深弹伤害等 ESTIMATED) | 体验差 | t-014 playtest 证据驱动 t-015；数值只在 balance.json |
| R4 音频 autoplay 策略 | 无音 | 首次手势懒初始化 AudioContext (AUDIO_DESIGN §2) |
| R5 并行波次间接口漂移 | 集成冲突 | types.ts 唯一权威 + 每任务提交含接口变更说明 + t-013 收口 |
| R6 引擎 RNG 消费顺序被改 | 可复现性破坏 | §7 tick 顺序文档化；determinism 回归测试守护 (hash 对比) |

## 8. 完成定义 (Definition of Done)

1. 引擎 20 Hz 固定步长，`createGame/step` 契约与 ADR-005 逐字段一致，快照纯数据。
2. 全部 22 个 FR 有模块 owner (GAME_ARCHITECTURE §13)，无孤儿需求。
3. 数值零硬编码，全部经 `src/core/balance.ts` 读 `config/balance.json`。
4. `npm test` / `npm run lint` / `npm run build` 全绿；`npm run playtest` ≥10 次且 ≥1 任务完成。
5. 离线运行：dist/ 无网络请求、无外部资源、无 eval、无 innerHTML 注入。
6. 交付物齐全：docs (5 件) + assets/registry.json + THIRD_PARTY_ASSETS.md + reports (test/playtest/balance/security/build) + RELEASE_NOTES。

---

*文档结束。下一阶段：按 W1 启动 t-003 (核心运行时)，随后 W2 四路并行。*
