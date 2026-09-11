# RU_SSN_Yasen Assembly Notes

状态：SUBMOD-030 Assembly 数据配置。本文只记录当前 MASTER 中真实对象的归属、几何推导和下一阶段 Anchor 输入，不代表实艇工程测量值。

## 只读输入

- MASTER：`Blend/RU_SSN_Yasen_MASTER.blend`
- SOCKETS 辅助文件：`Sockets/RU_SSN_Yasen_SOCKETS.blend`
- 初始 MASTER SHA-256：`af4125271fef60c46cd3500a4a9178d3d8e48be6bb7a903104cc5e349c2e79ca`
- 初始 SOCKETS SHA-256：`93edc6b901696e80ae0d64172c7d9014fa8707b4aa0e47b54b4e454e2268e053`
- Blender：`/Applications/Blender.app/Contents/MacOS/Blender`, `Blender 5.2.1 LTS`
- 当前 MASTER 没有 Empty 对象；本任务没有创建、保存或导出任何 Blender 数据。

## 固定 Hull 源对象

以下对象来自 `Scene Collection/EDITABLE`，作为本阶段固定艇体和固定外观细节。没有使用整个 `EDITABLE` Collection，因为该 Collection 同时包含螺旋桨、舵面和桅杆活动候选。

- `SUB_Yasen_Hull`
- `SUB_Yasen_Sail`
- `SUB_Yasen_ShaftFairing`
- `SUB_Yasen_SailHatch`
- `SUB_Yasen_BowDoor_-1_0`
- `SUB_Yasen_BowDoor_-1_1`
- `SUB_Yasen_BowDoor_-1_2`
- `SUB_Yasen_BowDoor_1_0`
- `SUB_Yasen_BowDoor_1_1`
- `SUB_Yasen_BowDoor_1_2`
- `SUB_Yasen_DeckHatch_-31`
- `SUB_Yasen_DeckHatch_8`
- `SUB_Yasen_DeckHatch_36`
- `SUB_Yasen_DeckHatch_43`
- `SUB_Yasen_FlankArray_-1`
- `SUB_Yasen_FlankArray_1`
- `SUB_Yasen_FloodSlot_-1_0`
- `SUB_Yasen_FloodSlot_-1_1`
- `SUB_Yasen_FloodSlot_-1_2`
- `SUB_Yasen_FloodSlot_-1_3`
- `SUB_Yasen_FloodSlot_-1_4`
- `SUB_Yasen_FloodSlot_-1_5`
- `SUB_Yasen_FloodSlot_1_0`
- `SUB_Yasen_FloodSlot_1_1`
- `SUB_Yasen_FloodSlot_1_2`
- `SUB_Yasen_FloodSlot_1_3`
- `SUB_Yasen_FloodSlot_1_4`
- `SUB_Yasen_FloodSlot_1_5`
- `SUB_Yasen_VLS_Rim_0_0`
- `SUB_Yasen_VLS_Rim_0_1`
- `SUB_Yasen_VLS_Rim_0_2`
- `SUB_Yasen_VLS_Rim_0_3`
- `SUB_Yasen_VLS_Rim_1_0`
- `SUB_Yasen_VLS_Rim_1_1`
- `SUB_Yasen_VLS_Rim_1_2`
- `SUB_Yasen_VLS_Rim_1_3`
- `SUB_Yasen_VLS_Lid_0_0`
- `SUB_Yasen_VLS_Lid_0_1`
- `SUB_Yasen_VLS_Lid_0_2`
- `SUB_Yasen_VLS_Lid_0_3`
- `SUB_Yasen_VLS_Lid_1_0`
- `SUB_Yasen_VLS_Lid_1_1`
- `SUB_Yasen_VLS_Lid_1_2`
- `SUB_Yasen_VLS_Lid_1_3`
- `SUB_Yasen_MastSocket_0`
- `SUB_Yasen_MastSocket_1`
- `SUB_Yasen_MastSocket_2`
- `SUB_Yasen_MastSocket_3`
- `SUB_Yasen_Mast_0`
- `SUB_Yasen_Mast_1`
- `SUB_Yasen_Mast_3`
- `SUB_Yasen_MastHead_0`
- `SUB_Yasen_MastHead_1`
- `SUB_Yasen_MastHead_3`

`SUB_Yasen_ShaftFairing` 留在 Hull。源码 `Source/yasen_geometry.py` 中它由 `axial('ShaftFairing', ..., 'coating')` 生成，材质为固定艇体涂层，范围为 x `-58.15..-56.30`，位于螺旋桨轮毂前方并作为轴套/整流罩连接艇体。螺旋桨活动件只包含 bronze hub 与 7 个 blade。

VLS lid、bow door、deck hatch、flank array、flood slot 和其他普通外观件当前作为固定 Hull 处理。它们是可见源对象，但 SUBMOD-030 不包含鱼雷舱盖、VLS 舱盖或其他舱盖动画。

## 活动 Part

### `propulsor_01`

- 源对象：`SUB_Yasen_PropellerHub`, `SUB_Yasen_PropellerBlade_00` 至 `SUB_Yasen_PropellerBlade_06`
- Pivot 计划名：`PIVOT_SUB_RU_YASEN_PROPULSOR_01`
- mountTransform：`[-58.83, 0.0, 0.0]`
- 运动：绕 `+X` 连续旋转，`stateSource = propulsor_rpm`
- 证据：源码中 blades 以 `radial` 向量围绕 X 轴布置，blade 中心表达式为 `Vector((-58.83-.25*t*t,0,0))+radial*r`；MASTER 包围盒显示 propulsor 组在 x `-60.00..-57.55`，围绕 y/z 近似对称。

### `rudder_01`

- 源对象：`SUB_Yasen_Tail_01`, `SUB_Yasen_Tail_03`
- Pivot 计划名：`PIVOT_SUB_RU_YASEN_RUDDER_01`
- mountTransform：`[-48.85, 0.0, 0.0]`
- 运动：绕 `+Z`，configured gameplay range `-32..32` 度，`stateSource = rudder_angle`
- 证据：源码 `Tail_%02d` 以 `k*pi/2` 生成四片尾翼；`Tail_01` 和 `Tail_03` 的包围盒主要沿 Z 展开，Y 厚度约 `0.90m`，为上下垂直舵候选。范围不是真实测量值，只用于当前 gameplay 配置。

### `stern_planes_01`

- 源对象：`SUB_Yasen_Tail_00`, `SUB_Yasen_Tail_02`
- Pivot 计划名：`PIVOT_SUB_RU_YASEN_STERN_PLANES_01`
- mountTransform：`[-48.85, 0.0, 0.0]`
- 运动：绕 `+Y`，configured gameplay range `-26..26` 度，`stateSource = stern_planes_angle`
- 证据：`Tail_00` 和 `Tail_02` 的包围盒主要沿左右 Y 方向展开，Z 厚度约 `0.90m`，为左右水平尾舵候选。

### `bow_planes_01`

- 源对象：`SUB_Yasen_ForwardPlane_00`, `SUB_Yasen_ForwardPlane_01`
- Pivot 计划名：`PIVOT_SUB_RU_YASEN_BOW_PLANES_01`
- mountTransform：`[33.8, 0.0, 0.0]`
- 运动：绕 `+Y`，configured gameplay range `-25..25` 度，`stateSource = bow_planes_angle`
- 证据：源码 `ForwardPlane_%02d` 以 `k*pi` 生成左右两片；包围盒 x `30.8..36.8`、左右 Y 对称、Z 厚度约 `0.90m`。

### `periscope_01`

- 源对象：`SUB_Yasen_Mast_2`, `SUB_Yasen_MastHead_2`
- Pivot 计划名：`PIVOT_SUB_RU_YASEN_PERISCOPE_01`
- mountTransform：`[23.0, -0.42, 11.8]`
- 运动：沿 `+Z` 平移，configured gameplay travel `0..2.62m`，`stateSource = periscope_extension`
- 证据：MASTER 只有通用 `Mast_0..3` 命名。源码中 `Mast_2` 的参数为 `(x=23, y=-0.42, h=2.65, r=0.13)`，它是四根桅杆中最高者；Sail 预览显示四根桅杆为同类简化几何，无法提供实艇设备身份。当前选择仅作为第一版 gameplay periscope 映射，不作为真实 Yasen 潜望镜考证结论。

## Hull Collision

Collision 使用独立文件 `Collision/RU_SSN_Yasen_COLLISION.fbx`，策略为 `separate_fbx`。9 个 UCX 对象全部来自 `Scene Collection/COLLISION`：

- `UCX_RU_SSN_Yasen_LOD0_00`
- `UCX_RU_SSN_Yasen_LOD0_01`
- `UCX_RU_SSN_Yasen_LOD0_02`
- `UCX_RU_SSN_Yasen_LOD0_03`
- `UCX_RU_SSN_Yasen_LOD0_04`
- `UCX_RU_SSN_Yasen_LOD0_05`
- `UCX_RU_SSN_Yasen_LOD0_06`
- `UCX_RU_SSN_Yasen_LOD0_07`
- `UCX_RU_SSN_Yasen_LOD0_08`

这些对象不作为可视 Hull 或 Part 源对象。

## Torpedo Muzzle Socket

第一版只声明一个 torpedo muzzle：

- Assembly id：`torpedo_tube_01_muzzle`
- SUBMOD-031 目标 Anchor：`SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE`
- transform：translation `[38.599311829, -6.763348579, 1.751911044]`, rotation `[0.0, 0.0, 0.0]`, scale `[1.0, 1.0, 1.0]`
- 语义状态：`GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY`
- 来源：只读打开 `Blend/RU_SSN_Yasen_MASTER.blend`，读取当前 `SUB_Yasen_BowDoor_-1_0..2` 与 `SUB_Yasen_BowDoor_1_0..2` 的 evaluated mesh、世界空间包围盒、面积加权法线和 Hull BVH 清障结果。最终选择 `SUB_Yasen_BowDoor_1_2`，因为它位于最前方候选组，经过几何中心舷侧判断和法线翻转后，发射方向 `[0.786318362, -0.617821515, 0.0]` 通过短距射线与保守 sweep 清障。
- gameplay clearance envelope：半径 `0.35m`、长度 `7.0m`。仓库当前没有 Yasen 专用三维鱼雷尺寸映射，因此该 envelope 只是保守 gameplay clearance envelope，不是实艇武器技术参数。
- BVH 清障：起始点最小清障距离 `0.508504152m`，大于 `0.35m` envelope 半径；`8m` 射线无命中；`3.2m` sweep 无命中。详见 `Validation/RU_SSN_Yasen_TORPEDO_MUZZLE_DERIVATION.json` 和 `.md`。
- 该 transform 不是真实 Yasen 鱼雷管测量结果、历史精确位置或军事技术考证结论。

旧辅助 Socket `SOCKET_TORPEDO_01` 的方向与世界 `+X forward` 一致，可以作为历史候选方向记录；但旧位置 `[55.799972534, 0.0, 7.26317358]` 位于 `y=0` 中线，高于当前 Hull 本体顶部，并且与当前 BowDoor 可见几何没有充分对应关系，因此已从正式 Assembly transform 来源中废弃。不得将该旧 transform 复制为新的 Anchor transform。

辅助文件中的 `SOCKET_TORPEDO_02..10` 和 `SOCKET_VLS_01..32` 本阶段不纳入 Assembly，避免把全部武器挂点提前带入首个切片。它们可作为后续 SUBMOD-031/后续 Socket 扩展的输入。

## 未纳入 Hull 的对象及原因

- `SUB_Yasen_PropellerHub`, `SUB_Yasen_PropellerBlade_00..06`：属于 `propulsor_01` 活动件。
- `SUB_Yasen_Tail_01`, `SUB_Yasen_Tail_03`：属于 `rudder_01` 活动件。
- `SUB_Yasen_Tail_00`, `SUB_Yasen_Tail_02`：属于 `stern_planes_01` 活动件。
- `SUB_Yasen_ForwardPlane_00`, `SUB_Yasen_ForwardPlane_01`：属于 `bow_planes_01` 活动件。
- `SUB_Yasen_Mast_2`, `SUB_Yasen_MastHead_2`：属于 `periscope_01` gameplay 映射活动件。
- `UCX_RU_SSN_Yasen_LOD0_00..08`：Hull collision 源对象，不是可视 Hull。
- `RU_SSN_Yasen_LOD0..LOD3`：`EXPORTS` 中的派生 LOD Mesh，不作为模块化源对象。
- `CAM_Deck`, `CAM_Hero`, `CAM_Profile`, `CAM_Propeller`, `CAM_Rear`, `CAM_Sail`, `CAM_Stern`, `Key`, `Fill`, `Rim`：`STUDIO` 相机和灯光，不属于 Assembly。
- `SOCKET_TORPEDO_02..10`, `SOCKET_VLS_01..32`：只存在于 SOCKETS 辅助文件，不在正式 MASTER；本阶段范围外。

## 当前缺失 Anchor

正式 MASTER 当前没有 Empty，因此完整 Assembly 审计应保留以下预期错误：

- `PIVOT_SUB_RU_YASEN_PROPULSOR_01`
- `PIVOT_SUB_RU_YASEN_RUDDER_01`
- `PIVOT_SUB_RU_YASEN_STERN_PLANES_01`
- `PIVOT_SUB_RU_YASEN_BOW_PLANES_01`
- `PIVOT_SUB_RU_YASEN_PERISCOPE_01`
- `SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE`

这些 Anchor 是 SUBMOD-031 的输入。本任务没有创建它们，也没有降低审计器错误级别。

## 验证状态

- `ASSEMBLY CONTRACT TESTED`：JSON Schema 和 TypeScript 契约必须通过。
- `SOURCE OBJECT MATCH VERIFIED`：完整 Blender Assembly 审计必须显示 Hull、Part、Collision 源对象均匹配。
- `HULL/PART EXCLUSIVITY VERIFIED`：自动测试和完整审计必须确认没有重复归属。
- `MASTER READ-ONLY VERIFIED`：审计前后 MASTER 与 SOCKETS 指纹必须一致。
- `PIVOT ANCHORS NOT VERIFIED`：正式 MASTER 缺少 Pivot Empty。
- `SOCKET ANCHORS NOT VERIFIED`：正式 MASTER 缺少 Socket Empty。
- `FBX EXPORT NOT VERIFIED`：SUBMOD-030 不导出 FBX。
- `UE4 NOT VERIFIED`：SUBMOD-030 不进入 UE4。
