# SILENT DEPTH · UI 样式修改报告（响应式 / 自适应布局）

> 报告类型：界面样式检查 + 修改方案（仅影响呈现层，不动玩法/仿真）
> 检查方式：源码分析 + **真实浏览器（Chromium/WebGL2）多分辨率实测**
> 验证环境：Chrome（headless）+ SwiftShader/ANGLE，5 组视口
> 证据截图：`screenshots/responsive/`（本次实测）、`screenshots/v2/`（既有 1440×900）
> 结论标签：桌面端 **BROWSER VERIFIED**；移动端缺陷 **BROWSER VERIFIED**；全部为**呈现层**改动，无 gameplay 改动。

---

## 0. 结论摘要（一句话）

当前 UI 采用**绝对定位 + 固定像素的三栏“驾驶舱”布局**，其几何尺寸被“HUD 模式类”（`hud--normal/quiet/contact/…`）以**更高 CSS 特异性**锁定，导致现有的所有响应式断点（1440/1280/1024/390）在游戏运行时**全部失效**；在移动端（如 390px 宽）中央任务工作区会**塌缩到约 2px、被左右栏遮挡**，菜单面板也会**横向溢出**。**这不是“手机上好看的窄布局”，而是“桌面固定布局在窄屏上直接崩坏”。**

---

## 1. 当前 UI 布局架构

### 1.1 DOM 结构（`src/main.ts` + `src/ui/`）

```
#app
├── canvas#game-canvas      (WebGL 主画布, position:absolute, inset:0)
├── canvas#fallback-canvas  (2D 回退画布)
├── div#hud-root  → div.hud                (游戏内 HUD 覆盖层)
│   ├── .hud-topbar    顶部栏
│   ├── .hud-workspace 中央任务工作区（地图在其下方透出）
│   ├── .hud-left      左栏（潜艇状态/任务/鱼雷/潜望镜）
│   ├── .hud-right     右栏（目标/火控/操作说明）
│   └── .hud-timeline  底部活动时间线
└── div#menu-root → .menu-overlay → .menu-panel   (主菜单/任务/设置/战报)
```

### 1.2 布局模型（`src/style.css`）

核心几何全部是**绝对定位 + 固定像素**：

| 元素 | 基础定位 | 备注 |
|------|----------|------|
| `.hud-topbar` | `top:0; height:56px; inset 0` | 顶部栏 |
| `.hud-workspace` | `left:218px; right:250px; top:58px; bottom:118px` | 中央地图区（绝对内缩） |
| `.hud-left` | `left:12px; top:58px; bottom:12px; width:196px` | 固定宽左栏 |
| `.hud-right` | `right:12px; top:58px; bottom:118px; width:226px` | 固定宽右栏 |
| `.hud-timeline` | `left:218px; right:250px; bottom:12px; height:94px` | 底部日志 |
| `.menu-panel` | `min-width:460px; max-width:680px` | 居中菜单卡片 |

设计文档 `docs/VISUAL_STYLE.md §12.4` 将其描述为 “**1280×720 target, responsive-ish**”，即原本只针对桌面分辨率，响应式是“顺带”的，不是真正的自适应。

---

## 2. 响应式失效的根因：模式类以更高特异性锁死几何

### 2.1 每次运行时都必然挂上一个模式类

`src/ui/hudPresentation.ts` 的 `deriveHudMode()` 每帧从 `GameSnapshot` 推导当前模式，`src/ui/hud.ts:843` 把 `hud--<mode>` 加到 HUD 根节点。游戏运行时必然是：

`hud--normal | hud--quiet | hud--contact | hud--firecontrol | hud--warning | hud--periscope | hud--paused | hud--cinematic`

### 2.2 模式类规则 vs 媒体查询规则的选择器特异性

| 规则 | 选择器 | 特异性 |
|------|--------|--------|
| 模式类几何 | `.hud.hud--normal .hud-workspace` | **(0,3,0)** |
| 媒体查询几何 | `@media (max-width:1440px) { .hud-workspace { … } }` | **(0,1,0)** |

CSS 规则：**特异性更高的规则获胜，与源码顺序无关。** 由于游戏运行时必定有模式类，`(0,3,0)` 的规则永远压过 `(0,1,0)` 的媒体查询。因此：

> **`.hud-workspace`、`.hud-left`、`.hud-right`、`.hud-timeline` 的所有响应式断点（1440/1280/1024/390）在游戏运行时是“死代码”。**

### 2.3 模式类锁定的真实几何（`src/style.css` 481–650 行）

| 模式 | workspace left/right/bottom | hud-left 宽 | hud-right 宽 |
|------|------------------------------|-------------|--------------|
| normal / contact / warning / periscope / paused | 218 / 250 / 118 | 196 | 226 |
| firecontrol | 218 / 250 / 118 | 196 | **260** |
| **quiet** | **186 / 206 / 74** | **164** | **182** |

这些值**完全忽略视口宽度**，只随“游戏状态”变化，不随“屏幕尺寸”变化。

### 2.4 还有两套互相矛盾的断点

- **顶部 V2.8 断点**（655–818 行）：`max-width:1440/1280/1024/390` + `max-height:800/600`。
- **底部旧“responsive-ish ≥1280×720”断点**（1862–1889 行）：`max-width:1360` 把 workspace/timeline 重新 pin 回 `218/250`、`hud-left:196`、`hud-right:226`（即桌面全尺寸）。因为它在源码**更靠后**，会把 `max-width:1440`、`max-width:1280` 的几何覆盖回去。

---

## 3. 真实浏览器实测证据（Chromium/WebGL2）

对 5 组视口逐一实测（`hud--quiet` 模式，即“无目标、低探测”状态），读取 `getBoundingClientRect`：

### 3.1 游戏内 HUD 几何实测

| 视口 | workspace x/宽 | hud-left 宽 | hud-right 宽 | 是否溢出 | 结论 |
|------|----------------|-------------|--------------|----------|------|
| 1440×900 | 186 / **1048** | 164 | 182 | 否 | 正常 |
| 1280×720 | 186 / **888** | 164 | 182 | 否 | 正常 |
| 1024×768 | 186 / **632** | 164 | 182 | 否 | 偏窄但可用 |
| 768×1024 | 186 / **376** | 164 | 182 | 否 | 地图被压缩 |
| **390×844** | 186 / **2** | 164 | 182 | 是（塌缩） | **地图几乎不可见** |

> **关键证据（390×844）**：`quiet` 模式 pin 了 `left:186px + right:206px = 392px`，而视口仅 390px，故
> `workspace 宽 = 390 − 392 = −2px`（被 clamp 到约 2px）。**左右栏把中央地图完全挤没了。**

截图：`screenshots/responsive/hud-390x844.png`

![移动端 HUD 塌缩](screenshots/responsive/hud-390x844.png)

可见：左侧状态卡占满左边，右侧目标/火控面板被挤到屏幕右侧几乎不可见，中央地图只剩一条细线。

### 3.2 菜单面板实测

| 视口 | menu-panel x/宽 | 是否溢出 |
|------|-----------------|----------|
| 1440×900 | 490 / 460 | 否 |
| 1280×720 | 410 / 460 | 否 |
| 1024×768 | 282 / 460 | 否 |
| 768×1024 | 154 / 460 | 否 |
| **390×844** | **−35 / 460** | **是（横向溢出 70px）** |

> `.menu-panel { min-width:460px }` 在 390px 视口溢出，被裁切两侧。
> 截图：`screenshots/responsive/menu-390x844.png`

### 3.3 桌面参考（既有取证）

`screenshots/v2/m03-convoy-detected-1440x900.png` 显示 1440×900 桌面下完整的“左栏-中央地图-右栏-底部日志”布局正常。即：**桌面没问题，窄屏/移动端才崩坏。**

---

## 4. 其它响应式 / 自适应问题清单

1. **没有真正的流式布局**：整个 HUD 用绝对定位 + 固定 px，没有 `%`、`vw/vh`、`minmax()`、`clamp()` 或 flex 比例分配。`.hud-workspace`、`.hud-timeline` 是绝对内缩，`.hud-left/.hud-right` 是固定宽绝对栏。
2. **390 断点是“缩窄”而非“重构”**：它只是把各栏变小、把 `.controls-card` 隐藏（`display:none`），没有切换成移动端**单列堆叠/面板切换**布局。
3. **没有移动端 true collapse**：窄屏时左栏(196)+右栏(226) 会相互重叠并和塌缩的地图重叠；`hud-left/.hud-right` 虽然 `overflow-y:auto`，但彼此遮挡。
4. **菜单固定宽度**：`.menu-panel { min-width:460px }`、`.menu-title` 30px、`.settings-label` 170px、`.result-bar-label` 170px、`.contacts-empty` 等固定 px 在窄屏不重排。
5. **高度断点相互打架**：`max-height:800/600` 会隐藏卡片，且与宽度断点、模式类叠加后行为不可预测。
6. **触屏适配缺失**：`src/ui/input.ts` 是键盘中心；`canvas { touch-action:none }` 但无触屏按钮；大量 `:hover` 状态（`.contact-row:hover`、`.mission-row:hover`）在触屏无效；没有 ≥44px 触控目标。
7. **彩色/交互仅 hover**：`.btn:hover`、`.icon-btn:hover` 等无 `@media (hover:none)` 回退到 `:active`。
8. `body { user-select:none }` 全局禁用选择，虽符合游戏但属于可访问性取舍（非本次重点）。
9. `prefers-reduced-motion` 已有（好），但未用于布局/位移降级。
10. **缺少 CSS 变量化几何**：若把 `--ws-left/--ws-right/--col-l/--col-r` 等做成变量，媒体查询只需改变量即可全站生效，可从根本上避免模式类锁定几何。

---

## 5. 目标：三层自适应布局方案

按视口宽度规划三档布局，优先级保持 **World > Gameplay > HUD > Metadata**，冲突时世界视图优先。

| 档位 | 宽度 | 布局形态 |
|------|------|----------|
| 桌面 | ≥ 1280px | 维持现有“左栏 + 中央工作区 + 右栏 + 底部时间线”三栏驾驶舱 |
| 平板/中屏 | 768–1279px | 三栏几何改用 `minmax()/clamp()/%` 流式收缩，允许外部栏在必要时折叠为可拉开的抽屉 |
| 移动 | < 768px | **单列堆叠**：顶部栏 → 全宽地图工作区 → 底部“标签页/抽屉”切换 状态 / 任务 / 目标火控 / 日志 |

### 5.1 移动端布局示意

```
┌──────────────────────────────┐
│ 顶栏 (brand·任务·状态·设置)      │
├──────────────────────────────┤
│                              │
│    中央任务工作区 (全宽, 高 α)   │
│    （地图在此，占满可用高度）      │
│                              │
├──────────────────────────────┤
│ [状态] [任务] [目标/火控] [日志] │ ← 底部标签栏 (≥44px 触控)
└──────────────────────────────┘
   （点标签 → 底部抽屉/面板覆盖滑出，可滚动，可关闭）
```

---

## 6. 具体修改方案（仅呈现层，不动 gameplay）

### 6.1 几何改由网格 / CSS 变量驱动（核心）

1. 把 HUD 外壳改为 CSS Grid，用变量定义几何，模式类只控制**透明度/可见性**，不再控制**像素几何**：

```css
.hud {
  display: grid;
  grid-template-columns: var(--col-left, 196px) minmax(0, 1fr) var(--col-right, 226px);
  grid-template-rows: var(--topbar-h, 56px) minmax(0, 1fr) var(--timeline-h, 94px);
  grid-template-areas:
    "topbar topbar topbar"
    "left workspace right"
    "left timeline right";
  gap: 12px;
  padding: 12px;
}
.hud-topbar   { grid-area: topbar; }
.hud-workspace{ grid-area: workspace; min-width: 0; }
.hud-left     { grid-area: left; }
.hud-right    { grid-area: right; min-width: 0; }
.hud-timeline { grid-area: timeline; }
```

2. 去掉 `.hud--<mode>` 里对 `left/right/bottom/width` 的覆写（只保留 opacity/display/背景）。这样媒体查询/变量才能在任意视口生效。

3. 用变量做流式收缩（平板）：

```css
:root { --col-left: clamp(150px, 14vw, 196px); --col-right: clamp(160px, 15vw, 226px); }
```

### 6.2 修复“两套矛盾断点”

删除底部旧 “responsive-ish ≥1280×720” 断点（`max-width:1360` 两处），因为它们把几何重新 pin 回桌面全尺寸，覆盖顶部的 V2.8 断点。保留并统一顶部的 1440/1280/1024/390（重构为变量 + 流式）。

### 6.3 新增真正的移动断点（<768px）

在 `@media (max-width: 767px)` 内切换到单列堆叠：workspace 全宽置顶；左栏/右栏/时间线改为底部标签 + 抽屉（slide-in 面板），并提供“回到世界视图”的关闭按钮。给可点击目标 ≥44px、`@media (hover:none)` 回退 `:active`。

### 6.4 修复菜单面板

```css
.menu-panel {
  min-width: min(460px, calc(100vw - 32px));
  width: min(680px, calc(100vw - 32px));
}
@media (max-width: 767px) {
  .menu-title { font-size: clamp(22px, 8vw, 30px); }
  .settings-label, .result-bar-label { width: auto; min-width: 0; }
  .settings-row { flex-wrap: wrap; }
}
```

### 6.5 触屏 / 可访问性

- `.contact-row`、`.mission-row`、`.btn`、`.meta-chip` 设 `min-height:44px`（移动端）。
- 为 `:hover` 增加 `@media (hover:none)` 下的 `:active` 等效态。
- 潜望镜/火控等关键按钮在移动端改为大触控目标。

### 6.6 保证工作区最小可读宽度

给 `.hud-workspace`、`.hud-right` 等 `min-width:0`，并在移动端让地图区独占一档宽度，避免被绝对内缩到 0/负值。**绝不允许地图区被挤到 0 或负宽。**

---

## 7. 边界与约束（遵循 AGENTS.md）

- **不改动** `src/core`、`src/ai`、`src/sonar`、`src/combat`、`src/gameplay`、`src/missions`、`src/world`、平衡/确定性 RNG/任务数据/存档语义等。
- 改动集中在：`src/style.css`（主）、`src/ui/hud.ts`（移动端面板/标签的 DOM 结构）、必要时 `src/main.ts`（外壳接线）。若跨到架构边界需说明理由并补确定性/回归覆盖。
- 保持单向数据流：`Simulation → GameSnapshot → RenderState → Renderer → HUD/视觉效果`；呈现层只消费快照/渲染状态暴露的事实；隐藏实体必须保持隐藏，缺失事实“fail closed”。
- 视图优先级：**World > Gameplay > HUD > Metadata**；移动端默认世界优先 + HUD 可展开。
- 不改变玩法键位绑定（`src/ui/input.ts`）作为视觉任务的副作用。

---

## 8. 实施与验证建议

1. **分两步**：先做“让几何不再被模式类锁死 + 变量化 + 删矛盾断点”（低风险，桌面/窄屏均有改善），再做“移动端单列/面板重构”（结构性，需回归）。
2. **每步跑 `npm test`、`npm run typecheck`、`npm run build`**；涉及 UI 结构时补 `src/ui` 的单元测试（纯函数类改动，如新增的布局/抽屉切换判据）。
3. **真实浏览器验证**（按 AGENTS.md 要求，且本次实测证明必须真机验证）：至少 1440×900、1280×720、1024×768、768、390×844 五档截图，检查：无重叠、无塌缩、地图可见、菜单不溢出、控制可达；同时检查 WebGL 编译、shader 链接、资源加载、运行时错误。
4. **诚实标注**：视觉/性能结论需 BROWSER VERIFIED；目标硬件性能 TARGET HARDWARE VERIFIED；无浏览器证据时标注 NOT VERIFIED。

---

## 9. 本次检查结论标签

- 桌面端（1440/1280）HUD：**BROWSER VERIFIED**（布局正常）。
- 移动端 HUD 塌缩（390px，workspace≈2px）：**BROWSER VERIFIED**（缺陷实锤）。
- 菜单移动端溢出（390px，min-width 460px）：**BROWSER VERIFIED**（缺陷实锤）。
- 全部为**呈现层**改动，无 gameplay / 仿真改动。
- 几何冲突根因（模式类特异性覆盖媒体查询）：**源码核实 + 实测一致**。

> 备注：本次实测在 headless Chrome + SwiftShader/ANGLE 下进行，属 BROWSER VERIFIED；未在实体目标硬件上测性能（NOT TARGET HARDWARE VERIFIED）。
