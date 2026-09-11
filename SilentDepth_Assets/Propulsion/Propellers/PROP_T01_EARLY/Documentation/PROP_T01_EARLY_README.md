# PROP_T01_EARLY — T1 早期双叶螺旋桨（通用科技树件）

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T1 · 时代：1940s-1950s

技术路线：early plain propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：只表达早期少叶、无后掠的推进器世代，不代表任何具体艇级。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 1728 | 872 | 3.245 × 3.2 × 0.7332 |
| LOD1 | 944 | 480 | 3.245 × 3.2 × 0.7213 |
| LOD2 | 464 | 240 | 3.245 × 3.2 × 0.7332 |
| LOD3 | 216 | 116 | 3.245 × 3.2 × 0.72 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `PROP_T01_EARLY_ThreeQuarter.png`（ThreeQuarter，非背景像素 36.6%）
- `PROP_T01_EARLY_Side.png`（Side，非背景像素 22.3%）
- `PROP_T01_EARLY_Rear.png`（Rear，非背景像素 35.9%）
- `PROP_T01_EARLY_Top.png`（Top，非背景像素 20.8%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
