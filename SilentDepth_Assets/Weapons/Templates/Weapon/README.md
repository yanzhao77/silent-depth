# SilentDepth Weapon Asset Template

版本：v1.0.0
生成时间：2026-09-10

本模板是**生产契约**，不是某个具体武器的模型。它规定武器资产的集合层级、部件命名、
共享材质、LOD 策略、碰撞命名、预览规范与 UE4.27 导出参数。

实际几何由 `Weapons/Tools/weapon_factory_blender.py` 依据 `Weapons/Tools/weapon_dataset.py`
中每个变体声明的公开外形参数生成，绝不复制其它武器的几何。

| 文件 | 内容 |
| --- | --- |
| `SilentDepth_Weapon_Asset_Template.blend` | 标准集合与材质库（占位参考件不参与导出） |
| `SilentDepth_Weapon_Asset_Template.json` | 命名、集合、材质、LOD、碰撞、导出契约 |
| `SilentDepth_Weapon_Validation_Rules.json` | 完成度与质量门槛 |
| `SilentDepth_Weapon_Export_Preset.json` | UE4.27 FBX 导出参数 |

> 武器资产只包含公开资料可见的外部外形与游戏数据，不含任何武器内部工程、装药或制造信息。
