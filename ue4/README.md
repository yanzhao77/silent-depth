# ue4 — Silent Depth 的 Unreal Engine 4.27 版本

本分支是 SILENT DEPTH 的 3D 实现，与 `master` 上的 Web（TypeScript + Three.js）版本**并存于同一仓库**。

```text
silent-depth/                        仓库根
├── src/ public/ tests/ config/      Web 版本（master 与 ue4 分支共用）
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

- `master`：Web 版本，保持可发布。
- `ue4`：本分支。从 `master` 的 `3b21934` 分出，在 `ue4/` 目录下新增 UE 工程。
- Web 与 UE 共用的内容（`docs/`、`SilentDepth_Assets/`）放在仓库根，**两边都能看见**。
- UE 专属改动只落在 `ue4/` 内，避免与 Web 版本互相冲突。

同步 Web 侧更新：

```bash
git fetch local master && git merge local/master     # local 远程指向本地 E: 仓库
git fetch origin master && git merge origin/master   # 或从 GitHub 拉取
```

## 构建

1. 需要 Unreal Engine 4.27 与 Visual Studio（含 C++ 桌面工作负载）。
2. 右键 `ue4/SilentDepthUE/SilentDepthUE.uproject` → Generate Visual Studio project files。
3. 打开 `SilentDepthUE.sln` 或直接双击 `.uproject` 编译启动。

`Binaries/`、`Intermediate/`、`DerivedDataCache/`、`Saved/`、`.vs/`、`*.sln` 均为生成物，已由工程 `.gitignore` 排除，不要提交。

## 源资产

Blender 工程、FBX 导出、PNG 贴图、生产脚本与科技树都在仓库根的 `SilentDepth_Assets/`，UE 工程内不重复存放。理由与规则见 `ue4/SilentDepthUE/ArtSource/README.md`。

导入步骤见 `ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md`。

## 仓库体积

本分支会引入 `Content/` 下的 `.uasset` 二进制（约 640 MB，含 StarterContent）。仓库根的 `.gitattributes` 已把 `*.uasset` / `*.umap` 标为 binary，防止 Windows 检出时被行尾归一化破坏。

若后续仓库增长过快，再考虑引入 Git LFS 跟踪 `Content/`；那需要所有克隆方都安装 LFS，属于一次性决策。
