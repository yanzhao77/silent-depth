# SILENT DEPTH 《深海猎手》 — 游戏设计文档 (Game Design Document)

| 字段 | 值 |
|---|---|
| 项目 | p-004 SILENT DEPTH 《深海猎手》 |
| 文档版本 | v1.0 (DRAFT — 待架构/实现/QA 评审) |
| 上游输入 | `artifacts/requirements.md` rev-001 (immutable baseline) |
| 作者 | Game Designer role agent (DeepSeek Software Factory) |
| 语言 | 中文，术语保留英文，implementation-ready |
| 数值来源 | 本文为平衡数值权威来源 (authoritative)；实现时按 NFR-5 放入 `config/balance.json` |

> 阅读约定：所有数值均为设计值 (designed)，除非标注 **ESTIMATED**（表示初值，需在 playtest 中验证微调）。未标注 TBD——本文档不存在未决项。

---

## 文档结构 (Table of Contents)

1. 设计愿景与核心体验 (Vision & Core Experience)
2. 核心循环 (Core Loop)
3. 游戏规则 (Game Rules)
4. 玩家潜艇 (Player Submarine)
5. 声呐系统 (Sonar System, **P0 — 最重要系统**)
6. 敌方 AI (Enemy AI)
7. 鱼雷系统 (Torpedo System)
8. 玩家探测与逃脱 (Detection & Escape)
9. 任务系统 (Missions)
10. 评分系统 (Scoring)
11. UI / HUD 设计
12. 平衡目标表 (Balance Targets)
13. 需求覆盖矩阵 (FR-01 .. FR-22)
14. 设计决策记录 (Design Decision Log)
15. 附录：平衡公式 (Balance Formulas)

---

## 1. 设计愿景与核心体验 (Vision & Core Experience)

**一句话愿景**：一款打磨精致的 2D 俯视 (top-down) 战术潜艇伏击游戏，核心体验是 **“不确定性下的决策” (decision-making under uncertainty)**，而不是“瞄准/操作精度”。

玩家在游戏中反复执行：**听 (hear) → 判 (judge) → 追 (track) → 算 (predict) → 伏 (ambush) → 攻 (attack) → 藏 (hide) → 逃 (escape)**。

设计三原则：

1. **信息即稀缺资源**：声呐接触永远不是“红点即敌人”。玩家必须用有限、带误差的信息做决策，信息随跟踪时间收敛 (FR-06)。
2. **风险/回报杠杆**：主动声呐 (active ping) 信息↑ 风险↑；被动监听 (passive) 信息↓ 风险↓ (FR-07)。速度、深度、静默运行构成同一杠杆的不同刻度。
3. **小但完整 (small-but-complete)**：v1 范围严格限定——无 3D、无开放世界、无真实物理、无多人、无账号、无服务器 (Requirements §1)。所有内容离线本地 (NFR-2)。

**体验目标 (design goals)**：单局 15–40 分钟；一局内的紧张弧线 = 潜伏(低信息) → 逼近(风险累积) → 攻击(暴露) → 逃脱(化解)；失败必须“可归因”——玩家能复盘出“是我太早开火 / 我没静默 / 我ping太频繁”。

---

## 2. 核心循环 (Core Loop)

对应需求 §2.1 的完整循环，每个环节标注：驱动系统、玩家决策、风险来源。

```
MISSION START
   │
   ▼
observe 观察环境 (weather/visibility 决定战术)          ── 决策: 选择航路/深度
   ▼
sonar search 声呐搜索 (passive 为主, ping 按需)         ── 决策: 用不用 ping (暴露风险)
   ▼
detect contact 发现接触 (UNKNOWN, bearing-only)         ── 风险: 信息误差
   ▼
classify 分类 (UNKNOWN→SUSPECTED→CLASSIFIED→…)          ── 决策: 是否值得继续接近
   ▼
track 跟踪 (误差收敛: range±, speed/heading±)            ── 风险: 跟踪越久越暴露
   ▼
estimate course 推算航向/航速 (intercept 解算)          ── 决策: 选择伏击点
   ▼
choose ambush position 选择伏击阵位 (提前量)            ── 风险: 敌方航线变化
   ▼
approach 接近 (silent running, 深度/航速管理)            ── 风险: detection meter 上升
   ▼
prepare torpedo 准备鱼雷 (LOADED→READY, 火控解算)       ── 决策: 射程/提前角/是否齐射
   ▼
fire 发射 (无 auto-lock, 手动火控)                      ── 风险: 暴露位置
   ▼
enemy reaction 敌方反应 (NORMAL→SUSPICIOUS→…→HUNTING)   ── 决策: 下潜/变向/减速
   ▼
evade / reposition 规避或重新占位 (escapes, 电池管理)   ── 风险: 电池/深度/探测
   ▼
mission complete 任务完成 → evaluation 评分 → next mission
```

**节奏指标 (pacing)**:单任务建议节奏 = 60% 潜行/搜索/跟踪 (低张力积累) + 25% 攻击/规避 (高张力) + 15% 逃脱/收尾。实现层面不做强制计时器 (除逃脱判定)，由平衡数值自然形成。

---

## 3. 游戏规则 (Game Rules)

### 3.1 通用规则

- **地图**：每任务一块 30 km × 30 km 巡逻海域 (2D top-down, north-up, 网格 500 m)。超出边界 60 s 判定任务失败 (防挂机)。
- **胜利条件**：达成任务目标 (见 §9 任务表)；达成后自动进入 `MISSION_RESULT` (FR-19)。
- **失败条件**：`hull ≤ 0` → MISSION FAILED；`battery = 0%` → 强制上浮 (forced surface)，detection 置 100 (≈ 必死)，作为惩罚性失败路径；超出边界 60 s。
- **时间**：无硬性时限，时间只影响评分 (§10)。
- **确定性**：任务生成、AI 决策、鱼雷/伤害随机数全部使用 seeded PRNG (NFR-3)，同一 seed 完全可复现 (支持 replay/debug/headless AI 测试 NFR-6)。
- **暂停**：P 键暂停 → `PAUSED` 状态，UI 全停，可继续。
- **重启**：MISSION_RUNNING 中可 Restart (同 seed 重开) 或 Abort (回 MENU)。

### 3.2 规则与数值的存放

- 所有平衡数值的**权威来源**是本文档 §12；实现层按 NFR-5 移入 `config/balance.json`，运行时读取，禁止硬编码。
- 本文数值一律为设计目标；标注 **ESTIMATED** 的数值为初值，由 AI playtest (NFR-6) 验证后可能微调，但调整必须回到本文档与 balance.json 同步更新。

### 3.3 状态机 (FR-19)

`BOOT → MENU → MISSION_LOADING → MISSION_RUNNING ⇄ PAUSED → VICTORY | DEFEAT → MISSION_RESULT → MENU`

存档 (FR-19)：mission progress (解锁关卡)、best score、statistics 存入 `localStorage` (JSON)，无账号、无服务端。

---

## 4. 玩家潜艇 (Player Submarine)

### 4.1 状态 (FR-01)

`position(x,y), heading(°), speed(kt), depthLayer, battery(0-100), noise(0-100), hull(0-100), torpedoes[], detection(0-100), sonarState(idle|ping|passive)`

### 4.2 动作 (FR-01)

forward / reverse / turn L / turn R / change speed (四档切换，连续加减速) / change depth (五层切换，含 emergency dive 快捷键) / silent running (开关) / sonar ping (主动声呐) / fire torpedo / decoy (假目标，v1: 每任务 2 枚)。

### 4.3 速度档位 (FR-02)

| 档位 | 速度 (kt) | 噪声范围 (0-100) | 电池消耗 (%/s) | 典型用途 |
|---|---|---|---|---|
| STOPPED | 0 | 0–2 (名义 ≈0) | 0.02 | 静默待机/伏击守候 |
| SILENT | 2–4 | 8–15 | 0.10 | 潜行接近/逃脱 |
| CRUISE | 8–12 | 30–50 | 0.30 | 常规机动/大范围转移 |
| FULL | 18–22 | 70–90 | 0.60 | 快速脱离/紧急转移 |

- 档内连续变速；噪声插值公式见 §15 (F1)。**铁律：速度↑ ⇒ 噪声↑ ⇒ 敌方探测概率↑** (FR-02)。
- 方向舵转率：CRUISE 及以下 3.0°/s，FULL 1.5°/s (高速难转弯)；倒车 (reverse) 限速 4 kt。

### 4.4 深度层 (FR-03)

| 深度层 | 深度范围 (m) | 噪声修正 | 探测倍率 | 特殊效果 |
|---|---|---|---|---|
| Surface | 0–3 | +15 | ×1.5 | 电池充电 +0.4%/s；甲板炮可命中；不可发射鱼雷 |
| Periscope | 4–10 | +8 | ×1.2 | 可升潜望镜观测水面目标；可发射鱼雷 |
| Shallow | 11–30 | 0 | ×0.9 | 常规 |
| Medium | 31–70 | −5 | ×0.65 | 最佳平衡层；鱼雷射程 ×1.0 |
| Deep | 71–120 | −10 | ×0.50 | 深水炸弹伤害 ×1.5；电池额外 +0.05%/s (压载水) |

- 深度层切换耗时 3 s (Surface↔Deep 全程 12 s)，切换期间噪声为两层的均值。
- 探测倍率作用于敌方对玩家的探测概率 (§15 F3)；玩家对深水炸弹的易伤性见 §7.5。

### 4.5 电池 (FR-13)

- 初始 100%，耗尽 0% → 强制上浮 (规则 §3.1)。< 10% → **LOW BATTERY** 警报：禁用主动声呐、速度上限降至 SILENT、转向率减半。
- 消耗来源：速度档位 (§4.3)、主动 ping 2%/次、silent running 额外 +0.08%/s、emergency dive 3%/次、decoy 1%/枚。
- 补充来源：Surface 层充电 +0.4%/s (游戏化设计，见 DD-05)；**t-028f：浮至水面且航速 ≤ CRUISE 时快速充电 +2.0%/s** (balance.battery.surfaceFastChargePerSec；FULL 航速仅基础充电率——高速航行入不敷出)。

### 4.6 船体 (FR-13)

- Hull 初始 100%，0 → MISSION FAILED。伤害来源：深水炸弹 (15–35，见 §7.5)、甲板炮 (8–15)、碰撞 (10–25)。
- hull ≤ 30% 时显示 “HULL DAMAGED” 警报，噪声 +5 (进水声，**ESTIMATED**)。

### 4.7 探测计 (Detection Meter, FR-12)

0–100，分带：**0–20 Unaware / 20–40 Suspicious / 40–60 Searching / 60–80 Hunting / 80–100 Located** (需求给定的边界，直接采用)。详见 §8。

---

## 5. 声呐系统 (Sonar System, **P0 — 最重要系统**)

声呐是整局的“信息层”。核心原则：**被动优先，主动是杠杆**——主动声呐一次性获取精确信息但暴露自身；被动监听安全但信息弱。

### 5.1 主动声呐 (Active Ping) (FR-04)

| 参数 | 值 | 说明 |
|---|---|---|
| 探测范围 | 10 km | 超出无返回 |
| 冷却时间 | 6 s | 两次 ping 最小间隔 |
| 电池消耗 | 2% / 次 | |
| 自身暴露 | detection +12；8 km 内护航舰立即获得玩家 bearing 接触并转 SUSPICIOUS | ping 可被敌方被动听到 (敌方听到 ping 的范围 8 km) |
| 返回信息 | 每接触: bearing ±0.5°、range ±(10%→5%→2%)、signalStrength、type guess、confidence | 误差按跟踪次数收敛 (FR-06) |

Ping 返回示例 (需求 FR-04 原格式)：

```
SONAR PING 037°  RANGE 8.4 km  SIGNAL Medium  TYPE UNKNOWN  CONFIDENCE 43%
```

- `signalStrength`: Strong (< 3 km 或大型目标) / Medium (3–7 km) / Weak (7–10 km 或小型目标)。
- ping 对多个接触返回列表；同一 ping 内所有接触的 bearing 误差相同 (同一次声波)。

### 5.2 被动监听 (Passive Listening) (FR-07)

- 生效范围 **5 km**：可听到商船引擎 (Strong)、护航舰螺旋桨 (Medium/Strong)；**10 km** 内可听到鱼雷航行噪声；**15 km** 内可听到爆炸/深水炸弹。
- 被动只给 **bearing ±3°**，持续跟踪 30 s 收敛至 ±1°；**永远不给 range** (FR-06)。
- 被动监听**不产生自身暴露** (唯一无风险的信息源)。

### 5.3 不确定性模型 (Uncertainty Model) (FR-06)

- **首次接触**：只有 bearing (无论主动/被动)。
- **第 1 次 ping 命中**：range ±10%；每多一次 ping 误差 ×0.8 (±8%、±6.4%…)；bearing 误差 ×0.7/次。
- **被动跟踪**：bearing 误差每 10 s ×0.9；range 永远没有，除非被 ping 命中。
- **speed/heading 估计**：SUSPECTED 起解锁，初始 ±20%，TRACKED 后收敛至 ±5%；每次观测 ×0.85。
- **接触衰减**：90 s 无观测 → confidence 每 10 s −10%；confidence < 30% → 状态降级；UNKNOWN 且 120 s 无观测 → 接触移除。
- **永不精确**：默认所有数字都带误差；只有 CONFIRMED 且 range < 1.5 km 时误差可视为 0 (设计豁免，保证火控可用)。

### 5.4 接触状态机 (FR-05)

| 状态 | 数据完整度 | 晋升条件 | 降级条件 |
|---|---|---|---|
| **UNKNOWN** | bearing only, type=Unknown | 2 次观测 (被动 2 次或 1 次 ping) | 120 s 无观测 → 移除 |
| **SUSPECTED** | + range±10%、size 粗判 | 1 次 ping 命中 或 confidence ≥ 50% | 90 s 无观测 |
| **CLASSIFIED** | + type (如 Merchant 72%)、speed/heading ±20% | 分类置信 ≥ 60% (见 §5.5) | confidence < 40% |
| **TRACKED** | + speed/heading ±5%、range ±2% | 3 次 ping 命中 且 confidence ≥ 70% | confidence < 50% |
| **CONFIRMED** | 全字段, type 确定, 误差豁免 (<1.5km) | confidence ≥ 90% | 永不降级 (除 mission end) |

接触数据字段 (FR-05)：`id, position, bearing, range, speedEstimate, headingEstimate, classification, confidence, lastDetected, signalStrength`。

### 5.5 分类系统 (Classification) (FR-08)

类型池：**Merchant, Cargo, Tanker, Destroyer, Frigate, Submarine, Unknown**。

渐进链 (需求示例，直接采用)：`Unknown → Large Surface Contact → Merchant 72% → Confirmed Merchant`

- **confidence 累积**：被动观测 +15%/次；ping 命中 +25%/次；分类锁定需 ≥ 60% 类型置信。
- **类型投票**：由可观测特征加权投票——速度估计 (Merchant/Cargo 8–10 kt, Tanker 7–9 kt, Destroyer 20–26 kt, Frigate 18–22 kt)、噪声特征 (商船噪声谱 70–80, 护航舰 60–70, 潜艇 <30)、深度 (商船恒在表层)。
- 例：速度 9 kt + 高噪声 + 表层 → Merchant 72% → 2 次观测后置信 90% → Confirmed Merchant。
- v1 无敌方潜艇 (类型池保留 Submarine 供将来/世界观，**ESTIMATED** 不影响平衡)。

---

## 6. 敌方 AI (Enemy AI)

### 6.1 状态机 (FR-10)

```
 NORMAL ──(检测到玩家噪声/ping)──▶ SUSPICIOUS ──(detection≥40 或连续ping)──▶ ALERT
   ▲                                 │                                        │
   │                                 │(60s无接触)                              │(看到鱼雷/爆炸)
   │                                 ▼                                        ▼
 LOST_CONTACT ◀──(120s无接触)── SEARCHING ◀──────────────────────────────── SEARCHING
   ▲                                 │
   │                                 │(detection≥60 或 ping 确认 <1.5km)
   │                                 ▼
   └──(回归护航位 60s)── LOST_CONTACT ◀──(detection<40 持续30s)── HUNTING
```

| 状态 | 行为 | 进入触发 | 离开触发 |
|---|---|---|---|
| **NORMAL** | 商船保持队形 9 kt；护航舰环形巡逻 (半径 1 km, figure-8, 20 kt) | 任务开始/回归 | 检测到玩家被动噪声 或 听到 ping |
| **SUSPICIOUS** | 护航舰转向 bearing，开启自身主动声呐 (4 s/次, 6 km 范围)，航速 22 kt | 首次接触 | detection ≥ 40 或 2 次连续 ping 有 range → ALERT；60 s 无接触 → LOST_CONTACT |
| **ALERT** | 护航舰全速 (26 kt) 扑向 LKP；商船转向 30° 规避、提速 11 kt 持续 60 s 后恢复 | 异常确认 (探测计 ≥ 40) | 看到鱼雷 (鱼雷距护航舰 < 3 km) 或听到爆炸 → SEARCHING |
| **SEARCHING** | 以 LKP 为中心执行搜索模式 (§6.4)，20 kt | 发现鱼雷/爆炸 | detection ≥ 60 或 ping 确认 < 1.5 km → HUNTING；120 s 无接触 → LOST_CONTACT |
| **HUNTING** | 汇聚 LKP，投放深水炸弹 (每轮 6 枚, 3 s 间隔, 每轮间隔 20 s)，更新 LKP | 玩家被定位 | detection < 40 持续 30 s → SEARCHING (更新 LKP) |
| **LOST_CONTACT** | 返回护航位，途中 20 kt；到位 60 s → NORMAL | 超时未接触 | 途中再接触 → 相应状态 |

- **商船个体 AI**：跟随队形 (waypoint 跟随护航舰修正)；被鱼雷攻击 (TORPEDO RUNNING 指向自己) 时 30% 概率机动规避 (转向 45°，维持 30 s)；同队商船沉没时邻船规避 45° 30 s 后重新编队 (**ESTIMATED** 规避概率)。
- 护航舰弹药：每任务 20 枚深水炸弹，用完转 SEARCHING 无限期 (无法再 HUNTING，玩家逃脱窗口)。

### 6.2 船型参数

| 船型 | 航速 (kt) | 船体 | 传感器 | 攻击 | 备注 |
|---|---|---|---|---|---|
| Merchant | 9 | 100 | 被动 4 km, 迟钝 | 无 | 商船目标 |
| Cargo | 10 | 110 | 被动 4 km | 无 | 商船目标 |
| Tanker | 8 | 130 | 被动 4 km | 无 | 商船目标，最慢 |
| Destroyer | 巡逻 20 / 攻击 26 | 190 | 被动 6 km + 主动 6 km | 深水炸弹 + 甲板炮 (2 km) | 主力护航 |
| Frigate | 18 / 22 | 140 | 被动 6 km + 主动 6 km | 深水炸弹 + 甲板炮 | 高速护航 |

### 6.3 编队与护航 (FR-09)

- 标准编队：**4 商船 (2×2 网格) + 1 护航舰** (M03/M04/M05 增援见 §9)。
- 队形参数：列间距 500 m，行间距 400 m；队首正对航向；护航舰偏移 800 m，巡逻半径 1 km (figure-8 路径, 周期 90 s)。
- Fleet 数据 (FR-09)：`heading, speed, formation, spacing, patrolBehavior`。
- 商船遭攻击时队形破坏 → 邻船规避 (§6.1)，护航舰响应优先级：鱼雷 > 爆炸 > 噪声。

### 6.4 搜索模式 (Search Patterns) (FR-10)

以 **LKP (Last Known Position)** 为中心的三种模式，按场景选择：

| 模式 | 参数 | 适用 |
|---|---|---|
| **Circular** | 半径 1.0 → 2.5 km，每整圈半径 +300 m，20 kt | 定位后立即环绕 (玩家多半原地) |
| **Zig-zag** | 平行扫掠，lane 间距 300 m，每条 lane 2 km，掉头半径 200 m | 有航向估计时 (沿估计航线扫) |
| **Expanding (spiral)** | 半径每 45° 转向 +150 m，起点 500 m | 长时间未接触，扩大覆盖 |

搜索期间护航舰 4 s 一次主动 ping；每次 ping 命中玩家 (玩家 ≤ 10 km) 更新 LKP 为玩家位置 + 误差 (见 §15 F5)。

---

## 7. 鱼雷系统 (Torpedo System)

### 7.1 数量与状态 (FR-11)

- 每任务 **4–6 枚** (按任务表 §9)，玩家自选齐射 1 或 2 枚。
- 状态机：`LOADED → READY → FIRED → RUNNING → HIT | MISSED | EXPIRED`

| 状态 | 含义 |
|---|---|
| LOADED | 在管，可装定 |
| READY | 火控解算完成，可发射 (发射前显示解算结果) |
| FIRED | 已出管 |
| RUNNING | 航行中 (40 kt, 射程 6 km, 寿命 300 s) |
| HIT | 距目标 ≤ 40 m → 结算伤害 |
| MISSED | 判定落空 (见 §7.3) |
| EXPIRED | 航程/寿命耗尽 |

### 7.2 无自动锁定 (No Auto-Lock)

- 玩家从接触面板选中目标 (TRACKED 及以上) → 系统**只计算并显示**火控解，**不锁定不引导**；鱼雷出管后按固定提前角直航 (无追踪)，目标机动即可摆脱——这符合“决策而非瞄准”的核心体验 (FR-11)。
- 鱼雷自身噪声：航行中 10 km 内可被敌方被动听到 (可能提前预警，§6.1 ALERT 触发)。

### 7.3 火控解算 UI (Fire Solution) (FR-11)

对选中目标显示：

```
TARGET  T-03  CLASSIFIED Merchant   CONFIDENCE 72%
BEARING  037°    RANGE 3.2 km
TARGET HDG  084°  TARGET SPD 9 kt
RECOMMENDED FIRING BEARING  041°  (提前角 +4°)
HIT PROBABILITY  71%   [单发] / 84% [齐射2枚]
```

- 推荐发射方位 = 目标方位 + 提前角；提前角由相对速度矢量解算 (§15 F6)。
- 目标未 TRACKED 时，火控解以估计值计算并标注 “ESTIMATED” (误差传导进命中率)。

### 7.4 命中概率模型 (Hit Probability) (FR-11)

`HP = base 0.85 − rangePen − aobPen − targetSpeedPen − confidencePen − maneuverPen` (详见 §15 F7)

| 因子 | 修正 | 说明 |
|---|---|---|
| 射程 ≤ 2 km | 0 | 贴脸必中区间 |
| 射程 2–4 km | −0.15 | |
| 射程 4–6 km | −0.35 | |
| AOB 90° (正横) | 0 | 理想伏击位 |
| AOB 45° | −0.10 | |
| AOB 20° | −0.25 | |
| AOB 0° (迎头) | −0.45 | |
| 目标速度 ≤ 5 kt | 0 | |
| 10 kt | −0.05 | |
| 15 kt | −0.15 | |
| 20 kt+ | −0.25 | |
| 跟踪置信 ≥ 90% | 0 | |
| 70% | −0.10 | |
| 50% | −0.20 | |
| < 30% | −0.35 | |
| 目标机动性 Merchant/Cargo/Tanker | 0 | 商船不机动 |
| Frigate | −0.10 | |
| Destroyer | −0.15 | 且有 30% 规避概率 (规避再 −0.15) |

- **确定性 + 受控随机**：显示 HP 由输入唯一确定 (确定性)；实际结果 = HP + uniform(−0.10, +0.10)，≥ 0.50 → HIT (受控随机)。随机数来自任务 seed (NFR-3 可复现)。
- 齐射 2 枚：两枚独立判定；显示概率 = 1 − (1−HP)²。
- HP 显示 clamp 到 [5%, 95%]。
- **MISSED 判定**：鱼雷与目标最近距离 40–120 m → MISSED (近失)；> 120 m 且寿命耗尽 → MISSED (彻底丢失)；距离 ≤ 40 m → HIT。
- **EXPIRED**：航行 300 s 或距离 > 6 km 自毁 (无声)。

### 7.5 鱼雷伤害与目标船体

| 目标 | 船体 | 单发伤害 | 典型击杀所需命中 |
|---|---|---|---|
| Merchant | 100 | 90 ± 10 | 1–2 |
| Cargo | 110 | 90 ± 10 | 1–2 |
| Tanker | 130 | 90 ± 10 | 2 |
| Frigate | 140 | 90 ± 10 | 2 |
| Destroyer | 190 | 90 ± 10 | 2–3 |

深水炸弹伤害 (对玩家)：直接命中 (≤ 40 m) 35 / 近失 (40–120 m) 20 / 远 (120–250 m) 10；Deep 层 ×1.5 (§4.4)。甲板炮：仅玩家在 Surface/Periscope 且护航舰 ≤ 2 km 时开火，命中 60% (0.5 km) → 10% (2 km)，伤害 8–15/发。

---

## 8. 玩家探测与逃脱 (Detection & Escape)

### 8.1 探测计机制 (FR-12)

探测计 0–100，分带 0–20 Unaware / 20–40 Suspicious / 40–60 Searching / 60–80 Hunting / 80–100 Located。

**上升来源**：

| 来源 | 增量 | 说明 |
|---|---|---|
| 噪声 (被动) | `P_detect` (%/s, §15 F3) | 速度/深度/天气/距离综合 |
| 主动 ping | +12 (立即) | 每次 ping |
| 发射鱼雷 | +20 (立即) | 出管瞬间 |
| 深水炸弹命中/近失 | +15 / +10 | 每次 |
| 被敌方主动 ping 命中 | +8 / 次 | 护航舰在 HUNTING/SEARCHING 时 |
| 甲板炮命中 | +5 / 发 | |

**下降来源**：

| 来源 | 减量 | 条件 |
|---|---|---|
| STOPPED + silent running | −2%/s | 静默待机 |
| SILENT + silent running | −1%/s | 静默潜航 |
| 深度下潜 (Surface→Medium) | −15 (立即) | 切换瞬间 |
| 大角度变向 (>30° / 10 s) | −10 (立即) | 破坏声学稳定 |
| decoy 发射 | −20 (立即) | 敌方 70% 概率改追 decoy |
| 距离拉开 (> 3 km 且 LKP 误差增大) | −0.5%/s (**ESTIMATED**) | 逃脱阶段 |

- 探测计**不会自动回落** (除非满足下降条件) —— 强调“静默是主动行为”。
- **100 = LOCATED**：护航舰获得玩家精确位置 (误差 0)，汇聚深水炸弹；玩家需在 60 s 内将探测计降到 < 60，否则基本必死 (深水炸弹每轮 6 枚 × 每轮间隔 20 s)。

### 8.2 逃脱模型 (FR-12)

逃脱判定 (仅 M05 强制，其他任务作为评分奖励)：**detection < 20 持续 30 s 且距最近护航舰 > 3 km → ESCAPED** (触发 VICTORY 若目标已达成，或事件日志记录)。

简化模型要素 (需求指定)：`depth / speed / noise / Last Known Position`。

- 逃脱策略成功链：降低速度 → 开 silent running → 下潜 (探测倍率 ↓) → 变向 (>30°) → decoy 干扰 → 拉开距离 → LKP 误差扩大 (护航舰搜索的是“错误位置”)。
- LKP 误差模型：护航舰 LKP 每 5 s 更新一次，若玩家不在其传感器内，LKP 固定；玩家机动 (变向/变速) 造成 LKP 漂移误差 +50 m/次，累积上限 1.5 km (§15 F5)。玩家可利用此误差“骗”护航舰搜索错误区域。
- **decoy (FR-12)**：每任务 2 枚；发射后 20 s 内噪声 90、位置固定；5 km 内护航舰 70% 概率把 decoy 当 LKP。电池 1%/枚。

---

## 9. 任务系统 (Missions)

### 9.1 五任务表 (FR-14)

| ID | 名称 | 目标 | 敌编成 | 鱼雷 | 天气/能见度 | 难度 | Par 时间 | 生成 seed |
|---|---|---|---|---|---|---|---|---|
| M01 | Sonar Training 声呐训练 | 找到 → 分类 → 跟踪 1 艘商船 (不需击沉) | 1 × Merchant (独航) | 4 | Clear / 高 | Easy | 15 min | 1001 |
| M02 | First Ambush 首次伏击 | 击沉 1 艘运输船 | 1 × Tanker (独航) | 4 | Clear→Cloudy / 中高 | Easy-Med | 20 min | 1002 |
| M03 | Convoy Attack 袭击护航队 | 击沉 ≥ 2 艘商船 | 4 × Cargo + 1 × Destroyer | 5 | Cloudy→Storm / 中 | Medium | 30 min | 1003 |
| M04 | Heavy Escort 重装护航 | 击沉 ≥ 2 艘商船且存活 | 4 × Cargo + 2 × Destroyer (更强搜索: 主动 ping 2 s/次) | 4 | Storm→Fog / 低 | Hard | 35 min | 1004 |
| M05 | Silent Hunter 静默猎手 | 击沉 ≥ 1 艘 + **成功逃脱** (ESCAPED) | 4 × Cargo + 2 × Destroyer + 1 × Frigate | 4 | Night + Fog / 极低 | Very Hard | 40 min | 1005 |

- 解锁链：顺序解锁；M01 通关解锁 M02，依此类推。存档记录 (FR-19)。
- 天气定义 (FR-17)：

| 天气 | 能见度 (水面目视) | 声呐修正 (探测/命中) | 噪声修正 | 氛围 |
|---|---|---|---|---|
| Clear | 10 km | ×1.0 | ×1.0 | 晴朗 |
| Cloudy | 7 km | ×0.9 | ×1.0 | 多云 |
| Storm | 3 km | ×0.6 | ×1.15 | 暴雨, 浪大 (Surface 噪声 +10) |
| Fog | 1.5 km | ×0.5 | ×1.0 | 浓雾 |
| Night | 2 km | ×0.8 | ×1.0 | 夜间 (M05 叠加 Fog) |

- 天气影响：能见度只影响水面目视/甲板炮/潜望镜；声呐修正作用于敌方对玩家探测率 (§15 F3) 与玩家 ping 命中率 (同系数)；Storm 下玩家 Surface 层额外 +10 噪声。
- 任务开始玩家初始：电池 100%，hull 100%，位置 = 敌编队预计航路前方 8–12 km 的伏击区 (随机但 seeded)，朝向垂直于敌航向。

### 9.2 任务生成器 (Mission Generator) (FR-15)

**输入 → 输出** (确定性，seed 驱动)：

```
输入: { difficulty(1-5), enemyCount, escortCount, weather, visibility, torpedoes,
        battery, objective, seed }
输出: MissionDefinition = {
  patrolArea: 30km×30km,
  fleet: { heading, speed, formation(2×2), spacing(500m/400m), patrolBehavior },
  spawns: [ {type, x, y, heading} ... ]   (seeded 布置, 间距 ≥ 2km 避免重叠)
  weather, visibility,
  playerStart: { x, y, heading },
  objective: { type, params, reward },
  torpedoCount, batteryStart,
  seed
}
```

- 五任务的固定定义 = 用上表参数跑生成器 (同一 seed) 的结果，**可复现** (NFR-3)。
- 生成器规则：商船初始位置沿航路散布 (前后 ±1.5 km)；护航舰在编队正后方 800 m；玩家出生点距最近敌船 ≥ 8 km。
- 校验：生成结果需满足约束 (距离、数量)，失败则 seed 递增重试 (最多 10 次，确定性)。

### 9.3 世界生成 (World Generation) (FR-16)

- 过程化海洋 (seeded)：颜色渐变 (浅→深)、深度梯度 (与深度层对应)、噪声波纹、洋流 (不影响 v1 物理，仅视觉)、天气、能见度。无外部地图 (FR-16)。
- 风格：muted 军事调色板、top-down、网格 500 m、north-up (与资产规格 FR-21 一致)。

---

## 10. 评分系统 (Scoring) (FR-20)

总分 1000，按权重加权：**目标 40% (400) + 伤害 20% (200) + 探测 15% (150) + 鱼雷效率 10% (100) + 时间 10% (100) + 存活/逃脱 5% (50)**。

| 等级 | 分数 | 判定 |
|---|---|---|
| Perfect | 1000 | 满分 (所有组件满分) |
| Excellent | 800–999 | |
| Good | 600–799 | |
| Poor | 400–599 | |
| Failed | < 400 | 任务失败 (未达标或阵亡) |

### 10.1 各组件公式

1. **目标 (400)**：按任务子目标加权 (如 M03: 击沉 2 艘各 200；M05: 击沉 1 艘 250 + 逃脱 150)。子目标达成即得相应分。
2. **伤害 (200)**：击沉得分 Merchant 60 / Cargo 60 / Tanker 70 / Frigate 90 / Destroyer 110，上限 200 (M01 无击沉要求，此组件按“目标跟踪完成度”折算: 分类 TRACKED +100 / CONFIRMED +200)。
3. **探测 (150)**：`150 × (1 − peakDetection/100)`。全程静默 (peak < 40) 得满。
4. **鱼雷效率 (100)**：`100 × clamp(hits / expectedHits, 0, 1)`。expectedHits: M01 0 (此组件恒 100)、M02 1、M03 2、M04 2、M05 1。
5. **时间 (100)**：`100 × clamp(parTime / actualTime, 0, 1)`，parTime 见 §9.1。
6. **存活/逃脱 (50)**：`50 × (hull/100)`；M05 额外：ESCAPED 达成 +50 叠加 (即 M05 此项满分 100)。

### 10.2 展示

MISSION_RESULT 界面：总分 + 等级 + 各组件分条 + 统计 (命中/发射、最高探测、耗时、剩余鱼雷) + 复盘提示 (如 “探测峰值 88 —— 试着少 ping、多被动”)。统计写入 localStorage (FR-19 bestScore 取各任务最高分)。

---

## 11. UI / HUD 设计 (FR-18)

### 11.1 主菜单

`Play` (快速开始: 最近解锁任务) / `Missions` (五任务选择，锁定的显示锁图标) / `Settings` (音量: 主/音效/音乐；显示: 网格开关、HUD 缩放；数据: 清除存档) / `Credits` (署名 + 资产来源 THIRD_PARTY_ASSETS.md)。风格：深海军蓝底、muted 军事 UI、SVG/CSS 图标 (FR-21)。

### 11.2 战术 HUD (任务中)

- **顶栏**：深度 (m + 深度层名)、速度 (kt + 档位)、航向 (°)、电池 (%，<10% 闪烁 LOW BATTERY)、船体 (%，<30% 红)、噪声 (0-100)、探测计 (0-100，五段色带: 绿/黄/橙/红/深红)、任务目标 (可折叠)、计时器、天气图标。
- **鱼雷状态区**：4–6 管图标 (LOADED 白 / READY 绿 / FIRED 空)，齐射选择 (1 或 2 枚)。
- **接触面板 (右)**：列表每行 = `id | type | bearing | range | speed | heading | confidence | lastSeen` (FR-18 字段全齐)。点击选中 → 底部显示火控解算卡 (§7.3)。接触显示为**不确定性椭圆**而非红点 (FR-05 精神)。
- **事件日志 (左下)**：带时间戳 (mm:ss)，条目: `SONAR CONTACT DETECTED / CONTACT CLASSIFIED / TORPEDO READY / TORPEDO FIRED / TARGET HIT / TORPEDO MISSED / DEPTH CHARGES DROPPED / LOW BATTERY / ESCAPED / MISSION COMPLETE` 等 (FR-18 事件全齐)。
- **地图/声呐视图 (中央)**：top-down 战术图，自身潜艇箭头、接触椭圆、LKP 标记、鱼雷轨迹、ping 扩散环、decoy 标记、编队图标 (按类型)。可缩放 (滚轮) / 平移。
- **交互**：快捷键 W/S 速度、A/D 转向、Q/E 深度、Space ping、F 发射、R silent running、G decoy、P 暂停、Esc 菜单。

### 11.3 屏幕状态

BOOT (加载) / MENU / MISSION_LOADING (带任务简报) / MISSION_RUNNING / PAUSED / VICTORY / DEFEAT / MISSION_RESULT (FR-19 全状态)。任务简报含：目标、敌情 (仅“护航队报告：4 商船 + 1 驱逐舰”级别信息)、天气、鱼雷数。

---

## 12. 平衡目标表 (Balance Targets)

权威数值表 (实现移入 `config/balance.json`, NFR-5)。**内部一致性校验：速度↑ ⇒ 噪声↑ ⇒ 探测率↑；深度↓ ⇒ 探测率↓ 但风险↑ (深弹)；ping 给信息也涨探测。** 全部为设计值，标注 ESTIMATED 者待 playtest 验证。

### B1. 速度/噪声/电池 (FR-02, FR-13)

| 档位 | 速度 kt | 噪声 | 电池 %/s | 备注 |
|---|---|---|---|---|
| STOPPED | 0 | 0–2 (≈0) | 0.02 | |
| SILENT | 2–4 | 8–15 | 0.10 | |
| CRUISE | 8–12 | 30–50 | 0.30 | |
| FULL | 18–22 | 70–90 | 0.60 | |

### B2. 深度层 (FR-03)

| 层 | 深度 m | 噪声修正 | 探测倍率 | 特殊 |
|---|---|---|---|---|
| Surface | 0–3 | +15 | ×1.5 | 充电 +0.4%/s；甲板炮可中；不能射鱼雷 |
| Periscope | 4–10 | +8 | ×1.2 | 潜望镜观测；可射鱼雷 |
| Shallow | 11–30 | 0 | ×0.9 | |
| Medium | 31–70 | −5 | ×0.65 | 最优层；鱼雷射程 ×1.0 |
| Deep | 71–120 | −10 | ×0.50 | 深弹伤害 ×1.5；电池额外 +0.05%/s |

### B3. 探测概率 vs 噪声 (FR-12) — 每秒探测率 `P_detect`

`P_detect = (noise/100) × baseRate × depthFactor × weatherFactor × distanceFactor` (F3)

| 噪声 | 距离 1 km, Medium, Clear | 距离 3 km | 距离 5 km | 护航舰 baseRate |
|---|---|---|---|---|
| 1 (STOPPED) | 0.03%/s | 0.02%/s | 0.01%/s | 0.05 |
| 12 (SILENT) | 0.39%/s | 0.26%/s | 0.13%/s | (商船 0.015) |
| 40 (CRUISE) | 1.30%/s | 0.87%/s | 0.43%/s | |
| 80 (FULL) | 2.60%/s | 1.73%/s | 0.87%/s | |

(表中 = noise/100 × 0.05 × 0.65 × 1.0 × (1 − d/6000)，d 为距离 m)

### B4. 声呐 (FR-04/07)

| 项 | 值 |
|---|---|
| ping 范围 | 10 km |
| ping 冷却 / 电池 | 6 s / 2% |
| ping 自身暴露 | detection +12；护航舰 ≤ 8 km 听到 |
| 被动范围 | 5 km (引擎/螺旋桨)；鱼雷 10 km；爆炸 15 km |
| 被动信息 | bearing ±3°→±1° (30 s)，无 range |
| ping 命中信息 | bearing ±0.5°；range ±10%→2% (跟踪收敛) |

### B5. 鱼雷 (FR-11)

| 项 | 值 |
|---|---|
| 数量/任务 | 4–6 (按任务) |
| 航速 | 40 kt |
| 射程 / 寿命 | 6 km / 300 s |
| 伤害 | 90 ± 10 (Merchant 100 / Cargo 110 / Tanker 130 / Frigate 140 / Destroyer 190 船体) |
| 命中判定 | ≤ 40 m HIT；40–120 m MISSED (近失)；> 120 m 或寿命尽 MISSED |
| 命中率 | §7.4 / F7 (base 0.85 − 各惩罚，clamp 5–95%) |

### B6. 敌方攻击 (FR-10/13)

| 项 | 值 |
|---|---|
| 深水炸弹 | 直接 35 / 近失 20 / 远 10；Deep 层 ×1.5 |
| 深弹投放 | 每轮 6 枚 / 3 s 间隔 / 轮间隔 20 s；每任务 20 枚 |
| 甲板炮 | 射程 2 km；命中 60%→10%；伤害 8–15；仅打 Surface/Periscope |
| 碰撞 | 10–25 (商船/护航舰) |

### B7. 电池 (FR-13)

| 项 | 值 |
|---|---|
| 总容量 | 100% |
| 消耗 | 速度档 (B1) + ping 2% + silent running +0.08%/s + emergency dive 3% + decoy 1% |
| 充电 | Surface +0.4%/s |
| LOW BATTERY | <10%: 禁 ping、限速 SILENT、转向率减半 |
| 0% | 强制上浮 → 探测 100 |

### B8. 船体 (FR-13)

| 项 | 值 |
|---|---|
| 玩家 hull | 100；≤0 任务失败；≤30% 警报 + 噪声 +5 (**ESTIMATED**) |
| 商船船体 | Merchant 100 / Cargo 110 / Tanker 130 |
| 护航船体 | Frigate 140 / Destroyer 190 |

### B9. 敌方探测率 (FR-10)

| 项 | 值 |
|---|---|
| 护航舰被动 baseRate | 0.05/s (6 km 范围) |
| 商船被动 baseRate | 0.015/s (4 km 范围) |
| 护航舰主动 ping | SUSPICIOUS 起 4 s/次，6 km；HUNTING 2 s/次 |
| 天气修正 | Clear 1.0 / Cloudy 0.9 / Storm 0.6 / Fog 0.5 / Night 0.8 |
| 深度修正 | ×1.5 / ×1.2 / ×0.9 / ×0.65 / ×0.50 (B2) |

**一致性抽查**：FULL 80 噪声 + Surface (×1.5) + Clear + 1 km：`0.8 × 0.05 × 1.5 × 1.0 × 0.833 = 5.0%/s` → 约 8 s 从 0 升到 40 (Suspicious) → 护航舰很快 ALERT——高速水面狂奔 = 自杀，符合设计。STOPPED 1 噪声 + Deep (×0.5) + Fog (×0.5) + 3 km：`0.01 × 0.05 × 0.5 × 0.5 × 0.5 = 0.00125%/s` → 约 5.5 h 升 25 —— 静默到几乎隐形，符合“藏”的幻想。

### B10. 资产与音频对齐 (FR-21 / FR-22)

- **资产 (FR-21)**：本文 §11 UI 风格与 §9.3 海洋风格即资产风格规范 (top-down / tactical 2D / medium detail / muted palette / transparent / north-up)。船型精灵尺寸按规格: 商船 256×256, 护航舰 256×256, 玩家潜艇 256×256, 鱼雷/decoy 128×128, UI SVG/CSS。过程化优先 (海洋/声呐环/爆炸/尾迹/粒子/UI/地图/网格/波浪/标记/雷达/指示器)。管线与注册表 (registry.json、THIRD_PARTY_ASSETS.md、license gate) 遵循 requirements §3，本文不重复。
- **音频 (FR-22)**：≥10 SFX 全部 WebAudio 程序合成，与系统绑定——sonar ping (主动)、passive 环境底噪 (被动)、torpedo launch/travel/hit、explosion、depth charge、engine (随速度档位变速)、hull creak (hull<30%)、alarm (LOW BATTERY/被定位)、UI click、mission success/failed。风格 dark/minimal/underwater/military/tense。触发点由 §5/§7/§8 系统状态驱动。

---

## 13. 需求覆盖矩阵 (FR-01 .. FR-22)

| FR | 需求摘要 | 覆盖位置 |
|---|---|---|
| FR-01 | 潜艇状态与动作 | §4.1–4.2 |
| FR-02 | 四档速度/噪声 | §4.3, B1 |
| FR-03 | 五深度层效果 | §4.4, B2 |
| FR-04 | 主动声呐 ping 返回 | §5.1 |
| FR-05 | 接触系统五状态 | §5.4 |
| FR-06 | 声呐不确定性收敛 | §5.3 |
| FR-07 | 被动声呐 | §5.2 |
| FR-08 | 分类系统渐进链 | §5.5 |
| FR-09 | 编队与护航 | §6.3 |
| FR-10 | 敌方 AI 状态机 + 搜索 | §6.1–6.4, B9 |
| FR-11 | 鱼雷状态/无自锁/火控 | §7.1–7.4 |
| FR-12 | 探测计与逃脱 | §4.7, §8 |
| FR-13 | 电池与船体 | §4.5–4.6, B7–B8 |
| FR-14 | 五任务 | §9.1 |
| FR-15 | 任务生成器 | §9.2 |
| FR-16 | 世界生成 | §9.3 |
| FR-17 | 天气系统 | §9.1 |
| FR-18 | UI/HUD/事件日志 | §11 |
| FR-19 | 游戏状态机与存档 | §3.3, §11.3 |
| FR-20 | 评分 | §10 |
| FR-21 | 资产 | §12 B10 + requirements §3 (管线在资产文档) |
| FR-22 | 音频 | §12 B10 + requirements §4 (实现为 WebAudio) |

---

## 14. 设计决策记录 (Design Decision Log)

| # | 决策 | 理由 | 影响 |
|---|---|---|---|
| DD-01 | 游戏化仿真，非真实物理：深度用五层离散而非连续米数 | 保决策清晰、HUD 可读、AI/平衡可测 (Requirements: “Game-oriented simulation”) | 所有公式以层为输入 |
| DD-02 | 被动优先、ping 是杠杆 (风险/回报) | 核心体验“不确定性下的决策”；ping 给信息也涨探测 (FR-12) | §5, §8 |
| DD-03 | v1 护航舰不射鱼雷，只用深水炸弹 + 甲板炮 | 让“逃脱模型”可解、可控；玩家鱼雷是唯一远程武器，火力优势明确 | §6.1, B6 |
| DD-04 | 无 auto-lock：鱼雷出管后直航，无追踪 | 命中率 = 玩家提前量判断 + 火控显示，保留“决策而非瞄准” | §7.2 |
| DD-05 | Surface 层可充电 (游戏化) | 制造“充电 vs 暴露”的抉择，电池成为有意义的资源曲线 | §4.4–4.5 |
| DD-06 | 平衡数值单一权威源 = 本文 §12 → `balance.json` | NFR-5；架构/实现/AI playtest 都引用同一份 | §3.2 |
| DD-07 | 全系统 seeded 确定性 (含 AI 决策与伤害随机) | NFR-3/NFR-6：replay、debug、headless AI 测试可用 | §3.1, §7.4 |
| DD-08 | 探测计不自动回落，静默是主动行为 | 防止“拖时间等降探测”的挂机策略，逼迫玩家主动操作 | §8.1 |
| DD-09 | 商船编队 2×2、护航 figure-8 (非真实护航阵型) | 视觉清晰 + AI 实现简单 + 留给玩家伏击缺口 | §6.3 |
| DD-10 | 评分组件权重 40/20/15/10/10/5 | 目标主导、伤害次之、生存保底；M05 逃脱叠加 +50 强化主题 | §10 |

---

## 15. 附录：平衡公式 (Balance Formulas)

实现时按 NFR-3 全部用任务 seed 驱动的确定性随机。

**F1 噪声插值 (档内连续)**：`noise = bandBase + slope × (speed − bandMin)`，bandBase/slope: SILENT 8/2、CRUISE 30/4、FULL 70/5；STOPPED = 1。叠加深度层噪声修正 (B2)。

**F2 深度切换**：耗时 3 s/层，切换期噪声 = 两层均值。

**F3 每秒被动探测率 (敌方对玩家)**：
`P_detect = (noise/100) × baseRate × depthFactor × weatherFactor × distanceFactor`
- baseRate: 护航舰 0.05 (范围 6 km)、商船 0.015 (4 km)
- depthFactor: ×1.5/×1.2/×0.9/×0.65/×0.50 (B2)
- weatherFactor: Clear 1.0 / Cloudy 0.9 / Storm 0.6 / Fog 0.5 / Night 0.8
- distanceFactor = clamp(1 − distance/range, 0, 1)
- 结果加到玩家探测计 (§8.1)。

**F4 敌方主动 ping 命中**：护航舰 ping 范围 6 km；若玩家在范围内，探测计 +8/次，护航舰获得玩家 bearing ±2°。

**F5 LKP 误差模型**：护航舰 LKP 5 s 刷新一次；玩家在其传感器外时 LKP 冻结；玩家变向/变速造成 LKP 漂移 +50 m/次，累积上限 1.5 km。HUNTING 时 ping 命中更新 LKP (带 F4 误差)。decoy 70% 概率替换 LKP 20 s。

**F6 提前角解算**：`leadAngle = atan2(vT·sin(AOB), vT·cos(AOB) + vTorpedo)`，vTorpedo = 40 kt (≈20.6 m/s)；推荐发射方位 = 目标 bearing + leadAngle。所有输入带接触误差 (§5.3) 时输出标 ESTIMATED。

**F7 命中概率**：`HP = clamp(0.85 − rangePen − aobPen − speedPen − confPen − maneuverPen, 0.05, 0.95)`；pen 查表 §7.4；齐射 2 枚显示 `1 − (1−HP)²`；实际判定 `HP + uniform(−0.10, +0.10) ≥ 0.50 → HIT` (seeded RNG)。

**F8 探测计下降**：`d/dt` 按 §8.1 表；所有下降修正叠加，最低 0。

**F9 逃脱判定**：`detection < 20 持续 30 s 且 dist(nearestEscort) > 3 km → ESCAPED` (M05 强制，其余任务为统计)。

**F10 评分**：§10.1 公式；总分 = 四舍五入各组件分之和，等级阈值 §10。

---

*文档结束。下一阶段输入：architecture.md (系统拆分与模块接口) 与 ui-spec.json (HUD 布局与交互) 应以此文档数值与流程为权威依据。*

