# SILENT DEPTH：UE4 独立游戏

SILENT DEPTH 是使用 **Unreal Engine 4.27** 开发、以 **Steam 发售**为目标的独立潜艇游戏。
当前方向是本地离线单人战术任务、港口配装与科技树成长，采用纯 C++ 权威仿真和 UE4 表现层。
UE4 是唯一开发主线，不再开发 Web 产品，不要求与历史版本保持玩法或数值一致。

从 [游戏规划目录](docs/plan/README.md) 开始阅读；首发范围和具体规则仍是待评审的设计初稿，
不是已实现功能或发售承诺。历史文档只保留用于追溯。

## 仓库结构

```text
silent-depth/
├── docs/                          新产品设计、实施路线与历史归档说明
├── SilentDepth_Assets/            潜艇源资产库（Blender/FBX/贴图/科技树/工厂工具）
├── tools/ue4/                     UE 编辑器自动化脚本（导入、探针、数据同步）
└── ue4/SilentDepthUE/             UE4.27 工程
    ├── SilentDepthUE.uproject
    ├── Config/                    含 balance.json 与 SilentDepth/*.json 运行时数据
    ├── Content/                   .uasset / .umap
    ├── Source/                    C++ 模块
    ├── ArtSource/                 源资产位置说明（源文件在仓库根）
    └── docs/                      导入清单
```

工程细节、启动流程与可动部件接线见 [`ue4/README.md`](ue4/README.md)。

## 构建

1. 需要 Unreal Engine 4.27 与 Visual Studio（含 C++ 桌面工作负载）。
2. 右键 `ue4/SilentDepthUE/SilentDepthUE.uproject` → Generate Visual Studio project files。
3. 打开 `SilentDepthUE.sln` 或直接双击 `.uproject` 编译启动。

`Binaries/`、`Intermediate/`、`DerivedDataCache/`、`Saved/`、`.vs/`、`*.sln` 都是生成物，
已由工程 `.gitignore` 排除，不要提交。

## 验证入口

```powershell
# C++ 编译（UE 4.27.2；本地安装与工程路径需按工作站调整）
& "C:\game\Epic Games\UE_4.27\Engine\Build\BatchFiles\Build.bat" SilentDepthUEEditor Win64 Development `
  -Project="C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" -WaitMutex

# Automation（不替代上面的编译）
& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -ExecCmds="Automation RunTests SilentDepth;Quit" -unattended -nopause -nosplash -nullrhi -stdout `
  -testexit="Automation Test Queue Empty"

# 存档自检 / 科技树探针（显式传参才执行，不进正常流程）
... -game -nullrhi -sd-save-selftest -ExecCmds=Quit
... -game -nullrhi -sd-techtree-probe -ExecCmds=Quit

# 工具脚本依赖（ajv，供资产库的 Assembly schema 校验使用；只需执行一次）
npm install

# 运行时数据副本与资产库是否同步
npm run check:runtime-data

# 资产管线轻量校验：CLI 契约 + 潜艇清单/哈希 + UE 平台资产表交叉引用
npm run check:asset-pipeline
```

完成标签只用 `IMPLEMENTED` / `TESTED` / `EDITOR VERIFIED` / `TARGET HARDWARE VERIFIED`，
不得互相顶替；未在编辑器或目标硬件上观测过的结论一律标 `NOT VERIFIED`。

## 运行时数据

`SilentDepth_Assets/` 是资产库唯一权威；`ue4/SilentDepthUE/Config/SilentDepth/` 中的
生成副本由 `tools/ue4/sync-tech-tree-data.mjs` 管理并记录 SHA-256，漂移会被
`npm run check:runtime-data` 判为失败。该目录同时含手写配置，不能整目录视为生成物。

## 待处置

- `platform_assets.json`、`socket_map.json`、`equipment_effects.json`、`research_cost.json`
  是手写配置，须分别接受契约与集成测试，不得用同步脚本覆盖。
- 当前实现差距与已执行检查见 [代码基线](docs/plan/01_CURRENT_BASELINE.md)。
- 旧迁移方案和 Web 设计不再是需求来源；本轮未删除任何历史资产或修改玩法代码。
