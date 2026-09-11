#!/usr/bin/env python3
"""生成潜艇 <-> 武器 兼容矩阵（JSON + CSV）。

数据流：data_submarine_fits.SUBMARINE_FITS -> 展开 Family/Variant -> 矩阵。
未解析的武器引用会被显式记录，绝不静默丢弃。
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    COMPATIBILITY_LEVELS,
    MANIFEST_DIR,
    TODAY,
    load_submarines,
    save_json,
    weapon_slot,
    write_csv,
)
from data_submarine_fits import SUBMARINE_FITS, SUBMARINE_LAUNCH_INTERFACES  # noqa: E402
from weapon_dataset import FAMILIES_BY_ID, VARIANTS_BY_ID  # noqa: E402


def expand_fit(weapon_ref: str) -> tuple[list[str], str | None]:
    """把一个适配条目展开为具体 weapon_id 列表。"""
    if weapon_ref in VARIANTS_BY_ID:
        return [weapon_ref], None
    family = FAMILIES_BY_ID.get(weapon_ref)
    if family:
        return [v['weapon_id'] for v in family['variants']], None
    return [], weapon_ref


def build() -> dict:
    submarines = load_submarines()
    submarine_ids = [s['asset_id'] for s in submarines]
    by_id = {s['asset_id']: s for s in submarines}

    unresolved: list[dict] = []
    relations: list[dict] = []
    for submarine_id, fits in SUBMARINE_FITS.items():
        if submarine_id not in by_id:
            unresolved.append({'submarine': submarine_id, 'weapon': None, 'kind': 'unknown_submarine'})
            continue
        for entry in fits:
            weapon_ids, missing = expand_fit(entry['weapon'])
            if missing:
                unresolved.append({'submarine': submarine_id, 'weapon': missing, 'kind': 'unknown_weapon_reference'})
                continue
            for weapon_id in weapon_ids:
                variant = VARIANTS_BY_ID[weapon_id]
                relations.append({
                    'submarine': submarine_id,
                    'country': by_id[submarine_id]['country'],
                    'type': by_id[submarine_id]['type'],
                    'submarine_tier': by_id[submarine_id]['tier'],
                    'weapon': weapon_id,
                    'weapon_family': variant['family_id'],
                    'weapon_category': variant['category'],
                    'weapon_tier': variant['tier'],
                    'slot': weapon_slot(variant['category'], variant['launch_methods']),
                    'compatibility': entry['compatibility'],
                    'reason': entry['reason'],
                    'reference': entry['weapon'],
                })

    for submarine_id in submarine_ids:
        if submarine_id not in SUBMARINE_FITS:
            unresolved.append({'submarine': submarine_id, 'weapon': None, 'kind': 'missing_fit_data'})

    per_submarine: dict[str, list[dict]] = defaultdict(list)
    per_weapon: dict[str, list[dict]] = defaultdict(list)
    for relation in relations:
        per_submarine[relation['submarine']].append(relation)
        per_weapon[relation['weapon']].append(relation)

    submarines_out = []
    for submarine in submarines:
        sid = submarine['asset_id']
        items = sorted(per_submarine.get(sid, []), key=lambda r: (r['weapon_category'], r['weapon']))
        submarines_out.append({
            'submarine': sid,
            'country': submarine['country'],
            'type': submarine['type'],
            'class': submarine['class'],
            'submarine_tier': submarine['tier'],
            'launch_interface': SUBMARINE_LAUNCH_INTERFACES.get(sid, {}),
            'compatible_weapons': [
                {
                    'weapon_id': r['weapon'],
                    'category': r['weapon_category'],
                    'family': r['weapon_family'],
                    'slot': r['slot'],
                    'compatibility': r['compatibility'],
                    'reason': r['reason'],
                }
                for r in items
            ],
            'counts': {
                level: sum(1 for r in items if r['compatibility'] == level)
                for level in COMPATIBILITY_LEVELS
            },
        })

    weapons_out = []
    for weapon_id in sorted(VARIANTS_BY_ID):
        items = per_weapon.get(weapon_id, [])
        variant = VARIANTS_BY_ID[weapon_id]
        weapons_out.append({
            'weapon_id': weapon_id,
            'category': variant['category'],
            'family': variant['family_id'],
            'tier': variant['tier'],
            'compatible_submarines': [
                {
                    'submarine': r['submarine'],
                    'compatibility': r['compatibility'],
                    'reason': r['reason'],
                }
                for r in sorted(items, key=lambda r: r['submarine'])
            ],
        })

    return {
        'matrix': 'SilentDepth_SubmarineWeaponMatrix',
        'generated_at': TODAY,
        'policy': [
            'CONFIRMED 仅用于公开资料可确认的关系。',
            'PROBABLE 表示资料强烈指向但缺少单一权威确认。',
            'GAMEPLAY 表示游戏性兼容，不得当作历史事实。',
            'INCOMPATIBLE 用于明确不兼容（例如发射管口径不匹配）。',
        ],
        'summary': {
            'submarines': len(submarines_out),
            'submarines_with_weapons': sum(1 for s in submarines_out if s['compatible_weapons']),
            'weapons_in_matrix': len(weapons_out),
            'relations': len(relations),
            'by_level': {
                level: sum(1 for r in relations if r['compatibility'] == level)
                for level in COMPATIBILITY_LEVELS
            },
        },
        'unresolved_references': unresolved,
        'submarines': submarines_out,
        'weapons': weapons_out,
        'relations': relations,
    }


def main() -> int:
    matrix = build()
    save_json(MANIFEST_DIR / 'weapon_submarine_compatibility.json', {
        'generated_at': matrix['generated_at'],
        'policy': matrix['policy'],
        'summary': matrix['summary'],
        'unresolved_references': matrix['unresolved_references'],
        'submarines': matrix['submarines'],
        'weapons': matrix['weapons'],
    })
    save_json(MANIFEST_DIR / 'SubmarineWeaponMatrix.json', matrix)

    header = [
        'Submarine', 'Country', 'Type', 'Tier', 'Weapon Category', 'Weapon Family',
        'Weapon Variant', 'Slot', 'Compatibility', 'Source',
    ]
    rows = [
        [
            r['submarine'], r['country'], r['type'], r['submarine_tier'], r['weapon_category'],
            r['weapon_family'], r['weapon'], r['slot'], r['compatibility'], r['reason'],
        ]
        for r in sorted(matrix['relations'], key=lambda r: (r['submarine'], r['weapon_category'], r['weapon']))
    ]
    write_csv(MANIFEST_DIR / 'SubmarineWeaponMatrix.csv', header, rows)

    summary = matrix['summary']
    print(f"SUBMARINES={summary['submarines']}")
    print(f"SUBMARINES_WITH_WEAPONS={summary['submarines_with_weapons']}")
    print(f"RELATIONS={summary['relations']}")
    print(f"BY_LEVEL={summary['by_level']}")
    print(f"UNRESOLVED={len(matrix['unresolved_references'])}")
    for item in matrix['unresolved_references'][:40]:
        print('  UNRESOLVED', item)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
