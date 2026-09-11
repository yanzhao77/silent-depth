# CN_PROP_Type093 — Type 093 七叶后掠螺旋桨

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T7 · 时代：2000s

技术路线：skewed propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
公开可确认信息有限，叶片数量与几何为游戏美术取值，研究条目中标记为 UNKNOWN。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 5328 | 2682 | 5.3775 × 4.3041 × 4.3406 |
| LOD1 | 2704 | 1370 | 5.3775 × 4.3041 × 4.3406 |
| LOD2 | 1264 | 650 | 5.3775 × 4.3041 × 4.3406 |
| LOD3 | 516 | 276 | 5.3775 × 4.3041 × 4.3406 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `CN_PROP_Type093_ThreeQuarter.png`（ThreeQuarter，非背景像素 20.7%）
- `CN_PROP_Type093_Side.png`（Side，非背景像素 14.5%）
- `CN_PROP_Type093_Rear.png`（Rear，非背景像素 24.3%）
- `CN_PROP_Type093_Top.png`（Top，非背景像素 13.7%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
