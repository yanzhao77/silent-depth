# US_PROP_LosAngeles — Los Angeles 级高后掠七叶螺旋桨

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T6 · 时代：1970s-1990s

技术路线：highly skewed propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
高后掠多叶桨是公开报道的降噪路线；几何参数为游戏美术取值。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 5328 | 2682 | 6.12 × 4.8465 × 4.7357 |
| LOD1 | 2704 | 1370 | 6.12 × 4.8465 × 4.7357 |
| LOD2 | 1264 | 650 | 6.12 × 4.8465 × 4.7357 |
| LOD3 | 516 | 276 | 6.12 × 4.8465 × 4.7357 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `US_PROP_LosAngeles_ThreeQuarter.png`（ThreeQuarter，非背景像素 18.7%）
- `US_PROP_LosAngeles_Side.png`（Side，非背景像素 11.9%）
- `US_PROP_LosAngeles_Rear.png`（Rear，非背景像素 23.1%）
- `US_PROP_LosAngeles_Top.png`（Top，非背景像素 13.0%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
