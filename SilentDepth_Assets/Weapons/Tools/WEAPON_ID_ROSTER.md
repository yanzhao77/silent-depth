# SILENT DEPTH 武器 ID 名册（跨分册契约）

本文件是 `Weapons/Tools/` 下各数据分册、兼容性矩阵与工厂脚本之间的**唯一 ID 契约**。
分册作者必须使用这里列出的 `weapon_id`，不得改名、不得新增未被批准的 ID。
如果研究后发现某个 ID 不成立（资料不足、并非潜射武器），**删除该条目**并在
交付说明中列出，而不是编造替代型号。

命名规则：`[COUNTRY]_[CATEGORY]_[FAMILY]`，其中 `COUNTRY ∈ {US, RU, UK, FR, CN, IN}`，
`CATEGORY ∈ {TORP, ASM, LAM, ASW, SLBM, STRAT, MINE, DECOY, SPECIAL}`。

只需要**潜射 / 潜艇布放**武器；水面舰、飞机、陆基武器一律不进数据库。

---

## 已实现：TORP（`data_torpedoes.py`，共 46 个 variant，勿修改 ID）

`US_TORP_Mk14 / Mk18 / Mk23 / Mk16 / Mk27 / Mk37 / Mk37_Mod2 / Mk45 / Mk48 /
 Mk48_ADCAP / Mk48_Mod6 / Mk48_Mod7`，
`RU_TORP_SET53 / SET65 / SAET60 / USET80 / USET80K / TEST71 / TEST71M / TEST96 /
 UGST / UGST_M / 5365 / 5365K / 5365M / 6576 / 6576A / Shkval / Fizik`，
`UK_TORP_Mk8 / Tigerfish / Tigerfish_Mod1 / Spearfish / Spearfish_Mod1 / StingRay`，
`FR_TORP_L5 / L5_Mod3 / L5_Mod4 / F17 / F21`，
`CN_TORP_Yu1 / Yu3 / Yu4 / Yu5 / Yu6 / Yu7`，
`IN_TORP_Varunastra / TAL`。

---

## `data_missiles.py` —— 反舰 / 对陆 / 反潜导弹

同一 Family 的多个 Variant 必须在同一个 `family(...)` 里，共享 `base_geometry`。

### 反舰导弹 ASM

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `RU_ASM_P5` | Russia | P-5 / SS-N-3 潜射巡航反舰导弹 |
| `RU_ASM_P6` | Russia | P-6（P-5 家族的核装药潜射型，与 P-5 共享几何） |
| `RU_ASM_P70` | Russia | P-70 Ametist |
| `RU_ASM_P120` | Russia | P-120 Malakhit 潜射型 |
| `RU_ASM_P500` | Russia | P-500 Bazalt 潜射型 |
| `RU_ASM_P1000` | Russia | P-1000 Vulkan（Bazalt 家族改进型） |
| `RU_ASM_P700` | Russia | P-700 Granit |
| `RU_ASM_Oniks` | Russia | P-800 Oniks |
| `RU_ASM_Zircon` | Russia | 3M22 Tsirkon |
| `RU_ASM_Kalibr_3M54` | Russia | Kalibr 家族反舰型 3M54 |
| `CN_ASM_YJ8` | China | YJ-8 / YJ-82 潜射反舰导弹 |
| `CN_ASM_YJ18` | China | YJ-18 潜射反舰导弹 |
| `US_ASM_Harpoon` | USA | UGM-84 潜射鱼叉 |
| `US_ASM_Tomahawk_TASM` | USA | UGM-109B TASM（反舰型战斧，已退役，与 Tomahawk 家族共享几何） |
| `FR_ASM_Exocet_SM39` | France | SM39 潜射飞鱼 |

### 对陆攻击巡航导弹 LAM

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_LAM_Tomahawk` | USA | BGM-109 战斧 Block II 级 |
| `US_LAM_Tomahawk_BlockIII` | USA | 战斧 Block III |
| `US_LAM_Tomahawk_BlockIV` | USA | 战斧 Block IV / TACTOM |
| `US_LAM_Tomahawk_BlockV` | USA | 战斧 Block V |
| `RU_LAM_Kalibr_3M14` | Russia | Kalibr 家族对陆型 3M14 |
| `RU_LAM_Granat` | Russia | RK-55 Granat / SS-N-21 |
| `FR_LAM_MdCN` | France | MdCN 海军巡航导弹 |
| `CN_LAM_YJ18_LandAttack` | China | YJ-18 家族对陆型；公开资料有限，标记 GAMEPLAY 且 DATABASE_ONLY |

### 反潜导弹 ASW

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_ASW_SUBROC` | USA | UUM-44 SUBROC |
| `US_ASW_SeaLance` | USA | UUM-125 Sea Lance（取消，PLANNED） |
| `RU_ASW_Vyuga` | Russia | RPK-2 Vyuga / 81R |
| `RU_ASW_Vodopad` | Russia | RPK-6 Vodopad / 83R |
| `RU_ASW_Veter` | Russia | RPK-7 Veter / 86R |
| `RU_ASW_Otvet` | Russia | 91R / 91RT2 Otvet |
| `CN_ASW_CY1` | China | CY-1 反潜导弹 |

---

## `data_slbm.py` —— 弹道导弹 SLBM

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_SLBM_Polaris_A1` | USA | Polaris A1 |
| `US_SLBM_Polaris_A3` | USA | Polaris A3 |
| `US_SLBM_Poseidon_C3` | USA | Poseidon C3 |
| `US_SLBM_Trident_C4` | USA | Trident I C4 |
| `US_SLBM_Trident_D5` | USA | Trident II D5 |
| `US_SLBM_Trident_D5LE` | USA | Trident II D5LE |
| `RU_SLBM_R13` | Russia | R-13 |
| `RU_SLBM_R21` | Russia | R-21 |
| `RU_SLBM_R27` | Russia | R-27 |
| `RU_SLBM_R29` | Russia | R-29 |
| `RU_SLBM_R29R` | Russia | R-29R |
| `RU_SLBM_R29RM` | Russia | R-29RM |
| `RU_SLBM_R29RMU2_Sineva` | Russia | R-29RMU2 Sineva |
| `RU_SLBM_R29RMU2_Liner` | Russia | R-29RMU2.1 Liner |
| `RU_SLBM_R30_Bulava` | Russia | R-30 Bulava |
| `FR_SLBM_M1` | France | M1 |
| `FR_SLBM_M2` | France | M2 |
| `FR_SLBM_M20` | France | M20 |
| `FR_SLBM_M4` | France | M4 |
| `FR_SLBM_M45` | France | M45 |
| `FR_SLBM_M51` | France | M51 |
| `CN_SLBM_JL1` | China | JL-1 |
| `CN_SLBM_JL2` | China | JL-2 |
| `CN_SLBM_JL3` | China | JL-3 |
| `IN_SLBM_K15` | India | K-15 / B-05 |
| `IN_SLBM_K4` | India | K-4 |
| `IN_SLBM_K5` | India | K-5（PLANNED） |

美国 Polaris/Poseidon/Trident 由英国潜艇共用，**不再为 UK 新建 ID**，
而是通过兼容性矩阵把 `UK_SSBN_*` 连到 `US_SLBM_*`。

---

## `data_support.py` —— 水雷 / 诱饵 / 特种载荷

### 水雷 MINE

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_MINE_Mk67_SLMM` | USA | Mk 67 SLMM 潜艇布放机动水雷 |
| `US_MINE_Mk60_CAPTOR` | USA | Mk 60 CAPTOR |
| `UK_MINE_SeaUrchin` | UK | Sea Urchin 潜艇布放水雷 |
| `RU_MINE_PMR2` | Russia | PMR-2 潜艇布放水雷 |
| `RU_MINE_MDM6` | Russia | MDM-6 系列潜艇布放水雷 |

### 诱饵 / 对抗 DECOY

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_DECOY_Mk70_MOSS` | USA | Mk 70 MOSS 潜艇模拟器 |
| `US_DECOY_ADC_Mk4` | USA | ADC Mk 4 声学对抗装置 |
| `US_DECOY_ADC_Mk5` | USA | ADC Mk 5 |
| `RU_DECOY_MG74` | Russia | MG-74 声学诱饵 |
| `UK_DECOY_SSE_Mk3` | UK | 潜用信号发射器 SSE Mk 3 |

### 特种载荷 SPECIAL

| weapon_id | 国家 | 说明 |
| --- | --- | --- |
| `US_SPECIAL_DDS` | USA | Dry Deck Shelter 干式甲板掩体 |
| `US_SPECIAL_ASDS` | USA | Advanced SEAL Delivery System |
| `US_SPECIAL_SDV_Mk8` | USA | Mk 8 SEAL Delivery Vehicle |
| `RU_SPECIAL_SDV_Sirena` | Russia | Sirena 级水下输送载具 |
| `UK_SPECIAL_DDS` | UK | 英国干式甲板掩体 |

「DATABASE_ONLY」类武器仍需完整数据记录，但 `asset_priority` 设为 `DATABASE_ONLY`，
不进入 3D 资产生产队列。
