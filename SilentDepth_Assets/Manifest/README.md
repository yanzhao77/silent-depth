# 潜艇清单约定

本目录的 `submarine_manifest.json` 是潜艇资产的唯一清单：科技树同步与 UE 导入都以它为
入口，没有登记在里面的艇对运行时不可见。`production_status.json` 记录批次与队列顺序，
`variants.json` 记录变体关系。

## 命名与定位（只有一条规则）

清单条目与磁盘目录之间**只用 `asset_id` 关联**，不靠显示名或目录名互相猜：

```text
asset_id = US_SSN_LosAngeles
   -> 文件前缀：<asset_id>_MASTER.blend / _LOD0..3.fbx / _COLLISION.fbx / _SPEC.json
   -> 定位键：  Submarines/<type>/<country>/<任意目录名>/Documentation/<asset_id>_SPEC.json
```

- `asset_id`：全库唯一，也是所有产物文件名的前缀。
- `class`：给人看的显示名，**可以含空格**（`"Los Angeles"`、`"Type 093"`、
  `"George Washington"`），不参与路径解析。
- 目录名：用下划线（`Los_Angeles`、`Typhoon_Project941`、`Type_094A`），
  与 `class` 不要求逐字相同；带项目后缀的艇（Typhoon）也只在这里体现。
- 因此 `Documentation/<asset_id>_SPEC.json` 是唯一权威定位键。校验器与
  `tools/assets/update_submarine_manifest.py` 使用同一条规则。

## 字段来源

| 字段 | 来源 |
|---|---|
| `status` | 该艇 `Documentation/<asset_id>_SPEC.json` 的 `status`；产物不全时由脚本保留 `PLANNED` 并写明缺什么 |
| `master` / `lod0..3` / `collision` / `source` / `previews` / `textures` | 由 `tools/assets/update_submarine_manifest.py` 按实际产物填写 |
| `sha256` | 键相对艇目录（分隔符 `/` 或 `\` 都可以），只在文件真实产出后写入 |
| `materials` / `references` / `variants` | 允许手工维护 |

只有 MASTER、四档 LOD、碰撞 FBX、验证文件与 SPEC 全部存在时，脚本才会把艇提升出
`PLANNED`；半成品不得看起来像已完成。

## 校验

```bash
npm run check:asset-pipeline
```

它检查清单结构（`asset_id` 唯一、`country/type/class/tier` 合法）、已声明哈希是否匹配、
以及 UE 平台资产表是否引用了清单里存在的平台。
