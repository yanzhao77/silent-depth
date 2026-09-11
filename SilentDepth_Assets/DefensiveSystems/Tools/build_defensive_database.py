#!/usr/bin/env python3
"""Builds the SILENT DEPTH defensive system database from ``sds_dataset``.

Outputs (relative to SilentDepth_Assets/DefensiveSystems):

    Manifest/defensive_system_family.json
    Manifest/defensive_system_manifest.json
    Manifest/submarine_defensive_compatibility.json
    Manifest/defensive_loadout_manifest.json
    TechnologyTree/defensive_technology_tree.json
    TechnologyTree/tier_manifest.json
    Documentation/SubmarineDefensiveMatrix.csv
    Documentation/SubmarineDefensiveMatrix_full.csv
    Documentation/defensive_coverage_report.md

Nothing here invents a system: every row traces back to a family/variant in
``sds_dataset`` plus the platform technology tree, and every CONFIRMED/PROBABLE
row traces to a source record in ``defensive_system_research.json``.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    ASSET_PRIORITIES,
    CATEGORY_DIR,
    COMPATIBILITY_LEVELS,
    COUNTRY_CODE,
    DEFENSIVE_ROOT,
    DOC_DIR,
    FBX_BINARY_VERSION,
    MANIFEST_DIR,
    SHARED_MATERIALS,
    SOCKETS,
    TODAY,
    TREE_DIR,
    defensive_asset_dir,
    fbx_binary_version,
    load_submarines,
    save_json,
    save_text,
    sha256_file,
    write_csv,
)

ASSET_DIRS = ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures', 'Preview',
              'Documentation', 'Validation')


def build_family_database() -> dict:
    """Family/variant database with merged research verification status."""
    variants = dataset.variants()
    by_family: dict[str, list[dict]] = {}
    for variant in variants:
        by_family.setdefault(variant['family_id'], []).append(variant)

    families = []
    for family in dataset.FAMILIES:
        rows = by_family.get(family['family_id'], [])
        asset_ids = sorted({row['asset_id'] for row in rows if row['asset_id']})
        families.append({
            'family_id': family['family_id'],
            'branch': family['branch'],
            'label': family['label'],
            'label_zh': family['label_zh'],
            'era': family['era'],
            'tier_min': family['tier_min'],
            'tier_max': family['tier_max'],
            'summary_zh': family['summary_zh'],
            'anchor_countries': [row['country'] for row in rows if row['anchor']],
            'visual_asset_ids': asset_ids,
            'database_only': not asset_ids,
            'variant_ids': [row['variant_id'] for row in rows],
        })

    counts: dict[str, int] = {}
    for variant in variants:
        counts[variant['verification']] = counts.get(variant['verification'], 0) + 1

    return {
        'schema': 'silent-depth-defensive-family-v1',
        'generated_at': TODAY,
        'scope_zh': '游戏科技树家族与变体定义；不含任何真实电子战参数、频率、功率或战术。',
        'policy_zh': [
            'family 是游戏内的技术世代身份；variant 是家族在某国的具体化。',
            'anchor 只在读到公开来源时记录，否则该变体是 GAMEPLAY（游戏设定）。',
            '缺少公开资料与视觉依据的家族登记为 DATABASE_ONLY，不为其伪造 3D 模型。',
        ],
        'branches': dataset.BRANCHES,
        'tiers': {f'T{tier}': data for tier, data in dataset.TIER_LADDER.items()},
        'families': families,
        'variants': variants,
        'totals': {
            'branches': len(dataset.BRANCHES),
            'families': len(dataset.FAMILIES),
            'variants': len(variants),
            'verification': counts,
            'families_with_asset': sum(1 for f in families if f['visual_asset_ids']),
            'families_database_only': sum(1 for f in families if f['database_only']),
        },
    }
