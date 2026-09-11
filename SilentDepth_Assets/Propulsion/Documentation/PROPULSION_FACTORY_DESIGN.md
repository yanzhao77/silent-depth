# 推进系统资产工厂设计（Propulsion Factory Design）

版本：v1.0.0 · 日期：2026-09-10

本文记录 SILENT DEPTH 全球潜艇推进系统的需求分析、架构设计与接口契约。
它是这条流水线的“设计与架构”记录，实现代码在 `Tools/`，规范在 `Templates/`，
数据在 `Manifest/`、`TechnologyTree/`、`Documentation/`。

---

## 1. 需求（来自任务书）

1. 建立全球潜艇推进系统资产库，覆盖 SSN 与 SSBN。
2. 推进系统拆成 14 个核心模块（反应堆、主电源、蒸汽装置、涡轮、齿轮箱、
   电机、轴系、螺旋桨、泵喷、推进槽、控制系统、辅机电源、冷却、反应堆安全）。
3. 建立五棵科技树：反应堆、能量转换、传动、推进器、控制，全部 T1–T10。
4. 推进器资产必须产出：Blend、FBX、LOD0–LOD3、Collision、Preview、Manifest。
5. 统一插槽：`SOCKET_PROPULSOR` / `SOCKET_SHAFT` / `SOCKET_RUDDER` /
   `SOCKET_THRUSTER` / `SOCKET_PUMPJET`。
6. 建立兼容性数据库：潜艇 ↔ 推进器 ↔ 确认状态。
7. 统一导出：FBX 2018 兼容（二进制 7400）+ UE4.27。
8. 建立校验器 `propulsion_validator.py`。
9. 反应堆不做内部工程模型，只做数据库条目或外部模块/教学剖切。
10. 不定义真实航速、噪声、功率、水动力性能；那些属于 GAMEPLAY BALANCE 阶段。

## 2. 边界与安全约束

| 约束 | 落地方式 |
| --- | --- |
| 不涉及核燃料配方、燃料制造、核材料参数、堆内敏感结构 | 反应堆分支只有“世代名称 + 时代区间 + 公开路线标签”，`asset_policy = DATABASE_ONLY` |
| 不涉及具体机型分类工程细节 | 传动/能量转换只写公开技术路线（直轴、齿轮、涡轮发电、电力推进、综合电力推进） |
| 不用叶片数量推断 Tier | 推进器 Tier 依据是时代 + 技术 + 降噪概念 + 设计成熟度 + 游戏定位，`propulsion_technology_tree.json` 里显式写明 |
| 无法确认就当 UNKNOWN | 兼容性矩阵分 `verified_*`（公开资料结论）与 `game_plan_*`（游戏配发计划）两组字段，绝不混用 |
| 不修改 Typhoon 原资产 | 抽取脚本以只读方式打开母版，从不保存；输出只写进 `Propulsion/` |
| 不定义性能数值 | 所有 JSON 里没有任何功率/转速/噪声/水动力字段 |

## 3. 目录结构

```text
SilentDepth_Assets/Propulsion/
├── Reactors/          反应堆（DATABASE_ONLY，只有占位说明）
├── PowerConversion/   能量转换（DATABASE_ONLY）
├── Turbines/          涡轮（DATABASE_ONLY）
├── Gearboxes/         齿轮箱（DATABASE_ONLY）
├── ElectricDrive/     电力推进（DATABASE_ONLY）
├── Shafts/            轴系（3D 资产）
├── Propellers/        螺旋桨（3D 资产）
├── PumpJets/          泵喷（3D 资产）
├── Thrusters/         推进槽（3D 资产）
├── Control/           控制系统（DATABASE_ONLY）
├── Materials/         共用材质说明
├── Templates/         建模模板与插槽表
├── Tools/             工厂、数据库、校验器、抽取脚本
├── Manifest/          清单、家族、兼容矩阵、CSV、参数规格
├── TechnologyTree/    T1–T10 科技树
└── Documentation/     设计、覆盖报告、研究结果、全局报告
```

每个 3D 资产目录内部固定：

```text
<ASSET_ID>/
├── Blend/<ASSET_ID>_MASTER.blend
├── FBX/<ASSET_ID>_LOD0..LOD3.fbx
├── Collision/<ASSET_ID>_COLLISION.fbx
├── Textures/                     （程序化材质时为空）
├── Preview/<ASSET_ID>_{ThreeQuarter,Side,Rear,Top}.png
├── Documentation/<ASSET_ID>_SPEC.json、<ASSET_ID>_README.md
└── Validation/<ASSET_ID>_BUILD_REPORT.json、<ASSET_ID>_VALIDATION.json
```

## 4. 模块划分

| 模块 | 职责 | 是否产出 3D |
| --- | --- | --- |
| 01_REACTOR | 反应堆世代条目 | 否（DATABASE_ONLY） |
| 02_PRIMARY_POWER | 主电源 | 否 |
| 03_STEAM_PLANT | 蒸汽装置 | 否 |
| 04_TURBINE | 涡轮 | 否 |
| 05_GEARBOX | 齿轮箱 | 否 |
| 06_ELECTRIC_MOTOR | 电机/电力推进 | 否 |
| 07_SHAFT | 轴系 | **是** |
| 08_PROPELLER | 螺旋桨 | **是** |
| 09_PUMP_JET | 泵喷 | **是** |
| 10_THRUSTER | 推进槽 | **是** |
| 11_CONTROL_SYSTEM | 控制系统 | 否 |
| 12_AUXILIARY_POWER | 辅机电源 | 否 |
| 13_COOLING | 冷却 | 否 |
| 14_REACTOR_SAFETY | 反应堆安全 | 否 |

## 5. 数据流

```text
Typhoon 母版 .blend（只读）
   │  extract_typhoon_propulsion.py
   ▼
PROPULSION_ASSET_TEMPLATE.md          建模规范（枢轴/LOD/材质/插槽/碰撞/预览）
   │
   ├─────────────────────────────┐
   ▼                             ▼
propulsor_specs.json           公开资料研究（research/*.json）
   │  build_propulsor.py           │
   ▼                               │
3D 资产（Blend/FBX/LOD/Collision/Preview/SPEC/BUILD_REPORT）
   │                               │
   └──────────┬────────────────────┘
              ▼  build_propulsion_database.py
   propulsion_manifest.json / propulsion_family.json /
   propulsion_technology_tree.json / submarine_propulsion_compatibility.json /
   SubmarinePropulsionMatrix.csv / propulsion_coverage_report.md
              │
              ▼  propulsion_validator.py
   <ASSET_ID>_VALIDATION.json（PASS/FAIL + 明细）
```

## 6. 接口契约

### 6.1 工厂命令行

```bash
blender --background --factory-startup --python Tools/build_propulsor.py -- \
  --spec Manifest/propulsor_specs.json --id <ASSET_ID> --root <Propulsion 根> \
  [--no-preview] [--skip-roundtrip] [--samples 32]
```

退出时写出：Master Blend、LOD0–3 FBX、碰撞 FBX、四视图预览、SPEC、README、构建报告。

### 6.2 构建报告字段

`Validation/<ASSET_ID>_BUILD_REPORT.json` 是唯一被校验器信任的机器可读证据来源，
包含 units / sockets / lods / materials / collision / exports / previews / roundtrip / checks。
`previews[].non_background_fraction` 是渲染后即时统计的非背景像素比例，用来证明取景有效。
`roundtrip` 记录把 FBX 重新导入空场景后的实测尺寸与三角面数，作为导出往返证据。

### 6.3 数据库命令行

```bash
python Tools/build_propulsion_database.py --root <Propulsion 根>
python Tools/propulsion_validator.py --root <Propulsion 根> [--asset <ASSET_ID>]
python Tools/run_propulsion_pipeline.py --root <Propulsion 根> [--ids ...]
```

## 7. 科技树结构

七个分支，每个分支 T1–T10：

1. `BRANCH_REACTOR` 反应堆世代（DATABASE_ONLY）
2. `BRANCH_POWER_CONVERSION` 能量转换
3. `BRANCH_TRANSMISSION` 传动
4. `BRANCH_SHAFT` 轴系
5. `BRANCH_PROPULSOR` 推进器（T1–T5 桨型世代，T6–T10 整机/泵喷世代）
6. `BRANCH_THRUSTER` 辅助推进
7. `BRANCH_CONTROL` 控制架构世代

## 8. 验收（Definition of Done）

1. 20 个推进器资产的目录与文件齐全，FBX 全部为 7400。
2. LOD 面数单调递减且尺寸误差 ≤ 2%。
3. 插槽按类型齐备，材质齐全且无默认名。
4. 数据库四份 JSON + 一份 CSV + 一份覆盖报告生成成功。
5. `propulsion_validator.py` 全部 PASS。
6. UE4.27 编辑器导入未执行的部分，明确标为未验证。
