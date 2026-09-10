# ArtSource — 源资产位置说明

本工程**不在内部存原始美术源文件**。Blender 工程、FBX 导出、PNG 贴图、生产脚本与资产元数据都在仓库根的 `SilentDepth_Assets/`：

```text
silent-depth/                        仓库根
├── SilentDepth_Assets/              原始源资产（单一来源）
│   ├── Submarines/<类型>/<国家>/<级>/
│   ├── TechnologyTree/  Manifest/  Documentation/  Templates/  Tools/
└── ue4/SilentDepthUE/               本工程
    └── ArtSource/                   这个文件
```

相对路径是 `../../../SilentDepth_Assets/`。

## 为什么不放在工程内

`Content/` 只放 `.uasset` / `.umap`。原始 `.blend`、`.tar.gz` 和未导入的 FBX 放进去只会污染内容浏览器、诱发重复导入，并让同一批文件在仓库里出现两份。源资产在仓库根已经受版本控制，是唯一来源。

## Blender 脚本

`SilentDepth_Assets/Tools/` 下的脚本用相对路径定位（`Path(__file__).resolve().parents[1]`），在源资产目录内直接运行即可，与本工程位置无关。

## 规则

1. 不要往 `Content/` 里复制原始文件。
2. 每个资产的 `Documentation/<AssetId>_SPEC.json` 是导入前的权威记录（几何统计、尺寸、材质槽、许可、sha256）。
3. 导入后把实际资产路径回填进 `Config/SilentDepth/submarine_manifest.json` 的 `lod0..lod3` / `collision` 字段。
4. `Documentation/References/` 下的用户提供参考图著作权未核实，不得导入 UE，不得进入运行时包。
5. 贴图只导入 `NormalDX`；`NormalGL` 是 Blender 用的反向通道法线。

## 相关文档

- `../docs/UE427_IMPORT_PLAN.md` — 三个已完成资产的逐项导入清单
- `../Config/SilentDepth/README.md` — 运行时数据来源、哈希与漂移约定
