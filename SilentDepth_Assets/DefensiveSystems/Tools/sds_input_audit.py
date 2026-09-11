#!/usr/bin/env python3
"""Records what the defensive factory actually read before building anything.

Requirement steps 1 and 2 are "read the existing submarine technology tree" and
"read the weapon technology tree". This file is the evidence for both, with the
sha256 of every input so drift is detectable later.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sds_common import (  # noqa: E402
    DEFENSIVE_ROOT,
    DOC_DIR,
    SILENT_DEPTH_ASSETS_ROOT,
    SUBMARINE_DATABASE,
    SUBMARINE_MANIFEST,
    SUBMARINE_TECH_TREE,
    TODAY,
    load_json,
    save_json,
    sha256_file,
)

WEAPONS_ROOT = SILENT_DEPTH_ASSETS_ROOT / 'Weapons'
WEAPON_AUDIT = WEAPONS_ROOT / 'Documentation' / 'SubmarineWeaponIntegrationAudit.json'
TIER_MANIFEST = SILENT_DEPTH_ASSETS_ROOT / 'TechnologyTree' / 'tier_manifest.json'


def describe(path: Path, role_zh: str, extra: dict | None = None) -> dict:
    record = {
        'path': str(path),
        'exists': path.is_file(),
        'sha256': sha256_file(path) if path.is_file() else None,
        'bytes': path.stat().st_size if path.is_file() else None,
        'role_zh': role_zh,
    }
    if extra:
        record.update(extra)
    return record


def build_input_audit() -> dict:
    submarines = load_json(SUBMARINE_MANIFEST)['assets']
    database = load_json(SUBMARINE_DATABASE)['entries']
    tree = load_json(SUBMARINE_TECH_TREE)['tiers']

    tier_counts = {f'T{tier}': sum(len(entries) for entries in tree.get(f'T{tier}', {}).values())
                   for tier in range(1, 11)}
    by_country: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for asset in submarines:
        by_country[asset['country']] = by_country.get(asset['country'], 0) + 1
        by_type[asset['type']] = by_type.get(asset['type'], 0) + 1

    weapon_records = []
    if WEAPONS_ROOT.is_dir():
        for path in sorted(WEAPONS_ROOT.rglob('*')):
            if path.is_file():
                weapon_records.append(path.relative_to(SILENT_DEPTH_ASSETS_ROOT).as_posix())
    weapon_audit = load_json(WEAPON_AUDIT) if WEAPON_AUDIT.is_file() else {}

    on_disk_assets = []
    for asset_id_dir in (SILENT_DEPTH_ASSETS_ROOT / 'Submarines').rglob('*'):
        if asset_id_dir.is_dir() and (asset_id_dir / 'Blend').is_dir():
            blends = sorted(path.name for path in (asset_id_dir / 'Blend').glob('*.blend'))
            if blends:
                on_disk_assets.append({'asset_dir': asset_id_dir.name, 'blend': blends})

    return {
        'schema': 'silent-depth-defensive-input-audit-v1',
        'generated_at': TODAY,
        'requirement_steps_zh': {
            'step_1': '读取现有潜艇科技树',
            'step_2': '读取武器科技树',
        },
        'submarine_technology_tree': {
            'records': [
                describe(SUBMARINE_MANIFEST, '平台清单（54 条，权威来源）',
                         {'entries': len(submarines)}),
                describe(SUBMARINE_DATABASE, '平台数据库（尺寸与公开来源）',
                         {'entries': len(database)}),
                describe(SUBMARINE_TECH_TREE, '平台科技树（T1-T10）', {'tier_counts': tier_counts}),
                describe(TIER_MANIFEST, '平台层级清单'),
            ],
            'by_country': by_country,
            'by_type': by_type,
            'local_complete_assets': on_disk_assets,
        },
        'weapon_technology_tree': {
            'records': [
                describe(WEAPON_AUDIT, '武器集成审计（武器工厂当前唯一产物）',
                         {'totals': weapon_audit.get('totals')}),
            ],
            'files_present': weapon_records,
            'observation_zh': (
                '武器科技树目前只有第 1 阶段产物：SubmarineWeaponIntegrationAudit.json 与两个工具脚本，'
                '武器数据集与武器树尚未生成。因此本任务只把它当作"平台集成槽位契约"读取，'
                '不修改、不补写任何武器数据。'
            ),
        },
        'write_scope_zh': [
            '本任务只在 SilentDepth_Assets/DefensiveSystems/ 下写入。',
            '未修改 Submarines/、Weapons/、src/、ue4/ 下的任何文件。',
        ],
        'defensive_root': str(DEFENSIVE_ROOT),
    }


def main() -> int:
    audit = build_input_audit()
    path = DOC_DIR / 'defensive_input_audit.json'
    save_json(path, audit)
    print(f"SUBMARINES={audit['submarine_technology_tree']['records'][0]['entries']}")
    print(f"WEAPON_FILES={len(audit['weapon_technology_tree']['files_present'])}")
    print(f"LOCAL_COMPLETE_ASSETS={len(audit['submarine_technology_tree']['local_complete_assets'])}")
    print(f"OUT={path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
