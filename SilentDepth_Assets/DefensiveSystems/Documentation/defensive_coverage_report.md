# 潜艇防御系统覆盖报告

生成日期：2026-09-11

本报告是**游戏科技树**的覆盖统计。不含真实电子战参数、频率、功率、欺骗逻辑或作战战术。

## 1. 家族与变体

- 分支：9
- 家族：45
- 变体（家族 × 国家）：270
- 有 3D 资产的家族：40
- 仅数据库（DATABASE_ONLY）：5

## 2. 变体验证状态

| 状态 | 数量 |
| --- | --- |
| CONFIRMED | 5 |
| GAMEPLAY | 258 |
| PROBABLE | 7 |

## 3. 分支覆盖

| 分支 | 家族数 | 层级范围 | 有 3D 资产的家族 |
| --- | --- | --- | --- |
| ESM (电子支援措施) | 10 | T1-T10 | 10 |
| Threat Warning (威胁告警) | 5 | T1-T10 | 1 |
| Acoustic Countermeasure (声学对抗) | 6 | T1-T10 | 6 |
| Decoy (诱饵) | 6 | T1-T10 | 5 |
| Noise Maker (噪声弹) | 4 | T1-T10 | 4 |
| Torpedo Defense (鱼雷防御) | 4 | T4-T10 | 4 |
| Countermeasure Launcher (对抗发射装置) | 5 | T2-T10 | 5 |
| Defensive Control (防御控制) | 3 | T2-T10 | 3 |
| Integrated Defense (整合防御) | 2 | T6-T10 | 2 |

## 4. 兼容性矩阵覆盖

| 兼容性 | 行数 |
| --- | --- |
| CONFIRMED | 1 |
| PROBABLE | 5 |
| GAMEPLAY | 1935 |
| UNKNOWN | 269 |
| INCOMPATIBLE | 220 |

平台数 54，家族数 45，总行数 2430；装载方案 54 份，每份 9 个槽位。

### 降级记录（声明了真实系统但缺公开来源）

| 平台 | 家族 | 原判 | 原因 |
| --- | --- | --- | --- |
| US_SSN_LosAngeles | ESM-DIGITAL | PROBABLE | 缺少公开来源记录，按策略降级为 GAMEPLAY。 |
| US_SSN_Seawolf | ESM-DIGITAL | CONFIRMED | 缺少公开来源记录，按策略降级为 GAMEPLAY。 |
| US_SSBN_Ohio | ESM-DIGITAL | CONFIRMED | 缺少公开来源记录，按策略降级为 GAMEPLAY。 |

## 5. 3D 资产流水线状态

| 项目 | 数量 |
| --- | --- |
| assets | 13 |
| high_priority | 7 |
| with_master_blend | 13 |
| with_full_lod_set | 13 |
| with_collision | 13 |
| with_spec | 13 |
| with_previews | 13 |
| pipeline_complete | 13 |
| unregistered_asset_dirs | 0 |

| 资产 | 优先级 | Master | LOD0-3 | 碰撞 | SPEC | 预览 | LOD0 三角面 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US_EW_ESM_GENERIC | HIGH | 有 | 4/4 | 有 | 有 | 7 | 5028 |
| US_EW_BLQ10 | HIGH | 有 | 4/4 | 有 | 有 | 7 | 5472 |
| UK_EW_ASTUTE | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 3368 |
| RU_EW_AKULA | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 2696 |
| CN_EW_TYPE093 | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 4148 |
| GEN_EW_ANTENNA_ARRAY | HIGH | 有 | 4/4 | 有 | 有 | 7 | 2484 |
| US_ACM_TORPEDO_DECOY | HIGH | 有 | 4/4 | 有 | 有 | 7 | 2964 |
| US_ACM_MOBILE_DECOY | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 3180 |
| GEN_ACM_NOISE_MAKER | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 2916 |
| US_CML_DECOY_LAUNCHER | HIGH | 有 | 4/4 | 有 | 有 | 6 | 3908 |
| GEN_CML_TUBE | MEDIUM | 有 | 4/4 | 有 | 有 | 7 | 2040 |
| GEN_TW_TORPEDO_WARNING_SENSOR | HIGH | 有 | 4/4 | 有 | 有 | 6 | 1428 |
| US_DCM_CONSOLE | HIGH | 有 | 4/4 | 有 | 有 | 6 | 1296 |

## 6. 已知空缺（诚实声明）

- 未在公开来源中找到具体型号的分支/国家组合，一律保持 GAMEPLAY 或 UNKNOWN，不做推断。
- DATABASE_ONLY 的家族不生成 3D 模型，避免用假几何体冒充真实装备。
- 本库不修改任何既有潜艇模型；socket 词表只用于新的附加展示层资产。
- 3D 资产是游戏化的外形表达，不是对真实装备的测绘复刻。

## 7. 数据文件

| 文件 | 用途 |
| --- | --- |
| Manifest/defensive_system_family.json | 家族与变体定义 |
| Manifest/defensive_system_manifest.json | 3D 资产清单与磁盘真实状态 |
| Manifest/submarine_defensive_compatibility.json | 兼容性矩阵（完整字段） |
| Manifest/defensive_loadout_manifest.json | 每艇装载方案 |
| TechnologyTree/defensive_technology_tree.json | T1-T10 科技树 |
| Documentation/SubmarineDefensiveMatrix.csv | 矩阵总表 |
| Documentation/SubmarineDefensiveMatrix_full.csv | 逐行明细 |
| Documentation/defensive_system_research.json | 公开来源核验记录 |
