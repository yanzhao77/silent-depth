# SILENT DEPTH — Unreal Engine 4.27

本分支是 SILENT DEPTH 的 **UE4.27 版本**：纯 C++ 权威仿真 + UE4 表现层。
早期 Web 版（TypeScript + Three.js）**只保留在 `master` 分支**，本分支已不再包含
`src/`、`tests/`、`public/`、Web 构建配置与 Web 测试工具链。

## 仓库结构

```text
silent-depth/
├── docs/                          设计文档 + UE 迁移规划（UE 版的需求来源）
├── SilentDepth_Assets/            潜艇源资产库（Blender/FBX/贴图/科技树/工厂工具）
├── tools/ue4/                     UE 编辑器自动化脚本（导入、探针、数据同步）
├── config/                        Web 版遗留运行时数据（待迁移，见下）
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
# C++ 编译 + Automation（UE 4.27.2）
& "C:\game\Epic Games\UE_4.27\Engine\Binaries\Win64\UE4Editor-Cmd.exe" `
  "C:\workspace\ue4\silent-depth\ue4\SilentDepthUE\SilentDepthUE.uproject" `
  -ExecCmds="Automation RunTests SilentDepth;Quit" -unattended -nopause -nosplash -nullrhi -stdout

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

`SilentDepth_Assets/` 是资产库唯一权威，`ue4/SilentDepthUE/Config/SilentDepth/` 是运行
时副本，由 `tools/ue4/sync-tech-tree-data.mjs` 生成并逐文件记录 SHA-256，漂移会被
`npm run check:runtime-data` 判为失败。

## 待处置

- `Config/SilentDepth/platform_assets.json`、`socket_map.json`、`equipment_effects.json`
  是手写配置，但没有纳入 `sync-tech-tree-data.mjs` 的哈希清单，漂移检查覆盖不到它们。
- `docs/` 里仍有描述 Web 版实现的文档（`GAME_ARCHITECTURE.md`、`V2_*` 等）；它们是
  UE4 迁移的需求来源，暂时保留，改动时不要按它们去仓库里找 `src/`。
