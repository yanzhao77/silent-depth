#!/usr/bin/env python3
"""生成 T1-T10 武器科技树：JSON / Markdown / CSV / UI 数据 / 依赖关系。

层级逻辑（游戏科技树，非现实等级）：
  历史时代 -> 技术代际 -> 制导代际 -> 推进代际 -> 发射方式 -> 射程级别
  -> 目标角色 -> 传感器/制导复杂度 -> 平台整合 -> 视觉与玩法区分度
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    CATEGORY_LABEL,
    TREE_DIR,
    TODAY,
    save_json,
    save_text,
    weapon_asset_dir,
    write_csv,
)
from weapon_dataset import FAMILIES_BY_ID, VARIANTS_BY_ID  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_compatibility import build as build_matrix  # noqa: E402

TIER_LABEL = {
    1: 'T1 早期潜艇鱼雷 / 基础武器',
    2: 'T2 早期制导鱼雷 / 初代潜射导弹',
    3: 'T3 冷战早期成熟鱼雷 / 初期巡航导弹',
    4: 'T4 冷战中期鱼雷 / 反舰导弹',
    5: 'T5 冷战后期先进鱼雷 / 远程导弹 / SLBM',
    6: 'T6 现代早期武器',
    7: 'T7 现代成熟武器',
    8: 'T8 现代先进武器',
    9: 'T9 新一代高端武器',
    10: 'T10 现代/未来顶级游戏武器',
}

BRANCH_ORDER = ['TORP', 'ASM', 'LAM', 'ASW', 'SLBM', 'STRAT', 'MINE', 'DECOY', 'SPECIAL']


def _node_id(variant: dict) -> str:
    return variant['weapon_id']


def build_dependencies(variants: list[dict]) -> dict:
    """同一分支内按 (tier, 时代顺序) 形成解锁链。"""
    chains: dict[str, list[dict]] = defaultdict(list)
    for variant in variants:
        chains[variant['category']].append(variant)
    parents: dict[str, str | None] = {}
    for category, items in chains.items():
        items.sort(key=lambda v: (v['tier'], v['service_years'], v['weapon_id']))
        previous = None
        for variant in items:
            parents[variant['weapon_id']] = previous
            previous = variant['weapon_id']
    return parents


def build() -> dict:
    matrix = build_matrix()
    compat_by_weapon = {w['weapon_id']: w for w in matrix['weapons']}
    variants = sorted(VARIANTS_BY_ID.values(), key=lambda v: (v['tier'], v['category'], v['weapon_id']))
    parents = build_dependencies(variants)

    tiers: dict[str, dict] = {}
    for tier in range(1, 11):
        tier_variants = [v for v in variants if v['tier'] == tier]
        categories: dict[str, list[dict]] = {}
        for category in BRANCH_ORDER:
            items = [v for v in tier_variants if v['category'] == category]
            if not items:
                continue
            categories[category] = [
                {
                    'weapon_id': v['weapon_id'],
                    'display_name': v['display_name'],
                    'family': v['family_id'],
                    'country': v['country'],
                    'asset_priority': v['asset_priority'],
                    'confidence': v['confidence'],
                }
                for v in sorted(items, key=lambda v: v['weapon_id'])
            ]
        tiers[f'T{tier}'] = {
            'tier': tier,
            'label': TIER_LABEL[tier],
            'categories': categories,
            'counts': {c: len(items) for c, items in categories.items()},
            'total': len(tier_variants),
        }

    branches = {}
    for category in BRANCH_ORDER:
        items = [v for v in variants if v['category'] == category]
        if not items:
            continue
        by_tier: dict[int, list[str]] = defaultdict(list)
        for variant in items:
            by_tier[variant['tier']].append(variant['weapon_id'])
        branches[category] = {
            'label': CATEGORY_LABEL[category],
            'families': sorted({v['family_id'] for v in items}),
            'by_tier': {f'T{t}': sorted(ids) for t, ids in sorted(by_tier.items())},
            'chain': [
                {'weapon_id': v['weapon_id'], 'parent': parents[v['weapon_id']], 'tier': v['tier']}
                for v in sorted(items, key=lambda v: (v['tier'], v['weapon_id']))
            ],
        }

    ui_nodes = []
    for variant in variants:
        weapon_id = variant['weapon_id']
        asset_dir = weapon_asset_dir(variant)
        compat = compat_by_weapon.get(weapon_id, {}).get('compatible_submarines', [])
        ui_nodes.append({
            'weapon_id': weapon_id,
            'parent': parents[weapon_id],
            'tier': variant['tier'],
            'category': variant['category'],
            'category_label': CATEGORY_LABEL[variant['category']],
            'country': variant['country'],
            'display_name': variant['display_name'],
            'short_name': variant['short_name'],
            'family': variant['family_id'],
            'role': variant['role'],
            'era': variant['era'],
            'asset_priority': variant['asset_priority'],
            'icon': str(asset_dir / 'Preview' / 'Icon_256.png'),
            'preview': str(asset_dir / 'Preview' / 'Hero.png'),
            'unlock_requirements': {
                'previous_weapon': parents[weapon_id],
                'platform_requirement': '需要与该武器存在 CONFIRMED/PROBABLE 兼容关系的潜艇平台。',
                'game_tier_requirement': f'玩家科技树达到 {TIER_LABEL[variant["tier"]]}',
            },
            'compatible_submarines': [c['submarine'] for c in compat if c['compatibility'] != 'INCOMPATIBLE'],
        })

    return {
        'tree': 'SilentDepth_Weapon_Technology_Tree',
        'generated_at': TODAY,
        'note': 'T1-T10 仅为 Silent Depth 游戏科技树分层，不是现实军事官方等级。',
        'tier_framework': {
            'inputs': [
                '历史时代', '技术代际', '制导代际', '推进代际', '发射技术',
                '射程级别', '目标角色', '传感器/制导复杂度', '平台整合', '视觉与玩法区分度',
            ],
            'rule': '不强制每个 Tier 填满所有类别，也不为凑层级制造不存在的型号。',
            'tiers': {f'T{t}': TIER_LABEL[t] for t in range(1, 11)},
        },
        'summary': {
            'families': len(FAMILIES_BY_ID),
            'variants': len(variants),
            'per_tier': {f'T{t}': tiers[f'T{t}']['total'] for t in range(1, 11)},
            'per_branch': {c: sum(1 for v in variants if v['category'] == c) for c in BRANCH_ORDER},
        },
        'tiers': tiers,
        'branches': branches,
        'dependencies': parents,
        'ui_nodes': ui_nodes,
    }


def render_markdown(tree: dict) -> str:
    lines = [
        '# SILENT DEPTH 武器科技树 T1-T10',
        '',
        f"生成时间：{tree['generated_at']}",
        '',
        '> T1-T10 为游戏科技树分层，不代表任何现实军事等级。层级只影响游戏内的解锁与展示。',
        '',
        '## 总览',
        '',
        '| Tier | 说明 | 鱼雷 | 反舰 | 对陆 | 反潜 | 弹道 | 战略 | 水雷 | 诱饵 | 特种 | 合计 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for tier in range(1, 11):
        entry = tree['tiers'][f'T{tier}']
        counts = entry['counts']
        lines.append(
            '| T{0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} | {8} | {9} | {10} | {11} |'.format(
                tier, entry['label'].split(' ', 1)[1],
                counts.get('TORP', 0), counts.get('ASM', 0), counts.get('LAM', 0),
                counts.get('ASW', 0), counts.get('SLBM', 0), counts.get('STRAT', 0),
                counts.get('MINE', 0), counts.get('DECOY', 0), counts.get('SPECIAL', 0),
                entry['total'],
            )
        )
    lines.extend(['', '## 分支', ''])
    for category, branch in tree['branches'].items():
        lines.append(f"### {branch['label']} ({category})")
        lines.append('')
        lines.append(f"家族数：{len(branch['families'])}")
        lines.append('')
        lines.append('| Tier | 型号 |')
        lines.append('| --- | --- |')
        for tier_label, ids in branch['by_tier'].items():
            names = '、'.join(VARIANTS_BY_ID[i]['display_name'] for i in ids)
            lines.append(f'| {tier_label} | {names} |')
        lines.append('')
    lines.extend([
        '## 解锁链示例',
        '',
    ])
    for category in ('TORP',):
        chain = tree['branches'][category]['chain']
        lines.append(f"{CATEGORY_LABEL[category]}：")
        lines.append('')
        lines.append('```text')
        for step in chain[:16]:
            variant = VARIANTS_BY_ID[step['weapon_id']]
            lines.append(f"T{step['tier']}  {variant['display_name']}")
        lines.append('```')
        lines.append('')
    return '\n'.join(lines) + '\n'


def main() -> int:
    tree = build()
    save_json(TREE_DIR / 'weapon_technology_tree.json', tree)
    save_json(TREE_DIR / 'weapon_tree_ui.json', {
        'generated_at': tree['generated_at'],
        'note': tree['note'],
        'nodes': tree['ui_nodes'],
    })
    save_json(TREE_DIR / 'weapon_technology_dependencies.json', {
        'generated_at': tree['generated_at'],
        'dependencies': tree['dependencies'],
    })
    save_text(TREE_DIR / 'weapon_technology_tree.md', render_markdown(tree))

    rows = []
    for variant in sorted(VARIANTS_BY_ID.values(), key=lambda v: (v['tier'], v['category'], v['weapon_id'])):
        rows.append([
            f"T{variant['tier']}", variant['category'], variant['family_id'], variant['weapon_id'],
            variant['display_name'], variant['country'], variant['era'], variant['service_years'],
            variant['subrole'], variant['asset_priority'], variant['confidence'],
        ])
    write_csv(
        TREE_DIR / 'weapon_technology_tree.csv',
        ['Tier', 'Category', 'Family', 'Weapon', 'Display Name', 'Country', 'Era',
         'Service Years', 'Subrole', 'Asset Priority', 'Confidence'],
        rows,
    )

    print(f"TIERS={tree['summary']['per_tier']}")
    print(f"BRANCHES={tree['summary']['per_branch']}")
    print(f"VARIANTS={tree['summary']['variants']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
