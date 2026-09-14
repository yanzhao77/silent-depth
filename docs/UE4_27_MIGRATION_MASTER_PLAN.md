# SILENT DEPTH UE4.27 迁移主方案

> 历史资料，已于 2026-09-14 退役。正文保留用于追溯，不再规定当前产品的需求优先级、
> Web 对照、玩法数值或实施顺序。当前唯一产品是 UE4 独立游戏，目标在 Steam 发售。
> 请从 [新文档入口](README.md) 开始，技术契约见 [新架构](plan/07_TECHNICAL_ARCHITECTURE.md)。

| 字段 | 内容 |
|---|---|
| 状态 | CONSOLIDATED PROPOSAL |
| 目标引擎 | Unreal Engine 4.27.2 |
| 首要平台 | Windows 10/11 x64，DirectX 11 |
| 基准开发显卡 | GTX 1050 2GB/4GB |
| 实施方式 | 纯 C++ 权威仿真 + UE4 表现层 |
| 架构分册 | `docs/UE4_27_TARGET_ARCHITECTURE.md` |
| 实施分册 | `docs/UE4_27_MIGRATION_PLAN.md` |

本文合并 UE4.27 目标架构、迁移实施计划及现有游戏设计/架构文档中的有效约束，
作为迁移工作的统一入口。两个分册保留详细论证和检查清单；本文与分册冲突时，
先按本文执行，再由项目所有者修订冲突来源。本文不改变现有玩法和平衡。

## 1. 结论

迁移采用“重写实现、保持行为、双轨校验”的方案：

```text
Input/Replay
    |
    +-> TypeScript baseline -> Canonical Trace --+
    |                                             +-> Comparator
    +-> UE4 Pure C++ Core -> Canonical Trace -----+
                              |
                              v
                         FGameSnapshot
                              |
                              v
                         FRenderState
                              |
                              v
                Actor / Camera / UMG / Audio / FX
```

不可妥协的原则：

1. 玩法事实只存在于纯 C++ Core。
2. 仿真固定 20Hz，同 seed、同输入序列产生相同结果。
3. 数据单向流动：Simulation -> Snapshot -> RenderState -> Presentation。
4. 表现层不能读取真实但未公开的敌舰数据。
5. UE Tick、Chaos、碰撞、导航和墙钟不决定玩法结果。
6. 原 TypeScript 版本在迁移完成前保持可运行，作为行为权威。
7. 资产与音频完全本地，Shipping 包不进行运行时网络访问。

## 2. 文档权威顺序

| 优先级 | 来源 | 权威范围 |
|---|---|---|
| 1 | 当前代码和新执行的测试 | 已实现行为、字段、测试数量 |
| 2 | `ue4/SilentDepthUE/Config/balance.json` | 运行时平衡数值 |
| 3 | `ue4/SilentDepthUE/Config/missions.json` | 五个固定任务输入数据 |
| 4 | `docs/GAME_DESIGN.md` | 玩法意图、公式、任务与评分 |
| 5 | `docs/GAME_ARCHITECTURE.md` | 仿真边界、顺序、事件和确定性 |
| 6 | 本文 | UE4 目标决策、迁移顺序和门禁 |
| 7 | 两份 UE4 分册 | 详细设计、执行清单和风险 |
| 8 | `docs/V2_ARCHITECTURE.md` | 当前浏览器表现层参考 |
| 9 | `docs/VISUAL_STYLE.md` | 视觉语言、信息层级和色彩 |
| 10 | `docs/ASSET_PIPELINE.md` | 资产来源、许可和登记流程 |

旧报告中的测试数量、性能和视觉结论不得覆盖新执行结果。迁移开始时要记录
基线提交、配置哈希、资产哈希和完整门禁结果。

## 3. 范围

必须迁移：

- M01-M05、任务生成、目标、胜负、评分和统计。
- 玩家潜艇、速度、转向、深度、电池、噪声、船体和探测计。
- 主动/被动声呐、接触生命周期、不确定性、分类和视觉确认。
- 舰队、护航、搜索、LKP、鱼雷、火控、深水炸弹和甲板炮。
- 世界、洋流、天气转换和潜望镜公开状态。
- 三种视图、HUD、菜单、音频、特效、设置和存档。
- 无头仿真、输入回放、跨语言轨迹对照和发布测试。
- 已批准本地资产、LOD、许可登记和程序化回退。

首轮不做：

- 多人、服务端、账号、云存档和遥测。
- 开放世界、真实流体、完整潜艇内舱和 AAA 级海战画面。
- 依赖 Chaos 的权威运动和碰撞结算。
- 迁移同时调整平衡或更改控制语义。
- 未经验证的 UE4 Water、第三方联网插件或未知许可资产。

## 4. 仓库和 UE 模块

迁移期将 UE 工程放在 `ue4/`，不移动现有 Web 项目：

```text
ue4/
├── SilentDepth.uproject
├── Config/
├── Content/SilentDepth/{Art,Audio,Effects,Maps,UI,Data}/
├── Source/
│   ├── SilentDepthCore/
│   ├── SilentDepthGame/
│   ├── SilentDepthPresentation/
│   └── SilentDepthTests/
└── Tools/
```

依赖方向：

```text
SilentDepthCore <- SilentDepthGame <- SilentDepthPresentation
       ^                  ^
       +---------- SilentDepthTests ----------+
```

### 4.1 `SilentDepthCore`

- 只依赖标准 C++ 和 UE Core 的必要基础类型，不依赖 Engine。
- 拥有 RNG、时间、状态机、世界、任务、玩家、声呐、AI、战斗和目标。
- 拥有权威 runtime、输入、快照、可靠事件批次和回放结构。
- 禁止 Actor、UObject、UWorld、TimerManager、Chaos、导航和平台时间。
- 实体更新使用稳定 ID 排序数组；Map/Set 只查找，不驱动更新顺序。

### 4.2 `SilentDepthGame`

- 私有持有 `USilentDepthSimulationSubsystem`、Core runtime 和适配器。
- Subsystem 实现 `FTickableGameObject`，不依赖关卡 Actor 才能工作。
- 采集输入、驱动固定步长、生成 RenderState、加载配置和管理存档。
- Public 目录只公开表现 POD、公开事件和只读 view source。
- GameSnapshot、真实敌舰和 Core runtime 只存在于 Private 边界。

### 4.3 `SilentDepthPresentation`

- 只依赖 Game 的公开表现接口，不声明 Core 依赖。
- 管理 Actor 池、相机、海面、天气、UMG、Audio Mixer 和 Niagara。
- 不查询仿真内部对象，不通过世界碰撞、距离或 Actor 状态回写玩法。
- CI 检查 Presentation 不得 include Core 头文件。

### 4.4 `SilentDepthTests`

- 包含 Core 单元测试、Commandlet 回放、轨迹比较和表现安全测试。
- Development/Test 构建启用，Shipping 不打包。

## 5. 权威核心接口

目标 C++ 输入必须覆盖现有全部 `PlayerInputs` 字段：

```cpp
struct FPlayerInputs final
{
    double ThrottleKt = 0.0;
    double Rudder = 0.0;
    EDepthLayer DepthLayerTarget = EDepthLayer::Shallow;
    bool bSilentRunning = false;
    bool bPing = false;
    std::optional<std::string> FireTorpedo;
    bool bDecoy = false;
    bool bPause = false;
    bool bPeriscope = false;
    bool bLockTarget = false;
    bool bEmergencyDive = false;
};

struct FStepResult final
{
    FGameSnapshot Snapshot;
    FEventBatch Events;
};

class FGameEngine final
{
public:
    static FGameEngine Create(const FMissionDef& Mission, uint32 Seed);
    FStepResult Step(const FPlayerInputs& Inputs);
};
```

`FGameSnapshot` 包含玩家、公开接触、内部敌舰视图、鱼雷、诱饵、任务、评分、
统计、潜望镜公开状态、最近事件历史和 `ActiveWeather`。只有 Game 私有适配器
可以读取完整快照；Presentation 只能得到净化后的 `FRenderState`。

`FRenderState` 至少包含：

- 玩家公开姿态。
- `VisibleShips`，仅含视觉/潜望镜规则允许公开的舰船。
- `RenderContacts`，只含声呐估计和不确定性。
- 允许公开的鱼雷、诱饵、天气、任务和 UI 数据。
- 已净化的表现事件，不含可反查真实目标的内部 ID。

## 6. 时间和卡顿策略

Core 不接收 UE 帧 `DeltaSeconds`：

```text
FIXED_DT = 0.05 seconds
SimTime = TickIndex * FIXED_DT
```

运行时明确采用“仿真可落后墙钟、绝不使用可变 dt”策略：

```cpp
constexpr int32 MaxCatchUpSteps = 5;
Accumulator = Min(Accumulator + Min(FrameDeltaSeconds, 0.25), 0.25);
StepsThisFrame = 0;

while (Accumulator >= FixedDt && StepsThisFrame < MaxCatchUpSteps)
{
    Step(InputBuffer.ConsumeForNextTick());
    Accumulator -= FixedDt;
    ++StepsThisFrame;
}
```

含义：

- 一帧最多补 5 个 tick，最多保留 0.25 秒 backlog。
- 超过部分墙钟时间被丢弃，游戏仿真变慢，不假装完整追平。
- 任务计时、AI、战斗和天气只看已执行 tick。
- 表现动画可以看墙钟，但不得回灌 Core。
- Commandlet/回放绕过 accumulator，按指定 tick 数直接执行。
- 暂停不增加 tick、不消费 RNG；恢复边沿允许执行一次控制 Step。
- 输入边沿进入 FIFO，在被 tick 消费前不得丢失或由 OS 重复触发。

## 7. 确定性和 RNG

Mulberry32 必须逐操作复刻 TypeScript：

- seed 按 uint32 归一化，负数 seed 也进入黄金测试。
- 加法、XOR、右移和乘法全部按 32 位语义执行。
- `next()` 除以 4294967296，结果范围为 `[0, 1)`。
- `range`、`int`、`chance`、`sign` 分别建立边界黄金向量。

`fork(label)` 冻结为：

```text
labelHash = FNV1a32_UTF16(label + "|" + originalSeed)
derivedSeed = labelHash XOR currentParentState
fork does not consume parent
```

标签包含：

```text
world missions submarine sonar ai combat detection objectives
world-ocean missions-gen
```

要求：

- 连续 10,000 个 `next()` 与 TypeScript 位级一致。
- 每个 fork、不同 fork 时点和负 seed 都有黄金向量。
- MSVC Core 使用 `/fp:strict`，禁止快速数学优化。
- 核心计算使用 double，表现边界才转换为 float。
- 三角函数集中到可替换数学层，并测试所有分支阈值附近轨迹。
- 首个逐轨迹对齐平台限定 Windows x64；跨平台逐位一致另立项目。
- 视觉随机使用独立 RNG，不消费 Core 流。

固定执行顺序：

```text
StateMachine -> World -> Missions -> Submarine -> Sonar -> Periscope
-> AI -> Combat -> Detection -> Objectives -> Snapshot Assembly
```

## 8. 隐藏信息边界

这是 UE 迁移的最高风险边界：

1. 声呐接触不能让真实舰船进入 `VisibleShips`。
2. 未知距离的被动接触只能提供方位和误差，不构造精确位置。
3. 声呐符号使用独立 `RenderContact`，不能伪装成舰船 Actor。
4. `trueShipId`、真实坐标、真实类别和 AI 内部状态不得进入 Public 头文件。
5. 相机、尾迹、灯光、音频、阴影和自动构图只遍历公开实体。
6. 目标失去可见许可时立即回收 Actor，并清空尾迹、音频和附属组件。
7. 事件没有公开坐标时，只播放无位置效果或不播放；禁止回查真实位置。
8. 缺少展示事实必须 fail closed，不允许猜测。

必须建立以下自动化用例：

- 隐藏舰船不 Spawn Actor。
- 隐藏舰船不产生导航灯、尾迹、Wake、阴影和空间音频。
- 相机候选不包含隐藏舰船。
- 声呐 bearing-only 接触不产生 range。
- 沉没/命中事件无公开位置时不生成世界特效。
- 任务切换和对象池复用不会残留旧目标提示。

## 9. 可靠事件通道

`eventLog` 只用于最近事件 UI，不承担音频、特效和 HUD 的可靠投递。

每个 Core tick 返回 `FEventBatch`：

```text
SessionId
Tick
FirstEventId
Events ordered by emission sequence
```

规则：

- 事件 ID 在一个 session 内单调递增。
- Game 通过游标消费所有事件批次，再净化为表现事件。
- 任务重启同时更换 SessionId 并重置游标。
- 队列有界；溢出在测试/开发构建中直接失败，Shipping 明确记录错误。
- 不允许静默丢事件后补猜位置、命中或任务状态。
- 轨迹比较使用本 tick 新事件批次，不重复比较历史 eventLog。

## 10. 天气单一权威

当前 Web 表现层会再次解析任务天气字符串；UE 目标实现取消这条双重逻辑。

- `MissionDef.weather` 只作为 Core World 的输入规范。
- Core 负责天气链转换，并在快照输出 `ActiveWeather`。
- Sonar、Combat、Periscope 和 Detection 读取同一个 Core World 状态。
- Game 适配器只转换 `ActiveWeather`，不得重新解析天气字符串。
- Presentation 根据 RenderWeather 派生颜色、雾、波浪和粒子。
- 视觉风浪不参与权威命中、运动或探测。

## 11. 坐标与单位

仿真保留公里和 double，UE 边界转换为厘米：

```text
Engine x east km  -> UE Y = x * 100000 cm
Engine y north km -> UE X = y * 100000 cm
Depth metres down -> UE Z = -depth * 100 cm
Heading 0 north   -> UE Yaw 0
Heading 90 east   -> UE Yaw 90
```

地图约正负 1,500,000 cm，首版不启用 World Origin Rebasing。只插值位置、航向
和视觉姿态；命中、分类、任务状态、弹药等离散事实不插值。

## 12. 输入、键位与回放

键位语义保持当前实现：

| 键位 | 动作 | 类型 |
|---|---|---|
| W/S、方向上下 | 油门每次 +/-2 kt | 边沿更新持久值 |
| A/D、方向左右 | 左/右舵，释放回中 | 持续状态 |
| Q/E | 上/下一个深度层 | 边沿 |
| Space | 主动声呐 | 边沿 |
| F | 对选中 contactId 发射 | 边沿+参数 |
| R | 静默航行切换 | 边沿切换持久值 |
| G | 诱饵 | 边沿 |
| P | 升降潜望镜 | 边沿 |
| L | 锁定潜望镜目标 | 边沿 |
| X | 紧急下潜 | 边沿 |
| Esc | 打开暂停菜单 | Shell；确认后产生 pause 边沿 |
| F12 | 开发截图 | 非玩法，不进入回放 |

回放 schema 包含完整默认值与稀疏 tick 变更：

```json
{
  "schema": "silent-depth-input-v1",
  "missionId": "M02",
  "seed": 1002,
  "defaults": {
    "throttle": 0,
    "rudder": 0,
    "depthLayerTarget": "Shallow",
    "silentRunning": false,
    "ping": false,
    "fireTorpedo": null,
    "decoy": false,
    "pause": false,
    "periscope": false,
    "lockTarget": false,
    "emergencyDive": false
  },
  "ticks": []
}
```

持续字段沿用最近值；边沿字段默认每 tick 复位。回放必须记录 schema 版本、
基线提交、输入哈希、配置哈希和 seed。

## 13. UE 表现、UI、音频和存档

### 13.1 表现

- `ASilentDepthWorldPresenter` 按实体 ID 管理对象池。
- Actor 不运行玩法 Tick，只应用 RenderState。
- World、Tactical、Periscope 相机切换不修改 Core。
- 战术图绘制公开 contact、误差椭圆、距离环和公开鱼雷。
- 低配海面使用有限网格、2-4 组 WPO/Gerstner 波和 Reflection Capture。
- Low 关闭 Volumetric Fog、Planar Reflection 和高成本 SSR。

### 13.2 UMG

- ViewModel 只接收 RenderState 和公开事件。
- Widget 不搜索 Actor 获取战术事实。
- 菜单由 Core/Shell 状态驱动，不维护第二套玩法状态机。
- 桌面和窄窗口都验证中央游戏区不被不合理遮挡。

### 13.3 音频

- 使用 Audio Mixer、Sound Cue，必要时使用 `USoundWaveProcedural`。
- 音频由公开事件触发；隐藏实体不能产生未经授权的空间声音。
- 所有音频本地打包。

### 13.4 存档

- `USaveGame` 保存版本化数据。
- `FSaveDataV1` 覆盖解锁、最高分、统计、音频/显示/输入设置和
  `settings.app.language`。
- 提供严格校验的浏览器 JSON 导入；损坏数据安全回退。
- 导入先写临时槽并读回验证，成功后再替换正式槽。

## 14. 配置和资产

- 工具链锁定 UE4.27.2、Visual Studio 2019、MSVC v142、Windows 10 SDK 和
  C++17；构建机保存可复现的安装清单。
- `ue4/SilentDepthUE/Config/balance.json` 与 `ue4/SilentDepthUE/Config/missions.json`
  是运行时数据源（原仓库根 `config/` 是 Web 版遗留，已随 Web 版清理删除）。
- 构建期生成 UE 强类型数据，Blueprint/Data Asset 不复制数值权威。
- 缺字段、非法枚举、NaN 和越界值使构建或加载失败。
- GLB 经 Blender 校验单位、朝向、原点、法线和材质后导出 FBX。
- UE LOD、碰撞和材质实例保留源 asset ID、哈希、许可和三角面记录。
- 首批迁移玩家潜艇、Destroyer、Tanker；其他家族先用批准的回退。
- `.uasset`、`.umap`、FBX、GLB、音频和纹理使用 Git LFS。
- 不提交 Binaries、Intermediate、Saved、DerivedDataCache 和 `.vs`。

## 15. GTX 1050 性能目标

以下均为待实测目标，不是已验证结论：

| 指标 | Low 目标 |
|---|---|
| 分辨率 | 1080p；2GB 型号允许 720p |
| 帧率 | 打包版稳定 30 FPS |
| 总帧预算 | 33.3 ms |
| 可见三角面 | 建议少于 500K |
| Draw Calls | 建议少于 250 |
| 纹理 | 以 1K 为主，英雄资产最多 2K |
| 活动粒子 | 建议少于 2,000，并按画质缩放 |

使用 `stat unit`、`stat scenerendering`、`stat rhi`、`profilegpu` 和 Unreal
Insights 测量。性能结论只能来自目标硬件打包版，不能由编辑器截图推断。

## 16. 迁移顺序：先垂直切片

### Phase 0：冻结基线

- 确认提交/工作树、配置和资产哈希。
- 运行测试、类型检查和构建。
- 导出 RNG 黄金向量、M01-M05 输入与规范轨迹。
- 建立 UE4 空项目、工具链、Git LFS 和 Windows 打包。

门禁：TS 双跑轨迹哈希一致；UE 空项目可编译和打包。

### Phase 1：Core 基础

- 移植类型、RNG、tick、状态机、事件批次和配置读取。
- 建立 Commandlet、回放读取器和轨迹输出器。

门禁：RNG 位级一致；暂停不推进时间/RNG；非法输入安全处理。

### Phase 2：M01 UE 垂直切片

- 移植 M01 所需世界、玩家、被动/主动声呐、接触和任务目标。
- 同时搭建 Subsystem、输入缓冲、适配器、基础海面、Tactical 相机和调试 HUD。
- 不等待全部 AI/Combat 完成后才验证 UE 链路。

门禁：M01 可从菜单进入并完成；30/60/120 FPS 不改变 Core 轨迹；隐藏舰船
不产生 Actor，声呐只显示估计信息。

### Phase 3：M02 战斗切片

- 移植火控、鱼雷、伤害、Tanker、结果页和基础存档。
- 验证首次伏击完整回放和事件投递。

门禁：发射、近失、命中、沉没、评分和事件 tick 与基线一致。

### Phase 4：M03-M05 系统扩展

- 移植编队、Destroyer/Frigate、搜索、LKP、深水炸弹、甲板炮和逃脱。
- 完成天气链、潜望镜、视觉确认与剩余任务目标。

门禁：五任务无头闭环通过；离散状态和事件顺序无未解释差异。

### Phase 5：完整表现与内容

- 完成三种相机、正式 HUD、天气、海面、Niagara、音频和资产导入。
- 完成设置、语言、浏览器存档导入和画质档。

门禁：所有表现只读公开数据；事件低帧率不丢失；窄窗口布局通过。

### Phase 6：发布收口

- 全量回放、Shipping 离线包、资源释放、稳定性和目标硬件测试。
- 完成资产许可、哈希、LOD、发布说明和回退标签。

门禁：Definition of Done 全部满足。

## 17. 轨迹比较和测试

规范轨迹包括：

- schema、基线提交、输入/配置哈希、mission、seed、tick。
- 玩家、接触、敌舰、鱼雷、任务、评分、统计和公开天气。
- 本 tick 事件批次和开发版每个 RNG stream 消费计数。
- 所有实体按稳定 ID 排序。

比较规则：

- ID、枚举、布尔、计数、事件类型/顺序和离散分支必须精确一致。
- RNG uint32 必须精确一致。
- 时间按 tick 比较。
- 初始浮点容差：位置 `1e-6 km`、角度 `1e-6 deg`。
- 容差导致命中、分类、任务或 AI 分支变化时仍判失败。

测试层次：

1. Core 单元：RNG、玩家、声呐、AI、战斗、世界和任务。
2. Commandlet 集成：五任务、暂停、重启、不同 FPS 输入序列。
3. Presentation 安全：隐藏实体、对象池、相机、音频和特效。
4. Functional：菜单、UMG、存档导入和完整游戏流程。
5. DX11 实机：Shader、Niagara、资产、资源释放和性能。

## 18. CI 和发布门禁

每次提交：

- 编译 Development Editor Win64。
- 运行 Core 测试、RNG 黄金向量和 M01 小轨迹。
- 校验配置 schema 和 Presentation 禁止 include 规则。

每日/合并前：

- UBT 编译 `SilentDepthUEEditor Win64 Development`，0 错误。
- UE Automation `Automation RunTests SilentDepth`，0 失败、EXIT CODE 0。
- `npm run check:runtime-data` 与 `npm run check:asset-pipeline` 通过。
- UE 全部 Core 测试和 M01-M05 双跑轨迹。
- Development 包烟雾测试和资产哈希校验。

发布候选：

- Shipping 离线包和干净 Windows 机器启动。
- DX11 实际窗口检查 Shader、材质、UI 和 Niagara。
- 损坏存档、迁移存档、连续任务重启和 30 分钟稳定性。
- 指定 GTX 1050 型号上的帧率、显存和画质记录。

## 19. 风险和控制

| 风险 | 控制 |
|---|---|
| RNG/浮点漂移 | 黄金向量、double、严格数学、阈值回放 |
| 隐藏信息泄露 | 净化 RenderState、编译边界、负向测试 |
| 事件尾部丢失 | Step 事件批次、游标、溢出失败 |
| 天气双重解析 | Core 输出 ActiveWeather |
| Tick/卡顿改玩法 | 固定步长、明确丢墙钟策略、FPS 交叉测试 |
| Blueprint 失控 | Core 规则只写 C++，Blueprint 只编排 |
| 1050 显存不足 | 1K 纹理、LOD、对象池、Low 默认关闭高成本效果 |
| 二进制冲突 | Git LFS、小 Blueprint、资产所有权分区 |
| 双版本长期分叉 | 玩法冻结；变更双端同步或推迟 |
| UE4 工具链老化 | 锁定 4.27.2、VS2019、v142 和 SDK 镜像 |

## 20. 工期

单人全职、熟悉 C++ 但需学习 UE4 的保守估算：

| 结果 | 累计时间 |
|---|---|
| Core 技术验证 | 4-7 周 |
| M01 垂直切片 | 8-12 周 |
| M02 最小战斗闭环 | 12-18 周 |
| 五任务功能对齐 | 20-30 周 |
| 发布级表现与收口 | 26-40 周 |

兼职通常需要 12-24 个月。原创舰船、完整音频或大规模视觉重做另计。

## 21. Definition of Done

迁移只有在以下全部满足后才能声明完成：

1. M01-M05 在同一纯 C++ Core 中可无头运行并完成规定路径。
2. 同 seed、同输入、同构建得到相同快照和事件序列。
3. TS/C++ 离散结果一致，浮点差异在批准容差内且不改变分支。
4. Presentation 无法访问 Core runtime 或真实隐藏目标。
5. 暂停、卡顿和帧率变化不改变权威结果。
6. 可靠事件通道通过低帧率、溢出和重启测试。
7. 天气、配置、平衡和任务数据没有第二权威源。
8. 存档及语言字段可迁移，损坏输入安全回退。
9. Shipping 包离线运行，资产来源和许可完整。
10. 动态资源在任务切换和退出时释放。
11. UE4 实际 DX11 画面和日志完成检查。
12. GTX 1050 性能结论来自记录型号的目标硬件实测。

完成标签必须如实使用：

- `IMPLEMENTED`：代码存在，但验证可能未完成。
- `TESTED`：相关自动化门禁通过。
- `UE4 VISUALLY VERIFIED`：真实 DX11 窗口已观察。
- `TARGET HARDWARE VERIFIED`：指定 GTX 1050 已实测。
