# 传感器资产模板

版本：v1.0.0（2026-09-10）

| 文件 | 用途 |
| --- | --- |
| `SilentDepth_Sensor_Asset_Template.blend` | 母版：集合结构、8 个统一插槽空物体、共享材质、说明文本块（不含几何） |
| `SilentDepth_Sensor_Asset_Template.json` | 生产契约：集合、命名、变换、材质、UV、LOD、碰撞、插槽、导出 |
| `SilentDepth_Sensor_Export_Preset.json` | UE4.27 / FBX 2018 兼容导出预设 |
| `SilentDepth_Sensor_Validation_Rules.json` | 状态词表、必备目录与文件、机器检查项、人工检查项 |
| `SilentDepth_Sensor_Socket_Standard.json` | §20 的 8 个统一插槽与安装方向 |

## 用法

1. 复制 `SilentDepth_Sensor_Asset_Template.blend` 到
   `Sensors/<分支>/<SENSOR_ID>/Blend/<SENSOR_ID>_MASTER.blend`。
2. 在 `01_STRUCTURE` / `02_ARRAY_FACE` / `03_CABLE` / `04_OPTICS` 里建模，
   成品网格命名 `SEN_<SENSOR_ID>_LOD<n>` 并放入 `90_LOD/LOD<n>`。
3. 碰撞体独立凸包，命名 `UCX_SEN_<SENSOR_ID>_00`，放入 `99_COLLISION`。
4. 只使用 `95_SOCKETS` 中已有的插槽名。
5. 导出走 `Tools/export_sensor_ue427.py`，并跑 `Tools/sensor_validator.py`。

程序化生成的资产不需要手工执行以上步骤；`Tools/build_sensor_assets.py` 会按同一套契约产出。
