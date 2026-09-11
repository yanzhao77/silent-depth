# SHAFT_FAIRING_LONG — 长轴包（Typhoon 实测）

分类：`Shafts` · 类型：`SHAFT` · 科技层级：T8 · 时代：1980s

技术路线：direct shaft with long fairing

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`MEASURED`。
尺寸来自 Typhoon 母版 Shaft_Fairing 实测（12.100 × 4.800 × 4.800 m）。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 448 | 258 | 12.1 × 4.8 × 4.8 |
| LOD1 | 224 | 130 | 12.1 × 4.8 × 4.8 |
| LOD2 | 112 | 66 | 12.1 × 4.8 × 4.8 |
| LOD3 | 56 | 34 | 12.1 × 4.8 × 4.8 |

## 插槽

`SOCKET_SHAFT`

## 预览

- `SHAFT_FAIRING_LONG_ThreeQuarter.png`（ThreeQuarter，非背景像素 16.9%）
- `SHAFT_FAIRING_LONG_Side.png`（Side，非背景像素 18.6%）
- `SHAFT_FAIRING_LONG_Rear.png`（Rear，非背景像素 8.6%）
- `SHAFT_FAIRING_LONG_Top.png`（Top，非背景像素 17.9%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
