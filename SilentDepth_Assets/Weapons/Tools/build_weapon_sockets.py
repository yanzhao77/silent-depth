#!/usr/bin/env python3
"""编排潜艇武器插座生成：为本地存在的潜艇主文件增量生成 SOCKET_* 插座。

只有磁盘上真实存在 MASTER.blend 的潜艇可以被处理；其余平台在报告中标记为
WAITING_FOR_MODEL（潜艇模型尚未生产），不伪造插座位置。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import DOC_DIR, SILENT_DEPTH_ASSETS_ROOT, TODAY, load_json, save_json, save_text  # noqa: E402
from data_submarine_fits import SUBMARINE_LAUNCH_INTERFACES  # noqa: E402

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)
AUDIT_PATH = DOC_DIR / 'SubmarineWeaponIntegrationAudit.json'
JOB_DIR = Path(__file__).resolve().parent / '_jobs'


def find_blender() -> Path:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise RuntimeError('未找到 Blender 可执行文件。')


def build_jobs() -> tuple[list[dict], list[dict]]:
    audit = load_json(AUDIT_PATH)
    jobs, pending = [], []
    for entry in audit['entries']:
        asset_id = entry['asset_id']
        interface = SUBMARINE_LAUNCH_INTERFACES.get(asset_id, {})
        sockets = []
        for socket in interface.get('weapon_sockets', []):
            sockets.append({
                'name': socket['socket'],
                'kind': socket['kind'],
                'location': socket.get('location'),
                'confidence': socket.get('confidence'),
            })
        if not entry.get('master_path') or not sockets:
            pending.append({
                'asset_id': asset_id,
                'reason': '本地没有 MASTER.blend' if not entry.get('master_path') else '没有发射接口数据',
                'sockets_declared': len(sockets),
            })
            continue
        model_dir = Path(entry['model_path']) if entry.get('model_path') else Path(entry['master_path']).parent.parent
        jobs.append({
            'asset_id': asset_id,
            'master_blend': entry['master_path'],
            'output_dir': str(model_dir / 'Sockets'),
            'dimensions': {
                'length': (entry.get('dimensions_m') or {}).get('length'),
                'beam': (entry.get('dimensions_m') or {}).get('beam'),
            },
            'sockets': sockets,
        })
    return jobs, pending


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--rebuild', action='store_true',
                        help='把既有插座产出归档后重新生成（不删除，移动到 _archive）。')
    args = parser.parse_args()

    jobs, pending = build_jobs()
    print(f'JOBS={len(jobs)} PENDING={len(pending)}')
    if args.rebuild:
        import shutil
        stamp = TODAY.replace('-', '') + '_' + str(int(subprocess.run(
            [sys.executable, '-c', 'import time;print(int(time.time()))'],
            capture_output=True, text=True).stdout.strip() or 0))
        for job in jobs:
            output_dir = Path(job['output_dir'])
            for path in output_dir.glob(f"{job['asset_id']}_SOCKETS.*") if output_dir.is_dir() else []:
                archive = output_dir / '_archive' / stamp
                archive.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(archive / path.name))
    report = {
        'report': 'SubmarineWeaponSocketPass',
        'generated_at': TODAY,
        'source_audit': str(AUDIT_PATH),
        'policy': [
            '插座为增量表现层接口，原始潜艇主文件不被修改。',
            '只有本地存在 MASTER.blend 的平台才能生成插座；其余标记 WAITING_FOR_MODEL。',
            '插座位置由公开尺寸与发射器布局推导，不推测内部结构。',
        ],
        'summary': {'processed': 0, 'pending': len(pending), 'sockets_created': 0},
        'results': [],
        'pending': pending,
    }
    if args.dry_run or not jobs:
        save_json(DOC_DIR / 'WeaponSocketReport.json', report)
        for job in jobs:
            print(f"  {job['asset_id']} sockets={len(job['sockets'])} -> {job['output_dir']}")
        return 0

    JOB_DIR.mkdir(parents=True, exist_ok=True)
    job_path = JOB_DIR / 'socket_jobs.json'
    save_json(job_path, {'jobs': jobs})
    blender = find_blender()
    completed = subprocess.run(
        [str(blender), '--background', '--factory-startup', '--python',
         str(Path(__file__).resolve().parent / 'weapon_socket_pass_blender.py'),
         '--', '--jobs', str(job_path)],
        capture_output=True, text=True, timeout=3600,
    )
    save_text(JOB_DIR / 'socket_pass.log', (completed.stdout or '') + '\n--- STDERR ---\n' + (completed.stderr or ''))
    results = []
    for line in (completed.stdout or '').splitlines():
        if line.startswith('SOCKET_PASS_RESULT='):
            payload = line[len('SOCKET_PASS_RESULT='):]
            # Blender 可能在结果行后追加警告，用 raw_decode 只取第一个完整 JSON。
            results = json.JSONDecoder().raw_decode(payload)[0]
    if not results:
        report['error'] = f'插座生成进程未返回结果（returncode={completed.returncode}）'
        save_json(DOC_DIR / 'WeaponSocketReport.json', report)
        print(report['error'])
        return 1

    report['results'] = results
    report['summary']['processed'] = sum(1 for r in results if r.get('status') == 'OK')
    report['summary']['sockets_created'] = sum(r.get('socket_count', 0) for r in results)
    save_json(DOC_DIR / 'WeaponSocketReport.json', report)
    for result in results:
        if result.get('status') == 'OK':
            print(f"  OK {result['asset_id']} sockets={result['socket_count']}")
        else:
            print(f"  FAILED {result.get('asset_id')}: {result.get('error')}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
