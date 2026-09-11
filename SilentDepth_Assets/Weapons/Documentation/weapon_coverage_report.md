# SILENT DEPTH 武器库覆盖报告

生成时间：2026-09-11

本文所有数字来自 `weapon_dataset.py` 的数据记录与磁盘真实文件扫描，未执行过的检查不做推断。

## 总量

| 项目 | 数量 |
| --- | --- |
| Weapon Families | 87 |
| Weapon Variants | 124 |
| 已产出完整 3D 资产 | 120 |
| 含可通过校验的 FBX 版本(7400)的武器 | 120 |
| DATABASE_ONLY 条目 | 4 |
| 兼容关系总数 | 250 |

## 分类分布

| 类别 | 代码 | 数量 |
| --- | --- | --- |
| Torpedo | TORP | 46 |
| Anti-Ship Missile | ASM | 15 |
| Land-Attack Missile | LAM | 8 |
| Anti-Submarine Missile | ASW | 7 |
| Ballistic Missile | SLBM | 30 |
| Strategic Missile | STRAT | 3 |
| Mine | MINE | 5 |
| Decoy System | DECOY | 5 |
| Special Payload | SPECIAL | 5 |

## 国家分布

| 国家 | 数量 |
| --- | --- |
| China | 13 |
| France | 12 |
| India | 5 |
| Russia | 48 |
| UK | 10 |
| USA | 36 |

## Tier 分布

| Tier | 说明 | 数量 |
| --- | --- | --- |
| T1 | T1 早期基础武器 | 3 |
| T2 | T2 早期制导鱼雷 / 初代潜射导弹 | 6 |
| T3 | T3 冷战早期成熟鱼雷 / 初期巡航导弹 | 9 |
| T4 | T4 冷战中期鱼雷 / 反舰导弹 | 11 |
| T5 | T5 冷战后期先进鱼雷 / 远程导弹 / SLBM | 12 |
| T6 | T6 现代早期武器 | 25 |
| T7 | T7 现代成熟武器 | 21 |
| T8 | T8 现代先进武器 | 26 |
| T9 | T9 新一代高端武器 | 9 |
| T10 | T10 现代 / 未来顶级游戏武器 | 2 |

## 服役状态分布

| 状态 | 数量 |
| --- | --- |
| ACTIVE | 51 |
| HISTORICAL | 17 |
| PLANNED | 4 |
| RETIRED | 50 |
| UNKNOWN | 2 |

## 资产优先级分布

| 优先级 | 数量 |
| --- | --- |
| DATABASE_ONLY | 4 |
| HIGH | 46 |
| LOW | 23 |
| MEDIUM | 51 |

## 每个武器的兼容潜艇数量与资产状态

| Weapon | Tier | Category | Priority | Asset Status | Compatible Submarines |
| --- | --- | --- | --- | --- | --- |
| CN_TORP_Yu1 | T2 | TORP | LOW | COMPLETE | 1 |
| CN_TORP_Yu4 | T4 | TORP | LOW | COMPLETE | 2 |
| CN_TORP_Yu3 | T5 | TORP | MEDIUM | COMPLETE | 3 |
| CN_TORP_Yu5 | T7 | TORP | HIGH | COMPLETE | 0 |
| CN_TORP_Yu7 | T7 | TORP | LOW | COMPLETE | 4 |
| CN_TORP_Yu6 | T8 | TORP | HIGH | COMPLETE | 6 |
| CN_ASM_YJ8 | T6 | ASM | MEDIUM | COMPLETE | 2 |
| CN_ASM_YJ18 | T8 | ASM | HIGH | COMPLETE | 3 |
| CN_LAM_YJ18_LandAttack | T8 | LAM | DATABASE_ONLY | DATABASE_ONLY | 2 |
| CN_ASW_CY1 | T6 | ASW | LOW | COMPLETE | 2 |
| CN_SLBM_JL1 | T4 | SLBM | MEDIUM | COMPLETE | 1 |
| CN_SLBM_JL2 | T7 | SLBM | HIGH | COMPLETE | 2 |
| CN_SLBM_JL3 | T9 | SLBM | HIGH | COMPLETE | 1 |
| FR_TORP_L5_Mod3 | T5 | TORP | MEDIUM | COMPLETE | 2 |
| FR_TORP_F17 | T6 | TORP | HIGH | COMPLETE | 3 |
| FR_TORP_L5_Mod4 | T6 | TORP | LOW | COMPLETE | 1 |
| FR_TORP_F21 | T9 | TORP | HIGH | COMPLETE | 4 |
| FR_ASM_Exocet_SM39 | T7 | ASM | HIGH | COMPLETE | 5 |
| FR_LAM_MdCN | T8 | LAM | HIGH | COMPLETE | 1 |
| FR_SLBM_M1 | T3 | SLBM | MEDIUM | COMPLETE | 0 |
| FR_SLBM_M2 | T4 | SLBM | MEDIUM | COMPLETE | 0 |
| FR_SLBM_M20 | T5 | SLBM | MEDIUM | COMPLETE | 1 |
| FR_SLBM_M4 | T6 | SLBM | MEDIUM | COMPLETE | 1 |
| FR_SLBM_M45 | T7 | SLBM | MEDIUM | COMPLETE | 2 |
| FR_SLBM_M51 | T8 | SLBM | HIGH | COMPLETE | 2 |
| IN_TORP_TAL | T7 | TORP | DATABASE_ONLY | DATABASE_ONLY | 1 |
| IN_TORP_Varunastra | T8 | TORP | HIGH | COMPLETE | 4 |
| IN_SLBM_K15 | T6 | SLBM | MEDIUM | COMPLETE | 2 |
| IN_SLBM_K4 | T8 | SLBM | HIGH | COMPLETE | 4 |
| IN_SLBM_K5 | T10 | SLBM | DATABASE_ONLY | DATABASE_ONLY | 2 |
| RU_TORP_SET53 | T3 | TORP | MEDIUM | COMPLETE | 2 |
| RU_TORP_SAET60 | T4 | TORP | LOW | COMPLETE | 0 |
| RU_TORP_SET65 | T4 | TORP | MEDIUM | COMPLETE | 6 |
| RU_TORP_5365K | T5 | TORP | HIGH | COMPLETE | 4 |
| RU_TORP_5365M | T6 | TORP | MEDIUM | COMPLETE | 1 |
| RU_TORP_6576 | T6 | TORP | HIGH | COMPLETE | 3 |
| RU_TORP_TEST71 | T6 | TORP | HIGH | COMPLETE | 1 |
| RU_TORP_USET80 | T6 | TORP | MEDIUM | COMPLETE | 6 |
| RU_TORP_6576A | T7 | TORP | MEDIUM | COMPLETE | 0 |
| RU_TORP_Shkval | T7 | TORP | HIGH | COMPLETE | 4 |
| RU_TORP_TEST71M | T7 | TORP | MEDIUM | COMPLETE | 3 |
| RU_TORP_UGST | T7 | TORP | HIGH | COMPLETE | 4 |
| RU_TORP_USET80K | T7 | TORP | MEDIUM | COMPLETE | 2 |
| RU_TORP_TEST96 | T8 | TORP | MEDIUM | COMPLETE | 0 |
| RU_TORP_UGST_M | T8 | TORP | HIGH | COMPLETE | 2 |
| RU_TORP_Fizik | T9 | TORP | LOW | COMPLETE | 3 |
| RU_ASM_P5 | T3 | ASM | MEDIUM | COMPLETE | 0 |
| RU_ASM_P6 | T3 | ASM | LOW | COMPLETE | 0 |
| RU_ASM_P70 | T4 | ASM | HIGH | COMPLETE | 1 |
| RU_ASM_P120 | T5 | ASM | MEDIUM | COMPLETE | 0 |
| RU_ASM_P500 | T6 | ASM | HIGH | COMPLETE | 0 |
| RU_ASM_P1000 | T7 | ASM | MEDIUM | COMPLETE | 0 |
| RU_ASM_P700 | T7 | ASM | HIGH | COMPLETE | 1 |
| RU_ASM_Kalibr_3M54 | T8 | ASM | HIGH | COMPLETE | 3 |
| RU_ASM_Oniks | T8 | ASM | HIGH | COMPLETE | 2 |
| RU_ASM_Zircon | T10 | ASM | HIGH | COMPLETE | 2 |
| RU_LAM_Granat | T6 | LAM | MEDIUM | COMPLETE | 1 |
| RU_LAM_Kalibr_3M14 | T8 | LAM | HIGH | COMPLETE | 2 |
| RU_ASW_Vyuga | T4 | ASW | MEDIUM | COMPLETE | 0 |
| RU_ASW_Vodopad | T6 | ASW | MEDIUM | COMPLETE | 6 |
| RU_ASW_Veter | T7 | ASW | MEDIUM | COMPLETE | 0 |
| RU_ASW_Otvet | T8 | ASW | MEDIUM | COMPLETE | 0 |
| RU_SLBM_R13 | T2 | SLBM | MEDIUM | COMPLETE | 1 |
| RU_SLBM_R21 | T3 | SLBM | MEDIUM | COMPLETE | 1 |
| RU_SLBM_R27 | T4 | SLBM | MEDIUM | COMPLETE | 1 |
| RU_SLBM_R29 | T5 | SLBM | HIGH | COMPLETE | 3 |
| RU_SLBM_R29R | T6 | SLBM | HIGH | COMPLETE | 2 |
| RU_SLBM_R29RM | T7 | SLBM | HIGH | COMPLETE | 3 |
| RU_SLBM_R29RMU2_Liner | T8 | SLBM | MEDIUM | COMPLETE | 1 |
| RU_SLBM_R29RMU2_Sineva | T8 | SLBM | HIGH | COMPLETE | 1 |
| RU_SLBM_R30_Bulava | T9 | SLBM | HIGH | COMPLETE | 2 |
| RU_SLBM_R39 | T9 | SLBM | HIGH | COMPLETE | 0 |
| RU_SLBM_R39M | T9 | SLBM | LOW | COMPLETE | 0 |
| RU_STRAT_Meteorit | T8 | STRAT | MEDIUM | COMPLETE | 0 |
| RU_MINE_MDM6 | T5 | MINE | LOW | COMPLETE | 0 |
| RU_MINE_PMR2 | T5 | MINE | LOW | COMPLETE | 0 |
| RU_DECOY_MG74 | T6 | DECOY | MEDIUM | COMPLETE | 7 |
| RU_SPECIAL_SDV_Sirena | T6 | SPECIAL | MEDIUM | COMPLETE | 0 |
| UK_TORP_Mk8 | T2 | TORP | MEDIUM | COMPLETE | 3 |
| UK_TORP_Tigerfish | T6 | TORP | MEDIUM | COMPLETE | 5 |
| UK_TORP_Tigerfish_Mod1 | T6 | TORP | LOW | COMPLETE | 0 |
| UK_TORP_StingRay | T7 | TORP | LOW | COMPLETE | 4 |
| UK_TORP_Spearfish | T8 | TORP | HIGH | COMPLETE | 5 |
| UK_TORP_Spearfish_Mod1 | T9 | TORP | HIGH | COMPLETE | 3 |
| UK_SLBM_Polaris_A3TK | T7 | SLBM | HIGH | COMPLETE | 0 |
| UK_MINE_SeaUrchin | T3 | MINE | LOW | COMPLETE | 1 |
| UK_DECOY_SSE_Mk3 | T3 | DECOY | LOW | COMPLETE | 4 |
| UK_SPECIAL_DDS | T8 | SPECIAL | LOW | COMPLETE | 0 |
| US_TORP_Mk14 | T1 | TORP | MEDIUM | COMPLETE | 3 |
| US_TORP_Mk18 | T1 | TORP | LOW | COMPLETE | 0 |
| US_TORP_Mk23 | T1 | TORP | LOW | COMPLETE | 0 |
| US_TORP_Mk16 | T2 | TORP | LOW | COMPLETE | 1 |
| US_TORP_Mk27 | T2 | TORP | LOW | COMPLETE | 0 |
| US_TORP_Mk37 | T3 | TORP | HIGH | COMPLETE | 7 |
| US_TORP_Mk37_Mod2 | T4 | TORP | MEDIUM | COMPLETE | 0 |
| US_TORP_Mk45 | T5 | TORP | MEDIUM | COMPLETE | 1 |
| US_TORP_Mk48 | T6 | TORP | MEDIUM | COMPLETE | 4 |
| US_TORP_Mk48_ADCAP | T7 | TORP | HIGH | COMPLETE | 3 |
| US_TORP_Mk48_Mod6 | T8 | TORP | HIGH | COMPLETE | 3 |
| US_TORP_Mk48_Mod7 | T8 | TORP | HIGH | COMPLETE | 3 |
| US_ASM_Harpoon | T6 | ASM | HIGH | COMPLETE | 5 |
| US_ASM_Tomahawk_TASM | T6 | ASM | MEDIUM | COMPLETE | 0 |
| US_LAM_Tomahawk | T6 | LAM | MEDIUM | COMPLETE | 0 |
| US_LAM_Tomahawk_BlockIII | T7 | LAM | HIGH | COMPLETE | 5 |
| US_LAM_Tomahawk_BlockIV | T8 | LAM | HIGH | COMPLETE | 5 |
| US_LAM_Tomahawk_BlockV | T9 | LAM | HIGH | COMPLETE | 3 |
| US_ASW_SUBROC | T5 | ASW | MEDIUM | COMPLETE | 2 |
| US_ASW_SeaLance | T6 | ASW | DATABASE_ONLY | DATABASE_ONLY | 0 |
| US_SLBM_Polaris_A1 | T2 | SLBM | MEDIUM | COMPLETE | 2 |
| US_SLBM_Polaris_A3 | T3 | SLBM | MEDIUM | COMPLETE | 4 |
| US_SLBM_Poseidon_C3 | T4 | SLBM | MEDIUM | COMPLETE | 3 |
| US_SLBM_Trident_C4 | T5 | SLBM | HIGH | COMPLETE | 3 |
| US_SLBM_Trident_D5 | T8 | SLBM | HIGH | COMPLETE | 2 |
| US_SLBM_Trident_D5LE | T9 | SLBM | HIGH | COMPLETE | 4 |
| US_STRAT_RegulusII | T4 | STRAT | LOW | COMPLETE | 0 |
| US_STRAT_TLAM_N | T8 | STRAT | MEDIUM | COMPLETE | 0 |
| US_MINE_Mk60_CAPTOR | T5 | MINE | LOW | COMPLETE | 3 |
| US_MINE_Mk67_SLMM | T6 | MINE | MEDIUM | COMPLETE | 3 |
| US_DECOY_Mk70_MOSS | T6 | DECOY | MEDIUM | COMPLETE | 4 |
| US_DECOY_ADC_Mk4 | T7 | DECOY | MEDIUM | COMPLETE | 3 |
| US_DECOY_ADC_Mk5 | T8 | DECOY | LOW | COMPLETE | 1 |
| US_SPECIAL_SDV_Mk8 | T7 | SPECIAL | MEDIUM | COMPLETE | 1 |
| US_SPECIAL_ASDS | T8 | SPECIAL | MEDIUM | COMPLETE | 1 |
| US_SPECIAL_DDS | T8 | SPECIAL | HIGH | COMPLETE | 1 |

## 生产队列状态（来自 weapon_production_queue.json）

| 状态 | 数量 |
| --- | --- |
| COMPLETE | 120 |

重试队列为空。
