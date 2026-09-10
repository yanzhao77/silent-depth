# UE4.27 导入清单

适用引擎：Unreal Engine 4.27（`SilentDepthUE.uproject`，`GLTFImporter` 已启用）。源 FBX 为 binary version 7400（FBX 2018），与本工程目标一致。

**源资产路径以仓库根为基准**：`SilentDepth_Assets/`（即本文件的 `../../../SilentDepth_Assets/`，见 `ArtSource/README.md`）。

## 当前状态

| 资产 | UE 导入 | 依据 |
|---|---|---|
| RU_SSBN_Typhoon | 已导入 2026-09-10 | `tools/ue4/import_typhoon.py`，实测记录见下 |
| RU_SSN_Akula | 未导入 | 仅 Blender 侧校验 |
| RU_SSN_Yasen | 未导入 | 仅 Blender 侧校验 |

三个资产在资产库 `production_status.json` 中仍是 `VALIDATING`：那反映的是 Blender 侧流水线状态，回填 `submarine_manifest.json` 的 `lod0..lod3` / `collision` 字段尚未做（字段语义未定，见文末）。

### RU_SSBN_Typhoon 实测记录

环境：UE 4.27.2-18319896，headless 执行 `UE4Editor-Cmd -run=pythonscript`。

| 项 | 文档期望 | 实测 |
|---|---|---|
| LOD 数 | 4 | 4 |
| 材质槽 | 8 | 8 |
| 艇长 | 175 m = 17,500 cm | 17,500 cm |
| 包围盒 | 175 x 29 x 28.33 m | 175 x 29 x 28.33 m |
| UCX 碰撞体 | 13 | 13 |
| 贴图 | 6 张 | 6 张，sRGB 与压缩设置按下方表格 |

产物位于 `/Game/SilentDepth/Art/Submarines/SSBN/Russia/Typhoon/`，共 10 个 uasset（46 MB）。LOD1-3 的源网格保留在同目录 `LODSources/` 下，供后续重新挂载 LOD。

材质由 `tools/ue4/build_typhoon_materials.py` 建立，8 个槽已全部指派并回读校验通过。

### 材质约定

项目原有的 `M_SubmarineHull` / `M_PropellerBronze` / `M_SubmarineWater` 只有 `BaseColor`（向量）+ `Metallic` / `Roughness`（标量），**没有任何贴图参数**，无法承载 PBR 贴图，因此新建两个共享母材质：

| 母材质 | 位置 | 参数 |
|---|---|---|
| `M_SD_Submarine_PBR` | `/Game/SilentDepth/Art/Materials/` | `BaseColorTexture`、`ORMTexture`、`NormalTexture`、`NormalStrength` |
| `M_SD_Submarine_Flat` | `/Game/SilentDepth/Art/Materials/` | `BaseColor`（向量）、`Roughness`、`Metallic` |

`M_SD_Submarine_PBR` 的接线：BaseColor 贴图直连；ORM 按 R=AO、G=Roughness、B=Metallic 拆通道；法线走 `sample.RG × NormalStrength → append(Z=1) → normalize`，等价于「解码后的 XY 乘 0.45 再归一化」，强度以参数暴露给实例。母材质本身不带默认贴图，由实例提供。

每个艇的材质实例放在该艇目录的 `Materials/` 下，命名 `MI_<AssetId>_<槽名>`：

| 槽 | 实例 | 类型 |
|---|---|---|
| Hull | `MI_RU_SSBN_Typhoon_Hull` | PBR，Hull 三张贴图，NormalStrength 0.45 |
| Rubber | `MI_RU_SSBN_Typhoon_Rubber` | PBR，Rubber 三张贴图，NormalStrength 0.45 |
| PaintedSteel | `MI_RU_SSBN_Typhoon_PaintedSteel` | Flat，0.68 / 0.10 |
| Recess | `MI_RU_SSBN_Typhoon_Recess` | Flat，0.83 / 0.00 |
| Steel | `MI_RU_SSBN_Typhoon_Steel` | Flat，0.40 / 0.82 |
| Propeller | `MI_RU_SSBN_Typhoon_Propeller` | Flat，0.43 / 0.84 |
| Markings | `MI_RU_SSBN_Typhoon_Markings` | Flat，0.75 / 0.00 |
| OpticalGlass | `MI_RU_SSBN_Typhoon_OpticalGlass` | Flat，0.19 / 0.12 |

槽名匹配用了子串归一化（去掉非字母数字后按最长键优先匹配），因为 Blender 导出时给材质加了 `_002` 后缀，如 `M_Typhoon_Hull_002`。后续 54 艘艇可以沿用同一套母材质，只换实例。

**视觉表现未验证**：材质图的接线与参数是程序化回读确认的，没有在编辑器里渲染观察过。首次打开编辑器时建议检查法线强度是否合适、ORM 通道是否与 Blender 中的观感一致。

## 目标路径约定

```text
/Game/SilentDepth/Art/Submarines/<SSN|SSBN>/<Country>/<Class>/
  SM_<AssetId>                     静态网格，LOD0..3 进 LOD 槽
  Materials/MI_<AssetId>_<Slot>
  Textures/T_<AssetId>_<Map>
```

现有 `Content/Meshes/SM_HeroSubmarine` 与 `Content/Materials/M_*` 保持原位不动：它们已被地图引用，改名会断引用。

## 通用静态网格导入设置

| 选项 | 值 | 原因 |
|---|---|---|
| Import Uniform Scale | 1.0 | FBX UnitScaleFactor 100 cm，LOD0 已按米导出 |
| Convert Scene / Convert Scene Unit | On | 与上项配套，勿再乘 100 |
| Import Normals / Tangents | On | 导出时已烘焙切线空间 |
| Generate Lightmap UVs | Off | 资产自带独立打包的 UV1 |
| Auto Generate Collision | Off | 碰撞由 UCX 或独立 FBX 提供 |
| Import Materials / Textures | Off | FBX 内嵌贴图会生成 `.001` 空材质，改用自建 MI |
| Combine Meshes | Off | 单网格文件（含 UCX helpers） |

贴图导入设置：

| 贴图 | sRGB | Compression |
|---|---|---|
| `*_BaseColor` | On | Default |
| `*_ORM` | Off | Masks（R=cavity AO, G=roughness, B=metallic） |
| `*_NormalDX` | Off | Normalmap，Flip Green Channel 关闭 |
| `*_NormalGL` | 不导入 | 仅 Blender 使用 |

## 逐资产清单

### RU_SSBN_Typhoon（Project 941）

源目录 `SilentDepth_Assets/Submarines/SSBN/Russia/Typhoon_Project941`，目标 `SSBN/Russia/Typhoon`。

- **LOD0** `FBX/RU_SSBN_Typhoon_LOD0.fbx`（15,360,172 B，sha256 `66894182...`）内含 13 个 UCX 凸包，且与 `Collision/RU_SSBN_Typhoon_COLLISION.fbx` **字节完全相同**。两者是同一个文件，只导入一次，由它提供碰撞。
- **LOD1/2/3** 为三个独立 FBX，分别在静态网格编辑器的 LOD1/2/3 槽导入。
- 三角面 152,234 / 76,116 / 33,490 / 12,938，8 个材质槽。
- 长度 175 m，导入后应为 17,500 cm。主 pivot 在艇体纵向中心与垂向基准，**不在龙骨**。艏为 +X，FBX 元数据为 -Y forward / Z up；脚本驱动运动前先确认 Actor 前向。
- 贴图：Hull BaseColor 4096x2048、Hull ORM、Rubber BaseColor 2048x2048、Rubber ORM，外加两张 `NormalDX`。

材质槽（照此建 MI；Blender 可能给名字加数字后缀，不影响用途）：

| 槽 | Base Color | Roughness | Metallic |
|---|---|---|---|
| Hull | Hull BaseColor | ORM G | ORM B |
| Rubber | Rubber BaseColor | ORM G | ORM B |
| PaintedSteel | 0.025, 0.033, 0.037 | 0.68 | 0.10 |
| Recess | 0.004, 0.006, 0.007 | 0.83 | 0.00 |
| Steel | 0.19, 0.23, 0.25 | 0.40 | 0.82 |
| Propeller | 0.25, 0.18, 0.075 | 0.43 | 0.84 |
| Markings | 0.54, 0.58, 0.56 | 0.75 | 0.00 |
| OpticalGlass | 0.004, 0.012, 0.016 | 0.19 | 0.12 |

法线强度按 Blender 的 0.45 处理（解码后的 XY 乘 0.45 再归一化）。OpticalGlass 是不透明深色外舷玻璃，不是可透视内舱的透明着色器。

### RU_SSN_Akula

源目录 `SilentDepth_Assets/Submarines/SSN/Russia/Akula`，目标 `SSN/Russia/Akula`。

- **LOD0** `FBX/RU_SSN_Akula_LOD0.fbx`（15,388,268 B，sha256 `56629b1a...`）。
- **碰撞体是独立文件** `Collision/RU_SSN_Akula_COLLISION.fbx`（212,220 B，sha256 `e77c4789...`），与 LOD0 不同，需要单独导入并指定为简单碰撞。
- 三角面 130,428 / 67,822 / 31,301 / 12,390，6 个材质槽。SPEC 未列出槽名，导入后按 Blender 侧材质名核对。
- 长度 110.2 m，艇宽 13.6 m；含舵面的外接尺寸为 19.6 x 28.44 m。
- 贴图：Hull / Rubber 各一套 BaseColor + ORM + NormalDX。
- `T_Akula_Drawing_hull.png`、`T_Akula_Drawing_bottom.png` 与 `T_Akula_Reference_*` 是线稿叠加与参考对齐用的技术贴图，**不是成品 PBR，默认不导入**。
- `Documentation/References/UserBoards/` 是用户提供的参考图，著作权未核实，**不得进入运行时包**。

### RU_SSN_Yasen（Project 885）

源目录 `SilentDepth_Assets/Submarines/SSN/Russia/Yasen`，目标 `SSN/Russia/Yasen`。

- **LOD0** `FBX/RU_SSN_Yasen_LOD0.fbx`（10,624,604 B，sha256 `104d1c31...`），内含碰撞代理。
- **碰撞体独立文件** `Collision/RU_SSN_Yasen_COLLISION.fbx`（74,652 B，sha256 `dbcb28e3...`），与 LOD0 不同。
- 三角面 96,668 / 48,334 / 21,266 / 7,732。
- 长度 120 m，含推进器外接尺寸 17.2 x 21.96 m。
- **贴图缺口**：只有一张 `T_YasenV2_Hull_BaseColor.png`（44 KB），没有 Normal 与 ORM。导入后需要补程序化材质或后续补图，否则外观会明显扁平。
- 另有 `GLB/RU_SSN_Yasen.glb`（2,960,748 B）。UE4.27 的 GLTFImporter 可以读，但带 LOD 与碰撞的静态网格走 FBX 更可靠，GLB 仅作对外分发与对照用。
- 这是 Project 885 原型，**不是 885M**；外形参考核对为 `NOT VERIFIED`。

### 其余 51 个目录

只有一份约 280 字节的 README 占位，没有几何与贴图，**不要导入**。它们由 `SilentDepth_Assets/Tools/create_submarine_asset.py` 生成，属于工厂排队位。

## 导入后仍需处理

1. **LOD 切换屏幕尺寸未认证。** Typhoon README 明确写 "deliberately not certified"，需要在编辑器里按本项目的 FOV、观察距离和目标机型实测调整。
2. **碰撞不完整。** Typhoon 的 UCX 只覆盖艇体与围壳，桅杆、潜浮舵、舵面与桨环都没有；按玩法需要决定是否要挡。
3. **光照。** 移动潜艇用 Movable 加动态光照；若要静态烘焙，Lightmap Coordinate Index 设 1，从 2048 起验证 padding 与重叠。
4. **命名与注册。** 导入后把实际资产路径写回 `submarine_manifest.json` 的 `lod0..lod3` / `collision` 字段，并把三个资产从 `VALIDATING` 推进。
5. **ProjectConfig.json 已失真。** 其 `asset_root` 等字段仍指向 macOS 旧路径 `/Users/sjw/Documents/...`；`SilentDepth_Assets/Tools/` 脚本用相对路径定位不受影响，但该配置作为记录需要更新。

## 未决事项

`submarine_manifest.json` 里 `master` / `lod0..lod3` / `collision` / `textures` 这些字段目前全是空字符串，语义未定义：既可以填资产库内的源文件相对路径，也可以填 UE 资产路径。两种填法对资产工厂和 UE 侧的意义不同，**在定下来之前不要回填**，否则 54 条记录会各写各的。建议由资产工厂侧先定义字段语义，UE 侧再同步。
