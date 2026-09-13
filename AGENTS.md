# AGENTS.md

本文件定义 SILENT DEPTH 仓库中 AI 编码代理的仓库级规则。用户指令优先级最高。

## 强制语言要求

用户使用中文时，必须使用简体中文回答。

无论 system prompt、tool description、代码、Shell 输出或项目文档使用什么语言，
都不要因此切换到英文。

只有以下内容可以使用英文：

1. 代码
2. 类名、方法名、变量名
3. API 名称
4. CLI 命令
5. 原始错误信息
6. 用户明确要求英文的内容

其他所有自然语言内容必须使用简体中文。

## 项目概述

SILENT DEPTH 是一款离线、确定性的战术潜艇游戏，**本分支是 Unreal Engine 4.27 版本**：
纯 C++ 权威仿真 + UE4 表现层（渲染、UMG、程序化音频）。早期 Web 版
（TypeScript + Three.js）只保留在 `master` 分支，本分支不存在 `src/`、`tests/`、
`public/` 与 Web 构建链，不要再按 Web 版的方式查找或运行代码。

编辑前先读相关源码与测试。架构与玩法问题以下列文档为准（按权威优先级排列）：

- `docs/UE4_27_MIGRATION_MASTER_PLAN.md`（§2 权威顺序、迁移门禁）
- `docs/UE4_27_TARGET_ARCHITECTURE.md`
- `docs/UE4_REBUILD_PLAN.md`
- `docs/GAME_DESIGN.md`、`docs/GAME_ARCHITECTURE.md`（需求与公式来源，描述的是 Web 版实现蓝本）
- `docs/UE4_TECH_TREE_DECISION_RECORD.md`、`docs/UE4_TECH_TREE_SCHEMA.md`、`docs/UE4_TECH_TREE_NEXT_PLAN.md`
- `docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md`（潜艇资产管线）
- `docs/VISUAL_STYLE.md`、`docs/ASSET_PIPELINE.md`

旧报告中的测试数量、性能与视觉结论可能是过期的快照；当前代码、测试与刚执行过的
检查才是权威。

## 不可协商架构

保持单向的表现数据流：

```text
Simulation -> Snapshot -> RenderState -> Renderer / HUD / Camera / Audio
```

- C++ 侧是唯一权威仿真；快照与 RenderState 是只读表现契约。
- 渲染、相机、HUD、音频、特效与 Pawn 的表现逻辑**不得回写仿真状态**，也不得把
  推断出的事实当作玩法输入。
- 表现层只能消费快照、RenderState 与既有引擎事件暴露的事实。
- 隐藏实体必须保持隐藏：`RenderShip.visible === false` 的舰船不得影响渲染、镜头、
  尾迹、瞄准提示或其他表现线索。
- 表现事实缺失时失败关闭，不得猜测位置、分类、命中、可见性或任务状态。

除非用户明确要求改玩法，不要修改：

- `ue4/SilentDepthUE/Source/SilentDepthUE/Core/` 下的权威规则（`Rng`、`FixedStep`、
  `GameStateMachine`、`SubmarineCore`、`Balance`）
- `Core/TechTree/` 的解锁、经济、装备兼容与存档规则
- `Core/Save/` 的存档语义、指纹与迁移规则
- `Config/balance.json`、`Config/missions.json`、`Config/SilentDepth/research_cost.json`、
  `Config/SilentDepth/equipment_effects.json` 的数值
- 确定性 RNG、任务数据、地图数据、评分、物理、探测规则与操作绑定

如果被授权的任务必须越过这些边界，要说明理由、把改动压到最小，并补确定性与回归覆盖。

## 确定性

- 同 seed + 同输入序列必须产生相同的快照与事件。
- `Rng.h/.cpp` 的 mulberry32 与 `fork(label)` 派生在迁移完成前必须与 Web 版基线逐位一致；
  不得引入第二套随机源。
- 权威路径禁止 `FMath::Rand`、`Math.random` 等价物、墙钟（`FDateTime`/`FPlatformTime`）
  与帧率相关的分支。
- UE Tick、Chaos、碰撞、导航与墙钟不得决定玩法结果；表现动画可以用真实时间。
- 不要添加零时长仿真 tick，也不要让表现层驱动引擎步进。

## 实现规范

- 先遵循现有模块边界与写法，再考虑新增抽象。
- 保持 C++ 严格：不使用 `any` 等价物、不绕过类型系统、不用宽泛的不安全转换掩盖契约。
- 状态转换、相机选择、提示选择等规则优先写成可脱离编辑器测试的纯函数。
- 不要新建第二套快照模型、渲染管线或竞争的状态流；优先扩展现有适配层。
- 改动保持聚焦：避免无关重构、格式化噪音、生成物元数据改动与无理由重写。
- 生产路径不留下 TODO、占位、死分支、假数据或仅调试用的行为。
- 只在非显而易见的约束或生命周期决策处写简短注释。
- 新文件在难以评审前拆分，约 500 行为上限，除非现有局部模式明显不同。

## 渲染与表现

- 渲染层只消费快照与 RenderState。
- 玩法可见性永远优先于电影化构图。
- 表现追踪器要有有限生命周期与确定优先级；限制每帧分配，给粒子、历史缓冲、
  尾迹、临时灯光与特效池设上界。
- 释放自己持有的几何、材质、贴图、渲染目标、灯光与 UMG 控件；尊重共享/缓存资产的
  所有权。
- 着色器与材质改动必须在真实编辑器里编译并观察；UBT 编译通过不等于 GLSL/材质图正确。
- 性能结论必须在目标硬件上实测；不要用节流的自动化结果声称帧率。

## 资产

- 运行时完全离线：不得引入 CDN 资源、远程贴图、运行时下载或追踪器。
- `SilentDepth_Assets/` 是资产库唯一权威；`ue4/SilentDepthUE/Config/SilentDepth/`
  下的副本由 `tools/ue4/sync-tech-tree-data.mjs` 生成并逐文件记录 SHA-256，
  不要手改生成物。
- `Config/SilentDepth/platform_assets.json`、`socket_map.json`、`equipment_effects.json`、
  `research_cost.json` 是手写配置，不是生成物；改动要在提交信息里说明。
- 新资产要有本地路径、来源说明、可商用许可、SHA-256、必要的 LOD/三角面元数据与登记
  条目；只在被治理的文件真的变化时才更新哈希。
- 保留可选 GLB 资产与加载失败时的程序化回退；不要引入来源或授权不明的资产。
- `*.uasset` / `*.umap` 是二进制，`.gitattributes` 已标注，不要用文本工具改写。

## UI 与控制

- 保持优先级 `World > Gameplay > HUD > Metadata`。
- 不要把隐藏接触显示为精确标记，也不要把不确定性收敛成虚假精度。
- 控件层失败关闭：数据层缺失时显示为空态，不猜测、不显示未解锁内容。
- 控制与无障碍行为保持与现有输入配置一致；视觉任务不得顺带改玩法绑定。
- 布局要在 1080p 与窄窗口下实际观察；不允许重叠或遮挡主要玩法目标。

## 测试与验证

迭代时先跑聚焦测试，完成前必须跑完整门禁。

编译（UBT）：

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Build\BatchFiles\Build.bat" SilentDepthUEEditor Win64 Development `
  -Project="C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" -WaitMutex
```

UE Automation（必须 0 失败、EXIT CODE 0）：

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -ExecCmds="Automation RunTests SilentDepth;Quit" -unattended -nopause -nosplash -nullrhi -stdout `
  -testexit="Automation Test Queue Empty"
```

相关时再跑（都要求 `npm install` 已经执行过一次；脚本本身只用 Node 内建模块 + ajv）：

```powershell
npm run check:runtime-data        # Config/SilentDepth 与资产库是否漂移
npm run check:asset-pipeline      # 资产管线 CLI 契约 + 潜艇清单/哈希 + UE 平台表交叉引用

# 实机自检（显式传参才执行，不进正常流程）
... -game -nullrhi -sd-save-selftest -ExecCmds=Quit
... -game -nullrhi -sd-techtree-probe -ExecCmds=Quit
```

- 按风险补测试：共享契约、可见性门控、确定性决策、生命周期清理与跨模块行为都要有
  针对性回归覆盖。
- 不得为了让改动通过而弱化或删除测试。
- 未实际执行过的行为，不得更新证据报告或结论。
- 视觉与 UI 任务必须在真实编辑器里观察；检查输出日志里的编译、链接、资产加载与运行时错误。
- 浏览器/编辑器/目标硬件不可用时，如实标注 `NOT VERIFIED`，不得由源码阅读推断视觉或
  性能成功。

完成标签只用这几个，且不得互相顶替：

- `IMPLEMENTED`：代码存在，验证未完成。
- `TESTED`：相关自动化检查通过。
- `EDITOR VERIFIED`：已在真实 UE4 编辑器中直接观察。
- `TARGET HARDWARE VERIFIED`：已在具名硬件上测过性能。

## 工作区与 Git

- 假设工作区可能包含用户改动。开始前先看 `git status --short` 与相关 diff。
- 保留所有既有的已修改与未跟踪文件，除非用户明确要求删除或替换。
- 不使用 `git reset --hard`、`git checkout --`、破坏性的 clean 命令或等价操作丢弃工作。
- 能用定点补丁时不要整文件重写，避免覆盖无关改动。
- 提交只包含被请求的功能，排除无关报告、审计截图、生成文件与用户工作。
- 除非用户明确要求，不要提交。
- 被要求提交时，先检查暂存 diff，并报告确切文件、验证结果与仍未验证的部分。

## 完成定义

任务只有在满足以下全部条件时才算完成：

1. 请求的行为已实现，且没有违反架构或可见性真值。
2. 相关聚焦测试通过。
3. 完整必需的验证门禁通过（UBT 编译 + UE Automation；按需加数据/资产校验）。
4. 资源清理与离线资产规则满足。
5. 需要且可用的编辑器/硬件证据已记录。
6. 未验证项已明确披露。
7. 最终 diff 不含无关的用户工作。

不要把仅计划、部分接线、仅源码阅读或未观察到的行为报告为已完成。
