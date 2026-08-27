# V2.2 Phase 1 — Browser Baseline Observations

- Date: 2026-08-27
- Browser: Chromium (sandbox-controlled; performance metrics are not representative of target desktop hardware)
- Instance: local audit instance at `http://localhost:5173/`; code baseline validated by project-root test/typecheck/build prior to asset-pipeline changes.

## Menu and Mission Availability

| Check | Result | Evidence |
|---|---|---|
| Main menu renders | PASS | Dark minimal menu with Play, Missions, Settings, Credits; fallback canvas is present before mission renderer initialization. |
| Mission list renders | PASS | M01 Sonar Training, M02 First Ambush, M03 Convoy Attack, M04 Heavy Escort, and M05 Silent Hunter are all visible and unlocked in the browser audit save. |
| Existing M01–M05 visual baseline | PASS (prior V2.1 evidence) | `reports/v2-visual-audit/` contains actual baseline/verification screenshots for Clear, Cloudy, Storm, Night, Periscope, and tactical sonar paths. |

> Phase 1 does not change visual output. Every later asset-pipeline change must preserve this menu/mission access path before Phase 2 begins.


## M01 Runtime Baseline

| Check | Result | Observation |
|---|---|---|
| M01 briefing → running | PASS | Mission briefing transitions to active `game-canvas` WebGL view; no user-visible initialization error. |
| Current scene composition | PASS (baseline only) | At 21 m Shallow, the third-person view shows submarine sail/hull silhouette against the clear-water horizon. The left/right panels and controls remain substantial; this is preserved during Phase 1 and will be addressed only in the later HUD phase. |
| Simulation-facing data | PASS | Mission state, depth, heading, battery, hull, sonar readiness, objectives, torpedoes and contacts read normally; Phase 1 must not alter this behavior. |


## M02–M05 Selection Baseline

重新加载后，任务选择页面仍显示 M01–M05 全部为解锁状态；其中 M02 为 First Ambush（Easy-Med，20 分钟标准时间）、M03 为 Convoy Attack（Medium，30 分钟）、M04 为 Heavy Escort（Hard，35 分钟）、M05 为 Silent Hunter（Very Hard，40 分钟）。后续阶段不得改变此任务表、难度、标准时间、解锁语义或任务数据。


## M02 Runtime Baseline

M02 First Ambush 已完成 Briefing → RUNNING 切换，当前显示 `CLR` 天气、21 m Shallow、180° 航向和“Sink the tanker”目标。浏览器中任务状态、HUD 和 WebGL 主画布均正常。该观察只确立改动前基线；清朗→阴天的运行时天气映射与其他任务环境也已有 `reports/v2-visual-audit/` 的截图证据。


## M03 Selection Check

在重新加载并返回任务选择后，M03 Convoy Attack（Medium，PAR 30MIN）仍可见且可选。此阶段没有写入任务配置、进度逻辑、存档 schema 或 Simulation Engine。


## M03 Runtime Baseline

M03 Convoy Attack 在 Chromium 中直接进入 RUNNING，显示 `CLD` 环境、双货轮目标与 5 枚可见鱼雷槽。世界画面显示阴天云层/海面和潜艇外观；说明多舰任务的 WebGL 初始化、任务 HUD 与天气桥接均可用。后续本地资产加载必须保留此离线启动和可见性路径。


## M04 Runtime Baseline

M04 Heavy Escort 已完成 Briefing → RUNNING，显示 `STM`（Storm）、3 km 能见度、4 商船加 2 护航舰的任务报告，以及三项目标。世界画面可见低光水面、降雨点和风暴天空；任务状态与目标完成语义按当前 V2.1 行为显示。Phase 1 的资产管线不得改变天气种类、能见度、实体数、护航行为或任务逻辑。


## M05 Runtime Baseline

M05 Silent Hunter 已直接进入 RUNNING，显示 `NGT` 夜间环境、90° 航向和“Sink at least one ship / Escape the hunters”目标。当前画面保持夜间低照度、星点、海面与潜艇轮廓；潜望镜按钮因 21 m Shallow 仍提示需要先升至潜望镜深度。这是 V2.1 的夜间可读性基线，Phase 1 不改动任何天气/深度/潜望镜仿真状态。


## M05 Periscope Runtime Baseline

在 M05 中，按 `Q` 后深度从 21 m Shallow 变为 7 m Periscope；按 `P` 后潜望镜进入 Raising → Raised，圆形光学遮罩、方位刻度、中心准星、曝光提示及 Lock/Lower/Emergency Dive 控件均可见。没有接触时，光学读数保持 Unknown / `--`，未泄漏敌方精确位置。该行为是后续资产管线不可回归的基线。

## Phase 1 Browser Conclusion

M01、M02、M03、M04、M05 和 M05 潜望镜状态均已在 Chromium 中重新核对，且与 V2.1 的已存审计截图相符。资产管线实施仅可向渲染层添加本地资源元数据、校验和加载准备能力；不改变任务、天气逻辑、实体行为、输入或声呐信息语义。


## Hero Submarine Phase — M01 Startup Check

升级后的隔离 Chromium 审计副本已成功加载，M01 任务可从菜单进入 Briefing，`game-canvas` 创建正常。此轮同步仅包含 `submarineGeometry.ts` 与 `SubmarineRenderer.ts` 的呈现层改动；待任务进入 RUNNING 后继续检查潜艇剪影、细节和 LOD，且不改动 M01 目标、天气或任何仿真数据。


## Hero Submarine Phase — Browser Relaunch Check

隔离审计副本重新启动后，主菜单和 M01–M05 任务选择均正常渲染，说明新的 `THREE.LOD` 潜艇渲染树不会妨碍菜单、fallback canvas 或任务入口。随后继续覆盖 M03、M04、M05 与潜望镜的运行路径。


## Hero Submarine Phase — M03 Runtime Check

在同步后的审计副本中，M03 Convoy Attack 正常进入 RUNNING（Cloudy），多舰任务的画布初始化、控制输入、HUD 与任务目标均维持基线。潜艇呈现使用新建的本地四级 `THREE.LOD` 结构；在当前水下第三人称构图中，主体轮廓稳定且没有 WebGL/控制台级故障。M03 仍未向玩家暴露未确认敌舰的精确位置。


## Hero Submarine Phase — M04 Runtime Check

M04 Heavy Escort 在同步后的审计副本中进入 RUNNING，维持 Storm → Fog、3 km 能见度、4 商船 + 2 护航舰和原有目标。新的潜艇 LOD 节点未导致任务启动或世界画布异常；风暴美术本体仍留待环境阶段优化，本阶段只确认英雄资产在低照度任务中稳定工作。


## Hero Submarine Phase — M05 Night Check

M05 Silent Hunter 在升级后进入 RUNNING（Night）。夜间画面仍保持低照度、星点、深色海面与潜艇位置/朝向信息；任务目标、鱼雷计数与接触语义未发生变化。英雄资产 LOD 的结构变更不会为未确认目标添加实体或标签，且没有阻断夜间任务加载。


## Hero Submarine Phase — M05 Periscope Check

M05 从 21 m Shallow 上浮至 7 m Periscope 后可正常 Raising → Raised；按 `P` 进入圆形光学视图，显示方位、准星、曝光与 Raised 计时。潜艇渲染器的新 LOD 组会在所有细节层同步潜望镜、螺旋桨与局部舵面可视动画。光学视图仍把无接触数据呈现为 Unknown / `--`，因此未改变声呐或目标位置不确定性。


## Enemy Ship Phase — Browser Reload and Entry Check

载入新的舰船 LOD 源码后，隔离 Chromium 审计副本可正常渲染主菜单与全任务列表，M01–M05 均保持可访问。随后启动 M03 检查程序化货轮、护航舰、可见性门禁和多舰缓存路径；敌舰资产仍只会在 `RenderShip.visible` 为真时创建。


## Enemy Ship Phase — M03 Contact-Gated Runtime Check

M03 可正常进入 RUNNING。主动声呐后，现有接触链按原有规则显示为 `Large Surface`、距离、方位与 25% 置信度；这证明敌舰 `visible` 门禁和低置信度不确定性没有因 LOD 或材质更新而丢失。船体资产仅在既有 RenderState 指示可见时被创建，未向 UI 或渲染注入真实、未确认的敌舰坐标。


## Enemy Ship Phase — M01 Entry Check

刷新后 M01–M05 入口仍完整存在；M01 将用于确认单艘 Merchant 资产在声呐接触变为可见时仍沿用原有未知接触 → 分类链。此步骤只操作既有主动声呐输入，不修改舰船、任务或传感器数据。


## Enemy Ship Phase — M01 Runtime Check

M01 在真实 Chromium 中进入 RUNNING，随后按该任务现有时序显示 `ESCAPED`；主动声呐 UI 事件可触发但本次短任务窗口未留下活动接触。该情况与本阶段未改动的任务/传感器流程一致，不将其归因于敌舰资产。已由单元测试覆盖 Merchant 资产、四级 LOD 与本地可见性渲染路径；M03 的五接触运行记录提供多舰门禁验证。


## Enemy Ship Phase — M04 Runtime Check

M04 Heavy Escort 成功显示任务简报并转入既有 Storm → Fog 环境，保留 4 Merchant + 2 Escort 的任务级公开情报、3 km 能见度和所有原有目标。多类舰船 LOD 原型的创建未影响风暴场景初始化或 UI；天气、海面和可见性美术将由下一阶段单独处理。


## Enemy Ship Phase — M05 Entry Check

敌舰 LOD 与材质隔离源码载入后，M05 仍可从任务列表正常访问；下一步会在该既有夜间任务中复核潜望镜进入前置和光学视图，确认新增舰船呈现树未干扰相机/潜望镜状态链。


## Enemy Ship Phase — M05 Periscope Check

M05 在敌舰 LOD 源码载入后可从 21 m Shallow 上浮至 7 m Periscope，并按原有 `P` 输入进入潜望镜光学视图。曝光、方位、Unknown 接触、HUD、暂停/控制按钮均正常；新增敌舰 LOD 根节点不改动潜望镜状态机、接触置信度或任何射击/锁定逻辑。
