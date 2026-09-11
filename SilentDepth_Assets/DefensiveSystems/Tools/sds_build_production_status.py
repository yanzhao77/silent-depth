#!/usr/bin/env python3
"""Derives Manifest/defensive_production_status.json from real disk evidence.

Status rules (no optimistic labels):

    COMPLETE    - the asset validator reported PASS for this asset
    VALIDATING  - master + full LOD set + collision + SPEC exist on disk
    BUILDING    - some pipeline files exist but the set is incomplete
    PLANNED     - nothing built yet
    BLOCKED     - the build report recorded a failure for this asset
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    DEFENSIVE_ROOT,
    MANIFEST_DIR,
    TODAY,
    VALIDATION_DIR,
    defensive_asset_dir,
    load_json,
    save_json,
)


def _validator_result(asset_dir: Path, asset_id: str) -> str | None:
    path = asset_dir / 'Validation' / f'{asset_id}_VALIDATION.json'
    if not path.is_file():
        return None
    try:
        data = load_json(path)
    except Exception:
        return 'UNREADABLE'
    if isinstance(data, dict):
        return data.get('result') or data.get('status')
    return None


def build_status() -> dict:
    build_report_path = MANIFEST_DIR / 'defensive_asset_build_report.json'
    build_report = load_json(build_report_path) if build_report_path.is_file() else {}
    build_failures = {
        row.get('asset_id'): row.get('status')
        for row in build_report.get('assets', [])
        if row.get('status') not in (None, 'OK', 'COMPLETE', 'BUILT')
    }

    status_by_asset = {}
    evidence = {}
    for asset in dataset.ASSETS:
        asset_id = asset['asset_id']
        asset_dir = defensive_asset_dir(asset)
        master = asset_dir / 'Blend' / f'{asset_id}_MASTER.blend'
        lods = [asset_dir / 'FBX' / f'{asset_id}_LOD{index}.fbx' for index in range(4)]
        collision = asset_dir / 'Collision' / f'{asset_id}_COLLISION.fbx'
        spec = asset_dir / 'Documentation' / f'{asset_id}_SPEC.json'
        full_set = master.is_file() and all(path.is_file() for path in lods) and collision.is_file()
        validator = _validator_result(asset_dir, asset_id)
        if validator == 'PASS' and full_set and spec.is_file():
            status = 'COMPLETE'
        elif full_set and spec.is_file():
            status = 'VALIDATING'
        elif any([master.is_file(), *(path.is_file() for path in lods), collision.is_file()]):
            status = 'BUILDING'
        elif asset_id in build_failures:
            status = 'BLOCKED'
        else:
            status = 'PLANNED'
        status_by_asset[asset_id] = status
        evidence[asset_id] = {
            'master_blend': master.is_file(),
            'lod_fbx_present': sum(1 for path in lods if path.is_file()),
            'collision_fbx': collision.is_file(),
            'spec_json': spec.is_file(),
            'validator_result': validator,
        }

    queue = sorted(
        (asset['asset_id'] for asset in dataset.ASSETS),
        key=lambda asset_id: (
            {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2, 'DATABASE_ONLY': 3}[
                dataset.ASSET_BY_ID[asset_id]['priority']],
            asset_id,
        ),
    )

    return {
        'schema': 'silent-depth-defensive-production-status-v1',
        'generated_at': TODAY,
        'updated_at': TODAY,
        'asset_root': str(DEFENSIVE_ROOT),
        'queue_order': queue,
        'status_by_asset': status_by_asset,
        'evidence': evidence,
        'blocking_conditions': build_report.get('blocking_conditions', {}),
        'policy_zh': [
            'COMPLETE 只由验证器 PASS 判定；没有验证证据的资产最高为 VALIDATING。',
            'BLOCKED 只来自构建报告里真实的失败记录。',
        ],
    }


def main() -> int:
    status = build_status()
    save_json(MANIFEST_DIR / 'defensive_production_status.json', status)
    counts: dict[str, int] = {}
    for value in status['status_by_asset'].values():
        counts[value] = counts.get(value, 0) + 1
    print(f"STATUS={counts}")
    print(f"QUEUE={len(status['queue_order'])}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
