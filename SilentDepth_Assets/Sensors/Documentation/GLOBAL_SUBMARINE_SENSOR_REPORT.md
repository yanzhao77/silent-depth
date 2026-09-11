# GLOBAL SUBMARINE SENSOR REPORT

生成日期：2026-09-11

## 交付范围

SILENT DEPTH 第三套独立系统科技树：**潜艇传感器 / 声呐科技树**。
它独立于潜艇科技树与武器科技树，不修改潜艇模型、物理、战斗、AI、
声呐玩法逻辑、存档、任务与世界。

## 结构

```text
SUBMARINE -> SENSOR SYSTEM -> SENSOR FAMILY -> SENSOR VARIANT
          -> TIER -> 3D ASSET -> UE4.27
```

## 分支（§25：每个分支 T1–T10）

| 分支 | 名称 | 目录 | 插槽 | 核心资产 |
| --- | --- | --- | --- | --- |
| PASSIVE | 被动声呐 | `Passive/` | `SOCKET_SONAR_BOW`、`SOCKET_SONAR_FLANK_L`、`SOCKET_SONAR_FLANK_R`、`SOCKET_TOWED_ARRAY` | 6 |
| ACTIVE | 主动声呐 | `Active/` | `SOCKET_SONAR_BOW` | 2 |
| BOW | 艇艏声呐阵 | `Bow/` | `SOCKET_SONAR_BOW` | 5 |
| FLANK | 侧阵 | `Flank/` | `SOCKET_SONAR_FLANK_L`、`SOCKET_SONAR_FLANK_R` | 3 |
| TOWED | 拖曳阵 | `Towed/` | `SOCKET_TOWED_ARRAY` | 3 |
| HF | 高频声呐 | `HighFrequency/` | `SOCKET_SONAR_BOW` | 3 |
| MINE | 探雷声呐 | `MineDetection/` | `SOCKET_SONAR_BOW` | 1 |
| NAV | 导航声呐 | `Navigation/` | `SOCKET_SONAR_BOW` | 2 |
| PHOTONICS | 潜望镜与光电桅杆 | `Photonics/` | `SOCKET_PERISCOPE`、`SOCKET_PHOTONICS_MAST` | 5 |
| EOIR | 光电/红外 | `EOIR/` | `SOCKET_PHOTONICS_MAST` | 2 |
| RADAR | 潜艇雷达 | `Radar/` | `SOCKET_RADAR` | 2 |
| ESM | 电子支援措施 | `ESM/` | `SOCKET_ESM` | 2 |
| PROCESSING | 声学处理 | `Processing/` | 无（软件层） | 3 |

## 数字

- 分支：13
- 层级：13 × T1–T10 = 130
- 数据库条目：150（现实候选 20，游戏层级件 130）
- 潜艇覆盖：54 艘，兼容记录 702 条
- 传感器家族：29
- 统一插槽：8
- 核心 3D 资产：39 件，已完成 39 件
- 共享材质：10
- 已登记公开来源引用：36 条

## 兼容性判定规则

- `CONFIRMED`：公开来源核验过该艇与该传感器的对应关系。
- `PROBABLE`：有公开参考但缺少一手来源确认。
- `GAMEPLAY`：游戏科技树默认装配，按「同代潜艇装配同代层级节点」选取，不代表现实断言。
- `UNKNOWN`：公开资料不足。
- `INCOMPATIBLE`：跨国现实系统，不可能装配。

## 兼容性状态分布（选定）

| 状态 | 数量 | 含义 |
| --- | --- | --- |
| CONFIRMED | 14 | 公开来源核验过的平台—传感器关系 |
| PROBABLE | 21 | 有公开报道但未获一手确认 |
| GAMEPLAY | 667 | 游戏科技树默认装配（非现实断言） |
| UNKNOWN | 0 | 公开资料不足 |
| INCOMPATIBLE | 0 | 跨国现实系统，不可能装配 |

## 产物清单

| 文件 | 说明 |
| --- | --- |
| `Manifest/sensor_manifest.json` | 传感器数据库（§17 字段） |
| `Manifest/sensor_family.json` | 家族 → 变体关系（§16） |
| `Manifest/sensor_socket_registry.json` | 统一插槽注册表（§20） |
| `Manifest/submarine_sensor_compatibility.json` | 潜艇—传感器兼容矩阵（§18/§19） |
| `Manifest/sensor_production_status.json` | 资产生产状态 |
| `TechnologyTree/sensor_technology_tree.json` | 科技树（机器可读） |
| `TechnologyTree/sensor_technology_tree.md` | 科技树（可读） |
| `TechnologyTree/sensor_tier_manifest.json` | 层级清单 |
| `Documentation/SubmarineSensorMatrix.csv` | 潜艇 × 分支矩阵 |
| `Documentation/sensor_coverage_report.md` | 覆盖报告 |
| `Documentation/SENSOR_VALIDATION_REPORT.md` | 逐资产验证报告 |
| `Documentation/SENSOR_FACTORY_CONTRACT.md` | 传感器工厂契约 |
| `Documentation/UE427_SENSOR_IMPORT.md` | UE4.27 导入说明（含未验证声明） |
| `Documentation/Research/*` | 资料核验库（公开来源与置信度） |
| `Manifest/sensor_validation_index.json` | 验证索引 |
| `Manifest/sensor_socket_registry.json` | 插槽注册表 |
| `Templates/Sensor/*` | 传感器模板、导出预设、校验规则、插槽标准 |
| `Materials/*` | 共享材质库与材质定义 |
| `Tools/*` | 资产工厂工具链 |

## 完成度标签

- 数据库 / 科技树 / 兼容矩阵 / 工具链：IMPLEMENTED，且已由本地复跑验证（TESTED）。
- 3D 资产包（Blend、FBX LOD0–3、碰撞、四视角预览、文档）：IMPLEMENTED，并由 `Tools/sensor_validator.py` 逐资产验证（TESTED）。
- UE4.27 编辑器导入：**NOT VERIFIED**，本机没有 UE4.27 编辑器；FBX 仅通过二进制版本 7400 与文件结构验证。
- 目标硬件性能：**NOT VERIFIED**，本任务不产生也不引用 FPS 数据。

## 未验证项

- UE4.27 编辑器导入与场景内实际外观：本机未执行，需在装有 UE4.27 的机器上完成。
- 现实系统的公开参数：按任务书要求不采集、不记录，因此数据库中不存在这类字段。
- 法国与中国、印度的现实传感器型号：公开来源不足，保持 UNKNOWN。
