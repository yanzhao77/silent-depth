# SHAFT_GEARED — 齿轮减速轴系

分类：`Shafts` · 类型：`SHAFT` · 科技层级：T5 · 时代：1960s-1970s

技术路线：geared shaft

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
齿轮传动轴系是公开技术路线，尺寸为游戏美术取值。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 576 | 324 | 7.5 × 1.6 × 1.6 |
| LOD1 | 288 | 164 | 7.5 × 1.6 × 1.6 |
| LOD2 | 144 | 84 | 7.5 × 1.6 × 1.6 |
| LOD3 | 72 | 44 | 7.5 × 1.6 × 1.6 |

## 插槽

`SOCKET_SHAFT`

## 预览

- `SHAFT_GEARED_ThreeQuarter.png`（ThreeQuarter，非背景像素 6.5%）
- `SHAFT_GEARED_Side.png`（Side，非背景像素 8.4%）
- `SHAFT_GEARED_Rear.png`（Rear，非背景像素 3.0%）
- `SHAFT_GEARED_Top.png`（Top，非背景像素 7.4%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
