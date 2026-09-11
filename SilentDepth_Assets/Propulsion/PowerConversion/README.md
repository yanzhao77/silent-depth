# PowerConversion（能量转换）— DATABASE_ONLY

本目录不产出 3D 资产，只维护公开技术路线条目：

| route_id | 公开名称 | 说明 |
| --- | --- | --- |
| `PC_STEAM_TURBINE` | Steam Turbine | 反应堆蒸汽直接驱动推进汽轮机 |
| `PC_TURBO_ELECTRIC` | Turbo-electric | 汽轮机带动发电机，再由电动机驱动轴系 |
| `PC_ELECTRIC_DRIVE` | Electric Drive | 以电力传递推进能量，减少机械齿轮 |
| `PC_INTEGRATED_ELECTRIC_PROPULSION` | Integrated Electric Propulsion | 推进与全舰用电统一在同一电力系统 |

数据来源：`../Documentation/research/powerplant_research.json` 的 `power_conversion_routes`。
分支在 `../TechnologyTree/propulsion_technology_tree.json` 的 `BRANCH_POWER_CONVERSION` 里展开为 T1–T10。

本目录不记录任何功率、效率或参数数值。
