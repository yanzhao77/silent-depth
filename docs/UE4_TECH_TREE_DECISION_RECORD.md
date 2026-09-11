# SILENT DEPTH UE4 科技树决策记录

| 字段 | 内容 |
|---|---|
| 文档状态 | ACTIVE |
| 基线日期 | 2026-09-11 |
| 目标分支 | `ue4` |
| 上游计划 | `docs/UE4_TECH_TREE_EXECUTION_PLAN.md` §11 |
| 本记录范围 | `DEC-001`、`DEC-002`、`DEC-004` 已决定；`DEC-003`、`DEC-005`、`DEC-006` 仍为 OPEN |

本记录只固定决策与边界，不替代数据、资产或运行时的实施任务。决策落地时若发现
与本文冲突的事实，先修本文，再改代码。

---

## 1. 决策状态总览

| 决策 ID | 主题 | 状态 | 决定 | 解锁任务 |
|---|---|---|---|---|
| DEC-001 | `DATABASE_ONLY` 条目不制作内部工程模型 | **DECIDED** | 接受，并按"现实型号资料不足 / 游戏通用占位"两类分别定边界 | DATA-006、五类科技树验收 |
| DEC-002 | 授权修改潜艇母版以增加装备 socket | **DECIDED** | 授权，但限定为 Akula 垂直切片，且只改工作副本、母版保持只读 | SOCKET-001、SNS-002、DEF-002 |
| DEC-003 | 首批潜艇生产顺序 | OPEN | 未决定，沿用计划推荐的 Batch A 作为待批方案 | P5 内容扩产 |
| DEC-004 | 科技树研究资源来源 | **DECIDED** | 任务结算唯一产出；初版成本曲线按 Tier 递进 | TECH-004、SAVE-001、UI-001 |
| DEC-005 | 是否允许 `GAMEPLAY` 标记的推测配发 | OPEN | 未决定 | TECH-005、各类 loadout |
| DEC-006 | Windows UE4.27 验收环境与目标硬件 | OPEN | 未决定 | 全部 `EDITOR VERIFIED` 与性能任务 |
| DEC-007 | 层阶门槛：Tier N 需要同类别下方最近非空层阶里已解锁几个节点 | **DECIDED** | 取 1：逐层解锁 | UI-001 的科技树体验 |

---

## 2. DEC-001：`DATABASE_ONLY` 政策

### 2.1 事实依据

| 证据 | 内容 |
|---|---|
| 武器 `weapon_manifest.json` | 124 个变体中 4 条为 `DATABASE_ONLY`：`CN_LAM_YJ18_LandAttack`、`IN_TORP_TAL`、`IN_SLBM_K5`、`US_ASW_SeaLance` |
| 武器磁盘核对 | 120 个 `*_MASTER.blend` 存在；上述 4 条的 `master` / `lod0..3` / `collision` 目录在磁盘上不存在 |
| 传感器 `sensor_manifest.json` | 150 条中 111 条为 `DATABASE_ONLY`，其中 102 条是 `GEN_*` 游戏占位节点（备注写明"不对应任何现实型号"） |
| 传感器现实条目 | 9 条为真实名称但缺几何，如 `RU_SONAR_MGK540`、`UK_SONAR_2074`、`RU_ESM_RimHat`、`RU_RADAR_MRK50` |
| 推进 | 20/20 有几何，不涉及本决策 |

结论：`DATABASE_ONLY` 是两种完全不同的东西被同一个状态名覆盖，必须先分类再定边界。

### 2.2 决定

**接受 `DATABASE_ONLY` 条目不制作内部工程模型。**

### 2.3 分类与边界

| 类别 | 判定 | 必须满足 | 明确不做 |
|---|---|---|---|
| A · 现实型号资料不足 | 真实存在、公开资料不足以支撑几何或数值 | 保留数据条目、Tier、兼容关系；`confidence`/`status` 保持 `UNKNOWN` 或 `GAMEPLAY`；UI 显式标注"资料不足/非实测" | 不建 3D；不凭经验补数值 |
| B · 游戏通用占位节点 | `GEN_*` 一类无现实对应物的科技树节点 | 保留数据与依赖；UI 走统一程序化图标；装备后落到已批准的通用外观或明确"无外观" | 不建 3D；不得伪装成现实型号 |

不可妥协的边界：

1. `DATABASE_ONLY` 不进入 3D 生产队列，也不阻塞任何垂直切片。
2. 但也不允许表现为空白、报错或断裂引用——UI 必须能把它显示为可研究/可装备状态并带标签。
3. 缺 3D 不得改变任何玩法数值、命中判定或事件顺序；表现层使用程序化或通用回退外形。
4. 数据中的资产路径必须与磁盘一致。上述 4 条武器的路径指向不存在的目录，属于 `DATA-003` 的字段语义修复范围；在语义定清之前，这些路径不得当作"待导入资产"。
5. 某条 `DATABASE_ONLY` 后续获得可靠资料时，走"升级"流程（资料 → 数据 → 3D 生产队列），不回溯改写历史判定。

### 2.4 后果

- `DATA-006` 可直接执行，五类科技树的验收标准明确排除模型要求。
- `UI-002` 必须实现"资料不足"与"无外观"两种状态展示。
- 3D 生产队列只按 `COMPLETE`/`PLANNED` 的真实优先级排序，不再被 111 条传感器数据库条目污染。

---

## 3. DEC-002：潜艇装备 socket 授权

### 3.1 事实依据

| 证据 | 内容 |
|---|---|
| 母版保护约定 | `docs/SUBMARINE_MODULAR_MAC_EXECUTION_REPORT.md`：所有正式 MASTER 保持只读，改动发生在外部工作副本 |
| 已有先例 | Yasen `run-002` 工作副本创建 `30_ANCHORS`：5 个 Pivot + 1 个 Socket，Assembly 审计 `errorCount=0` |
| Socket 词表 | `docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md` §5.7 已定义统一类型；传感器 8 类、推进 5 类、防御 6 类分别有各自注册表 |
| Akula 现状 | 已有独立可动部件（PROP / RUDDER / STERNPLANES / BOWPLANES / PERISCOPE）并被 C++ 接线；但没有任何装备或发射 socket |
| 本机约束 | 当前 Windows 工作站未安装 Blender，几何与 Anchor 制作只能在装有 Blender 5.2.1 的机器上执行 |

### 3.2 决定

**授权，但限定为"Akula 垂直切片 + 只改工作副本"。**

### 3.3 执行方式

| 规则 | 内容 |
|---|---|
| 授权范围 | 只授权 Akula 先做；Yasen、Typhoon 在 Akula 切片通过验收后逐个授权 |
| 改动方式 | 绝不原地修改 `*_MASTER.blend`。走既有流水线：母版 → 工作副本 → `30_ANCHORS` → 审计 `errorCount=0` → staging 导出 → Assembly JSON → UE 导入 |
| 几何改动边界 | 本切片只增 Anchor/Empty 与 Assembly 数据，不切割艇体、不动既有几何 |
| 命名 | 分三层，禁止各艇自创同义名，见下方"命名与映射" |
| 词表来源 | `docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md` §5.7 的统一类型（鱼雷发射 / VLS / 诱饵 / 传感器 / 推进 / 尾流 / 水花 / 摄像机 / 声音） |
| 方向语义 | 每个 socket 必须带明确朝向；鱼雷管 socket 的 `+X` 即发射方向 |
| 验证 | 验证器检查 socket 不在艇体包围盒外的异常距离，并生成可视化预览供人工确认 |
| 回滚 | 母版只读，出错只需丢弃工作副本与 staging，不污染仓库 |

Akula 本切片必需的 Socket 最小集（`类别名 → Assembly 逻辑 id`）：

```text
武器       → torpedo_tube_01_muzzle      新建 Anchor
传感器     → sonar_bow                   新建 Anchor
传感器     → towed_array                 新建 Anchor
防御       → ew_antenna                  新建 Anchor
防御       → decoy_launcher_01/_02       新建 Anchor
推进       → propulsor_01                已有独立部件，只需补 Anchor 与命名对齐
传感器     → periscope                   已有独立部件，只需补 Anchor 与命名对齐
```

### 3.3.1 命名与映射

当前存在两套命名习惯：模块化流水线用每艇唯一的
`SOCKET_SUB_<HULL>_<PURPOSE>`，而传感器/防御/推进注册表用类别级名称
（`SOCKET_SONAR_BOW`、`SOCKET_ESM`、`SOCKET_PROPULSOR` 等）。两者都保留，
但必须各司其职，不允许在实现时混用：

| 层 | 形式 | 示例 | 归属 |
|---|---|---|---|
| Blender Anchor | `SOCKET_SUB_<HULL>_<PURPOSE>` | `SOCKET_SUB_RU_AKULA_TORPEDO_TUBE_01_MUZZLE` | 母版工作副本，每艇唯一 |
| Assembly 逻辑 id | `<purpose>` 小写 | `torpedo_tube_01_muzzle` | Assembly JSON 的 `sockets[].id`，跨艇一致 |
| 资产库类别名 | 类别级大写 | `SOCKET_SONAR_BOW`、`SOCKET_ESM` | 传感器/防御/推进注册表 |

映射关系由 `DATA-001` 的 schema 定义，`Assembly JSON` 的 `sourceAnchor` 字段负责把
前两层绑到一起，类别名与 `purpose` 的对照表是装备兼容判定的唯一入口。

暂不做、需另行确认：Akula 鱼雷舱盖建模与艇体切割，保持 `USER DECISION REQUIRED`。

### 3.4 后果

- `SOCKET-001` 可按 Akula 单一对象启动，执行位置在 Blender 侧，Windows 侧只做 UE 导入与验收。
- `SNS-002`、`DEF-002` 的表现挂点有了唯一权威来源。
- Yasen 已有 `run-002` Anchor 数据，但它的 socket 位置是 `GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY`，不是实测值，UI/数据中不得当作真实装备位置。

---

## 4. DEC-004：科技树研究资源

### 4.1 事实依据

| 证据 | 内容 |
|---|---|
| 数据现状 | 五套科技树的节点没有 `cost`、没有货币/研究点字段，`unlock_requirements` 只描述前置节点与平台兼容 |
| 评分体系 | `docs/GAME_DESIGN.md` §10：总分 1000，等级 Perfect/Excellent/Good/Poor/Failed(<400) |
| 存档现状 | UE 侧尚无 `USaveGame` 实现 |
| 数值权威 | 平衡数值唯一来源是配置，禁止硬编码（ADR-002 / NFR-5） |

### 4.2 决定

**研究点只从任务结算产出，早期不引入时间恢复、挂机或交易。初始数值进配置，不进代码。**

### 4.3 初版经济规则

| 项 | 初版值 | 说明 |
|---|---|---|
| 唯一来源 | 完成任务结算 | 含 M01–M05 与生成关卡 |
| 结算公式 | `RP = floor(结算分数 / 10) + 首次通关奖励` | 分数 < 400（Failed）产出 0 |
| 首次通关奖励 | 每任务一次，+50 | 按任务 ID 记录已领取标记 |
| 重复游玩 | 可重复获得，不设衰减 | 仍记录各任务最高分 |
| 节点成本 | `cost = tier × 100`（T1=100 … T10=1000） | 初版曲线，仅用于让经济可玩 |
| 初始余额 | 0 | 与"先解锁、后购买"的顺序一致 |
| 明确不做 | 内购、时间恢复、每日刷新、随机折扣 | 离线确定性游戏，不做可变现资源 |

### 4.4 强制约束

1. 数值权威在 UE 侧平衡配置，由 `SilentDepthCore` 强类型读取；C++ 不得硬编码 RP 数值。
2. RP 结算只依赖任务结果快照（分数、首次通关标记），不读墙钟、不读帧率、不消费引擎 RNG——同一存档 + 同一任务结果必须得到同一 RP。
3. RP 只决定解锁与装备。任何进入权威仿真的能力修正（速度、噪声、探测、武器）必须另走 `PROP-001`/`WPN-001`/`SNS-001`/`DEF-001` 的确定性测试，不得借科技树绕过。
4. RP 余额、已解锁节点、已购装备与每艇 loadout 一并进 `SAVE-001` 的 schema；非法值、未知 ID、余额为负必须失败关闭。
5. 本文数值是初版可玩值，允许在试玩后调整，但调整只发生在配置文件。

### 4.5 后果

- `TECH-004` 有了明确的事务规则与失败条件。
- `SAVE-001` 的 schema 需要包含研究点余额与领取记录。
- `UI-001` 需要显示余额、成本、可研究/前置不足/`DATABASE_ONLY` 四种状态。
- 五任务首次通关预计产出约 600 RP，足够点亮若干中低阶节点；T10 平台需要重复游玩，属于设计意图。

---

## 5. 仍未决策

### 5.1 DEC-007：层阶门槛（2026-09-12 决定）

**决定**：`tierGateRequiredUnlocked = 1`。Tier N 的节点需要同类别、下方**最近的非空层阶**
里已解锁 1 个节点。

**为什么用规则而不是数据**：四棵树没有显式前置边，只有武器链有。给每个节点编造前置关系
等于把游戏设计伪装成资料；层级推进是玩法规则，因此实现为可配置规则。

**两个保护**：

1. 跳过空层阶——潜艇目录没有 T1（从 T2 开始），照字面写"上一层"会让整棵潜艇树无解；
2. 需求钳到该层阶的节点数——配置写再大也不会锁死。

**实测影响**（零进度可研究节点 246 → 22）：

| 类别 | 开启后 | 总数 |
|---|---|---|
| 潜艇 | 5 | 54 |
| 武器 | 1 | 124 |
| 传感器 | 13 | 150 |
| 防御 | 2 | 13 |
| 推进 | 1 | 20 |

**锁定方式**：`TierGate.ShippedConfigMatchesDecision` 断言出厂值为 1，改动会让测试失败；
调整数值应先改本记录。

| 决策 ID | 主题 | 影响 | 建议 |
|---|---|---|---|
| DEC-003 | 首批潜艇生产顺序 | P5 内容扩产无法启动 | 采用 Batch A（Los Angeles / Virginia / Seawolf / Astute / Suffren） |
| DEC-005 | 是否允许 `GAMEPLAY` 标记的推测配发 | `TECH-005`、各类 loadout 的可填范围 | 允许，但 UI 与数据中必须与现实资料明确区分 |
| DEC-006 | Windows UE4.27 验收环境与目标硬件 | 所有 `EDITOR VERIFIED` 与性能结论 | UE4.27.2 + Windows 10/11 + GTX 1050 基线 |

---

## 6. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-09-11 | 建立本记录；决定 `DEC-001`、`DEC-002`、`DEC-004` |
| 2026-09-12 | 决定 `DEC-007`（层阶门槛取 1）；机制先行交付，随后按决定启用 |
