# UE4.27 传感器资产导入说明

生成日期：2026-09-11

本文件描述如何把 `Sensors/` 下的 FBX 导入 UE4.27。**本机没有 UE4.27 编辑器，
因此本文的步骤没有在本机执行过，属于 `NOT VERIFIED`**；FBX 本身只通过二进制版本
7400 与文件结构验证。

## 1. 导入前确认

| 项目 | 期望值 | 证据 |
| --- | --- | --- |
| FBX 版本 | 二进制 7400（FBX 2018 兼容） | `Validation/<ID>_GEOMETRY.json`、`Documentation/<ID>_MANIFEST.json` |
| 单位 | 米（1 m = 100 UU） | `Source/<ID>_GEOMETRY_SPEC.json` |
| 朝向 | `axis_forward=-Y`，`axis_up=Z` | `Templates/Sensor/SilentDepth_Sensor_Export_Preset.json` |
| 材质 | 只有 `SEN_MAT_*` 共享材质，无外部位图 | `Textures/<ID>_MATERIALS.json` |
| 插槽 | 资产内空物体使用 §20 统一命名 | `Templates/Sensor/SilentDepth_Sensor_Socket_Standard.json` |

## 2. 导入步骤

1. 在 UE4.27 中新建资产目录 `Content/SilentDepth/Sensors/<分支>/<SENSOR_ID>/`。
2. 导入 `FBX/<ID>_LOD0.fbx`，选择 **Import LODs**，指向同目录的 LOD1–LOD3。
3. 导入 `Collision/<ID>_COLLISION.fbx`，勾选 **Import as Collision**，
   或在 Static Mesh 编辑器中把 `UCX_SEN_<ID>_00` 设为简单碰撞。
4. 材质：把 `SEN_MAT_*` 建为材质实例；不要引入外部贴图，保持运行期离线。
5. 插槽：把资产内 `SOCKET_*` 空物体映射成 UE 的 Socket，命名必须与
   `sensor_socket_registry.json` 一致。
6. 导入后逐个替换 `asset_status` 为 `COMPLETE` 之前，先在编辑器内目视确认外形、
   朝向与尺度。

## 3. 导入后应补的记录

- UE4.27 版本号与导入日期。
- 每个传感器资产的 UE 资产路径。
- 目视确认结果（朝向、尺度、碰撞、材质）。
- 如有外观问题，记录到对应 `Validation/` 目录，不要直接改数据库结论。

## 4. 未验证声明

```text
UE4.27 编辑器导入：NOT VERIFIED（本机无 UE4.27）
目标硬件性能：NOT VERIFIED（本任务不产生也不引用 FPS 数据）
```
