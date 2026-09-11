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

## Blender 只读审计器

`Scripts/submarine_blender_audit_cli.mjs` 是 P2 阶段的通用潜艇 MASTER 审计入口。它用于读取 Blender MASTER 的场景库存、外部依赖、Mesh 质量问题、潜在 Pivot/Socket 候选项，以及在真实 Assembly JSON 存在时执行对象归属、Hull 排他和 Anchor 引用检查。本工具只做审计，不修改几何、材质、Collection、Pivot、Socket，不导出 FBX/GLB，也不修改 UE4 项目。

只读保证：CLI 在启动 Blender 前后分别记录 MASTER 的 SHA-256、文件大小和修改时间；Blender worker 只在后台打开传入的 `.blend`，不调用 `bpy.ops.wm.save_mainfile` 或 `bpy.ops.wm.save_as_mainfile`。如果审计前后任一指纹变化，报告写入 `ERROR`，并以失败退出。调试和测试 fixture 只能写入临时目录或显式 `--output` 路径，不能写回 MASTER 目录旁的 `.blend1` 或自动保存文件。

Blender 要求：指定版本为 Blender 5.2.1 LTS。默认路径是 `/Applications/Blender.app/Contents/MacOS/Blender`，也可以用 `--blender` 覆盖。版本不是 5.2.1 时，不应静默改用其他版本；只能运行不依赖 Blender 的纯逻辑测试，并把 Blender 集成验证标记为 `NOT VERIFIED`。

命令示例：

```bash
node --experimental-strip-types SilentDepth_Assets/Templates/Submarine/Scripts/submarine_blender_audit_cli.mjs \
  --master /Users/sjw/Documents/GitHub/silent-depth/SilentDepth_Assets/Submarines/SSN/Russia/Yasen/Blend/RU_SSN_Yasen_MASTER.blend \
  --output /Users/sjw/Documents/GitHub/silent-depth/SilentDepth_Assets/Submarines/SSN/Russia/Yasen/Validation/RU_SSN_Yasen_MASTER_AUDIT.json \
  --summary-output /Users/sjw/Documents/GitHub/silent-depth/SilentDepth_Assets/Submarines/SSN/Russia/Yasen/Validation/RU_SSN_Yasen_MASTER_AUDIT.md \
  --inventory-only
```

完整 Assembly 审计示例：

```bash
node --experimental-strip-types SilentDepth_Assets/Templates/Submarine/Scripts/submarine_blender_audit_cli.mjs \
  --master /abs/path/RU_SSN_Yasen_MASTER.blend \
  --assembly /abs/path/RU_SSN_Yasen_ASSEMBLY.json \
  --output /abs/path/RU_SSN_Yasen_MASTER_AUDIT.json
```

`inventory-only` 与完整 Assembly 审计的区别：`inventory-only` 不需要真实 Assembly，只输出 MASTER 库存、通用 Mesh 问题、Empty 和潜在 Anchor 候选项，并把 Assembly 相关检查标记为 `SKIPPED_MISSING_ASSEMBLY`。它不能验证活动件归属、Hull 排他关系、正式 Pivot/Socket 父子关系或运动轴语义。完整 Assembly 审计必须先通过 `src/assets/submarineAssembly.ts` 的正式 Schema 与跨字段校验，然后才启动 Blender worker。

JSON 报告结构包含：`reportFormatVersion`、`auditMode`、`master`、`environment`、`scene`、`externalDependencies`、`meshQuality`、`assemblyAudit`、`fileIntegrity`、`issues` 和 `summary`。`issues` 中每条问题包含 `ruleId`、`status`、对象或 Collection、中文说明、结构化 `context` 和 `blocksExport`。数组和对象稳定排序；报告不写入运行时间、临时目录名或随机 ID。

退出码：

- `0`：审计通过。
- `1`：审计发现错误，或启用 `--fail-on-warning` 时发现警告。
- `2`：输入参数或路径错误。
- `3`：Assembly 契约无效。
- `4`：Blender 打开或 worker 执行失败。
- `5`：内部工具异常。

当前阈值：

- `zeroLengthEdgeMeters = 1e-6`：边长小于等于该值视为零长度边。
- `degenerateFaceAreaSquareMeters = 1e-10`：面面积小于等于该值视为退化或接近零面积。
- `nearZeroScale = 1e-6`：缩放绝对值小于等于该值视为接近零。
- `unappliedScaleTolerance = 1e-4`：缩放绝对值偏离 1 超过该值视为未应用非单位缩放。
- `normalizedAxisTolerance = 0.001`：运动轴长度偏离 1 超过该值视为未归一化。
- `farAnchorHullDiagonalMultiplier = 2`：Anchor 到原点距离超过整体 Mesh 包围盒对角线 2 倍时标记为明显远离。
- `exampleLimit = 12`：每类 Mesh 问题最多记录 12 个索引样例，避免报告膨胀。

批量审计三艘艇时，应分别对正式 MASTER 运行 `inventory-only`，输出到各艇 `Validation/` 目录。当前没有 Yasen、Akula、Typhoon 的真实 Assembly JSON，因此这些报告只能作为母版基线审计，不能代替 UE4 导入验证，也不能证明活动件排他关系完整通过。UE4 导入、FBX 导出、正式 Pivot/Socket Anchor 创建和真实 Assembly 建立属于后续 P3/SUBMOD-030 及以后任务。

验证命令：

```bash
npm test -- tests/unit/submarine-blender-audit.test.ts
npm run test:submarine-audit:blender
```
