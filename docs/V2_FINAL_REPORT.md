# SILENT DEPTH V2.1 最终报告：Visual Fidelity Pass

| 字段 | 内容 |
|---|---|
| 项目 | **SILENT DEPTH《深海猎手》** — Cinematic Tactical Submarine |
| 文档 | `docs/V2_FINAL_REPORT.md` |
| 范围 | V2.1 Visual Fidelity Pass |
| 状态 | 已完成工程修复、真实浏览器审计与构建验证；等待目标硬件最终性能签核 |
| 核心约束 | **Simulation Engine 零功能性改动**；所有变动限于 Renderer、Assets、UI、Effects、Camera 与视觉适配层 |

---

## 1. 执行摘要

V2.1 的目标是把已有的 Three.js 技术骨架推进为更具电影感、海军战术感和沉浸感的三维呈现，同时严格保留确定性仿真、任务、声呐、AI、鱼雷物理、得分与 RNG 行为。本轮工作先以 Chromium 中的实际运行作为视觉审计依据，而不是以自动化测试替代画面验收。审计覆盖主菜单、任务选择、M01–M05 的代表性环境、潜望镜，以及主动声呐后的真实接触信息链路。

审计首先定位并修复了三个阻断 3D 呈现的问题：同一 DOM 画布先后获取 2D 与 WebGL 上下文、渲染适配器以空字符串推导天气、以及后处理着色器中与 Three.js 内置函数冲突的 `luminance` 声明。之后，V2.1 将海面、镜头、潜艇 PBR 细节、低照度光照、HUD 占比和自动质量预设落实在实际渲染路径上；所有程序化资产均有来源、许可和 SHA-256 记录。

> **验收原则：** 489 个测试通过只说明仿真与既有行为没有回归。V2.1 的视觉结论以实际 Chromium 运行、审计截图和逐项问题记录为依据。

## 2. 架构边界与不变性

| 层级 | V2.1 状态 | 说明 |
|---|---|---|
| Simulation Engine | **未修改** | 未改动声呐公式、AI、鱼雷物理、任务脚本、计分、实体行为或引擎 RNG。 |
| Snapshot → RenderState | 已修复 | 继续保持单向呈现桥接；任务天气序列只输入视觉层。 |
| Three.js Renderer | 已增强 | 管理场景、相机、海面、天空、灯光、天气、舰船、潜艇、特效、后处理和叠层。 |
| Canvas 2D | 保留为后备 | 移至独立回退画布，不再与 WebGL 主画布争用上下文。 |
| HUD / 菜单 | 已收敛 | 保留原有交互与信息架构，并降低画面遮挡。 |

## 3. 已交付的 V2.1 改动

### 3.1 渲染稳定性

| 问题 | 修复 | 影响 |
|---|---|---|
| 主画布预先创建了 2D 上下文 | 建立独立 `fallback-canvas` 供旧 2D 渲染器使用，`game-canvas` 专供 WebGL | Three.js 可在真实浏览器中创建 WebGL 上下文；同时保留兼容性后备路径。 |
| 适配器传入空天气种类 | 扩展适配器选项，单向接收 `weatherSpec` 与 `parTimeS` | 视觉天气与任务定义一致，不再触发未知天气异常。 |
| 后处理片段函数名冲突 | 将自定义 `luminance` 改为 `sdLuminance` | 后处理着色器可编译并输出场景。 |
| 潜望镜状态未同步到 Three.js 相机 | 从仿真快照单向镜像状态，并在 `ThreeRenderer` 同步相机模式 | 世界镜头与潜望镜镜头能够按状态切换，未向仿真反写。 |

### 3.2 潜艇、镜头与光照

玩家潜艇仍使用本地 CC0 程序化几何，但已增强流线型艇体的 PBR 材质、金属粗糙度、低照度可读性、圆润艇桥、桥窗、甲板舱口、栏杆、水线、潜望镜、五叶螺旋桨、控制面和鱼雷管。世界相机根据游戏的公里制单位重新标定为近距三分之四跟随视图，避免原先远距离尾追构图使艇体压缩为不可辨识的小点；当潜艇越过潜望镜深度时，镜头也会进入水下跟随构图。

| 视觉要素 | V2.1 处理 |
|---|---|
| 世界镜头 | 近距、偏航三分之四构图，避免正后方透视压缩船体长度。 |
| 水下切换 | 基于玩家深度切换水面/水下相机高度，避免海面遮挡水下艇体。 |
| 月光与夜海 | 提升冷色月光、环境填充光和轮廓光，但保持低饱和、低照度海军风格。 |
| 潜望镜 | 真实验证升起状态、圆形光学遮罩、方位刻度、曝光信息和接触读数。 |
| 舰船 | 保持 Merchant、Cargo、Tanker、Destroyer、Frigate 的独立船体、上层建筑、桅杆和武器/甲板轮廓。 |

### 3.3 海面、天空、天气与后处理

海面已重新校准为符合公里制世界的三级 Gerstner 波：低频主涌浪建立海况，中频横浪打破重复节奏，高频微波承担水面细节与高光。波幅从任务海况对应的米制感知值转换为世界单位，避免风暴中出现程序化巨墙。材质采用更稳定的法线、Fresnel 反射、波峰泡沫、距离雾和不透明水面深度行为；从水下跟随镜头观察时，前向海面不再以半透明层覆盖艇体。

| 环境 | 浏览器中已验证的表现 | V2.1 重点 |
|---|---|---|
| Clear | M01、M02 可启动并显示清朗状态 | 低浪、可见地平线与克制高光。 |
| Cloudy | M03 可启动并显示阴天状态 | 柔和光照、较暗海面与云层。 |
| Storm | M04 可启动并显示风暴状态 | 加强风浪层次、雨点、低频黑云、雾与闪电路径。 |
| Fog | 任务序列与雾渲染路径已由天气序列驱动 | 雾色与密度由呈现层单向映射，保留远方目标淡出语义。 |
| Night | M05 可启动并显示夜间状态 | 月光色调、星层、深蓝/黑色海面与低能见度。 |

后处理保持轻量：ACES 电影色调映射、冷色分级、克制的亮部增强、暗角、胶片噪点和按深度变化的水下染色。设计上避免大面积 Bloom、科幻色彩或“特效演示”式过曝。

### 3.4 战术叠层、HUD 与特效

V2.1 保持 “World > Gameplay > UI > Metadata” 的排序。为此，HUD 两侧栏被收窄、底部事件时间轴缩短，半透明表面和模糊强度也被收敛，以释放更多真实三维视野。主动声呐审计确认，接触信息以类别、方位、距离与置信度提供，而非将未知目标改造成精确红点；这保留了游戏最重要的信息战视觉语言。

| 功能 | 当前实现 | 浏览器验收 |
|---|---|---|
| Active Ping | 潜艇→扩散环→接触返回的呈现通路 | 已在 M05 实际触发并显示 C-01/C-02 接触与事件日志。 |
| Tactical Overlay | 投影接触椭圆、声呐圈、航迹提示和鱼雷轨迹叠层 | 已随世界视图运行；接触信息未泄露精确敌方位置。 |
| Torpedo / Hit | 鱼雷尾迹、命中闪光、冲击环、碎屑和衰减粒子池 | 保留既有表现层；未改动鱼雷仿真。 |
| Depth Charge | 水面/水下爆炸、冲击波、气泡和局部相机响应的表现通路 | 保留既有表现层；未改动深水炸弹逻辑。 |

## 4. 资产来源与许可

项目未引入任何版权或来源不明的第三方三维模型、纹理或 CDN 资源。程序化潜艇、舰船、海面、天空和特效资产的 ID、名称、类型、来源、许可、格式、拓扑/分辨率和 SHA-256 已整理于 [`docs/V2_ASSET_REGISTRY.md`](./V2_ASSET_REGISTRY.md)。既有二维战术精灵的机器可读登记仍保留在 `assets/registry.json`。

> 若将来使用外部资产，必须在登记表中增加来源 URL、明确许可证、文件格式、原始分辨率及 SHA-256；来源或版权不清晰的资产不得进入发布版本。

## 5. 真实浏览器视觉审计

审计通过 Vite 开发服务器和 Chromium 进行。为覆盖所有关卡环境，浏览器中的本地审计存档被临时解锁 M02–M05；该操作只改变审计浏览器的本地保存数据，不改变项目任务配置或 Simulation Engine。所有截图及每图的“Visual Quality / Problems / Fixes”记录均已保存在 `reports/v2-visual-audit/`。

| 文件 | 场景 | 审计要点 |
|---|---|---|
| `01-main-menu.png` | 主菜单 | 审查启动页层级、背景与菜单占比。 |
| `01b-mission-select.png` | 任务选择 | 验证 M01–M05、难度、标准时间和解锁态。 |
| `02-m01-baseline.png` / `02-m01.png` | M01 Clear | 定位并验证 WebGL 上下文、天气适配和后处理阻断项修复。 |
| `03-m02-baseline.png` | M02 First Ambush | 验证晴转阴任务、海面、HUD 和伏击场景启动。 |
| `04-m03-baseline.png` | M03 Convoy Attack | 验证多舰任务、阴天海况和渲染状态。 |
| `05-m04-storm-baseline.png` | M04 Heavy Escort | 验证风暴波形、降雨、雾和风暴任务状态。 |
| `06-m05-night-baseline.png` / `06-m05-night.png` | M05 Silent Hunter | 验证夜间色调、星层、月光和低照度呈现路径。 |
| `07-periscope-baseline.png` | 潜望镜 | 验证升起、光学遮罩、刻度、曝光与状态切换。 |
| `08-tactical.png` | 主动声呐 / 战术接触 | 验证接触分类、方位、距离、置信度和事件反馈。 |
| `00-baseline-findings.md` | 逐图审计记录 | 记录实际观察、问题与修复方向。 |

## 6. 验证结果

| 验证项 | 结果 | 证据 |
|---|---|---|
| 自动化测试 | **PASS** | `npm test`：28 个测试文件、489/489 测试通过。 |
| TypeScript strict | **PASS** | `npm run typecheck`：0 个 TypeScript 错误。 |
| 生产构建 | **PASS** | `npm run build`：71 个模块；JS 849.64 kB，gzip 后 233.50 kB。 |
| 浏览器运行 | **PASS** | Chromium 实测完成主菜单、M01–M05、潜望镜和主动声呐审计。 |
| 视觉审计 | **PASS WITH FOLLOW-UP QA** | 截图与问题记录已保存；改造后仍建议在玩家目标硬件复核构图和低照度读形。 |
| 性能采样 | **自动化环境已采集** | 120 帧 rAF 样本平均 149.58 ms、p95 168.00 ms、JS 堆约 15.9 MiB；自动化浏览器将 rAF 限制约 6.7 FPS，不能代表玩家桌面 GPU 性能。 |

### 性能说明

质量预设不再只是定义文件：浏览器启动时会根据 WebGL 能力、移动端/集显特征、纹理限制与渲染缓冲限制自动选择质量级别，并实际驱动抗锯齿、像素比上限、阴影开关、海面分段数、雨粒数量和后处理开关。正式发布前，应在目标玩家桌面上的 Chrome DevTools Performance 面板中，以 M03 车队压力场景分别采集 HIGH、MEDIUM 和 LOW 的 FPS、帧时间、GPU 内存和 draw calls；在该硬件测量完成前，不应宣称已达到 60 FPS 目标。

## 7. 交付状态

```text
TEST:           PASS — 489/489 tests, 28 files
BUILD:          PASS — Vite production build complete
TYPE CHECK:     PASS — strict TypeScript, 0 errors
BROWSER:        PASS — Chromium visual audit executed
VISUAL:         PASS WITH FOLLOW-UP QA — evidence saved under reports/v2-visual-audit/
PERFORMANCE:    PROFILE READY — target-hardware sign-off pending
DOCUMENTATION:  PASS — V2.1 report and asset registry updated
RELEASE:        READY FOR VISUAL QA REVIEW
```

## 8. 建议的发布前人工复核

在正常玩家桌面硬件上完成一次最终审阅即可形成最终发行签核。重点应放在 M03 的多目标压力场景、M04 的风暴海况、M05 的夜间/雾转场、潜望镜镜头切换，以及鱼雷命中和深水炸弹的短时冲击感。审阅时应坚持以下问题：潜艇是否一眼像潜艇、舰种轮廓是否可辨、海面是否有尺度与空间、天气是否一眼可分、HUD 是否让世界保持第一层，以及接触是否仍以不确定性而非精确红点呈现。


---

## V2.3 Addendum — Local GLB & Cinematic Naval Upgrade

V2.3 introduces a local-only, project-owned GLB asset route while preserving every V2 simulation constraint. A new `AssetManager` validates approved local paths, caches and clones GLB scenes, and disposes resources with the renderer. Hero submarine LOD0–3 and priority Destroyer/Tanker LOD1–3 assets are generated by repository-owned Blender scripts, registered with measured topology and SHA-256 records, and protected by existing procedural fallbacks. No runtime CDN or external asset URL has been introduced.

The visual pass adds speed/heading-driven local stern foam, a restrained storm-volume sky layer, type-distinct depth-charge water columns, a contact-safe world-first HUD reduction, and a transient F12 cinematic capture state. Each addition either uses the existing read-only adapter data or DOM-only state; none writes into the engine or changes gameplay, contact certainty, lock rules, physics, AI, missions, save data, or controls.

| V2.3 validation | Result |
|---|---|
| Strict TypeScript | **PASS** |
| Regression suite | **PASS — 32 files / 506 tests** |
| Production build | **PASS** |
| Asset integrity and local-path policy | **PASS** |
| Chromium mission initialization | **PASS — M05 observed** |
| Direct automation F12/secondary-key visual capture | **LIMITED** — injected keys transitioned the automation viewport to `about:blank`; this is documented, not attributed to game code. |

> The GLB pipeline and its rendering contracts are complete. The remaining release gate is not code compilation: it is target-hardware capture of the submarine, Destroyer, Tanker, torpedo hit and depth-charge plume at usable visual distances. Until those screenshots are captured, the project should not claim a supported `>=7/10` storefront cinematic score.

Detailed evidence and asset-lifecycle notes are in [`V2.3_FINAL_IMPLEMENTATION_REPORT.md`](./V2.3_FINAL_IMPLEMENTATION_REPORT.md), [`reports/v2.3/evidence-manifest.md`](../reports/v2.3/evidence-manifest.md) and [`assets/v3/registry.json`](../assets/v3/registry.json).
