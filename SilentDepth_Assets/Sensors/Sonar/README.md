# 声呐总说明与类别映射

任务书 §3 列出 20 个传感器类别，§25 定义 13 个科技树分支。二者是**同一批设备的两种切分方式**：
类别回答「这是什么设备」，分支回答「它挂在科技树的哪个位置」。本资产库按**分支**建目录，
映射关系如下，避免同一个设备出现两套互相竞争的目录结构。

| §3 类别 | 归属分支 | 说明 |
| --- | --- | --- |
| `BowSonar` | `BOW` | 艇艏孔径结构 |
| `CylindricalArray` | `BOW` | 柱形艇艏阵，属艇艏分支的层级件 |
| `SphericalArray` | `BOW` | 球形艇艏阵 |
| `ConformalArray` | `BOW` / `FLANK` | 按安装位置归入艇艏或侧阵 |
| `FlankArray` | `FLANK` | 侧阵 |
| `TowedArray` | `TOWED` | 拖曳阵 |
| `ActiveSonar` | `ACTIVE` | 主动声呐 |
| `PassiveSonar` | `PASSIVE` | 被动声呐 |
| `HighFrequencySonar` | `HF` | 高频声呐 |
| `UnderIceSonar` | `HF` | 冰下声呐属高频分支的 T6 层级 |
| `MineDetection` | `MINE` | 探雷声呐（独立分支） |
| `NavigationSonar` | `NAV` | 导航声呐 |
| `Navigation` | `NAV` | 与导航声呐同一分支 |
| `AcousticProcessing` | `PROCESSING` | 声学处理软件层 |
| `Environmental` | `PROCESSING` | 环境声学处理，属处理分支的子类 |
| `Periscope` | `PHOTONICS` | 潜望镜分支 |
| `PhotonicsMast` | `PHOTONICS` | 光电桅杆分支 |
| `EOIR` | `EOIR` | 光电/红外（传感器系统，不是武器） |
| `Radar` | `RADAR` | 潜艇雷达 |
| `ESM` | `ESM` | 电子支援措施（电子攻击属于电子战树，不在此处） |

## 为什么没有为每个类别单独建目录

任务书 §25 的最终结构以 13 个分支为权威，§22 的目录清单与之基本一致。若同时为 20 个类别
建目录，同一个球形艇艏阵会同时属于 `Sonar/`、`Bow/`、`SphericalArray/` 三处，产生重复与
漂移风险。因此本库采用「分支为唯一归档维度，类别作为 `category` / `sub_category` 字段保留」，
并在本文件给出完整映射。
