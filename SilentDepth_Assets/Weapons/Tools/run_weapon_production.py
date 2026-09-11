#!/usr/bin/env python3
"""并行武器资产生产驱动：把生产队列切成多个 Blender 工作进程。

与 build_weapon_assets.py 使用同一个 Blender 工厂与同一份数据集，区别是：
  * 每个工作进程有独立的 job/日志目录，互不覆盖；
  * 全部结果在主机侧合并回 weapon_production_queue.json 与运行日志；
  * 单个武器或单个工作进程失败都不会终止整个项目。

用法：
    python run_weapon_production.py --workers 4 --priority HIGH MEDIUM
    python run_weapon_production.py --retry-only --workers 2
    python run_weapon_production.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
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
from build_weapon_assets import find_blender, weapon_spec  # noqa: E402
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402

PRIORITY_ORDER = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
QUEUE_PATH = MANIFEST_DIR / 'weapon_production_queue.json'
RUN_ROOT = Path(__file__).resolve().parent / '_jobs'


def is_built(weapon_id: str) -> bool:
    return (weapon_asset_dir(VARIANTS_BY_ID[weapon_id]) / 'Blend' / f'{weapon_id}_MASTER.blend').is_file()


def select(args) -> list[str]:
    if args.weapons:
        unknown = [weapon for weapon in args.weapons if weapon not in VARIANTS_BY_ID]
        if unknown:
            raise SystemExit(f'未知武器 ID：{unknown}')
        candidates = list(args.weapons)
    elif args.retry_only:
        queue = load_json(QUEUE_PATH) if QUEUE_PATH.is_file() else {}
        candidates = [weapon for weapon in queue.get('retry_queue', []) if weapon in VARIANTS_BY_ID]
    else:
        priorities = args.priority or ['HIGH', 'MEDIUM', 'LOW']
        candidates = [
            weapon_id for weapon_id, variant in sorted(
                VARIANTS_BY_ID.items(),
                key=lambda item: (PRIORITY_ORDER.get(item[1]['asset_priority'], 9),
                                  item[1]['tier'], item[0]),
            )
            if variant['asset_priority'] in priorities
        ]

    if not args.force:
        candidates = [weapon_id for weapon_id in candidates if not is_built(weapon_id)]
    if args.limit:
        candidates = candidates[:args.limit]
    return candidates


def chunk(weapons: list[str], workers: int) -> list[list[str]]:
    """按预计成本分配：外形越长的武器越早安排，负载尽量均衡。"""
    ordered = sorted(
        weapons,
        key=lambda weapon_id: -float(VARIANTS_BY_ID[weapon_id]['dimensions']['length_m']),
    )
    buckets: list[list[str]] = [[] for _ in range(workers)]
    for index, weapon_id in enumerate(ordered):
        buckets[index % workers].append(weapon_id)
    return [bucket for bucket in buckets if bucket]


def run_worker(blender: Path, weapons: list[str], worker: int, run_dir: Path,
               render: bool, timeout: int) -> dict:
    job_path = run_dir / f'worker_{worker:02d}.json'
    log_path = run_dir / f'worker_{worker:02d}.log'
    result_path = run_dir / f'worker_{worker:02d}_result.json'
    save_json(job_path, {
        'batch_index': worker,
        'generated_at': TODAY,
        'category_dirs': CATEGORY_DIR,
        'weapons': [weapon_spec(weapon_id) for weapon_id in weapons],
    })
    command = [
        str(blender), '--background', '--factory-startup', '--python',
        str(Path(__file__).resolve().parent / 'weapon_factory_blender.py'),
        '--', '--job', str(job_path), '--root', str(WEAPONS_ROOT), '--result', str(result_path),
    ]
    if not render:
        command.append('--no-preview')
    started = time.time()
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        stdout, stderr, code = completed.stdout or '', completed.stderr or '', completed.returncode
    except subprocess.TimeoutExpired as expired:
        raw = expired.stdout
        stdout = raw.decode('utf-8', 'ignore') if isinstance(raw, bytes) else (raw or '')
        stderr = (expired.stderr.decode('utf-8', 'ignore') if isinstance(expired.stderr, bytes)
                  else (expired.stderr or '')) + '\nTIMEOUT'
        code = -1
    duration = round(time.time() - started, 1)
    save_text(log_path, stdout + '\n--- STDERR ---\n' + stderr)

    results = []
    if result_path.is_file():
        results = load_json(result_path)
    else:
        for line in stdout.splitlines():
            if line.startswith('WPN_BATCH_RESULT='):
                results = json.loads(line[len('WPN_BATCH_RESULT='):])
    if not results:
        results = [{'weapon_id': weapon_id, 'status': 'FAILED',
                    'error': f'工作进程未返回结果（returncode={code}）'} for weapon_id in weapons]
    return {
        'worker': worker, 'weapons': weapons, 'returncode': code,
        'duration_seconds': duration, 'results': results, 'log': str(log_path),
    }


def merge_queue(batch_results: list[dict]) -> dict:
    queue = load_json(QUEUE_PATH) if QUEUE_PATH.is_file() else {
        'status_by_weapon': {}, 'retry_queue': [], 'blocking_conditions': {},
    }
    status = queue.setdefault('status_by_weapon', {})
    blocking = queue.setdefault('blocking_conditions', {})
    retry = list(queue.setdefault('retry_queue', []))
    for batch in batch_results:
        for result in batch['results']:
            weapon_id = result['weapon_id']
            if result['status'] == 'OK':
                status[weapon_id] = 'VALIDATING'
                blocking.pop(weapon_id, None)
                if weapon_id in retry:
                    retry.remove(weapon_id)
            else:
                status[weapon_id] = 'FAILED'
                blocking[weapon_id] = result.get('error', '未知错误')
                if weapon_id not in retry:
                    retry.append(weapon_id)
    queue['retry_queue'] = retry
    queue['updated_at'] = TODAY
    save_json(QUEUE_PATH, queue)
    return queue


def write_run_log(batch_results: list[dict], total_seconds: float, run_dir: Path) -> Path:
    ok, failed = [], []
    for batch in batch_results:
        for result in batch['results']:
            (ok if result['status'] == 'OK' else failed).append((batch['worker'], result))
    lines = [
        '# SILENT DEPTH 武器资产并行生产运行日志',
        '',
        f'运行时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}　总耗时：{round(total_seconds, 1)} 秒',
        f'工作进程：{len(batch_results)}　成功：{len(ok)}　失败：{len(failed)}',
        f'Job 目录：`{run_dir.relative_to(Path(__file__).resolve().parents[1])}`',
        '',
        '| 工作进程 | 武器 | LOD0 三角面 | 构建耗时(s) |',
        '| --- | --- | --- | --- |',
    ]
    for worker, result in ok:
        stats = result.get('stats', {})
        triangles = (stats.get('lod', {}).get('LOD0') or {}).get('triangles', '')
        lines.append(f"| {worker} | {result['weapon_id']} | {triangles} | {stats.get('build_seconds', '')} |")
    if failed:
        lines.extend(['', '## 失败项', '', '| 工作进程 | 武器 | 错误 |', '| --- | --- | --- |'])
        for worker, result in failed:
            lines.append(f"| {worker} | {result['weapon_id']} | {result.get('error', '')} |")
    lines.extend(['', '失败项已写入 weapon_production_queue.json 的 retry_queue。', ''])
    path = DOC_DIR / 'WEAPON_ASSET_PRODUCTION_RUN.md'
    save_text(path, '\n'.join(lines))
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--weapons', nargs='*')
    parser.add_argument('--priority', nargs='*', choices=['HIGH', 'MEDIUM', 'LOW'])
    parser.add_argument('--retry-only', action='store_true')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--no-preview', action='store_true')
    parser.add_argument('--timeout', type=int, default=7200)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    selected = select(args)
    print(f'SELECTED={len(selected)}')
    if args.dry_run or not selected:
        for weapon_id in selected[:20]:
            variant = VARIANTS_BY_ID[weapon_id]
            print(f"  {weapon_id} T{variant['tier']} {variant['asset_priority']}")
        return 0

    blender = find_blender()
    run_dir = RUN_ROOT / datetime.now().strftime('run_%Y%m%d_%H%M%S')
    run_dir.mkdir(parents=True, exist_ok=True)
    buckets = chunk(selected, max(1, args.workers))
    print(f'WORKERS={len(buckets)} 批次规模={[len(bucket) for bucket in buckets]}', flush=True)

    started = time.time()
    with ThreadPoolExecutor(max_workers=len(buckets)) as pool:
        futures = [
            pool.submit(run_worker, blender, bucket, index, run_dir,
                        not args.no_preview, args.timeout)
            for index, bucket in enumerate(buckets)
        ]
        batch_results = [future.result() for future in futures]

    total = time.time() - started
    for batch in batch_results:
        ok = sum(1 for result in batch['results'] if result['status'] == 'OK')
        print(f"  worker {batch['worker']}: OK={ok}/{len(batch['results'])} {batch['duration_seconds']}s")
    queue = merge_queue(batch_results)
    log_path = write_run_log(batch_results, total, run_dir)
    built = sum(1 for batch in batch_results for result in batch['results'] if result['status'] == 'OK')
    failed = sum(1 for batch in batch_results for result in batch['results'] if result['status'] != 'OK')
    print(f'BUILT={built} FAILED={failed} ELAPSED={round(total, 1)}s')
    print(f'RETRY_QUEUE={queue.get("retry_queue")}')
    print(f'LOG={log_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
