# RU_PJ_Yasen — Yasen / Project 885 泵喷推进器

分类：`PumpJets` · 类型：`PUMPJET` · 科技层级：T9 · 时代：2010s

技术路线：pump-jet propulsor

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
泵喷构型为公开报道；几何为游戏美术取值。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 12576 | 6324 | 6.025 × 5.9 × 5.9 |
| LOD1 | 6448 | 3260 | 6.025 × 5.9 × 5.9 |
| LOD2 | 3088 | 1580 | 6.025 × 5.9 × 5.9 |
| LOD3 | 1344 | 708 | 6.025 × 5.9 × 5.9 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`, `SOCKET_PUMPJET`

## 预览

- `RU_PJ_Yasen_ThreeQuarter.png`（ThreeQuarter，非背景像素 42.5%）
- `RU_PJ_Yasen_Side.png`（Side，非背景像素 39.2%）
- `RU_PJ_Yasen_Rear.png`（Rear，非背景像素 40.3%）
- `RU_PJ_Yasen_Top.png`（Top，非背景像素 38.1%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
