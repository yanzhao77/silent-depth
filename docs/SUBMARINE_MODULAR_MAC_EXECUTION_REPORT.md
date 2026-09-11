# SILENT DEPTH 潜艇模块化 Mac 执行报告

状态：本报告记录 2026-09-11 在 Mac 上实际完成和验证的内容。所有正式 MASTER 均保持只读，未提交、未推送。

## 阶段状态

| 阶段 | 状态 | 证据 |
|---|---|---|
| SUBMOD-030 Yasen muzzle 修正 | TESTED / BLENDER VERIFIED | `RU_SSN_Yasen_TORPEDO_MUZZLE_DERIVATION.json`，聚焦测试，Blender 几何 dry-run 与正式报告 |
| SUBMOD-031 Yasen Anchor 迁移 | BLENDER VERIFIED | 外部工作副本 `Yasen/run-002/Blend/RU_SSN_Yasen_MASTER.blend`，Assembly 审计 0 errors |
| SUBMOD-032 Yasen FBX 导出 | TESTED | 外部 staging `Staging/Yasen/run-001`，manifest 10 个 FBX，LOD 三角数严格递减 |
| SUBMOD-033 FBX 回读 | FBX ROUNDTRIP VERIFIED | `RU_SSN_Yasen_FBX_ROUNDTRIP.json`，全新 Blender 进程逐个导入 PASS |
| SUBMOD-034 关键姿态 | PARTIAL / NOT VERIFIED | Anchor transform 已存在；未生成完整姿态截图和 Hull 穿插 BVH 报告 |
| SUBMOD-035 UE4 导入准备 | NOT VERIFIED | 未启动 UE4 Editor；未修改 `.uasset`；Windows 交接见 `SUBMARINE_UE427_WINDOWS_HANDOFF.md` |
| Akula Mac 工作 | MASTER READ-ONLY VERIFIED | inventory-only 审计：123 warnings，1 skipped，无 errors |
| Typhoon Mac 工作 | MASTER READ-ONLY VERIFIED | inventory-only 审计：126 warnings，1 skipped，无 errors |

## Yasen SUBMOD-030 结果

- Periscope：`SUB_Yasen_Mast_2` 与 `SUB_Yasen_MastHead_2` 保持第一版 `GAMEPLAY_MAPPING`，不是实艇设备身份确认。
- 旧 `SOCKET_TORPEDO_01`：方向与 `+X forward` 一致，但位置 `[55.799972534, 0, 7.26317358]` 因中线、高度和 BowDoor 几何证据不足被拒绝。
- 新 muzzle：`GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY`，不是实艇测量数据。
- 最终对象：`SUB_Yasen_BowDoor_1_2`。
- muzzle transform：translation `[38.599311829, -6.763348579, 1.751911044]`，rotation `[0, 0, 0]`，scale `[1, 1, 1]`。
- 发射方向：`[0.786318362, -0.617821515, 0]`。
- clearance envelope：半径 `0.35m`、长度 `7.0m`，仅为 gameplay clearance envelope。
- BVH：`8m` raycast 无命中，`3.2m` sweep 无命中，最小清障 `0.508504152m`。

## Yasen Anchor 与 FBX 输出

- 工作副本：`/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Yasen/run-002/Blend/RU_SSN_Yasen_MASTER.blend`
- 工作副本 SHA-256：`4696af6ddf363bc557faea5ce9c1a8a2e006c44e540a4a222ba8b7079de12438`
- Anchor Collection：`30_ANCHORS`
- 创建 Anchor：5 个 Pivot，1 个 Socket。
- 工作副本 Assembly 审计：`errorCount=0`，`warningCount=0`，`skippedCount=0`。
- staging：`/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Staging/Yasen/run-001`
- 导出文件：Hull LOD0..LOD3、5 个 Part、1 个 separate collision FBX。
- LOD triangles：`80492 > 44270 > 25756 > 14488`。
- FBX 回读：10/10 PASS。

## Akula 与 Typhoon 只读审计

- Akula：`warningCount=123`，`errorCount=0`，`skippedCount=1`。分类：非流形边 96，退化面 7，UCX 无材质槽 10，UCX 面引用空材质槽 10。
- Typhoon：`warningCount=126`，`errorCount=0`，`skippedCount=1`。分类：零长度边 94，退化面 4，非流形边 2，UCX 无材质槽 13，UCX 面引用空材质槽 13。
- 两者均未创建 Assembly，未保存工作副本，未修改 MASTER。

## 未验证内容

- UE4 Editor 实际导入、`.uasset`、Blueprint、Windows 运行、collision visualization、socket visualization：`UE4 EDITOR NOT VERIFIED`。
- Yasen 关键姿态截图、完整 Hull 穿插姿态 BVH：`NOT VERIFIED`。
- Akula 鱼雷舱盖建模、Hull 切割或 Anchor 保存：`USER DECISION REQUIRED`。
- Typhoon 受保护原件修复：`ARTIST REVIEW REQUIRED`，本次未修改。
- 真实舰艇设备身份、真实武器技术参数：`NOT VERIFIED`，本次没有声明。

## 外部输出

- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Logs/baseline/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Logs/muzzle-dryrun-geometry-side/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Yasen/run-001/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Yasen/run-002/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Staging/Yasen/run-001/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Akula/run-001/`
- `/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Typhoon/run-001/`

这些二进制和证据文件位于仓库外，未进入 Git diff。

## Git LFS 建议

当前 `.blend`、`.fbx`、`.png` 仅由 Git 属性标记为 binary，`filter` 为 `unspecified`，本次未启用 Git LFS。

建议后续由团队决策是否迁移：`.blend`、`.fbx`、`.glb`、`.gltf`、`.png`、`.jpg`、`.jpeg`、`.tga`、`.exr`、`.hdr`、`.uasset`、`.umap`。启用 LFS 会影响历史迁移、远端存储、团队本地环境和 CI 拉取策略，因此本任务没有修改 `.gitattributes` 或启用 LFS。
