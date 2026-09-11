# SILENT DEPTH — 全球潜艇推进系统资产库

推进系统（Propulsion）资产库。建模规范来自 Typhoon 母版的只读实测抽取，
几何由参数化工厂生成，导出目标为 FBX 2018 兼容（二进制 7400）+ UE4.27。

## 先看这三份

1. `Documentation/GLOBAL_SUBMARINE_PROPULSION_REPORT.md` — 总报告（资产清单、校验、UE 实测、限制）
2. `Templates/PROPULSION_ASSET_TEMPLATE.md` — 从 Typhoon 抽取的建模规范
3. `Documentation/PROPULSION_FACTORY_DESIGN.md` — 需求、架构与接口契约

## 目录

| 目录 | 内容 |
| --- | --- |
| `Propellers/` `PumpJets/` `Shafts/` `Thrusters/` | 20 个 3D 推进器资产（Blend / LOD0–3 FBX / Collision / Preview / SPEC / README / Validation） |
| `Manifest/` | 清单、家族、兼容性矩阵、CSV、参数规格 |
| `TechnologyTree/` | 7 条分支 × T1–T10 的游戏科技树 |
| `Templates/` | 建模规范与插槽表 |
| `Tools/` | 抽取、工厂、数据库、校验、UE 导入脚本 |
| `Documentation/` | 设计、覆盖报告、公开资料研究结果、总报告 |
| `Reactors/` `PowerConversion/` `Turbines/` `Gearboxes/` `ElectricDrive/` `Control/` | `DATABASE_ONLY`：只有公开技术路线条目，不产出内部工程模型 |

## 常用命令

```bash
# 全流水线：建模 → 数据库 → 校验
python Tools/run_propulsion_pipeline.py --root <本目录>

# 单个资产
blender --background --factory-startup --python Tools/build_propulsor.py -- \
  --spec Manifest/propulsor_specs.json --id <ASSET_ID> --root <本目录> --samples 32

# 只重建数据库 / 只校验
python Tools/build_propulsion_database.py --root <本目录>
python Tools/propulsion_validator.py --root <本目录>

# 按 UE 厘米约定重导 FBX（并刷新往返证据）
blender --background --factory-startup --python Tools/reexport_fbx.py -- --root <本目录>

# UE4.27 编辑器导入
UE4Editor-Cmd.exe ue4/SilentDepthUE/SilentDepthUE.uproject -run=pythonscript \
  -script="SilentDepth_Assets/Propulsion/Tools/import_ue427_propulsion.py" \
  -unattended -nopause -nosplash -stdout
```

## 边界

- 不记录核燃料、核材料、堆内结构、功率、航速、噪声、水动力性能等任何数值；
  那些属于 GAMEPLAY BALANCE 阶段。
- 除 Typhoon 母版实测件之外，几何都是**游戏美术取值**，不是公开规格。
- 无法从公开资料确认的兼容性一律保持 `UNKNOWN`。
- 本目录不修改 `SilentDepth_Assets/Submarines/.../Typhoon_Project941` 里的原始资产。
