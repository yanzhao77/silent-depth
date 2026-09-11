# SILENT DEPTH —— 潜艇传感器资产工厂契约

版本：v1.0.0　生成日期：2026-09-10

本文件是传感器资产工厂的接口契约，所有构建器、验证器与文档都遵守它。
它是生产契约，不是成品网格；它不描述任何现实作战参数。

## 0. 边界

只负责：传感器资产、传感器科技树、传感器兼容性、传感器挂载、传感器插槽、
传感器数据库、传感器预览、传感器文档。

不修改：`Submarines/`、`src/core`、`src/ai`、`src/sonar`、`src/combat`、
`src/gameplay`、`src/missions`、`src/world`，也不改潜艇 Hull、Tower、
Propeller、Control Surface、Weapon System、Physics、Combat Logic、AI、
Sonar Gameplay Logic、Save、Mission、World。

## 1. 根目录

```text
SilentDepth_Assets/Sensors/
├── Sonar/            声呐总说明与类别映射
├── Passive/ Active/ Bow/ Flank/ Towed/ HighFrequency/ MineDetection/
├── Navigation/ Photonics/ EOIR/ Radar/ ESM/ Processing/    13 个分支
├── Materials/        共享材质库
├── Templates/Sensor/ 母版、导出预设、校验规则、插槽标准
├── Tools/            构建器与验证器
├── Manifest/         数据库、家族、插槽注册表、兼容矩阵、生产状态
├── TechnologyTree/   T1–T10 科技树（JSON + Markdown）
└── Documentation/    报告与资料核验库
```

## 2. 数据流

```text
Tools/sensor_dataset_branches.py   分支 × T1–T10
Tools/sensor_dataset_families.py   家族、现实候选、游戏家族
Tools/sensor_dataset_assets.py     核心资产与外形、共享材质
                 ↓
Tools/sensor_dataset.py            合并核验库 → 唯一数据集
                 ↓
Tools/build_sensor_manifest.py     Manifest / TechnologyTree / 报告
Tools/create_sensor_asset.py       资产骨架与文本产物
Tools/build_sensor_assets.py       在 Blender 内生成 Blend / FBX / LOD / 碰撞 / 预览
Tools/sensor_validator.py          机器验证与证据
```

任何构建器都不得绕过数据集自行发明传感器、层级或兼容关系。

## 3. 命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 现实候选 ID | `[国家]_[域]_[名称]` | `US_SONAR_BQQ10`、`UK_PHO_CM010`、`RU_RADAR_MRK50` |
| 游戏层级件 ID | `GEN_[域]_T[n]` | `GEN_SONAR_BOW_T5` |
| 网格对象 | `SEN_<ID>_LOD[n]` | `SEN_US_SONAR_LAB_LOD0` |
| 碰撞体 | `UCX_SEN_<ID>_00` | `UCX_SEN_US_SONAR_LAB_00` |
| 插槽 | §20 统一插槽名 | `SOCKET_SONAR_BOW` |

禁止 `Cube`、`Object`、`Cylinder`、`Plane`、`Sphere`、`Torus`、`Cone` 之类默认名进入交付物。

## 4. 单位与朝向

- 单位：米；1 Blender 米 = 100 Unreal 单位。
- 朝向：艇艏 `+X`，左右舷 `Y`，`Z` 向上。
- 交付前缩放与旋转必须归零。
- 导出：FBX 2018 兼容（二进制 7400），`axis_forward=-Y`，`axis_up=Z`，
  `apply_unit_scale=True`，`global_scale=1.0`，不嵌入贴图。

## 5. LOD 与碰撞

- LOD0–LOD3 由同一程序化构建器按 `detail` 档位**独立生成**，不做 LOD 串联简化。
- 三角计数必须自 LOD0 向 LOD3 单调不增，且 LOD3 明显低于 LOD0。
- 碰撞体是独立闭合凸包，面数不高于 LOD3 渲染网格，命名带 `UCX_` 前缀。
- 轮廓件（阵面、桅杆杆体、拖曳舱体、天线面）在所有 LOD 中保留。

## 6. 插槽

统一 8 个：`SOCKET_SONAR_BOW`、`SOCKET_SONAR_FLANK_L`、`SOCKET_SONAR_FLANK_R`、
`SOCKET_TOWED_ARRAY`、`SOCKET_PHOTONICS_MAST`、`SOCKET_PERISCOPE`、
`SOCKET_RADAR`、`SOCKET_ESM`。资产内部的空物体名必须与之一致。

## 7. 数据库字段（§17）

`sensor_id`、`family`、`variant`、`country`、`category`、`sub_category`、`tier`、
`era`、`status`、`confidence`、`asset_status`、`compatible_submarines`、
`mount_type`、`socket`、`preview`、`references`。

其中 `category` 保留任务书 §3 的类别名，`tier` 是分支内层级，`confidence` 取
`CONFIRMED` / `PROBABLE` / `GAMEPLAY` / `UNKNOWN`。

## 8. 兼容性状态（§19）

`CONFIRMED`、`PROBABLE`、`GAMEPLAY`、`UNKNOWN`、`INCOMPATIBLE`。

判定规则：至少两条独立公开来源一致确认，且其中至少一条为官方/政府/制造商/专业工程媒体，
才可以标 `CONFIRMED`；否则最高 `PROBABLE`。跨国现实系统标 `INCOMPATIBLE`。
游戏科技树默认装配标 `GAMEPLAY`，不代表任何现实断言。

## 9. 资源与离线

- 运行期完全离线：无 CDN、无远程贴图、无运行时下载、无追踪器。
- 材质为程序化共享材质，不引入外部位图；如后续新增资产，必须补齐本地路径、来源、
  兼容商用许可证与 SHA-256，并更新资产注册表。

## 10. 验证与完成标签

```bash
python Tools/sensor_validator.py --all --write-report
```

使用仓库统一的诚实标签：`IMPLEMENTED`、`TESTED`、`BROWSER VERIFIED`、
`TARGET HARDWARE VERIFIED`，未验证项必须写 `NOT VERIFIED`。
UE4.27 编辑器导入属于人工验证项，本机未执行时必须标注 `NOT VERIFIED`。
