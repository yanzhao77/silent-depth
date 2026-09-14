# UE4 工程入口

SILENT DEPTH 唯一开发产品为 UE4.27 独立游戏，目标在 Steam 发售。
产品设计与任务安排从 [文档入口](../docs/README.md) 阅读，不再按历史移植文档安排工作。

## 工程结构

```text
silent-depth/
├── docs/plan/                新产品设计、规格、路线与发行验收
├── SilentDepth_Assets/           权威源资产、科技树数据、生产工具
├── tools/ue4/                    导入、同步、检查与编辑器工具
└── ue4/SilentDepthUE/
    ├── SilentDepthUE.uproject    UE4.27 工程
    ├── Config/                  运行时配置与生成数据副本
    ├── Content/                 UE 二进制资产与关卡
    ├── Source/                  C++ 代码
    ├── ArtSource/               源资产位置说明
    └── docs/                    专项导入资料
```

`ue4` 是当前开发分支。历史版本不再开发、不要求与其同步规则，也不将历史代码自动合入。
文档、源资产与工具继续放在仓库根相应目录；游戏运行时代码位于 UE 工程。

## 构建与验证

需要 Windows 上的 Unreal Engine 4.27、兼容的 Visual Studio C++ 工具链与 SDK。
生成工程文件后可用编辑器或 UBT 构建；精确命令见 [仓库构建入口](../README.md)。
完整门禁见 [测试与 Steam 发行](../docs/plan/10_QA_AND_STEAM_RELEASE.md)。

`Binaries/`、`Intermediate/`、`DerivedDataCache/`、`Saved/`、`.vs/` 和生成的
`*.sln` 不作为源代码提交。Node/ajv 只供离线数据与资产检查，不是游戏运行依赖。
`Config/balance.json` 与 `Config/missions.json` 均已存在；新玩法不要求与历史副本一致。

## 当前启动行为

根据 2026-09-14 的文本配置和源码检查：

- 游戏默认地图是 `/Game/Maps/Ocean_Main.Ocean_Main`。
- 编辑器启动地图是 `/Game/Maps/Submarine_Library.Submarine_Library`。
- 默认 GameMode 使用 `ASubmarinePawn` 与 `ASilentDepthHUD`。
- Pawn 根据存档选择平台，再经平台资产表解析艇体与可动件；不是文档指定的单一硬编码艇。
- 平台表回退项为 `RU_SSN_Akula`；表现回退不代表新产品的初始拥有权规则。
- 航行步进目前仍由 Pawn 持有，是新架构需要移交的明确差距。
- HUD 当前只显示基础航行文字。展厅、海洋驾驶和控件文字不证明完整任务与研究闭环已接通。

以上不是编辑器实测结论。具体证据与限制见 [当前代码基线](../docs/plan/01_CURRENT_BASELINE.md)。

## 资产与数据

源模型、贴图、生产脚本位于 `SilentDepth_Assets/`，不在 UE 工程里另建权威副本。
导入资料见 [工程导入清单](SilentDepthUE/docs/UE427_IMPORT_PLAN.md)，母版与工作副本约束见
[模块化资产管线](../docs/SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md)。

`Config/SilentDepth/` 内既有生成副本，也有手写平台、socket、能力和研究成本配置。
只对同步清单覆盖的文件运行生成流程；手写配置的修改需要独立契约和回归检查。
`*.uasset`、`*.umap` 按二进制管理，不用文本工具编辑。

新港口、会话、战斗和 Steam 发行是目标设计，不是这个工程入口所宣布的已完成能力。
