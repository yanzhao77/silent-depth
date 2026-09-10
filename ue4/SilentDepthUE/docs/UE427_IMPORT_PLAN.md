# UE4.27 导入清单

适用引擎：Unreal Engine 4.27（`SilentDepthUE.uproject`，已启用 `PythonScriptPlugin`、`EditorScriptingUtilities`）。源 FBX 为 binary version 7400（FBX 2018），与本工程目标一致。

**源资产以仓库根为基准**：`SilentDepth_Assets/`（本文件的 `../../../SilentDepth_Assets/`）。

**导入入口只有一个**：`tools/ue4/import_submarines.py`。它按本文件的设置导入几何、LOD、贴图，并建立母材质、材质实例与槽位指派。加新艇只需在脚本顶部的 `ASSETS` 里加一条配置。

```powershell
& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -run=pythonscript -script="C:\workspace\ue4\silent-depth\tools\ue4\import_submarines.py" `
  -unattended -nopause -nosplash -stdout
```

注意：UE 的 Python `print()` 不写 stdout，只写日志。所有输出都在 `Saved/Logs/SilentDepthUE.log` 的 `LogPython` 行里。

## 当前状态

| 资产 | UE 导入 | 槽位指派 | 依据 |
|---|---|---|---|
| RU_SSBN_Typhoon | 已导入 2026-09-10 | 8/8 | 实测记录见下 |
| RU_SSN_Akula | 已导入 2026-09-10 | 6/6 | 实测记录见下 |
| RU_SSN_Yasen | 已导入 2026-09-10 | 7/7 | 实测记录见下 |

资产库 `production_status.json` 里三个艇仍是 `VALIDATING`，那反映的是 Blender 侧流水线状态。回填 `submarine_manifest.json` 的 `lod0..lod3` / `collision` 字段尚未做，字段语义未定，见文末。

## 目标路径约定

```text
/Game/SilentDepth/Art/
├── Materials/                        共享母材质
│   ├── M_SD_Submarine_PBR
│   ├── M_SD_Submarine_Flat
│   └── MI_SD_Fallback                槽位没匹配到材质表时的兜底
└── Submarines/<SSN|SSBN>/<Country>/<Class>/
    ├── SM_<AssetId>                  静态网格，LOD0..3
    ├── Materials/MI_<AssetId>_<槽名>
    └── Textures/T_<AssetId>_*
```

现有 `Content/Meshes/SM_HeroSubmarine` 与 `Content/Materials/M_*` 保持原位不动：它们已被地图引用，改名会断引用。

## 导入设置

静态网格：

| 选项 | 值 | 原因 |
|---|---|---|
| Import Uniform Scale | 1.0 | FBX UnitScaleFactor 100 cm，LOD0 已按米导出 |
| Convert Scene / Convert Scene Unit | On | 与上项配套，勿再乘 100 |
| Import Normals / Tangents | On | 导出时已烘焙切线空间 |
| Generate Lightmap UVs | Off | 资产自带独立打包的 UV1 |
| Auto Generate Collision | Off | 碰撞来自 FBX 内的 UCX 体 |
| Import Materials / Textures | Off | 内嵌贴图会生成 `.001` 空材质，改用自建 MI |
| Combine Meshes | Off | 单网格文件 |

LOD1-3 用 `EditorStaticMeshLibrary.import_lod` 从各自的 FBX 直接导入，不经过中间网格资产。

贴图：

| 贴图 | sRGB | Compression |
|---|---|---|
| `*_BaseColor` | On | Default |
| `*_ORM` | Off | Masks（R=cavity AO, G=roughness, B=metallic） |
| `*_NormalDX` | Off | Normalmap，Flip Green Channel 关闭 |
| `*_NormalGL` | 不导入 | 仅 Blender 使用 |

## 碰撞

**每艘艇的 LOD0 里都已经内嵌了 UCX 凸包**，UE 导入时自动识别为碰撞体：

| 资产 | 导入后凸包数 |
|---|---|
| RU_SSBN_Typhoon | 13 |
| RU_SSN_Akula | 10 |
| RU_SSN_Yasen | 9 |

因此 `Collision/*_COLLISION.fbx` **不再单独导入**。Typhoon 的 `COLLISION.fbx` 与它的 `LOD0.fbx` 甚至字节完全相同；Akula 和 Yasen 的碰撞 FBX 只含 UCX 体，单独导入会产生空资产（已实测）。

## 实测记录

环境 UE 4.27.2-18319896，headless 执行。文档期望值取自各资产的 `Documentation/*_SPEC.json`。

| 项 | Typhoon | Akula | Yasen |
|---|---|---|---|
| LOD 数 | 4 | 4 | 4 |
| 材质槽 | 8 | 6 | 7 |
| LOD0 顶点 | 188,511 | 96,058 | 58,208 |
| UV 通道 | 2 | 2 | 2 |
| 凸包碰撞 | 13 | 10 | 9 |
| 艇长 | 17,500 cm | 11,020 cm | 12,000 cm |
| SPEC 期望长 | 175 m | 110.2 m | 120 m |
| 包围盒 (m) | 175 × 29 × 28.33 | 110.2 × 19.6 × 28.44 | 120 × 17.2 × 21.96 |

包围盒三个轴与 SPEC 的第一组尺寸逐项吻合，说明单位缩放没有重复施加。

## 材质约定

项目原有的 `M_SubmarineHull` / `M_PropellerBronze` / `M_SubmarineWater` 只有 `BaseColor`（向量）+ `Metallic` / `Roughness`（标量），**没有任何贴图参数**，无法承载 PBR 贴图，因此新建两个共享母材质：

| 母材质 | 参数 |
|---|---|
| `M_SD_Submarine_PBR` | `BaseColorTexture`、`ORMTexture`、`NormalTexture`、`ORMWeight`、`NormalWeight`、`NormalStrength`、`Roughness`、`Metallic` |
| `M_SD_Submarine_Flat` | `BaseColor`（向量）、`Roughness`、`Metallic` |

`M_SD_Submarine_PBR` 的接线：

- BaseColor 贴图直连 `MP_BASE_COLOR`。
- ORM 按 R→AO、G→Roughness、B→Metallic。
- 法线走 `sample.RG × NormalStrength → append(Z=1) → lerp((0,0,1), …, NormalWeight) → normalize`，等价于「解码后的 XY 乘 0.45 再归一化」。
- `ORMWeight` / `NormalWeight` 让缺图资产把对应通道退化成标量值，**避免采样未设置的贴图参数**。Yasen 就靠这个：它有 BaseColor 但没有 ORM 和法线。

### 母材质的贴图参数必须有默认贴图

这条踩过一次，代价是三艘艇全部渲染成灰色。

贴图参数如果留空，UE 会回退到引擎的 `DefaultTexture`，而那张贴图的采样器类型是 `Color`。于是 `Normal` 和 `Masks` 两种采样器校验不过：

```text
LogMaterial: Warning: [AssetLog] M_SD_Submarine_PBR.uasset:
  Failed to compile Material for platform PCD3D_SM5, Default Material will be used in game.
  (Node TextureSampleParameter2D) Sampler type is Normal, should be Color for DefaultTexture
  (Node TextureSampleParameter2D) Sampler type is Masks, should be Color for DefaultTexture
```

这是**母材质级**的失败，不是实例级——所以连贴图绑定完好的 Typhoon 也一起退化成默认灰材质，表现为「三艘艇都变成灰黑色」。参数回读一切正常，只有打开编辑器才会暴露。

修法是给三个贴图参数各配一张真实的中性默认贴图，且压缩设置要匹配采样器类型：

| 参数 | 默认贴图 | 压缩设置 | 对应采样器 |
|---|---|---|---|
| `BaseColorTexture` | `T_SD_Default_BaseColor`（纯白 4×4） | `TC_DEFAULT` | Color |
| `ORMTexture` | `T_SD_Default_ORM`（R=255, G=128, B=0） | `TC_MASKS` | Masks |
| `NormalTexture` | `T_SD_Default_Normal`（128,128,255） | `TC_NORMALMAP` | Normal |

三张图由脚本用纯 Python 现场生成 PNG（不需要 Blender 或图像库），导入到 `Materials/Defaults/`。脚本在绑定后会把值读回来并打进日志，所以以后这类失败在导入阶段就能看到。

### 母材质只写一次

`M_SD_Submarine_PBR` / `M_SD_Submarine_Flat` 存在时，脚本只复用、不重建节点图——否则每次运行都会往图里再追加一整份重复节点。改母材质结构需要先把 `Content/SilentDepth/Art` 移走再跑。

### 推进器切分（RU_SSN_Akula）

资产库最初把每艘艇导成单个静态网格，推进器焊在艇体里，桨叶无法单独旋转。**现在由资产工厂自己分开导出**，UE 直接消费：

| 文件 | 内容 |
|---|---|
| `SilentDepth_Assets/.../Akula/FBX/RU_SSN_Akula_LOD0..3.fbx` | 艇体，不含桨叶；LOD0 带 10 个 UCX 碰撞体 |
| `SilentDepth_Assets/.../Akula/FBX/RU_SSN_Akula_PROP.fbx` | 推进器，原点在桨轴（Blender x = -54.4 m，y = z = 0） |

工厂侧实现在 `Source/build_akula_reference.py` → `build_exports()`：按 `07_PROPULSION` 集合把推进器从可视网格里分出来，艇体 LOD 只用剩下的部分；推进器单独合并后把几何平移到桨轴中心、对象变换归零，这样导出的枢轴就是旋转轴。**关键点是不能把桨轴位移留在对象变换上**——UE 导入静态网格时会把对象变换烘进顶点，枢轴留在资产原点，组件再按桨轴摆放就会偏移两次（实测偏了 54 米）。

副作用：艇体长度从 110.2 m 变成 109.1 m（桨叶原先计入包围盒），LOD 材质槽从 6 个降到 5 个。SPEC 的 `exports` 现在含 `RU_SSN_Akula_PROP`。

推进器需要的材质实例由 `import_prop()` 单独补齐——它在艇体上已经不存在，不能指望艇体那一轮建出来。

其余两艘（Typhoon、Yasen）的导出脚本还没做同样的切分，它们的桨叶目前仍焊在艇体里。

材质数值**不在这里发明**，全部取自各艇自己的 Blender 构建脚本：

| 资产 | 来源 |
|---|---|
| Typhoon | 本文件下方表格（该资产的生成脚本未随包提供） |
| Akula | `SilentDepth_Assets/.../Akula/Source/build_akula_drawing.py` → `materials()` |
| Yasen | `SilentDepth_Assets/.../Yasen/Source/build_yasen_v2.py` → `make_materials()` |

Blender 的 Principled Base Color 是线性值，UE 的向量参数也是线性值，所以原样照抄。数值全部记在 `import_submarines.py` 的 `ASSETS[].slots` 里，不重复列在这里以免两处失真。

槽位匹配用子串归一化（去掉非字母数字后按最长键优先）。这解决两个坑：Blender 会给材质加 `_002` 后缀（如 `M_Typhoon_Hull_002`），以及 `Steel` 是 `PaintedSteel` 的子串。没匹配上的槽会指向 `MI_SD_Fallback` 并在日志里逐个列名。

### Akula 贴图的更正

早期版本的本文件写过「`T_Akula_Drawing_*` 是线稿叠加用的技术贴图，不是成品 PBR，默认不导入」——**这是错的**。Akula 当前模型（`SUB_MAT_Drawing_*` 六个槽）的 Hull 和 Antifouling 两个槽用的正是 `T_Akula_Drawing_hull` 和 `T_Akula_Drawing_bottom` 作为 BaseColor。

`T_Akula_Hull_*`、`T_Akula_Rubber_*`、`T_Akula_Reference_*` 属于被放弃的旧版方案（`build_akula_reference.py`），当前模型不引用，因此不导入。

## 未完成与未验证

1. **视觉表现全部 `NOT VERIFIED`。** 材质图接线、贴图绑定、参数值都是程序化回读确认的，没有在编辑器里渲染观察过。法线强度 0.45、ORM 通道观感、Akula 的防污漆与 Yasen 的水线色带是否符合 Blender 里的预期，都需要真看一眼。
2. **LOD 切换屏幕尺寸未认证。** Typhoon 的文档明确写 "deliberately not certified"，需要在编辑器里按本项目的 FOV、观察距离和目标机型实测调整。
3. **碰撞覆盖不完整。** Typhoon 的 UCX 只覆盖艇体与围壳，桅杆、潜浮舵、舵面与桨环都没有；按玩法需要决定是否要补。
4. **光照。** 移动潜艇用 Movable 加动态光照；若要静态烘焙，Lightmap Coordinate Index 设 1，从 2048 起验证 padding 与重叠。
5. **Yasen 缺图。** 没有 ORM 与法线贴图，外观会明显比另外两艘扁平。它的 Hull 水线色带是烘焙在 BaseColor 里的。
6. **`ProjectConfig.json` 已失真。** 其 `asset_root` 等字段仍指向 macOS 旧路径 `/Users/sjw/Documents/...`；`SilentDepth_Assets/Tools/` 脚本用相对路径定位不受影响，但该配置作为记录需要更新。

## 未决事项

`submarine_manifest.json` 里 `master` / `lod0..lod3` / `collision` / `textures` 这些字段目前全是空字符串，语义未定义：既可以填资产库内的源文件相对路径，也可以填 UE 资产路径。两种填法对资产工厂和 UE 侧的意义不同，**在定下来之前不要回填**，否则 54 条记录会各写各的。建议由资产工厂侧先定义字段语义，UE 侧再同步。

## 工程注意事项

**不要在同一个脚本会话里删除并重建资产。** 实测这样会让 UE 崩在 `UnrealEd` + `EditorScriptingUtilities` 的访问违例上（延迟 GC 留下野指针）。脚本因此改成「存在即复用」，需要全量重建时把 `Content/SilentDepth/Art` 移走再跑一次。

**插件。** `PythonScriptPlugin` 是为这套无头导入流程启用的，已写进 `.uproject`。
