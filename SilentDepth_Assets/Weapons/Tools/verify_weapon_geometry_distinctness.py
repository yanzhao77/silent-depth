#!/usr/bin/env python3
"""几何唯一性审计：证明不同武器不是复制改名而来。

规则（与 weapon_dataset 的说明一致）：
  * 同一个 Family 内的变体**允许**共享基础几何（例如 Mk 48 Mod 6/Mod 7）；
  * 不同 Family 的武器**必须**具有不同的几何签名，否则视为“复制改名”违规；
  * DATABASE_ONLY 的武器不建模，也不参与唯一性比较。

输出：Weapons/Manifest/weapon_geometry_distinctness.json
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import MANIFEST_DIR, TODAY, save_json  # noqa: E402
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402
from weapon_geometry_kit import build_geometry  # noqa: E402


def geometry_signature(spec: dict) -> dict:
    part = build_geometry(spec, detail=1)
    digest = hashlib.sha256()
    for vertex in part.vertices:
        digest.update(f'{vertex[0]:.6f},{vertex[1]:.6f},{vertex[2]:.6f};'.encode())
    for face in part.faces:
        digest.update(','.join(str(index) for index in face).encode() + b';')
    bounds = part.bounds()
    return {
        'signature': digest.hexdigest(),
        'triangles': part.stats()['triangles'],
        'length_m': round(bounds['dimensions_m'][0], 4),
    }


def main() -> int:
    signatures: dict[str, dict] = {}
    for weapon_id, variant in VARIANTS_BY_ID.items():
        if variant['asset_priority'] == 'DATABASE_ONLY':
            continue
        spec = {
            'weapon_id': weapon_id,
            'geometry': variant['geometry'],
            'dimensions': variant['dimensions'],
            'body_diameter_m': (variant['geometry'].get('params') or {}).get('body_diameter_m')
            or variant['dimensions']['diameter_m'],
        }
        signatures[weapon_id] = geometry_signature(spec)

    groups: dict[str, list[str]] = defaultdict(list)
    for weapon_id, record in signatures.items():
        groups[record['signature']].append(weapon_id)

    violations = []
    shared_groups = []
    for signature, weapon_ids in groups.items():
        families = {VARIANTS_BY_ID[weapon_id]['family_id'] for weapon_id in weapon_ids}
        entry = {
            'signature': signature,
            'weapons': sorted(weapon_ids),
            'families': sorted(families),
            'triangles': signatures[weapon_ids[0]]['triangles'],
        }
        if len(families) > 1:
            violations.append(entry)
        elif len(weapon_ids) > 1:
            shared_groups.append(entry)

    summary = {
        'weapons_compared': len(signatures),
        'distinct_signatures': len(groups),
        'intra_family_shared_geometry': len(shared_groups),
        'cross_family_duplicates': len(violations),
        'database_only_excluded': sum(
            1 for variant in VARIANTS_BY_ID.values() if variant['asset_priority'] == 'DATABASE_ONLY'
        ),
    }
    report = {
        'audit': 'WeaponGeometryDistinctness',
        'generated_at': TODAY,
        'policy': [
            '同一 Family 内的变体允许共享基础几何（数据层区分）。',
            '不同 Family 之间不允许存在完全相同的几何签名。',
            'DATABASE_ONLY 的武器不建模，不参与比较。',
        ],
        'summary': summary,
        'cross_family_duplicates': violations,
        'intra_family_shared_geometry': shared_groups,
    }
    path = MANIFEST_DIR / 'weapon_geometry_distinctness.json'
    save_json(path, report)

    print(f"COMPARED={summary['weapons_compared']}")
    print(f"DISTINCT={summary['distinct_signatures']}")
    print(f"INTRA_FAMILY_SHARED={summary['intra_family_shared_geometry']}")
    print(f"CROSS_FAMILY_DUPLICATES={summary['cross_family_duplicates']}")
    print(f'OUT={path}')
    return 1 if violations else 0


if __name__ == '__main__':
    raise SystemExit(main())
