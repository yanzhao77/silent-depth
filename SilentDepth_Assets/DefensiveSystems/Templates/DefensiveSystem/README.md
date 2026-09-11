# 防御系统资产模板

这套模板对应 `SilentDepth_Assets/DefensiveSystems/` 的资产库。新资产必须由
`Tools/sds_dataset.py` 的 `ASSETS` 声明驱动，**不允许**手工往目录里塞模型。

## 1. 目录结构

```text
DefensiveSystems/<Category>/<AssetId>/
├── Source/            构建脚本（本例是 sds_geometry.py + sds_build_asset.py 的调用）
├── Blend/             <AssetId>_MASTER.blend
├── FBX/               <AssetId>_LOD0..LOD3.fbx
├── LOD/               LOD 派生规则与中间产物
├── Collision/         <AssetId>_COLLISION.fbx（UCX 凸包）
├── Textures/          可选；必须本地文件并被 SPEC 的 sha256 表覆盖
├── Preview/           至少 4 张正交预览 png
├── Documentation/     <AssetId>_SPEC.json、<AssetId>_README.md
└── Validation/        <AssetId>_VALIDATION.json、构建统计
```

`<Category>` 取 `Tools/sds_common.py::CATEGORY_DIR` 的值：`ESM`、`ThreatWarning`、
`AcousticCountermeasure`、`Decoys`、`NoiseMakers`、`TorpedoDefense`、`Launchers`、
`Control`、`Antennas`。

## 2. 命名规则

- 资产 ID：`<国家码>_<分支码>_<名称>`。国家码 `US/RU/UK/FR/CN/IN`；分支码
  `EW`（电子支援/天线）、`TW`（威胁告警）、`ACM`（声学对抗/诱饵/噪声弹）、
  `CML`（发射装置）、`TDD`（鱼雷防御）、`DCM`（防御控制）、`GEN`（通用件）。
  例：`US_EW_BLQ10`、`RU_ACM_MG74`、`GEN_TWL_TORPEDO_WARNING_SENSOR`。
- Blender 对象：`DEF_<AssetId>_LOD0`；碰撞：`UCX_<AssetId>_<NN>`；
  挂点：`SOCKET_*`（空物体）；材质：`M_Def_<材质名>`。
- 文件名一律 `<AssetId>_<后缀>`，便于脚本与 UE 导入匹配。

## 3. Socket 词表

唯一定义在 `Tools/sds_common.py::SOCKETS`：

| Socket | 用途 |
| --- | --- |
| `SOCKET_EW_MAST` | ESM / 电子战桅杆座 |
| `SOCKET_EW_ANTENNA` | ESM 天线或阵面座 |
| `SOCKET_DECOY_LAUNCHER_01` | 前部诱饵发射器座 |
| `SOCKET_DECOY_LAUNCHER_02` | 后部诱饵发射器座 |
| `SOCKET_COUNTERMEASURE_01` | 前部对抗器材座 |
| `SOCKET_COUNTERMEASURE_02` | 后部对抗器材座 |

继承潜艇目前**没有任何**防御 socket（见 `Documentation/defensive_socket_audit.json`：
3 个本地 MASTER 实测 0 个 `SOCKET_` 对象），挂点作业属于后续独立任务。

## 4. 新建一个资产的步骤

1. 在 `Tools/sds_dataset.py` 的 `ASSETS` 里加一条记录（asset_id、category、branch、
   family_id、country、priority、geometry、dimensions_m、sockets、materials）。
   没有走 `ASSETS` 的目录会被 manifest 记为「越权创建」。
2. 如果几何类型是新的，在 `Tools/sds_geometry.py` 里加一个 builder，并登记到
   `BUILDERS` 与 `MATERIAL_RULES`。
3. 运行 `python Tools/sds_build_materials.py`（材质库）、
   `python Tools/build_all.py`（数据与 manifest）、
   `python Tools/run_asset_build.py --only <AssetId>`（几何到 FBX）。
4. 运行 `python Tools/defensive_system_validator.py --asset <AssetId>`。
   只有验证器 PASS 才能把状态提升为 COMPLETE。

## 5. 原点与尺寸规则

| 几何类型 | 原点 | 主尺寸 |
| --- | --- | --- |
| 桅杆、天线、控制台 | 底面中心（min z ≈ 0） | 高度 |
| 诱饵弹体、噪声弹、发射管 | 几何中心 | 长度 |
| 外部发射器、传感器整流罩 | 安装面附近（中心偏移 ≤ 10%） | 长度 |

尺寸以米为单位写入 SPEC，LOD0 包围盒与声明值之比必须落在 0.90–1.25。

## 6. 导出与验证

```powershell
python Tools\run_asset_build.py --only US_EW_ESM_GENERIC --preview-size 320 --jobs 1
python Tools\defensive_system_validator.py --asset US_EW_ESM_GENERIC
```

- 导出参数：FBX 二进制 7400、`axis_forward='-Y'`、`axis_up='Z'`、
  `apply_unit_scale=True`、`FBX_SCALE_UNITS`、切线空间开启、不嵌贴图。
- LOD 由 LOD0 派生：0.50 / 0.22 / 0.085，三角面必须严格递减。
- 碰撞：UCX 凸包随 LOD0 导出，并另有独立碰撞 FBX。
- 预览：至少 4 张正交视图 png（细长资产额外生成 Detail 视图与灰模）。
- 模板场景：`make_template.py` 生成 `SilentDepth_DefensiveSystem_Asset_Template.blend`
  （集合结构 + SOCKET 占位 + M_Def_* 材质）。

## 7. 禁止事项

- 不得写入任何真实电子战参数、频率、功率、欺骗逻辑、鱼雷规避战术或作战流程。
- 不得为查不到公开资料的型号编造几何体；这类条目保持 `DATABASE_ONLY`。
- 不得修改 `Submarines/`、`Weapons/`、`src/`、`ue4/` 下的任何文件。
- 不得为了让验证通过而放宽规则。
