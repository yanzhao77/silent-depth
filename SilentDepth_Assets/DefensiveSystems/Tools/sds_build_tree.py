#!/usr/bin/env python3
"""Builds the T1-T10 defensive technology tree and its tier manifest."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import TODAY, TREE_DIR, save_json  # noqa: E402


def _variants_by_family() -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for variant in dataset.variants():
        grouped.setdefault(variant['family_id'], []).append(variant)
    return grouped


def build_technology_tree() -> tuple[dict, dict]:
    grouped = _variants_by_family()
    tiers = {}
    tier_manifest = {}

    for tier, ladder in dataset.TIER_LADDER.items():
        nodes = []
        for family_id in ladder['families']:
            family = dataset.FAMILY_BY_ID[family_id]
            rows = grouped.get(family_id, [])
            nodes.append({
                'family_id': family_id,
                'branch': family['branch'],
                'label': family['label'],
                'label_zh': family['label_zh'],
                'tier_min': family['tier_min'],
                'tier_max': family['tier_max'],
                'era': family['era'],
                'game_tier_entered': tier,
                'asset_ids': sorted({r['asset_id'] for r in rows if r['asset_id']}),
                'database_only': not any(r['asset_id'] for r in rows),
                'anchored_countries': [r['country'] for r in rows if r['anchor']],
            })
        tiers[f'T{tier}'] = {'label': ladder['label'], 'label_zh': ladder['label_zh'], 'nodes': nodes}
        tier_manifest[f'T{tier}'] = [
            {
                'family_id': node['family_id'],
                'branch': node['branch'],
                'label': node['label'],
                'tier_min': node['tier_min'],
                'tier_max': node['tier_max'],
                'asset_ids': node['asset_ids'],
                'database_only': node['database_only'],
            }
            for node in nodes
        ]

    branch_trees = {}
    for branch in dataset.BRANCHES:
        rows = sorted([f for f in dataset.FAMILIES if f['branch'] == branch['branch_id']],
                      key=lambda f: (f['tier_min'], f['tier_max']))
        branch_trees[branch['branch_id']] = {
            'label': branch['label'],
            'label_zh': branch['label_zh'],
            'summary_zh': branch['summary_zh'],
            'nodes': [
                {
                    'family_id': family['family_id'],
                    'label': family['label'],
                    'label_zh': family['label_zh'],
                    'tier_min': family['tier_min'],
                    'tier_max': family['tier_max'],
                    'era': family['era'],
                    'prerequisite': rows[index - 1]['family_id'] if index else None,
                    'asset_ids': sorted({r['asset_id']
                                         for r in grouped.get(family['family_id'], [])
                                         if r['asset_id']}),
                }
                for index, family in enumerate(rows)
            ],
        }

    tree = {
        'schema': 'silent-depth-defensive-technology-tree-v1',
        'generated_at': TODAY,
        'note_zh': '这是游戏科技树层级，不是现实作战能力评分；T1-T10 只是游戏内列装顺序。',
        'root': 'DEFENSIVE SYSTEM',
        'branches': [b['branch_id'] for b in dataset.BRANCHES],
        'tiers': tiers,
        'branch_trees': branch_trees,
        'totals': {
            'tiers': len(tiers),
            'nodes': sum(len(t['nodes']) for t in tiers.values()),
            'families': len(dataset.FAMILIES),
            'database_only_families': sum(
                1 for f in dataset.FAMILIES
                if not any(r['asset_id'] for r in grouped.get(f['family_id'], []))
            ),
        },
    }
    return tree, tier_manifest


def main() -> int:
    tree, tier_manifest = build_technology_tree()
    save_json(TREE_DIR / 'defensive_technology_tree.json', tree)
    save_json(TREE_DIR / 'tier_manifest.json', tier_manifest)
    for tier, manifest in tier_manifest.items():
        print(f"{tier}={len(manifest)}")
    print(f"NODES={tree['totals']['nodes']}")
    print(f"DATABASE_ONLY_FAMILIES={tree['totals']['database_only_families']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
