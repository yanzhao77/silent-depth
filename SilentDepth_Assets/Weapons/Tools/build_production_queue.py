#!/usr/bin/env python3
"""生成 weapon_production_queue.json：武器资产生产队列与状态。

状态在真实执行后再推进；没有产出文件的武器不会被写成 COMPLETE。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    MANIFEST_DIR,
    PRODUCTION_STATES,
    TODAY,
    load_json,
    save_json,
    weapon_asset_dir,
)
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402

REQUIRED_COMPLETE = (
    'Blend/{id}_MASTER.blend',
    'FBX/{id}_LOD0.fbx',
    'FBX/{id}_LOD1.fbx',
    'FBX/{id}_LOD2.fbx',
    'FBX/{id}_LOD3.fbx',
    'Collision/{id}_COLLISION.fbx',
    'Documentation/{id}_SPEC.json',
    'Documentation/{id}_README.md',
    'Validation/{id}_VALIDATION.json',
)

PRIORITY_ORDER = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2, 'DATABASE_ONLY': 3}


def detect_state(weapon_id: str) -> str:
    root = weapon_asset_dir(VARIANTS_BY_ID[weapon_id])
    present = [pattern.format(id=weapon_id) for pattern in REQUIRED_COMPLETE if (root / pattern.format(id=weapon_id)).exists()]
    if len(present) == len(REQUIRED_COMPLETE):
        # 文件齐备后由校验器结论决定：PASS -> COMPLETE，其余停留在 VALIDATING。
        validation = root / 'Validation' / f'{weapon_id}_VALIDATION.json'
        if validation.is_file():
            try:
                if load_json(validation).get('result') == 'PASS':
                    return 'COMPLETE'
            except (ValueError, OSError):
                return 'VALIDATING'
        return 'VALIDATING'
    if present:
        return 'EXPORT'
    if (root / 'Source').is_dir() and any((root / 'Source').iterdir()):
        return 'MODELING'
    return 'PLANNED'


def build() -> dict:
    previous = {}
    queue_path = MANIFEST_DIR / 'weapon_production_queue.json'
    if queue_path.is_file():
        previous = load_json(queue_path).get('status_by_weapon', {})

    status_by_weapon = {}
    queue_order = []
    database_only = []
    deferred = []
    for weapon_id, variant in sorted(
        VARIANTS_BY_ID.items(),
        key=lambda item: (PRIORITY_ORDER[item[1]['asset_priority']], item[1]['tier'], item[0]),
    ):
        detected = detect_state(weapon_id)
        manual = previous.get(weapon_id)
        # 仅保留人工 BLOCKED 标记；其余状态一律以磁盘实际产出 + 校验结论为准。
        state = 'BLOCKED' if manual == 'BLOCKED' else detected
        status_by_weapon[weapon_id] = state
        entry = {
            'weapon_id': weapon_id,
            'category': variant['category'],
            'family': variant['family_id'],
            'tier': variant['tier'],
            'asset_priority': variant['asset_priority'],
            'production_decision': variant.get('production_decision', 'DEFERRED'),
            'geometry_kind': variant['geometry']['kind'],
            'status': state,
        }
        if variant.get('production_decision') == 'DATABASE_ONLY':
            database_only.append(entry)
        elif variant.get('production_decision') == 'DEFERRED':
            deferred.append(entry)
        else:
            queue_order.append(entry)

    return {
        'queue': 'SilentDepth_Weapon_Production_Queue',
        'generated_at': TODAY,
        'states': list(PRODUCTION_STATES),
        'policy': [
            '每批 1-5 个武器，批次之间保存、校验、清理，避免单次 Blender 会话过长。',
            '单个武器失败不终止整个项目：记录 error/log/stack trace 后进入重试队列。',
            '资料不足的武器标记 BLOCKED 并继续下一个。',
            'DATABASE_ONLY 的武器不进入 3D 生产队列。',
        ],
        'summary': {
            'total_variants': len(VARIANTS_BY_ID),
            'queue_length': len(queue_order),
            'deferred': len(deferred),
            'database_only': len(database_only),
            'status_counts': {
                state: sum(1 for entry in queue_order if entry['status'] == state)
                for state in PRODUCTION_STATES
            },
            'priority_counts': {
                priority: sum(1 for entry in queue_order if entry['asset_priority'] == priority)
                for priority in ('HIGH', 'MEDIUM', 'LOW')
            },
        },
        'status_by_weapon': status_by_weapon,
        'queue_order': queue_order,
        'deferred': deferred,
        'database_only': database_only,
        'retry_queue': [],
        'blocking_conditions': {},
    }


def main() -> int:
    queue = build()
    save_json(MANIFEST_DIR / 'weapon_production_queue.json', queue)
    print(f"QUEUE_LENGTH={queue['summary']['queue_length']}")
    print(f"DATABASE_ONLY={queue['summary']['database_only']}")
    print(f"PRIORITY_COUNTS={queue['summary']['priority_counts']}")
    print(f"STATUS_COUNTS={queue['summary']['status_counts']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
