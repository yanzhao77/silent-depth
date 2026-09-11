# 推进系统资产模板（Propulsion Asset Template）

版本：v1.0.0 · 建立日期：2026-09-10 · 来源：`RU_SSBN_Typhoon` 母版实测抽取

本模板不是重新设计的规范，而是**从已完成的 Typhoon 资产里实测抽取出来的规范**。
抽取过程见 `Documentation/research/typhoon_propulsion_extract.json`
（由 `Tools/extract_typhoon_propulsion.py` 以只读方式打开母版 `.blend` 生成）。
Typhoon 原始资产未被修改：抽取脚本从不调用保存，输出只写到 Propulsion 目录。

---

## 1. 抽取到的母版实测事实

母版：`SilentDepth_Assets/Submarines/SSBN/Russia/Typhoon_Project941/Blend/RU_SSBN_Typhoon_MASTER.blend`
场景：`Collection` 等 4 个集合 · 603 个对象 · 592 个网格 · 单位 METRIC · `scale_length = 1.0`

| 部件 | 三角面 | 尺寸 (X, Y, Z) m | 材质 | 枢轴 (m) |
| --- | ---: | --- | --- | --- |
| `Propeller_Left` | 6348 | 3.933 × 5.884 × 5.797 | `M_Typhoon_Propeller.002` | (-85.534, 6.25, -1.25) |
| `Propeller_Right` | 6348 | 3.933 × 5.884 × 5.797 | `M_Typhoon_Propeller.002` | (-85.534, -6.25, -1.25) |
| `Propeller_Shroud_-1` | 1152 | 3.882 × 7.000 × 7.000 | `M_Typhoon_PaintedSteel.002` | 几何内嵌 |
| `Propeller_Shroud_1` | 1152 | 3.882 × 7.000 × 7.000 | `M_Typhoon_PaintedSteel.002` | 几何内嵌 |
| `Shaft_Fairing_-1` | 252 | 12.100 × 4.800 × 4.800 | `M_Typhoon_PaintedSteel.002` | 几何内嵌 |
| `Shaft_Fairing_1` | 252 | 12.100 × 4.800 × 4.800 | `M_Typhoon_PaintedSteel.002` | 几何内嵌 |
| `Stern_Hydroplane_±1` | 828 | 11.374 × 7.500 × 1.872 | `M_Typhoon_Rubber.002` | (-69.299, ±7.0, -0.4) |
| `Upper_Rudder_±1` | 828 | 9.640 × 1.516 × 7.100 | `M_Typhoon_Rubber.002` | (-71.316, ±6.25, 1.0) |
| `Lower_Rudder_±1` | 828 | 8.087 × 1.248 × 5.700 | `M_Typhoon_Rubber.002` | (-72.324, ±6.25, -1.0) |
| `Bow_Dive_Plane_±1` | 828 | 6.538 × 5.000 × 1.052 | `M_Typhoon_Rubber.002` | (68.845, ±8.9, 0.6) |

推进相关网格合计 **11404 顶点 / 22560 三角面**，占 152234 面 LOD0 的约 15%。

关键观察：

- 螺旋桨是**独立对象**，原点就落在桨轴轴线与桨盘平面的交点上，`movable_part = true`，
  并把同一个坐标写进自定义属性 `hinge_pivot_m`。旋转部件不做布尔合并。
- 导管（`Propeller_Shroud_*`）与轴包（`Shaft_Fairing_*`）是**静态外壳**，原点在几何内部，
  与桨叶分离，便于在引擎里单独控制。
- 每个部件只挂**一个材质**，没有多材质混合；只有一个 `UV0` 通道。
- 没有修改器残留，变换全部应用（location 是枢轴、scale = 1）。
- 推进部件不参与艇体 LOD 网格，由工厂单独导出成独立静态网格。

---

## 2. 坐标、单位与导出

| 项目 | 规则 |
| --- | --- |
| 单位 | 米（`METRIC`，`scale_length = 1.0`）。绝对不要用厘米建模。 |
| 朝向 | 艏部 +X，Z 轴向上，Y 轴向右舷（母版约定）。 |
| 枢轴 | 旋转部件（桨、舵、水平舵）原点必须落在真实转轴上；静态部件原点在自身几何中心或安装基准面。 |
| 导出 | FBX 2018 兼容（二进制版本 7400）、`UnitScaleFactor = 100 cm`、`axis_forward = -Y`、`axis_up = Z`，**顶点坐标按厘米写出**（与 Typhoon 母版 FBX 一致：175 m 艇长写成 ±87.5 一类的数值）。 |
| 导入 | UE4.27 Uniform Scale 1.0，开启 Convert Scene / Convert Scene Unit，导入法线与切线。不要再乘 100：8 m 长的推进器导入后应显示为 800 cm，已在 UE4.27 实测核对。 |
| 命名 | 对象名一律 `<部件>_<序号>`，禁止 `Cube` / `Object` / `Cylinder` / `Plane` 等默认名。 |

> 实现说明：Blender 5.2 的 FBX 导出器把 `global_scale` 记进单位元数据而不是烘焙进顶点，
> 所以工厂先用临时副本把顶点乘以 100 再导出（见 `Tools/propulsion_common.py` 的 `export_selection`）。
> 建模场景本身仍然是米制，母版 `.blend` 不受影响。

---

## 3. LOD 规则

母版 Typhoon 的 LOD 面数比例为 1 / 0.50 / 0.22 / 0.085。推进系统资产沿用同一比例，
但**从几何上直接生成低模**（而不是对高模做减面），这样导管内壁、桨叶前缘不会塌陷。

| LOD | 目标比例 | 推进器策略 | 用途 |
| --- | --- | --- | --- |
| LOD0 | 1.00 | 完整桨叶型线 + 轮毂 + 导管内壁 + 定子 | 近距离特写、港口展示 |
| LOD1 | ≤ 0.60 | 减少叶展向分段与导管周向分段 | 正常第三人称 |
| LOD2 | ≤ 0.35 | 中弧面简化为平面弦，去掉小倒角 | 中远距离 |
| LOD3 | ≤ 0.15 | 轮廓剪影保持，桨叶变成薄板 | 远距离/大量实例 |

硬性约束：四个 LOD 的**外形尺寸误差 ≤ 2%**，方向与枢轴保持一致，LOD 之间不能出现
方位翻转或尺度跳变。

---

## 4. 材质规则

推进系统默认只使用程序化 PBR 参数，不依赖外部贴图（与 Typhoon 的 `Propeller` 材质一致）：

| 材质名 | 基准色（线性） | 粗糙度 | 金属度 | 用途 |
| --- | --- | ---: | ---: | --- |
| `M_Propulsor_Blade` | 0.250, 0.180, 0.075 | 0.43 | 0.84 | 螺旋桨桨叶、泵喷转子（青铜） |
| `M_Propulsor_Hub` | 0.190, 0.230, 0.250 | 0.40 | 0.82 | 轮毂、桨轴、定子 |
| `M_Propulsor_Duct` | 0.105, 0.130, 0.145 | 0.64 | 0.35 | 导管、泵喷外壳、导流罩 |
| `M_Propulsor_Rubber` | 0.018, 0.027, 0.035 | 0.83 | 0.08 | 消声覆层、导管内侧吸声层 |

贴图是可选项：只有真的提供了本地贴图文件时才写进清单，并且必须记录来源与
SHA-256（见仓库 `AGENTS.md` 资产规则）。缺少贴图不是失败，缺少材质是失败。

---

## 5. 插槽（Socket）命名

所有推进资产必须带至少一个插槽。插槽用 Blender 的 Empty 表达（导出的 FBX 里
保留为命名节点），命名固定为：

| 插槽 | 含义 | 所属资产 |
| --- | --- | --- |
| `SOCKET_PROPULSOR` | 推进器安装/旋转基准，原点在桨盘中心 | 螺旋桨、泵喷 |
| `SOCKET_SHAFT` | 轴端对接点，朝向轴系 | 螺旋桨、轴、泵喷 |
| `SOCKET_RUDDER` | 舵机/舵叶联动基准 | 舵、含舵推进单元 |
| `SOCKET_THRUSTER` | 侧推/辅助推进器安装点 | 推进槽 |
| `SOCKET_PUMPJET` | 泵喷总成安装面（外壳后端面） | 泵喷 |

插槽缩进规则（继承自母版）：<br>
`SOCKET_PROPULSOR` 与 `SOCKET_SHAFT` 在 X 轴上是同一个点（桨盘平面），
`SOCKET_PUMPJET` 在外壳后端面上，`SOCKET_THRUSTER` 在安装法兰面中心。

---

## 6. 碰撞规则

- 碰撞**必须是独立的 UCX 凸包**，不能用渲染网格直接生成。
- 每个推进资产 1–3 个凸包：轮毂/轴 1 个，桨叶盘 1 个，导管或外壳 1 个。
- 碰撞网格命名 `UCX_<ASSET_ID>_<两位编号>`，单独导出 `<ASSET_ID>_COLLISION.fbx`；
  另外导出 `<ASSET_ID>_HULLS.fbx`（凸包命名 `COL_<ASSET_ID>_<编号>`）供 UE 用脚本挂简单碰撞，
  以及 `<ASSET_ID>_COMBINED.fbx`（LOD0 合并成单一网格，作为 UE 主静态网格）。
- 桨叶旋转体用旋转包络（整盘）做碰撞，不要给单叶做凸包：运行时是整盘转动。

---

## 7. 预览规则

每个资产至少输出四视图：`ThreeQuarter`、`Side`、`Rear`、`Top`，
正交或长焦投影、纯色背景、包含 1 米比例参照物。
预览必须是真实渲染结果（Cycles 或 Workbench），不允许使用概念图或生成图冒充实拍。

---

## 8. 校验清单（Validator 会自动检查）

| 项目 | 判定 |
| --- | --- |
| Blend | `<ASSET_ID>_MASTER.blend` 存在且可打开 |
| FBX | LOD0–LOD3 + COLLISION，二进制版本 7400 |
| LOD | 面数单调递减、尺寸误差 ≤ 2% |
| Collision | 凸包数量 ≥ 1，独立文件 |
| Origin | 旋转部件枢轴落在轴线；`origin_rule` 已声明 |
| Scale | 缩放已应用（scale = 1,1,1） |
| Material | 所有网格都有材质，且不存在默认名 `Material` |
| Texture | 若声明贴图则文件必须存在；程序化材质允许无贴图 |
| Socket | 至少一个 `SOCKET_*`，且类型对应 |
| Manifest | 聚合清单与单资产 SPEC 一致且路径存在 |
| Preview | 至少一张真实 PNG，> 5 KB |

---

## 9. 明确不做的事

- 不做反应堆内部结构、燃料、材料参数或任何受控工程细节。
- 不定义真实航速、真实噪声、真实功率、真实水动力性能——那些属于 GAMEPLAY BALANCE 阶段。
- 不修改 Typhoon 母版资产。本模板只读取它。
