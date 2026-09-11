# SilentDepth 潜艇资产模板

版本：v1.1.0
来源：RU_SSBN_Typhoon 审计结果、现有 UE4.27 导出包，以及潜艇模块化资产计划第一阶段。

本模板是生产契约，不是完成的潜艇网格。它定义目录结构、命名、材质、LOD、碰撞、逻辑 Socket、Assembly JSON、验证和 UE4.27 导出设置。

关键文件：

- `SilentDepth_Submarine_Asset_Template.json`：潜艇资产目录、语义分组和导出规则模板。
- `SilentDepth_Submarine_Validation_Rules.json`：COMPLETE 状态资产必须满足的文件与质量门。
- `submarine_assembly.schema.json`：潜艇模块化 Assembly JSON Schema。
- `submarine_assembly.template.json`：可复制的 Assembly JSON 起点。
- `Examples/Minimal/Documentation/TEMPLATE_SUB_MINIMAL_ASSEMBLY.json`：最小可动件示例。
- `Examples/Complete/Documentation/TEMPLATE_SUB_COMPLETE_ASSEMBLY.json`：完整活动件与 Socket 示例。

示例文件中的坐标、角度、可见距离和对象名全部是模板值，不能当作 Akula、Yasen、Typhoon 或任何真实艇型的测量数据。鱼雷和导弹本体属于独立武器资产；潜艇 Assembly 只声明舱盖、浅层门框语义和 Muzzle Socket。

Assembly JSON 的正式入口同时执行 Draft 2020-12 Schema 和 TypeScript 跨字段校验。`assetId` 必须匹配 Hull LOD 文件名、Part `exportName` 前缀和碰撞 FBX 文件名；Hull 独立碰撞文件必须严格命名为 `Collision/[ASSET_ID]_COLLISION.fbx`；Part `exportName` 必须唯一。Hull collision 的 `separate_fbx` 必须声明 `path`，`ucx_embedded` 必须声明 `sourceObjects` 且不得声明独立 `path`，`simple_convex` 不得声明 `path/sourceObjects`。Part collision 的 `sourceObjects` 只允许在 `part/owned_ucx` 组合中声明，`none/none`、`hull/inherit_hull` 和 `part/simple_convex` 都不得携带独立碰撞源对象。

Typhoon 源文件仍受保护：`/Users/sjw/Documents/BlenderProjects/Typhoon_UE427_20260908/Typhoon_UE427.blend`。生成资产必须从 `SilentDepth_Assets` 下的工作副本开始。
