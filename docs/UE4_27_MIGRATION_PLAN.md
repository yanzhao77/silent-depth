# SILENT DEPTH 迁移到 UE4.27 实施方案

| 字段 | 内容 |
|---|---|
| 状态 | PROPOSED |
| 统一主方案 | `docs/UE4_27_MIGRATION_MASTER_PLAN.md` |
| 目标架构 | `docs/UE4_27_TARGET_ARCHITECTURE.md` |
| 迁移方法 | 并行重写、轨迹对照、分阶段替换 |
| 原版本角色 | 迁移期行为权威与回归基准 |
| 目标版本角色 | 验收后成为发布实现 |

## 1. 当前基线

当前仓库约有 42,421 行 TypeScript/JavaScript，其中测试约 14,246 行；
测试目录当前有 42 个文件，最新 `npm test` 实际执行 38 个测试文件、684 个测试。
这些数字会随现有开发继续变化，因此迁移开始时必须生成带提交号的正式基线，
不能引用旧报告中的历史计数。

迁移对象包括：

- 纯 TypeScript 固定步长仿真。
- Three.js/WebGL 表现层。
- DOM HUD 和菜单。
- 程序化 WebAudio。
- JSON 平衡、任务和设置。
- 本地 GLB 舰船资产与程序化回退。
- Vitest、浏览器捕获和无头 playtest。

## 2. 迁移总策略

采用旁路迁移，而不是原地替换：

```text
                    +-> TypeScript baseline -> canonical trace
Input script + seed |
                    +-> UE4 C++ commandlet  -> canonical trace
                                                 |
                                                 v
                                           Trace comparator
```

迁移期规则：

1. 当前 Web 版继续运行并冻结玩法契约。
2. UE4 项目新增在 `ue4/`，不重排原目录。
3. 每个领域模块先迁移测试，再迁移实现。
4. 同一输入脚本分别运行 TS 和 C++，比较规范化轨迹。
5. 只有通过领域门禁的模块才进入下一阶段。
6. 表现开发不得先于核心行为对齐成为关键路径。
7. 原版不删除；最终归档或保留由发布决策单独确认。

## 3. 启动前准备

### 3.1 开发环境

- Windows 10/11 x64。
- UE4.27.2。
- Visual Studio 2019 16.11。
- MSVC v142、Windows 10 SDK。
- Git LFS。
- Blender 锁定版本。
- 16GB RAM 最低，32GB 推荐，SSD 预留 150-250GB。

### 3.2 基线冻结

在不修改现有结果的前提下记录：

- Git commit 和工作树状态。
- `npm test`、`npm run typecheck`、`npm run build` 结果。
- 五个固定任务定义和所有 balance 值的哈希。
- RNG 黄金序列。
- M01-M05 输入回放及规范化输出。
- 存档 schema 和代表性样本。
- 当前关键截图，仅作为视觉参考，不作为逻辑权威。

当前工作树已有未提交修改。真正开始迁移基线前，应由所有者决定使用哪个
提交或工作树状态作为权威；迁移工具不得擅自清理或覆盖这些修改。

## 4. 规范化轨迹

### 4.1 输入脚本格式

每个场景使用 JSON：

```json
{
  "schema": "silent-depth-input-v1",
  "missionId": "M02",
  "seed": 1002,
  "ticks": [
    { "tick": 0, "throttle": 4, "depth": "Periscope" },
    { "tick": 120, "ping": true },
    { "tick": 240, "periscope": true },
    { "tick": 260, "lockTarget": true },
    { "tick": 300, "fireContactId": "C-01" },
    { "tick": 420, "emergencyDive": true }
  ]
}
```

`tick` 为从第一次 `Step()` 开始的零基索引；输入在该 tick 的 Step 前被消费。
第 0 tick 仍会经历当前的 `MISSION_LOADING`/briefing 语义，不能默认认为任务已
进入 `MISSION_RUNNING`。未出现的持续字段沿用上一值，初始值必须固定为：
`throttle=0`、`rudder=0`、`depth=Shallow`、`silentRunning=false`，其余边沿
字段为 false，`fireContactId=null`。边沿字段只在指定 tick 为 true，其余 tick
显式归零；重复 tick、乱序 tick、未知字段和非法值必须在脚本加载阶段拒绝并给出
字段路径。

正式输入字段为 `throttle`、`rudder`、`depth`、`silentRunning`、`ping`、
`fireContactId`、`decoy`、`pause`、`periscope`、`lockTarget` 和
`emergencyDive`。其中 `periscope`、`lockTarget`、`emergencyDive` 分别对应
潜望镜升降、锁定目标和紧急下潜；它们必须进入 C++ `FPlayerInputs`，不能作为
UE 表现层的旁路按钮。

当前发布输入语义固定为：W/S 速度、A/D 舵、Q/E 深度、Space ping、F 鱼雷、
R 静默运行、G 诱饵、P 潜望镜、L 锁定、X 紧急下潜、Escape 暂停菜单。该表
优先于旧设计稿中 `P=暂停` 的描述；任何键位调整必须同时升级输入 schema 和
回放基线，不能在 UE 映射阶段隐式改变。

### 4.2 输出轨迹格式

不要直接比较 JS 和 C++ 的 JSON 字符串格式。生成规范化记录：

```text
schemaVersion
missionId / seed / tick
gameState
player fields
contacts sorted by stable ID
enemies sorted by stable ID
torpedoes sorted by stable ID
active public weather
mission / score / stats
events sorted by emission sequence
RNG counters per stream in development builds
```

比较规则：

- 枚举、ID、计数、布尔、事件类型和顺序必须精确一致。
- RNG `uint32` 输出必须精确一致，包括基础流、所有核心 fork、
  `world-ocean`、`missions-gen` 以及 `range/int/chance/sign` 的向量。
- 时间用 tick 比较，不比较格式化浮点字符串。
- 位置初始容差建议 `1e-6 km`，角度建议 `1e-6 deg`。
- 命中、分类、任务状态等离散分支不允许使用容差掩盖差异。
- 若某浮点误差最终改变分支，视为失败，必须定位根因。
- 输出事件按“本 tick 新产生的事件批次”比较，不重复比较快照里的历史事件尾。
- 轨迹文件记录 `schemaVersion`、基线提交号、输入脚本哈希、配置哈希、seed、
  tick、状态、公开快照字段、事件批次和开发版 RNG 计数；schema 变更必须升级
  版本并提供迁移或重新生成规则。

## 5. 阶段计划

### Phase 0：基线与迁移工具

交付物：

- 确认的基线提交或快照。
- TS 输入回放执行器和规范化轨迹导出器。
- 轨迹 schema、字段容差表和比较器。
- RNG 黄金向量。
- UE4 项目骨架与忽略/LFS 配置。

门禁：

- 当前完整测试门禁通过。
- 同一个 TS 回放执行两次得到相同轨迹哈希。
- UE4 空项目可编译、启动并打包 Windows Development 版本。

预计：1-2 周。

### Phase 1：Core 基础设施

按顺序迁移：

1. 基础枚举、ID、向量和配置类型。
2. Mulberry32 和 fork 标签哈希。
3. 固定 tick、状态机和暂停。
4. 事件总线与有界事件日志。
5. `FPlayerInputs`、`FGameSnapshot` 和深拷贝/只读边界。

门禁：

- RNG 10,000 个样本跨语言一致。
- 暂停 tick 不推进时间和 RNG。
- 非法输入被确定性 clamp 或拒绝，不抛出未处理异常。
- 修改旧快照不能影响 runtime。

预计：2-3 周。

### Phase 2：世界、任务和玩家潜艇

按依赖顺序迁移：

1. balance 和 mission 配置解析。
2. 世界、天气、洋流和任务生成。
3. 潜艇移动、转向、速度档位和深度层。
4. 电池、噪声、船体、越界和强制上浮。
5. 目标定义和任务状态基础。

门禁：

- 固定任务 M01-M05 定义逐字段一致。
- 任务生成器同 seed 结果一致。
- 代表性 10 分钟输入脚本的玩家轨迹在容差内。
- 电池、深度切换和边界失败 tick 精确一致。

预计：3-5 周。

### Phase 3：声呐和接触

按顺序迁移：

1. 被动监听与信号强度。
2. 主动 ping、冷却、电量和暴露。
3. 接触创建、降级、删除和稳定 ID。
4. 方位/距离误差与收敛。
5. 分类、跟踪和潜望镜确认。

门禁：

- 被动声呐永不产生未授权精确距离。
- 同 seed 的误差和分类过程一致。
- 接触状态转换 tick、置信度和观测次数一致。
- 未发现舰船不会进入 UE 表现输入。

预计：3-5 周。

### Phase 4：AI、战斗和任务闭环

按顺序迁移：

1. 舰船移动和编队。
2. 护航、搜索、LKP 和状态机。
3. 火控解算和发射校验。
4. 鱼雷、最近通过、命中和近失。
5. 深水炸弹、甲板炮、伤害与探测。
6. 目标、胜负、评分和统计。

门禁：

- AI 状态和位置轨迹与基线一致。
- RNG 消费计数按派生流一致。
- 命中/近失/伤害事件类型、顺序和 tick 一致。
- M01-M05 可以无头完成预期胜负路径。
- 现有代表性 playtest 在批准差异范围内。

预计：5-8 周。

### Phase 5：UE 桥接和最小可玩版本

本阶段在 Phase 1 完成核心接口、Phase 2 完成 M01 世界/玩家规则后即可搭建，
并与 Phase 3/4 的其余核心迁移并行；M01 可试玩门禁则要求 M01 所需的声呐和
战斗最小闭环完成，不要求先完成 M02-M05 全部逻辑。这样可以尽早验证 UE
Subsystem、输入、坐标、快照边界和打包链路。

交付物：

- `USilentDepthSimulationSubsystem`。
- 固定步长 accumulator 和输入缓冲。
- Snapshot 到 RenderState 适配器。
- 基础海面、玩家潜艇和可见舰船 Actor。
- 简单 Tactical 相机和调试 HUD。
- M01 从菜单进入、游玩、结束并返回菜单。

门禁：

- 编辑器帧率变化不改变最终仿真轨迹。
- 30/60/120 FPS 输入回放得到相同核心结果。
- 隐藏敌舰不存在对应 Actor 和附属提示。
- 地图坐标、航向和深度映射通过专门测试。
- M01 的潜望镜输入、声呐接触和暂停/恢复流程可由回放驱动；声呐接触只显示
  估计位置和不确定性，不生成真实敌舰位置。

预计：3-5 周。

### Phase 6：完整表现、UI、音频和存档

交付物：

- World、Tactical、Periscope 三种相机。
- 正式 HUD、接触面板、火控、菜单、简报和结果页。
- 海洋、天空、天气、雾和画质预设。
- Niagara 尾迹、爆炸、声呐、深水炸弹水柱。
- Audio Mixer/Sound Cue 或程序化声音替代。
- `USaveGame`、JSON 导入和设置持久化。
- M01-M05 完整游戏流程。

门禁：

- 所有视觉和音频提示均来自 RenderState/公开事件。
- 隐藏目标在相机、尾迹、灯光和声音测试中全部 fail closed。
- 事件通道在低帧率、长帧和超过事件历史容量时不丢失；若发生队列溢出必须失败
  并报警。
- 当前天气只来自 Core World 的公开天气视图，适配器不得再次解析任务天气字符串。
- 损坏和未来版本存档安全回退。
- 桌面与窄窗口 UI 无关键遮挡。

预计：5-8 周。

### Phase 7：资产、性能和发布收口

交付物：

- 现有 GLB 转 FBX 和 UE LOD 导入记录。
- 材质实例、碰撞、纹理预算和回退资产。
- Low/Medium/High 画质档位。
- Windows Shipping 包。
- 性能、内存、加载和资源释放报告。
- 最终迁移矩阵和发布说明。

门禁：

- 资产来源、许可、哈希和 LOD 数据完整。
- Shipping 包断网可完整运行。
- GTX 1050 目标机实测达到批准的分辨率和帧率目标。
- 连续重开任务无明显内存或 GPU 资源增长。
- UE4 全部门禁与保留的 TS 基线门禁通过。

预计：4-7 周。

## 6. 测试迁移矩阵

| 当前测试领域 | UE4 对应测试 | 验收重点 |
|---|---|---|
| core/rng | C++ Automation Spec | 位级 RNG、fork、暂停 |
| submarine | Core 单元测试 | 运动、电池、噪声、深度 |
| sonar | Core 单元与轨迹对照 | 误差、分类、降级、隐藏 |
| ai | Core 单元与长回放 | 状态机、LKP、编队 |
| combat | Core 单元测试 | 火控、命中、伤害、事件 |
| missions/world | Core 与配置测试 | 5 任务、生成器、天气 |
| determinism | Commandlet 双跑 | 同输入同输出 |
| gameplay/playtest | 无头集成测试 | 完整任务闭环 |
| renderer | Presentation 测试 | 坐标、池、生命周期 |
| visibility | Presentation 安全测试 | 无灯光/尾迹/镜头泄露 |
| UI/menu | Functional Test | 状态和输入流程 |
| browser capture | UE 截图与人工 QA | 视觉与布局，不替代逻辑测试 |

建议命令形态：

```powershell
UE4Editor-Cmd.exe SilentDepth.uproject `
  -ExecCmds="Automation RunTests SilentDepth" `
  -unattended -nop4 -NullRHI `
  -TestExit="Automation Test Queue Empty"

UE4Editor-Cmd.exe SilentDepth.uproject `
  -run=SilentDepthSim `
  -Input=Saved/Tests/m02-input.json `
  -Output=Saved/Tests/m02-ue4-trace.json `
  -unattended -nop4 -NullRHI
```

涉及 UMG、材质、Niagara 和 Shader 的测试不能只用 `-NullRHI`。它们必须在
真实 DX11 窗口或打包版中检查日志、画面和 GPU 资源。

## 7. CI 与门禁

### 7.1 每次提交

- 编译 `Development Editor Win64`。
- 运行 `SilentDepthCore` 自动化测试。
- 运行小型 RNG 和 M01 轨迹对照。
- 验证配置 schema。
- 检查禁止 API：仿真模块不得使用随机、墙钟、Actor 或网络。

### 7.2 每日或合并前

- 全部 TS 测试门禁。
- 全部 UE Core 测试。
- M01-M05 双跑轨迹。
- Development 打包烟雾测试。
- 资产注册表与源文件哈希校验。

### 7.3 发布候选

- Shipping 打包与离线测试。
- Windows 干净机器启动测试。
- GTX 1050 2GB/4GB 至少覆盖实际目标型号之一。
- 任务循环、存档迁移、损坏存档和重启测试。
- DX11 Shader 编译和运行日志检查。
- 30 分钟以上稳定性与多次任务切换测试。

## 8. 资产迁移计划

每个资产按以下清单处理：

1. 从 `assets/v3/registry.json` 读取权威来源和 LOD 元数据。
2. 校验源 GLB SHA-256，禁止对不一致文件更新登记来掩盖差异。
3. Blender 导入后检查单位、朝向、原点、法线和材质槽。
4. 导出 FBX，保持 LOD 命名和家族 ID。
5. UE 导入后检查三角面、包围盒、碰撞和材质数量。
6. 建立材质实例，避免每个 Actor 创建独立母材质。
7. 在 Low 配置确认纹理和 LOD 切换。
8. 保存转换记录、工具版本和派生资产路径。

首轮只迁移玩家潜艇、Destroyer 和 Tanker。Cargo、Merchant 和 Frigate
可以先使用已批准家族的程序化/基础几何回退，不得用未知资产填充。

## 9. 存档迁移

定义 `FSaveDataV1` 与当前 schema 对齐：

- 已解锁任务。
- 各任务最高分。
- 总体统计和击沉分类。
- 音频、显示和输入设置。
- 应用语言设置 `settings.app.language`。

迁移路径：

```text
browser JSON export
-> UE local file picker or Saved/Import directory
-> strict JSON validation
-> FSaveDataV1
-> USilentDepthSaveGame
```

导入失败必须说明字段和原因，不覆盖现有 UE 存档。成功导入前先写临时槽，
读回验证后再替换正式槽。

## 10. 性能实施计划

### 10.1 从第一天建立预算

- 舰船 Actor 池，不频繁 Spawn/Destroy。
- Niagara 使用固定上限和 Scalability。
- 海面使用有限网格与材质实例。
- 静态环境优先合批，控制透明材质。
- 只给近景主要舰船投射动态阴影。
- UI 避免每帧重建完整 Widget 树和大量文本绑定。
- 不在 Blueprint Tick 中做全局搜索或数组分配。

### 10.2 测量方式

- `stat unit`：Game、Draw、GPU。
- `stat scenerendering`：Draw calls 和 primitives。
- `stat rhi`：显存与资源。
- `profilegpu`：海面、雾、阴影和后处理。
- Unreal Insights：Game Thread 和加载尖峰。

编辑器帧率只用于发现问题，最终结论来自打包版目标硬件。

## 11. 风险清单

| 风险 | 影响 | 控制措施 |
|---|---|---|
| JS/C++ 浮点分支漂移 | 高 | double、稳定顺序、轨迹比较、分支边界测试 |
| RNG 消费顺序变化 | 高 | 派生流计数、黄金向量、固定 pipeline |
| RNG fork 或输入 schema 不完整 | 高 | 冻结 fork 算法、实际标签、输入默认值和版本化回放 |
| 隐藏信息经 Actor 泄露 | 高 | 表现只读 RenderState、隐藏安全测试 |
| 事件尾日志溢出导致音频/特效丢失 | 高 | 独立可靠事件队列、游标、溢出测试 |
| 天气在 Core 与适配器中漂移 | 中高 | ActiveWeather 进入公开快照，适配器只消费快照 |
| Blueprint 承载核心逻辑 | 高 | Core 强制 C++，Blueprint 只做编排 |
| UE Tick 改变玩法 | 高 | 固定 20Hz、输入缓冲、FPS 交叉测试 |
| UE 物理改变命中 | 高 | 权威战斗使用纯数学，不读碰撞结果 |
| 1050 显存不足 | 中高 | 1K 纹理、LOD、画质档、低成本海面 |
| UI 重做超期 | 中 | 先调试 HUD，再逐面板替换 |
| GLB 转换外观变化 | 中 | 资产清单、对照截图、材质实例 |
| UE4 工具链老化 | 中 | 锁定 4.27.2、VS2019、SDK 和构建机镜像 |
| 二进制资产冲突 | 中 | Git LFS、小 Blueprint、资产所有权分区 |
| 迁移期间双版本分叉 | 高 | 玩法冻结、变更必须双端同步或延后 |

## 12. 人力与工期估算

单人全职、熟悉 C++ 但需要学习 UE4 的保守估算：

| 目标 | 工期 |
|---|---|
| 核心技术验证：RNG、固定 tick、M01 无头 | 4-7 周 |
| 最小可玩：M01、战术视图、基础 HUD | 10-16 周累计 |
| 五任务功能对齐 | 20-30 周累计 |
| 表现、资产、性能和发布级收口 | 26-40 周累计 |

兼职开发通常需要 12-24 个月。纯 Blueprint 不会显著缩短总工期，反而会提高
确定性、测试和维护成本。若新增原创高质量舰船、音频和 UI，美术工期需另计。

## 13. 里程碑验收表

| 里程碑 | 可以演示的结果 | 不允许带入下一阶段的问题 |
|---|---|---|
| M0 | 空 UE 项目、TS 规范轨迹 | 基线不明确、无法打包 |
| M1 | C++ RNG/时间/状态机 | RNG 或暂停不一致 |
| M2 | 玩家在无头世界运行 | 配置双权威、运动漂移 |
| M3 | 完整声呐接触过程 | 真实位置泄露、误差不一致 |
| M4 | AI 战斗与五任务闭环 | 离散结果或事件顺序不同 |
| M5 | UE 中完成 M01 | FPS 改变仿真、隐藏 Actor 存在 |
| M6 | UE 中完成 M01-M05 | UI/音频绕过公开数据 |
| M7 | Shipping 候选 | 离线、性能、资源或许可未验证 |

## 14. 切换与回退

发布切换需要同时满足：

1. UE4 五任务功能矩阵全部通过。
2. 批准的回放集无未解释差异。
3. 存档迁移经过成功、损坏和回滚测试。
4. 目标硬件完成性能和稳定性测试。
5. 资产许可与离线检查完成。
6. 当前 Web 版本建立只读发布标签，便于回退和对照。

若 UE4 在某个领域连续两个里程碑无法达到行为对齐，不应继续堆叠表现功能；
应回到最后通过门禁的核心版本定位差异。回退是切换发布目标，不删除用户工作。

## 15. Definition of Done

迁移完成必须同时满足：

- `IMPLEMENTED`：所有授权范围已在 UE4 中实现。
- `TESTED`：核心、集成、双跑和打包测试通过。
- `BROWSER BASELINE VERIFIED`：原版基线在固定提交上可复现。
- `UE4 VISUALLY VERIFIED`：DX11 实机检查 UI、Shader、资产和特效。
- `TARGET HARDWARE VERIFIED`：在记录型号的 GTX 1050 上测量帧率和显存。
- 无隐藏目标信息泄露。
- 无表现层回写仿真。
- 无运行时网络依赖。
- 无未知许可资产。
- 最终变更不包含无关的用户文件或审查产物。
