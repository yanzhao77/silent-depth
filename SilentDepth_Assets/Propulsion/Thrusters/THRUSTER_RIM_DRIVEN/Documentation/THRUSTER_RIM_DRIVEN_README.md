# THRUSTER_RIM_DRIVEN — 轮缘驱动环形推进器

分类：`Thrusters` · 类型：`THRUSTER` · 科技层级：T10 · 时代：2020s+

技术路线：rim-driven thruster

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
轮缘驱动是公开的技术方向，用于 T10 世代表达，几何为游戏美术取值。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 6832 | 3436 | 0.55 × 1.62 × 1.62 |
| LOD1 | 3440 | 1740 | 0.55 × 1.62 × 1.62 |
| LOD2 | 1616 | 828 | 0.55 × 1.62 × 1.62 |
| LOD3 | 668 | 354 | 0.55 × 1.62 × 1.62 |

## 插槽

`SOCKET_THRUSTER`

## 预览

- `THRUSTER_RIM_DRIVEN_ThreeQuarter.png`（ThreeQuarter，非背景像素 45.0%）
- `THRUSTER_RIM_DRIVEN_Side.png`（Side，非背景像素 31.9%）
- `THRUSTER_RIM_DRIVEN_Rear.png`（Rear，非背景像素 40.1%）
- `THRUSTER_RIM_DRIVEN_Top.png`（Top，非背景像素 34.6%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
