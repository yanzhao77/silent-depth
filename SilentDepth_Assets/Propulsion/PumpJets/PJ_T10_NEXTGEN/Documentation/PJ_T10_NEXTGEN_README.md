# PJ_T10_NEXTGEN — T10 下一代泵喷推进器（通用科技树件）

分类：`PumpJets` · 类型：`PUMPJET` · 科技层级：T10 · 时代：2020s+

技术路线：next generation integrated propulsor

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`GAME_ART_SPEC`。
通用科技树件：T10 表达集成式下一代推进器概念（无外露轴系），不代表任何在研型号。

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
| LOD0 | 16800 | 8446 | 5.076 × 6.1 × 6.1 |
| LOD1 | 8480 | 4286 | 5.076 × 6.1 × 6.1 |
| LOD2 | 4000 | 2046 | 5.076 × 6.1 × 6.1 |
| LOD3 | 1672 | 882 | 5.076 × 6.1 × 6.1 |

## 插槽

`SOCKET_PROPULSOR`, `SOCKET_SHAFT`, `SOCKET_PUMPJET`

## 预览

- `PJ_T10_NEXTGEN_ThreeQuarter.png`（ThreeQuarter，非背景像素 45.3%）
- `PJ_T10_NEXTGEN_Side.png`（Side，非背景像素 42.5%）
- `PJ_T10_NEXTGEN_Rear.png`（Rear，非背景像素 42.5%）
- `PJ_T10_NEXTGEN_Top.png`（Top，非背景像素 41.5%）

## 已知限制

- 程序化生成的推进器外形成像，不是任何具体艇号的实测复制。
- 未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。
- 叶片数量与几何参数的游戏取值不属于公开事实声明。
