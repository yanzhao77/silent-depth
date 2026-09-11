# PROP_T05_QUIET — T5 高后掠静音螺旋桨（通用科技树件）

分类：`Propellers` · 类型：`PROPELLER` · 科技层级：T5 · 时代：1970s

技术路线：advanced quiet propeller

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：T5 表达高后掠 + 多叶 + 薄叶型的综合降噪设计成熟度。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 5328 | 2682 | 5.225 × 4.5457 × 4.4772 |
| LOD1 | 2704 | 1370 | 5.225 × 4.5457 × 4.4772 |
| LOD2 | 1264 | 650 | 5.225 × 4.5457 × 4.4772 |
| LOD3 | 516 | 276 | 5.225 × 4.5457 × 4.4772 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`

## 预览

- `PROP_T05_QUIET_ThreeQuarter.png`（ThreeQuarter，非背景像素 24.2%）
- `PROP_T05_QUIET_Side.png`（Side，非背景像素 16.4%）
- `PROP_T05_QUIET_Rear.png`（Rear，非背景像素 28.2%）
- `PROP_T05_QUIET_Top.png`（Top，非背景像素 15.6%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
