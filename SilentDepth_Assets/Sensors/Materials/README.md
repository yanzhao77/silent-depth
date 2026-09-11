# 传感器共享材质库

| 文件 | 说明 |
| --- | --- |
| `SilentDepth_Sensor_Materials.blend` | 10 个共享材质的 Blender 库，含预览球 |
| `sensor_materials.json` | 材质参数定义（与数据库、模板、资产共用一份） |

材质 ID：`SEN_MAT_ArrayFace`、`SEN_MAT_Hull`、`SEN_MAT_DarkMetal`、`SEN_MAT_Mast`、
`SEN_MAT_Glass`、`SEN_MAT_Composite`、`SEN_MAT_Cable`、`SEN_MAT_Rack`、
`SEN_MAT_RadarFace`、`SEN_MAT_ESM`。

## 规则

- 所有传感器资产只使用上述共享材质，不新建私有材质。
- 材质是程序化的（基色 / 金属度 / 粗糙度），**不引用任何外部位图**，保证运行期完全离线。
- 若后续需要贴图，必须按仓库规则补齐本地路径、来源、许可证与 SHA-256，并更新资产注册表。
