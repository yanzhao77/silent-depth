#!/usr/bin/env python3
"""Writes the human-readable coverage report for the defensive system database."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    COMPATIBILITY_LEVELS,
    DOC_DIR,
    MANIFEST_DIR,
    TODAY,
    load_json,
    save_text,
)


def build_report() -> str:
    family_db = load_json(MANIFEST_DIR / 'defensive_system_family.json')
    compat = load_json(MANIFEST_DIR / 'submarine_defensive_compatibility.json')
    manifest = load_json(MANIFEST_DIR / 'defensive_system_manifest.json')
    loadout = load_json(MANIFEST_DIR / 'defensive_loadout_manifest.json')

    lines: list[str] = []
    lines.append('# 潜艇防御系统覆盖报告')
    lines.append('')
    lines.append(f'生成日期：{TODAY}')
    lines.append('')
    lines.append('本报告是**游戏科技树**的覆盖统计。不含真实电子战参数、频率、功率、欺骗逻辑或作战战术。')
    lines.append('')
    lines.append('## 1. 家族与变体')
    lines.append('')
    totals = family_db['totals']
    lines.append(f"- 分支：{totals['branches']}")
    lines.append(f"- 家族：{totals['families']}")
    lines.append(f"- 变体（家族 × 国家）：{totals['variants']}")
    lines.append(f"- 有 3D 资产的家族：{totals['families_with_asset']}")
    lines.append(f"- 仅数据库（DATABASE_ONLY）：{totals['families_database_only']}")
    lines.append('')
    lines.append('## 2. 变体验证状态')
    lines.append('')
    lines.append('| 状态 | 数量 |')
    lines.append('| --- | --- |')
    for status, count in sorted(totals['verification'].items()):
        lines.append(f'| {status} | {count} |')
    lines.append('')
    lines.append('## 3. 分支覆盖')
    lines.append('')
    lines.append('| 分支 | 家族数 | 层级范围 | 有 3D 资产的家族 |')
    lines.append('| --- | --- | --- | --- |')
    for branch in dataset.BRANCHES:
        rows = [f for f in dataset.FAMILIES if f['branch'] == branch['branch_id']]
        low = min(f['tier_min'] for f in rows)
        high = max(f['tier_max'] for f in rows)
        with_asset = sum(1 for f in family_db['families']
                         if f['branch'] == branch['branch_id'] and f['visual_asset_ids'])
        lines.append(f"| {branch['label']} ({branch['label_zh']}) | {len(rows)} | T{low}-T{high} | {with_asset} |")
    lines.append('')
    lines.append('## 4. 兼容性矩阵覆盖')
    lines.append('')
    lines.append('| 兼容性 | 行数 |')
    lines.append('| --- | --- |')
    for level in COMPATIBILITY_LEVELS:
        lines.append(f"| {level} | {compat['totals']['by_level'][level]} |")
    lines.append('')
    lines.append(f"平台数 {compat['totals']['platforms']}，家族数 {compat['totals']['families']}，"
                 f"总行数 {compat['totals']['rows']}；装载方案 {loadout['totals']['platforms']} 份，"
                 f"每份 {loadout['totals']['slots_per_platform']} 个槽位。")
    lines.append('')
    lines.append('### 降级记录（声明了真实系统但缺公开来源）')
    lines.append('')
    if compat['demotions']:
        lines.append('| 平台 | 家族 | 原判 | 原因 |')
        lines.append('| --- | --- | --- | --- |')
        for row in compat['demotions']:
            lines.append(f"| {row['submarine']} | {row['family']} | {row['was']} | {row['reason_zh']} |")
    else:
        lines.append('无。')
    lines.append('')
    lines.append('## 5. 3D 资产流水线状态')
    lines.append('')
    lines.append('| 项目 | 数量 |')
    lines.append('| --- | --- |')
    for key, value in manifest['totals'].items():
        lines.append(f'| {key} | {value} |')
    lines.append('')
    lines.append('| 资产 | 优先级 | Master | LOD0-3 | 碰撞 | SPEC | 预览 | LOD0 三角面 |')
    lines.append('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for asset in manifest['assets']:
        lods = sum(1 for value in asset['lod_fbx'].values() if value['present'])
        lines.append(
            f"| {asset['asset_id']} | {asset['priority']} | "
            f"{'有' if asset['master']['present'] else '无'} | {lods}/4 | "
            f"{'有' if asset['collision']['present'] else '无'} | "
            f"{'有' if asset['spec_present'] else '无'} | {asset['preview_count']} | "
            f"{asset['triangles_lod0'] if asset['triangles_lod0'] is not None else '-'} |"
        )
    lines.append('')
    lines.append('## 6. 已知空缺（诚实声明）')
    lines.append('')
    lines.append('- 未在公开来源中找到具体型号的分支/国家组合，一律保持 GAMEPLAY 或 UNKNOWN，不做推断。')
    lines.append('- DATABASE_ONLY 的家族不生成 3D 模型，避免用假几何体冒充真实装备。')
    lines.append('- 本库不修改任何既有潜艇模型；socket 词表只用于新的附加展示层资产。')
    lines.append('- 3D 资产是游戏化的外形表达，不是对真实装备的测绘复刻。')
    lines.append('')
    lines.append('## 7. 数据文件')
    lines.append('')
    lines.append('| 文件 | 用途 |')
    lines.append('| --- | --- |')
    lines.append('| Manifest/defensive_system_family.json | 家族与变体定义 |')
    lines.append('| Manifest/defensive_system_manifest.json | 3D 资产清单与磁盘真实状态 |')
    lines.append('| Manifest/submarine_defensive_compatibility.json | 兼容性矩阵（完整字段） |')
    lines.append('| Manifest/defensive_loadout_manifest.json | 每艇装载方案 |')
    lines.append('| TechnologyTree/defensive_technology_tree.json | T1-T10 科技树 |')
    lines.append('| Documentation/SubmarineDefensiveMatrix.csv | 矩阵总表 |')
    lines.append('| Documentation/SubmarineDefensiveMatrix_full.csv | 逐行明细 |')
    lines.append('| Documentation/defensive_system_research.json | 公开来源核验记录 |')
    lines.append('')
    return '\n'.join(lines)


def main() -> int:
    report = build_report()
    save_text(DOC_DIR / 'defensive_coverage_report.md', report)
    print(f"WROTE={DOC_DIR / 'defensive_coverage_report.md'}")
    print(f"LINES={len(report.splitlines())}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
