# SILENT DEPTH UE4 五类科技树统一运行时 Schema

| 字段 | 内容 |
|---|---|
| 任务 | `DATA-001`（`docs/UE4_TECH_TREE_EXECUTION_PLAN.md` §5） |
| 文档状态 | ACTIVE |
| 基线日期 | 2026-09-11 |
| 目标分支 | `ue4` |
| Schema 版本 | 3（`SDTechTree::SchemaVersion`） |
| 代码 | `ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/` |
| 运行时数据 | `ue4/SilentDepthUE/Config/SilentDepth/TechTree/`（16 个文档）；哈希清单 `Config/SilentDepth/_sync_manifest.json`（19 项） |
| 研究经济数值 | `ue4/SilentDepthUE/Config/SilentDepth/research_cost.json`（DEC-004，手写配置） |
| 数据同步 | `npm run sync:runtime-data` / `npm run check:runtime-data` |
| 验证 | BUILD VERIFIED（UBT）+ TESTED（UE Automation 50/50） |

本文件定义五类科技树在 UE4 运行时里的**唯一**数据模型。它是 `TECH-001`
（加载器）、`TECH-002`（节点模型）、`TECH-005`（装备兼容）、`SAVE-001`
（存档 schema）和 `UI-001`（科技树界面）的共同契约。

---

## 1. 为什么需要这一层

五套科技树由五个互相独立的生成器写出来，同一件事在不同文件里有不同写法：

```text
层阶    "T3"（传感器树）  ·  3（推进树）  ·  "tier_index": 3（同一条传感器记录里）
状态    `status` 一个名字承载三种互不相干的意思
优先级  asset_priority 里混进了 DATABASE_ONLY
```

直接把 JSON 摊平进运行时，等于让三种语义共用一个字符串字段，任何一处生成器
漂移都会静默改变玩法。本 schema 的做法是：**把轴拆开命名，把未声明的取值判为
加载错误**。

---

## 2. 轴分解（本文件的核心）

### 2.1 `status` 一族

| 源字段 | 所在文件 | 语义轴 | 类型 |
|---|---|---|---|
| `status` | `Manifest/submarine_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `asset_status` | `TechnologyTree/tier_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `asset_status` | `Weapons/Manifest/weapon_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `status_by_weapon` | `Weapons/Manifest/weapon_production_queue.json` | 生产阶段 | `ESDProductionStatus` |
| `asset_status` | `Sensors/Manifest/sensor_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `status` | `DefensiveSystems/Manifest/defensive_system_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `status` | `Propulsion/Manifest/propulsion_manifest.json` | 生产阶段 | `ESDProductionStatus` |
| `status` | `Propulsion/Manifest/propulsor_specs.json` | 生产阶段 | `ESDProductionStatus` |
| `asset_policy` | `Propulsion/TechnologyTree/propulsion_technology_tree.json` | 生产阶段 | `ESDProductionStatus` |
| `status` | `Weapons/Manifest/weapon_manifest.json` | **现实服役状态** | `ESDServiceStatus` |
| `status` | `Sensors/Manifest/sensor_manifest.json` | **现实服役状态** | `ESDServiceStatus` |
| `status` | `Sensors/Manifest/submarine_sensor_compatibility.json` | **兼容关系** | `ESDCompatibility` |
| `compatibility` | `Weapons/Manifest/weapon_submarine_compatibility.json` | **兼容关系** | `ESDCompatibility` |
| `compatibility` / `status` | `DefensiveSystems/Manifest/submarine_defensive_compatibility.json` | **兼容关系** | `ESDCompatibility` |

三轴分开之后，`GAMEPLAY` 与 `PLANNED` 在不同轴上不再互相污染：一个条目可以同时
是"生产阶段 `PLANNED` + 服役状态 `GAMEPLAY`"。

### 2.2 其余轴

| 源字段 | 语义轴 | 类型 |
|---|---|---|
| `confidence`（武器、传感器） | 证据等级 | `ESDEvidenceLevel` |
| `verification_status`（推进） | 证据等级 | `ESDEvidenceLevel` |
| `verification`（传感器） | 核验等级 | `ESDVerificationLevel` |
| `asset_priority` / `priority` | 排序优先级 | `ESDPriority` |
| `coverage`（推进） | 是否有几何 | `ESDAssetCoverage` |
| `source`（传感器树） | 规格来源还是游戏自造 | `ESDSourceKind` |
| `tier` / `tier_index` | 层阶 | `ESDTechTier`（只允许 T1–T10） |

---

## 3. 枚举取值

取值来自实测，不是推测。`ToString()` 输出源数据里的原始拼写，`ParseX()` 只接受
这些 token（大小写不敏感），未声明的取值返回 `false`，调用方必须当作加载错误。

| 枚举 | 取值 |
|---|---|
| `ESDTechCategory` | `SUBMARINE` `WEAPON` `SENSOR` `DEFENSIVE` `PROPULSION` |
| `ESDTechTier` | `T1`–`T10`；解析同时接受 `"T3"` 与 `"3"` 两种写法 |
| `ESDProductionStatus` | `UNKNOWN` `PLANNED` `RESEARCH` `REFERENCE` `BLOCKOUT` `MODELING` `DETAILING` `TEXTURING` `LOD` `COLLISION` `EXPORT` `IMPLEMENTING` `VALIDATING` `COMPLETE` `FAILED` `BLOCKED` `DATABASE_ONLY` `PARTIAL` |
| `ESDServiceStatus` | `UNKNOWN` `PLANNED` `GAMEPLAY` `IN_SERVICE` `ACTIVE` `HISTORICAL` `RETIRED` |
| `ESDCompatibility` | `UNKNOWN` `INCOMPATIBLE` `GAMEPLAY` `PROBABLE` `CONFIRMED` |
| `ESDEvidenceLevel` | `UNKNOWN` `GAMEPLAY` `ESTIMATED` `REPORTED` `PUBLIC` `PROBABLE` `CONFIRMED` |
| `ESDVerificationLevel` | `unknown` `unverified` `gameplay-only` `research-reviewed` `research-verified` |
| `ESDPriority` | `UNKNOWN` `LOW` `MEDIUM` `HIGH` |
| `ESDAssetCoverage` | `UNKNOWN` `DATABASE_ONLY` `3D_ASSET` |
| `ESDSourceKind` | `UNKNOWN` `spec` `gameplay` |

### 3.1 分类证据词表

同一个 token 在这一棵树合法、在另一棵树就是数据缺陷。`IsEvidenceAllowedFor()`
把这条规则写进代码：

| 类别 | 允许的证据等级 |
|---|---|
| 潜艇 | （无该字段） |
| 武器 | `ESTIMATED` `PUBLIC` |
| 传感器 | `GAMEPLAY` `PROBABLE` `CONFIRMED` |
| 防御 | （无该字段） |
| 推进 | `REPORTED` `CONFIRMED` |

`IsProductionStatusAllowedFor()` 同理：完整生产线词表只属于武器，
其余四类只允许 `PLANNED` `IMPLEMENTING` `VALIDATING` `COMPLETE` `FAILED`
`BLOCKED` `DATABASE_ONLY`（潜艇另允许 `RESEARCH`，不允许 `DATABASE_ONLY`）。

---

## 4. 数据模型

三层结构，全部在 `TechTreeTypes.h`：

```text
FSDTechTree
├── Nodes[]          FSDTechNode          节点：身份 / 层阶 / 前置 / 状态 / 资产引用 / 挂点
├── Compatibility[]  FSDCompatibilityRecord 平台 ↔ 候选装备的关系矩阵
├── Slots[]          FSDEquipmentSlot     平台上的安装位
├── Sockets[]        FSDSocketBinding     母版导出的逻辑挂点（DEC-002 三层命名）
└── Tiers[]          FSDTierDefinition    十个层阶的公开标签
```

`FSDTechNode` 的关键字段：

| 字段 | 说明 |
|---|---|
| `Id` | 全局唯一标识；重复即加载失败 |
| `Category` + `Tier` | 类型化归类，不存在"未知层阶" |
| `Production` / `Service` / `Evidence` / `Priority` | 四条轴各自独立 |
| `bDatabaseOnly` | DEC-001 的 DATABASE_ONLY 标记 |
| `Unlock.PrerequisiteNodeIds` | **唯一权威**的前置边；`PreviousNodeId` 与两个 note 字段只是资料，不参与裁决 |
| `Asset` | 资产引用：母版、LOD0–3、碰撞、SPEC、预览、UE 包路径、LOD 数、三角数 |
| `SocketNames` | 该节点可挂载的注册表挂点名 |
| `Detail` | 分类载荷（潜艇 / 武器 / 传感器 / 防御 / 推进），由 `Category` 判别 |

**兼容关系只存一份。** `FSDEquipmentSlot` 不复制允许列表，允许集合由
`Compatibility` 矩阵按 `IsEquippable()` 推导，避免出现第二个权威来源。

### 4.1 v2 的三处调整

| 变更 | 原因 |
|---|---|
| `FSDTierDefinition` 增加 `Category` | 层阶语义按树不同：T8 在武器树是"现代先进武器"，在推进树是"现代泵喷"。五棵树各发布自己的 T1–T10，共 50 行 |
| `FSDTechAssetRef` 增加 `AssetDir` | 传感器与防御资产用文件夹而非单文件引用（如 `Active/GEN_SONAR_ACT_T3`、`ESM/US_EW_ESM_GENERIC`） |
| `FSDDefensiveDetail` 增加 `PrerequisiteFamilyIds` | 防御树的前置写在 **family id 空间**，不能当作节点前置参与解析，否则会误报悬空 |

### 4.2 只读节点注册表（TECH-002）

`FSDNodeRegistry`（`TechTreeNodeRegistry.h/.cpp`）是对已验证 `FSDTechTree` 的只读查询层，
研究、解锁与 UI 都从这里取数：

| 能力 | 接口 |
|---|---|
| 按 ID 查找 / 全量遍历 | `Find` / `All`（按 ID 序） |
| 按类别、按层阶遍历 | `CollectByCategory` / `CollectByTier` |
| 前置与反向依赖 | `GetPrerequisites` / `GetDependents`（均为 ID 序） |
| 互斥组 | `GetExclusionGroup` / `NumExclusionGroups` |
| 可安装挂点 | `GetSocketNames` |
| 研究顺序 | `GetTopologicalOrder` |
| 成本（DEC-004） | `GetCost` / `GetCostForTier` / `HasCostRule` |
| 显示元数据 | 直接读节点字段（名称、中文名、国家、年代、角色、资产引用、生产状态） |

保证：

1. **只读**：注册表不修改树，也不持有可变引用。
2. **确定性**：所有数组按 ID 序；拓扑序用 Kahn 算法 + 按 ID 排序的就绪队列，
   同一棵树永远得到同一顺序，不依赖 `TMap` 遍历顺序。
3. **失败关闭**：树违反不变量、成本规则无效、互斥指向不存在的节点、
   存在环、节点落入两个冲突的互斥组，都会让注册表保持未初始化（`Num()` 为 0）。
4. **成本来自配置**：规则由 `LoadResearchCostRule` 从
   `Config/SilentDepth/research_cost.json` 读取；文件缺失或数值非法即加载失败，
   不会退化成"整棵树免费"。
5. **生命周期**：注册表借用树的节点指针，树必须先于注册表存在且此后不再移动；
   子系统里的构建顺序即按此约束排列。

尚未接入的部分（`TECH-005`）：平台↔候选装备的兼容矩阵、安装位容量与配装校验。
本注册表只暴露"这个节点能挂到哪些挂点"，不判断"能不能装到某艘艇上"。

**当前数据事实：五棵树都没有声明互斥关系**（`GetExclusionGroup` 一律为空，
`NumExclusionGroups()` 为 0）。这不是遗漏：`variant_of` 在武器里是自指的
（124 条中 123 条指向自己），根 `Manifest/variants.json` 描述的是网格复用而非玩法互斥，
所以没有任何可读的互斥来源。机制已实现并有合成数据测试覆盖，实际互斥关系等
`TECH-005` 的安装位矩阵给出（同一平台同一安装位上的候选互为替代）。

### 4.3 确定性解锁服务（TECH-003）

`FSDUnlockService`（`TechTreeUnlockService.h/.cpp`）把注册表变成研究状态推导：
给定"已解锁哪些节点"和"手上有多少研究点"，输出每个节点的状态。

| 能力 | 接口 |
|---|---|
| 单节点状态 | `GetState` → `Unlocked` / `Available` / `PrerequisiteLocked` / `Excluded` / `TierLocked` / `Unknown` |
| 全量评估 | `EvaluateAll`（按注册表 ID 序输出 `FSDNodeStatus`，含成本与可负担标记） |
| 结构解锁 | `ApplyUnlock`（纯函数：返回新进度，不修改输入） |
| 进度规范化 | `NormalizeProgress`（排序 + 去重，**不丢弃未知 ID**） |
| 存档校验 | `ValidateProgress` → `UNKNOWN_NODE_IN_PROGRESS` |
| 可负担判定 | `CanAfford`（只读，不扣点） |
| 状态指纹 | `ComputeSignature`（FNV-1a 64，用于存档/回放/测试对比漂移） |

确定性保证：

1. 无 Actor、无 World、无 `DeltaSeconds`、无墙钟、无随机数、无隐藏状态；
2. 所有迭代走注册表的 ID 序数组，判定只用集合做成员查询，不依赖遍历顺序；
3. 解锁列表的顺序与重复不影响结果（同一成员集合 → 同一指纹）；
4. 失败时进度保持原值（`ApplyUnlock` 先赋值再判定，失败即返回输入副本）。

**边界**：钱包属于 `TECH-004`。研究点在这里只是入参，服务从不扣点；
`FSDUnlockProgress` 只存结构。`TECH-004` 用 `CanAfford` + `ApplyUnlock`
组合出原子购买事务。

实测（真实数据，空进度 + 0 研究点，含 `DEC-007` 的层阶门槛）：

| 状态 | 数量 | 说明 |
|---|---|---|
| `Available` | 22 | 各类别最低非空层阶开放的部分 |
| `PrerequisiteLocked` | 115 | 全部来自武器链 |
| `TierLocked` | 224 | 层阶门槛拦下的节点 |
| `Unlocked` | 0 | 空存档 |

`US_TORP_Mk18` 的阻断者精确指向 `US_TORP_Mk14`；两次独立构建的指纹一致，
研究点变化会改变指纹（钱包是入参，不是隐藏状态）。

### 4.4 研究钱包与购买事务（TECH-004）

`FSDResearchAccountService`（`TechTreeResearchAccount.h/.cpp`）持有钱包规则并执行事务。
`FSDResearchAccount` 是**存档数据**：研究点余额、已解锁节点、已领取首次通关奖励的任务 ID。

| 能力 | 接口 |
|---|---|
| 原子购买 | `TryPurchase` → `Purchased` / `UnknownNode` / `AlreadyUnlocked` / `PrerequisiteLocked` / `Excluded` / `InsufficientPoints` / `NotInitialized` |
| 无副作用预览 | `PreviewPurchase`（同样的判定，不改账户） |
| DEC-004 结算 | `AwardMissionResult` → `score / ScoreDivisor`，首次通关加 `FirstClearBonus` |
| 直接发放 | `GrantPoints` |
| 存档校验 | `ValidateAccount` → `NEGATIVE_BALANCE` / `UNKNOWN_NODE_IN_PROGRESS` / `DUPLICATE_NODE_IN_PROGRESS` / `DUPLICATE_FIRST_CLEAR` / `EMPTY_MISSION_ID` |
| 账户指纹 | `ComputeAccountSignature`（节点状态 + 余额 + 首次通关集合） |

原子性实现：所有前置条件检查在提交之前完成，成功时先构造候选账户、再一次性赋值；
任何拒绝路径（含"余额不足"）都让调用方账户保持逐位不变——测试用账户指纹对每条失败路径
逐个断言。

判定顺序：**先结构规则、后余额**。所以一个前置未满足的节点报告它的前置，
而不是报价格；一个已研究的节点报 `AlreadyUnlocked`，绝不重复扣费。

结算规则的两个细节：

1. 分数低于 `MinimumScoreForReward` 产出 0 点，且**不记录**首次通关，
   所以该奖励仍然保留给之后真正通关的那一次；
2. `FirstClearMissionIds` 只影响奖励，不参与任何玩法判定。

### 4.5 科技树存档（SAVE-001 / SAVE-002）

`TechTreeSave.h/.cpp` 定义带版本号的存档文档，JSON 序列化，读入时严格校验。

```json
{
  "schema": "silent-depth-save-v2",
  "version": 2,
  "researchPoints": 150,
  "unlockedNodeIds": ["US_TORP_Mk14"],
  "firstClearMissionIds": ["M02"],
  "loadouts": [
    { "platform": "RU_SSN_Akula", "slot": "TORPEDO", "candidate": "RU_TORP_UGST" }
  ],
  "missions": [
    { "mission": "M02", "bestScore": 860, "cleared": true }
  ],
  "statistics": {
    "missionsPlayed": 1, "missionsCleared": 1, "missionsFailed": 0,
    "totalScore": 860, "bestScore": 860, "lastMissionId": "M02"
  },
  "settings": {
    "audio": { "master": 1.0, "music": 0.7, "effects": 1.0 },
    "video": { "qualityPreset": 2, "resolutionScale": 1.0 },
    "input": { "invertRudder": false },
    "app": { "language": "zh" }
  },
  "signature": "12345678901234567890"
}
```

| 能力 | 接口 |
|---|---|
| 序列化 | `WriteSaveToJson` / `SaveTechTreeToFile`（数组按规范序，字节稳定） |
| 严格读入 | `ReadSaveFromJson` / `LoadTechTreeFromFile` |
| 校验 | `ValidateSaveData` |
| 指纹 | `ComputeSaveSignature`（账户 + 配装 + 任务记录 + 统计 + 设置） |
| 规范化 | `NormalizeSaveData`（排序、去重；任务按 ID 排序） |
| 统计生产者 | `Core/Save/SDMissionStats.h/.cpp`（唯一入口是"一个已结束的任务结果"） |
| 设置规则 | `Core/Save/SDGameSettings.h/.cpp`（区间与语言令牌的唯一定义处） |

文档是**整个会话存档**：账户、配装、任务记录与统计汇总、设置与语言。类型名保留
`FSDTechTreeSaveData`，因为槽位子系统与既有迁移路径都在用它。

版本策略：

| 情况 | 行为 |
|---|---|
| `version == 2` | 正常读入并逐项校验（含统计与设置） |
| `version == 1` | **迁移**：账户与配装保留，任务/统计/设置取默认值（旧版本从未记录它们，补一个分数比留空更假） |
| `version` 缺失或 `< 1` | **重建为空账号**，不猜测旧字段；结果版本为当前版本 |
| `version > 2` | 拒绝（`SAVE_VERSION_UNSUPPORTED`）——本构建无法解释未来字段 |

拒绝清单（SAVE-002 的"不会进入运行时"）：`SAVE_VERSION_UNSUPPORTED`、
`SAVE_SIGNATURE_MISMATCH`、`NEGATIVE_BALANCE`、`UNKNOWN_NODE_IN_PROGRESS`、
`DUPLICATE_NODE_IN_PROGRESS`、`UNKNOWN_PLATFORM`、`PLATFORM_NOT_SUBMARINE`、
`UNKNOWN_CANDIDATE`、`DUPLICATE_LOADOUT_SLOT`、`EMPTY_LOADOUT_FIELD`、
`EMPTY_MISSION_ID`、`DUPLICATE_MISSION_RECORD`、`STATISTICS_MISMATCH`、
`INVALID_SAVE_VALUE`、`INVALID_SETTINGS_VALUE`、`UNKNOWN_TOKEN`（语言）、
`MISSING_FIELD`、`INVALID_FIELD_TYPE`、`INVALID_JSON`、`MISSING_FILE`。

**统计与记录必须自洽**：`statistics.missionsCleared` 必须等于记录里 `cleared` 的数量，
`statistics.bestScore` 必须等于记录里的最高分，失败数不得超过游玩数。这条规则在
重算签名后依然生效——它是规则违例，不是"文件过期"。

**设置区间**：音量 0–1、画质预设 0–3、渲染缩放 0.5–1.0、语言 `zh|en|fr|ru`。
校验只报错不修复：非法值不会被悄悄夹到边界。

`signature` 是**篡改检测**而非安全边界：它能发现手工改动与文件损坏，
但能改文件的人同样能重算签名。校验顺序是「结构校验 → 签名比对」，
失败时调用方的数据结构保持默认值，不会部分应用。

### 4.6 存档槽位层与 JSON 互换（SAVE 收口）

`USilentDepthSaveGame`（`SilentDepthSaveGame.h`）是 UE 存档槽的载荷：一个
`FString` 装文档 + 两个用于廉价闸门的字段（schema id / version）。

`USilentDepthSaveSubsystem`（GameInstance 子系统）负责槽位 I/O，流程按迁移方案要求：

```text
写临时槽 → 读回并校验（含指纹比对）→ 写正式槽 → 读回并校验 → 删除临时槽
```

任何一步失败都不动正式槽，**没有经过读回验证的内容不会被提升为正式存档**。

同一子系统还提供文档级互换接口，供浏览器导入 / 导出与测试夹具使用：

| 接口 | 用途 |
|---|---|
| `SaveToSlot` / `LoadFromSlot` | 带临时槽与读回验证的槽位读写 |
| `ImportFromJson` / `ExportToJson` | 严格校验的 JSON 导入导出（同一份文档） |
| `DoesSlotExist` | 槽位存在性 |

验证：自动化测试跑不了这一层（worker 线程构造 UObject 会致命断言），因此加了一个
**命令行自检**——`-sd-save-selftest` 会在首个 tick 执行一次完整往返并写日志，
不传参数时完全不产生副作用。UE4.27 实机运行结果：

```text
LogSilentDepthSave: save self-test PASSED: slot round trip kept 150 point(s), 1 node(s), 1 loadout(s)
```

**仍未做**：完整存档的设置 / 统计 / 语言段（Web 侧 schema 为
`unlockedMissions` / `bestScores` / `statistics` / `settings{audio,video,input,app.language}`，
语言 `zh|en|fr|ru`）。这些字段目前没有任何生产者或消费者——设置界面与统计结算尚未实现——
所以没有提前造结构；等外壳任务落地时按同一份 Web schema 补齐即可。

### 4.7 装备兼容服务（TECH-005）

四份兼容矩阵与两份安装位定义随树一起加载，`FSDEquipmentService` 提供查询。

| 数据 | 条数 |
|---|---|
| 武器兼容 | 250 |
| 传感器兼容 | 702 |
| 防御兼容 | 2160 条装备关系 + 270 条能力层记录（原始 2430 行，其中 270 行只有 family 没有具体资产，见 `DEC-009`） |
| 推进兼容 | 65（11 条"已验证"声明 + 54 条游戏配发；其中 1 条声明指向未产出的资产，标记为 pending） |
| 安装位 | 604（武器 118 + 防御 486） |

判定规则：

| 关系 | Strict | AllowGameplay | 说明 |
|---|---|---|---|
| `Confirmed` / `Probable` | 可装备 | 可装备 | 有公开资料支撑 |
| `Gameplay` | 拒绝 | 可装备 | **必须显式开启**，`IsGameplayAssignment` 供 UI 标注 |
| `Unknown`（矩阵里没有这一行） | 拒绝 | 拒绝 | **未知绝不等于兼容** |
| `Incompatible` | 拒绝 | 拒绝 | 任何策略下都不放行 |

其余接口：`GetCompatibility`（按对，取最强证据）、`GetCompatibilityInSlot`（按槽）、
`CollectSlots`、`CollectCandidates`（按策略过滤、按 ID 序）、`FindRecord`、
`CollectFamilyCapabilities`、`FindSlot`、`GetSlotSocketCapacity`、
`CollectSocketPeers`、`CanMountTogether`。

**槽位到矩阵的键**：矩阵记录里的 `SlotName` 对武器是槽位名（`TORPEDO`），对传感器
与防御是挂点名（`SOCKET_COUNTERMEASURE_02`）。装备服务在解析槽位查询时先直接匹配，
再按该槽位声明的 `SocketName` 匹配，最后才落到通配记录——否则防御配装永远匹配不上
任何一行（此前 `ValidateSaveCompatibility` 对防御配装必然失败）。

**能力层（DEC-009）**：防御矩阵 270 行只有 family、没有产出资产（5 个 family × 54 个
平台，其中 `GAMEPLAY` 250 / `UNKNOWN` 15 / `INCOMPATIBLE` 5）。这些行记录的
是"平台具备该能力判定"，不是可装备项：它们进 `FSDTechTree::FamilyCapabilities`，
不参与候选索引，界面可显示"该能力无对应装备"，装配照旧失败关闭。

**socket 容量（DEC-008）**：带 socket 的槽位声明 `socket_capacity`——该挂点上可同时
被填的槽位数，同一平台同一 socket 的槽位必须声明相同值（生成器校验，加载器对缺失或
非法值报 `INVALID_SOCKET_CAPACITY`）。容量 1 且被多个槽位共用时，这些槽位互为替代：
当前只有 `SOCKET_COUNTERMEASURE_02`（`DECOY` + `NOISE_MAKER`）属于这种情况。
socket 为空的槽位是艇内设备，容量记为 0，不参与占用判定。节点级互斥组仍然为空。

**待产出资产（pending）**：推进矩阵的 `CN_SSN_Type093B` 声明"公开条目明确 093B 采用
泵喷"，但同时说明本库尚无对应 3D 资产——数据自己把这条记成了缺口。因此这类引用
**保留为记录并标记 `bAssetPending`**，而不是丢弃：界面可以显示这个判断，
`IsAssetPending` 供其标注，而 `IsEquippable` / `CollectCandidates` 一律排除它
（没有资产可装，失败关闭）。游戏配发字段（`game_plan_propulsor_id`）语义不同——
它描述玩家实际能装什么，因此指向不存在的资产仍然按缺陷处理。

**数据通告（Notices）**：加载报告区分 `Errors` 与 `Notices`。Notices 是必须可见
但不该让整棵树加载失败的数据状况，当前 **1 条**：`PENDING_COMPATIBILITY_ASSET`
（上述 `CN_PJ_Type093B`，由 `DEC-009` 保留并锁定）。防御矩阵 270 行不再产生通告——
它们已成能力层数据。

**存档联动**：`ValidateSaveCompatibility(Data, Equipment, Policy, Report)` 在结构校验
之后追加"这个槽位允不允许这件装备"的判定，不允许则报 `INCOMPATIBLE_LOADOUT`；
再按平台 + socket 统计已填槽位，超过容量则报 `SOCKET_CAPACITY_EXCEEDED`（DEC-008）。

---

## 5. 不变量与失败关闭

1. `SchemaVersion` 不匹配 → 加载失败，不做迁移猜测。
2. `Id` 重复或为空 → 加载失败。
3. 未声明的枚举 token → 加载失败，并给出**文件 + 字段 + 原值**三元组。
4. 前置节点指向不存在的 ID → 加载失败（跨树引用由 `DATA-005` 覆盖）。
5. `DATABASE_ONLY` 或 `UNKNOWN` 的生产阶段不算"有资产"（`IsAssetBacked()` 为假），
   但**不影响任何玩法数值**：表现层必须用程序化或通用回退，而不是报错或留空。
6. `UNKNOWN` 永不视为兼容；`GAMEPLAY` 是否可装备由显式策略参数
   `ESDEquipPolicy` 决定，`DEC-005` 未决之前不允许隐式默认为"可装备"。
7. 所有 ID 列表在加载后按**序数比较**（`ESearchCase::CaseSensitive`）排序。
   规则裁决不得依赖 `TMap`/`TSet` 遍历顺序，也不得依赖 `FName` 索引顺序——
   二者在不同运行之间不稳定，会破坏确定性。
8. 兼容矩阵按 `(PlatformId, CandidateId, SlotName)` 唯一；重复行是加载错误，
    因为排序比较器只有在键互不相同时才是严格全序。

第 1、2、4 条由 `ValidateTreeInvariants()` 实现，返回
`FSDTechTreeLoadReport`（错误码 `SCHEMA_VERSION` / `EMPTY_ID` / `DUPLICATE_ID` /
`MISSING_PREREQUISITE` / `MISSING_PREVIOUS_NODE`），并有专门测试覆盖。
该校验只用集合做成员查询、不参与遍历，因此不依赖排序是否已经执行。

---

## 6. 研究经济接口（DEC-004）

`FSDResearchCostRule` 把 DEC-004 的数值定义成**数据**而不是代码：

| 字段 | DEC-004 初值 |
|---|---|
| `PointsPerTier` | 100 |
| `FirstClearBonus` | 50 |
| `ScoreDivisor` | 10 |
| `MinimumScoreForReward` | 400 |

```text
节点成本      = PointsPerTier × Tier          （T1 = 100 … T10 = 1000）
任务结算产出  = Score / ScoreDivisor + 首次通关奖励   （Score < 400 时为 0）
```

结构体默认值故意无效（`IsValid()` 为假）：`TECH-004` 必须从平衡配置填充，
忘记加载会得到 0 而不是一棵免费的科技树。

### 6.1 层阶门槛（可选，默认关闭）

四棵树没有显式前置边（只有武器链有），所以从零进度可以直接研究 361 个节点里的
**246 个**。要表达"逐层解锁"就需要一条规则，而不是给每个节点编造前置关系——
那些关系在现实里并不存在。

`FSDTierGateRule`（同一个 `research_cost.json` 的 `tierGateRequiredUnlocked`）：
Tier N 的节点需要同类别、**下方最近的非空层阶**里已解锁 N 个节点。

两个设计细节：

1. **跳过空层阶**。潜艇目录没有 T1（从 T2 开始），照字面写"上一层"会让整棵潜艇树
   永久无解——这是实现前实测发现的死锁，不是理论担忧。
2. **需求被钳到该层阶的节点数**。配置写 99 也不会锁死：把该层阶全部研究完即可通过。

实测（`tierGateRequiredUnlocked = 1`，零进度）：

| 类别 | 开启后可研究 | 总数 |
|---|---|---|
| 潜艇 | 5 | 54 |
| 武器 | 1（其余受显式前置限制） | 124 |
| 传感器 | 13 | 150 |
| 防御 | 2 | 13 |
| 推进 | 1 | 20 |
| **合计** | **22** | **361** |

对照：关闭时为 246。可见这不是一次技术改动，而是一次开局体验的重构，
因此这个数字由项目负责人决定：**`DEC-007` 选定 1**，出厂配置即为 1，
并由 `TierGate.ShippedConfigMatchesDecision` 断言锁住——任何人改动都会让测试失败，
想调整必须先改决定记录。

规则实现为纯函数（`IsTierGateBlocking`）+ 解锁服务里的确定性计数，
不依赖遍历顺序；`TierGate.IsDeterministic` 用两套独立构建比对指纹。

---

## 7. 不在本 Schema 内

本 schema 只描述"研究什么、解锁什么、能装什么"。**仿真属性不在其中**：
艇体质量、叶片数、探测距离、噪声修正、武器伤害等，属于
`SUB-002` / `WPN-001` / `SNS-001` / `DEF-001` / `PROP-001`，必须各自以
强类型结构进入权威仿真。这里刻意不提供泛型属性包，避免"先塞进去以后再类型化"。

同样未建模的还有资料出处（`references` / `sources` / `research_notes`）与生成器
统计（三角数明细、文件哈希清单、预览图列表）。它们是溯源与生产元数据，不参与
运行时裁决，放在资产库里由 `asset_validator` 与 `DATA-*` 校验，不进入科技树运行时。

---

## 8. 验证证据

命令：

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Build\BatchFiles\Build.bat" SilentDepthUEEditor Win64 Development `
  -project="C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" -waitmutex

& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -ExecCmds="Automation RunTests SilentDepth;Quit" -unattended -nopause -nosplash -stdout
```

| 项 | 结果 |
|---|---|
| UBT 编译 | **BUILD VERIFIED**（新增 5 个编译单元 + 3 个头文件，无警告） |
| 全部 Automation | **TESTED**：16/16 通过，EXIT CODE 0 |
| 新增测试 | `Schema.EnumRoundTrip`、`Schema.TokenParsing`、`Schema.ResearchEconomy`、`Schema.TreeInvariants`、`Schema.SourceDataConformance` |
| 真实数据一致性 | 34 个扫描行 / **11,873 个 token 全部映射到已声明枚举** |
| 已知漂移 | `weapon_manifest.json` 与 `weapon_technology_tree.json` 的 `asset_priority` 共 **8** 条 `DATABASE_ONLY`（`DATA-003` 负责修） |
| 加载器 | `Loader.LoadsProjectData`、`Loader.RepeatedLoadIsIdentical`、`Loader.FailsClosed`、`Loader.TokenGuards`、`Loader.GraphGuards` 全部通过 |

一致性测试会拒绝"扫描行没匹配到任何 token"，因此源文件改名或字段移动会立刻失败，
不会静默变成零覆盖。扫描范围覆盖五棵树的清单文件（潜艇、武器、传感器、防御、推进）、
兼容矩阵，以及传感器/武器/防御/推进的科技树文件本身，包括防御树的
`tier_min`/`tier_max`/`game_tier_entered` 区间式层阶。

### 8.1 TECH-001 加载器

`TechTreeLoader` 只读 `Config/SilentDepth/TechTree/`，绝不读资产库：打包版本旁边没有
仓库，而同一份数据存在两个权威正是迁移明令禁止的（ADR-002 / DATA-002）。

权威方向自此固定为**资产库 → 运行时副本**：`SilentDepth_Assets/` 是唯一权威，
`Config/SilentDepth/` 下的一切都是生成物（含早期手工复制的三份），全部由
`tools/ue4/sync-tech-tree-data.mjs` 产出并登记 SHA-256 到
`Config/SilentDepth/_sync_manifest.json`。`npm run check:runtime-data` 逐项比对，
任何副本漂移都以非零退出码失败。

实测加载结果（`Loader.LoadsProjectData`）：

| 项 | 值 |
|---|---|
| 传感器节点 | 150（其中 140 有物理安装点，10 个声学处理节点没有） |
| 潜艇 / 武器 / 防御 / 推进节点 | 54 / 124 / 13 / 20 |
| 层阶行 | 50（五类 × T1–T10） |
| 武器前置边 | 115 条，全部可解析 |
| 重复加载 | 两次加载得到完全相同的节点序列 |

失败关闭用例（`Loader.FailsClosed`、`Loader.TokenGuards`、`Loader.GraphGuards`）：

| 场景 | 错误码 |
|---|---|
| 运行时目录缺失（五个类别各报一次） | `MISSING_FILE` |
| 必需数组缺失 | `MISSING_FIELD` |
| JSON 语法错误 | `INVALID_JSON` |
| 未声明的状态取值 | `UNKNOWN_TOKEN` |
| 取值合法但不属于该类别（如传感器的 `PARTIAL`） | `CATEGORY_TOKEN_MISMATCH` |
| 层阶超出 T1–T10 | `UNKNOWN_TOKEN` |
| 节点 id 缺失 | `MISSING_FIELD` |
| 同一文档 id 重复 | `DUPLICATE_ID` |
| 前置指向不存在的节点 | `MISSING_PREREQUISITE` |

任一错误都会让 `OutTree` 重置为空并返回 `false`，不会留下半个科技树。

启动接入：`USilentDepthTechTreeSubsystem`（`TechTreeSubsystem.h/.cpp`）在
GameInstance 初始化时加载一次并持有结果；失败时 `IsLoaded()` 为假、树被清空、
每个缺陷单独记录 Error 日志。UE4.27 实机运行（`-game -nullrhi`，地图
`Ocean_Main`）的日志确认加载发生在 World 进入 Play 之前：

```text
LogSilentDepthTechTree: technology trees loaded: 361 nodes, 50 tier rows, 115 prerequisite edges
```

---

### 8.3 测试覆盖矩阵（TECH-006）

44 个 Automation 测试，按 `TECH-006` 的验收项归类：

| 验收项 | 测试 |
|---|---|
| 加载 | `Loader.LoadsProjectData`、`Loader.RepeatedLoadIsIdentical`、`Schema.SourceDataConformance` |
| 拓扑排序 | `Registry.TopologicalOrder`、`Pipeline.IndependentLoadsAgree` |
| 循环依赖 | `Registry.DetectsCyclesAndExclusions`（自环 + 互指） |
| 解锁 | `Unlock.EvaluatesRealTreeDeterministically`、`Unlock.ProgressRules`、`Unlock.ExclusionsAndGuards` |
| 购买 | `Account.PurchaseFlow`、`Account.FailedPurchaseChangesNothing`、`Account.MissionSettlement`、`Account.ValidationAndGuards` |
| 兼容 | `Equipment.LoadsRealMatrices`、`Equipment.PolicyRules`、`Equipment.SlotQueries`、`Equipment.GuardsAndSaveIntegration` |
| 界面数据 | `ViewModel.TabsSummarizeCategories`、`ViewModel.RowsMatchTheRules`、`ViewModel.BadgesMatchData`、`ViewModel.DependenciesAndEquipment` |
| 失败关闭 | `Loader.FailsClosed`、`Loader.TokenGuards`、`Loader.GraphGuards`、`Save.RejectsTamperedContent`、`Save.RejectsInvalidContent`、`Save.Versioning`、`Save.FileGuards`、`Pipeline.FailureSurface` |
| 确定性 | 枚举/层阶往返、`Registry.RepeatedLoad`、`Unlock` 与 `Account` 指纹、`Save.RoundTrip` 字节一致、`Pipeline.EndToEndDeterminism` |
| 跨模块 | `Pipeline.SaveCapturesProgression`（存档边界前后进度等价）、`Equipment.GuardsAndSaveIntegration`（矩阵判定接入存档校验） |

失败面清单：模块共发出 **33 个错误码 + 3 个通告码**。其中 32 个错误码各有测试
正向触发；`UNKNOWN_CATEGORY` 不可达——类别枚举只有五个值，没有数据能选中该分支，
因此它是防御性代码而非可测路径。

`TECH-006` 新增的 4 个测试专门补上此前从未被正向触发的分支：
`CONFLICTING_EXCLUSION`（节点落入两个互斥组）、`INVALID_FIELD_TYPE`（存档字段类型错误）、
`SAVE_WRITE_FAILED`（路径不可写）、`MISSING_COMPATIBILITY_PLATFORM`（矩阵引用不存在的平台）。

**不在自动化范围内**：`USilentDepthSaveSubsystem` 的槽位 I/O 需要真实 GameInstance，
自动化测试跑在 worker 线程上，构造 UObject 会触发引擎致命断言（实测过）。
该层由命令行自检在真实引擎里验证，见 4.6。

### 8.4 界面数据层（UI-001 / UI-002）

`FSDTechTreeViewModel`（`TechTreeViewModel.h/.cpp`）是界面读取的唯一入口：把注册表、
解锁状态与兼容矩阵变成屏幕需要的行。放在纯 C++ 里的理由是显示规则可测——不需要
widget、不需要世界、不需要一帧。

| 输出 | 内容 |
|---|---|
| `FSDTechCategoryTab` | 五个分类入口，含总数 / 已解锁 / 可研究 / 锁定 / DATABASE_ONLY 计数 |
| `FSDTierRow` | 十个层阶区段，含公开标签与节点数 |
| `FSDNodeRow` | 节点行：名称、国家、年代、状态、成本、可负担、阻断者、依赖、挂点、三个徽标 |
| `FSDEquipmentRow` | 配装候选：兼容关系、是否可装、是否仅游戏化配发、成本、是否已解锁 |

显示规则（在模型里定，不在 widget 里定）：

1. 分类页签按枚举顺序，永不重排；
2. 节点行按 (层阶, ID) 排序，同一层阶区段连续；
3. 主状态直接来自解锁服务，因此"已解锁 / 可研究 / 买不起 / 前置不足 / 互斥"
   与真正决定研究资格的规则永远一致；
4. **徽标与状态正交**：`DATABASE_ONLY`、资料 UNKNOWN、资产未验证、仅游戏化配发
   都是独立标记——一个节点可以既"可研究"又"DATABASE_ONLY"；
5. 缺什么就标什么：没有资产、证据等级未知，都显示为徽标，而不是填一个看起来合理的值。

实测（空账号）：

| 项 | 值 |
|---|---|
| 武器节点行 | 124，按 (层阶, ID) 有序；层阶区段 10 个合计 124 |
| 武器可研究 / 前置不足 | 9 / 115，前置不足的每行都给出**具体**阻断节点 |
| "资产未验证"徽标 | 潜艇 54（`PLANNED`/`VALIDATING`）、武器 0（`DATA-003` 后全部 `COMPLETE`） |
| 传感器 `DATABASE_ONLY` 徽标 | 111 |

**控件层已交付（2026-09-12）**：`UI/SDCodeWidgetBase` + `UI/TechTree/*` 用 C++
构建真正的 UMG 树，`UI-001`/`UI-002`/`UI-003` 三个屏幕各有 Automation 测试。
headless 编辑器实测只能创建 `WidgetBlueprint` 资产、不能填充控件树，`.umg` 皮肤
仍需编辑器（`EDITOR REQUIRED`），但屏幕本身不再依赖它。

## 9. 已知未决与后续

| 事项 | 归属 |
|---|---|
| ~~`FSDTechTree::Sockets`（逻辑挂点绑定）的加载~~ | 已交付：`TechTreeSocketLoaders.cpp`（Windows 侧）；Akula 几何仍待 Blender |
| ~~互斥关系的真实来源~~ | 已定：`DEC-008`（socket 容量），见 §4 |
| 防御树的 family 层节点模型（当前节点取 13 个资产，45 个 family 只作为分层信息） | 待定 |
| ~~防御矩阵 270 行只有 family、没有具体资产~~ | 已定：`DEC-009`（记为能力层），见 §4 |
| 武器槽位没有 socket 绑定，鱼雷管数量与载荷分配未建模 | `WPN-001` |
| ~~UMG 控件层~~ | 已交付（C++ 构建 UMG）；`.umg` 皮肤与 `UI-004` 的窄屏/键鼠实测仍待编辑器 |
| ~~完整存档的设置/统计/语言段~~ | 已交付：存档 schema v2 + 统计生产者 + 设置界面（`UI/Settings`） |
| socket 的 purpose → 注册表令牌对照表 | `DEF-002` / `SNS-002`（DEC-002 §3.3.1）；在此之前 `RegistryCategory` 保持空 |

---

## 10. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-09-11 | 建立 schema v1；轴分解、枚举词表、不变量、DEC-004 经济接口；配套 4 个 Automation 测试 |
| 2026-09-11 | schema v2（层阶带类别、资产文件夹引用、防御前置 family）；TECH-001 加载器 + 运行时数据同步 + 5 个加载器测试 |
| 2026-09-11 | TECH-002 只读节点注册表（索引、反向依赖、互斥组、挂点、拓扑序、DEC-004 成本）+ 成本配置文件 + 4 个注册表测试 |
| 2026-09-11 | TECH-003 确定性解锁服务（状态推导、纯结构解锁、进度校验、FNV-1a 状态指纹）+ 3 个解锁测试 |
| 2026-09-11 | TECH-004 研究钱包与原子购买事务（购买结果区分、DEC-004 结算、账户校验与指纹）+ 4 个账户测试 |
| 2026-09-11 | SAVE-001/SAVE-002 科技树存档（版本化 JSON、迁移与拒绝策略、篡改指纹、配装校验）+ 5 个存档测试 |
| 2026-09-12 | TECH-005 装备兼容服务（四份矩阵 + 安装位加载、策略判定、数据通告通道、存档兼容校验）+ 4 个装备测试 |
| 2026-09-12 | TECH-006 跨模块测试层（端到端确定性、存档边界进度等价、独立加载一致、失败面补全）+ 4 个流水线测试；覆盖矩阵见 §8.3 |
| 2026-09-12 | UI-001/UI-002 界面数据层（分类页签、层阶区段、节点行、状态与徽标、依赖、配装候选）+ 4 个视图模型测试；UMG 控件层未做 |
| 2026-09-12 | 模块关闭 unity build：多个测试文件在匿名命名空间里定义同名辅助函数，合并编译单元后互相冲突 |
| 2026-09-12 | DATA-003：重新生成武器清单/科技树/生产队列（`COMPLETE 120 / DATABASE_ONLY 4`），优先级轴不再混入 DATABASE_ONLY，FBX 版本字段同步；生成器侧修好，一致性测试改为固定断言 0 |
| 2026-09-12 | DATA-005：待产出资产改为 `bAssetPending` 记录（schema v3），界面可见、装配失败关闭；推进与游戏配发两种字段语义分开 |
| 2026-09-12 | DATA-002：权威方向固定为资产库 → 运行时副本；同步脚本覆盖 `Config/SilentDepth` 全部 19 个副本并登记哈希，新增 `npm run check:runtime-data` |
| 2026-09-12 | 存档收口：`USilentDepthSaveGame` + `USilentDepthSaveSubsystem`（临时槽 → 读回验证 → 正式槽），文档级 JSON 导入导出接口；`-sd-save-selftest` 实机验证通过 |
| 2026-09-12 | 层阶门槛机制（`FSDTierGateRule`，跳过空层阶 + 需求钳位，避免潜艇树死锁），出厂默认关闭并有断言锁住；新增 `TechTreeTierGateTests` 6 项 |
| 2026-09-12 | `DEC-007` 决定取 1：出厂门槛开启，开局可研究节点 246 → 22；测试栈改为加载出厂规则（此前一直跑在门槛关闭路径上），相关断言同步更新 |
| 2026-09-12 | `UI-001`~`UI-003` 控件层：C++ 构建 UMG 树（`UI/SDCodeWidgetBase`、`UI/TechTree/*`）；headless 编辑器只能建资产、不能填树，`.umg` 皮肤留待编辑器 |
| 2026-09-12 | 存档 schema v2：任务记录、统计汇总、设置与语言三段 + v1 迁移 + 指纹扩展 + 统计自洽校验；设置界面 `UI/Settings/SDGameSettingsWidget`；实机 `-sd-save-selftest` 覆盖新段 |
| 2026-09-12 | `SOCKET-001` Windows 侧：Assembly 文档 → `FSDTechTree::Sockets`，purpose 词表校验、失败关闭、`bEditorVerified` 恒假；Yasen Assembly 纳入同步（20 个运行时文档） |
| 2026-09-12 | `DEC-007` 门禁：`TechTreeProbe` 固定任务序列 + 贪心研究策略，实机输出 22 开局节点 / 600 点结算 / 6 次研究；真人试玩仍待安排 |
| 2026-09-12 | `DEC-009`：防御矩阵 270 行改为能力层（`FSDTechTree::FamilyCapabilities`），不再产生数据通告；通告数 2 → 1，仅保留有公开依据的 `CN_PJ_Type093B` 待产出声明 |
| 2026-09-12 | `DEC-008`：槽位 `socket_capacity` + 装备服务容量/竞争查询 + 存档校验 `SOCKET_CAPACITY_EXCEEDED`；同时修好"矩阵按 socket 存、槽位按名字查"的键不一致，防御配装的按槽查询与存档校验从此可用 |
