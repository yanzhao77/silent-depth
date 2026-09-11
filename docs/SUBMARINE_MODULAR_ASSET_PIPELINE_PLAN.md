# SILENT DEPTH 潜艇模块化资产与 UE4 组装长计划

| 字段 | 内容 |
|---|---|
| 文档状态 | ACTIVE |
| 基线日期 | 2026-09-11 |
| 目标分支 | `ue4` |
| 目标引擎 | Unreal Engine 4.27.2 |
| Blender 检查版本 | Blender 5.2.1 LTS |
| 首批对象 | Akula、Yasen、Typhoon |
| 核心目标 | 一个 Blender 母版自动生成艇体、活动部件、挂点、碰撞和 UE4 组装数据 |
| 架构约束 | `Simulation -> GameSnapshot/State -> Presentation`，表现不得反向修改权威仿真 |

## 1. 文档目的

本计划解决以下重复成本：潜艇先在 Blender 中整体完成，导入 UE4 后才发现螺旋桨、
方向舵、升降舵、潜望镜和鱼雷舱盖需要运动，于是在 UE4 或 Blender 中再次手工拆件、
设置原点、重新导出并重新摆放。

目标不是把每艘潜艇拆成大量独立文件，也不是把所有内部系统完整建模。目标是建立一条
可以重复执行、自动验证、适用于后续几十艘潜艇的生产线：

```text
一个可编辑 Blender MASTER
    -> 明确的静态结构、活动程序集和逻辑挂点
    -> 配置驱动的 Blender 审计与导出
    -> Hull FBX + Part FBX + Assembly JSON
    -> UE4 批量导入与 SubmarineDefinition
    -> 通用 ASubmarinePawn 自动组装
    -> 权威状态和事件驱动表现动画
```

本计划应作为以下现有文档的潜艇资产专项补充，而不是替代它们：

- `docs/UE4_TECH_TREE_EXECUTION_PLAN.md`
- `ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md`
- `SilentDepth_Assets/Templates/Submarine/SilentDepth_Submarine_Asset_Template.json`
- `SilentDepth_Assets/Templates/Submarine/SilentDepth_Submarine_Validation_Rules.json`

## 2. 当前问题与根因

### 2.1 当前行为

当前 `tools/ue4/import_submarines.py` 只为 Akula 配置了独立活动部件：

```python
"parts": ("PROP", "RUDDER", "STERNPLANES", "BOWPLANES", "PERISCOPE")
```

Yasen 和 Typhoon 没有相同的 `parts` 配置，所以 UE 导入脚本只消费它们的整体 LOD。
这不代表源模型中没有独立部件，只代表现有导出和导入契约没有描述这些部件。

`ue4/SilentDepthUE/Source/SilentDepthUE/SubmarinePawn.cpp` 当前还直接硬编码：

- Akula Hull 和 5 个活动部件的 UE 资产路径；
- 螺旋桨轴位置；
- 方向舵、艏升降舵和艉升降舵的铰链位置；
- 潜望镜初始位置、行程和运动时间；
- 活动部件的创建和动画逻辑。

这种实现可以验证一艘艇，但无法经济地扩展到 54 艘潜艇。每增加一艘艇都需要修改 C++、
重新编译，并重新手调坐标。

### 2.2 三艘母版检查结论

| 潜艇 | 当前情况 | 主要缺口 | 推荐处理 |
|---|---|---|---|
| Akula | 用户已修改舵面、螺旋桨、潜望镜；现有工厂已导出 5 类活动部件 | 鱼雷舱盖、鱼雷管逻辑挂点、其他桅杆未接入；UE 仍硬编码 | 作为兼容回归对象，不重新制作现有活动件 |
| Yasen | 源母版中螺旋桨、艏舵、尾部结构、桅杆、艏门、VLS 盖等多数仍是独立源对象；检查无结构性 issue | 最终 LOD 是合并网格；没有活动部件导出配置 | 作为第一艘新管线验证艇 |
| Typhoon | 源母版仍保留螺旋桨、舵、舱盖等独立对象 | 命名和材质存在旧版重复后缀；有退化面、零长度边和未分配材质面 | 最后迁移，先标准化再导出 |

检查报告位于本地 `test-results/`，这些报告目前是未跟踪检查产物，不作为本计划提交内容。

### 2.3 根因

根因不是“潜艇模型不能整体制作”，而是缺少以下生产契约：

1. 没有统一说明哪些对象属于固定艇体，哪些属于运行时活动程序集。
2. 没有统一说明每个活动件的功能 Pivot、局部运动轴和运动范围。
3. 没有统一的逻辑挂点数据描述鱼雷、导弹、传感器、诱饵、特效和声音位置。
4. 没有配置驱动的 Blender 临时场景导出器。
5. UE4 运行时没有数据驱动的潜艇定义，仍以 Akula 为特例。
6. 缺少从 Blender 导出结果到 UE4 资产和运行时组件的自动一致性检查。

## 3. 范围与非目标

### 3.1 本计划范围

- 标准化潜艇 Blender 母版的 Collection、对象名、轴向、单位和 Pivot。
- 定义固定艇体、刚性活动部件、逻辑挂点、碰撞和 LOD 的边界。
- 定义 `submarine_assembly.json` schema。
- 实现 Blender 母版审计脚本。
- 实现不修改母版的配置驱动导出脚本。
- 扩展 UE4 导入脚本以导入任意潜艇的活动部件。
- 实现 UE4 `SubmarineDefinition` 数据结构。
- 将 `ASubmarinePawn` 从 Akula 硬编码改为数据驱动组装。
- 接入螺旋桨、舵面、潜望镜和鱼雷舱盖的表现动画。
- 迁移 Yasen、Akula、Typhoon。
- 为后续潜艇批量生产建立模板、验证器和任务清单。

### 3.2 非目标

- 不在本计划中重做三艘潜艇的整体造型。
- 不要求把每艘潜艇完整改造成 Skeletal Mesh。
- 不制作不可见的反应堆、声呐处理机、电子战机柜或完整鱼雷舱内部。
- 不为每个铆钉、装饰板、固定盖板创建 UE Component。
- 不在 UE4 中手工切割已经合并的最终网格作为长期生产方案。
- 不让舱门动画、模型碰撞或特效决定权威仿真的发射、命中或探测结果。
- 不在未获得用户授权时修改三个 `.blend` 母版。
- 不在没有 Windows UE4.27 实测时声称 `EDITOR VERIFIED`。

## 4. 总体设计原则

### 4.1 一个潜艇一个母版

每艘潜艇只维护一个主要 Blender 母版：

```text
Blend/[ASSET_ID]_MASTER.blend
```

不为螺旋桨、舵面、潜望镜和舱盖分别维护互不关联的 Blender 工程。活动件仍在同一母版中
按真实安装位置建模，导出脚本根据配置自动复制、重定位和导出。

现有手工制作的母版可以继续作为几何权威。后续自动化必须以版本控制中的 Python 脚本
负责审计、分组、导出、报告和机械运动验证，不能依赖无法复现的手工导出步骤。

### 4.2 按共同运动划分程序集

活动部件的粒度由“是否共享同一局部变换”决定，不由 Blender Object 数量决定。

示例：

- 螺旋桨轴、轮毂和叶片一起旋转，可以导出为一个 `PROPULSOR`。
- 上下方向舵如果同轴、同角度运动，可以组成一个 `RUDDER` 程序集。
- 左右艏升降舵如果完全同步，可以组成一个 `BOW_PLANES`；需要独立损伤表现时再拆分。
- 两扇鱼雷舱盖如果铰链和旋转方向不同，必须是两个程序集。
- 多个固定天线罩不运动，应并入 Hull，不建立独立组件。

### 4.3 静态网格优先

潜艇活动件主要是刚性旋转或平移，首选多个 `UStaticMeshComponent`：

- 不需要骨骼蒙皮；
- Pivot 和运动轴容易验证；
- 每个部件可以独立设置 LOD、可见距离和碰撞；
- 适合由配置动态组装；
- 对现有 FBX 管线改动较小。

仅在以下情况考虑 Skeletal Mesh：

- 单个机构包含大量强耦合连杆；
- 需要复杂的预制动画片段；
- 存在软体或顶点变形；
- Static Mesh Component 数量和更新开销经过测量后不可接受。

在前三艘潜艇完成前，不引入 Skeletal Mesh 潜艇方案。

### 4.4 表现失败不能改变玩法

鱼雷发射等流程必须遵循：

```text
权威仿真确认发射
    -> 事件暴露 weaponId、platformId、tubeId（若有）
    -> 表现层打开对应舱盖
    -> 从对应逻辑挂点生成鱼雷 Actor/VFX/声音
    -> 表现层关闭舱盖
```

如果部件资产、舱盖或挂点缺失，表现层可以不播放对应动画并记录错误，但不得撤销或推迟
已经由仿真确认的发射。若事件没有 `tubeId`，表现层不得猜测具体鱼雷管并打开错误舱盖。

## 5. Blender 母版生产契约

### 5.1 推荐 Collection 结构

模板最终应统一到以下结构。现有艇不要求立即手工搬动所有对象；迁移脚本可以通过配置将
旧 Collection 和对象名映射到这些语义组。

```text
SUB_[COUNTRY]_[CLASS]
├── 00_ROOT
├── 10_STATIC
│   ├── HULL
│   ├── SAIL
│   ├── FIXED_SONAR
│   └── FIXED_DETAILS
├── 20_MOVABLE
│   ├── PROPULSOR
│   ├── RUDDER
│   ├── BOW_PLANES
│   ├── STERN_PLANES
│   ├── MASTS
│   ├── PERISCOPES
│   ├── TORPEDO_DOORS
│   ├── VLS_DOORS
│   └── OTHER_HATCHES
├── 30_SOCKETS
│   ├── WEAPONS
│   ├── SENSORS
│   ├── DEFENSE
│   ├── PROPULSION
│   ├── VFX
│   ├── AUDIO
│   └── CAMERA
├── 40_COLLISION
├── 50_LOD_SOURCE
└── 90_EXPORT_PREVIEW
```

`90_EXPORT_PREVIEW` 仅用于人工检查导出组合，不作为必须手工维护的生产源。正式导出应在
临时场景中生成，完成后删除临时数据，不污染母版。

### 5.2 对象命名

统一命名格式：

```text
SUB_[COUNTRY]_[CLASS]_[PART]_[SIDE]_[INDEX]
```

建议词表：

| 用途 | 示例 |
|---|---|
| 艇体 | `SUB_RU_AKULA_HULL` |
| 螺旋桨轮毂 | `SUB_RU_AKULA_PROPULSOR_HUB_01` |
| 螺旋桨叶片 | `SUB_RU_AKULA_PROPULSOR_BLADE_01` |
| 方向舵 | `SUB_RU_AKULA_RUDDER_UPPER_01` |
| 艏升降舵 | `SUB_RU_AKULA_BOW_PLANE_L_01` |
| 潜望镜 | `SUB_RU_AKULA_PERISCOPE_01` |
| 鱼雷舱盖 | `SUB_RU_AKULA_TORPEDO_DOOR_L_01` |
| 碰撞体 | `UCX_SUB_RU_AKULA_HULL_01` |
| 逻辑挂点 | `SOCKET_SUB_RU_AKULA_TORPEDO_TUBE_01_MUZZLE` |

禁止新增 `Cube.001`、`Cylinder.017`、`Object.004` 等无语义生产对象。旧母版中的此类名称由
迁移任务逐步处理，不在自动导出时静默猜测。

### 5.3 单位和坐标

统一约定：

- Blender 使用 Metric meters。
- 1 Blender meter = 100 Unreal Units。
- 舰艏朝 Blender `+X`。
- `Z` 向上。
- `Y` 为横向轴，左右含义必须在资产 SPEC 中明确并保持全库一致。
- 母版根节点位置为 `(0, 0, 0)`。
- 导出前最终尺度应为 `(1, 1, 1)`。
- 不依靠 UE 导入时的非 1.0 Uniform Scale 修复尺寸。

### 5.4 Pivot 和锚点

每个运行时活动件必须具有功能 Pivot：

| 部件 | Pivot 位置 | 默认运动 |
|---|---|---|
| 螺旋桨 | 桨轴中心线与轮毂中心 | 绕局部 X 旋转 |
| 方向舵 | 实际铰链轴 | 绕局部 Z 旋转 |
| 艏/艉升降舵 | 实际铰链轴 | 绕局部 Y 旋转 |
| 潜望镜/桅杆 | 升降导轨轴 | 沿局部 Z 平移，可选绕 Z 旋转 |
| 鱼雷舱盖 | 舱盖铰链轴 | 绕配置轴旋转 |
| VLS 舱盖 | 舱盖铰链轴 | 绕配置轴旋转 |

建议在母版中为每个程序集建立一个 Empty 锚点：

```text
PIVOT_SUB_RU_AKULA_RUDDER
PIVOT_SUB_RU_AKULA_PERISCOPE_01
```

源 Mesh 可以保持便于编辑的对象结构并作为该 Empty 的子对象。导出脚本使用锚点的
`matrix_world` 计算局部几何，不允许通过包围盒自动猜测最终生产 Pivot，除非该资产配置
明确声明使用经过验证的旧版迁移规则。

### 5.5 变换规则

- 不能只把 Object Origin 移到铰链而保留补偿位移，再让 UE Component 二次摆放。
- 导出件的顶点必须转换到功能 Pivot 的局部空间。
- 导出对象自身 Location/Rotation 应归零，Scale 应为 1。
- 活动件的安装变换单独写入 Assembly JSON。
- 修改父子关系后必须验证 `matrix_world`，防止视觉位置发生变化。
- 负尺度和未应用镜像必须在导出前处理或阻止导出。

### 5.6 固定艇体与活动件排他性

每个可见三角面只能属于一个运行时导出组：

- 活动件不得重复包含在 Hull LOD 中。
- 活动件不同 LOD 之间可以共享来源，但同一 LOD 不得与 Hull 重叠。
- 审计器必须检查一个源对象是否被多个导出组引用。
- 审计器必须检查配置声明的对象是否不存在或匹配为空。
- 不允许通过在 UE 中隐藏 Hull 的重复部分来掩盖错误导出。

### 5.7 逻辑 Socket

Socket 是逻辑安装点，不要求一定成为 UE Static Mesh Socket。Blender 中使用 Empty，导出器
将其相对潜艇根节点的 Transform 写入 Assembly JSON。UE4 第一版优先把它们创建为运行时
`USceneComponent` 锚点，避免依赖不稳定的编辑器 Socket 写入 API。

统一 Socket 类型：

| 类别 | 示例 | 使用方 |
|---|---|---|
| 鱼雷发射 | `TORPEDO_TUBE_01_MUZZLE` | 鱼雷 Actor、气泡、声音 |
| VLS 发射 | `VLS_CELL_01_MUZZLE` | 导弹 Actor、烟雾、声音 |
| 诱饵发射 | `DECOY_LAUNCHER_01` | 防御系统 |
| 传感器安装 | `SENSOR_MAST_01` | 可替换传感器外形 |
| 推进安装 | `PROPULSOR_01` | 可替换推进器外形 |
| 尾流 | `WAKE_STERN` | Niagara/粒子表现 |
| 水花 | `WAKE_BOW` | Niagara/粒子表现 |
| 摄像机 | `CAMERA_PERISCOPE` | 潜望镜视角 |
| 声音 | `AUDIO_PROPULSOR` | 推进声音 |

Socket 方向必须有实际意义。例如鱼雷管 Socket 的 `+X` 必须是发射方向。验证器应检查
Socket 不在艇体包围盒外的异常距离，并生成可视化预览供人工确认。

### 5.8 鱼雷舱建模边界

默认只制作玩家可见且会运动的结构：

- 外部鱼雷管舱盖；
- 必要的门框、铰链和较浅的暗色内壁；
- 发射口逻辑 Socket；
- 开门和关门所需的可见机械连接。

默认不制作：

- 完整鱼雷舱室；
- 装填机、人员空间和内部管线；
- 永久放置在艇体网格中的鱼雷本体；
- 镜头永远看不到的内部结构。

只有当游戏加入可进入内部、损伤剖面或装填动画时，才建立独立的内部舱室资产包。

### 5.9 LOD 策略

Hull 保持 LOD0-LOD3。所有 LOD 必须直接从 MASTER 或共同高质量源派生，不允许连续从
LOD1 降到 LOD2、再从 LOD2 降到 LOD3。

活动件按可见性和轮廓重要性分级：

| 部件 | 建议 LOD |
|---|---|
| 大型螺旋桨、方向舵、升降舵 | LOD0-LOD2；远距可并入最低 LOD 或隐藏 |
| 潜望镜和主要桅杆 | LOD0-LOD1；远距按像素尺寸隐藏 |
| 鱼雷舱盖、VLS 盖 | LOD0-LOD1；远距关闭独立渲染 |
| 小型天线和装饰 | 近景独立或并入 Hull；远距删除 |

第一版可以只为活动件输出一个经过控制的中高质量网格，但必须记录后续 LOD 策略和
可见距离，不能默认所有细件在任意距离持续渲染。

### 5.10 碰撞策略

- 权威航行和命中不得依赖视觉网格逐三角碰撞。
- Hull 使用少量 `UCX_` 闭合凸体描述整体体积。
- 螺旋桨、桅杆、舵面和舱盖默认关闭碰撞，除非玩法明确需要。
- 玩家近距离相机防穿模可使用单独简化体，不使用高模渲染网格。
- 碰撞体必须拥有明确所有者，不能同时出现在 Hull 和独立部件资产中。

### 5.11 材质策略

- 活动件复用潜艇母材质实例和稳定材质槽词表。
- 导出器不得依据 `.001`、`.002` 后缀创建无限重复的 UE 材质。
- 材质槽标准化应记录旧名称到规范名称的显式映射。
- 纹理继续保持本地离线路径、来源、许可和 SHA-256 记录。
- NormalDX 用于 UE；NormalGL 只作为其他工具链产物保留。

## 6. Assembly JSON 契约

### 6.1 权威关系

`submarine_assembly.json` 是 Blender 导出与 UE 表现组装之间的源码权威。UE DataAsset 是由
该 JSON 生成或同步的消费产物，不允许两边长期手工维护不同数值。

建议每艘潜艇存放：

```text
Documentation/[ASSET_ID]_ASSEMBLY.json
```

并为 schema 建立：

```text
SilentDepth_Assets/Templates/Submarine/submarine_assembly.schema.json
```

### 6.2 建议结构

```json
{
  "schemaVersion": 1,
  "assetId": "RU_SSN_Yasen",
  "units": "meters",
  "coordinateSystem": {
    "forward": "+X",
    "up": "+Z"
  },
  "hull": {
    "lods": [
      "FBX/RU_SSN_Yasen_LOD0.fbx",
      "FBX/RU_SSN_Yasen_LOD1.fbx",
      "FBX/RU_SSN_Yasen_LOD2.fbx",
      "FBX/RU_SSN_Yasen_LOD3.fbx"
    ],
    "collisionOwner": "hull"
  },
  "parts": [
    {
      "id": "propulsor_01",
      "exportName": "RU_SSN_Yasen_PROPULSOR_01",
      "sourceObjects": [
        "SUB_Yasen_PropellerHub",
        "SUB_Yasen_PropellerBlade_*"
      ],
      "pivotAnchor": "PIVOT_SUB_RU_YASEN_PROPULSOR_01",
      "parent": "root",
      "motion": {
        "type": "rotate",
        "axis": [1, 0, 0],
        "minDegrees": null,
        "maxDegrees": null,
        "stateSource": "propulsor_rpm"
      },
      "collision": "none"
    },
    {
      "id": "periscope_01",
      "exportName": "RU_SSN_Yasen_PERISCOPE_01",
      "sourceObjects": ["SUB_Yasen_Mast_Periscopic_01"],
      "pivotAnchor": "PIVOT_SUB_RU_YASEN_PERISCOPE_01",
      "parent": "root",
      "motion": {
        "type": "translate",
        "axis": [0, 0, 1],
        "minMeters": 0.0,
        "maxMeters": 8.5,
        "stateSource": "periscope_extension"
      },
      "collision": "none"
    }
  ],
  "sockets": [
    {
      "id": "torpedo_tube_01_muzzle",
      "sourceAnchor": "SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE",
      "purpose": "torpedo_muzzle"
    }
  ],
  "validation": {
    "requiredParts": ["propulsor_01", "rudder", "periscope_01"],
    "requiredSockets": ["torpedo_tube_01_muzzle"]
  }
}
```

上述数值只是 schema 示例，不是 Yasen 的最终测量值。实施任务必须从实际母版锚点和经过
确认的运动范围生成，禁止直接复制示例数值。

### 6.3 必需字段

每个 Part 至少需要：

- 稳定 `id`；
- 导出资产名；
- 显式源对象或源 Collection；
- 功能 Pivot Anchor；
- 父级逻辑节点；
- 运动类型：`static`、`rotate`、`translate` 或 `rotate_translate`；
- 局部轴；
- 限位或连续旋转标志；
- 表现状态来源；
- 碰撞策略；
- 可选 LOD 和可见距离策略。

### 6.4 校验规则

- `assetId` 必须和目录、SPEC、FBX 前缀一致。
- Part ID 和 Socket ID 在单艇内唯一。
- `sourceObjects` 必须全部匹配至少一个对象。
- 一个源对象只能被一个导出组拥有。
- `pivotAnchor` 和 `sourceAnchor` 必须存在且为 Empty 或显式允许的骨骼。
- 轴向向量必须归一化且非零。
- `min` 不得大于 `max`。
- 连续旋转部件不能同时设置有限角度范围。
- 所有相对路径必须位于资产目录内，禁止绝对路径和目录穿越。
- 未识别的 `stateSource` 必须失败关闭。

## 7. Blender 审计与导出工具

### 7.1 目标文件

建议新增：

```text
SilentDepth_Assets/Tools/submarine_assembly_schema.py
SilentDepth_Assets/Tools/audit_submarine_assembly.py
SilentDepth_Assets/Tools/export_submarine_assembly.py
SilentDepth_Assets/Tools/render_submarine_assembly_evidence.py
tests/assets/test_submarine_assembly.py
```

实际位置应在实施任务中根据现有 `SilentDepth_Assets/Tools/` 结构确认，避免建立第二套工具根。

### 7.2 审计器职责

审计器以只读方式打开 MASTER 和 Assembly JSON，输出机器可读报告：

```text
Validation/[ASSET_ID]_ASSEMBLY_AUDIT.json
```

检查至少包括：

- Blender 版本、文件路径和文件 SHA-256；
- Collection 和对象存在性；
- Mesh 数量、顶点、三角面、材质槽和 UV；
- 未分配材质面；
- 退化面、零长度边、孤立顶点和非有限坐标；
- 对象负尺度、未应用尺度和异常旋转；
- 导出组重复拥有对象；
- Hull 是否仍包含活动件对象；
- Pivot Anchor 与预期部件的距离；
- Socket 位置、方向和异常离群；
- 碰撞体闭合性、凸性、命名和所有权；
- LOD 数量和三角面递减关系；
- 材质映射和纹理路径；
- 必需部件和必需 Socket 完整性。

### 7.3 导出器职责

导出器不得直接移动、重命名或合并 MASTER 中的生产对象。推荐流程：

1. 以后台模式打开母版。
2. 读取并验证 Assembly JSON。
3. 新建临时 Scene/Collection。
4. 复制当前导出组需要的对象和数据。
5. 评估 Modifiers，按策略生成最终网格副本。
6. 将顶点变换到功能 Pivot 的局部空间。
7. 清零导出对象变换并验证 Scale 为 1。
8. 按材质映射清理槽位名称。
9. 导出 Hull LOD 和每个独立 Part FBX。
10. 序列化 Socket 和安装 Transform。
11. 对 FBX 做新场景回读检查。
12. 生成 SHA-256、三角面、包围盒和材质报告。
13. 删除临时场景并在不保存母版的情况下退出。

导出应具有确定性：相同母版、相同 Assembly JSON 和相同 Blender 版本生成相同的对象集合、
命名、变换和报告。FBX 文件字节如果受导出器元数据影响无法完全稳定，至少保证几何指标、
对象名、包围盒、材质槽和 Assembly 输出稳定。

### 7.4 输出目录

```text
FBX/[ASSET_ID]_LOD0.fbx
FBX/[ASSET_ID]_LOD1.fbx
FBX/[ASSET_ID]_LOD2.fbx
FBX/[ASSET_ID]_LOD3.fbx
FBX/[ASSET_ID]_[PART_ID].fbx
Documentation/[ASSET_ID]_ASSEMBLY.json
Validation/[ASSET_ID]_ASSEMBLY_AUDIT.json
Validation/[ASSET_ID]_EXPORT_REPORT.json
Preview/Assembly/[VIEW].png
```

### 7.5 视觉证据

每艘艇至少生成以下检查视图：

- 完整组装 Hero、侧视、俯视、艉视；
- 所有活动件使用调试色的 exploded/overlay 视图；
- Pivot 轴和 Socket 方向可视化视图；
- 每个关键运动件的最小、零位和最大姿态；
- 鱼雷舱盖关闭、打开和发射方向视图。

机械运动不能只靠 JSON 数值通过。至少要检查关键姿态中是否穿模、脱离铰链、方向反转或
完全收不进艇体。

## 8. UE4 导入管线

### 8.1 扩展现有入口

继续使用 `tools/ue4/import_submarines.py` 作为唯一批量导入入口，不再为每艘艇新增
`import_yasen_parts.py`、`import_typhoon_parts.py` 等一次性脚本。

现有固定元组：

```python
"parts": ("PROP", "RUDDER", "STERNPLANES", "BOWPLANES", "PERISCOPE")
```

应逐步替换为从 Assembly JSON 读取的 Part 列表。过渡期允许 Akula 保留旧配置用于回归，
但最终必须由同一 schema 描述。

### 8.2 导入职责

导入脚本负责：

- 导入 Hull LOD0；
- 将 LOD1-LOD3 挂到同一个 Static Mesh；
- 导入每个活动 Part Static Mesh；
- 复用潜艇母材质和材质实例；
- 验证尺寸、材质槽、UV、碰撞和包围盒；
- 写入或更新 `SubmarineDefinition`；
- 生成导入报告；
- 对缺失 Part、错误路径和 schema 版本失败关闭。

导入脚本不负责：

- 根据网格形状猜测哪个对象是螺旋桨；
- 在 UE 中修改网格顶点来修 Pivot；
- 为不同潜艇硬编码安装坐标；
- 静默使用其他潜艇的部件作为替代；
- 删除用户已有 UE 资产后在同一脚本会话立即重建。

### 8.3 UE Content 路径

```text
/Game/SilentDepth/Art/Submarines/[TYPE]/[COUNTRY]/[CLASS]/
├── SM_[ASSET_ID]
├── Parts/
│   ├── SM_[ASSET_ID]_PROPULSOR_01
│   ├── SM_[ASSET_ID]_RUDDER
│   └── SM_[ASSET_ID]_PERISCOPE_01
├── Materials/
└── Data/
    └── DA_[ASSET_ID]_Definition
```

所有路径由 `assetId` 和配置生成，不在 Pawn C++ 中写常量。

### 8.4 导入报告

每次导入至少记录：

- 源 Assembly JSON 和 hash；
- 每个 FBX 的路径和 hash；
- 创建或复用的 UE 资产路径；
- Hull LOD 数；
- 每个 LOD 顶点数；
- Part 数量和材质槽；
- Collision 数量；
- 包围盒尺寸；
- 未匹配材质；
- 缺失和跳过的资产；
- UE4.27 版本和执行时间。

## 9. UE4 数据驱动组装

### 9.1 数据结构

建议新增或等价实现：

```text
FSDSubmarineMotionDefinition
FSDSubmarinePartDefinition
FSDSubmarineSocketDefinition
USDSubmarineDefinition : UDataAsset
```

推荐字段：

```cpp
UENUM()
enum class ESDSubmarinePartMotion : uint8
{
    Static,
    Rotate,
    Translate,
    RotateTranslate
};

USTRUCT()
struct FSDSubmarinePartDefinition
{
    FName Id;
    TSoftObjectPtr<UStaticMesh> Mesh;
    FName ParentId;
    FTransform MountTransform;
    ESDSubmarinePartMotion MotionType;
    FVector LocalAxis;
    float Minimum;
    float Maximum;
    FName StateSource;
};
```

最终命名应服从 UE 模块现有风格。禁止使用 `any`、不受控字符串转换或遇错后猜默认资产。

### 9.2 组装时机

不能继续依赖构造函数中的 `ConstructorHelpers::FObjectFinder` 加载固定 Akula 路径。推荐：

1. Pawn 保留稳定 Root、Camera 和必要基础组件。
2. 在 Definition 已知后加载软引用。
3. 在 `OnConstruction` 或明确初始化阶段创建 Hull 和 Part Component。
4. 设置 Mount Transform 和父级关系。
5. 建立 `PartId -> UStaticMeshComponent*` 映射。
6. 建立 `SocketId -> USceneComponent*` 映射。
7. Definition 改变或 Actor 销毁时正确清理动态组件。

组件创建顺序必须稳定，不能依赖未排序的 Map 遍历。缺失必需 Hull 时应显示明确错误或受控
程序化回退；缺失可选外观件时允许跳过，但不得借用其他艇资产。

### 9.3 组件数量控制

不要为所有细节建立 Component。每艘艇建议初始控制在：

- 1 个 Hull；
- 1-2 个推进器程序集；
- 1-4 个舵面程序集；
- 1-4 个主要桅杆/潜望镜；
- 仅近景需要的鱼雷门/VLS 门；
- 若干轻量 SceneComponent 逻辑挂点。

重复但静态的装饰应并入 Hull。大量相同且需要独立显示控制的静态件可评估
InstancedStaticMesh，但第一版不为尚未测量的问题预先增加复杂性。

### 9.4 表现驱动接口

推荐把部件动画集中在一个表现驱动层，而不是在游戏逻辑各处直接查找组件：

```text
ApplyPropulsionPresentation(rpmOrNormalizedSpeed)
ApplyControlSurfacePresentation(rudder, bowPlane, sternPlane)
ApplyMastPresentation(mastId, extension, rotation)
ApplyDoorPresentation(doorId, openFraction)
HandleWeaponLaunchPresentation(event)
```

所有输入来自权威状态快照或现有事件。表现层可以插值，但不能制造新的玩法事实。

## 10. 部件动画规则

### 10.1 螺旋桨

- 使用配置声明的局部轴连续旋转。
- 旋转速度来自权威推进状态、速度状态或明确的表现参数。
- 不直接用视觉转速反推实际速度或噪声。
- 正转、倒车和停转方向必须在每艘艇的关键姿态测试中验证。
- 暂停、时间缩放和 Actor 销毁时不得继续积累错误时间。

### 10.2 舵面

- 方向舵、艏升降舵和艉升降舵分别拥有稳定 Part ID。
- 最大角度来自潜艇 Definition 或展示配置，不继续使用 Akula 全局常量。
- 表现角度应追踪权威舵令或快照状态。
- 不根据潜艇世界旋转速度猜测舵角。
- 零输入后回中行为由状态来源决定，不能只靠视觉组件自己决定。

### 10.3 潜望镜和桅杆

- 每根可动桅杆独立定义 ID、行程和可选旋转。
- 潜望镜状态优先使用明确的升起比例或状态字段。
- 仅有深度层而没有操作状态时，可以保持当前 Akula 兼容逻辑，但需标记为过渡行为。
- 镜头切入潜望镜前必须保证相机锚点存在；缺失时不得猜一个世界位置。
- 收起状态必须通过近景侧视验证不会露出艇桥。

### 10.4 鱼雷舱盖

推荐状态机仅存在于表现层：

```text
Closed -> Opening -> Open -> Closing -> Closed
```

该状态机负责视觉时间，不负责批准发射。发射事件若已发生但门动画来不及完成，可以采用：

- 快速完成开门表现；或
- 跳过门动画，只播放受控发射效果；

不得让表现状态阻塞权威战斗事件。

每个舱盖必须验证：

- 铰链位置；
- 开启方向；
- 最大角度；
- 开启时不切入艇体；
- 关闭时与艇体表面吻合；
- 对应 `tubeId` 和 Muzzle Socket 正确。

### 10.5 VLS 舱盖和其他活动盖板

只有满足以下任一条件才独立：

- 玩家近景能够看见；
- 游戏存在对应发射或交互；
- 需要损伤或任务表现；
- 对潜艇识别轮廓有明显影响。

否则保持在 Hull 中，避免组件和生产成本无限增长。

## 11. 分阶段执行计划

### P0：冻结基线与确认规则

目标：在修改模型和代码前建立可追踪基线。

| ID | 任务 | 主要文件 | 交付物 | 验收标准 |
|---|---|---|---|---|
| SUBMOD-001 | 记录工作区和三艘母版基线 | Git、三个 MASTER、现有 FBX | 基线报告 | 不提交 `.omo/`、`test-results/` 和无关用户改动 |
| SUBMOD-002 | 确认 Akula 已修改部件范围 | Akula MASTER、现有部件 FBX | 部件清单 | 明确舵面是否包含方向舵、艏/艉升降舵；不把未做的舱盖标为完成 |
| SUBMOD-003 | 确认首版活动件和 Socket 词表 | 本文、模板 JSON | 决策记录 | 词表可覆盖三艘艇，不包含不可见内部系统 |
| SUBMOD-004 | 确认 Blender 修改授权 | 三个 MASTER | 授权范围记录 | 未授权前所有工具只读母版 |

P0 完成条件：后续任务可以准确判断哪些对象允许修改、哪些只允许读取和导出。

### P1：建立 schema 和模板

目标：先定义数据契约，再写导出器和 UE 代码。

| ID | 任务 | 主要文件 | 交付物 | 验收标准 |
|---|---|---|---|---|
| SUBMOD-010 | 创建 Assembly JSON Schema | `SilentDepth_Assets/Templates/Submarine/` | `submarine_assembly.schema.json` | 有版本、Part、Socket、Motion、LOD、Collision、路径约束 |
| SUBMOD-011 | 更新潜艇模板 | `SilentDepth_Submarine_Asset_Template.json` | v1.1 模板 | 增加活动程序集、Pivot Anchor、Socket 和导出组规则 |
| SUBMOD-012 | 更新验证规则 | `SilentDepth_Submarine_Validation_Rules.json` | v1.1 规则 | COMPLETE 资产必须提供 Assembly 和审计报告 |
| SUBMOD-013 | 创建 Assembly 示例 | Template 文档 | 最小和完整示例 | 示例通过 schema；明确示例数值不可当真实测量值 |
| SUBMOD-014 | 添加 schema 单元测试 | 资产测试目录 | 自动测试 | 重复 ID、空匹配、绝对路径、零轴和非法范围会失败 |

P1 完成条件：无需打开 Blender 或 UE，单靠 JSON 测试就能阻止错误的组装描述进入管线。

### P2：实现只读审计器

目标：在不修改母版的情况下发现拆分和机械结构问题。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-020 | 实现通用母版加载与版本报告 | 审计脚本 | 支持命令行传 MASTER 和 Assembly 路径 |
| SUBMOD-021 | 实现对象/Collection 匹配 | 审计报告 | 缺失、空匹配、重复拥有均明确失败 |
| SUBMOD-022 | 实现 Mesh 质量检查 | 审计报告 | 退化面、零长度边、未分配材质、负尺度可定位到对象 |
| SUBMOD-023 | 实现 Pivot/Socket 检查 | 审计报告和调试几何 | 输出世界/局部 Transform、轴向和离群警告 |
| SUBMOD-024 | 实现 Hull 排他检查 | 审计报告 | 活动件不会继续包含在 Hull 导出组 |
| SUBMOD-025 | 为三艘艇运行只读审计 | 三份报告 | 不保存母版；报告可重复生成 |

P2 完成条件：三艘艇的导出风险可以由报告定位到具体对象和规则，而不是进入 UE 后才发现。

### P3：Yasen 垂直切片

目标：用源结构最干净的 Yasen 验证第一条新流水线。

第一版只处理：

- Hull LOD0-LOD3；
- Propulsor；
- Rudder/主要舵面；
- 1 根 Periscope；
- 最少 1 个 Torpedo Muzzle Socket；
- Hull Collision。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-030 | 建立 Yasen Assembly 配置 | `RU_SSN_Yasen_ASSEMBLY.json` | 所有源对象显式匹配；不使用宽泛危险通配符 |
| SUBMOD-031 | 在工作副本建立 Pivot Anchor | Yasen MASTER 或迁移脚本 | 现有外观不发生变化；锚点命名规范 |
| SUBMOD-032 | 实现临时场景导出 | 通用导出器 | 不保存母版即可生成 Hull 和 Part FBX |
| SUBMOD-033 | 实现 FBX 新场景回读 | 导出报告 | 比例、朝向、包围盒、材质和 Pivot 检查通过 |
| SUBMOD-034 | 生成关键姿态证据 | Preview/Assembly | 螺旋桨、舵面和潜望镜运动方向正确且无明显穿模 |
| SUBMOD-035 | 扩展 UE 导入配置 | `import_submarines.py` | Yasen Part 自动导入；无需专用一次性脚本 |

P3 完成条件：删除 UE 中 Yasen 导入资产后，可以从母版和配置完整重建，不需要手工拆网格或摆坐标。

### P4：UE4 SubmarineDefinition 和通用组装

目标：移除 Pawn 对 Akula 路径和位置的硬编码。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-040 | 定义 UE 数据结构 | C++ Header/CPP | 强类型 Part、Socket、Motion 和 Definition |
| SUBMOD-041 | 建立 JSON 到 DataAsset 同步 | UE 导入脚本 | 数据单向生成；重复运行结果一致 |
| SUBMOD-042 | 实现动态 Hull/Part 组装 | `ASubmarinePawn` 或专用组件 | Yasen 可由 Definition 创建，不含 Yasen C++ 路径常量 |
| SUBMOD-043 | 实现动态 Socket 锚点 | Scene Components | Socket Transform 来自 Definition；可按 ID 查询 |
| SUBMOD-044 | 实现清理和重建 | Runtime | 更换 Definition 和销毁 Actor 不泄漏组件 |
| SUBMOD-045 | 添加 UE Automation Tests | UE Tests | 顺序稳定、缺失资产失败关闭、可选件跳过、重复 ID 拒绝 |

P4 完成条件：同一个 Pawn 类可以仅通过替换 Definition 在 Akula 和 Yasen 之间切换资产组合。

### P5：活动件表现驱动

目标：把当前 Akula 特例动画改为按 Part ID 和 Motion 配置驱动。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-050 | 通用连续旋转驱动 | Propulsor driver | 正转、停转、倒转可配置；不修改仿真速度 |
| SUBMOD-051 | 通用舵面驱动 | Control surface driver | 各艇角度和轴来自 Definition；不使用 Akula 全局常量 |
| SUBMOD-052 | 通用桅杆平移驱动 | Mast driver | 行程、方向、速度可配置；收起不露出艇桥 |
| SUBMOD-053 | 通用舱盖状态机 | Door driver | 按 `doorId` 驱动；视觉状态不阻塞战斗事件 |
| SUBMOD-054 | 表现状态适配测试 | UE Tests | 同一状态输入产生相同部件目标 Transform |

P5 完成条件：新增一艘艇的刚性活动件不需要为该艇新增专用 Tick 代码。

### P6：Akula 迁移与鱼雷舱盖

目标：保留用户已经修改的舵面、螺旋桨和潜望镜，并补齐组装数据与鱼雷表现基础。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-060 | 记录现有 Akula 五个导出件 | Assembly 配置 | 与当前 FBX 和 UE 表现一致，不重新发明 Pivot |
| SUBMOD-061 | 用新导出器重建 Akula | FBX 和报告 | 与旧版包围盒、安装位置和材质行为相比无回归 |
| SUBMOD-062 | 创建 Akula Definition | DataAsset | 删除 Pawn 中 Akula 路径和位置常量后仍可正确组装 |
| SUBMOD-063 | 设计鱼雷门拆分 | Blender 工作副本和设计记录 | 明确门数量、铰链、开启方向和对应 tube ID |
| SUBMOD-064 | 制作/整理鱼雷舱盖 | Akula MASTER | 只修改授权对象；关闭贴合、开启无明显穿模 |
| SUBMOD-065 | 建立鱼雷 Socket | Assembly 配置 | 每个首批可用鱼雷管有唯一 Muzzle Socket 和方向 |
| SUBMOD-066 | 接入鱼雷发射表现 | UE Runtime | 已知 tube ID 时打开正确舱盖并从正确 Socket 生成表现 |
| SUBMOD-067 | Akula 编辑器验收 | 验收记录 | 舵面、螺旋桨、潜望镜、舱盖和发射方向实际观察通过 |

P6 不要求一次制作所有可能鱼雷管。先完成一个可验证发射通道，再扩到其余管位。

### P7：Typhoon 标准化迁移

目标：把最旧的母版迁移到同一生产契约，而不是继续堆积例外。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-070 | 建立旧名称映射表 | Migration JSON | 每个活动对象和材质映射显式可审查 |
| SUBMOD-071 | 修复导出相关退化几何 | Typhoon 工作副本 | 只处理进入运行时导出的对象；报告不再有硬门禁错误 |
| SUBMOD-072 | 标准化材质槽 | 迁移脚本 | `.001/.002` 不产生重复 UE 材质 |
| SUBMOD-073 | 建立活动程序集和 Pivot | Assembly 配置 | 双轴/双桨等结构按真实共同运动划分 |
| SUBMOD-074 | 导出并回读验证 | FBX 和报告 | Hull、Part、Collision 尺寸和朝向正确 |
| SUBMOD-075 | 创建 Typhoon Definition | DataAsset | 通用 Pawn 可组装，无 Typhoon 专用路径代码 |
| SUBMOD-076 | UE 编辑器验收 | 验收记录 | 双体轮廓、螺旋桨、舵面、LOD 和材质实际观察通过 |

P7 完成条件：Typhoon 不再依赖旧命名和手工导入知识即可重建。

### P8：批量生产与科技树接入

目标：把前三艘艇验证过的流程应用到后续潜艇，而不是继续逐艇开发管线。

| ID | 任务 | 交付物 | 验收标准 |
|---|---|---|---|
| SUBMOD-080 | 创建新潜艇初始化命令 | 模板复制/初始化工具 | 给定 asset ID 可生成目录、空 Assembly、SPEC 和验证入口 |
| SUBMOD-081 | 创建资产批量审计命令 | 汇总报告 | 可一次审计所有 COMPLETE/VALIDATING 潜艇 |
| SUBMOD-082 | 创建 UE 批量导入命令 | 导入汇总 | 单艇失败不静默；整体报告列出失败原因 |
| SUBMOD-083 | 接入潜艇科技树资产映射 | 科技树配置 | 解锁平台 ID 显式映射 Definition；未知 ID 失败关闭 |
| SUBMOD-084 | 建立配装 Socket 能力映射 | 装备兼容层 | 武器/传感器/防御/推进只使用声明的逻辑挂点 |
| SUBMOD-085 | 建立批次生产看板 | 文档或数据 | 每艘艇跟踪 MASTER、Parts、Sockets、LOD、Collision、UE、Editor 状态 |

P8 完成条件：新增潜艇主要是模型和数据生产任务，不再要求修改通用导出器、导入器和 Pawn。

## 12. 推荐 Codex 任务拆分

以下每项适合作为一个独立 Codex 任务。除非某个任务明确要求修改 `.blend`，否则只允许读取
母版。每项完成后先审查 diff、运行对应测试，再单独提交。

### Task 1：定义 Assembly Schema

建议提示词：

```text
根据 docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md 的 P1，创建潜艇 Assembly JSON Schema、
模板示例和 schema 自动测试。不要修改任何 .blend、FBX 或 UE Content。运行相关测试并报告。
```

### Task 2：更新潜艇资产模板

```text
根据 SUBMOD-011 至 SUBMOD-013 更新 SilentDepth_Submarine_Asset_Template.json、验证规则和
模板 README。保持向后兼容，明确活动程序集、Pivot Anchor、Socket 和导出要求。
```

### Task 3：实现只读 Blender 审计器

```text
实现 SUBMOD-020 至 SUBMOD-024。审计器必须后台打开 Blender、输出 JSON、不得保存或修改
母版。先对 Yasen 运行，再对 Akula 和 Typhoon 运行，保留报告但不要提交临时截图。
```

### Task 4：建立 Yasen Assembly 配置

```text
读取 Yasen MASTER 和审计报告，创建 RU_SSN_Yasen_ASSEMBLY.json。只描述现有源对象，不重做
几何。先覆盖 Hull、Propulsor、主要舵面、一个潜望镜和一个鱼雷 Muzzle Socket。
```

### Task 5：实现通用 Blender 导出器

```text
实现配置驱动的潜艇导出器。必须使用临时场景和复制对象，不保存母版；把活动件几何转换到
功能 Pivot 局部空间；导出后新场景回读并生成报告。先只支持 Yasen 垂直切片。
```

### Task 6：扩展 UE4 导入器

```text
扩展 tools/ue4/import_submarines.py，使它从 Assembly JSON 导入 Yasen Hull LOD 和活动 Part，
复用现有材质实例并输出导入报告。不要新增 Yasen 专用导入脚本。
```

### Task 7：实现 SubmarineDefinition

```text
实现强类型 USDSubmarineDefinition、Part、Socket 和 Motion 数据结构，以及 Assembly JSON 到
DataAsset 的单向同步。缺失、重复和非法数据失败关闭。添加 UE Automation Tests。
```

### Task 8：改造通用 Pawn 组装

```text
移除 ASubmarinePawn 对 Akula 资产路径和安装位置的硬编码，改为读取 SubmarineDefinition
动态创建 Hull、Part 和 Socket SceneComponent。先让 Akula 与 Yasen 使用同一个 Pawn。
```

### Task 9：通用活动件驱动

```text
实现配置驱动的螺旋桨、舵面和桅杆表现动画。输入只来自现有权威状态；不得修改核心仿真、
平衡或控制绑定。添加纯 Transform 计算测试和生命周期清理测试。
```

### Task 10：迁移 Akula

```text
把 Akula 现有 PROP、RUDDER、STERNPLANES、BOWPLANES、PERISCOPE 写入 Assembly 配置并用
通用导出器重建。保持用户现有模型修改，不重做造型；比较旧导出结果并报告回归差异。
```

### Task 11：设计并制作 Akula 首个鱼雷门

```text
先读取 Akula MASTER、参考图和 Assembly 规则，提出首个鱼雷管舱盖的对象拆分、铰链、开启
方向和 Socket 方案。只在获得修改母版授权后实施。生成关闭/半开/全开多视图证据。
```

### Task 12：接入鱼雷发射表现

```text
根据现有战斗事件检查是否有稳定 tubeId。只有存在明确 tubeId 时才驱动对应舱盖和 Muzzle
Socket；缺失时失败关闭具体门动画，不猜测管位，不改变权威发射结果。
```

### Task 13：迁移 Typhoon

```text
执行 SUBMOD-070 至 SUBMOD-075。先建立显式旧名称和材质映射，再修复进入导出的退化几何，
最后生成 Assembly、FBX 和 Definition。不要对母版做无关全局清理或格式化。
```

### Task 14：批量生产工具

```text
实现潜艇目录初始化、批量审计、批量导入和状态汇总。以 Akula、Yasen、Typhoon 为固定回归
样本；单艇失败必须显示原因，不能让其他艇静默借用其资产。
```

### Task 15：Windows UE4.27 编辑器验收

```text
在 Windows UE4.27.2 中导入并运行 Akula、Yasen、Typhoon。检查尺寸、材质、LOD、碰撞、
螺旋桨、舵面、潜望镜、鱼雷门和 Socket；记录截图、日志、硬件和验证状态。
```

## 13. 验证矩阵

| 检查 | Schema 阶段 | Blender 阶段 | UE 导入阶段 | UE 运行时阶段 |
|---|---:|---:|---:|---:|
| ID 唯一性 | 必须 | 必须 | 必须 | 必须 |
| 源对象存在 | - | 必须 | - | - |
| Hull/Part 排他 | - | 必须 | 抽检 | 视觉检查 |
| Pivot/轴向 | 数据检查 | 数值+关键姿态 | 包围盒检查 | 动画检查 |
| Socket 位置/方向 | 数据检查 | 可视化检查 | Definition 检查 | 发射检查 |
| 材质槽 | - | 必须 | 必须 | 视觉检查 |
| LOD | 路径检查 | 几何检查 | UE LOD 检查 | 切换检查 |
| Collision | 策略检查 | 几何检查 | UE Collision 检查 | 玩法抽检 |
| 生命周期清理 | - | 临时数据清理 | 重复导入检查 | Actor 销毁测试 |
| 仿真隔离 | stateSource 检查 | - | - | 自动化测试 |

## 14. 测试和验证门禁

### 14.1 仓库基础门禁

相关代码任务完成后运行：

```bash
npm test
npm run typecheck
npm run build
npm run lint
```

如果任务只修改资产库 Python/schema，应运行其专用测试，并说明 Web TypeScript 门禁是否相关。
跨越共享配置或仓库脚本时仍应运行完整基础门禁。

### 14.2 Blender 门禁

- 记录实际 Blender 版本。
- 后台审计成功。
- 母版在任务前后 hash 不变，除非任务获得修改授权。
- 导出器从干净进程重跑成功。
- FBX 在新 Blender 场景中重新导入成功。
- 组装后尺寸、方向、Pivot 和材质指标通过。
- 关键运动姿态至少从两个有效视角检查。

### 14.3 UE4 门禁

- UE4.27 项目编译通过。
- UE Automation Tests 通过。
- Python 导入脚本重复运行不崩溃且不会无限重复创建材质/资产。
- 三艘艇可以通过 Definition 选择和组装。
- 缺失必需 Hull、重复 Part ID、非法轴和未知 stateSource 会明确失败。
- 编辑器中实际观察材质、尺寸、LOD、碰撞和活动件。
- 检查 Output Log 中的导入、资产加载、材质和运行时错误。

### 14.4 完成标签

- `IMPLEMENTED`：代码或资产已存在，但验证未完整执行。
- `TESTED`：相关自动化检查通过。
- `BLENDER VERIFIED`：在指定 Blender 版本完成回读和关键姿态检查。
- `EDITOR VERIFIED`：在真实 UE4.27 编辑器中观察通过。
- `TARGET HARDWARE VERIFIED`：在记录的目标 Windows 硬件完成性能验证。

不得用 `TESTED` 代替 `EDITOR VERIFIED`。

## 15. 风险与控制

| 风险 | 影响 | 控制措施 |
|---|---|---|
| 修改 `.blend` 无法代码审查 | 用户造型可能被覆盖 | 工作副本、备份、修改前后审计、只用脚本做机械迁移 |
| Hull 仍包含活动件 | 重影、穿模、错误包围盒 | 导出组所有权和 Hull 排他自动检查 |
| Pivot 被 FBX 烘焙错误 | 部件绕世界原点或双重偏移 | 顶点转换到 Anchor 局部空间，FBX 回读验证 |
| 坐标轴方向不一致 | 舵面/螺旋桨反转 | 每个 Part 显式局部轴，生成最小/最大关键姿态 |
| JSON 与 DataAsset 漂移 | Blender 和 UE 安装位置不同 | Assembly JSON 单一权威，DataAsset 单向生成和 hash 校验 |
| 组件过多 | Tick、渲染和维护成本增长 | 按共同运动合并，只拆玩法/近景需要部件 |
| 舱门表现阻塞发射 | 视觉层改变战斗结果 | 权威事件先行，舱门状态机仅表现 |
| `tubeId` 缺失 | 打开错误舱盖、暴露假信息 | 不猜测，先补明确事件契约或跳过具体门动画 |
| Typhoon 旧对象污染管线 | 大量特殊分支 | 显式迁移映射，不在通用工具中加入名称猜测 |
| UE 脚本删除重建崩溃 | 丢失工作和导入失败 | 存在即复用；全量重建在新会话或人工移走 Content 后执行 |
| 活动件无 LOD | 远距组件成本过高 | 设置可见距离，后续补 Part LOD，目标硬件测量 |

## 16. 需要项目负责人确认的决策

| 决策 ID | 需要确认 | 推荐默认 | 阻塞任务 |
|---|---|---|---|
| SUBDEC-001 | Akula“舵面”是否包括方向舵、艏升降舵、艉升降舵 | 按三类全部包括处理，但以母版审计为准 | SUBMOD-002、060 |
| SUBDEC-002 | 是否授权脚本修改 Yasen MASTER 以添加 Pivot/Socket Empty | 授权仅添加锚点和规范命名，不改造型 | SUBMOD-031 |
| SUBDEC-003 | 是否授权修改 Akula MASTER 制作鱼雷舱盖 | 首先只授权一个鱼雷管垂直切片 | SUBMOD-063 至 067 |
| SUBDEC-004 | 首批需要动画的 Akula 鱼雷管数量 | 先做 1 个，再复制验证 | SUBMOD-063 至 067 |
| SUBDEC-005 | 潜望镜是否由深度层自动升降，还是由独立玩家命令控制 | 先保持兼容，后续增加明确状态 | SUBMOD-052 |
| SUBDEC-006 | VLS 舱盖是否属于首版必须动画 | Yasen 可建数据但暂不进入首个运行时切片 | P3、P8 |
| SUBDEC-007 | UE 逻辑挂点使用运行时 SceneComponent 还是写入 StaticMesh Socket | 第一版使用 SceneComponent | SUBMOD-043 |

这些决策没有确认时，Codex 可以完成 schema、只读审计和设计工作，但不得自行修改母版或
推测真实鱼雷管结构。

## 17. Git 与提交策略

每个阶段建议独立提交，避免把二进制母版、导出 FBX、UE C++ 和文档全部混在一个提交：

```text
1. docs/schema
2. Blender audit tools
3. Yasen assembly config
4. Blender export tools
5. UE importer
6. UE SubmarineDefinition
7. Pawn assembly and drivers
8. Akula migration
9. Akula torpedo door asset
10. Typhoon migration
```

提交前必须：

- 检查 `git status --short`；
- 检查 staged diff；
- 排除 `.omo/`、临时截图、检查缓存和无关用户修改；
- 只提交当前任务要求的文件；
- 报告自动测试和未执行的 UE/Blender 人工验证。

`.blend`、FBX、贴图和 UE Content 应遵循项目 Git LFS 规则。没有确认 LFS 状态前，不批量提交
新的大型二进制文件。

## 18. 推荐近期执行顺序

当前最合理的顺序是：

1. 完成 `SUBMOD-010` 至 `SUBMOD-014`：Assembly schema、模板和测试。
2. 完成 `SUBMOD-020` 至 `SUBMOD-025`：只读 Blender 审计器。
3. 确认 `SUBDEC-002`，允许为 Yasen 添加必要的 Pivot/Socket Anchor。
4. 完成 `SUBMOD-030` 至 `SUBMOD-035`：Yasen 垂直切片和自动导出。
5. 完成 `SUBMOD-040` 至 `SUBMOD-045`：UE Definition 和通用组装。
6. 完成 `SUBMOD-050` 至 `SUBMOD-054`：通用刚性部件驱动。
7. 完成 `SUBMOD-060` 至 `SUBMOD-062`：无损迁移 Akula 现有活动件。
8. 确认 `SUBDEC-003` 和 `SUBDEC-004`，制作 Akula 首个鱼雷舱盖垂直切片。
9. 在 Windows UE4.27 中完成 Akula/Yasen 编辑器验收。
10. 完成 `SUBMOD-070` 至 `SUBMOD-076`：迁移 Typhoon。
11. 三艘艇稳定后再执行 P8 批量工具和后续潜艇扩产。

不要先批量拆剩余潜艇。Yasen 和 Akula 尚未通过同一数据驱动流水线前，批量生产只会扩大
命名、Pivot、Socket 和 UE 硬编码债务。

## 19. 单艘潜艇完成定义

一艘潜艇只有同时满足以下条件，才可以标记模块化资产管线 COMPLETE：

1. MASTER 位于规范目录，单位、朝向和尺度正确。
2. 固定艇体和活动程序集边界明确且不重复。
3. 所有运行时活动件有稳定 ID、功能 Pivot、局部轴和运动范围。
4. 必需逻辑 Socket 有稳定 ID、位置和方向。
5. Hull LOD0-LOD3 从共同源生成并通过回读。
6. 碰撞属于明确资产，命名和闭合性通过检查。
7. Assembly JSON 通过 schema 和 Blender 审计。
8. 导出器可从干净进程重建全部 FBX，不修改母版。
9. UE 导入器可重复导入并生成一致 Definition。
10. 通用 Pawn 可组装该艇，不存在该艇专用 C++ 资产路径和安装坐标。
11. 活动件由权威状态或事件驱动，表现不反向修改仿真。
12. 关键姿态在 Blender 中完成可视检查。
13. 尺寸、材质、LOD、碰撞和动画在 UE4.27 编辑器实际观察通过。
14. 来源、许可、hash、LOD 和验证报告完整。
15. 最终提交不包含无关用户改动和临时检查产物。

## 20. 最终目标状态

完成本计划后，新增潜艇的工作方式应变为：

```text
美术在一个 MASTER 中创建和调整外形
    -> 标记固定结构、活动程序集、Pivot 和 Socket
    -> 运行审计
    -> 运行自动导出
    -> 运行 UE 批量导入
    -> 选择 SubmarineDefinition
    -> 通用 Pawn 自动组装和播放表现
```

届时，螺旋桨、舵面、潜望镜、鱼雷门和其他系统不需要在 UE4 中重新抠出来。Blender 负责
正确表达结构和运动关系，自动化工具负责转换与验证，UE4 负责根据数据组装和表现，权威仿真
只负责游戏事实。每个系统通过稳定 ID、Transform 和事件契约协作，而不是依赖人工记忆坐标。
