# SHAFT_PLAIN — 直轴（基础世代）

分类：`Shafts` · 类型：`SHAFT` · 科技层级：T2 · 时代：1950s

技术路线：direct shaft

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用轴系是游戏科技树的基础件，不代表任何具体艇级。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 256 | 132 | 6.0 × 0.72 × 0.72 |
| LOD1 | 128 | 68 | 6.0 × 0.72 × 0.72 |
| LOD2 | 64 | 36 | 6.0 × 0.72 × 0.72 |
| LOD3 | 32 | 20 | 6.0 × 0.72 × 0.72 |

## 插槽

`SOCKET_SHAFT`

## 预览

- `SHAFT_PLAIN_ThreeQuarter.png`（ThreeQuarter，非背景像素 3.6%）
- `SHAFT_PLAIN_Side.png`（Side，非背景像素 5.1%）
- `SHAFT_PLAIN_Rear.png`（Rear，非背景像素 1.9%）
- `SHAFT_PLAIN_Top.png`（Top，非背景像素 4.3%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
