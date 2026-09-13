# ue4 — Silent Depth 的 Unreal Engine 4.27 版本

本分支是 SILENT DEPTH 的 UE4.27 实现。Web（TypeScript + Three.js）版本只存在于
`master` 分支，本分支已不再包含它。

```text
silent-depth/                        仓库根
├── config/                          Web 版遗留运行时数据（迁移中）
├── docs/                            设计文档；UE 迁移规划也在这里
├── SilentDepth_Assets/              潜艇源资产库（Blender/FBX/贴图/科技树/工厂工具）
└── ue4/
    └── SilentDepthUE/               UE4.27 工程
        ├── SilentDepthUE.uproject
        ├── Config/                  含 SilentDepth/*.json 运行时数据
        ├── Content/                 .uasset / .umap
        ├── Source/                  C++ 模块
        ├── ArtSource/               源资产位置说明（源文件本身在仓库根）
        └── docs/                    导入清单
```

## 分支策略

- `ue4`：本分支，当前唯一在维护的版本。
- `master`：Web 版历史归档，仅供查阅迁走之前的实现；不要再合并 Web 代码进来。
- `docs/`、`SilentDepth_Assets/`、`tools/ue4/` 属于 UE 版本，留在仓库根，改动照常提交。
- UE 专属改动只落在 `ue4/` 内。

仓库根的 `config/` 是 Web 版遗留数据：`balance.json` 已拷贝为
`ue4/SilentDepthUE/Config/balance.json`（逐字节相同），`missions.json` 尚未迁移，
处置见根 `README.md` 的"待处置"。

## 构建

1. 需要 Unreal Engine 4.27 与 Visual Studio（含 C++ 桌面工作负载）。
2. 右键 `ue4/SilentDepthUE/SilentDepthUE.uproject` → Generate Visual Studio project files。
3. 打开 `SilentDepthUE.sln` 或直接双击 `.uproject` 编译启动。

`Binaries/`、`Intermediate/`、`DerivedDataCache/`、`Saved/`、`.vs/`、`*.sln` 均为生成物，已由工程 `.gitignore` 排除，不要提交。

## 源资产

Blender 工程、FBX 导出、PNG 贴图、生产脚本与科技树都在仓库根的 `SilentDepth_Assets/`，UE 工程内不重复存放。理由与规则见 `ue4/SilentDepthUE/ArtSource/README.md`。

导入步骤见 `ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md`。

## 启动潜艇

当前玩家潜艇是 **RU_SSN_Akula**（Project 971），在 `Source/SilentDepthUE/SubmarinePawn.cpp` 的 `SD_PLAYER_HULL_MESH` 常量里指定。

- 资产按 1:1 比例导入（艇长 110.2 m），艏部朝 +X、Z 轴向上，与 Pawn 的前向一致，因此不需要相对旋转。`SD_PLAYER_HULL_YAW_DEG` 单独留作朝向开关：如果某艘艇的艏部朝向相反，把它设成 180 即可。
- 摄像机臂长、俯视高度、艏艉浪花位置和缩放范围全部由艇体包围盒按比例推导（`SD_CAMERA_ARM_RATIO` 等常量），换一艘艇不用重新调参。
- **可动部件**（螺旋桨、方向舵、艏艉水平舵、潜望镜）都是独立组件，由资产工厂单独导出、枢轴落在各自的铰链轴或中心，艇体 LOD 不含这些几何。C++ 里以 `SD_PLAYER_*_MESH` 和对应的偏移常量接线（桨轴 -5440、方向舵 -3880、尾舵 -3860、艏舵 4340，单位 cm，取自 Blender）。
- 螺旋桨绕艇体局部 X 轴滚转，转速跟航速。方向舵跟着舵令偏转（最大 25°），艏艉水平舵跟着下潜／上浮指令偏转（最大 18°），到达目标深度层后回中。**艏舵与艉舵反向偏转**是对的：艉舵后缘下压抬艉、低头下潜，艏舵则相反。
- 潜望镜高 9.4 m，在 `Periscope` 深度层升起、其余深度层收下，升降各约 2.5 秒；完全收下时桅顶缩进围壳顶面之内。
- 鼠标滚轮向前拉近视角（`ZoomStepCm = 半艇长 × 0.05`）。
- 原来的 `SM_HeroSubmarine`（约 37 m，1.9 倍缩放）不再担任玩家载具，但资产保留，海洋展示场景仍在引用它。

## 仓库体积

本分支会引入 `Content/` 下的 `.uasset` 二进制（约 640 MB，含 StarterContent）。仓库根的 `.gitattributes` 已把 `*.uasset` / `*.umap` 标为 binary，防止 Windows 检出时被行尾归一化破坏。

若后续仓库增长过快，再考虑引入 Git LFS 跟踪 `Content/`；那需要所有克隆方都安装 LFS，属于一次性决策。
