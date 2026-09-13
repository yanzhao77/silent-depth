# SILENT DEPTH UE4 科技树下一阶段计划

| 字段 | 内容 |
|---|---|
| 文档状态 | ACTIVE |
| 基线日期 | 2026-09-12 |
| 目标分支 | `ue4` |
| 目标引擎 | Unreal Engine 4.27.2 |
| 上游文档 | `docs/UE4_TECH_TREE_EXECUTION_PLAN.md` §12 · `docs/UE4_TECH_TREE_DECISION_RECORD.md` · `docs/UE4_TECH_TREE_SCHEMA.md` §9 |
| 适用范围 | UMG 控件层、完整存档外壳、`SOCKET-001`、`DATA-005` 剩余项、互斥规则、`DEC-007` 手感验证 |
| 本文件性质 | 计划。不改变已决定的 `DEC-001`、`DEC-002`、`DEC-004`、`DEC-007`，也不替代数据、资产与运行时任务的交付记录 |

本文件把执行计划 §12「近期执行清单」的六项展开为可执行任务，并补上执行时
暴露出的决策缺口。任务编号沿用上游文档；本文件不新造任务 ID，只新增决策 ID。

---

## 1. 完成任务定义

沿用执行计划 §3 的六层定义。本阶段各任务只承诺自己那几层：

| 层 | 含义 | 本阶段哪些任务触及 |
|---|---|---|
| DATA TESTED | schema、ID、Tier、依赖、兼容关系、资产路径通过自动检查 | P1、P2 |
| RUNTIME TESTED | C++ 可加载并应用规则，非法数据失败关闭 | P1、P2、P4、P5 |
| UI VERIFIED | 界面可操作，且不显示未解锁或隐藏的游戏事实 | P3 |
| EDITOR VERIFIED | 在 UE4.27 中完成导入、尺寸、材质、LOD、碰撞与 socket 检查 | P3、P5 |
| TARGET HARDWARE VERIFIED | 在目标硬件上完成性能与显存验证 | 本阶段不承诺 |

`DATABASE_ONLY` 条目不要求制作内部工程模型，但仍必须满足数据、运行时与 UI 验收。

---

## 2. 当前基线（2026-09-12 实测）

| 项 | 实测事实 |
|---|---|
| UE 环境 | `C:\game\Epic Games\UE_4.27`，`Engine/Binaries/Win64/UE4Editor-Cmd.exe` 存在 |
| UE 工程 | `ue4/SilentDepthUE`，编辑器二进制已编译（`Binaries/Win64/UE4Editor-SilentDepthUE.dll`） |
| 自动化可跑 | `Saved/Logs/SilentDepthUE.log`（2026-09-11）记录 `**** TEST COMPLETE. EXIT CODE: 0 ****`，报告写入 `Saved/Automation/Reports/` |
| UMG 资产 | `ue4/SilentDepthUE/Content` 下 `.umg` 资产 **0 个**；C++ 侧 `UUserWidget` 子类 **0 个** |
| UI 数据层 | `FSDTechTreeViewModel` 已交付（分类页签、层阶区段、节点行、四个状态、三个正交徽标、配装候选） |
| Python 脚本能力 | `SilentDepthUE.uproject` 已启用 `PythonScriptPlugin`，引擎侧插件存在；**尚未做过 WidgetBlueprint 生成验证** |
| 防御矩阵 | 2430 行 / 45 family / 13 个代表资产；其中 270 行 `asset_id` 为空 |
| 推进矩阵 | 1 条悬空引用 `CN_PJ_Type093B`（资产库无目录、无文件） |
| 装位共用 | 防御 loadout 中 `SOCKET_COUNTERMEASURE_02` 被 `DECOY` 与 `NOISE_MAKER` 共用（54 艘 → 108 行）；其余 5 个 socket 每艘单占 |
| 节点级互斥 | 五棵树声明 0 组（`FSDNodeRegistry::ExclusionGroups`），机制已有合成数据测试 |
| 存档 | `USilentDepthSaveGame` + `USilentDepthSaveSubsystem` 已交付（临时槽 → 读回验证 → 正式槽）；设置/统计/语言段无生产者与消费者 |
| 层阶门槛 | `tierGateRequiredUnlocked = 1`，零进度可研究 22 个（潜艇 5 / 武器 1 / 传感器 13 / 防御 2 / 推进 1），由 `TierGate.ShippedConfigMatchesDecision` 锁定 |

上表只记录可复现的实测值；未执行过的结论一律不出现在本文件中。

---

## 3. 前置决策

以下决策在对应任务开工前必须有记录。`DEC-003`、`DEC-005`、`DEC-006` 的当前状态见
`docs/UE4_TECH_TREE_DECISION_RECORD.md` §5，`DEC-008` 为本计划新增。

| 决策 ID | 主题 | 现状 | 影响的任务 | 建议 |
|---|---|---|---|---|
| `DEC-005` | 是否允许 `GAMEPLAY` 标记的推测配发 | OPEN | P3 的配装界面 | 允许，但 UI 与数据必须与现实资料明确区分；不批准则防御矩阵 1935/2430 行无法进入配装候选 |
| `DEC-006` | Windows UE4.27 验收环境与目标硬件 | OPEN | 全部 `EDITOR VERIFIED` 与性能任务 | 环境部分已有事实可答（UE4.27.2 + 本工作站）；目标硬件基线仍为 OPEN，未采样前不得写性能结论 |
| `DEC-003` | 首批潜艇生产顺序 | OPEN | P5 之后的内容扩产（Batch A） | 本阶段不启动 Batch A，可继续挂起 |
| `DEC-008` | 候选互斥的规则来源 | **已决定（2026-09-12）** | P2、P3 的冲突反馈 | 取「同一平台同一 socket 容量 1 即互斥」；见决策记录 §6 |
| `DEC-009` | 防御矩阵 270 行 family-only 的处置 | **已决定（2026-09-12）** | P1、`UI-002` 的"无对应装备"状态 | 记为能力层数据；`CN_PJ_Type093B` 保留为待产出声明；见决策记录 §7 |

`DEC-008` 落地时写入 `docs/UE4_TECH_TREE_DECISION_RECORD.md`，与本文件保持单向引用：
本文件指向决策记录，决策记录不复述本文件。

---

## 4. 任务分解

### 4.1 P1 · `DATA-005` 剩余项：防御矩阵 270 行 family-only

**现状**：防御兼容矩阵 2430 行里有 270 行只有 family、`asset_id` 为空，分布
`THREAT_WARNING` 216 行、`DECOY` 54 行；兼容级别为 `GAMEPLAY` 250 行、
`UNKNOWN` 15 行、`INCOMPATIBLE` 5 行。加载器当前跳过这些行并计入数据通告
（`Core/TechTree/TechTreeCompatibilityLoaders.cpp`），配装查询因此失败关闭。
（本节「交付记录」是这条现状的处置结果。）

**待定规则**（三选一，需负责人拍板并写入决策记录）：

| 选项 | 做法 | 代价 |
|---|---|---|
| A（建议） | family 视为能力层，不产出可装备候选；UI 显示「该能力无对应装备」 | 需要区分「能力」与「装备」两类节点行 |
| B | family 继承所属 branch 的默认 `asset_id`，变成可装备项 | 会造出现实中不存在的装备，与 `DEC-001` 的 A/B 类边界冲突 |
| C | 保持跳过，仅保留计数并写入已知未决 | 科技树长期存在 270 行沉默数据 |

**同批处理**：推进矩阵的悬空引用 `CN_PJ_Type093B` 必须显式二选一——在资产库补齐
条目，或从矩阵删除；不允许继续以通告形式存在而不记录处置结论。

**工作项**

1. 在决策记录中固化 270 行的处置规则与 `CN_PJ_Type093B` 的处置结论。
2. 按规则改生成器或加载器，并为每类处置加断言。
3. 同步运行时副本，核对哈希清单。

**验收**：`npm run check:runtime-data` 无漂移；UE Automation 通过；数据通告数从
当前 2 条降到 0，或在测试中锁死新的确定数字；270 行不再处于「未定义」状态。

**交付记录（2026-09-12）**：采用选项 A，并新增决策 `DEC-009`（270 行 = 5 个 family ×
54 个平台，`GAMEPLAY` 250 / `UNKNOWN` 15 / `INCOMPATIBLE` 5）。

| 改动 | 位置 |
|---|---|
| 270 行改为能力层，进独立的 `FSDTechTree::FamilyCapabilities`；不再产生通告 | `TechTreeCompatibilityLoaders.cpp`、`TechTreeTypes.h` |
| 装备服务暴露能力层查询，且不进入候选索引 | `TechTreeEquipmentService.h/.cpp` |
| `CN_PJ_Type093B`：保留为待产出声明，通告由测试锁定必须指名 | `TechTreeEquipmentServiceTests.cpp` |

通告数 2 → 1。**标签**：`TESTED`（UBT `BUILD VERIFIED` + UE Automation 51/51，EXIT CODE 0）。
本项不产生 `EDITOR VERIFIED`。

---

### 4.2 P2 · 互斥规则（新增 `DEC-008`）

**现状**：互斥在系统里有两个互不相干的层面，必须先分辨，否则会同时出现两套语义。

| 层面 | 载体 | 现状 |
|---|---|---|
| 节点级互斥 | `FSDNodeRegistry::ExclusionGroups`，服务于解锁服务 | 机制已实现并有合成测试，五棵树 0 组声明 |
| 装位级冲突 | 同一 socket 上的多个槽位候选互替 | 数据里已存在事实，但 `FSDEquipmentSlot` 没有容量字段，无法表达 |

**装位级冲突的事实来源**：防御 loadout 中 `SOCKET_COUNTERMEASURE_02` 同时被
`DECOY` 与 `NOISE_MAKER` 两个槽占用（54 艘，108 行）；`SOCKET_EW_MAST`、
`SOCKET_EW_ANTENNA`、`SOCKET_COUNTERMEASURE_01`、`SOCKET_DECOY_LAUNCHER_01`、
`SOCKET_DECOY_LAUNCHER_02` 每艘只被一个槽占用。

**待定规则**：

| 选项 | 做法 | 取舍 |
|---|---|---|
| 1（建议） | 新增 socket 容量字段，容量 1 即互斥；数据来源为矩阵中同一 socket 的槽集合 | 可推广到鱼雷管、VLS，表达力最强 |
| 2 | 把共用 socket 的多个槽合并为一个槽位候选集 | 界面更简单，但丢失槽位语义 |

**边界**：建议互斥只在装位级实现，节点级互斥组保持为空，直到出现真实用例。
两套语义同时启用会让 UI 与存档校验各判一次，且没有对应的数据来源。

**工作项**

1. 决策记录写入 `DEC-008`：规则、容量字段语义、与节点级互斥的关系。
2. 数据层补容量字段，并给现有矩阵加一致性断言（同一 platform+socket 的容量不低于槽数）。
3. 装备服务暴露「因互斥不可装」的判定，供配装界面与存档校验共用。
4. 加回归测试：容量 1 的 socket 上装配第二个候选必须被拒绝，且失败关闭。

**验收**：`RUNTIME TESTED`；UI-003 能显示冲突原因；存档校验能在载入时拒绝非法组合。

**交付记录（2026-09-12）**：采用选项 1，新增决策 `DEC-008`。

| 改动 | 位置 |
|---|---|
| 源数据：9 个槽位中 7 个带 socket 的槽位声明 `socket_capacity`，生成器校验同 socket 容量一致 | `SilentDepth_Assets/DefensiveSystems/Tools/sds_dataset.py`、`sds_build_compat.py` |
| 运行时：`FSDEquipmentSlot.SocketCapacity` + 加载校验 `INVALID_SOCKET_CAPACITY` | `TechTreeTypes.h`、`TechTreeCompatibilityLoaders.cpp` |
| 查询：`GetSlotSocketCapacity`、`FindSlot`、`CollectSocketPeers`、`CanMountTogether` | `TechTreeEquipmentService.h/.cpp` |
| 存档校验：按平台 + socket 统计占用，超容量报 `SOCKET_CAPACITY_EXCEEDED` | `TechTreeSave.cpp` |
| 顺带修复：矩阵记录对防御/传感器按 socket 存、槽位查询按名字匹配的键不一致（此前防御配装的按槽查询与存档校验必然失败） | `TechTreeEquipmentService.cpp` |

**标签**：`TESTED`（UBT `BUILD VERIFIED` + UE Automation 51/51）。

---

### 4.3 P3 · UMG 控件层（`UI-001` ~ `UI-004`）

**现状**：`.umg` 资产 0 个，C++ `UUserWidget` 子类 0 个。数据层
（`FSDTechTreeViewModel`）已交付，控件层只需渲染。

原计划把本项判为「只能在编辑器里人工创作」，但环境核对后有一条尚未验证的自动化路径。

**第 0 步（spike，先行）**：用 `UE4Editor-Cmd.exe -run=pythonscript` 验证能否创建
`WidgetBlueprint` 并操作 `WidgetTree`。

| spike 结果 | 后续路线 |
|---|---|
| 成功 | 三个界面脚本化生成、入库、可 diff；人工只做视觉验收 |
| 失败 | 退化为 C++ `UUserWidget` 基类 + 编辑器人工搭建，并在执行计划中显式标注 `EDITOR REQUIRED` |

spike 结论必须记录在案，不得停留在口头判断。

**任务拆分**（与执行计划 §7 的验收标准一致）：

| ID | 交付物 | 关键验收 |
|---|---|---|
| `UI-001` | 科技树总览 | 五分类可切换；显示 Tier、成本、状态与依赖 |
| `UI-002` | 节点详情 | 区分已解锁 / 可研究 / 前置不足 / 互斥 / `DATABASE_ONLY` / 资料 `UNKNOWN` / 资产未验证；至少三个正交徽标 |
| `UI-003` | 潜艇配装界面 | 只能装入合法 socket；容量、冲突与兼容错误有明确反馈；`GAMEPLAY` 推测配发必须可见标注 |
| `UI-004` | 键鼠与窄屏检查 | 不改动既有游戏控制绑定；1080p 与窄窗口无重叠、截断或不可操作控件 |

**依赖**：`UI-003` 的冲突反馈依赖 P2 的 `DEC-008` 结论；`UI-002` 的「无外观」与
「资料不足」状态依赖 `DEC-001` 的分类边界（已决定，可直接实现）。

**验收**：UE Automation 通过；真实编辑器或截图证据；窄屏证据。
没有真实观测时只能标 `IMPLEMENTED` 或 `TESTED`，不得标 `EDITOR VERIFIED`。

**Spike 结论（2026-09-12，已执行）**：`tools/ue4/umg_probe.py` 用
`UE4Editor-Cmd.exe -run=pythonscript` 实测——`WidgetBlueprintFactory` 可创建并保存
资产，但 `unreal.WidgetTree` **不存在**，`WidgetBlueprint.widget_tree` 也不可读写，
因此 Python 只能生成空壳蓝图，无法填充控件树。所需控件类（CanvasPanel、VerticalBox、
ScrollBox、Button、TextBlock 等）齐全，缺的只是树。

**因此采用计划的退化路径，并把退化做到底**：控件树用 C++ 构建成真正的 UMG
（原生 `UUserWidget` 由引擎创建临时 `WidgetTree`，`RebuildWidget` 前自行填充），
不需要任何人工编辑器步骤；`.umg` 皮肤留作后续设计工作。

| 交付物 | 位置 |
|---|---|
| 通用屏幕基类（滚动容器、行、文本、渲染记录） | `UI/SDCodeWidgetBase.h/.cpp` |
| 科技树控件基类（状态/徽标/分类/关系的中文标签） | `UI/TechTree/SDTechTreeWidgetBase.h/.cpp` |
| `UI-001` 总览（五分类页签、层阶区段、节点行） | `UI/TechTree/SDTechTreeOverviewWidget.*` |
| `UI-002` 详情（状态、阻塞者、三个正交徽标、依赖、挂点） | `UI/TechTree/SDTechNodeDetailWidget.*` |
| `UI-003` 配装（槽位、容量、互斥、候选、游戏化标注、能力层、未产出声明） | `UI/TechTree/SDTechTreeLoadoutWidget.*` |

**标签**：`TESTED`（`SilentDepth.TechTree.Widgets.*` 4 项）。
`UI-004`（键鼠与窄屏）只做到结构层：所有行可聚焦、文本自动换行、外层滚动，
**没有** 1080p / 窄窗口的真实观测，因此不标 `EDITOR VERIFIED`。

spike 生成的空蓝图 `Content/SilentDepth/UI/WBP_SD_Probe.uasset` 未被任何屏幕引用，
保留仅作证据，可以随时删除。

---

### 4.4 P4 · 完整存档的设置/统计/语言段

**现状**：槽位层已交付并通过实机自检（临时槽 → 读回验证 → 正式槽）。
Web 侧 schema 已知（`unlockedMissions` / `bestScores` / `statistics` /
`settings{audio,video,input,app.language}`，语言 `zh|en|fr|ru`），但
**这些字段既没有生产者也没有消费者**，因此此前没有提前造结构。

**顺序**（按「先生成者、后消费者」排）：

1. 统计结算：`bestScores` 与 `statistics` 的唯一生产者。
2. 设置界面：`settings{audio,video,input}` 的生产者。
3. 语言段：`app.language`，依赖本地化资产落地，放最后。

**每段的统一步骤**：扩展 schema → 写迁移器 → 扩展指纹 → 读回自检 → 扩大
`-sd-save-selftest` 覆盖。旧存档必须能迁移或安全重建，篡改与未知 ID 不得进入运行时。

**验收**：`RUNTIME TESTED`；实机自检日志；失败关闭用例。

**交付记录（2026-09-12）**：存档文档升到 schema v2，三段一次补齐。

| 交付物 | 位置 | 说明 |
|---|---|---|
| 任务记录与统计结算（唯一生产者） | `Core/Save/SDMissionStats.h/.cpp` | `MissionsPlayed/Cleared/Failed/TotalScore/BestScore/LastMissionId`；清关按"该任务首次通关"计，重玩不重复计数 |
| 设置与语言 | `Core/Save/SDGameSettings.h/.cpp` | 音量 0–1、画质 0–3、渲染缩放 0.5–1.0、反舵、语言 `zh\|en\|fr\|ru`；`Validate` 只报错不修复 |
| 存档三段 + 迁移 + 指纹 | `Core/TechTree/TechTreeSave.h/.cpp` | v2 写入 `missions[]`/`statistics{}`/`settings{}`；v1 **迁移**（账号与配装保留，新段取默认值）；统计与记录不一致报 `STATISTICS_MISMATCH`；新段纳入签名 |
| 设置界面 | `UI/Settings/SDGameSettingsWidget.h/.cpp` | 显示取值、合法区间与语言令牌；非法值如实标红，不做自动修复（滑块/下拉是后续设计工作） |

**实机证据**（`-game -nullrhi -sd-save-selftest`）：

```text
LogSilentDepthSave: save self-test PASSED: slot round trip kept 150 point(s),
1 node(s), 1 loadout(s), 1 mission(s), best 860, language en
```

**标签**：`TESTED`（`SilentDepth.Save.*` 4 项 + 实机自检）。

---

### 4.5 P5 · `SOCKET-001` 与 Akula 垂直切片

**现状**：`DEC-002` 已授权「只改工作副本、母版只读」。本机没有 Blender 5.2.1，
几何与 Anchor 制作需在装有 Blender 的机器上执行。7 个 socket 的最小集、三层命名
规则（Blender Anchor `SOCKET_SUB_<HULL>_<PURPOSE>` / Assembly 逻辑 id / 资产库类别名）
已在决策记录 §3 定死。

**不依赖 Blender、现在就能做的部分**：

1. 实现 `FSDTechTree::Sockets`（逻辑挂点绑定）的加载与校验。
2. 用 Yasen `run-002` 已有的 Anchor 数据做夹具测试——该数据是
   `GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY`，**不得当作实测装备位置**，只用于结构验证。
3. 明确缺失 socket 时的失败关闭行为：不得猜测位置、不得回退到其他艇路径。

**依赖 Blender 的部分**：Akula 工作副本 → `30_ANCHORS` → 审计 `errorCount=0` →
staging 导出 → Assembly JSON → Windows 侧导入验收。母版保持只读，出错只需丢弃工作副本。

**后续（首个垂直切片）**：`SUB-001/002`、`WPN-001/002`、`SNS-001/002`、
`DEF-001/002`、`PROP-001/002`，以 `RU_SSN_Akula` 走通「解锁 → 购买 → 配装 → 保存 →
重载 → 任务内生效」。挂点未就位前，这些任务只能做到数据与规则层。

**验收**：socket 审计脚本通过；UE 侧导入检查记录标 `EDITOR VERIFIED`；
仿真侧改动必须有确定性与回归覆盖。

**交付记录（2026-09-12，Windows 侧）**：Blender 不在本机，几何部分仍未做；
可做的加载与校验部分已交付。

| 交付物 | 位置 | 说明 |
|---|---|---|
| 挂点绑定加载器 | `Core/TechTree/TechTreeSocketLoaders.cpp` | 读 Assembly 文档的 `sockets[]`；`assetId` 必须是潜艇节点，`purpose` 必须是装配 schema 声明的 9 个之一，`transform.translation/rotationDegrees` 必须是三个数 |
| 失败关闭 | 同上 | 文档被拒时**不留下任何绑定**（首版实现会留下部分绑定，测试抓到后改为先收集后追加） |
| 运行时数据 | `TechTree/Sockets/RU_SSN_Yasen_ASSEMBLY.json`（同步脚本新增第 20 个源） | Yasen 是当前唯一有 Assembly 文档的艇 |
| 方向与验证标记 | `FSDSocketBinding` | `bHasDirection` 只对发射类 purpose 为真（DEC-002 的 +X 规则）；`bEditorVerified` 恒为假——只有 UE 编辑器检查才能置真 |
| 未定义项 | 同上 | `RegistryCategory` 保持为空：Blender 文档不携带注册表令牌，purpose→令牌对照表属 DEF-002/SNS-002（DEC-002 §3.3.1），此处不臆造 |

**标签**：`TESTED`（`SilentDepth.TechTree.Sockets.*` 2 项）。**Akula socket 几何仍是
`NOT DONE`**：需要装有 Blender 的机器，Windows 侧只完成了导入前的接收与校验。

---

### 4.6 P6 · `DEC-007 = 1` 的手感验证

**现状**：门槛开启后零进度可研究 22 个节点（潜艇 5 / 武器 1 / 传感器 13 /
防御 2 / 推进 1），出厂值被 `TierGate.ShippedConfigMatchesDecision` 锁定。
这是设计决定，**没有真人试玩过**。

**要回答的问题**

1. 22 个开局节点是否足够形成有意义的选择，而不是唯一解？
2. 武器树只有 1 个可研究节点（115 条前置边的计算结果）是否太窄？
3. 每关约 600 RP 的产出，对上 T10 单价 1000，节奏是否成立？

**方法**

1. 先做可重复的 headless 门禁：固定 seed → 固定结算序列 → 固定解锁路径。
   Web 侧已有 `npm run sim` 与 `npm run playtest` 可复用；UE 侧需要等经济与结算接通。
2. 再做真人试玩，记录开局选择分布与卡点。

**验收**：headless 门禁可重复且结果一致。真人试玩未安排时，本项如实标注
`NOT VERIFIED`，不得把数值推演写成手感结论。要改这个设计决定，先改决策记录，
再动 `Config/SilentDepth/research_cost.json`。

**交付记录（2026-09-12）**：

| 交付物 | 位置 | 说明 |
|---|---|---|
| 可重复探针 | `Core/TechTree/TechTreeProbe.h/.cpp` | 固定五任务序列（700/750/800/600/650）→ 按 DEC-004 结算 → 每轮买"最便宜且规则允许"的节点，同价按 ID | 
| 门禁测试 | `Core/TechTree/TechTreeProbeTests.cpp` | 断言开局 22 个（5/1/13/2/1）、固定序列产出 600 点、两次运行完全相同（含账户指纹） |
| 人工可跑入口 | `-sd-techtree-probe`（`TechTreeSubsystem.cpp`） | 不进正常流程，只在显式传参时执行并打印一行结论 |

**实机证据**（`-game -nullrhi -sd-techtree-probe`）：

```text
LogSilentDepthTechTree: probe: 22 opening node(s) [submarine 5, weapon 1, sensor 13,
defensive 2, propulsion 1]; missions awarded 600 point(s), purchases 6 spent 600,
0 left, 6 unlocked, fingerprint 16219625101362846001
```

**标签**：`TESTED`。**真人手感仍是 `NOT VERIFIED`**：本机没有安排试玩，
上面的数字只说明规则自洽且可重复，不说明 22 个开局节点好玩。

---

## 5. 排序与关键路径

| 线 | 任务 | 外部依赖 |
|---|---|---|
| A | P1 数据收口 → P2 互斥规则 → P4 统计段 | 无，可立即开工 |
| B | P3 UMG（先做 spike） | UE 编辑器 |
| C | P5 几何侧 | Blender 机器；Windows 侧挂点加载可先行 |

关键路径：**决策（`DEC-005` / `DEC-006` / `DEC-008`）→ P3 UMG → Akula 垂直切片 → P6 手感验证**。

P1 与 P2 越早完成，P3 的配装界面越不容易返工：互斥规则未定时，`UI-003` 的冲突
反馈没有可显示的内容。

---

## 6. 验证门禁

每条任务交付前至少执行：

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Build\BatchFiles\Build.bat" SilentDepthUEEditor Win64 Development `
  -Project="C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" -WaitMutex

& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -ExecCmds="Automation RunTests SilentDepth;Quit" -unattended -nopause -nosplash -nullrhi -stdout
```

数据副本与资产管线相关改动额外执行：

```bash
npm run check:runtime-data
npm run check:asset-pipeline
```

UE C++ 与资产任务必须在 UE4.27 环境执行：UBT 编译、UE Automation Tests、
编辑器启动与数据加载失败场景。UI 任务还需要 1080p 与窄窗口的人工检查。

完成标签只用 `IMPLEMENTED` / `TESTED` / `EDITOR VERIFIED` /
`TARGET HARDWARE VERIFIED`，不得互相顶替。

---

## 7. 已知未验证项

| 事项 | 状态 |
|---|---|
| 目标硬件性能与显存 | `NOT VERIFIED`，`DEC-006` 未决，本机未做采样 |
| ~~UMG 脚本化生成可行性~~ | 已验证并否决：Python 能建资产、不能填控件树，见 §4.3 |
| `DEC-007 = 1` 的真人手感 | `NOT VERIFIED`：headless 门禁已交付（§4.6），仍无试玩记录 |
| Akula 装备 socket 几何 | 未制作，缺 Blender 环境（Windows 侧的加载与校验已交付） |
| Batch A 五艘的几何 | 已构建并导入（§8.4）；仅剩人工视觉验收 |
| ~~`DATA-005` 270 行处置规则~~ | 已定：`DEC-009`，P1 已交付 |
| ~~`DEC-008` 互斥规则~~ | 已定：`DEC-008`，P2 已交付 |
| 武器侧容量（鱼雷管数量与载荷分配） | 未建模，槽位暂无 socket 绑定，等 `WPN-001` |
| 设置界面的交互（滑块/下拉） | 未做：显示与校验已交付，编辑控件属设计工作 |
| `UI-004` 的 1080p / 窄屏实测 | `NOT VERIFIED`：只有结构层保证（换行、可聚焦、滚动） |
| 空蓝图 `Content/SilentDepth/UI/WBP_SD_Probe.uasset` | spike 证据，未被任何屏幕引用，可删除 |

---

## 8. 执行记录

### 8.1 2026-09-12 · P1 与 P2（并行线 A 第一段）

| 项 | 结果 |
|---|---|
| 决策 | 新增 `DEC-008`、`DEC-009`，写入 `docs/UE4_TECH_TREE_DECISION_RECORD.md` §6、§7 |
| 数据 | 资产库生成器更新（`sds_dataset.py`、`sds_build_compat.py`）并重新生成；`npm run check:runtime-data` 通过（19 个副本一致） |
| 代码 | 加载器、装备服务、存档校验更新；新增能力层集合与 socket 容量规则 |
| UBT 编译 | **BUILD VERIFIED**（无警告） |
| UE Automation | **TESTED**：51/51 通过，0 失败，EXIT CODE 0（新增 `SilentDepth.TechTree.Equipment.CapabilitiesAndOccupancy`） |
| Web 门禁 | `npm test` 779/779 通过（42 个文件） |
| 未覆盖 | `EDITOR VERIFIED` 与 `TARGET HARDWARE VERIFIED` 均未取得；本段没有编辑器或浏览器观察 |

本段未处理：`UI-003` 的冲突展示（属 P3）、武器侧容量模型（见 §7）。

### 8.2 2026-09-12 · P3、P4、P5（Windows 侧）、P6

| 项 | 结果 |
|---|---|
| UMG spike | 已执行：Python 可创建 `WidgetBlueprint` 资产、不可填充控件树；据此改用 C++ 构建 UMG 树 |
| P3 控件层 | `UI-001`~`UI-003` 三个屏幕 + 通用基类；4 项控件测试；`UI-004` 仅结构层 |
| P4 存档三段 | 存档 schema v2（统计/设置/语言）+ v1 迁移 + 指纹扩展 + 设置界面；实机 `-sd-save-selftest` 通过 |
| P5 Windows 侧 | 挂点绑定加载器 + Yasen Assembly 同步 + 失败关闭（含一处"部分应用"缺陷修复）；2 项测试 |
| P6 门禁 | 可重复探针 + 门禁测试 + `-sd-techtree-probe` 入口；实机输出 22 开局节点与 600 点结算 |
| UBT 编译 | **BUILD VERIFIED**（多轮增量编译，无警告） |
| UE Automation | **TESTED**：62/62 通过，0 失败，EXIT CODE 0 |
| 实机（`-game -nullrhi`） | 科技树加载、探针、存档自检三条日志全部取得 |
| 未覆盖 | `EDITOR VERIFIED`、`TARGET HARDWARE VERIFIED`、Blender 几何、真人试玩 |

本段发现的既有缺陷（已修）：矩阵按 socket 存、槽位按名字查导致防御配装的按槽查询与
存档校验必然失败（P2）；挂点文档被拒时留下部分绑定（P5）。

### 8.3 2026-09-12 · 后续批次（SUB/WPN/SNS/DEF/PROP/DEF-002/SNS-002/资产导入）

计划文档之外，执行计划 §8「首个垂直切片」与 §9「资产导入」按顺序推进如下。

| 任务 | 交付 | 标签 |
|---|---|---|
| `SUB-001` | 硬编码 Akula 已移除：`Config/SilentDepth/platform_assets.json` 把潜艇节点映射到已导入资产，`ASubmarinePawn` 按存档 `selectedPlatform` 解析，缺失部件隐藏、缺失平台走**具名回退**（`bUsedFallback`）；存档新增 `selectedPlatform`（必须是已解锁潜艇） | `TESTED` |
| `SUB-002` | 平台发射接口（`FSDLaunchInterface`）从武器 loadout 清单读取：鱼雷管 / 垂发单元 / SLBM 管 / 载荷模块 / 挂点种类，进入 `FSDSubmarineState.TorpedoCount` | `TESTED` |
| `WPN-001` | 配装行新增 `count`（已装弹药数）；`PAYLOAD_CAPACITY_EXCEEDED` 按平台+槽位校验弹药总量；数据未声明容量时不设限（缺失数字不等于禁止） | `TESTED` |
| `PROP-001` | `SubmarineStep` 新增推进效果重载：噪声偏移 / 加速度 / 航速 / 电池倍率；中性效果严格等于旧行为（有测试锁定） | `TESTED` |
| `DEF-001` | 已装防御节点 → 诱饵加成与 ESM / 告警 / 鱼雷防御标志；诱饵数进入 `SimState.DecoyCount` | `TESTED`（能力层；消费方待 AI 移植） |
| `SNS-001` | 已装传感器节点 → 被动距离 / 精度 / 主动距离 / 冷却 / 处理倍率（只读能力输出） | `TESTED`（同上，仿真尚未消费） |
| `DEF-002` / `SNS-002` | `Config/SilentDepth/socket_map.json` 把逻辑挂点（或 purpose）映射到注册表令牌；未映射的挂点**不给令牌**并报 `MISSING_SOCKET_REGISTRY_CATEGORY` 通告 | `TESTED` |
| `UEASSET-001/002/003` | `tools/ue4/import_asset_library.py` 导入 120 武器 + 39 传感器 + 13 防御资产，每个 4 级 LOD + BOX 简单碰撞；报告见 `reports/ue4-asset-import/` | **IMPORTED 172/172**；人工视觉验收 `NOT VERIFIED` |
| `DEC-010` | 装备效果数值来源：初版可玩值集中在 `equipment_effects.json`，只有四项进权威仿真 | 已记录 |

本段没有取得：`EDITOR VERIFIED`（未在编辑器里看过导入结果）、`TARGET HARDWARE VERIFIED`、
Blender 几何、真人试玩。

### 8.4 2026-09-13 · Batch A 生产工单

`DEC-003` 已决定取 Batch A（Los Angeles、Virginia、Seawolf、Astute、Suffren），
工单见 `docs/UE4_BATCH_A_WORK_ORDER.md`。核对结果：

| 项 | 状态 |
|---|---|
| 五艘的科技树节点 | 已存在（`PLANNED`，T6/T9/T8/T9/T9） |
| 武器 / 防御 / 传感器 / 推进兼容行 | 已齐（每艘 2–3 武器槽、9 防御槽、13 传感器行、1 推进行） |
| 参考材料（REFERENCE / 参考图 / provenance） | 已齐 |
| 每艘的批次歧义 | **由武器数据锁定**，不需再拍板：洛杉矶＝Flight II/688i、弗吉尼亚＝Block I-II（115 m）、海狼＝SSN-21/22（108 m） |
| 几何母版与下游产物（母版/LOD/碰撞/锚点/规格/校验/清单） | **已完成**（Blender 5.2.1）：五艘各 11 项产物齐全 |
| 清单 / UE 导入 / 平台资产登记 | **已完成**：`PLANNED 46 / VALIDATING 8`；每艘 4 级 LOD + 5 部件 + 6 材质实例；`platform_assets.json` 3 → 8 条并带部件枢轴 |
| 待确认的数据冲突 | Seawolf 管径：参考文档 673 mm vs 武器清单 660 mm（当前按清单） |
| 视觉与编辑器验收 | **NOT VERIFIED**：预览图已渲染，尚未有人查看 |

状态：几何、登记、导入全部完成并 `TESTED`（UE Automation 70/70、实机启动正常）；
`EDITOR VERIFIED` 待人工看预览与编辑器。

---

## 9. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-09-12 | 建立本文件；把执行计划 §12 的六项展开为 P1–P6，补 `DEC-008`，记录环境与数据实测 |
| 2026-09-12 | P1、P2 交付：新增 `DEC-008`（socket 容量互斥）与 `DEC-009`（270 行记为能力层）；UBT 编译通过，UE Automation 51/51 EXIT CODE 0 |
| 2026-09-12 | P3–P6 交付：C++ UMG 控件层（spike 否决 Python 路径）、存档 schema v2（统计/设置/语言 + v1 迁移）、挂点绑定加载（Windows 侧）、`DEC-007` 探针门禁；UE Automation 62/62 EXIT CODE 0 |
| 2026-09-12 | 后续批次：`SUB-001/002`、`WPN-001`（含配装 `count` 与载荷容量）、`PROP-001`/`DEF-001`/`SNS-001`（`DEC-010` 初版可玩值）、`DEF-002`/`SNS-002`（socket_map）、`UEASSET-001/002/003`（172 个资产导入） |
