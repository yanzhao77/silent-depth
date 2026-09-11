#!/usr/bin/env python3
"""武器 3D 资产生产编排器。

按 weapon_manifest.json 选择武器，分批调用 Blender 工厂，收集结果并更新生产队列。
单批失败不会终止整个项目：失败项记录后进入重试队列，其余继续。

用法示例：
    python build_weapon_assets.py --priority HIGH --batch-size 3
    python build_weapon_assets.py --weapons US_TORP_Mk48 UK_TORP_Spearfish
    python build_weapon_assets.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    CATEGORY_DIR,
    DOC_DIR,
    MANIFEST_DIR,
    TODAY,
    WEAPONS_ROOT,
    load_json,
    save_json,
    save_text,
    weapon_asset_dir,
)
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)
JOB_DIR = Path(__file__).resolve().parent / '_jobs'
PRIORITY_ORDER = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}


def find_blender() -> Path:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise RuntimeError('未找到 Blender 可执行文件，请更新 BLENDER_CANDIDATES。')


def weapon_spec(weapon_id: str) -> dict:
    variant = VARIANTS_BY_ID[weapon_id]
    params = variant['geometry'].get('params') or {}
    return {
        'weapon_id': weapon_id,
        'display_name': variant['display_name'],
        'short_name': variant['short_name'],
        'category': variant['category'],
        'family_id': variant['family_id'],
        'base_geometry': variant.get('base_geometry') or variant['family_id'],
        'country': variant['country'],
        'role': variant['role'],
        'subrole': variant['subrole'],
        'era': variant['era'],
        'service_years': variant['service_years'],
        'tier': variant['tier'],
        'tier_reason': variant['tier_reason'],
        'launch_methods': variant['launch_methods'],
        'dimensions': variant['dimensions'],
        'body_diameter_m': params.get('body_diameter_m') or variant['dimensions']['diameter_m'],
        'geometry': variant['geometry'],
        'notes': variant.get('notes', ''),
    }


def select_weapons(args) -> list[str]:
    status = {}
    queue_path = MANIFEST_DIR / 'weapon_production_queue.json'
    if queue_path.is_file():
        status = load_json(queue_path).get('status_by_weapon', {})

    if args.weapons:
        unknown = [w for w in args.weapons if w not in VARIANTS_BY_ID]
        if unknown:
            raise SystemExit(f'未知武器 ID：{unknown}')
        selected = list(args.weapons)
    elif getattr(args, 'all_built', False):
        # 重建模式：使用数据集显式声明的生产集合，保证同一命令在任何时间点都可复现。
        from weapon_production_curation import production_set

        selected = list(production_set())
    else:
        selected = [
            weapon_id for weapon_id, variant in sorted(
                VARIANTS_BY_ID.items(),
                key=lambda item: (item[1]['tier'], PRIORITY_ORDER.get(item[1]['asset_priority'], 9), item[0]),
            )
            if variant.get('production_decision') == 'MODEL_NOW'
        ]
        if args.priority:
            selected = [w for w in selected if VARIANTS_BY_ID[w]['asset_priority'] in args.priority]
    if not args.force:
        selected = [
            weapon_id for weapon_id in selected
            if not (weapon_asset_dir(VARIANTS_BY_ID[weapon_id]) / 'Blend' / f'{weapon_id}_MASTER.blend').is_file()
        ]
    if args.limit:
        selected = selected[:args.limit]
    return selected


def archive_existing(weapons: list[str], batch_index: int) -> list[str]:
    """重建前把同 ID 的历史产出移到归档目录（可恢复），不直接删除。"""
    import shutil

    archived = []
    stamp = time.strftime('%Y%m%d_%H%M%S')
    for weapon_id in weapons:
        asset_dir = weapon_asset_dir(VARIANTS_BY_ID[weapon_id])
        if not asset_dir.is_dir() or not any(asset_dir.rglob('*')):
            continue
        target = WEAPONS_ROOT / '_archive' / f'{stamp}_batch{batch_index:03d}' / weapon_id
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(asset_dir), str(target))
        archived.append(str(target))
    return archived


def run_batch(blender: Path, weapons: list[str], batch_index: int, no_preview: bool) -> dict:
    JOB_DIR.mkdir(parents=True, exist_ok=True)
    job_path = JOB_DIR / f'batch_{batch_index:03d}.json'
    job = {
        'batch_index': batch_index,
        'generated_at': TODAY,
        'category_dirs': CATEGORY_DIR,
        'weapons': [weapon_spec(weapon_id) for weapon_id in weapons],
    }
    save_json(job_path, job)
    command = [
        str(blender), '--background', '--factory-startup', '--python',
        str(Path(__file__).resolve().parent / 'weapon_factory_blender.py'),
        '--', '--job', str(job_path), '--root', str(WEAPONS_ROOT),
    ]
    if no_preview:
        command.append('--no-preview')
    archived = archive_existing(weapons, batch_index)
    started = time.time()
    completed = subprocess.run(command, capture_output=True, text=True, timeout=3600)
    log_path = JOB_DIR / f'batch_{batch_index:03d}.log'
    save_text(log_path, (completed.stdout or '') + '\n--- STDERR ---\n' + (completed.stderr or ''))
    results = []
    for line in (completed.stdout or '').splitlines():
        if line.startswith('WPN_BATCH_RESULT='):
            payload = line[len('WPN_BATCH_RESULT='):]
            results = json.JSONDecoder().raw_decode(payload)[0]
    if not results:
        # Blender 进程崩溃/被杀时不会打印结果行：必须显式记为失败并进入重试队列，
        # 不能让整批静默消失。
        tail = ((completed.stderr or '') + (completed.stdout or ''))[-800:]
        results = [
            {
                'weapon_id': weapon_id,
                'status': 'FAILED',
                'error': f'Blender 批次未返回结果（returncode={completed.returncode}）',
                'log_tail': tail,
            }
            for weapon_id in weapons
        ]
    return {
        'batch_index': batch_index,
        'weapons': weapons,
        'archived': archived,
        'returncode': completed.returncode,
        'duration_seconds': round(time.time() - started, 1),
        'results': results,
        'log': str(log_path),
    }


def update_queue(batch_results: list[dict]) -> dict:
    queue_path = MANIFEST_DIR / 'weapon_production_queue.json'
    queue = load_json(queue_path) if queue_path.is_file() else {
        'status_by_weapon': {}, 'retry_queue': [], 'blocking_conditions': {},
    }
    status = queue.setdefault('status_by_weapon', {})
    blocking = queue.setdefault('blocking_conditions', {})
    retry = queue.setdefault('retry_queue', [])
    for batch in batch_results:
        for result in batch['results']:
            weapon_id = result['weapon_id']
            if result['status'] == 'OK':
                status[weapon_id] = 'VALIDATING'
                blocking.pop(weapon_id, None)
            else:
                status[weapon_id] = 'FAILED'
                blocking[weapon_id] = result.get('error', '未知错误')
                if weapon_id not in retry:
                    retry.append(weapon_id)
    queue['updated_at'] = TODAY
    save_json(queue_path, queue)
    return queue


def write_run_log(batch_results: list[dict], total_seconds: float) -> Path:
    lines = [
        '# SILENT DEPTH 武器资产生产运行日志',
        '',
        f'运行时间：{TODAY}　总耗时：{round(total_seconds, 1)} 秒',
        '',
        '| 批次 | 武器 | 结果 | 耗时(s) |',
        '| --- | --- | --- | --- |',
    ]
    built = 0
    failed = 0
    for batch in batch_results:
        for result in batch['results']:
            state = '成功' if result['status'] == 'OK' else '失败'
            if result['status'] == 'OK':
                built += 1
            else:
                failed += 1
            lines.append(f"| {batch['batch_index']} | {result['weapon_id']} | {state} | {batch['duration_seconds']} |")
    lines.extend([
        '',
        f'成功：{built}　失败：{failed}',
        '',
        '失败条目已记录到 weapon_production_queue.json 的 blocking_conditions 与 retry_queue。',
        '',
    ])
    path = DOC_DIR / 'WEAPON_ASSET_RUN_LOG.md'
    save_text(path, '\n'.join(lines))
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--weapons', nargs='*')
    parser.add_argument('--priority', nargs='*', choices=['HIGH', 'MEDIUM', 'LOW'])
    parser.add_argument('--limit', type=int)
    parser.add_argument('--batch-size', type=int, default=3)
    parser.add_argument('--no-preview', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--all-built', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    selected = select_weapons(args)
    print(f'SELECTED={len(selected)}')
    for weapon_id in selected:
        variant = VARIANTS_BY_ID[weapon_id]
        print(f"  {weapon_id} T{variant['tier']} {variant['asset_priority']} {variant['geometry']['kind']}")
    if args.dry_run or not selected:
        return 0

    blender = find_blender()
    started = time.time()
    batches = []
    for index in range(0, len(selected), args.batch_size):
        chunk = selected[index:index + args.batch_size]
        batch_index = index // args.batch_size
        print(f'--- 批次 {batch_index}: {chunk}')
        try:
            batch = run_batch(blender, chunk, batch_index, args.no_preview)
        except subprocess.TimeoutExpired:
            batch = {
                'batch_index': batch_index, 'weapons': chunk, 'returncode': -1,
                'duration_seconds': 3600, 'results': [
                    {'weapon_id': weapon_id, 'status': 'FAILED', 'error': 'Blender 批次超时'} for weapon_id in chunk
                ], 'log': None,
            }
        batches.append(batch)
        for result in batch['results']:
            if result['status'] == 'OK':
                stats = result['stats']
                print(f"  OK {result['weapon_id']} tris={stats['lod']['LOD0']['triangles']} "
                      f"collision={stats['collision_boxes']} t={stats['build_seconds']}s")
            else:
                print(f"  FAILED {result['weapon_id']}: {result.get('error')}")
    queue = update_queue(batches)
    log_path = write_run_log(batches, time.time() - started)
    print(f'RETRY_QUEUE={queue.get("retry_queue")}')
    print(f'LOG={log_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
