# SILENT DEPTH 潜艇传感器 / 声呐资产库

这是与 `Submarines/`（潜艇科技树）、`Weapons/`（武器科技树）并列的**第三套独立系统**。
它只负责传感器资产、传感器科技树、传感器兼容性、传感器挂载、传感器插槽、传感器数据库、
传感器预览与传感器文档，**不修改潜艇模型、物理、战斗、AI、声呐玩法逻辑、存档、任务与世界**。

## 目录

| 目录 | 内容 |
| --- | --- |
| `Passive/` `Active/` `Bow/` `Flank/` `Towed/` `HighFrequency/` `MineDetection/` `Navigation/` `Photonics/` `EOIR/` `Radar/` `ESM/` `Processing/` | 13 个分支的资产，每个资产一套完整包 |
| `Sonar/` | 声呐总说明与 §3 类别到分支的映射 |
| `Materials/` | 共享材质库与材质定义 |
| `Templates/Sensor/` | 传感器母版、导出预设、校验规则、插槽标准 |
| `Tools/` | 资产工厂工具链（可复跑） |
| `Manifest/` | 传感器数据库、家族表、插槽注册表、兼容矩阵、生产状态 |
| `TechnologyTree/` | T1–T10 科技树（JSON + Markdown） |
| `Documentation/` | 覆盖报告、验证报告、总报告、资料核验库 |

## 一个资产包里有什么（§21）

```text
<分支>/<SENSOR_ID>/
├── Source/        确定性几何规格（可复跑依据）
├── Blend/         <SENSOR_ID>_MASTER.blend
├── FBX/           LOD0 / LOD1 / LOD2 / LOD3
├── LOD/           层级预算与规则
├── Collision/     独立凸包 UCX_SEN_<SENSOR_ID>_00
├── Textures/      材质分配（程序化，无外部位图）
├── Preview/       Front / Side / Top / Perspective
├── Documentation/ SPEC + README
└── Validation/    机器验证结果 + 几何报告
```

## 复跑

```bash
python Tools/create_sensor_asset.py --all
blender --background --factory-startup --python Tools/build_sensor_assets.py -- --all
python Tools/sensor_validator.py --all --write-report
python Tools/build_sensor_manifest.py --print-summary
```

或一次跑完：

```bash
python Tools/run_sensor_factory.py --all
```

## 硬性约束

- 运行期完全离线：无 CDN、无远程贴图、无运行时下载。
- 不记录任何分类或作战参数（频率、声源级、探测距离、灵敏度、阵列增益）。
- 不把推测型号写成正式型号；未核验的平台—传感器关系不得标 `CONFIRMED`。
- 游戏科技树件一律使用 `GEN_` 前缀，与现实型号区分。
