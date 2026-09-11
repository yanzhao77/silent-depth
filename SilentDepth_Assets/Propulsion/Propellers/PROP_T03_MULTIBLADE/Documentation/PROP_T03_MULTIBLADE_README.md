# PROP_T03_MULTIBLADE — T3 多叶螺旋桨（通用科技树件）

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T3 · 时代：1960s

技术路线：multi-blade propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：T3 表达叶片数量增加与桨盘载荷下降，叶片数本身不等于更高 Tier。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 3168 | 1596 | 4.235 × 3.9662 × 3.9662 |
| LOD1 | 1648 | 836 | 4.235 × 3.9662 × 3.9662 |
| LOD2 | 784 | 404 | 4.235 × 3.9662 × 3.9662 |
| LOD3 | 336 | 180 | 4.235 × 3.9662 × 3.9662 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `PROP_T03_MULTIBLADE_ThreeQuarter.png`（ThreeQuarter，非背景像素 32.7%）
- `PROP_T03_MULTIBLADE_Side.png`（Side，非背景像素 19.1%）
- `PROP_T03_MULTIBLADE_Rear.png`（Rear，非背景像素 32.8%）
- `PROP_T03_MULTIBLADE_Top.png`（Top，非背景像素 18.0%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
