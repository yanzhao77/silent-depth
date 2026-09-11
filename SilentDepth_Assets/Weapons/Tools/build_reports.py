#!/usr/bin/env python3
"""覆盖率报告与最终报告生成器（全部结论来自真实数据与磁盘状态）。

输出：
- Weapons/Documentation/weapon_coverage_report.md          武器库覆盖情况
- Weapons/Documentation/submarine_weapon_coverage_report.md 潜艇覆盖情况
- Weapons/Documentation/GLOBAL_SUBMARINE_WEAPON_REPORT.md   最终总报告

报告只写可验证的事实：数据来自 weapon_dataset / data_submarine_fits / 磁盘扫描，
未执行过的检查一律标记 NOT VERIFIED，不推断视觉或性能结论。
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    CATEGORY_LABEL,
    DOC_DIR,
    MANIFEST_DIR,
    TODAY,
    load_json,
    save_text,
    weapon_slot,
)
from dataset_index import (  # noqa: E402
    CATEGORY_ORDER,
    TIER_LABEL,
    asset_paths,
    asset_status,
    fbx_versions,
    sorted_variants,
)
from weapon_dataset import FAMILIES, VARIANTS_BY_ID, dataset_summary  # noqa: E402
from data_submarine_fits import SUBMARINE_FITS, SUBMARINE_LAUNCH_INTERFACES  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_compatibility import build as build_matrix  # noqa: E402

LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'INCOMPATIBLE', 'UNKNOWN')


def _table(header: list[str], rows: list[list]) -> list[str]:
    lines = ['| ' + ' | '.join(header) + ' |', '| ' + ' | '.join('---' for _ in header) + ' |']
    for row in rows:
        lines.append('| ' + ' | '.join('' if cell is None else str(cell) for cell in row) + ' |')
    return lines


def load_queue() -> dict:
    path = MANIFEST_DIR / 'weapon_production_queue.json'
    return load_json(path) if path.is_file() else {}


def weapon_coverage_report(matrix: dict, queue: dict) -> str:
    variants = sorted_variants()
    summary = dataset_summary()
    by_category = Counter()
    by_status = Counter()
    by_priority = Counter()
    fbx_ok = 0
    fbx_bad = []
    complete = 0
    builders: list[list] = []

    for variant in variants:
        by_category[variant['category']] += 1
        by_status[variant.get('status', 'UNKNOWN')] += 1
        by_priority[variant['asset_priority']] += 1
        state = asset_status(variant)
        if state == 'COMPLETE':
            complete += 1
        versions = fbx_versions(variant)
        values = [v for v in versions.values() if v is not None]
        if values:
            if all(v == 7400 for v in values):
                fbx_ok += 1
            else:
                fbx_bad.append([variant['weapon_id'], versions])
        builders.append([
            variant['weapon_id'], f"T{variant['tier']}", variant['category'], variant['country'],
            variant['asset_priority'], variant.get('status', 'UNKNOWN'), state,
            VARIANTS_BY_ID[variant['weapon_id']]['geometry']['kind'],
        ])

    weapons_matrix = {w['weapon_id']: w for w in matrix['weapons']}
    compat_counts = Counter()
    for weapon_id, entry in weapons_matrix.items():
        supported = [c for c in entry['compatible_submarines'] if c['compatibility'] != 'INCOMPATIBLE']
        compat_counts[weapon_id] = len(supported)

    lines = [
        '# SILENT DEPTH 武器库覆盖报告',
        '',
        f'生成时间：{TODAY}',
        '',
        '本文所有数字来自 `weapon_dataset.py` 的数据记录与磁盘真实文件扫描，未执行过的检查不做推断。',
        '',
        '## 总量',
        '',
    ]
    lines += _table(['项目', '数量'], [
        ['Weapon Families', summary['families']],
        ['Weapon Variants', summary['variants']],
        ['已产出完整 3D 资产', complete],
        ['含可通过校验的 FBX 版本(7400)的武器', fbx_ok],
        ['DATABASE_ONLY 条目', by_priority.get('DATABASE_ONLY', 0)],
        ['兼容关系总数', matrix['summary']['relations']],
    ])
    lines += ['', '## 分类分布', '']
    lines += _table(['类别', '代码', '数量'], [
        [CATEGORY_LABEL[c], c, by_category.get(c, 0)] for c in CATEGORY_ORDER if by_category.get(c)
    ])
    lines += ['', '## 国家分布', '']
    lines += _table(['国家', '数量'], sorted(summary['by_country'].items()))
    lines += ['', '## Tier 分布', '']
    lines += _table(['Tier', '说明', '数量'], [
        [f'T{t}', TIER_LABEL[t], summary['by_tier'][f'T{t}']] for t in range(1, 11)
    ])
    lines += ['', '## 服役状态分布', '']
    lines += _table(['状态', '数量'], sorted(by_status.items()))
    lines += ['', '## 资产优先级分布', '']
    lines += _table(['优先级', '数量'], sorted(by_priority.items()))
    lines += ['', '## 每个武器的兼容潜艇数量与资产状态', '']
    rows = []
    for variant in variants:
        rows.append([
            variant['weapon_id'], f"T{variant['tier']}", variant['category'],
            variant['asset_priority'], asset_status(variant),
            compat_counts.get(variant['weapon_id'], 0),
        ])
    lines += _table(['Weapon', 'Tier', 'Category', 'Priority', 'Asset Status', 'Compatible Submarines'], rows)

    if fbx_bad:
        lines += ['', '## FBX 版本异常', '']
        lines += _table(['Weapon', 'FBX 版本'], fbx_bad)

    status_counts = (queue.get('summary') or {}).get('status_counts') or {}
    if status_counts:
        lines += ['', '## 生产队列状态（来自 weapon_production_queue.json）', '']
        lines += _table(['状态', '数量'], [[k, v] for k, v in status_counts.items() if v])
        retry = queue.get('retry_queue') or []
        lines += ['', f'重试队列：{len(retry)} 项。' if retry else '重试队列为空。']
    return '\n'.join(lines) + '\n'


def submarine_coverage_report(matrix: dict) -> str:
    submarines = matrix['submarines']
    with_weapons = [s for s in submarines if s['compatible_weapons']]
    without = [s for s in submarines if not s['compatible_weapons']]
    ssn = [s for s in submarines if s['type'] == 'SSN']
    ssbn = [s for s in submarines if s['type'] == 'SSBN']
    tier_counter = Counter(s['submarine_tier'] for s in submarines)
    country_counter = Counter(s['country'] for s in submarines)
    level_counter = Counter()
    for s in submarines:
        for weapon in s['compatible_weapons']:
            level_counter[weapon['compatibility']] += 1

    lines = [
        '# SILENT DEPTH 潜艇武器覆盖报告',
        '',
        f'生成时间：{TODAY}',
        '',
        '覆盖对象为潜艇科技树中的全部资产；本文只统计真实存在的兼容关系。',
        '',
        '## 覆盖总览',
        '',
    ]
    lines += _table(['项目', '数量'], [
        ['Total Submarines', len(submarines)],
        ['Submarines With Weapon Data', len(with_weapons)],
        ['Submarines Without Weapon Data', len(without)],
        ['SSN Coverage', f"{sum(1 for s in ssn if s['compatible_weapons'])}/{len(ssn)}"],
        ['SSBN Coverage', f"{sum(1 for s in ssbn if s['compatible_weapons'])}/{len(ssbn)}"],
        ['Compatibility Relations', matrix['summary']['relations']],
    ])
    lines += ['', '## T1-T10 潜艇覆盖', '']
    lines += _table(['Tier', '潜艇数', '有武器数据'], [
        [f'T{t}', tier_counter.get(t, 0),
         sum(1 for s in submarines if s['submarine_tier'] == t and s['compatible_weapons'])]
        for t in range(1, 11)
    ])
    lines += ['', '## 国家覆盖', '']
    lines += _table(['国家', '潜艇数', '有武器数据'], [
        [country, count,
         sum(1 for s in submarines if s['country'] == country and s['compatible_weapons'])]
        for country, count in sorted(country_counter.items())
    ])
    lines += ['', '## 兼容等级分布', '']
    lines += _table(['等级', '关系数'], [[level, level_counter.get(level, 0)] for level in LEVELS])
    lines += ['', '## 发射接口（公开资料）', '']
    rows = []
    for s in submarines:
        interface = SUBMARINE_LAUNCH_INTERFACES.get(s['submarine'], {})
        tubes = interface.get('torpedo_tubes') or {}
        vls = interface.get('vertical_launch') or {}
        slbm = interface.get('slbm_tubes')
        rows.append([
            s['submarine'], s['country'], s['type'], f"T{s['submarine_tier']}",
            tubes.get('count'), tubes.get('diameter_mm'), tubes.get('confidence'),
            slbm,
            vls.get('cells') if vls.get('present') else None,
            len(interface.get('weapon_sockets') or []),
        ])
    lines += _table(
        ['Submarine', 'Country', 'Type', 'Tier', 'Torpedo Tubes', 'Tube Ø(mm)',
         'Tube Confidence', 'SLBM Tubes', 'VLS Cells', 'Weapon Sockets'],
        rows,
    )
    if without:
        lines += ['', '## 缺少武器数据的潜艇', '']
        lines += _table(['Submarine', 'Country', 'Type'], [[s['submarine'], s['country'], s['type']] for s in without])
    unknown = [
        [s['submarine'], weapon['weapon_id'], weapon['reason']]
        for s in submarines for weapon in s['compatible_weapons'] if weapon['compatibility'] == 'UNKNOWN'
    ]
    if unknown:
        lines += ['', '## UNKNOWN 关系（资料不足，需补充）', '']
        lines += _table(['Submarine', 'Weapon', '原因'], unknown)
    unresolved = matrix.get('unresolved_references') or []
    lines += ['', '## 未解析引用', '']
    if unresolved:
        lines += _table(['Submarine', 'Weapon', 'Kind'], [[u['submarine'], u['weapon'], u['kind']] for u in unresolved])
    else:
        lines += ['无。所有武器引用都在武器库中解析成功。']
    return '\n'.join(lines) + '\n'


def final_report(matrix: dict, queue: dict) -> str:
    variants = sorted_variants()
    summary = dataset_summary()
    queue_summary = queue.get('summary') or {}
    per_tier = Counter(v['tier'] for v in variants)
    per_category = Counter(v['category'] for v in variants)
    per_country = Counter(v['country'] for v in variants)
    asset_status_counter = Counter(asset_status(v) for v in variants)
    fbx_versions_ok = sum(
        1 for v in variants
        if all(version == 7400 for version in fbx_versions(v).values() if version is not None)
        and any(version is not None for version in fbx_versions(v).values())
    )
    complete_assets = [v for v in variants if asset_status(v) == 'COMPLETE']
    missing_models = [v['weapon_id'] for v in variants
                      if v['asset_priority'] != 'DATABASE_ONLY' and asset_status(v) != 'COMPLETE']

    lines = [
        '# GLOBAL SUBMARINE WEAPON REPORT',
        '',
        f'生成时间：{TODAY}',
        '',
        '本报告覆盖 SILENT DEPTH 武器资产工厂的全部产出：武器库、T1-T10 科技树、',
        '潜艇兼容矩阵、装备槽位、3D 资产、LOD、碰撞、FBX、预览与校验。',
        '所有数字都来自数据记录与磁盘扫描；未执行的检查标记 NOT VERIFIED。',
        '',
        '## 1. Weapon Library',
        '',
    ]
    lines += _table(['项目', '数量'], [
        ['武器家族', summary['families']],
        ['武器变体', summary['variants']],
        ['参与兼容矩阵的武器', matrix['summary']['weapons_in_matrix']],
    ])
    lines += ['', '## 2. Torpedo Tree', '']
    lines += _tier_rows(per_category, 'TORP', variants)
    lines += ['', '## 3. Anti-Ship Missile Tree', '']
    lines += _tier_rows(per_category, 'ASM', variants)
    lines += ['', '## 4. Land Attack Missile Tree', '']
    lines += _tier_rows(per_category, 'LAM', variants)
    lines += ['', '## 5. Anti-Submarine Missile Tree', '']
    lines += _tier_rows(per_category, 'ASW', variants)
    lines += ['', '## 6. Ballistic Missile Tree', '']
    lines += _tier_rows(per_category, 'SLBM', variants)
    lines += ['', '## 7. Mine Tree', '']
    lines += _tier_rows(per_category, 'MINE', variants)
    lines += ['', '## 8. Decoy Tree', '']
    lines += _tier_rows(per_category, 'DECOY', variants)
    lines += ['', '## 9. Special Payload Tree', '']
    lines += _tier_rows(per_category, 'SPECIAL', variants)
    if per_category.get('STRAT'):
        lines += ['', '## 9b. Strategic Payload Branch', '']
        lines += _tier_rows(per_category, 'STRAT', variants)
    lines += ['', '## 10. T1-T10 Tree', '']
    lines += _table(['Tier', '说明', '数量', '武器'], [
        [f'T{t}', TIER_LABEL[t], per_tier.get(t, 0),
         '、'.join(sorted(v['weapon_id'] for v in variants if v['tier'] == t))]
        for t in range(1, 11)
    ])
    lines += ['', '## 11. Country Distribution', '']
    lines += _table(['国家', '数量'], sorted(per_country.items()))
    lines += ['', '## 12. Weapon Family Count', '', f"家族总数：{summary['families']}", '']
    lines += ['## 13. Weapon Variant Count', '', f"变体总数：{summary['variants']}", '']
    lines += ['', '## 14. 3D Asset Count', '']
    lines += _table(['状态', '数量'], [
        ['COMPLETE（全部必需文件齐备）', asset_status_counter.get('COMPLETE', 0)],
        ['PARTIAL（部分文件存在）', asset_status_counter.get('PARTIAL', 0)],
        ['PLANNED（尚未产出）', asset_status_counter.get('PLANNED', 0)],
        ['DATABASE_ONLY（按设计不做 3D）', asset_status_counter.get('DATABASE_ONLY', 0)],
    ])
    lines += ['', '## 15. Database Only Count',
              '', f"DATABASE_ONLY：{summary['by_priority'].get('DATABASE_ONLY', 0)} 条，不进入 3D 生产队列。", '']
    lines += ['', '## 16. Submarine Compatibility Count', '']
    lines += _table(['项目', '数量'], [
        ['兼容关系', matrix['summary']['relations']],
        ['有武器数据的潜艇', matrix['summary']['submarines_with_weapons']],
        ['潜艇总数', matrix['summary']['submarines']],
    ])
    lines += ['', '## 17. SSN Coverage', '']
    lines += _type_coverage(matrix, 'SSN')
    lines += ['', '## 18. SSBN Coverage', '']
    lines += _type_coverage(matrix, 'SSBN')
    lines += ['', '## 19. Missing Compatibility', '']
    if matrix.get('unresolved_references'):
        lines += _table(['Submarine', 'Weapon', 'Kind'],
                        [[u['submarine'], u['weapon'], u['kind']] for u in matrix['unresolved_references']])
    else:
        lines += ['无未解析的武器引用。']
    lines += ['', '## 20. Missing Models', '']
    if missing_models:
        lines += [f'尚未产出完整 3D 资产的武器 {len(missing_models)} 项，详见',
                  '`weapon_coverage_report.md` 的资产状态表。', '']
    else:
        lines += ['所有非 DATABASE_ONLY 武器均已产出完整资产。', '']
    lines += ['', '## 21. Validation Summary', '']
    lines += _table(['项目', '结果'], [
        ['生产队列中标记 VALIDATING 的武器', (queue.get('summary') or {}).get('status_counts', {}).get('VALIDATING', 0)],
        ['FBX 二进制版本为 7400 的武器数', fbx_versions_ok],
        ['完整资产数', len(complete_assets)],
        ['UE4 编辑器内导入验证', 'NOT VERIFIED（当前环境未执行 UE4 编辑器导入）'],
    ])
    lines += ['', '## 22. UE4.27 Export Summary', '']
    lines += [
        '武器资产使用与潜艇一致的导出契约（见 `Templates/Weapon/SilentDepth_Weapon_Export_Preset.json`）：',
        '',
        '- FBX 2018 二进制（版本 7400）',
        '- 轴向前 `-Y`、向上 `Z`、单位米、比例 1.0',
        '- LOD0..LOD3 与碰撞体分别导出',
        '',
        f'磁盘上 FBX 版本经核验为 7400 的武器：{fbx_versions_ok}',
        '',
        '## 诚实结论',
        '',
        f"- 数据层：{summary['families']} 个家族 / {summary['variants']} 个变体 / "
        f"{matrix['summary']['relations']} 条潜艇兼容关系（TESTED：由数据集自检与构建脚本执行验证）。",
        f"- 3D 资产：{len(complete_assets)} 个武器拥有完整文件集，其余仍为 PLANNED 或 PARTIAL。",
        '- 视觉观感与 UE4 内表现：NOT VERIFIED（未在 UE4 编辑器或目标硬件上观察）。',
        '',
    ]
    return '\n'.join(lines) + '\n'


def _tier_rows(per_category: Counter, category: str, variants: list) -> list:
    items = [v for v in variants if v['category'] == category]
    if not items:
        return [f'{CATEGORY_LABEL[category]}：武器库中暂无该类别条目。']
    rows = []
    for tier in range(1, 11):
        ids = sorted(v['weapon_id'] for v in items if v['tier'] == tier)
        if ids:
            rows.append([f'T{tier}', len(ids), '、'.join(ids)])
    return _table(['Tier', '数量', '武器'], rows)


def _type_coverage(matrix: dict, submarine_type: str) -> list:
    entries = [s for s in matrix['submarines'] if s['type'] == submarine_type]
    covered = [s for s in entries if s['compatible_weapons']]
    rows = [[s['submarine'], f"T{s['submarine_tier']}", len(s['compatible_weapons']),
             ', '.join(str(s['counts'].get(level, 0)) for level in LEVELS)] for s in entries]
    lines = [f'{submarine_type} 覆盖：{len(covered)}/{len(entries)}', '']
    lines += _table(['Submarine', 'Tier', 'Weapons', 'C/P/G/I/U'], rows)
    return lines


def main() -> int:
    matrix = build_matrix()
    queue = load_queue()
    save_text(DOC_DIR / 'weapon_coverage_report.md', weapon_coverage_report(matrix, queue))
    save_text(DOC_DIR / 'submarine_weapon_coverage_report.md', submarine_coverage_report(matrix))
    save_text(DOC_DIR / 'GLOBAL_SUBMARINE_WEAPON_REPORT.md', final_report(matrix, queue))
    print('REPORTS_WRITTEN')
    print(f"  weapon_coverage_report.md")
    print(f"  submarine_weapon_coverage_report.md")
    print(f"  GLOBAL_SUBMARINE_WEAPON_REPORT.md")
    print(f"RELATIONS={matrix['summary']['relations']}")
    print(f"UNRESOLVED={len(matrix.get('unresolved_references') or [])}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
