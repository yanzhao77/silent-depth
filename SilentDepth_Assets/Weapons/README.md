# SILENT DEPTH 全球潜艇武器资产工厂

本目录在既有潜艇科技树（`../Manifest/submarine_manifest.json`，54 艘 SSN/SSBN）
之上建立第二套科技树：**武器科技树 + 兼容矩阵 + 装备系统 + 武器 3D 资产库**。
两套科技树彼此独立，仅通过兼容关系连接。

```text
Weapon Library -> Weapon Tree (T1-T10) -> Compatibility Matrix -> Submarine Loadout -> 3D Assets
```

## 目录结构

| 目录 | 内容 |
| --- | --- |
| `Manifest/` | Weapon Family/Variant 清单、兼容矩阵、Loadout、生产队列 |
| `TechnologyTree/` | T1-T10 科技树（json / md / csv）、UI 数据、解锁依赖 |
| `Templates/Weapon/` | 武器母模板、UE4.27 导出预设、校验规则 |
| `Tools/` | 全部构建器、几何工具包、Blender 工厂、校验器、报告生成器 |
| `Documentation/` | 潜艇武器整合审计、覆盖报告、总报告、运行日志 |
| `Validation/` | 全库校验汇总 |
| `Torpedoes/` `AntiShipMissiles/` `LandAttackMissiles/` `AntiSubmarineMissiles/` `BallisticMissiles/` `Strategic/` `Mines/` `Decoys/` `SpecialPayload/` | 每个武器的独立资产目录 |

每个武器资产目录包含：`Source/ Blend/ FBX/ LOD/ Collision/ Textures/ Preview/
Documentation/ Validation/`。

## 数据流与单一数据源

```text
Tools/weapon_dataset.py
  ├─ data_torpedoes.py     鱼雷
  ├─ data_missiles.py      反舰 / 对陆攻击导弹
  ├─ data_slbm.py          潜射弹道导弹
  ├─ data_strategic.py     战略级武器 + 补齐的 SLBM（R-39 / Polaris A3TK）
  ├─ data_support.py       反潜导弹 / 水雷 / 诱饵 / 特种载荷
  ├─ data_submarine_fits.py 潜艇发射接口与兼容关系
  └─ weapon_production_curation.py 本轮 3D 生产决策
        ↓
  构建器（Manifest / TechnologyTree / Compatibility / Loadout / Queue / Reports）
        ↓
  weapon_geometry_kit.py -> weapon_factory_blender.py -> Blender -> FBX / Preview
```

添加新武器只需在对应分册中增加一条记录，然后重新运行构建器；
**禁止手工修改几十个派生文件**。

## 重新生成全部派生数据

```powershell
cd SilentDepth_Assets\Weapons\Tools
python build_weapon_manifest.py
python build_technology_tree.py
python build_compatibility.py
python build_loadout.py
python build_production_queue.py
python audit_submarine_weapon_integration.py
python build_weapon_assets.py            # 按生产决策调用 Blender 工厂
python weapon_validator.py --only-built  # 结构 / FBX / 几何 / LOD 校验
python build_reports.py                  # 覆盖报告与总报告
```

## 规则摘要

- **T1-T10 是游戏科技树层级**，不是现实军事等级。
- **Family -> Variant**：外观一致的型号共享基础几何，仅在数据层区分。
- **兼容等级**：`CONFIRMED` / `PROBABLE` / `GAMEPLAY` / `INCOMPATIBLE` / `UNKNOWN`，
  未确认的关系绝不写成 `CONFIRMED`。
- **不虚构**：尺寸未知时使用 `ESTIMATED` / `GAMEPLAY_SCALE` 并说明原因。
- **不越界**：不修改潜艇模型、不触碰 gameplay / combat / AI / sonar / physics /
  save / balance / mission / world 代码。
- **离线**：运行时无任何外部网络依赖。

## 未验证项（如实披露）

- UE4.27 编辑器内导入与材质重建：未在本机执行 → **NOT VERIFIED**
- 预览图与图标的人工目视确认：本机未执行（仅完成渲染统计检查）
- 目标硬件性能（FPS / 显存）：**NOT VERIFIED**
