# SILENT DEPTH 潜艇模块化 Windows UE4.27 交接

状态：WINDOWS REQUIRED / UE4 EDITOR NOT VERIFIED。本文是后续执行清单，不表示 UE4 Editor 已经导入或验收成功。

## 环境

- UE 版本：Unreal Engine 4.27.2。
- 项目：`ue4/SilentDepthUE/SilentDepthUE.uproject`。
- Mac 侧 staging：`/Users/sjw/Documents/BlenderProjects/SilentDepth_Modular_Work/Staging/Yasen/run-001`。
- Mac 侧 manifest：`RU_SSN_Yasen_EXPORT_MANIFEST.json`。
- 不复制：Mac 日志目录、Blender 临时目录、`.DS_Store`、仓库外旧 run 目录中未列入 manifest 的文件。

## 需要复制到 Windows 的文件

- `FBX/RU_SSN_Yasen_LOD0.fbx`
- `FBX/RU_SSN_Yasen_LOD1.fbx`
- `FBX/RU_SSN_Yasen_LOD2.fbx`
- `FBX/RU_SSN_Yasen_LOD3.fbx`
- `FBX/RU_SSN_Yasen_PROPULSOR_01.fbx`
- `FBX/RU_SSN_Yasen_RUDDER_01.fbx`
- `FBX/RU_SSN_Yasen_STERN_PLANES_01.fbx`
- `FBX/RU_SSN_Yasen_BOW_PLANES_01.fbx`
- `FBX/RU_SSN_Yasen_PERISCOPE_01.fbx`
- `Collision/RU_SSN_Yasen_COLLISION.fbx`
- `RU_SSN_Yasen_EXPORT_MANIFEST.json`
- `RU_SSN_Yasen_FBX_ROUNDTRIP.json`

## UE Content 目标

- Hull：`/Game/SilentDepth/Art/Submarines/SSN/Russia/Yasen/SM_RU_SSN_Yasen`
- Parts：同目录下 `SM_RU_SSN_Yasen_PROPULSOR_01`、`SM_RU_SSN_Yasen_RUDDER_01`、`SM_RU_SSN_Yasen_STERN_PLANES_01`、`SM_RU_SSN_Yasen_BOW_PLANES_01`、`SM_RU_SSN_Yasen_PERISCOPE_01`
- Collision：用于 Hull separate collision 验证，不得误作为可见 Mesh。

## 导入检查

1. 先导入 Hull LOD0，确认 scale 为 1.0，`Convert Scene` 与 `Convert Scene Unit` 开启。
2. 对同一 Static Mesh 导入 LOD1、LOD2、LOD3。
3. 检查 LOD screen size，不要把 Mac manifest 当成 UE 屏幕尺寸验收。
4. 导入 separate collision FBX，确认 UCX 名称可被 UE4 识别。
5. 导入五个 Part Static Mesh，禁止 combine 到 Hull。
6. 检查材质槽数量、槽名和 fallback 材质。
7. 检查轴向：Blender `+X forward`、`+Z up` 是否在 UE 中符合项目约定。
8. 检查整体尺度：1 Blender meter = 100 Unreal Units。
9. 检查 Hull LOD bounds 没有 100 倍或 0.01 倍缩放。
10. 检查 Part mesh 原点是否对应 Assembly Pivot。

## Blueprint/组件组装检查

1. Root 下挂 Hull StaticMeshComponent。
2. 为 `propulsor_01`、`rudder_01`、`stern_planes_01`、`bow_planes_01`、`periscope_01` 创建独立 StaticMeshComponent。
3. 使用 Assembly Anchor transform 放置组件，不在 UE 中重新手调补偿。
4. Socket `SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE` 放置在 `[38.599311829, -6.763348579, 1.751911044]` 米对应的 UE 单位位置。
5. 验证鱼雷发射方向 `[0.786318362, -0.617821515, 0]` 对应的世界方向，不要使用旧 `[55.799972534, 0, 7.26317358]`。

## 运动验收

- Propulsor：0、90、180 度，轮毂中心不得漂移。
- Rudder：min、0、max，绕声明 `+Z` 轴旋转。
- Stern planes：min、0、max，绕声明 `+Y` 轴旋转。
- Bow planes：min、0、max，绕声明 `+Y` 轴旋转。
- Periscope：收起、中间、完全伸出，沿声明 `+Z` 平移。
- Torpedo socket：起始 envelope 不穿 Hull，短距发射方向不回穿艇体。

## UE Editor 必须验证

- Static Mesh LOD 导入结果。
- separate collision visualization。
- Socket visualization。
- Part Pivot visualization。
- Blueprint 组件层级和零状态组装。
- 材质槽绑定。
- 自动化测试或 PIE 中的动画状态响应。
- packaged build 或目标硬件性能。

## 失败回滚

- 不删除 Mac staging；先在 UE Content 中移走或重命名新导入资产。
- 保留 `RU_SSN_Yasen_EXPORT_MANIFEST.json` 与 UE 日志，记录失败导入项。
- 不把失败的 `.uasset` 回写到仓库。
- 若发现轴、尺度或 Pivot 错误，回到 Mac 工具修正导出，不在 UE 中长期手动补偿。
