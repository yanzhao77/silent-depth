# THRUSTER_TUNNEL — 隧道式侧推器

分类：`Thrusters` · 类型：`THRUSTER` · 科技层级：T6 · 时代：1970s-1990s

技术路线：tunnel thruster

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
隧道侧推是公开技术路线，具体几何为游戏美术取值。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 4048 | 2038 | 1.44 × 1.9 × 1.9 |
| LOD1 | 2112 | 1070 | 1.44 × 1.9 × 1.9 |
| LOD2 | 1024 | 526 | 1.44 × 1.9 × 1.9 |
| LOD3 | 460 | 244 | 1.44 × 1.9 × 1.9 |

## 插槽

`SOCKET_THRUSTER`

## 预览

- `THRUSTER_TUNNEL_ThreeQuarter.png`（ThreeQuarter，非背景像素 49.8%）
- `THRUSTER_TUNNEL_Side.png`（Side，非背景像素 43.0%）
- `THRUSTER_TUNNEL_Rear.png`（Rear，非背景像素 43.1%）
- `THRUSTER_TUNNEL_Top.png`（Top，非背景像素 42.5%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
