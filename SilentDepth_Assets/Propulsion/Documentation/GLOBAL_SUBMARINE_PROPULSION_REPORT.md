# GLOBAL SUBMARINE PROPULSION REPORT

生成日期：2026-09-11 · 资产根：`SilentDepth_Assets/Propulsion/`
模板：`Templates/PROPULSION_ASSET_TEMPLATE.md`（v1.0.0，从 Typhoon 母版实测抽取）

---

## 1. 结论摘要

- 建立完成 **20 个推进器 3D 资产**，每一个都具备 Blend、LOD0–LOD3 FBX、
  碰撞 FBX、四视图真实渲染预览、SPEC、README、构建报告与校验报告。
- 建立完成 **19 个推进器家族**、**7 条科技分支 × T1–T10**、
  **54 个平台的兼容性矩阵**。
- `propulsion_validator.py` 对 20 个资产全部判定 **PASS（0 失败 / 0 警告）**。
- 所有 FBX 均为 **FBX 2018 兼容（二进制版本 7400）**，导出后全部做了一次
  Blender 往返导入核验，尺寸与三角面数与构建期一致。
- **20 个资产全部在 UE4.27 编辑器里实际导入成功**，每个都带 4 级 LOD，尺寸 1:1
  （例如 `RU_PROP_Typhoon` 导入后 799.5 × 700 × 700 cm，对应 7.995 m）。
  简单碰撞的脚本化挂接未成功，见第 7 节限制，因此资产状态保持 `VALIDATING`。
- 反应堆、能量转换、涡轮、齿轮箱、电力推进、控制分支按项目规则保持
  `DATABASE_ONLY`，**不产出内部工程模型**。

## 2. 资产清单（20 个，全部 PASS）

| 资产 ID | 类型 | Tier | LOD0 | LOD1 | LOD2 | LOD3 | 类别 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `PROP_T01_EARLY` | PROPELLER | 1 | 1728 | 944 | 464 | 216 | Propellers |
| `PROP_T02_IMPROVED` | PROPELLER | 2 | 2448 | 1296 | 624 | 276 | Propellers |
| `PROP_T03_MULTIBLADE` | PROPELLER | 3 | 3168 | 1648 | 784 | 336 | Propellers |
| `PROP_T04_SKEWED` | PROPELLER | 4 | 3888 | 2000 | 944 | 396 | Propellers |
| `PROP_T05_QUIET` | PROPELLER | 5 | 5328 | 2704 | 1264 | 516 | Propellers |
| `US_PROP_LosAngeles` | PROPELLER | 6 | 5328 | 2704 | 1264 | 516 | Propellers |
| `RU_PROP_Akula` | PROPELLER | 7 | 5328 | 2704 | 1264 | 516 | Propellers |
| `CN_PROP_Type093` | PROPELLER | 7 | 5328 | 2704 | 1264 | 516 | Propellers |
| `RU_PROP_Typhoon` | PROPELLER | 8 | 5584 | 2896 | 1392 | 612 | Propellers |
| `SHAFT_PLAIN` | SHAFT | 2 | 256 | 128 | 64 | 32 | Shafts |
| `SHAFT_GEARED` | SHAFT | 5 | 576 | 288 | 144 | 72 | Shafts |
| `SHAFT_FAIRING_LONG` | SHAFT | 8 | 448 | 224 | 112 | 56 | Shafts |
| `THRUSTER_TUNNEL` | THRUSTER | 6 | 4048 | 2112 | 1024 | 460 | Thrusters |
| `US_PJ_Seawolf` | PUMPJET | 8 | 14016 | 7152 | 3408 | 1464 | PumpJets |
| `US_PJ_Virginia` | PUMPJET | 9 | 14016 | 7152 | 3408 | 1464 | PumpJets |
| `UK_PJ_Astute` | PUMPJET | 9 | 12576 | 6448 | 3088 | 1344 | PumpJets |
| `RU_PJ_Yasen` | PUMPJET | 9 | 12576 | 6448 | 3088 | 1344 | PumpJets |
| `FR_PJ_Suffren` | PUMPJET | 9 | 12576 | 6448 | 3088 | 1344 | PumpJets |
| `PJ_T10_NEXTGEN` | PUMPJET | 10 | 16800 | 8480 | 4000 | 1672 | PumpJets |
| `THRUSTER_RIM_DRIVEN` | THRUSTER | 10 | 6832 | 3440 | 1616 | 668 | Thrusters |

LOD0 三角面合计 **132 848**。每个资产都导出 6 个 FBX：LOD0–3、`_COLLISION`
（UCX 凸包，规范件）、`_COMBINED`（LOD0 合并单网格）与 `_HULLS`（可导入的凸包源）。
所有 FBX 全部通过版本检查；全部资产四视图预览均通过“非背景像素比例”自动检查
（典型值 20%–35%，即资产确实在取景范围内，不是空图）。

## 3. 从 Typhoon 母版抽取的建模规范

只读抽取（`Tools/extract_typhoon_propulsion.py`，从不保存母版）得到的事实：

| 部件 | 三角面 | 尺寸 (m) | 枢轴 |
| --- | ---: | --- | --- |
| `Propeller_Left` / `_Right` | 6348 | 3.933 × 5.884 × 5.797 | (-85.534, ±6.25, -1.25) |
| `Propeller_Shroud_±1` | 1152 | 3.882 × 7.000 × 7.000 | 几何内嵌 |
| `Shaft_Fairing_±1` | 252 | 12.100 × 4.800 × 4.800 | 几何内嵌 |
| `Upper_Rudder_±1` | 828 | 9.640 × 1.516 × 7.100 | (-71.316, ±6.25, 1.0) |
| `Stern_Hydroplane_±1` | 828 | 11.374 × 7.500 × 1.872 | (-69.299, ±7.0, -0.4) |

由此固化为模板规则：米制单位、艏部 +X、旋转部件枢轴落在真实转轴上、
每部件单一材质、单一 UV0、FBX 7400、LOD 比例 1/0.5/0.22/0.085、
碰撞使用独立 UCX 凸包、预览四视图。
**Typhoon 原始资产未被修改。**

## 4. 科技树（7 分支 × T1–T10）

| 分支 | 内容 |
| --- | --- |
| `BRANCH_PROPULSOR` | T1 Early Propeller → T5 Advanced Quiet Propeller → T6/T7 整机与综合推进 → T8 Modern Pump-Jet → T9 Advanced Pump-Jet → T10 Next Generation Propulsion |
| `BRANCH_REACTOR` | T1 Early Naval Reactor → T10 Future Naval Reactor（DATABASE_ONLY） |
| `BRANCH_POWER_CONVERSION` | 蒸汽轮机直驱 → 齿轮减速 → 涡轮发电 → 电力推进 → 综合电力推进 |
| `BRANCH_TRANSMISSION` | 直轴 → 齿轮轴系 → 电力传动 → 混合/综合传动 |
| `BRANCH_SHAFT` | 轴系可视化分支，与传动 Tier 对齐 |
| `BRANCH_THRUSTER` | T3 起隧道侧推 → T10 轮缘驱动 |
| `BRANCH_CONTROL` | 机械/手动 → 模拟量 → 数字 → 综合 → 自动化 → 自主控制 |

推进器分支显式写明：**叶片数量不作为 Tier 判定依据**，Tier 综合时代、技术、
降噪概念、设计成熟度与游戏定位；并且明确区分「历史事实」与「游戏 Tier」。

## 5. 兼容性矩阵

`Manifest/SubmarinePropulsionMatrix.csv` / `submarine_propulsion_compatibility.json`

| 状态 | 平台数 | 含义 |
| --- | ---: | --- |
| CONFIRMED | 7 | 公开资料明确可确认（Typhoon、Akula、Los Angeles、Seawolf、Virginia、Astute、Suffren） |
| REPORTED | 4 | 公开报道支持但无官方确认（Yasen、Yasen-M、Type 093、Type 093B） |
| UNKNOWN | 43 | 公开资料不足，保持 UNKNOWN |
| 有游戏配发计划 | 54 | `game_plan_propulsor_id`，标注为游戏美术计划，不是事实声明 |

示例（与任务书 §13 的链路一致）：

```text
US_SSN_Virginia → US_PJ_Virginia → CONFIRMED
```

## 6. 校验结果

```text
validator_version 1.0.0
assets 20 · passed 20 · failed 0 · warnings 0
```

每个资产在 `Validation/<ASSET_ID>_VALIDATION.json` 里保留了逐项明细：
文件齐全、FBX 版本、LOD 面数单调性与比例、LOD 尺寸一致性（≤2%）、
`origin_rule`、插槽类型、缩放/旋转已应用、UV 与材质完整、命名合规、
碰撞凸包、清单一致性、预览 PNG 有效性。

### UE4.27 编辑器导入实测

命令（本机 `C:\game\Epic Games\UE_4.27`，工程 `ue4/SilentDepthUE`，已启用 PythonScriptPlugin）：

```bash
UE4Editor-Cmd.exe ue4/SilentDepthUE/SilentDepthUE.uproject -run=pythonscript \
  -script="SilentDepth_Assets/Propulsion/Tools/import_ue427_propulsion.py" \
  -unattended -nopause -nosplash -stdout
```

结果写入 `Validation/UE427_IMPORT_REPORT.json`，20 / 20 成功。抽样：

| 资产 | UE LOD 数 | UE 包围盒 (cm) | 期望 (m) |
| --- | ---: | --- | --- |
| `RU_PROP_Typhoon` | 4 | 799.5 × 700.0 × 700.0 | 7.995 × 7.0 × 7.0 |
| `US_PJ_Virginia` | 4 | 578.0 × 570.0 × 570.0 | 5.78 × 5.7 × 5.7 |
| `SHAFT_FAIRING_LONG` | 4 | 1210.0 × 480.0 × 480.0 | 12.1 × 4.8 × 4.8 |
| `THRUSTER_RIM_DRIVEN` | 4 | 55.0 × 162.0 × 162.0 | 0.55 × 1.62 × 1.62 |

## 7. 未验证与已知限制

| 项目 | 状态 |
| --- | --- |
| UE4.27 静态网格导入 + 4 级 LOD + 1:1 尺寸 | **EDITOR VERIFIED**（20/20，见 `UE427_IMPORT_REPORT.json`） |
| UE4.27 简单碰撞的脚本化挂接 | **NOT VERIFIED**（`bulk_set_convex_decomposition_collisions` 参数签名未打通；碰撞资产本身通过校验器检查，可在编辑器里手动挂接 `_HULLS.fbx`） |
| UE4.27 材质、LOD 切换屏幕尺寸、帧率性能 | **NOT VERIFIED**（未测量，无目标硬件证据） |
| 预览的实际观感（取景、构图是否美观） | **NOT VERIFIED**（只有自动化的非背景像素比例检查） |
| 真实尺寸与真实构型 | 除 Typhoon 实测件外，其余几何为**游戏美术取值**，不是公开规格 |
| 转子/定子叶片数量 | 公开资料无法确认，取值为游戏美术参数 |

## 8. 复现方式

```bash
# 单资产
blender --background --factory-startup --python Tools/build_propulsor.py -- \
  --spec Manifest/propulsor_specs.json --id <ASSET_ID> --root <Propulsion 根> --samples 32

# 全流水线（建模 → 数据库 → 校验）
python Tools/run_propulsion_pipeline.py --root <Propulsion 根>

# 只按 UE 厘米约定重导 FBX 并刷新往返证据
blender --background --factory-startup --python Tools/reexport_fbx.py -- --root <Propulsion 根>

# 只重建数据库 / 只校验
python Tools/build_propulsion_database.py --root <Propulsion 根>
python Tools/propulsion_validator.py --root <Propulsion 根>
```

## 9. 后续工作

1. 在 UE4.27 里实际导入并检查 LOD、碰撞、材质与插槽，才能把状态从 `VALIDATING` 提升。
2. 补 `CN_PJ_Type093B` 泵喷资产，填补 093B 的公开报道缺口。
3. 其余 43 个平台的推进器研究：只接受官方/政府/制造商/可靠历史资料，
   无法确认就继续保持 UNKNOWN。
4. 真实航速、噪声、功率、水动力性能一律留到 GAMEPLAY BALANCE 阶段。
