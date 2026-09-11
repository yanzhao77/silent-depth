# SILENT DEPTH 传感器覆盖报告

生成日期：2026-09-11

## 1. 数据库覆盖

- 数据库条目总数：150
- 现实候选（有公开来源挂钩）：20
- 游戏科技树层级件（`GEN_*`）：130

### 现实候选置信度分布

- CONFIRMED：7
- PROBABLE：10
- UNKNOWN（未核验到公开来源）：3

### 现实候选按国家

| 国家 | 条目 |
| --- | --- |
| China | 1 |
| India | 1 |
| Russia | 5 |
| UK | 3 |
| USA | 10 |

## 2. 分支覆盖

| 分支 | 名称 | 游戏层级件 | 现实候选 | 核心资产 |
| --- | --- | --- | --- | --- |
| PASSIVE | 被动声呐 | 10 | 0 | 6 |
| ACTIVE | 主动声呐 | 10 | 0 | 2 |
| BOW | 艇艏声呐阵 | 10 | 10 | 5 |
| FLANK | 侧阵 | 10 | 0 | 3 |
| TOWED | 拖曳阵 | 10 | 3 | 3 |
| HF | 高频声呐 | 10 | 1 | 3 |
| MINE | 探雷声呐 | 10 | 0 | 1 |
| NAV | 导航声呐 | 10 | 0 | 2 |
| PHOTONICS | 潜望镜与光电桅杆 | 10 | 2 | 5 |
| EOIR | 光电/红外 | 10 | 0 | 2 |
| RADAR | 潜艇雷达 | 10 | 2 | 2 |
| ESM | 电子支援措施 | 10 | 2 | 2 |
| PROCESSING | 声学处理 | 10 | 0 | 3 |

## 3. 潜艇覆盖（§30：全部 SSN / SSBN）

- 潜艇总数：54
- 兼容性记录：702 条（每艇 13 个分支各一条）

| 选定状态 | 数量 |
| --- | --- |
| CONFIRMED | 14 |
| PROBABLE | 21 |
| GAMEPLAY | 667 |
| UNKNOWN | 0 |
| INCOMPATIBLE | 0 |

> 选定状态表示该艇在该分支上实际装载的传感器判定；
> `candidates` 中还会出现被排除的 `INCOMPATIBLE`（跨国现实系统）与 `UNKNOWN` 选项。

## 4. 3D 资产覆盖

- 核心资产计划：39 件
- 已完成（Blend/FBX/LOD/Collision/Preview/文档齐全）：39 件
- 待完成：0 件

| 资产 | 分支 | 外形 | 几何来源 | 状态 |
| --- | --- | --- | --- | --- |
| GEN_SONAR_PSV_T1 | PASSIVE | hydrophone_pair | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_PSV_T3 | PASSIVE | bow_dome_cylinder | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_PSV_T5 | PASSIVE | flank_panel | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_PSV_T6 | PASSIVE | towed_housing | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_PSV_T7 | PASSIVE | towed_line | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_PSV_T8 | PASSIVE | distributed_pod | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_ACT_T3 | ACTIVE | bow_dome_cylinder | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_ACT_T5 | ACTIVE | bow_dome_sphere | 游戏代表性外形 | COMPLETE |
| US_SONAR_BQQ5 | BOW | bow_dome_sphere | 公开外形 | COMPLETE |
| US_SONAR_BQQ6 | BOW | bow_dome_cylinder | 公开外形 | COMPLETE |
| US_SONAR_BQQ10 | BOW | bow_dome_sphere | 公开外形 | COMPLETE |
| US_SONAR_LAB | BOW | bow_large_aperture | 公开外形 | COMPLETE |
| GEN_SONAR_BOW_T4 | BOW | bow_water_backed | 公开外形 | COMPLETE |
| GEN_SONAR_FLK_T2 | FLANK | flank_panel | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_FLK_T4 | FLANK | flank_panel | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_FLK_T6 | FLANK | flank_conformal | 游戏代表性外形 | COMPLETE |
| US_SONAR_TB16 | TOWED | towed_housing | 公开外形 | COMPLETE |
| US_SONAR_TB29 | TOWED | towed_line | 公开外形 | COMPLETE |
| GEN_SONAR_TWD_T6 | TOWED | towed_line | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_HF_T3 | HF | hf_dome | 游戏代表性外形 | COMPLETE |
| US_SONAR_BQS15 | HF | hf_dome | 公开外形 | COMPLETE |
| GEN_SONAR_HF_T4 | HF | mine_head | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_MINE_T4 | MINE | mine_head | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_NAV_T4 | NAV | dvl_probe | 游戏代表性外形 | COMPLETE |
| GEN_SONAR_NAV_T5 | NAV | hf_dome | 游戏代表性外形 | COMPLETE |
| GEN_MAST_PHO_T1 | PHOTONICS | mast_periscope | 公开外形 | COMPLETE |
| GEN_MAST_PHO_T3 | PHOTONICS | mast_periscope | 公开外形 | COMPLETE |
| GEN_MAST_PHO_T4 | PHOTONICS | mast_periscope | 公开外形 | COMPLETE |
| US_PHO_Virginia | PHOTONICS | mast_photonics | 公开外形 | COMPLETE |
| UK_PHO_CM010 | PHOTONICS | mast_photonics | 公开外形 | COMPLETE |
| GEN_EOIR_T5 | EOIR | eo_turret | 游戏代表性外形 | COMPLETE |
| GEN_EOIR_T6 | EOIR | eo_turret | 游戏代表性外形 | COMPLETE |
| GEN_RADAR_T3 | RADAR | radar_dish | 游戏代表性外形 | COMPLETE |
| US_RADAR_BPS16 | RADAR | radar_dish | 公开外形 | COMPLETE |
| GEN_ESM_T6 | ESM | esm_mast | 游戏代表性外形 | COMPLETE |
| US_ESM_BLQ10 | ESM | esm_mast | 公开外形 | COMPLETE |
| GEN_PROC_T3 | PROCESSING | processor_rack | 游戏代表性外形 | COMPLETE |
| GEN_PROC_T7 | PROCESSING | processor_rack | 游戏代表性外形 | COMPLETE |
| GEN_PROC_T9 | PROCESSING | processor_rack | 游戏代表性外形 | COMPLETE |

## 5. 未覆盖 / 未核验项

- CN_SONAR_Type093（Type 093 Sonar (公开型号未知)）：公开来源未核验，保持 UNKNOWN。
- IN_SONAR_Arihant（Arihant Sonar (公开型号未知)）：公开来源未核验，保持 UNKNOWN。
- RU_SONAR_Pelamida（Pelamida Towed Array）：公开来源未核验，保持 UNKNOWN。

## 6. 硬性约束

- 不记录任何分类频率、声源级、探测距离等作战参数。
- 不把推测型号写成正式型号，不把概念型号写成服役型号。
- 未核验的平台—传感器关系一律不得标为 CONFIRMED。
