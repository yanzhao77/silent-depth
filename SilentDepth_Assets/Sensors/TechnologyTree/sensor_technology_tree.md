# SILENT DEPTH 潜艇传感器科技树 T1–T10

生成日期：2026-09-11

本文件由 `Tools/build_sensor_manifest.py` 从 `Tools/sensor_dataset*.py` 生成，请勿手工编辑。

## 编号约定

- **分支内 T1–T10**：每个分支自身的演进序列（任务书 §25「每个分支：T1-T10」）。
- **全局代际阶梯 T1–T10**：跨分支的代际总览（任务书 §24），见下表。
- `GEN_*` 条目是游戏科技树层级件；现实系统只作为层级上的参考系统出现，
  绝不代替层级本身。

## 全局代际阶梯（任务书 §24）

| 代际 | 含义 |
| --- | --- |
| T1 | 基础被动听音（Basic Passive Listening） |
| T2 | 改进型被动阵列（Improved Passive Array） |
| T3 | 基础主动/被动综合（Basic Active/Passive Integration） |
| T4 | 艇艏阵（Bow Array） |
| T5 | 侧阵（Flank Array） |
| T6 | 拖曳阵（Towed Array） |
| T7 | 低频/分布式阵列（Low Frequency / Distributed Array） |
| T8 | 大型孔径阵（Large Aperture Array） |
| T9 | 多阵融合（Multi-Array Fusion） |
| T10 | 下一代综合水声系统（Next Generation Integrated Acoustic System） |

## 分支总览

| 分支 | 目录 | T1–T10 完整 | 核心资产 |
| --- | --- | --- | --- |
| 被动声呐（PASSIVE） | `Passive/` | 是 | 6 |
| 主动声呐（ACTIVE） | `Active/` | 是 | 2 |
| 艇艏声呐阵（BOW） | `Bow/` | 是 | 5 |
| 侧阵（FLANK） | `Flank/` | 是 | 3 |
| 拖曳阵（TOWED） | `Towed/` | 是 | 3 |
| 高频声呐（HF） | `HighFrequency/` | 是 | 3 |
| 探雷声呐（MINE） | `MineDetection/` | 是 | 1 |
| 导航声呐（NAV） | `Navigation/` | 是 | 2 |
| 潜望镜与光电桅杆（PHOTONICS） | `Photonics/` | 是 | 5 |
| 光电/红外（EOIR） | `EOIR/` | 是 | 2 |
| 潜艇雷达（RADAR） | `Radar/` | 是 | 2 |
| 电子支援措施（ESM） | `ESM/` | 是 | 2 |
| 声学处理（PROCESSING） | `Processing/` | 是 | 3 |

## 被动声呐（PASSIVE）

不主动辐射声波的听音与阵列分支，是潜艇隐蔽探测的基础。

插槽：`SOCKET_SONAR_BOW`、`SOCKET_SONAR_FLANK_L`、`SOCKET_SONAR_FLANK_R`、`SOCKET_TOWED_ARRAY`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Early Passive Hydrophone | 早期被动水听器 | 任务书 | — |
| T2 | Improved Hydrophone | 改进型水听器 | 任务书 | — |
| T3 | Bow Passive Array | 艇艏被动阵 | 任务书 | — |
| T4 | Advanced Bow Array | 先进艇艏阵 | 任务书 | — |
| T5 | Flank Array | 侧阵 | 任务书 | — |
| T6 | Towed Array | 拖曳阵 | 任务书 | — |
| T7 | Low Frequency Towed Array | 低频拖曳阵 | 任务书 | — |
| T8 | Advanced Distributed Array | 先进分布式阵列 | 任务书 | — |
| T9 | Integrated Multi-Array Sonar | 综合多阵声呐 | 任务书 | — |
| T10 | Next Generation Integrated Acoustic System | 下一代综合水声系统 | 任务书 | — |

## 主动声呐（ACTIVE）

主动发射并接收回波的分支，暴露自身，只用于必要的测距与搜索。

插槽：`SOCKET_SONAR_BOW`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Early Active Sonar | 早期主动声呐 | 任务书 | — |
| T2 | Improved Active Sonar | 改进型主动声呐 | 任务书 | — |
| T3 | Mid-Frequency Active Sonar | 中频主动声呐 | 任务书 | — |
| T4 | Advanced Active Sonar | 先进主动声呐 | 任务书 | — |
| T5 | Integrated Active/Passive Sonar | 主被动综合声呐 | 任务书 | — |
| T6 | Modern Integrated Sonar | 现代综合声呐 | 任务书 | — |
| T7 | Next Generation Acoustic System | 下一代水声系统 | 任务书 | — |
| T8 | Active Bow Aperture Integration | 主动艇艏孔径综合 | 游戏扩展 | — |
| T9 | Cooperative Active Processing | 协同主动处理 | 游戏扩展 | — |
| T10 | Next Generation Active Suite | 下一代主动声呐套件 | 游戏扩展 | — |

## 艇艏声呐阵（BOW）

艇艏孔径结构分支，覆盖球形阵、柱形阵、大型孔径阵等公开可确认的结构演进。

插槽：`SOCKET_SONAR_BOW`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Early Bow Dome Sonar | 早期艇艏导流罩声呐 | 游戏扩展 | — |
| T2 | Spherical Bow Array | 球形艇艏阵 | 任务书 | AN/BQQ-5（USA，PROBABLE） |
| T3 | Cylindrical Bow Array | 柱形艇艏阵 | 任务书 | AN/BQQ-6（USA，PROBABLE） |
| T4 | Water-backed Cylindrical Array | 水背衬柱形阵 | 任务书 | — |
| T5 | Large Aperture Bow | 大型孔径艇艏阵 | 任务书 | Large Aperture Bow (LAB) Array（USA，CONFIRMED） |
| T6 | Wide Aperture Conformal Bow | 宽孔径共形艇艏阵 | 游戏扩展 | AN/BQQ-10（USA，CONFIRMED）、Sonar 2074（UK，PROBABLE）、MGK-540 Skat-3（Russia，PROBABLE）、Type 093 Sonar (公开型号未知)（China，UNKNOWN）、Arihant Sonar (公开型号未知)（India，UNKNOWN） |
| T7 | Bow Array with Flank Integration | 艇艏/侧阵综合 | 游戏扩展 | — |
| T8 | Distributed Bow Aperture | 分布式艇艏孔径 | 游戏扩展 | — |
| T9 | Bow Multi-Array Fusion | 艇艏多阵融合 | 游戏扩展 | Sonar 2076（UK，PROBABLE）、MGK-600 Irtysh-Amfora（Russia，PROBABLE） |
| T10 | Next Generation Bow Aperture System | 下一代艇艏孔径系统 | 游戏扩展 | — |

## 侧阵（FLANK）

沿艇体两舷布置的被动孔径，长基线带来优于艇艏阵的测向精度。

插槽：`SOCKET_SONAR_FLANK_L`、`SOCKET_SONAR_FLANK_R`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Experimental Flank Hydrophone | 试验性侧舷水听器 | 游戏扩展 | — |
| T2 | Early Flank Array | 早期侧阵 | 任务书 | — |
| T3 | Improved Flank Array | 改进型侧阵 | 游戏扩展 | — |
| T4 | Modern Flank Array | 现代侧阵 | 任务书 | — |
| T5 | Large Flank Aperture | 大型侧舷孔径 | 游戏扩展 | — |
| T6 | Conformal Flank Array | 共形侧阵 | 任务书 | — |
| T7 | Distributed Flank Array | 分布式侧阵 | 游戏扩展 | — |
| T8 | Integrated Flank Array | 综合侧阵 | 任务书 | — |
| T9 | Flank and Towed Fusion | 侧阵与拖曳阵融合 | 游戏扩展 | — |
| T10 | Next Generation Flank Aperture | 下一代侧舷孔径 | 游戏扩展 | — |

## 拖曳阵（TOWED）

拖曳线列阵分支。只表现公开可见的外形与接口，不制作真实内部结构。

插槽：`SOCKET_TOWED_ARRAY`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Towed Array Housing | 拖曳阵收放舱 | 游戏扩展 | — |
| T2 | Legacy Towed Array | 早期拖曳阵 | 任务书 | TB-16 Tactical Towed Array（USA，PROBABLE） |
| T3 | Improved Towed Array | 改进型拖曳阵 | 游戏扩展 | — |
| T4 | Modern Towed Array | 现代拖曳阵 | 任务书 | — |
| T5 | Thin-Line Towed Array | 细线拖曳阵 | 游戏扩展 | — |
| T6 | Low Frequency Towed Array | 低频拖曳阵 | 任务书 | TB-29 Thin Line Towed Array（USA，CONFIRMED）、Pelamida Towed Array（Russia，UNKNOWN） |
| T7 | Wide Aperture Towed Array | 宽孔径拖曳阵 | 游戏扩展 | — |
| T8 | Advanced Towed Array | 先进拖曳阵 | 任务书 | — |
| T9 | Distributed Towed and Hull Fusion | 拖曳阵与艇壳融合 | 游戏扩展 | — |
| T10 | Next Generation Towed System | 下一代拖曳系统 | 游戏扩展 | — |

## 高频声呐（HF）

高频、近距离声呐分支，覆盖探雷、导航、冰下与近程测距。

插槽：`SOCKET_SONAR_BOW`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Early High Frequency Sonar | 早期高频声呐 | 游戏扩展 | — |
| T2 | Improved High Frequency Sonar | 改进型高频声呐 | 游戏扩展 | — |
| T3 | Hull-Mounted High Frequency Sonar | 艇壳高频声呐 | 游戏扩展 | — |
| T4 | Mine Detection Sonar | 探雷声呐 | 任务书 | — |
| T5 | Navigation Sonar | 导航声呐 | 任务书 | — |
| T6 | Under-Ice Sonar | 冰下声呐 | 任务书 | AN/BQS-15（USA，PROBABLE） |
| T7 | Close Range High Frequency Sonar | 近程高频声呐 | 任务书 | — |
| T8 | Forward-Looking High Frequency Array | 前视高频阵 | 游戏扩展 | — |
| T9 | Multi-Function High Frequency Suite | 多功能高频套件 | 游戏扩展 | — |
| T10 | Next Generation High Frequency System | 下一代高频系统 | 游戏扩展 | — |

## 探雷声呐（MINE）

水雷规避与探雷分支，强调近距离高分辨率成像与分类。

插槽：`SOCKET_SONAR_BOW`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Visual Mine Watch | 目视水雷警戒 | 游戏扩展 | — |
| T2 | Early Mine Detection Sonar | 早期探雷声呐 | 游戏扩展 | — |
| T3 | Hull Mine Detection Sonar | 艇壳探雷声呐 | 游戏扩展 | — |
| T4 | High Resolution Mine Sonar | 高分辨率探雷声呐 | 游戏扩展 | — |
| T5 | Forward-Looking Mine Sonar | 前视探雷声呐 | 游戏扩展 | — |
| T6 | Wideband Mine Classification | 宽带水雷分类 | 游戏扩展 | — |
| T7 | Synthetic Aperture Mine Sonar | 合成孔径探雷声呐 | 游戏扩展 | — |
| T8 | Autonomous Mine Detection | 自主探雷 | 游戏扩展 | — |
| T9 | Mine and Navigation Fusion | 探雷/导航融合 | 游戏扩展 | — |
| T10 | Next Generation Mine Detection | 下一代探雷系统 | 游戏扩展 | — |

## 导航声呐（NAV）

艇用导航声呐分支：测深、测速、冰下导航与导航融合。

插槽：`SOCKET_SONAR_BOW`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Echo Sounder | 测深仪 | 游戏扩展 | — |
| T2 | Improved Echo Sounder | 改进型测深仪 | 游戏扩展 | — |
| T3 | Navigation Sonar | 导航声呐 | 游戏扩展 | — |
| T4 | Doppler Velocity Log | 多普勒测速仪 | 游戏扩展 | — |
| T5 | Under-Ice Navigation Sonar | 冰下导航声呐 | 游戏扩展 | — |
| T6 | Navigation and Mine Avoidance | 导航与避雷综合 | 游戏扩展 | — |
| T7 | Digital Navigation Suite | 数字化导航套件 | 游戏扩展 | — |
| T8 | Terrain-Aided Navigation | 地形辅助导航 | 游戏扩展 | — |
| T9 | Navigation Fusion | 组合导航融合 | 游戏扩展 | — |
| T10 | Next Generation Navigation System | 下一代导航系统 | 游戏扩展 | — |

## 潜望镜与光电桅杆（PHOTONICS）

潜望镜 → 光电桅杆分支（任务书 §11）。

插槽：`SOCKET_PERISCOPE`、`SOCKET_PHOTONICS_MAST`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Optical Periscope | 光学潜望镜 | 任务书 | — |
| T2 | Improved Periscope | 改进型潜望镜 | 任务书 | — |
| T3 | Attack Periscope | 攻击潜望镜 | 任务书 | — |
| T4 | Electronic Periscope | 电子潜望镜 | 任务书 | — |
| T5 | Optronic Periscope | 光电潜望镜 | 游戏扩展 | — |
| T6 | Photonics Mast | 光电桅杆 | 任务书 | Virginia-class Photonics Mast（USA，CONFIRMED） |
| T7 | Advanced Photonics Mast | 先进光电桅杆 | 任务书 | CM010 Optronic Mast（UK，CONFIRMED） |
| T8 | Multi-Sensor Mast | 多传感器桅杆 | 游戏扩展 | — |
| T9 | Integrated Mast Suite | 综合桅杆套件 | 游戏扩展 | — |
| T10 | Next Generation Mast System | 下一代桅杆系统 | 游戏扩展 | — |

## 光电/红外（EOIR）

光电与红外传感器分支，定位为传感器系统而非武器（任务书 §12）。

插槽：`SOCKET_PHOTONICS_MAST`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Electro Optical | 光电观瞄 | 任务书 | — |
| T2 | Infrared | 红外 | 任务书 | — |
| T3 | Digital Camera | 数字相机 | 任务书 | — |
| T4 | Low Light | 微光 | 任务书 | — |
| T5 | Thermal | 热成像 | 任务书 | — |
| T6 | Integrated EO/IR | 综合光电/红外 | 任务书 | — |
| T7 | High Definition EO/IR | 高清光电/红外 | 游戏扩展 | — |
| T8 | Multi-Spectral EO/IR | 多光谱光电/红外 | 游戏扩展 | — |
| T9 | EO/IR Mast Fusion | 光电/桅杆融合 | 游戏扩展 | — |
| T10 | Next Generation EO/IR | 下一代光电/红外 | 游戏扩展 | — |

## 潜艇雷达（RADAR）

只记录潜艇使用的公开雷达分支，不复制水面舰艇雷达树（任务书 §13）。

插槽：`SOCKET_RADAR`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Early Surface Search Radar | 早期对海搜索雷达 | 游戏扩展 | — |
| T2 | Improved Surface Search Radar | 改进型对海搜索雷达 | 游戏扩展 | — |
| T3 | Navigation Radar | 导航雷达 | 任务书 | — |
| T4 | Periscope Radar | 潜望镜雷达 | 任务书 | MRK-50 Albatross（Russia，PROBABLE） |
| T5 | Mast Radar | 桅杆雷达 | 任务书 | AN/BPS-15/16 Radar（USA，CONFIRMED） |
| T6 | Frequency Agile Surface Search | 频率捷变对海搜索 | 游戏扩展 | — |
| T7 | Low Probability of Intercept Radar | 低截获概率雷达 | 游戏扩展 | — |
| T8 | Digital Mast Radar | 数字化桅杆雷达 | 游戏扩展 | — |
| T9 | Radar and ESM Fusion | 雷达/电子支援融合 | 游戏扩展 | — |
| T10 | Next Generation Submarine Radar | 下一代潜艇雷达 | 游戏扩展 | — |

## 电子支援措施（ESM）

电子支援措施分支：探测、测向、分类与态势感知；电子攻击属于电子战树，不在此处（任务书 §14）。

插槽：`SOCKET_ESM`

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Basic Signal Detection | 基础信号探测 | 游戏扩展 | — |
| T2 | Improved Signal Detection | 改进型信号探测 | 游戏扩展 | — |
| T3 | Radar Warning Receiver | 雷达告警接收机 | 游戏扩展 | — |
| T4 | Direction Finding | 测向 | 游戏扩展 | — |
| T5 | Classification Library | 信号分类库 | 游戏扩展 | — |
| T6 | Modern ESM | 现代电子支援措施 | 游戏扩展 | Rim Hat ESM（Russia，PROBABLE） |
| T7 | Digital ESM | 数字电子支援措施 | 游戏扩展 | AN/BLQ-10(V) Submarine EW Support System（USA，CONFIRMED） |
| T8 | Wideband ESM | 宽带电子支援措施 | 游戏扩展 | — |
| T9 | ESM and EO/IR Fusion | 电子支援/光电融合 | 游戏扩展 | — |
| T10 | Next Generation ESM | 下一代电子支援措施 | 游戏扩展 | — |

## 声学处理（PROCESSING）

声呐科技树的软件层分支（任务书 §15）。AI 仅作为游戏科技树概念，不声称对应任何现实系统。

插槽：无（软件层）

| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |
| --- | --- | --- | --- | --- |
| T1 | Basic Processing | 基础处理 | 任务书 | — |
| T2 | Analog Processing | 模拟处理 | 游戏扩展 | — |
| T3 | Digital Processing | 数字处理 | 任务书 | — |
| T4 | Integrated Processing | 综合处理 | 任务书 | — |
| T5 | Advanced Beamforming | 先进波束形成 | 任务书 | — |
| T6 | Broadband Processing | 宽带处理 | 游戏扩展 | — |
| T7 | Multi-Array Fusion | 多阵融合 | 任务书 | — |
| T8 | Adaptive Processing | 自适应处理 | 游戏扩展 | — |
| T9 | AI-Assisted Acoustic Processing | AI 辅助声学处理 | 任务书 | — |
| T10 | Next Generation Acoustic Processing | 下一代声学处理 | 游戏扩展 | — |

## 覆盖统计

- 分支：13
- 层级节点：130
- 数据库条目：150
- 其中现实候选：20
- 其中游戏科技树件：130

> 本科技树是**游戏科技树**，不是现实军事技术等级。
