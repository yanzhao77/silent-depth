# SILENT DEPTH Batch A 潜艇生产工单

| 字段 | 内容 |
|---|---|
| 文档状态 | ACTIVE |
| 日期 | 2026-09-13 |
| 依据 | `DEC-003`（首批生产顺序＝Batch A）· `docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md` |
| 范围 | Los Angeles、Virginia、Seawolf、Astute、Suffren 五艘 SSN |
| 前置事实 | 五艘在科技树里**已经是节点**（`PLANNED`），武器/传感器/防御/推进的兼容行**已齐**；缺的是几何与下游产物 |

## 1. 数据侧现状（已完成，无需重做）

刚核对过的结果，五艘的数据行全部就位：

| 平台 | 科技树节点 | 层级 | 武器槽 | 发射接口 | 防御槽 | 传感器行 | 推进行 |
|---|---|---|---|---|---|---|---|
| `US_SSN_LosAngeles` | 有（USA / SSN） | T6 | TORPEDO / MISSILE / VLS | 4×533 mm，12 垂发 | 9 | 13 | 1 |
| `US_SSN_Virginia` | 有 | T9 | TORPEDO / VLS / SPECIAL | 4×533 mm，12 垂发 | 9 | 13 | 1 |
| `US_SSN_Seawolf` | 有 | T8 | TORPEDO / VLS | 8×660 mm，无垂发 | 9 | 13 | 1 |
| `UK_SSN_Astute` | 有 | T9 | TORPEDO / VLS | 6×533 mm，无垂发 | 9 | 13 | 1 |
| `FR_SSN_Suffren` | 有 | T9 | TORPEDO / MISSILE | 4×533 mm，无垂发 | 9 | 13 | 1 |

参考材料也齐了：每艘都有 `README.md`、`REFERENCE.md`、4–5 张参考图与 `PROVENANCE.json`。

## 2. 批次歧义已由数据锁定

各艇 `REFERENCE.md` 都留了"建模前必须确认批次"的待确认项。项目自己的武器数据已经给了答案，
**不需要再拍一次板**：

| 平台 | 参考文档的待确认项 | 数据给出的答案 | 结论 |
|---|---|---|---|
| Los Angeles | Flight I/II（围壳舵）还是 Flight III/688i（艏部舵＋垂发） | 槽位含 `VLS`，12 具垂发 | 按 **Flight II / 688i** 建模（有垂发、艏部水平舵） |
| Virginia | Block I–II（12 垂发）还是 Block III+（2 具大直径筒）/ Block V（VPM） | 12 具垂发、无 SPECIAL 载荷模块数据 | 按 **Block I–II，115 m** 建模；不做 VPM 加长 |
| Seawolf | SSN-21/22（108 m）还是 Jimmy Carter（138 m，带 30 m 多任务段） | 8×660 mm、无垂发、无加长段 | 按 **SSN-21/22，108 m** 建模 |
| Astute | 艏部发射管斜置排布、桅杆群 | 6×533 mm | 按参考文档描述；管口位置以参考图为准 |
| Suffren | 围壳舵＋十字艉舵、桅杆群 | 4×533 mm | 同上 |

**一处数据冲突需要确认**：Seawolf 的 `REFERENCE.md` 写 26.5 英寸（673 mm），
武器清单（`weapon_slots.json`）写 660 mm。管口尺寸是有视觉效果的外形参数，
建模前要定以哪个为准（倾向：口径按清单 660 mm，参考文档的 673 mm 记为资料近似）。

## 3. 每艘的交付物清单

按已完成的三艘（Akula / Yasen / Typhoon）的实际产物，缺一不可：

| # | 产物 | 位置（以 `SilentDepth_Assets/Submarines/SSN/<国家>/<级>/` 为根） |
|---|---|---|
| 1 | Blender 母版（只读，改动只发生在工作副本） | `Blend/<ID>_MASTER.blend` |
| 2 | LOD0–LOD3 | `FBX/<ID>_LOD0..3.fbx` |
| 3 | 碰撞 | `Collision/<ID>_COLLISION.fbx` |
| 4 | 锚点/挂点（`30_ANCHORS`：Pivot + Socket，命名按 DEC-002 §3.3.1） | 母版工作副本内 |
| 5 | 装配文档（`sourceAnchor` 绑定逻辑 id） | `Documentation/<ID>_ASSEMBLY.json` |
| 6 | 规格与校验 | `Documentation/<ID>_SPEC.json`、`Validation/<ID>_VALIDATION.json` |
| 7 | 生成脚本（可复现） | `Source/build_<hull>.py`、`Source/<hull>_geometry.py`、`Source/validate_<hull>.py` |
| 8 | 清单条目（状态从 `PLANNED` 走到 `VALIDATING`，路径与哈希填实） | `Manifest/submarine_manifest.json` |
| 9 | UE 导入（LOD/碰撞/材质） | `/Game/SilentDepth/Art/Submarines/SSN/<国家>/<级>/` |
| 10 | 平台资产表登记（否则游戏里会明确回退到 Akula） | `Config/SilentDepth/platform_assets.json` |
| 11 | 可动部件（螺旋桨/泵喷、方向舵、艉水平舵、艏水平舵、潜望镜/桅杆） | 与母版同目录的独立 FBX + UE 资产 |

## 4. 执行顺序与并行度

流水线计划规定"每批最多 3 艘并行"。建议：

| 波次 | 平台 | 理由 |
|---|---|---|
| 第一波 | Virginia、Los Angeles、Astute | 三艘都是"围壳靠前 + 单轴泵喷/螺旋桨"的主流布局，几何方法可复用；且分属美英，覆盖面最广 |
| 第二波 | Seawolf、Suffren | 海狼的 660 mm 八管与肥硕艇体、絮弗伦的细长体都是独立外形，放第二波单独迭代 |

每艘必须走完第 3 节全部 11 项并通过验收，才能进入下一波。

## 5. Blender 侧步骤（需装有 Blender 5.2.1 的机器）

以 Yasen 的 `run-002` 为模板，实际命令形如：

```bash
# 1) 建工作副本并生成几何（母版只读）
blender --background --python Source/build_<hull>.py -- --gray   # 先出比例证据
blender --background --python Source/build_<hull>.py            # 完整资产
# 2) 校验
blender --background --python Source/validate_<hull>.py
# 3) 导出 staging（LOD / 碰撞 / 可动部件 / ASSEMBLY.json）后交接 Windows
```

## 6. 执行状态（2026-09-13，Blender 5.2.1 已就位）

Blender 5.2.1 装好后（`C:\tools\Blender Foundation\Blender 5.2\`），五艘全部按第 3 节清单产出。

| # | 产物 | 状态 | 证据 |
|---|---|---|---|
| 1–7 | 母版 / LOD0–3 / 碰撞 / 锚点 / 装配文档 / 规格校验 / 生成脚本 | **完成** | 每艘 11 项产物齐全；`Validation/<ID>_VALIDATION.json` 记 `result: PASS` |
| 8 | 清单登记 | **完成** | `Manifest/submarine_manifest.json`：`PLANNED 46 / VALIDATING 8`（原 3 + 新 5） |
| 9 | UE 导入 | **完成** | 每艘 `SM_<ID>`（4 级 LOD）+ 5 个部件网格 + 6 个材质实例 + 1 张贴图；导入器报 0 error |
| 10 | 平台资产登记 | **完成** | `platform_assets.json` 由 3 条增至 8 条，并带 `partOffsetsCm`（部件枢轴取自各自 ASSEMBLY） |
| 11 | 可动部件 | **完成** | 部件 FBX 枢轴已烘进网格（否则 UE 会把舵面摆到 13 m 之外） |

生成脚本与共用库：

```text
SilentDepth_Assets/Submarines/Tools/sd_hull_library.py   参数化艇体与附体
SilentDepth_Assets/Submarines/Tools/sd_hull_pipeline.py  母线、碰撞、LOD、FBX、预览、文档
SilentDepth_Assets/Submarines/Tools/sd_batch_a_params.py 五艘的参数（全部来自各自 REFERENCE.md）
  Submarines/SSN/USA/{Virginia,Los_Angeles,Seawolf}/Source/build_*.py
  Submarines/SSN/{UK/Astute,France/Suffren}/Source/build_*.py
tools/assets/update_submarine_manifest.py                从产物反向登记清单
```

重建命令：

```bash
blender --background --python Source/build_<hull>.py [-- --gray|--no-preview]
python tools/assets/update_submarine_manifest.py <ASSET_ID>
node tools/ue4/sync-tech-tree-data.mjs
UE4Editor-Cmd.exe <uproject> -run=pythonscript -script=tools/ue4/import_submarines.py -unattended
```

### 6.1 完成标签

| 项 | 标签 |
|---|---|
| 几何构建 | **IMPLEMENTED**，自动化几何检查通过（拓扑无边界/非流形/退化面、附体接触、尺寸与对称性断言） |
| 清单与运行时数据 | **DATA TESTED**（`npm run check:runtime-data`，20 个副本一致） |
| UE 导入 | **IMPORTED**（172 资产那次的口径相同：成功导入 ≠ 视觉验收） |
| 自动化 | **TESTED**：UE Automation 70/70，EXIT CODE 0 |
| 实机 | **TESTED**：`-game -nullrhi` 启动加载 8 条平台资产、回退路径与存档自检均正常 |
| 视觉与编辑器验收 | **NOT VERIFIED**：预览图已渲染（每艘 `Preview/*.png`，含 Gray_Hero/Profile/Deck），但**没有人在编辑器里看过这五艘**；`EDITOR VERIFIED` 与 `TARGET HARDWARE VERIFIED` 都未取得 |

### 6.2 已知差距

1. **外形是程序化的**：比例取自 REFERENCE.md，LOD0 约 9.6k–10.2k 三角形（手作的 Yasen 是 96k）。
   与实物照片逐点比对、细节（舱盖、阵列、桅杆形状）属人工美术迭代，本批次未做。
2. **海狼管径冲突未决**：参考文档 673 mm vs 武器清单 660 mm，当前按清单建模。
3. **预览未被人工确认**：我只能保证它被渲染出来了，不能替你判断"像不像"。
4. **前五艘之外的 46 艘**：其中 40 艘已按 `DEC-003` 的 B/C/D 批次产出（见 §7），
   剩余 6 艘停在资料缺口上。

---

## 7. 批次 B/C/D 与后续任务（2026-09-13）

### 7.1 已产出：40 艘

参数不再手写，而是由 `Tools/sd_reference_params.py` 从两处权威数据推导：
各艇的 `REFERENCE.md`（全长、艇宽）与武器 loadout 清单的 `launch_interface`
（管数、垂发、SLBM、口径）。无法解析的艇会被跳过并报明理由，不猜数值。

| 批次 | 平台 |
|---|---|
| B | `CN_SSN_Type093`、`CN_SSN_Type093B`、`RU_SSN_YasenM` |
| C | `US_SSBN_Ohio`、`RU_SSBN_Borei`、`UK_SSBN_Vanguard`、`FR_SSBN_LeTriomphant`、`CN_SSBN_Type094` |
| D | 其余 32 艘 SSN/SSBN（含 Skipjack、Sturgeon、Victor、Sierra、Swiftsure、Trafalgar、Rubis、Delta 系列、Resolution、Type 091/093A/095/092/094A、Arihant 级等） |

SSBN 增加了参考文档反复强调的外形特征：围壳后的**导弹甲板**（Delta 的龟背、
Ohio 的平甲板、Borei 的圆背），并有独立碰撞体与接触断言。

批量入口：

```bash
blender --background --python Tools/build_batch.py -- [--no-preview]
    [--preview-engine=cycles|eevee] [--only=ID,ID] [--include-built]
python tools/assets/update_submarine_manifest.py      # 清单登记（跳过手工资产）
python tools/assets/update_platform_assets.py         # 平台表（含部件枢轴）
node tools/ue4/sync-tech-tree-data.mjs
UE4Editor-Cmd.exe <uproject> -run=pythonscript -script=tools/ue4/import_submarines.py -unattended
```

### 7.2 停在资料缺口上的 6 艘

`RU_SSN_November`、`UK_SSN_AUKUS`、`UK_SSBN_Dreadnought`、`FR_SSBN_SNLE3G`、
`CN_SSBN_Type096`、`IN_SSBN_S5`：`REFERENCE.md` 没有可用的全长/艇宽行
（未来型号或资料不足）。它们保持 `PLANNED`，不按"差不多的数字"建模。

### 7.3 SOCKET-001（完成）

`Source/build_akula_anchors.py` 在**工作副本**上加了 DEC-002 的最小挂点集：
9 个 `SOCKET_SUB_SSN_Akula_*` 锚点（鱼雷发射口、艏声呐、拖曳阵、EW 天线、
诱饵发射器 ×2、推进器、潜望镜），并写出 `Documentation/RU_SSN_Akula_ASSEMBLY.json`
与 `Validation/RU_SSN_Akula_SOCKET_AUDIT.json`。母版哈希校验未变（只读）。
运行时通过同步脚本加载，UE 侧断言锚点命名与注册表令牌映射。

### 7.4 UEASSET-004（完成）

推进导入器原先的凸包接口在 UE4.27 的 Python 签名不匹配，21 个推进资产
**实际都没有碰撞**（报告里 `simple_collision_count = 0`）。已改为先用可靠的
`add_simple_collisions(BOX)`，再尝试用作者凸包升级；重跑后 21/21 都有简单碰撞。

### 7.5 预览图（已补，未人工确认）

45 艘的预览用 EEVEE 批量渲染（Cycles 太慢，46 艘要数小时）。各艇
`Preview/Hero|Profile|Deck|Stern|Propeller|Sail|Rear.png`，引擎记录在
`Validation/<ID>_VALIDATION.json` 的 `preview_engine`。**仍然没有人看过这些图**，
`EDITOR VERIFIED` 依旧未取得。

### 7.6 两个必须记住的事实

1. **FBX 容器字节不可复现**：同样的参数、同样的代码，两次导出的 `.fbx`
   SHA-256 不同（Blender 导出器写入时间戳/文件 ID）。几何本身一致（三角形数、
   尺寸、LOD 比例可复现），但清单里的哈希会随每次重建变化——它不是几何指纹。
2. **`--include-built` 曾覆盖手工资产**：一次批量重跑把 Akula/Yasen/Typhoon 的
   母版换成了参数化重建结果。三个目录已从 git 完整恢复（哈希与清单记录一致），
   并在构建器与清单登记器两处加了"非本管线产出的资产不得重建/重登记"的守卫：
   `sd_reference_params` 只重建 `materials` 含 `SD_hull` 的艇，
   `update_submarine_manifest.py` 不再重登记手工条目。
   教训写在代码注释里：判据必须是"谁产出的"，而不是"有没有产物"。

## 7. 完成后需要同步的登记项

1. `Manifest/submarine_manifest.json`：状态、路径、SHA-256（`tools/ue4/sync-tech-tree-data.mjs` 会带上运行时副本）。
2. `Config/SilentDepth/platform_assets.json`：新增该艇的 hull 与可动部件路径（否则按 `SUB-001` 明确回退）。
3. `Config/SilentDepth/socket_map.json`：新增挂点的注册表令牌映射（未映射会给
   `MISSING_SOCKET_REGISTRY_CATEGORY` 通告）。
4. 五类科技树的节点状态：`PLANNED` → `VALIDATING`（导入并人工验收后再往前走）。
