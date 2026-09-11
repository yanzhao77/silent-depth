#!/usr/bin/env python3
"""Builds the submarine x defensive-system compatibility matrix and loadouts.

Levels
------
CONFIRMED / PROBABLE  only from an explicit public source (never inferred).
GAMEPLAY              the platform may mount it in game for its technology tier.
UNKNOWN               public data is insufficient; no inference is made.
INCOMPATIBLE          the platform is far outside the family's era window
                      (a game rule, documented in the output file).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    COMPATIBILITY_LEVELS,
    COUNTRY_CODE,
    DOC_DIR,
    MANIFEST_DIR,
    TODAY,
    load_submarines,
    save_json,
    write_csv,
)


def variant_index() -> dict[str, dict]:
    return {row['variant_id']: row for row in dataset.variants()}


def compat_level(platform_tier: int, family: dict, explicit: dict | None) -> tuple[str, str]:
    if explicit:
        sources = explicit.get('sources') or []
        if sources:
            first = sources[0]
            token = first.get('url') or first.get('title') or first.get('key') or 'PUBLIC_SOURCE'
        else:
            token = 'GAMEPLAY_POLICY'
        return explicit['status'], token
    slack = dataset.COMPATIBILITY_POLICY['tier_window_slack']
    gap = family['tier_min'] - platform_tier
    if gap <= slack:
        return 'GAMEPLAY', 'GAMEPLAY_POLICY'
    if gap <= 3:
        return 'UNKNOWN', 'UNKNOWN_INSUFFICIENT_PUBLIC_DATA'
    return 'INCOMPATIBLE', 'ERA_WINDOW_POLICY'


def build_compatibility() -> dict:
    submarines = load_submarines()
    variants = variant_index()
    research = dataset.research_compatibility()
    seed = {(row['submarine'], row['family_id']): row for row in dataset.COMPATIBILITY_SEED}
    demotions = []

    entries = []
    for submarine in submarines:
        tier = submarine['tier']
        country = submarine['country']
        for family in dataset.FAMILIES:
            key = (submarine['asset_id'], family['family_id'])
            explicit = None
            claim = research.get(f"{submarine['asset_id']}|{family['family_id']}")
            if claim:
                explicit = {
                    'status': claim.get('status', 'GAMEPLAY'),
                    'system': claim.get('system'),
                    'note_zh': claim.get('note_zh', ''),
                    'sources': claim.get('sources', []),
                }
            elif key in seed:
                row = seed[key]
                explicit = {
                    'status': row['status'],
                    'system': row['system'],
                    'note_zh': row.get('note_zh', ''),
                    'sources': [],
                }

            if explicit and explicit['status'] in ('CONFIRMED', 'PROBABLE') and not explicit['sources']:
                demotions.append({
                    'submarine': submarine['asset_id'],
                    'family': family['family_id'],
                    'was': explicit['status'],
                    'reason_zh': '缺少公开来源记录，按策略降级为 GAMEPLAY。',
                })
                explicit = {
                    'status': 'GAMEPLAY',
                    'system': explicit.get('system'),
                    'note_zh': (explicit.get('note_zh', '') +
                                ' 无公开来源记录，降级为游戏设定。').strip(),
                    'sources': [],
                }

            level, source = compat_level(tier, family, explicit)
            variant = variants.get(f"{family['family_id']}-{COUNTRY_CODE[country]}", {})
            anchor = (explicit or {}).get('system')
            entries.append({
                'submarine': submarine['asset_id'],
                'country': country,
                'type': submarine['type'],
                'class': submarine['class'],
                'platform_tier': tier,
                'branch': family['branch'],
                'family': family['family_id'],
                'family_label': family['label'],
                'variant': variant.get('variant_id'),
                'variant_anchor': variant.get('anchor'),
                'system': anchor or family['label'],
                'compatibility': level,
                'status': (explicit or {}).get('status', level),
                'source': source,
                'sources': (explicit or {}).get('sources', []),
                'note_zh': (explicit or {}).get('note_zh', ''),
                'asset_id': variant.get('asset_id'),
                'socket': next((slot['socket'] for slot in dataset.LOADOUT_SLOTS
                                if slot['branch'] == family['branch']), ''),
                'tier_min': family['tier_min'],
            })

    by_level = {level: 0 for level in COMPATIBILITY_LEVELS}
    by_branch: dict[str, dict[str, int]] = {}
    for entry in entries:
        by_level[entry['compatibility']] += 1
        counter = by_branch.setdefault(entry['branch'], {level: 0 for level in COMPATIBILITY_LEVELS})
        counter[entry['compatibility']] += 1

    return {
        'schema': 'silent-depth-submarine-defensive-compatibility-v1',
        'generated_at': TODAY,
        'fields_zh': {
            'submarine': '平台资产 ID（继承自潜艇技术树 manifest）',
            'system': '锚定的公开系统名，或家族标签（游戏设定）',
            'family': '防御系统家族 ID',
            'variant': '家族在某国的变体 ID',
            'compatibility': 'CONFIRMED / PROBABLE / GAMEPLAY / UNKNOWN / INCOMPATIBLE',
            'status': '该行判断的验证状态',
            'source': '来源令牌或判定策略',
        },
        'policy': dataset.COMPATIBILITY_POLICY,
        'disclaimer_zh': [
            'GAMEPLAY 表示按游戏科技层级可装配，不代表该艇真实装备过该系统。',
            'CONFIRMED/PROBABLE 只来自公开来源，且必须带 source；缺来源会自动降级。',
            'UNKNOWN 表示公开资料不足；INCOMPATIBLE 表示超出该平台时代窗口（游戏规则）。',
            '本表不含任何真实电子战参数、频率、功率、欺骗逻辑或作战战术。',
        ],
        'demotions': demotions,
        'totals': {
            'platforms': len(submarines),
            'families': len(dataset.FAMILIES),
            'rows': len(entries),
            'by_level': by_level,
            'by_branch': by_branch,
        },
        'entries': entries,
    }


def best_family_for_branch(branch: str, platform_tier: int) -> dict:
    candidates = [f for f in dataset.FAMILIES
                  if f['branch'] == branch and f['tier_min'] <= platform_tier]
    if not candidates:
        candidates = [f for f in dataset.FAMILIES if f['branch'] == branch]
    return max(candidates, key=lambda f: (f['tier_min'], f['tier_max']))


def build_loadout(compat: dict) -> dict:
    variants = variant_index()
    index = {(row['submarine'], row['family']): row for row in compat['entries']}
    loadouts = []
    for submarine in load_submarines():
        tier = submarine['tier']
        slots = []
        for slot in dataset.LOADOUT_SLOTS:
            family = best_family_for_branch(slot['branch'], tier)
            row = index.get((submarine['asset_id'], family['family_id']), {})
            variant = variants.get(f"{family['family_id']}-{COUNTRY_CODE[submarine['country']]}", {})
            slots.append({
                'slot': slot['slot'],
                'label_zh': slot['label_zh'],
                'branch': slot['branch'],
                'required': slot['required'],
                'socket': slot['socket'],
                'family_id': family['family_id'],
                'variant_id': variant.get('variant_id'),
                'variant_anchor': variant.get('anchor'),
                'asset_id': variant.get('asset_id') or row.get('asset_id'),
                'compatibility': row.get('compatibility', 'UNKNOWN'),
                'status': row.get('status', 'UNKNOWN'),
                'source': row.get('source', 'UNKNOWN_INSUFFICIENT_PUBLIC_DATA'),
            })
        loadouts.append({
            'submarine': submarine['asset_id'],
            'country': submarine['country'],
            'type': submarine['type'],
            'class': submarine['class'],
            'platform_tier': tier,
            'slots': slots,
            'required_slots_unmet': [s['slot'] for s in slots
                                     if s['required'] and s['compatibility'] == 'INCOMPATIBLE'],
        })

    return {
        'schema': 'silent-depth-defensive-loadout-v1',
        'generated_at': TODAY,
        'note_zh': [
            '每个平台的装载方案由兼容性矩阵决定，不是硬编码的型号清单。',
            'socket 为空字符串的槽位（控制类）为艇内设备，不需要外部挂点。',
        ],
        'totals': {'platforms': len(loadouts), 'slots_per_platform': len(dataset.LOADOUT_SLOTS)},
        'loadouts': loadouts,
    }


def build_matrix_csv(compat: dict) -> None:
    submarines = load_submarines()
    by_sub: dict[str, list[dict]] = {}
    for entry in compat['entries']:
        by_sub.setdefault(entry['submarine'], []).append(entry)

    branch_order = [b['branch_id'] for b in dataset.BRANCHES]
    header = ['submarine', 'country', 'type', 'class', 'platform_tier'] + branch_order + [
        'confirmed', 'probable', 'gameplay', 'unknown', 'incompatible']
    rows = []
    for submarine in submarines:
        entries = by_sub.get(submarine['asset_id'], [])
        counts = {level: 0 for level in COMPATIBILITY_LEVELS}
        for entry in entries:
            counts[entry['compatibility']] += 1
        cells = []
        for branch in branch_order:
            branch_entries = [e for e in entries if e['branch'] == branch]
            if not branch_entries:
                cells.append('')
                continue
            best = 'INCOMPATIBLE'
            for level in COMPATIBILITY_LEVELS:
                if any(e['compatibility'] == level for e in branch_entries):
                    best = level
                    break
            cells.append(f'{best} ({len(branch_entries)})')
        rows.append([submarine['asset_id'], submarine['country'], submarine['type'],
                     submarine['class'], submarine['tier'], *cells,
                     counts['CONFIRMED'], counts['PROBABLE'], counts['GAMEPLAY'],
                     counts['UNKNOWN'], counts['INCOMPATIBLE']])
    write_csv(DOC_DIR / 'SubmarineDefensiveMatrix.csv', header, rows)

    full_header = ['submarine', 'country', 'type', 'class', 'platform_tier', 'branch', 'family',
                   'family_label', 'variant', 'variant_anchor', 'system', 'compatibility',
                   'status', 'source', 'asset_id', 'socket', 'tier_min', 'note_zh']
    full_rows = [[
        e['submarine'], e['country'], e['type'], e['class'], e['platform_tier'], e['branch'],
        e['family'], e['family_label'], e['variant'], e['variant_anchor'], e['system'],
        e['compatibility'], e['status'], e['source'], e['asset_id'], e['socket'],
        e['tier_min'], e['note_zh'],
    ] for e in compat['entries']]
    write_csv(DOC_DIR / 'SubmarineDefensiveMatrix_full.csv', full_header, full_rows)


def main() -> int:
    compat = build_compatibility()
    save_json(MANIFEST_DIR / 'submarine_defensive_compatibility.json', compat)
    loadout = build_loadout(compat)
    save_json(MANIFEST_DIR / 'defensive_loadout_manifest.json', loadout)
    build_matrix_csv(compat)
    print(f"COMPAT_ROWS={compat['totals']['rows']}")
    print(f"BY_LEVEL={compat['totals']['by_level']}")
    print(f"DEMOTIONS={len(compat['demotions'])}")
    print(f"LOADOUTS={loadout['totals']['platforms']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
