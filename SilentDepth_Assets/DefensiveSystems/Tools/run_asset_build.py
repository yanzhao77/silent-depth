#!/usr/bin/env python3
"""Batch runner: builds every declared defensive asset through Blender.

Standard library only. Writes Manifest/defensive_asset_build_report.json with
the real outcome of each asset (status, stage results, timing, errors).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    DEFENSIVE_ROOT,
    MANIFEST_DIR,
    TODAY,
    defensive_asset_dir,
    save_json,
)

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)
TOOLS_DIR = Path(__file__).resolve().parent


def find_blender() -> Path:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise SystemExit('Blender 5.2 not found in the known locations')


def build_one(blender: Path, asset: dict, preview_size: int, timeout: int) -> dict:
    command = [
        str(blender), '--background', '--factory-startup',
        '--python', str(TOOLS_DIR / 'sds_build_asset.py'), '--',
        '--asset-id', asset['asset_id'], '--mode', 'all',
        '--preview-size', str(preview_size),
    ]
    started = time.time()
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {'asset_id': asset['asset_id'], 'status': 'TIMEOUT',
                'seconds': round(time.time() - started, 2)}
    elapsed = round(time.time() - started, 2)
    payload = None
    for line in completed.stdout.splitlines():
        if line.startswith('SDS_BUILD_RESULT='):
            payload = json.loads(line[len('SDS_BUILD_RESULT='):])
    if payload is None:
        tail = (completed.stderr or completed.stdout or '')[-1200:]
        return {'asset_id': asset['asset_id'], 'status': 'FAILED', 'seconds': elapsed,
                'returncode': completed.returncode, 'error': tail}
    payload['seconds'] = elapsed
    payload['status'] = 'OK'
    return payload


def verify_outputs(asset: dict) -> dict:
    root = defensive_asset_dir(asset)
    asset_id = asset['asset_id']
    checks = {
        'blend': (root / 'Blend' / f'{asset_id}_MASTER.blend').is_file(),
        'lods': all((root / 'FBX' / f'{asset_id}_LOD{index}.fbx').is_file() for index in range(4)),
        'collision': (root / 'Collision' / f'{asset_id}_COLLISION.fbx').is_file(),
        'spec': (root / 'Documentation' / f'{asset_id}_SPEC.json').is_file(),
        'readme': (root / 'Documentation' / f'{asset_id}_README.md').is_file(),
        'previews': len(list((root / 'Preview').glob('*.png'))),
    }
    checks['complete'] = bool(checks['blend'] and checks['lods'] and checks['collision']
                              and checks['spec'] and checks['previews'] >= 4)
    return checks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', action='append', default=None,
                        help='asset id to build (repeatable); default is every declared asset')
    parser.add_argument('--preview-size', type=int, default=512)
    parser.add_argument('--timeout', type=int, default=1800)
    parser.add_argument('--jobs', type=int, default=1,
                        help='how many Blender processes to run at the same time')
    parser.add_argument('--report', default=str(MANIFEST_DIR / 'defensive_asset_build_report.json'))
    parser.add_argument('--verify-only', action='store_true',
                        help='do not build; re-check the outputs already on disk')
    args = parser.parse_args()

    blender = find_blender()
    only = set(args.only) if args.only else None
    selected = [asset for asset in dataset.ASSETS if not only or asset['asset_id'] in only]
    results = []
    blocking = {}

    def run(asset: dict) -> dict:
        result = build_one(blender, asset, args.preview_size, args.timeout)
        result['outputs'] = verify_outputs(asset)
        return result

    previous = {}
    report_path = Path(args.report)
    if report_path.is_file():
        try:
            for row in json.loads(report_path.read_text(encoding='utf-8')).get('assets', []):
                previous[row.get('asset_id')] = row
        except (json.JSONDecodeError, AttributeError):
            previous = {}

    if args.verify_only:
        outcomes = [{'asset_id': asset['asset_id'], 'status': 'VERIFIED_ON_DISK',
                     'seconds': previous.get(asset['asset_id'], {}).get('seconds')}
                    for asset in selected]
    elif args.jobs > 1:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            outcomes = list(pool.map(run, selected))
    else:
        outcomes = [run(asset) for asset in selected]

    for asset, result in zip(selected, outcomes):
        if 'outputs' not in result:
            result['outputs'] = verify_outputs(asset)
        prior = previous.get(asset['asset_id'])
        if prior and result.get('status') in ('OK', 'VERIFIED_ON_DISK'):
            result['stages'] = prior.get('stages') or result.get('stages')
            result['seconds'] = result.get('seconds') or prior.get('seconds')
        if result.get('status') == 'VERIFIED_ON_DISK':
            result['build_status'] = prior.get('status') if prior else 'UNRECORDED'
            result['status'] = 'OK' if result['outputs']['complete'] else 'FAILED'
        if result['status'] != 'OK' or not result['outputs']['complete']:
            blocking[asset['asset_id']] = result.get('error') or 'incomplete output set'
        results.append(result)
        print(f"{asset['asset_id']}: {result['status']} "
              f"complete={result['outputs']['complete']} seconds={result['seconds']}")

    report = {
        'schema': 'silent-depth-defensive-asset-build-report-v1',
        'generated_at': TODAY,
        'blender': str(blender),
        'preview_size': args.preview_size,
        'asset_root': str(DEFENSIVE_ROOT),
        'assets': results,
        'blocking_conditions': blocking,
        'totals': {
            'assets': len(results),
            'ok': sum(1 for r in results if r['status'] == 'OK'),
            'complete_outputs': sum(1 for r in results if r['outputs']['complete']),
            'failed': sum(1 for r in results if r['status'] != 'OK'),
        },
    }
    save_json(Path(args.report), report)
    print(json.dumps(report['totals'], ensure_ascii=False))
    return 0 if report['totals']['failed'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
