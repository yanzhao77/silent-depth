# UE4 资产批量导入报告（UEASSET-001 / 002 / 003）

| 字段 | 内容 |
|---|---|
| 日期 | 2026-09-12 |
| 引擎 | Unreal Engine 4.27.2（本机 `C:\game\Epic Games\UE_4.27`） |
| 工具 | `tools/ue4/import_asset_library.py`（`-run=pythonscript`） |
| 权威数据 | `SilentDepth_Assets/*/Manifest/*.json`（路径与状态来自资产库） |
| 导入方式 | LOD0 经 `AssetImportTask` 导入为 StaticMesh；LOD1–3 经 `EditorStaticMeshLibrary.import_lod`；随后加 BOX 简单碰撞 |

## 结果

| 类别 | 计划 | 导入成功 | 失败 | 目标目录 |
|---|---|---|---|---|
| 武器（UEASSET-001） | 120 | **120** | 0 | `/Game/SilentDepth/Art/Weapons/<分类>/SM_<weapon_id>` |
| 传感器（UEASSET-002） | 39 | **39** | 0 | `/Game/SilentDepth/Art/Sensors/<分支>/SM_<sensor_id>` |
| 防御代表资产（UEASSET-003） | 13 | **13** | 0 | `/Game/SilentDepth/Art/DefensiveSystems/<类别>/SM_<asset_id>` |
| 合计 | **172** | **172** | 0 | — |

每个资产都带 4 级 LOD 与一个简单碰撞体；明细见同目录的
`weapons.json`、`sensors.json`、`defensive.json`（逐资产目标路径与结果）。

## 完成标签

- 导入执行：**IMPORTED（172/172）**，日志为 `LogPython: SD_IMPORT <category>: N/N imported`。
- 磁盘核对：Content 下 `SM_*.uasset` 计数 = 120 / 39 / 13。
- 人工视觉验收（`UEASSET-005`）：**NOT VERIFIED**。材质槽、法线、枢轴、LOD 跳变、
  穿模与水下可读性都需要在编辑器里看，自动化替代不了。
- 目标硬件性能：**NOT VERIFIED**（`DEC-006` 未决）。

## 已知边界

1. **碰撞是自动生成的 BOX**，不是资产库里的 `*_COLLISION.fbx`。抽检可用，精确形状
   仍需按 `UEASSET-004` 的规则单独处理（该任务原本只覆盖推进资产）。
2. `DATABASE_ONLY` 条目从未出现在导入清单里（`DEC-001`），例如 4 个未产出几何的
   武器变体与 111 条传感器数据库条目。
3. 材质随 FBX 导入；共享材质实例与后续统一样式属于 `UEASSET-005` 的人工工作。
4. 报告只记录"导入动作是否成功"，不代表视觉或性能验收。
