# Config/SilentDepth — 运行时数据（生成物）

游戏在运行时读取的 JSON 数据，与 `Config/balance.json` 同级同机制
（`FPaths::ProjectConfigDir()` + `FFileHelper::LoadFileToString`）。

## 唯一权威

**权威是仓库根的 `SilentDepth_Assets/`（生产数据）。** 本目录下的一切都是生成物：

```text
SilentDepth_Assets/                       生产数据（唯一权威）
        │  node tools/ue4/sync-tech-tree-data.mjs
        ▼
ue4/SilentDepthUE/Config/SilentDepth/     运行时副本 + 哈希清单
```

- 运行时只读本目录，绝不读资产库——打包版本旁边没有仓库。
- 反向的"以 Config 为准"不再成立：手工改本目录的文件会被漂移检查判为错误。
- 每个副本的来源与 SHA-256 记录在 `_sync_manifest.json`，`--check` 逐项比对。

## 文件

| 路径 | 内容 |
|---|---|
| `TechTree/*.json` | 五类科技树的目录、层阶与分支文档、兼容矩阵、安装位定义（16 个） |
| `_sync_manifest.json` | 全部运行时副本的来源与哈希清单（19 项，含下列历史副本） |
| `submarine_manifest.json`、`technology_tree.json`、`tier_manifest.json` | 早期手工复制的副本，现纳入同一同步与哈希检查 |
| `research_cost.json` | DEC-004 研究经济数值（手写配置，不是生成物） |

科技树的运行时 schema、加载器与失败关闭规则见
`docs/UE4_TECH_TREE_SCHEMA.md`。

## 检查漂移

```powershell
node tools/ue4/sync-tech-tree-data.mjs --check   # 有漂移则非零退出
node tools/ue4/sync-tech-tree-data.mjs           # 重新生成
```
