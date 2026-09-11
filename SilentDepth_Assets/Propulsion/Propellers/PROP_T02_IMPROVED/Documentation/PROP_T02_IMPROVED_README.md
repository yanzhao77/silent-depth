# PROP_T02_IMPROVED — T2 改进型三叶螺旋桨（通用科技树件）

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T2 · 时代：1950s

技术路线：improved plain propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：表达桨叶型线改进与轻微后掠，不代表任何具体艇级。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 2448 | 1234 | 3.74 × 2.9546 × 3.2164 |
| LOD1 | 1296 | 658 | 3.74 × 2.9546 × 3.2164 |
| LOD2 | 624 | 322 | 3.74 × 2.9546 × 3.2164 |
| LOD3 | 276 | 148 | 3.74 × 2.9546 × 3.2164 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `PROP_T02_IMPROVED_ThreeQuarter.png`（ThreeQuarter，非背景像素 34.3%）
- `PROP_T02_IMPROVED_Side.png`（Side，非背景像素 20.4%）
- `PROP_T02_IMPROVED_Rear.png`（Rear，非背景像素 34.1%）
- `PROP_T02_IMPROVED_Top.png`（Top，非背景像素 19.2%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
