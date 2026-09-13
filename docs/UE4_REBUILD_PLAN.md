# SILENT DEPTH —— UE4.27 重构需求与落地计划

| 字段 | 值 |
|---|---|
| 上游项目 | SILENT DEPTH（TypeScript/Three.js Web 版，本仓库） |
| 本文件 | UE4.27 重制需求基线 + 落地计划 |
| 文档版本 | v0.1（供评审，非验收基线） |
| 日期 | 2026-09-05 |
| 需求来源 | `docs/GAME_DESIGN.md` · `docs/GAME_ARCHITECTURE.md` · `docs/V2_ARCHITECTURE.md` · `docs/VISUAL_STYLE.md` · `docs/ASSET_PIPELINE.md` · `docs/AUDIO_DESIGN.md` · `docs/V2_RENDERING.md` · `docs/V2_PERFORMANCE.md` · `docs/V2_PERISCOPE.md` · `docs/V2.4_OCEAN.md` · `docs/V2.4_HERO_ASSETS.md` |
| 引擎 | Unreal Engine 4.27.2（安装于 `C:\game\Epic Games\UE_4.27`） |
| 工程 | `C:\workspace\ue4\SilentDepthUE`（纯英文路径，蓝图起步） |
| 操作方式 | 命令行/编辑器脚本为主，编辑器 UI 用于视觉验证 |

---

## 1. 背景与目标

当前仓库的 SILENT DEPTH 是一个“headless 确定性仿真 + Web 渲染层”的游戏。
本次任务不是把 TypeScript 源码机械翻译，而是以仓库现有设计文档为需求来源，
在 UE 4.27 中**重新实现一款同设计的 3D 战术潜艇游戏**，并保留以下不可妥协点：

1. 核心玩法仍是“不确定性下的决策”：被动声呐优先、主动 ping 是风险/回报杠杆。
2. 仿真与表现必须解耦；表现层永远不能回写仿真。
3. 同 seed + 同输入序列必须产出同结果（确定性，replay 可复现）。
4. 游戏和编辑器运行时完全离线，无 CDN、无外部下载、无来源不明资产。
5. Web 版继续作为数值/逻辑权威参照，不被本计划改动。

当前阶段只承诺第一步：**蓝图工程 + 可展示、可驾驶验证的海洋场景技术演示**；
完整系统按第 7 节里程碑推进，不承诺一次全部完成。

---

## 2. 需求基线（来自现有文档）

### 2.1 玩法需求摘要

| 领域 | 权威文档 | 关键约束 |
|---|---|---|
| 玩家潜艇 | GAME_DESIGN §4 | 4 档速度、5 层深度（Surface/Periscope/Shallow/Medium/Deep）、电池、船体、噪声、探测计 |
| 声呐 P0 | GAME_DESIGN §5 | 主动 ping 10 km / 被动 5–15 km / 接触 5 状态 / 不确定性收敛 / 分类链 |
| 敌方 AI | GAME_DESIGN §6 | NORMAL→SUSPICIOUS→ALERT→SEARCHING→HUNTING→LOST_CONTACT；编队 2×2 + figure-8 护航 |
| 鱼雷/火控 | GAME_DESIGN §7 | 无自锁、直航鱼雷、固定提前角火控、HP 模型、伤害结算 |
| 探测/逃脱 | GAME_DESIGN §8 | 探测计不自动回落；LKP 误差；decoy；ESCAPED 判定 |
| 任务/评分 | GAME_DESIGN §9–10 | 5 个固定任务 + seeded 生成器；评分权重 40/20/15/10/10/5 |
| 世界/天气 | GAME_DESIGN §9.1/9.3 · V2_RENDERING §6 | 30 km×30 km 巡逻海域；Clear/Cloudy/Storm/Fog/Night |
| UI/HUD | GAME_DESIGN §11 · VISUAL_STYLE §12 | Modern AI Mission Control 风格，冷海军蓝 + 青色强调 |
| 资产 | ASSET_PIPELINE · V2_ASSETS | 程序化优先、零外部、离线、license gate |
| 音频 | AUDIO_DESIGN | ≥10 SFX 全程序合成、暗色/极简/水下/军事 |
| 确定性 | GAME_ARCHITECTURE §5 | seeded RNG、固定 tick 顺序、无墙钟 |

### 2.2 平衡数值

所有数值权威来源是 GAME_DESIGN §12/§15 与 `ue4/SilentDepthUE/Config/balance.json`
（该文件自 Web 版逐字节拷贝而来，Web 版在 `master` 分支）。
UE 工程内部可以转存为 JSON/DataTable，但**禁止脱离来源另立数值**；
任何平衡调整都回到 Web 版配置并双端同步。

### 2.3 视觉与表现基线

以 V2 系文档为准，不是把 v1 俯视 2D 直接复制进 UE：

- 海面 Z=0；引擎 2D 逻辑坐标 `x=east, y=north(km)` → UE 3D `X=east, Y=-north, Z=up`。
- 深蓝/冷色海军调色板（见 VISUAL_STYLE §2 与 §12 token）。
- 玩家潜艇“黑但可读”：湿表面高光 + Fresnel rim，不自发光。
- 敌船可见性由声呐/潜望镜决定：不可见实体不渲染、不出尾迹、不出现提示。
- 海面分近/中/远/地平线四层，风暴有泡沫条带与暗谷（V2.4_OCEAN）。
- 天气直接驱动浪高、雾密度、光照与天空色（V2_RENDERING §6 数值表）。
- 相机：世界（第三人称跟随）、潜望镜（P 键、圆形光学遮罩）、战术俯视（Tab）。
- 性能预算参考 V2_PERFORMANCE：桌面 60 FPS、绘制调用 <80、三角形 <500K、
  粒子池化、无每帧分配。

---

## 3. UE4 重构架构原则

### 3.1 单向数据流映射到 UE

```text
逻辑仿真（GameState 持有，纯 C++，固定步长）
        │ GameSnapshot/事件（只读结构）
        ▼
GameMode/GameState → Actor/组件表现层（蓝图或 C++）
        ▼
Renderer/UI（UMG、Niagara、Water、后处理）
```

UE 的 Gameplay Framework 分工建议：

| UE 类型 | 对应职责 |
|---|---|
| `UGameInstance` | 全局会话、任务选择、存档/设置注入 |
| `AGameModeBase` | 任务配置装配、玩家生成、规则判定入口 |
| `AGameStateBase` | 只读仿真状态（同 GameSnapshot 契约） |
| `APlayerController` | 输入映射与表现输入→逻辑输入转换 |
| `APawn`/`AActor` | 潜艇、敌船、鱼雷、decoy 的表现 Actor |
| 自定义 `UActorComponent` | 潜艇/声呐/AI/战斗等逻辑组件（最终 C++） |
| `UGameInstanceSubsystem`/`UDeveloperSettings` | 平衡配置加载 |
| UMG | HUD/菜单/事件日志/火控卡 |

### 3.2 确定性策略

- 仿真层只允许 C++ 固定步长（如 20 Hz = 0.05 s）驱动，不使用 Blueprint
  Tick/Timer/Event 驱动决策，防止顺序不确定。
- 自定义 seeded PRNG（与 Web 版 mulberry32 行为一致或可移植等价实现），
  固定子系统 tick 顺序：world → missions → submarine → sonar → ai →
  combat → detection → objectives。
- 表现层动画可用真实时间/渲染插值，但绝不回灌仿真。
- 存档记录 `{missionId, seed}` + inputs 序列，支持回放验证。
- UE 物理仅用于表现（浮力、破碎、镜头反馈），不参与裁决，除非某系统
  明确需要，并必须隔离到可测逻辑。

### 3.3 Blueprint 与 C++ 边界

本阶段以**蓝图工程**起步（场景、材质、UI、验证用输入映射），但完整游戏
落地前必须引入 C++ 模块，原因：

- TypeScript 源码无法在 UE 里“复用”，核心逻辑需要重新用类型安全 C++ 实现；
- Blueprint 不适合承载海量确定性分支与可测纯函数；
- 仓库 AGENTS 的“头less-first、确定性、可测”要求只有 C++/Automation 能稳定满足。

决策：UE-M3（第 7 节）开始时为工程添加 C++ Runtime Module `SilentDepthCore`，
把平衡表、PRNG、状态机与纯规则先落为 C++ 层；蓝图只做表现/UI。

---

## 4. 工程与插件选型

### 4.1 工程基线

- 类型：Blueprint（当前）；路径 `C:\workspace\ue4\SilentDepthUE`。
- 根地图规划：`Content/Maps/Ocean_Showcase.umap`（海洋技术演示）。
- 默认渲染：Forward/延迟按 4.27 默认，先不开光追。
- 单位约定：UE 1 单位 = 1 cm；1 km = 100000 单位。

### 4.2 启用的引擎插件

基于 UE 4.27 自带插件（无商城、无外部下载）：

| 插件 | 用途 | 说明 |
|---|---|---|
| Water（Experimental） | 海面水体、波浪、水下 | 需同时启用其依赖插件 |
| Landmass | 水体与地形/网格雕刻协作 | Water 依赖 |
| Niagara | 雨、浪花、粒子 | Water 依赖 |
| GeometryProcessing | 网格处理 | Water 依赖 |
| BlueprintMaterialTextureNodes | 材质节点蓝图访问 | Water 依赖 |

水上/水下场景后续按需启用 Landscape 编辑与体积雾能力；
不引入 Marketplace 付费水体/海洋资产，优先引擎自带能力 + 项目自建材质。

### 4.3 大型世界风险对策

30 km×30 km 对 UE 是巨大世界。第一阶段海洋演示先以玩家/相机为中心的
“可平移到任意 10 km 级区块”策略，配合：

- 逻辑坐标用 double/km 结构，不把公里数量接塞进 float 世界位置做裁决；
- 表现 Actor 接近时使用 World Origin Rebasing 或区块原点包装；
- 水面网格用 Water 插件自带的 LOD/流式机制，不手工铺 30 km 连续网格；
- 后续任务按 M01–M05 的 patrolArea 逻辑，不要求单帧加载全图。

---

## 5. FR-01..22 → UE 落地映射（规划）

| FR | 需求 | UE 落地 |
|---|---|---|
| FR-01..03 | 潜艇状态/动作/速度/深度 | C++ Submarine 组件 + APawn；四档速度/五层深度 |
| FR-04..08 | 声呐/接触/不确定性/分类 | C++ Sonar 组件；DataTable 类型表；HUD 不确定椭圆 |
| FR-09..10 | 编队/护航/AI/搜索 | C++ AI 组件（不用 UE 行为树做决策主体；表现层可包装） |
| FR-11 | 鱼雷/火控/命中 | C++ 弹道与裁决；Niagara 尾迹表现 |
| FR-12 | 探测/逃脱/decoy | C++ Detection 组件；UMG 探测计分带 |
| FR-13 | 电池/船体 | C++ 资源状态；HUD/告警 |
| FR-14..15 | 任务/生成器 | C++ Mission 定义 + seeded 生成；DataTable/JSON |
| FR-16 | 世界/海洋 | Water 插件 + 自建材质/体积雾 |
| FR-17 | 天气 | 数据驱动天气状态；场景/光照/雾/浪高联动 |
| FR-18 | UI/HUD/日志 | UMG；Modern AI Mission Control token 化 |
| FR-19 | 状态机/存档 | UE SaveGame + 版本校验；GameInstance 状态机 |
| FR-20 | 评分 | C++ 纯函数 + UMG 结算 |
| FR-21 | 资产 | 引擎自建/程序化几何 + 项目本地注册表与 license 记录 |
| FR-22 | 音频 | 程序化音效（合成素材）或逐项通过 license gate 的本地音频 |
| NFR-1 | 性能 | 池化、LOD、材质共享；桌面 60 FPS 目标 |
| NFR-2 | 离线 | 零运行时网络/远程插件依赖 |
| NFR-3 | 确定性 | C++ seeded PRNG + replay 测试 |
| NFR-5 | 数值单一源 | UE 侧导入 `balance.json` 生成 DataTable |
| NFR-6 | headless/playtest | UE Automation + 命令行任务跑法 |

---

## 6. 首个可交付目标：海洋场景

### 6.1 场景内容

1. **海面**：WaterBodyOcean（或等价的引擎水体），海面 Z=0；
   默认 Clear 状态，可切 Cloudy/Storm/Fog/Night 做视觉验证。
2. **天空与光照**：方向光 + 程序化/引擎天空；夜间降低光照并保留冷色 rim。
3. **水下环境**：水下能见度、指数高度雾/体积雾、深水色随深度过渡；
   摄像机预设支持“水上”“水下 20 m”“水下 100 m”。
4. **调色板验证**：把 VISUAL_STYLE §2 主色（#050a12/#0a1626/#0d2233/
   #14303f 等）转成 UE 线性参考值作为材质基线。
5. **演示载体**：临时“灰盒”潜艇占位（水面/水下可移动），用于验证
   海面以下相机与浪面相交，不作为正式资产。
6. **天气联动开关**：Editor Utility Widget/蓝图演示切换天气，输出
   V2_RENDERING §6 对应浪高/雾密度/光照数值。

### 6.2 不纳入第一个海洋场景

- 正式船模与水面舰艇（后续里程碑）；
- 声呐/HUD 完整玩法（后续里程碑）；
- 30 km 全地图网格；
- 商船编队 AI。

### 6.3 验证标准

| 项 | 方式 |
|---|---|
| 工程能加载 | `UE4Editor.exe project` 无编译/插件错误 |
| 海面与波浪 | Editor 视口截图 + Water 材质在运行时无错误 |
| 水下透视 | 水下摄像机截图；海面以上/以下切换无穿帮级问题 |
| 天气切换 | Clear/Storm/Night 截图对比，与设计值一致 |
| 性能 | 演示场景 GPU/帧耗时记录（本机为参考，标注机器型号） |
| 完成标签 | 仅标注实际执行到的程度：IMPLEMENTED / TESTED / EDITOR VERIFIED / TARGET HARDWARE VERIFIED |

### 6.4 当前已交付（2026-09-05）

工程固定在 `C:\workspace\ue4\SilentDepthUE`，主展示地图为 `Ocean_Main`（Clear），
并额外生成 `Ocean_Cloudy` / `Ocean_Storm` / `Ocean_Night` 三张天气对比图。

**每张地图的内容（一致，仅天气/曝光不同）**
- `WaterMeshActor`：TileSize=10000，ExtentInTiles=200×200；
- `WaterBodyOcean`：`WaterMaterial = MI_Ocean_SilentDepth`，`UnderwaterPostProcessMaterial = MI_UnderWater_SilentDepth`；
- `SkyAtmosphere` + `DirectionalLight`（高仰角冷色太阳）+ `ExponentialHeightFog` +
  `SkyLight`（实时捕获天空）+ `PlayerStart` + `PostProcessVolume`（固定曝光）。

**材质**
- `MI_Ocean_SilentDepth`：继承 `/Water/Materials/WaterSurface/Water_Material_Ocean`，
  设置 `Water Albedo / Absorption / Scattering / Foam Scattering` 为设计墨蓝冷色
  （线性近似 VISUAL_STYLE 的 #0d2233 / #14303f 系）。
- `MI_UnderWater_SilentDepth`：继承 `M_UnderWater_PostProcess_Volume`，
  设置吸收 / 散射 / Fog 颜色为冷蓝，`Fog`、`Max Depth`、`Near Plane` 控制能见度与深水过渡。

**天气预设（每张地图）**

| 地图 | 光照强度 | 光色 | 雾密度 | 固定曝光 |
|---|---|---|---|---|
| Ocean_Main（Clear） | 6.5 | 白 | 0.0012 | 0.40 |
| Ocean_Cloudy | 3.0 | 冷灰 | 0.004 | 0.40 |
| Ocean_Storm | 0.7 | 暗灰 | 0.016 | 0.40 |
| Ocean_Night | 0.38 | 冷蓝 | 0.008 | 0.40 |

**证据（Editor 视口截图 1600×900，已存于 `artifacts/ocean/`）**

| 天气 | 画面平均 RGB | 天空（上 40%） | 水面（下 45%） |
|---|---|---|---|
| Clear | 76,118,147 | 100,134,160 | 48,97,131 |
| Cloudy | 35,52,66 | 45,61,74 | 22,40,55 |
| Storm | 8,13,23 | 10,15,27 | 6,10,17 |
| Night | 0,1,3 | 0,1,3 | 0,0,2 |

**完成标签**
- 海面材质（墨蓝冷色）：**EDITOR VERIFIED**（截图 + 色值量测，蓝远高于红/绿，Cold Blue）。
- 天气切换演示：**EDITOR VERIFIED**（四张截图呈清晰明暗/色温梯度：Clear→Cloudy→Storm→Night）。
- 水下环境（能见度/深水色）：**EDITOR/PIE VERIFIED**（已配置 `UnderwaterPostProcessMaterial` 与
  `MI_UnderWater_SilentDepth`；2026-09-05 玩家实机确认“相机沉到水下可以看到”，
  即 Water 插件的水下后处理在运行时有效）。
- 性能：**NOT VERIFIED**（未在本机做帧耗时测量）。

---

## 7. 里程碑与验收门禁

| 阶段 | 内容 | 出口门禁 |
|---|---|---|
| **UE-M0 工程初始化** | 创建 SilentDepthUE 蓝图工程；启用 Water 依赖插件；配置项目默认设置 | 命令行可无错打开；本计划文档落地 |
| **UE-M1 海洋场景** | Ocean_Main/Cloudy/Storm/Night 地图：海面、天空、光照、水下环境、天气切换演示 | Editor 视口验证 + 截图证据；无运行时资产下载。已完成：海面材质与天气切换（EDITOR VERIFIED）；水下环境玩家实机确认（EDITOR/PIE VERIFIED）。性能未计 |
| **UE-M2 潜艇灰盒** | 玩家潜艇占位 Actor：W/S/A/D/Q/E 输入、水面/下潜深度切换、水下相机 | PIE 可驾驶；深度 HUD 数值正确；输入映射记录。已完成：C++ 模块编译通过（BUILD VERIFIED）；GameMode/潜艇 Pawn 类加载 + PIE 驾驶 + 深度数值玩家实机确认（EDITOR/PIE VERIFIED）；输入映射已记录 |
| **UE-M3 逻辑核心 C++** | 工程加 C++ 模块；移植 balance 读取、PRNG、状态机、子系统纯规则；BP 保持表现 | UBT 编译通过；确定性单测通过 |
| **UE-M4 声呐与 HUD** | 接触/不确定性/分类的仿真 + UMG 顶栏/接触面板/事件日志/火控卡 | 集成测试 + Editor/PIE 截图 |
| **UE-M5 AI/战斗/任务** | 敌船/护航/鱼雷/深弹/探测/逃脱/5 任务与生成器 | M01–M05 在 PIE/命令行跑通并满足数值设计 |
| **UE-M6 打磨与发布验证** | 性能、镜头、材质、UI、离线与资产审查、回放测试 | 完整门禁 + 目标硬件证据 |

> 若阶段验收发现 UE 与 Web 行为不一致，以 GAME_DESIGN/GAME_ARCHITECTURE
> 数值与状态机为裁判，先改 UE 侧，必要时回改 Web 侧时走现有仓库流程。

### 7.1 UE-M2 交付记录（2026-09-05）

**已落地**
- 工程新增 C++ 模块 `SilentDepthUE`（`EngineAssociation=4.27`，Runtime，LoadingPhase=Default）；
  `Source/SilentDepthUE` 下为 `SubmarinePawn`、`SilentDepthGameMode`、`SilentDepthHUD` 与模块实现。
- 用 `UnrealBuildTool` 编译 `SilentDepthUEEditor`（Win64 / Development）**通过**，产出
  `Binaries\Win64\UE4Editor-SilentDepthUE.dll`；工具链为 **VS2022 14.44 + Windows 10.0.26100.0 SDK（C:\Windows Kits\10）**。
- `DefaultEngine.ini`：`GlobalDefaultGameMode=/Script/SilentDepthUE.SilentDepthGameMode`。
- `PlayerStart` 已移至水面（Z=100，depth 0），潜艇出生在 Surface 层。
- 编辑器实机加载验证：`SilentDepthGameMode` / `SubmarinePawn` 类均能加载，无输入配置错误。

**输入映射（`Config/DefaultInput.ini`）**

| 轴 | 键 | 说明 |
|---|---|---|
| MoveForward | W / S | 前进 / 后退 |
| Turn | A / D | 左转向 / 右转向（另含 MouseX 可鼠标转向） |
| MoveDepth | E / Q | 上浮 / 下潜 |

**关键数值（灰盒）**
- `BaseSpeed=1900` cm/s；`TurnRate=40` deg/s；`DepthRate=650` cm/s；`MaxDepthM=150` m。
- 深度换算：世界 Z=0 为海面，`CurrentDepthM = max(0, -Z/100)`（米）。
- HUD 顶层绘制 `DEPTH %d m` + 深度层名（SURFACE/PERISCOPE/SHALLOW/MEDIUM/DEEP/ABYSS，对齐 GAME_DESIGN §4.4）。

**真实潜艇模型复用（2026-09-05）**
- 来源：Web 仓 `public/assets/v3/models/hero-submarine-lod0.glb`（**CC0 / project-owned / 仓库脚本生成 / status=approved**），
  无许可/出处障碍；7 个 PBR 材质（WetMetal/Glass/Deck/Rubber/PaintedSteel/Bronze/WaterlineDirt），无贴图。
- UE 接入：`.uproject` 启用自带 **GLTFImporter**（4.27 直接吃 .glb，无需 Blender/转 FBX）。
- 因该导入器会按部件拆成 49 个网格，先用 `tools/ue4/merge_submarine_glb.py` **展平合并成单一 glTF mesh**
  （按材质分 primitive，11650 顶点），再导入为单个 **`SM_HeroSubmarine`**。
- 朝向修正（关键踩坑）：船体网格原为根组件，其相对旋转被 actor 旋转同步覆盖；改为 **根 SceneComponent + 船体子组件**，
  在子组件设 **Yaw −90°**（glTF 长轴在局部 +Y、艏在 +Y，−90° 使艏对齐 +X 前进轴）。类 probe 实测 rel_rot=Quat(0,0,−0.707,0.707)。
- 艉螺旋桨放大：模型原生桨叶偏小（直径≈0.9m），合并时绕桨毂放大 **2 倍**（艉端由 Z=−10.25→−10.46），玩家能看到艉桨。
- 材质：glTF 导入器只建了材质槽引用却没保存材质资产（悬空引用导致加载报错 + 灰白）。改为自建 **`M_SubmarineHull`**
  （BaseColor≈#050f19 近黑冷蓝、Metallic 0.6、Roughness 0.3 湿面高光），用 `set_material(i, mat)` 填满 7 槽，
  消除 LoadErrors 并实现“黑但可读、湿表面高光”。
- 相机：弹簧臂 30 m、抬高 2.5 m、俯角 8°；比例 1.9（舰长约 38 m）。

**完成标签**
- C++ 编译：**BUILD VERIFIED**（UBT 通过、模块 DLL 生成）。
- 类加载/放置：**EDITOR VERIFIED**（GameMode/Pawn 加载成功，PlayerStart 已挪）。
- PIE 可驾驶 + 深度 HUD 数值：**EDITOR/PIE VERIFIED**（2026-09-05 玩家实机确认“确认能开 + 深度数值正常”：W/S 前进后退、A/D 转向、Q/E 上下潜，左上角 DEPTH 随深度变化正确）。
- 真实模型复用（朝向/比例/艉桨/深冷钢材质 + 启动无材质报错）：**EDITOR/PIE VERIFIED**（2026-09-05 玩家实机确认）。

### 7.2 UE-M3 交付记录（第一步：确定性核心基础设施，2026-09-05）

**目标**：把 Web/TS 的权威仿真基础设施搬成 UE C++（BP 仅表现）。(GAME_ARCHITECTURE ADR-004 / §4 / §5)

**已落地（`Source/SilentDepthUE/Core/`）**
- `Rng.h/.cpp`：**mulberry32**（`src/core/rng.ts` 逐位一致，含 `fork(label)` FNV-1a 派生；RNG 唯一随机源，无墙钟/Math.random）。
- `GameState.h` + `GameStateMachine.h/.cpp`：`BOOT→MENU→MISSION_LOADING→MISSION_RUNNING⇄PAUSED→VICTORY/DEFEAT→MISSION_RESULT→MENU`；
  非法转移在 C++ 以 `Transition()` 返回 `false`（状态不变）作为 fail-fast 等价实现（TS 为抛错，避免 UE 跨 CD 异常）。
- `FixedStep.h/.cpp`：固定 0.05s 步长累加器（20Hz，防螺旋 0.25s 上限），镜像 `src/core/time.ts`。
- `Balance.h/.cpp`：类型化读取 `Config/balance.json`（已拷贝入库，ADR-002/NFR-5），校验必填键。

**确定性单测（`Core/CoreTests.cpp`，跑法 `UE4Editor-Cmd -ExecCmds="Automation RunTests SilentDepth.Core;Quit"`）**：
- `Rng.Mulberry32MatchesReference`：seed=42 前 5 值与 TS 参考序列逐值一致 ✅
- `Rng.DeterminismAndFork`：同种子同序列、异种子异序列、fork 确定性、range/int/sign 越界守卫 ✅
- `StateMachine.Transitions`：合法转移链 + 非法转移被拒且状态不变 ✅
- `FixedStep.Accumulator`：0.12s→2步/0.02余量；2s 帧被 0.25s 上限截为 5 步 ✅
- `Balance.Load`：读出 capacity=100 / playerMax=100 / turnRate=3.0 / maxDepthM=120 / 4 档 / 5 层 ✅

**发布链**：`SilentDepthUE.Build.cs` 增加 `Json`/`JsonUtilities` + `PublicIncludePaths.Add(ModuleDirectory)`（`Core/*.h` 可用）。

**第二步：玩家潜艇纯规则（src/gameplay/submarine.ts 移植，2026-09-05）**
- `Core/SubmarineCore.h/.cpp`：`FSDPlayerInputs`（throttle/rudder/depthLayerTarget/silentRunning/diveEdge）、
  `FSDSubmarineState`（速度档/速度/航向/位置/km/深度层/深度过渡计时/深度m/电池/低电量/静默/船体/噪声/越界计时/诱饵数）。
- 纯规则（确定、不消费 RNG）：`bandForTargetSpeed`（档间空隙吸向更快档）、`clampSpeedToBand`、
  `RawBandNoise`/`BandNoise`（F1 + 跨档单调下限）、`ComputeNoise`（F1+深度修正均值+船体伤害加成+风暴水面加成，夹 0..100）、
  `LayerDistance`/`LayerMidM`、`SubmarineStep`（速度积分/舵向/北向上位移 sin/cos/F2 深度过渡计时/电池耗充+低电量上限+0 强制上浮/越界计时）。
- `FSDBalance` 扩为潜艇完整字段：speedBands[4]、noiseInterp（STOPPED 为数字）、depthLayers[5]、rudder、battery、hull、world、weather.Storm、decoy。修正：JSON 字段取值避免 `GetObjectField` 作用在数字字段（`noiseInterp.STOPPED`）触发 LogJson Error 被判测试失败。
- 单测 `Submarine.StepDeterministic`：同输入 120 步 → 完全一致状态；CRUISE 档、达 Periscope 层、深度≈7m、噪声/电池在界内；舵向改变航向。

**完成标签**
- UBT 编译：**BUILD VERIFIED**。
- 确定性单测：**TESTED**（6/6 通过，Automation EXIT CODE 0）。

**下一步（M3 后续切片，尚未做）**：把 `SubmarineStep` 接到 UE 的 `SubmarinePawn`（BP 仅读取/显示确定性状态），并移植
  decoy（`src/gameplay/decoy.ts`）→ 声呐（`src/sonar`，P0 不确定性/分类）→ 敌方 AI（`src/ai`）→ 战斗（`src/combat`）→ 任务/世界（`src/missions`,`src/world`），
  并保持**固定 RNG 消费顺序**（world→missions→submarine→sonar→ai→combat→detection）与 **fork 子流**，及「同一 seed+输入→同一快照」的硬确定性校验。

---

## 8. 质量与验证策略

- UE Automation（C++/蓝图自动化测试）覆盖：确定性、状态机转移、
  HP 公式、接触升降级、存档 schema、天气数值表。
- 命令行任务跑法：`UE4Editor-Cmd.exe` + 日志采集，避免只靠人肉操作。
- 视觉证据：Editor 截图/录像存档到 UE 工程外证据目录（如
  `C:\workspace\ue4\SilentDepthUE\Evidence`），并在 Web 仓库记录索引。
- 性能证据：只记录实际机器测量；不把“代码看起来快”写成已达标。
- 完成标签诚实使用：不能替代 Editor/目标硬件验证的，一律标 NOT VERIFIED。
- 离线审计：工程内搜索运行时 URL/远程插件/远程资产引用为零。
- Web 仓库现有 `npm test / typecheck / build` 仍作为 Web 基线门禁，本计划
  不触碰这些源文件，除非有明确 UE 需求驱动并单独走变更流程。

---

## 9. 主要风险与对策

| 风险 | 说明 | 对策 |
|---|---|---|
| Water 插件实验性 | UE4.27 中 Water 标为 Experimental | M1 前先做最小海面 PoC，验证稳定性再铺内容 |
| 大世界坐标精度 | 30 km 网格 float 精度不足 | 逻辑 km 双精度 + 区块原点/Origin Rebasing |
| 蓝图承载核心逻辑 | 顺序/性能/可测性风险 | M3 起核心逻辑 C++，蓝图仅表现与 UI |
| 规则重实现漂移 | UE 与 TS 数值/判定不一致 | balance 导入 + Automation + 固定样例回放对照 |
| 资产许可/离线 | 外部素材破坏 NFR-2 | 引擎自带 + 程序化 + 本地注册表；禁止不明来源 |
| 编辑器进程/视口验证受限 | 本会话无法直接驱动 UI | 以命令行/编辑器脚本为主，必要时请用户在视口配合截图 |
| 重构范围膨胀 | 想一次做完整个游戏 | 严格按 M0→M6 门禁，每次只交付一个里程碑 |

---

## 10. 参考文档

- `docs/GAME_DESIGN.md`（玩法/数值/任务权威）
- `docs/GAME_ARCHITECTURE.md`（系统/契约/确定性/测试权威）
- `docs/V2_ARCHITECTURE.md`（Web V2 表现层架构，供 UE 映射）
- `docs/VISUAL_STYLE.md`（调色板/UI/资产规格）
- `docs/ASSET_PIPELINE.md`（资产 license/注册）
- `docs/AUDIO_DESIGN.md`（SFX 规格）
- `docs/V2_RENDERING.md` / `docs/V2_PERFORMANCE.md`（渲染与性能预算）
- `docs/V2_PERISCOPE.md` / `docs/V2.4_OCEAN.md` / `docs/V2.4_HERO_ASSETS.md`

*本文件为规划基线，后续按 UE-M0..M6 每个里程碑更新并留证据。*
