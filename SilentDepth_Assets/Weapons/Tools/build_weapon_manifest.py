#!/usr/bin/env python3
"""生成武器清单、家族清单与全局武器数据库。

输出：
- Weapons/Manifest/weapon_manifest.json         每条 variant 的资产级清单
- Weapons/Manifest/weapon_family.json            Family -> Variants 视图
- Weapons/Documentation/GLOBAL_SUBMARINE_WEAPON_DATABASE.json  完整数据记录
"""
from __future__ import annotations

import json
from collections import Counter

from dataset_index import (
    FAMILIES,
    FAMILIES_BY_ID,
    MANIFEST_DIR,
    TODAY,
    VARIANTS_BY_ID,
    asset_paths,
    asset_status,
    compatible_submarines,
    fbx_versions,
    sorted_variants,
    submarine_rows,
)
from sdw_common import DOC_DIR, save_json
from weapon_dataset import dataset_summary


def relative(path) -> str:
    from dataset_index import WEAPONS_ROOT

    try:
        return str(path.relative_to(WEAPONS_ROOT.parent)).replace('\\', '/')
    except ValueError:
        return str(path)


def manifest_entry(weapon: dict, family: dict) -> dict:
    paths = asset_paths(weapon)
    return {
        'weapon_id': weapon['weapon_id'],
        'display_name': weapon['display_name'],
        'short_name': weapon['short_name'],
        'family': family['family_id'],
        'family_name': family['family_name'],
        'base_geometry': family['base_geometry'],
        'variant_of': weapon.get('variant_of'),
        'country': weapon['country'],
        'category': weapon['category'],
        'role': weapon['role'],
        'subrole': weapon['subrole'],
        'role_tags': list(weapon['role_tags']),
        'era': weapon['era'],
        'service_years': weapon['service_years'],
        'status': weapon['status'],
        'tier': weapon['tier'],
        'tier_reason': weapon['tier_reason'],
        'guidance': weapon['guidance'],
        'propulsion': weapon['propulsion'],
        'launch_methods': list(weapon['launch_methods']),
        'dimensions': weapon['dimensions'],
        'asset_priority': weapon['asset_priority'],
        'asset_status': asset_status(weapon),
        'geometry': weapon['geometry'],
        'confidence': weapon['confidence'],
        'master': relative(paths['master']),
        'lod0': relative(paths['lod'][0]),
        'lod1': relative(paths['lod'][1]),
        'lod2': relative(paths['lod'][2]),
        'lod3': relative(paths['lod'][3]),
        'collision': relative(paths['collision']),
        'collision_manifest': relative(paths['collision_manifest']),
        'preview_dir': relative(paths['root'] / 'Preview'),
        'spec': relative(paths['spec']),
        'readme': relative(paths['readme']),
        'validation': relative(paths['validation']),
        'fbx_versions': fbx_versions(weapon),
        'compatible_submarines': compatible_submarines(weapon['weapon_id']),
        'notes': weapon.get('notes', ''),
        'references': weapon.get('sources', []),
    }


def build_manifest() -> dict:
    entries = [
        manifest_entry(weapon, FAMILIES_BY_ID[weapon['family_id']])
        for weapon in sorted_variants()
    ]
    return {
        'manifest': 'weapon_manifest',
        'generated_at': TODAY,
        'source_of_truth': 'Weapons/Tools/weapon_dataset.py',
        'totals': {
            'families': len(FAMILIES),
            'variants': len(entries),
            'by_asset_status': dict(sorted(Counter(e['asset_status'] for e in entries).items())),
            'by_asset_priority': dict(sorted(Counter(e['asset_priority'] for e in entries).items())),
        },
        'weapons': entries,
    }


def build_family_view() -> dict:
    families = {}
    for family in FAMILIES:
        families[family['family_id']] = {
            'family': family['family_id'],
            'country': family['country'],
            'family_name': family['family_name'],
            'primary_category': family['primary_category'],
            'categories': list(family['categories']),
            'base_geometry': family['base_geometry'],
            'notes': family.get('notes', ''),
            'variants': [
                {
                    'weapon_id': variant['weapon_id'],
                    'display_name': variant['display_name'],
                    'category': variant['category'],
                    'tier': variant['tier'],
                    'status': variant['status'],
                    'variant_of': variant.get('variant_of'),
                    'same_geometry_as_base': variant.get('variant_of') != variant['weapon_id'],
                }
                for variant in family['variants']
            ],
        }
    return {
        'database': 'weapon_family',
        'generated_at': TODAY,
        'total_families': len(families),
        'total_variants': sum(len(f['variants']) for f in families.values()),
        'families': families,
    }


def build_database() -> dict:
    return {
        'database': 'GLOBAL_SUBMARINE_WEAPON_DATABASE',
        'generated_at': TODAY,
        'scope': '全部潜射 / 潜艇布放武器；不含水面舰、飞机、陆基武器。',
        'schema': {
            'weapon_id': '[COUNTRY]_[CATEGORY]_[FAMILY]',
            'category': 'TORP | ASM | LAM | ASW | SLBM | STRAT | MINE | DECOY | SPECIAL',
            'tier': '游戏科技树分层 1..10，非现实军事等级',
            'status': 'HISTORICAL | RETIRED | ACTIVE | PROTOTYPE | PLANNED | GAMEPLAY | UNKNOWN',
            'compatibility_levels': 'CONFIRMED | PROBABLE | GAMEPLAY | INCOMPATIBLE | UNKNOWN',
        },
        'summary': dataset_summary(),
        'submarine_count': len(submarine_rows()),
        'weapons': sorted_variants(),
    }


def main() -> None:
    manifest = build_manifest()
    save_json(MANIFEST_DIR / 'weapon_manifest.json', manifest)
    save_json(MANIFEST_DIR / 'weapon_family.json', build_family_view())
    save_json(DOC_DIR / 'GLOBAL_SUBMARINE_WEAPON_DATABASE.json', build_database())
    print(json.dumps({
        'weapon_manifest': manifest['totals'],
        'database_summary': dataset_summary(),
    }, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
