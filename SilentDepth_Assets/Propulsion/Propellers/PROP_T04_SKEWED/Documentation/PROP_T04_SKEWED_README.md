# PROP_T04_SKEWED — T4 后掠螺旋桨（通用科技树件）

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T4 · 时代：1960s-1970s

技术路线：skewed propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：T4 的关键是后掠（skew）降噪概念，而不是叶片数量。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 3888 | 1958 | 4.73 × 4.1343 × 4.1115 |
| LOD1 | 2000 | 1014 | 4.73 × 4.1343 × 4.1115 |
| LOD2 | 944 | 486 | 4.73 × 4.1343 × 4.1115 |
| LOD3 | 396 | 212 | 4.73 × 4.1343 × 4.1115 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `PROP_T04_SKEWED_ThreeQuarter.png`（ThreeQuarter，非背景像素 28.7%）
- `PROP_T04_SKEWED_Side.png`（Side，非背景像素 17.7%）
- `PROP_T04_SKEWED_Rear.png`（Rear，非背景像素 30.3%）
- `PROP_T04_SKEWED_Top.png`（Top，非背景像素 16.7%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
