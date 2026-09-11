# 防御系统资产 UE4.27 导入方案

适用范围：`SilentDepth_Assets/DefensiveSystems/` 下的防御系统资产。

状态：**方案已写，导入未执行**。本文件记录的是导入约定，不是已完成的实测记录。
既有潜艇资产的实测记录见 `ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md`；本文件沿用同一套设置，
但**没有在 UE4.27 编辑器里跑过**，导入结果需要实际执行后才能确认。

## 1. 源资产位置

```text
SilentDepth_Assets/DefensiveSystems/<Category>/<AssetId>/
├── Source/            构建脚本
├── Blend/             <AssetId>_MASTER.blend
├── FBX/               <AssetId>_LOD0..LOD3.fbx（二进制 7400）
├── Collision/         <AssetId>_COLLISION.fbx（UCX 凸包）
├── Preview/           正交预览与灰模
├── Documentation/     <AssetId>_SPEC.json、README
└── Validation/        <AssetId>_VALIDATION.json
```

## 2. 目标路径约定

```text
/Game/SilentDepth/Art/DefensiveSystems/<Category>/<AssetId>/
├── SM_<AssetId>                     静态网格（LOD0..3）
├── Materials/MI_<AssetId>_<槽名>
└── Sockets/                         socket 相对变换记录
```

Category 目录名与资产库一致：`ESM`、`ThreatWarning`、`AcousticCountermeasure`、`Decoys`、
`NoiseMakers`、`TorpedoDefense`、`Launchers`、`Control`、`Antennas`。

## 3. 静态网格导入设置

与既有潜艇资产保持一致（来源：`tools/ue4/import_submarines.py` 的实测配置）：

| 选项 | 值 |
| --- | --- |
| Import Uniform Scale | 1.0 |
| Convert Scene / Convert Scene Unit | On |
| Import Normals / Tangents | On |
| Generate Lightmap UVs | Off |
| Auto Generate Collision | Off（碰撞来自 FBX 内的 UCX 体） |
| Import Materials / Textures | Off（改用工程内材质实例） |
| Combine Meshes | Off |

LOD1–3 用 `EditorStaticMeshLibrary.import_lod` 从各自的 FBX 导入。

## 4. 单位与轴向

- 源尺寸以米为单位写入 `Documentation/<AssetId>_SPEC.json` 的 `dimensions_m`，
  与 LOD0 包围盒逐轴一致（验证器按 ±2% 容差检查）。
- 导出时使用 `axis_forward='-Y'`、`axis_up='Z'`、`apply_unit_scale=True`、
  `apply_scale_options='FBX_SCALE_UNITS'`，与既有潜艇导出脚本相同。
- FBX 二进制版本必须是 7400（FBX 2018），UE4.27 目标。

## 5. Socket 约定

统一词表（唯一定义在 `Tools/sds_common.py` 的 `SOCKETS`）：

| Socket | 用途 |
| --- | --- |
| `SOCKET_EW_MAST` | ESM / 电子战桅杆座 |
| `SOCKET_EW_ANTENNA` | ESM 天线或阵面座 |
| `SOCKET_DECOY_LAUNCHER_01` | 前部诱饵发射器座 |
| `SOCKET_DECOY_LAUNCHER_02` | 后部诱饵发射器座 |
| `SOCKET_COUNTERMEASURE_01` | 前部对抗器材座 |
| `SOCKET_COUNTERMEASURE_02` | 后部对抗器材座 |

导入后按同名 socket 挂到潜艇网格上。**继承潜艇当前没有任何 socket**
（实测：Typhoon / Akula / Yasen 三个本地 MASTER 中共 0 个 `SOCKET_` 对象，
见 `Documentation/defensive_socket_audit.json`），因此挂点作业是后续独立任务，
不在本资产库范围内。

## 6. 材质

共享材质名登记在 `Materials/shared_materials.json`：`Metal`、`DarkMetal`、`Rubber`、
`Composite`、`Paint`、`Glass`、`AntennaMaterial`。UE 侧建议复用潜艇管线已有的
`M_SD_Submarine_PBR` / `M_SD_Submarine_Flat` 母材质，或新建对应的
`M_SD_Defensive_PBR`，槽位匹配规则与潜艇一致（子串归一化、最长键优先）。

给贴图参数预留默认贴图是既有管线踩过的坑（见潜艇导入方案），防御系统资产若带 ORM / 法线，
必须同样处理。

## 7. 未验证事项

1. **未在 UE4.27 编辑器中执行导入**。本文件只是约定，没有实测证据。
2. LOD 切换的屏幕尺寸阈值未认证。
3. 材质实例与贴图绑定未在引擎里渲染观察。
4. socket 相对变换未在引擎里核对。

以上都应在真实导入后回填实测结果，再决定是否把资产状态提升为 `COMPLETE`。
