#!/usr/bin/env python3
"""生成 loadout_manifest.json：每艘潜艇的装备槽位与允许武器列表。

数据来源是兼容矩阵，槽位由发射接口推导，不做任何手工硬编码。
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import MANIFEST_DIR, SLOT_ORDER, TODAY, save_json, weapon_slot  # noqa: E402
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_compatibility import build as build_matrix  # noqa: E402


def build() -> dict:
    matrix = build_matrix()
    submarines = []
    for entry in matrix['submarines']:
        slots: dict[str, dict] = {}
        excluded: list[dict] = []
        for weapon in entry['compatible_weapons']:
            level = weapon['compatibility']
            if level == 'INCOMPATIBLE':
                excluded.append({'weapon_id': weapon['weapon_id'], 'compatibility': level,
                                 'reason': weapon['reason']})
                continue
            if level == 'UNKNOWN':
                excluded.append({'weapon_id': weapon['weapon_id'], 'compatibility': level,
                                 'reason': weapon['reason']})
                continue
            slot = weapon['slot'] or weapon_slot(weapon['category'], VARIANTS_BY_ID[weapon['weapon_id']]['launch_methods'])
            if not slot:
                excluded.append({'weapon_id': weapon['weapon_id'], 'compatibility': level,
                                 'reason': '该武器没有可由潜艇使用的发射接口。'})
                continue
            bucket = slots.setdefault(slot, {'slot': slot, 'allowed': [], 'details': []})
            bucket['allowed'].append(weapon['weapon_id'])
            bucket['details'].append({
                'weapon_id': weapon['weapon_id'],
                'category': weapon['category'],
                'family': weapon['family'],
                'compatibility': level,
                'reason': weapon['reason'],
            })

        ordered_slots = []
        for slot in SLOT_ORDER:
            bucket = slots.get(slot)
            if not bucket:
                continue
            bucket['allowed'] = sorted(set(bucket['allowed']))
            bucket['details'] = sorted(bucket['details'], key=lambda d: d['weapon_id'])
            tiers = sorted({VARIANTS_BY_ID[w]['tier'] for w in bucket['allowed']})
            bucket['tier_range'] = [tiers[0], tiers[-1]]
            ordered_slots.append(bucket)

        submarines.append({
            'submarine': entry['submarine'],
            'country': entry['country'],
            'type': entry['type'],
            'submarine_tier': entry['submarine_tier'],
            'launch_interface': entry['launch_interface'],
            'weapon_slots': ordered_slots,
            'excluded_weapons': excluded,
            'summary': {
                'slots': len(ordered_slots),
                'allowed_weapons': sum(len(s['allowed']) for s in ordered_slots),
            },
        })

    return {
        'manifest': 'SilentDepth_Loadout_Manifest',
        'generated_at': TODAY,
        'policy': [
            'Loadout 完全由兼容矩阵推导，潜艇不硬编码武器，武器也不硬编码潜艇。',
            '只有具备潜艇发射接口的武器才进入槽位。',
            'UNKNOWN 与 INCOMPATIBLE 的武器不会出现在可装备列表中，但保留在 excluded_weapons 供审计。',
        ],
        'slot_definition': {
            'TORPEDO': '鱼雷发射管发射的鱼雷、水雷、诱饵等非导弹载荷。',
            'MISSILE': '鱼雷发射管封装的导弹或火箭载荷（反舰/对陆/反潜）。',
            'VLS': '垂直发射装置，通常为反舰/对陆巡航导弹。',
            'SLBM': '战略弹道导弹发射筒。',
            'SPECIAL': '任务载荷模块，例如干式甲板掩蔽舱与特种输送载具。',
        },
        'summary': {
            'submarines': len(submarines),
            'submarines_with_slots': sum(1 for s in submarines if s['weapon_slots']),
            'total_allowed_entries': sum(s['summary']['allowed_weapons'] for s in submarines),
        },
        'submarines': submarines,
    }


def main() -> int:
    manifest = build()
    out = MANIFEST_DIR / 'loadout_manifest.json'
    save_json(out, manifest)
    print(f"SUBMARINES={manifest['summary']['submarines']}")
    print(f"WITH_SLOTS={manifest['summary']['submarines_with_slots']}")
    print(f"ALLOWED_ENTRIES={manifest['summary']['total_allowed_entries']}")
    print(f'OUT={out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
