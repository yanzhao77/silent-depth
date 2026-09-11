# Config/SilentDepth — 运行时数据

本目录存放游戏在运行时读取的 JSON 数据，与 `Config/balance.json` 同级同机制（`FPaths::ProjectConfigDir()` + `FFileHelper::LoadFileToString`，见 `Source/SilentDepthUE/Core/Balance.cpp` 与 `SubmarinePawn.cpp`）。

## 文件

| 文件 | 内容 | 来源 |
|---|---|---|
| `technology_tree.json` | 科技树：按 T 级 / 国家 / 艇型组织的解锁节点 | `ArtSource/SilentDepth_Assets/TechnologyTree/` |
| `tier_manifest.json` | 每条资产的 tier、tier 理由、国家、艇型、资产状态 | 同上 |
| `submarine_manifest.json` | 54 条资产的主清单：LOD/碰撞/贴图路径、变体、状态、来源引用 | `ArtSource/SilentDepth_Assets/Manifest/` |

复制于 2026-09-10，源文件生成日期为 2026-09-08 / 09-09。

## 校验哈希

```text
submarine_manifest.json 3cc7e46690bbc34d1840973dedcbb111253e87c67bb987ca0fa0199259299ce7
technology_tree.json    068f5db4e508035f65c204cf99f825d6bffac4b0abcef503a89629900b96c14b
tier_manifest.json      ecb70105553111a6ee6fa20e706b5610b12e6809297a78c28091a1dca1a83b2c
```

## 漂移风险

这三个文件是 `ArtSource/SilentDepth_Assets/` 的副本，而资产工厂的 `Tools/production_runner.py` 与 `Tools/create_submarine_asset.py` 写入的是 `ArtSource` 侧。**两边会各自演进。**

当前约定：

- **`Config/SilentDepth/` 是运行时权威**，游戏与 C++ 只读这里。
- `ArtSource/` 侧是生产流水线的工作区，产出变更后需要显式同步过来。
- `submarine_manifest.json` 的 `lod0..lod3` / `collision` 字段在 UE 导入完成后必须回填，否则清单与实际导入结果不符。

检查是否漂移：

```powershell
Get-ChildItem "Config\SilentDepth\*.json" | ForEach-Object {
  "$($_.Name) $((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())"
}
```
