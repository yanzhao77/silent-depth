# ThreatWarning 目录说明

本目录在需求第 11 节的目录结构里是必须存在的，但**当前没有独立的 3D 资产**。
原因是公开资料只能支撑身份级描述，还没有到可以负责任地建几何体的程度：

| 家族 | 层级 | 归属 | 说明 |
| --- | --- | --- | --- |
| `TW-RADAR-WARNING` | T1-T4 | DATABASE_ONLY | 候选型号 AN/WLR-9 经核验属于**声学截获接收机**，不属于雷达告警，因此本家族没有公开锚定型号 |
| `TW-ELECTRONIC-WARNING` | T3-T6 | DATABASE_ONLY | 只在 ESM 家族层面有公开描述，没有独立硬件外形依据 |
| `TW-ACTIVE-SONAR-WARNING` | T4-T7 | 复用 `TorpedoDefense/GEN_TW_TORPEDO_WARNING_SENSOR` | 锚定 AN/WLR-9（声学截获接收机，PROBABLE） |
| `TW-TORPEDO-WARNING` | T5-T9 | 复用 `TorpedoDefense/GEN_TW_TORPEDO_WARNING_SENSOR` | 与鱼雷防御分支共用同一传感器资产 |
| `TW-ACOUSTIC-CLASSIFICATION` | T6-T10 | 复用 `TorpedoDefense/GEN_TW_TORPEDO_WARNING_SENSOR` | 锚定 WLR 系列（PROBABLE） |

按需求第 27 节「DATABASE ONLY」原则，查不到可靠公开资料的家族登记为数据条目，
不为它们伪造几何体。家族与变体的完整定义见
`../Manifest/defensive_system_family.json`，平台兼容性见
`../Manifest/submarine_defensive_compatibility.json`。
