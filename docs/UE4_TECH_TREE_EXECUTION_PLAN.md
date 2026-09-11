# SILENT DEPTH UE4 五类科技树执行计划

| 字段 | 内容 |
|---|---|
| 文档状态 | ACTIVE |
| 基线日期 | 2026-09-11 |
| 目标分支 | `ue4` |
| 目标引擎 | Unreal Engine 4.27.2 |
| 适用范围 | 潜艇、武器、传感器/声呐、电子战/防御、推进系统 |
| 架构约束 | `Simulation -> GameSnapshot -> RenderState -> Presentation` |

## 1. 目标

将现有五套科技树从“数据与资产库”推进为 UE4 中可读取、可解锁、可装备、
可存档、可验证的游戏系统，同时保持确定性、隐藏信息规则和单向表现数据流。

本计划不把“JSON 已存在”“FBX 已导出”或“.uasset 已导入”视为游戏功能完成。
单项科技树只有在数据、运行时、UI、存档、装备效果和 UE 验证均满足验收标准后，
才可以标记为完成。

## 2. 当前基线

| 科技树 | 数据层 | 3D 资产 | UE4 Content | 游戏运行时 |
|---|---|---|---|---|
| 潜艇 | 10 Tier、54 节点 | Typhoon、Akula、Yasen 完整；51 艘待生产 | 3 艘已导入 | 硬编码 Akula，无选择/解锁 |
| 武器 | 9 分支、87 家族、124 变体、250 条兼容关系 | 120 完整，4 个 `DATABASE_ONLY` | 未导入 | 未接入 |
| 传感器/声呐 | 13 分支、130 个游戏节点、150 条数据、702 条兼容记录 | 39 个核心资产完整，111 条 `DATABASE_ONLY` | 未导入 | 未接入 |
| 电子战/防御 | 9 分支、45 家族、270 变体、118 个节点、54 套 loadout | 13 个代表资产完整 | 未导入 | 未接入；潜艇无防御挂点 |
| 推进 | 7 分支、54 艘游戏配发计划 | 20 个完整资产 | 20 个已导入，4 LOD、1:1 尺寸；无简单碰撞 | 未接入 |

当前 UE C++ 不读取任何科技树清单。`SubmarinePawn.cpp` 直接引用 Akula 资产，
`Config/SilentDepth/` 也只包含潜艇侧 JSON 副本。

## 3. 完成定义

每套科技树需要分别达到以下六个层级：

1. **DATA TESTED**：schema、ID、Tier、依赖、兼容关系和资产路径通过自动检查。
2. **ASSET TESTED**：需要几何的条目具备规定的 LOD、碰撞、材质、来源和验证记录。
3. **EDITOR VERIFIED**：在 UE4.27 中完成导入、尺寸、材质、LOD、碰撞和 socket 检查。
4. **RUNTIME TESTED**：C++ 能加载数据，应用解锁与装备规则，非法数据失败关闭。
5. **UI VERIFIED**：科技树和配装界面可操作，不显示未解锁或隐藏的游戏事实。
6. **TARGET HARDWARE VERIFIED**：在目标 Windows 硬件上完成性能和显存验证。

`DATABASE_ONLY` 条目不要求制作内部工程模型，但仍必须满足数据、运行时和 UI 验收。

## 4. 推荐执行顺序

```text
P0 数据权威与校验
    -> P1 通用科技树运行时
        -> P2 存档、解锁与 UI
            -> P3 五类系统逐项接入
                -> P4 UE4 资产导入与挂点
                    -> P5 内容扩产与性能验收
```

不要先批量生产剩余 51 艘潜艇。通用运行时和首批垂直切片完成前，新增资产无法
形成可玩的功能闭环。

## 5. P0 数据治理

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| DATA-001 | 定义五类科技树统一运行时 schema | C++ 数据结构、schema 版本说明 | ID、Tier、前置节点、状态、资产引用和兼容规则有明确类型；禁止 `any` 式弱类型解析 |
| DATA-002 | 明确唯一数据权威和同步方向 | 数据同步脚本与说明 | `SilentDepth_Assets` 生产数据可确定性生成 `ue4/SilentDepthUE/Config/SilentDepth` 运行时数据；副本漂移会使检查失败 |
| DATA-003 | 修复武器主清单漂移 | 重建后的 `weapon_manifest.json` | 与生产队列一致：120 `COMPLETE`、4 `DATABASE_ONLY`；路径和 FBX 版本字段同步 |
| DATA-004 | 修复推进验证器跨平台路径 | `propulsion_validator.py` 回归测试 | 不直接依赖构建报告中的 Windows 绝对路径；macOS/Windows 均能解析仓库相对路径 |
| DATA-005 | 增加跨树引用完整性检查 | 自动校验命令和测试 | 54 艘潜艇引用的武器、传感器、防御和推进 ID 全部存在；重复、悬空和非法依赖会失败 |
| DATA-006 | 确认 `DATABASE_ONLY` 政策 | 数据政策文档 | 软件、处理、反应堆、控制和资料不足条目的建模边界明确 |

### 5.2 DATA-002 / DATA-003 / DATA-005 交付记录（2026-09-12）

**DATA-003 武器主清单漂移 —— 已修复**

根因不是字段语义分歧，而是**产物过期**：库里的 `weapon_manifest.json` 是 09-10 的快照，
而生成器按磁盘实际文件判定，资产在那之后才产出。重新生成后即为验收要求的
`COMPLETE 120 / DATABASE_ONLY 4`，`fbx_versions` 也从 `null` 变为真实版本号。

顺带修掉优先级轴污染：策展数据用 `asset_priority == 'DATABASE_ONLY'` 标记"不进队列"，
该标记经 `dataset_index.published_priority()` 在对外清单与科技树里归一为 `null`，
DATABASE_ONLY 语义只由 `asset_status` 承载。一致性测试从"允许 0 或 8"改为**固定断言 0**。

**DATA-005 跨树引用 —— 已按数据原意处理**

`CN_PJ_Type093B` 不是笔误：推进矩阵自己写着"公开条目明确 093B 采用泵喷；本库尚无
对应 3D 泵喷资产，记为缺口"。原先把整条记录丢掉，等于把这个判断也丢了。
现在改为保留记录并标记 `bAssetPending`（schema v3）：界面可见该判断，
`IsEquippable` 与 `CollectCandidates` 一律排除（没有资产可装）。
防御矩阵 270 行 family-only 仍在计数中，映射规则待定。

**DATA-002 唯一数据权威 —— 已明确并纳入门禁**

权威方向固定为 `SilentDepth_Assets/` → `Config/SilentDepth/`。同步脚本现在覆盖该目录下
**全部 19 个副本**（含三份早期手工复制、未纳入过检查的文件），逐一登记 SHA-256；
`npm run check:runtime-data` 漂移即非零退出。原 `Config/SilentDepth/README.md` 里
"Config 是运行时权威"的旧约定与手写哈希表已删除——那份表本身就已过期。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 44/44，EXIT CODE 0）。
- 数据同步：`npm run check:runtime-data` 通过（19 项）。

### 5.1 DATA-001 交付记录（2026-09-11）

**交付物**

- `ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/TechTreeTypes.h`：统一节点、兼容矩阵、插槽与挂点类型。
- `ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/TechTreeSchema.h/.cpp`：枚举词表、失败关闭解析器、分类词表策略、不变量校验、DEC-004 经济接口。
- `ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/TechTreeSchemaTests.cpp`：枚举往返、token 边界、研究经济、树不变量。
- `ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/TechTreeDataConformanceTests.cpp`：对真实资产数据的全量 token 一致性扫描。
- `docs/UE4_TECH_TREE_SCHEMA.md`：schema 版本 1 说明、轴分解表与不变量。

**关键结论**：源数据里 `status` 一个字段名承载三种语义（生产阶段、现实服役状态、
兼容关系），`asset_priority` 混入 `DATABASE_ONLY`。schema 把三条轴拆成独立类型，
未声明取值判为加载错误。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（`SilentDepth.TechTree.Schema.*` 5 项通过，全量 11/11，EXIT CODE 0）。
- 真实数据一致性：34 个扫描行 / 11,873 个 token 全部映射到已声明枚举。
- 已知未决：`weapon_manifest.json` 与 `weapon_technology_tree.json` 共 8 条
  `asset_priority = DATABASE_ONLY` 归 `DATA-003`。

## 6. P1 通用科技树运行时

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| TECH-001 | 实现科技树配置加载器 | `SilentDepthGame` 配置加载模块 | 启动时加载五套数据；缺失、版本错误、重复 ID 和非法前置依赖均明确报错并失败关闭 |
| TECH-002 | 实现统一节点模型 | 只读节点注册表 | 支持类别、Tier、成本、前置节点、互斥条件、可装备对象和显示元数据 |
| TECH-003 | 实现确定性解锁服务 | 纯 C++ 规则模块 | 相同存档和输入得到相同解锁结果；不依赖 Actor、帧率、墙钟或无序容器遍历 |
| TECH-004 | 实现研究资源规则 | 研究点/购买事务 | 余额不足、前置未满足、重复购买不会修改状态；成功购买原子提交 |
| TECH-005 | 实现装备兼容服务 | 装备校验接口 | 只允许数据矩阵中允许的组合；`UNKNOWN` 不自动当作兼容；游戏化配发必须有显式标记 |
| TECH-006 | 添加自动化测试 | UE Automation Tests | 覆盖加载、拓扑排序、循环依赖、解锁、购买、兼容、失败关闭和确定性 |

### 6.1 TECH-001 交付记录（2026-09-11）

**交付物**

- `Core/TechTree/TechTreeLoader.h/.cpp`：公开接口（路径、整树加载、单类别解析）。
- `Core/TechTree/TechTreeLoaderInternal.h` + `TechTreeJsonSupport.cpp` + `TechTreeNodeBuilders.cpp`
  + `TechTreeStructure.cpp`：JSON 支持、五类节点构造、层阶与前结构应用（按 500 行上限拆分）。
- `Core/TechTree/TechTreeLoaderTests.cpp`：5 个 Automation 测试。
- `TechTreeSubsystem.h/.cpp`：`USilentDepthTechTreeSubsystem`，在 GameInstance 启动时加载；
  失败时保持空树、`IsLoaded()` 为假，并逐条记录错误。
- `tools/ue4/sync-tech-tree-data.mjs`：把生产数据同步为运行时副本并记录 SHA-256，`--check` 模式检测漂移。
- `Config/SilentDepth/TechTree/`：10 个运行时文档 + `_sync_manifest.json`（约 1.15 MB）。

**范围说明**：本任务只加载五棵树的节点、层阶与显式前置边。装备兼容矩阵、
安装位与逻辑挂点属于 `TECH-005`；成本与购买事务属于 `TECH-004`。

**落点偏差**：计划原写"`SilentDepthGame` 配置加载模块"，但模块拆分
（Core/Game/Presentation/Tests）尚未执行，因此实现放在现有 `SilentDepthUE`
模块的 `Core/TechTree/` 下；模块拆分时整体平移，不改变接口。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 16/16，EXIT CODE 0）。
- 实测加载：54 潜艇 / 124 武器 / 150 传感器 / 13 防御 / 20 推进，50 条层阶，
  115 条武器前置边全部可解析；连续两次加载结果一致。
- 失败关闭：缺文件、坏 JSON、缺字段、未声明 token、跨类别 token、非法层阶、
  重复 ID、悬空前置 8 类场景均有独立错误码与测试。
- 启动加载：在 UE4.27 实机运行（`-game -nullrhi`，地图 `Ocean_Main`）日志确认
  `LogSilentDepthTechTree: technology trees loaded: 361 nodes, 50 tier rows, 115 prerequisite edges`，
  发生在 World 进入 Play 之前。

### 6.2 TECH-002 交付记录（2026-09-11）

**交付物**

- `Core/TechTree/TechTreeNodeRegistry.h/.cpp`：只读节点注册表。
- `Core/TechTree/TechTreeNodeRegistryTests.cpp`：4 个 Automation 测试。
- `Config/SilentDepth/research_cost.json`：DEC-004 的数值（手写配置，非生成物）。
- `TechTreeLoader` 增加 `LoadResearchCostRule`，子系统改为「树 + 成本规则 + 注册表」三步加载。

**能力**：按 ID 查找、按类别/层阶遍历、前置与反向依赖、互斥组、可安装挂点、
Kahn 拓扑序（按 ID 排序的就绪队列）、DEC-004 成本、显示元数据直读。

**失败关闭**：树违反不变量、成本规则无效、互斥指向不存在的节点、存在环、
节点落入冲突互斥组，注册表一律保持未初始化。

**实测**

- 361 个节点全部索引，`All()` 为 ID 序；
- 拓扑序覆盖全部节点、两次构建完全一致、每条前置边都指向前方；
- 武器前置图 124 节点 / 9 个根 / 最长链 46，无环；
- `US_TORP_Mk14` 的反向依赖包含 `US_TORP_Mk18`；
- T1 成本 100、T10 成本 1000，来自配置文件而非代码。

**已知现状**：五棵树目前没有任何互斥声明，`NumExclusionGroups()` 为 0。
机制已实现并有合成数据测试；真实互斥关系等 `TECH-005` 的安装位矩阵提供。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 20/20，EXIT CODE 0）。
- 启动加载：UE4.27 实机运行日志确认
  `technology trees loaded: 361 nodes, 50 tier rows, 115 prerequisite edges, 0 exclusion groups`。

### 6.3 TECH-003 交付记录（2026-09-11）

**交付物**

- `Core/TechTree/TechTreeUnlockService.h/.cpp`：确定性解锁规则模块。
- `Core/TechTree/TechTreeUnlockServiceTests.cpp`：3 个 Automation 测试。
- 子系统加载链变为「树 → 成本规则 → 注册表 → 解锁服务」，任一步失败整次失败。

**能力**：单节点状态、全量评估（按 ID 序，含成本与可负担标记）、纯结构解锁
（返回新进度，不改输入）、进度规范化与校验、可负担判定、FNV-1a 状态指纹。

**确定性**：无 Actor / World / DeltaSeconds / 墙钟 / 随机数；迭代走 ID 序数组，
判定只用集合做成员查询；解锁列表的顺序与重复不影响结果；失败时进度保持原值。

**边界**：钱包属于 `TECH-004`。研究点只是入参，本服务从不扣点；`TECH-004`
用 `CanAfford` + `ApplyUnlock` 组合出原子购买事务。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 23/23，EXIT CODE 0）。
- 实机启动：UE4.27 `-game -nullrhi` 日志确认加载链（树 → 成本 → 注册表 → 解锁服务）全部通过。
- 实测状态：空进度下 246 个 `Available`、115 个 `PrerequisiteLocked`（全部来自武器链）、
  0 个 `Unlocked`；`US_TORP_Mk18` 的阻断者精确指向 `US_TORP_Mk14`；
  两次独立构建的状态指纹一致。

### 6.4 TECH-004 交付记录（2026-09-11）

**交付物**

- `Core/TechTree/TechTreeResearchAccount.h/.cpp`：研究点钱包、原子购买事务、DEC-004 结算。
- `Core/TechTree/TechTreeResearchAccountTests.cpp`：4 个 Automation 测试。
- `HashToken` 上移到 schema 层，供状态指纹与账户指纹共用。
- 子系统加载链变为「树 → 成本规则 → 注册表 → 解锁服务 → 账户服务」。

**验收对照**

| 验收标准 | 实现 |
|---|---|
| 余额不足不修改状态 | 判定通过后仍取不到余额时直接拒绝，账户逐位不变（指纹断言） |
| 前置未满足不修改状态 | 结构规则先于余额判定，返回 `PrerequisiteLocked` 与具体前置 ID |
| 重复购买不修改状态 | 返回 `AlreadyUnlocked`，不扣费、不追加节点 |
| 成功购买原子提交 | 先构造候选账户，再一次性赋值；扣费与解锁同时生效 |

**DEC-004 结算**：`score / ScoreDivisor` + 首次通关奖励；分数低于门槛产出 0 点且
**不记录**首次通关（奖励留给真正通关的那次）。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 27/27，EXIT CODE 0）。
- 实机启动：UE4.27 `-game -nullrhi` 日志确认四段加载链全部通过。

### 6.5 TECH-005 交付记录（2026-09-12）

**交付物**

- `Core/TechTree/TechTreeCompatibilityLoaders.cpp`：四份兼容矩阵 + 两份安装位定义的加载。
- `Core/TechTree/TechTreeEquipmentService.h/.cpp`：兼容性查询与策略判定。
- `Core/TechTree/TechTreeEquipmentServiceTests.cpp`：4 个 Automation 测试。
- `TechTreeSave` 增加 `ValidateSaveCompatibility`，把矩阵判定接到存档校验上。
- `FSDTechTreeLoadReport` 增加 `Notices`：可见但不致命的数据缺陷通道。
- `tools/ue4/sync-tech-tree-data.mjs` 扩展到 16 个运行时文档（4.23 MB）。

**验收对照**

| 验收标准 | 实现 |
|---|---|
| 只允许矩阵允许的组合 | 矩阵里没有这一行 → `Unknown` → 任何策略下都拒绝 |
| `UNKNOWN` 不自动当作兼容 | `IsEquippable()` 对 `Unknown` 恒为假，有专门测试 |
| 游戏化配发必须有显式标记 | `Gameplay` 只在 `ESDEquipPolicy::AllowGameplay` 下放行，`IsGameplayAssignment` 供 UI 标注 |

**实测**：3176 条兼容记录（武器 250 / 传感器 702 / 防御 2160 / 推进 64）、
604 个安装位（武器 118 / 防御 486）；`Confirmed`、`Probable`、`Gameplay`、
`Incompatible`、`Unknown` 五种关系各有用例覆盖。

**新发现的数据缺陷（交给 `DATA-005`）**

- 推进矩阵引用 `CN_PJ_Type093B`，该推进器在资产库中不存在（无目录、无文件）→
  1 条 `MISSING_COMPATIBILITY_CANDIDATE` 通告，对应查询失败关闭。
- 防御矩阵 2430 行中有 270 行只有 family 没有具体资产 → 无法映射到节点，跳过并计数。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 36/36，EXIT CODE 0）。
- 实机启动：日志确认 `3176 compatibility records, 604 slots, 2 data notices`。

### 6.6 TECH-006 交付记录（2026-09-12）

**交付物**

- `Core/TechTree/TechTreePipelineTests.cpp`：4 个跨模块 Automation 测试。
- `docs/UE4_TECH_TREE_SCHEMA.md` §8.3：验收项 → 测试的覆盖矩阵。

**先说结论**：`TECH-006` 的验收项（加载、拓扑、循环依赖、解锁、购买、兼容、失败关闭、确定性）
在此前的 `TECH-001` 至 `TECH-005` 中已各有测试。这一轮做的是**补齐缺口**而不是重写：

| 缺口 | 补法 |
|---|---|
| 缺端到端：两套独立构建跑同一脚本 | `Pipeline.EndToEndDeterminism`（账户指纹 + 存档指纹 + 存档字节全部一致） |
| 缺存档边界等价性 | `Pipeline.SaveCapturesProgression`（连续跑两关 vs 中间存读一次再跑，结果签名相同） |
| 缺独立加载一致性（含兼容索引与拓扑序） | `Pipeline.IndependentLoadsAgree` |
| 4 个错误码从未被正向触发 | `Pipeline.FailureSurface`：`CONFLICTING_EXCLUSION`、`INVALID_FIELD_TYPE`、`SAVE_WRITE_FAILED`、`MISSING_COMPATIBILITY_PLATFORM` |

**失败面统计**：模块共 33 个错误码 + 3 个通告码；32 个错误码有测试正向触发，
`UNKNOWN_CATEGORY` 不可达（类别枚举只有五个值，属防御性分支）。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 40/40，EXIT CODE 0）。

## 7. P2 存档与界面

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SAVE-001 | 扩展 UE 存档 schema | 科技树存档结构和迁移器 | 保存已解锁节点、研究资源、已购装备和每艘艇 loadout；旧存档可迁移或安全重建 |
| SAVE-002 | 实现存档校验 | 读写测试 | 篡改、未知 ID、非法装备和错误版本不会进入运行时 |

### 7.1 SAVE-001 / SAVE-002 交付记录（2026-09-11）

**交付物**

- `Core/TechTree/TechTreeSave.h/.cpp`：版本化存档文档、JSON 读写、迁移、校验、篡改指纹。
- `Core/TechTree/TechTreeSaveTests.cpp`：5 个 Automation 测试。
- `FSDResearchAccountService::GetRegistry`：供存档校验判断平台节点类别。

**验收对照**

| 验收标准 | 实现 |
|---|---|
| 已解锁节点 / 研究资源 | `unlockedNodeIds` / `researchPoints`，读回后仍通过账户校验 |
| 已购装备与每艇 loadout | `loadouts[]`（platform / slot / candidate），校验平台必须是潜艇节点、候选必须存在、同一槽位不得重复 |
| 旧存档可迁移或安全重建 | 版本缺失或 `< 1` → 重建为空账号；`> 1` → 拒绝 |
| 篡改不会进入运行时 | `signature` 覆盖账户与配装；改动余额或配装即 `SAVE_SIGNATURE_MISMATCH` |
| 未知 ID / 非法装备 | `UNKNOWN_NODE_IN_PROGRESS`、`UNKNOWN_PLATFORM`、`PLATFORM_NOT_SUBMARINE`、`UNKNOWN_CANDIDATE`、`DUPLICATE_LOADOUT_SLOT` |
| 读写测试 | 内存与文件双向往返、缺失文件、损坏文件、非法写入不落盘 |

**范围说明**：本次交付的是科技树存档段。`USaveGame` 槽位封装与设置/统计/语言字段
仍属完整存档任务；`signature` 是篡改检测而非安全边界。配装的**兼容性**校验
（该槽位是否允许该装备）要等 `TECH-005` 的兼容矩阵，现在只校验结构合法性。

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 32/32，EXIT CODE 0）。
| UI-001 | 制作科技树总览 | UMG 五分类入口 | 可在潜艇、武器、传感器、防御、推进之间切换；显示 Tier、成本、状态和依赖 |
| UI-002 | 制作节点详情 | UMG 详情面板 | 区分已解锁、可研究、前置不足、`DATABASE_ONLY`、资料 `UNKNOWN` 和资产未验证状态 |
| UI-003 | 制作潜艇配装界面 | UMG loadout 编辑器 | 只能装入合法 socket；冲突、容量和兼容错误有明确反馈 |
| UI-004 | 完成键鼠与窄屏检查 | 输入和布局验证记录 | 不修改既有游戏控制绑定；1080p 和窄窗口下无重叠、截断或不可操作控件 |

### 7.3 存档槽位层交付记录（2026-09-12）

**交付物**

- `SilentDepthSaveGame.h`：UE 存档槽载荷（文档字符串 + schema id/version）。
- `SilentDepthSaveSubsystem.h/.cpp`：槽位 I/O、JSON 导入导出、启动自检。
- `TechTreeSave` 增加 `WriteDocumentToString` / `ReadDocumentFromString`，文件写入改为调用同一实现。

**流程**：写临时槽 → 读回并校验（含指纹比对）→ 写正式槽 → 读回并校验 → 删除临时槽。
任何一步失败都不动正式槽；**没有经过读回验证的内容不会被提升为正式存档**。

**验证方式**：这一层需要真实 GameInstance，自动化测试跑不了（worker 线程构造 UObject
会触发引擎致命断言，此前实测过）。因此加了 `-sd-save-selftest` 命令行自检，不传参数
时零副作用。UE4.27 实机结果：

```text
LogSilentDepthSave: save self-test PASSED: slot round trip kept 150 point(s), 1 node(s), 1 loadout(s)
```

**仍未做**：完整存档的设置/统计/语言段。Web 侧 schema 已查清
（`unlockedMissions` / `bestScores` / `statistics` / `settings{audio,video,input,app.language}`，
语言 `zh|en|fr|ru`），但这些字段目前没有生产者也没有消费者（设置界面、统计结算未实现），
因此没有提前造结构。导入导出接口已经就位，补齐时直接按同一份 schema 扩展。

### 7.2 UI-001 / UI-002 数据层交付记录（2026-09-12）

**交付物**

- `Core/TechTree/TechTreeViewModel.h/.cpp`：界面数据层。
- `Core/TechTree/TechTreeViewModelTests.cpp`：4 个 Automation 测试。
- 子系统加载链增加视图模型，UI 层只需读取 `GetViewModel()`。

**为什么先做数据层**：`.umg` widget 只能在编辑器里创作，本环境没有可用的编辑器
交互路径。显示规则的复杂度几乎全在"显示什么、什么顺序、什么状态、带哪些警告"，
这一层放纯 C++ 才可测；控件层剩下的只是把行渲染成控件。**UMG widget 本身没有做**，
这是明确的范围缺口，不是遗漏。

**验收对照**

| 验收标准 | 实现 |
|---|---|
| 五分类入口 | `FSDTechTreeScreen::Tabs`，按枚举顺序，带总数/已解锁/可研究/锁定/DATABASE_ONLY 计数 |
| 显示 Tier 与成本 | `FSDTierRow`（含公开标签）+ 每行 `Cost` / `bAffordable` |
| 显示状态 | 主状态取自解锁服务：已解锁 / 可研究 / 买不起 / 前置不足 / 互斥 |
| 显示依赖 | 每行带前置与后继；`BuildDependencies` 可单独查 |
| 区分 DATABASE_ONLY / 资料 UNKNOWN / 资产未验证 | 三个正交徽标，逐行与节点数据比对断言 |
| 配装候选 | `BuildEquipmentRows` 按策略过滤，带兼容关系与"仅游戏化配发"标记 |

**完成标签**

- UBT 编译：**BUILD VERIFIED**。
- 自动化测试：**TESTED**（全量 44/44，EXIT CODE 0）。
- 实机启动：日志确认加载链（含视图模型）全部通过。

## 8. P3 五类系统接入

### 8.1 首个垂直切片

先只使用 `RU_SSN_Akula` 完成端到端闭环。该切片至少包含：

- 1 个潜艇节点；
- 2 个鱼雷/武器节点；
- 被动、主动、处理三个传感器节点；
- 诱饵、告警、ESM 三个防御节点；
- `RU_PROP_Akula` 和一个推进升级节点；
- 解锁、购买、配装、保存、重新加载和任务内生效。

只有该切片通过 UE 自动测试和编辑器人工测试后，才扩展到其他潜艇。

### 8.2 分系统任务

| ID | 任务 | 主要验收标准 |
|---|---|---|
| SUB-001 | 移除硬编码 Akula 选择 | 根据 loadout/存档选择艇体和可动部件；缺失资产使用明确回退，不猜测其他艇路径 |
| SUB-002 | 实现潜艇平台属性 | 平台基础属性来自强类型配置，并进入权威仿真；表现层只读取快照 |
| WPN-001 | 接入武器库存与发射接口 | 武器解锁和兼容关系决定可装载项；具体战斗数值必须走平衡配置和确定性仿真 |
| WPN-002 | 建立武器展示映射 | 发射后使用已验证资产或程序化回退；不可因展示资产缺失改变命中结果 |
| SNS-001 | 接入传感器能力修正 | 探测范围、误差、冷却等只由权威仿真读取；不得在 HUD 或 Actor 中计算真实接触 |
| SNS-002 | 接入传感器展示资产 | 桅杆、阵列和拖曳系统遵循可见性规则；隐藏目标不得通过传感器表现泄漏 |
| DEF-001 | 接入诱饵、告警和 ESM 能力 | 解锁和装备影响仿真事件；防御 UI 不显示未公开的敌方武器真值 |
| DEF-002 | 建立防御附加展示层 | 使用统一 socket 词表；未授权前不修改潜艇母版几何 |
| PROP-001 | 接入推进系统属性 | 推进配置影响速度、加速度、噪声和能耗时必须进入权威仿真和确定性测试 |
| PROP-002 | 接入推进展示资产 | 根据选定平台/装备选择推进器；旋转和动画属于表现层，不回写仿真 |

## 9. P4 UE4 资产与挂点

| ID | 任务 | 验收标准 |
|---|---|---|
| UEASSET-001 | 批量导入 120 个武器资产 | UE4.27 中路径、比例、材质、LOD 和碰撞抽检通过；生成可追踪导入报告 |
| UEASSET-002 | 批量导入 39 个传感器资产 | 资产命名和 8 类统一 socket 对齐；无远程运行时依赖 |
| UEASSET-003 | 导入 13 个防御代表资产 | 中等细节定位和人工外观验收通过；不宣称代表全部 270 个变体拥有独立模型 |
| UEASSET-004 | 修复 20 个推进资产碰撞 | 每个静态网格具备规定的简单碰撞；4 LOD、尺寸和材质重新检查 |
| SOCKET-001 | 审批并制作潜艇挂点 | 先处理 Akula，再处理 Yasen、Typhoon；挂点命名、方向、尺度和用途通过自动审计 |
| UEASSET-005 | 人工视觉验收 | 检查材质、法线、比例、枢轴、LOD 跳变、穿模和水下可读性，结果记录为 `EDITOR VERIFIED` |

## 10. P5 内容扩产

潜艇扩产建议按可玩价值分批，不按 51 艘一次性执行：

| 批次 | 建议平台 | 目的 |
|---|---|---|
| Batch A | Los Angeles、Virginia、Seawolf、Astute、Suffren | 建立美国、英国、法国现代 SSN 可玩阵容 |
| Batch B | Type 093、Type 093B、Yasen-M | 扩充中国、俄罗斯现代 SSN；同步补 `CN_PJ_Type093B` |
| Batch C | Ohio、Borei、Vanguard、Triomphant、Type 094 | 建立主要现代 SSBN 阵容 |
| Batch D | 其余历史和低优先级平台 | 在核心玩法和性能预算稳定后按任务需求生产 |

每批最多 3 艘并行进入建模流水线。每艘必须完成来源、母版、LOD、碰撞、材质、
可动部件、socket、UE 导入和人工验收，才能进入下一批。

## 11. 决策登记（DEC-001..DEC-006）

以下决策会阻塞对应任务，实施前需要明确记录。已决定项以
`docs/UE4_TECH_TREE_DECISION_RECORD.md` 为准，本表只保留状态与摘要：

| 决策 ID | 需要确认 | 状态 | 决定 / 推荐 | 阻塞任务 |
|---|---|---|---|---|
| DEC-001 | 是否接受 `DATABASE_ONLY` 条目不制作内部工程模型 | 已决定 | 接受；现实型号资料不足与游戏通用占位分两类，边界见决策记录 | DATA-006、五类科技树验收 |
| DEC-002 | 是否授权修改 Akula、Yasen、Typhoon 母版以增加装备 socket | 已决定 | 授权；限定 Akula 垂直切片，只改工作副本，母版保持只读 | SOCKET-001、SNS-002、DEF-002 |
| DEC-003 | 首批潜艇生产顺序 | OPEN | 推荐采用 Batch A | P5 内容扩产 |
| DEC-004 | 科技树研究资源来源 | 已决定 | 任务结算唯一产出；初版 `cost = tier × 100`，首次通关 +50 | TECH-004、SAVE-001、UI-001 |
| DEC-005 | 是否允许 GAMEPLAY 标记的推测配发 | OPEN | 推荐允许，但 UI/数据中与现实资料明确区分 | TECH-005、各类 loadout |
| DEC-006 | Windows UE4.27 验收环境和目标硬件 | OPEN | 推荐 UE4.27.2 + Windows 10/11 + GTX 1050 基线 | 全部 `EDITOR VERIFIED` 和性能任务 |
| DEC-007 | 层阶门槛：Tier N 需要同类别下方最近非空层阶里已解锁几个节点 | 已决定 | 取 1：逐层解锁，开局可研究节点 246 → 22 | `UI-001` 的科技树体验 |

对于现实资料为 `UNKNOWN` 的条目，不要求负责人凭经验补值。只有获得官方、政府、
制造商或可靠历史资料后才更新；否则保持 `UNKNOWN`。

## 12. 近期执行清单

下一轮建议只执行以下任务，完成后再进入大规模资产导入：

1. UMG 控件层（`UI-001` 至 `UI-003` 的 widget）：数据层已交付，需要在编辑器里搭建。
2. 完整存档的设置/统计/语言段（挡在设置界面与统计结算之后）。
3. `DATA-005` 剩余项：防御矩阵 270 行 family-only 的映射规则。
4. `SOCKET-001`：按 `DEC-002` 在 Blender 工作副本中制作 Akula 装备 socket 并交接 Windows。
5. 完成 Akula 首个垂直切片并在 Windows UE4.27 中验收。

`DEC-007` 已决定取 1：层阶门槛开启，零进度可研究节点由 246 降到 22
（潜艇 5/54、武器 1/124、传感器 13/150、防御 2/13、推进 1/20）。
数值在 `Config/SilentDepth/research_cost.json` 的 `tierGateRequiredUnlocked`，
并有测试锁定该取值。

`DEC-001`、`DEC-002`、`DEC-004` 已于 2026-09-11 决定，不再列入待确认项。
`DATA-001`、`TECH-001` 至 `TECH-006`、`SAVE-001`、`SAVE-002` 已交付，
`UI-001`/`UI-002` 的数据层已交付（控件层待编辑器）
（`TECH-001` 至 `TECH-004`、`SAVE-*` 于 2026-09-11，`TECH-005`、`TECH-006` 于 2026-09-12）。
P1 通用科技树运行时至此全部完成。

## 13. 验证门禁

每个阶段提交前至少执行：

```bash
npm test
npm run typecheck
npm run build
npm run lint
```

UE C++ 和资产任务还必须在 Windows UE4.27 环境执行：

- UE Automation Tests；
- 编辑器启动与项目编译；
- 数据加载失败场景测试；
- 资产导入报告；
- 1080p 与窄窗口 UI 人工检查；
- 目标硬件性能采样。

没有 UE 编辑器或目标硬件证据时，只能标记 `IMPLEMENTED` 或 `TESTED`，不得标记
`EDITOR VERIFIED` 或 `TARGET HARDWARE VERIFIED`。
