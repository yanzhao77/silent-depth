# RU_PROP_Typhoon — Typhoon / Project 941 七叶导管螺旋桨

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T8 · 时代：1980s

技术路线：shrouded skewed propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`MEASURED`。
桨盘直径 5.88 m、导管外径 7.0 m 与枢轴取自 Typhoon 母版实测；七叶为公开资料报道的构型。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 5584 | 2810 | 7.995 × 7.0 × 7.0 |
| LOD1 | 2896 | 1466 | 7.995 × 7.0 × 7.0 |
| LOD2 | 1392 | 714 | 7.995 × 7.0 × 7.0 |
| LOD3 | 612 | 324 | 7.995 × 7.0 × 7.0 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `RU_PROP_Typhoon_ThreeQuarter.png`（ThreeQuarter，非背景像素 31.7%）
- `RU_PROP_Typhoon_Side.png`（Side，非背景像素 23.9%）
- `RU_PROP_Typhoon_Rear.png`（Rear，非背景像素 31.1%）
- `RU_PROP_Typhoon_Top.png`（Top，非背景像素 23.6%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
