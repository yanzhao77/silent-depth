# SILENT DEPTH UE4.27 目标技术架构

> 历史架构提案，已于 2026-09-14 退役；不要再按本文维护另一套架构或执行 Web 行为对照。
> 唯一目标架构现为 [UE4 独立游戏技术架构](plan/07_TECHNICAL_ARCHITECTURE.md)。
> 本文保留原始论证用于追溯，不证明其中模块和接口已实现。

| 字段 | 内容 |
|---|---|
| 状态 | PROPOSED |
| 统一主方案 | `docs/UE4_27_MIGRATION_MASTER_PLAN.md` |
| 目标引擎 | Unreal Engine 4.27.2 |
| 首要目标平台 | Windows 10/11 x64，DirectX 11 |
| 基准开发显卡 | GTX 1050 2GB/4GB |
| 核心语言 | C++ |
| 表现技术 | UE4 Actor、UMG、Niagara、Audio Mixer |
| 配套实施方案 | `docs/UE4_27_MIGRATION_PLAN.md` |

## 1. 决策摘要

迁移采用“重写实现、保持行为”的策略，不在 UE4 中嵌入浏览器或运行
TypeScript。当前 TypeScript 版本在迁移期继续作为行为权威和回归基准。

UE4 目标实现必须保留以下单向数据流：

```text
Player Input
    |
    v
Pure C++ Simulation -> FGameSnapshot -> FRenderState -> UE Presentation
                                              |             |
                                              |             +-> Actor / Camera / Niagara
                                              +----------------> UMG / Audio
```

核心原则：

1. 仿真逻辑使用不依赖 `UWorld`、Actor、UMG 和物理引擎的纯 C++。
2. 仿真只通过固定步长 `Step()` 修改状态。
3. UE Actor 不是游戏事实，只是 `FRenderState` 的可回收视图。
4. 相机、HUD、音频和特效不得读取仿真内部对象。
5. 隐藏目标不得生成 Actor、尾迹、导航灯、声音或相机线索。
6. 迁移期间以当前 TypeScript 运行结果为对照，不同时修改平衡规则。

## 2. 范围

### 2.1 必须迁移

- 五个固定任务 M01-M05 与任务生成器。
- 玩家潜艇、深度层、速度、噪声、电池、船体和探测计。
- 主动/被动声呐、接触状态、误差收敛和分类。
- 商船编队、护航、搜索、LKP 与敌方状态机。
- 火控、无制导鱼雷、深水炸弹、甲板炮和伤害。
- 任务目标、评分、统计、解锁与设置存档。
- 世界、天气、洋流和潜望镜公开状态。
- 战术视图、世界视图、潜望镜、HUD、菜单和事件日志。
- 本地资产、程序化回退、程序化音频或等价本地音频。
- 无头仿真、输入回放、确定性和行为回归测试。

### 2.2 不在首轮迁移范围

- 多人、服务器、账号、云存档和遥测。
- 开放世界和无缝地图。
- Chaos 物理驱动的权威舰船运动。
- 写实流体模拟、体积海洋或潜艇完整内舱。
- 硬件光线追踪。
- 在迁移同时重做平衡、任务规则或控制绑定。
- 直接依赖 UE4 Water 插件的实验性功能。

## 3. 模块划分

UE 项目放在现有仓库的 `ue4/` 下，迁移完成前不移动当前 Web 实现。

```text
ue4/
├── SilentDepth.uproject
├── Config/
├── Content/
│   ├── SilentDepth/Art/
│   ├── SilentDepth/Audio/
│   ├── SilentDepth/Effects/
│   ├── SilentDepth/Maps/
│   ├── SilentDepth/UI/
│   └── SilentDepth/Data/
├── Source/
│   ├── SilentDepthCore/
│   ├── SilentDepthGame/
│   ├── SilentDepthPresentation/
│   └── SilentDepthTests/
└── Tools/
```

模块依赖保持单向：

```text
SilentDepthCore <- SilentDepthGame <- SilentDepthPresentation
       ^                  ^
       +---------- SilentDepthTests ----------+
```

`SilentDepthPresentation.Build.cs` 不声明 `SilentDepthCore` 依赖。Game 模块的
Public 目录只公开 RenderState、展示事件和只读 view source；SimulationSubsystem、
GameSnapshot 与适配器放在 Private 目录。CI 额外检查 Presentation 不得 include
Core 头文件，以编译边界落实单向数据流。

### 3.1 `SilentDepthCore`

权威仿真模块。只依赖标准 C++ 和 UE 的最小 Core 类型，不依赖 Engine。

职责：

- 固定步长与 tick 索引。
- Mulberry32 RNG 与命名派生流。
- 状态机和事件缓冲。
- 世界、任务、潜艇、声呐、AI、战斗、探测和目标。
- `FPlayerInputs`、`FGameSnapshot` 和回放数据。
- JSON 配置解析后的强类型运行时数据。

禁止：

- `AActor`、`UObject`、`UWorld`、TimerManager 和 TickComponent。
- `FDateTime::Now()`、平台时间和非项目 RNG。
- Chaos、碰撞事件、导航系统和异步任务决定游戏结果。
- 依赖 `TMap`/`TSet` 的迭代顺序。

### 3.2 `SilentDepthGame`

UE 生命周期与核心模块之间的桥接层。

职责：

- `USilentDepthSimulationSubsystem` 创建、重启和销毁仿真。
- 累积帧时间，并以 0.05 秒固定步长调用核心 `Step()`。
- 将 UE 输入采样为每 tick 的 `FPlayerInputs`。
- 加载配置和任务数据，拒绝非法数据。
- 维护最新与上一帧 `FGameSnapshot`。
- 调用适配器生成 `FRenderState`。
- 管理存档、关卡流转和开发命令。

该模块是唯一可以同时看见 `FGameSnapshot` 和 `FRenderState` 的模块。
`USilentDepthSimulationSubsystem` 同时实现 `FTickableGameObject`，由 UE 游戏帧
驱动 accumulator；它不依赖关卡中必须存在某个 Actor 才能推进生命周期。

`FRenderState` 的 Public 头文件只能包含表现专用 POD 类型、公开事件和公开天气
视图，不得暴露 `FGameSnapshot`、runtime 指针、真实敌舰列表或任何 `trueShipId`。
如果表现枚举需要与 Core 枚举对应，必须在适配器中显式转换；不得让
`SilentDepthPresentation` 通过传递依赖间接读取 Core 结构。

### 3.3 `SilentDepthPresentation`

表现模块，只能读取 `FRenderState` 和经过筛选的展示事件。

职责：

- 舰船、潜艇、鱼雷和诱饵 Actor 池。
- 世界、战术和潜望镜相机。
- 海面、天空、天气、灯光与后处理。
- Niagara 爆炸、尾迹、声呐波纹和水柱。
- UMG HUD、菜单、简报、暂停和结果界面。
- Audio Mixer、Sound Cue 和空间音频。

禁止：

- 获取 `USilentDepthSimulationSubsystem` 的内部 runtime 指针。
- 根据 Actor 碰撞、距离或可见性回写仿真。
- 为未进入公开 `FRenderState` 的目标创建任何世界提示。

### 3.4 `SilentDepthTests`

开发期测试模块，不打入 Shipping 包。

职责：

- 核心单元测试。
- JSON 回放与基线轨迹比较。
- 隐藏信息、生命周期和资源释放测试。
- M01-M05 无头集成测试。

## 4. 核心接口

接口名称可以在实现阶段调整，但职责和所有权不能改变。

```cpp
struct FPlayerInputs final
{
    double ThrottleKt = 0.0;
    double Rudder = 0.0;
    EDepthLayer DepthTarget = EDepthLayer::Shallow;
    bool bSilentRunning = false;
    bool bPingPressed = false;
    std::string FireContactId;
    bool bDecoyPressed = false;
    bool bPausePressed = false;
    bool bPeriscopePressed = false;
    bool bLockTargetPressed = false;
    bool bEmergencyDivePressed = false;
};

class FGameEngine final
{
public:
    static FGameEngine Create(const FMissionDef& Mission, uint32 Seed);
    FGameSnapshot Step(const FPlayerInputs& Inputs);
    const FGameSnapshot& GetSnapshot() const;

private:
    uint64 TickIndex = 0;
};
```

核心 `Step()` 不接收 UE 帧 `DeltaSeconds`。仿真时间由整数 tick 推导：

```text
FIXED_DT = 0.05 seconds
SimTime = TickIndex * FIXED_DT
```

暂停状态不增加 tick、不消费 RNG、不更新系统。

## 5. 固定步长驱动

`USilentDepthSimulationSubsystem` 在游戏帧中执行：

```cpp
Accumulator += FMath::Min(FrameDeltaSeconds, 0.25f);

while (Accumulator >= FixedDt && StepsThisFrame < MaxCatchUpSteps)
{
    const FPlayerInputs Inputs = InputBuffer.ConsumeForNextTick();
    PreviousSnapshot = CurrentSnapshot;
    CurrentSnapshot = Engine.Step(Inputs);
    Accumulator -= FixedDt;
    ++StepsThisFrame;
}

InterpolationAlpha = Accumulator / FixedDt;
RenderState = Adapter.Build(PreviousSnapshot, CurrentSnapshot, InterpolationAlpha);
```

约束：

- `MaxCatchUpSteps` 建议为 5，超过后记录性能告警，不改变已执行 tick。
- 不使用零时长 tick 追帧。
- 输入边沿事件在被某个仿真 tick 消费前不得丢失。
- `FrameDeltaSeconds` 的上限、追帧上限和是否丢弃超额墙钟时间必须作为明确
  的运行策略。若采用示例中的 `Min(FrameDeltaSeconds, 0.25f)`，必须明确记录
  这是“允许仿真落后于墙钟”的策略，而不是声称完整追平。
- 长时间卡顿可以降低表现帧率，但不能用可变 dt 更新仿真；任务计时只由已执行
  的固定 tick 推导。
- 菜单和暂停状态不得偷偷推进仿真或 RNG。

## 6. 确定性设计

### 6.1 RNG

- 用 `uint32` 按当前 TypeScript 位运算语义移植 Mulberry32。
- `fork(label)` 必须冻结完整算法：seed 先按 uint32 归一化，标签使用 UTF-16
  code unit 做 FNV-1a 32 位哈希，派生 seed 为
  `hash(\`${label}|${originalSeed}\`) XOR parentState`，fork 不消费 parent。
- 保持核心 fork 标签：`world`、`missions`、`submarine`、`sonar`、`ai`、
  `combat`、`detection`、`objectives`；同时记录现有实现使用的
  `world-ocean` 和 `missions-gen`，不得自行改名或合并。
- C++ 无符号整数溢出按模 2^32 处理。
- 建立基础 RNG、每个 fork、`range/int/chance/sign` 以及负数 seed 的跨语言黄金
  向量；至少覆盖 10,000 个连续 `next()` 输出。黄金向量必须进入版本控制。
- Niagara、材质噪声和相机抖动使用独立视觉种子。

### 6.2 执行顺序

固定顺序保持为：

```text
StateMachine
-> World
-> Missions
-> Submarine
-> Sonar
-> Periscope
-> AI
-> Combat
-> Detection
-> Objectives
-> Snapshot Assembly
```

任何新增随机调用或顺序调整都必须更新回归轨迹并经过设计确认。

### 6.3 容器与数值

- 权威实体使用按稳定 ID 排序的数组。
- `TMap` 只可用于查找，不可直接驱动更新顺序。
- 核心计算默认使用 `double`，表现转换时再变为 `float`。
- 不使用 `FMath::Rand`、`FRandomStream` 或物理结果作为权威随机源。
- Windows C++ 核心使用 MSVC `/fp:strict`，禁止 `/fp:fast` 和未审查的 FMA/快速
  数学优化；三角函数调用必须集中在可替换的数学层，并用阈值附近的回放测试
  检查 JS/V8 与 MSVC 的分支差异。
- 三角函数跨平台完全位一致并非默认保证；首个迁移目标限定 Windows x64。
- 若未来要求跨平台逐位一致，需引入定点数或项目自有数学近似层。

## 7. 快照与隐藏信息

`FGameSnapshot` 是仿真输出，`FRenderState` 是唯一表现输入；事件通过独立的
可靠事件通道送入表现层，不能把事件历史尾部当作可靠传输队列。

适配规则：

1. 玩家潜艇始终可进入 `FRenderState`。
2. `VisibleShips` 只包含获得视觉/潜望镜公开许可的舰船，并且只包含允许公开的
   位置、类别、航向和状态。声呐接触本身不得使真实舰船进入该列表。
3. 未知距离的被动接触只输出方位和误差，不推测距离。
4. 接触估计位置和椭圆根据公开观测构建，不读取真实敌舰位置；如需显示声呐
   目标，必须使用独立的 `RenderContact`，不能伪装成舰船 Actor。
5. 事件缺少公开位置时不生成位置特效。
6. 相机候选、尾迹、灯光、音频和自动构图只遍历可见实体。
7. 目标从可见变隐藏时立即回收 Actor，并清除其附属组件和轨迹。

`FRenderState::VisibleShips` 只包含可见舰船，而不是将完整敌舰列表暴露给表现
模块。为生命周期需要保留的状态放在适配器内部，不进入表现契约。命中、沉没等
事件若没有公开坐标，只能播放无位置或基于公开接触估计的效果，禁止用
`targetShipId` 回查真实敌舰位置。

### 7.1 事件传递契约

- 每个固定 tick 产生一个按 emission sequence 排序的事件批次，并带有 session
  ID、单调事件 ID 和 tick；表现层通过游标消费批次。
- `eventLog` 只能作为最近事件的 UI 历史，不承担音频、特效和 HUD 的可靠投递。
- 队列溢出、游标落后或事件无法映射时必须显式记录诊断信息；不得静默补猜位置
  或状态。
- 任务重启时 session ID 和事件游标一起重置，不能依靠跨任务全局事件 ID。

`FGameSnapshot` 必须包含当前公开天气 `ActiveWeather` 或等价的公开天气视图。
天气转换只在 Core 的 World 系统中执行一次；适配器消费该字段，不再次解析
`MissionDef.weather`。

## 8. 坐标与单位

仿真继续使用公里，避免重写平衡数值。UE 仅在适配器边界转换为厘米。

```text
Engine x = east km  -> UE Y = x * 100000 cm
Engine y = north km -> UE X = y * 100000 cm
Depth metres down   -> UE Z = -depth * 100 cm
Heading 0 north     -> UE Yaw 0
Heading 90 east     -> UE Yaw 90
```

地图宽 30 km，对应约正负 1,500,000 cm。首版无需 World Origin Rebasing，
但所有长期轨迹和战术计算仍保留在 double 精度仿真坐标中。

表现插值只处理位置、航向和视觉姿态：

- 角度使用最短路径插值。
- 不插值离散状态、命中、弹药、目标完成或接触分类。
- Pitch、Roll、浪涌是视觉派生值，禁止回写仿真。

## 9. 领域系统映射

| 现有模块 | UE4 核心组件 | 迁移规则 |
|---|---|---|
| `src/core` | `Core/Engine`, `Core/Rng`, `Core/Time` | 首先移植并锁定接口 |
| `src/world` | `World/WorldModel` | 洋流和天气仍为纯查询 |
| `src/missions` | `Missions/MissionService` | 配置驱动，固定任务先行 |
| `src/gameplay` | `Gameplay/SubmarineSystem` | 不使用 Pawn Movement 作为权威运动 |
| `src/sonar` | `Sonar/SonarSystem` | 接触与真实目标严格分离 |
| `src/ai` | `AI/FleetSystem` | 不用 Behavior Tree 决定权威状态 |
| `src/combat` | `Combat/CombatSystem` | 不依赖碰撞回调判断命中 |
| `src/periscope` | `Periscope/PeriscopeSystem` | 仿真事实与相机分离 |
| `src/save` | `Save/SaveService` | 版本化、校验后加载 |
| `src/sim` | `Commandlets/SimCommandlet` | 支持无渲染运行 |

## 10. UE 表现层

### 10.1 Actor 生命周期

- `ASilentDepthWorldPresenter` 是表现入口。
- 按稳定实体 ID 维护 Actor 池，不让 Actor 自己 Tick 游戏逻辑。
- Presenter 每表现帧应用 `FRenderState`。
- 未出现的实体回池，隐藏实体立即停止 Niagara、音频和灯光。
- 几何、材质实例和 Niagara System 由资产管理器共享。
- 关卡退出时集中释放动态材质、Render Target 和音频组件。

### 10.2 相机

三种相机模式：

- World：低成本第三人称或高位跟随。
- Tactical：正交俯视，显示公开接触和误差图形。
- Periscope：较窄 FOV，圆形遮罩和方位刻度。

切换相机不改变仿真。自动构图只能考虑玩家和可见实体。

### 10.3 海洋与天气

GTX 1050 基线采用：

- 跟随相机的有限尺寸海面网格。
- 2-4 组 Gerstner/WPO 波，不做真实流体。
- Reflection Capture 为默认，低画质关闭 Planar Reflection。
- Exponential Height Fog；低画质关闭 Volumetric Fog。
- 简化方向光、Sky Light 和颜色分级。
- 雨、泡沫、尾迹和爆炸全部限额并池化。

不要让波浪位移参与权威碰撞或命中。

### 10.4 战术绘制

战术地图建议使用自定义 UMG/Slate 绘制：

- 网格、距离环、方位线。
- 接触符号、误差椭圆和状态颜色。
- 鱼雷和公开任务区域。
- 不绘制真实但未公开的敌舰位置。

## 11. 输入

保持当前键位语义：

- W/S 或方向上下：速度控制。
- A/D 或方向左右：方向舵。
- Q/E：深度层。
- Space：主动声呐。
- F：发射鱼雷。
- R：静默运行开关。
- G：诱饵。
- P：升降潜望镜；L：锁定潜望镜目标；X：紧急下潜；Escape：打开暂停菜单。

UE 输入只写入 `FInputBuffer`：

- 持续输入每 tick 采样。
- Ping、Fire、Decoy、Pause、Periscope、LockTarget、EmergencyDive 使用边沿队列。
- OS 自动重复不得重复触发边沿动作。
- 输入不得直接改变 Pawn Transform 或仿真对象。

## 12. UI、音频与存档

### 12.1 UMG

- `UHUDViewModel` 接收公开快照字段和展示事件。
- Widget 不查询世界 Actor 获取战术事实。
- 中央游戏区域保持清晰，桌面和窄窗口都要做布局测试。
- 菜单状态由游戏状态机驱动，不在 Widget 内维护第二套状态机。

### 12.2 音频

- 使用 UE4 Audio Mixer、Sound Cue 和必要的 `USoundWaveProcedural`。
- 音频触发来自公开事件。
- 敌舰空间音频必须通过可见性/可听性公开规则。
- 所有声音本地打包，运行时不访问网络。

### 12.3 存档

- 使用 `USaveGame` 保存版本化二进制数据。
- 同时保留 JSON 导入器，支持迁移浏览器版存档。
- 存档字段必须覆盖当前 schema 的 `unlockedMissions`、`bestScores`、
  `statistics`、音频/显示/输入设置和 `settings.app.language`。
- 载入内容视为不可信输入：校验版本、任务 ID、范围和枚举。
- 未识别版本返回安全默认值，不崩溃、不部分应用。
- Shipping 包不允许控制台命令修改进度。

## 13. 配置与内容数据

迁移初期保留 `ue4/SilentDepthUE/Config/balance.json` 与 `Config/missions.json` 为权威输入，
通过构建期导入或启动期本地读取生成强类型结构。

规则：

- Shipping 包只读取打包内的只读配置。
- 缺字段、非法枚举、NaN 和越界值导致加载失败并给出明确错误。
- 不在 Blueprint、DataTable 和 C++ 中复制同一平衡数值。
- 编辑器 Data Asset 可以作为查看界面，但不得成为第二权威源。

## 14. 资产管线

现有项目自有 GLB 先经 Blender 转换为 FBX：

```text
GLB source
-> Blender validation
-> scale/origin/normal/material check
-> FBX export in centimetres
-> UE import
-> LOD assignment and collision
-> packaged asset audit
```

资产门禁：

- 保留来源、作者、许可、SHA-256、三角面和 LOD 元数据。
- UE 派生 `.uasset` 记录源资产 ID。
- 未知来源或不允许商业使用的资产不得进入 Content。
- 可选资产失败时保留程序化或基础几何回退。
- 运行时零 CDN、零远程下载、零追踪器。

## 15. GTX 1050 性能预算

以下是目标，不是已经验证的结果：

| 指标 | Low 目标 |
|---|---|
| 分辨率 | 1920x1080；2GB 型号允许降至 1280x720 |
| 帧率 | 打包版稳定 30 FPS |
| 渲染线程/GPU 帧预算 | 不超过 33.3 ms 总帧预算 |
| 可见三角面 | 建议小于 500K |
| Draw Calls | 建议小于 250 |
| 常驻纹理 | 以 1K 为主，英雄资产最多 2K |
| 同时活动粒子 | 建议小于 2,000，按画质缩放 |
| 动态阴影舰船 | 只保留近景关键对象 |

Low 配置默认关闭：

- Volumetric Fog。
- Planar Reflection。
- 高成本 Screen Space Reflection。
- 高采样景深和 Motion Blur。
- 非关键透明粒子和远距离动态阴影。

性能验收必须在实际 GTX 1050 机器的 Shipping/Development 打包版上进行，
不能用编辑器或自动化截图推断帧率。

## 16. 构建与源代码管理

推荐工具链：

- UE4.27.2 Launcher 版。
- Visual Studio 2019 16.11、MSVC v142、Windows 10 SDK。
- Git 与 Git LFS。
- Blender LTS 或项目锁定版本。

不提交：

```text
ue4/Binaries/
ue4/DerivedDataCache/
ue4/Intermediate/
ue4/Saved/
ue4/.vs/
```

使用 Git LFS 管理：

```text
*.uasset *.umap *.fbx *.glb *.wav *.png *.tga
```

Blueprint 应保持小而专一；核心规则、复杂分支和可测试逻辑必须在 C++。

## 17. 架构验收条件

目标架构只有在以下条件全部满足时才算成立：

1. M01-M05 可由同一纯 C++ 核心在无渲染模式完成。
2. 同 seed、同输入、同构建得到相同的快照与事件序列。
3. TypeScript 与 C++ 的离散结果一致，浮点结果在批准容差内。
4. Presentation 模块无法直接访问核心 runtime。
5. 隐藏目标不会生成 Actor、灯光、声音、尾迹、镜头和特效提示。
6. 暂停不推进 simTime 或 RNG。
7. 存档损坏时安全回退。
8. Shipping 包离线运行且无外部网络请求。
9. 所有动态资源在任务退出和应用退出时释放。
10. 事件通道在低帧率、长帧和历史日志溢出场景下不静默丢失。
11. 当前天气、输入边沿和回放 schema 均有单一权威定义。
12. GTX 1050 性能结论来自目标硬件实测并记录配置。
