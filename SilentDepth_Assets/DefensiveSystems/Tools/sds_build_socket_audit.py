#!/usr/bin/env python3
"""Audits which mount points the inherited submarine assets expose today.

This audit never modifies a submarine. It only reads the master .blend files
(when Blender is available) and records which SOCKET_/MOUNT_/UCX_ objects and
collections already exist, so the defensive factory knows what it may attach to
without touching an inherited model.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    DEFENSIVE_ROOT,
    DOC_DIR,
    SOCKETS,
    SUBMARINE_MANIFEST,
    TODAY,
    load_json,
    save_json,
)

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)

SCAN_EXPR = (
    "import bpy,json;"
    "print('SDS_SCAN='+json.dumps({"
    "'objects':[o.name for o in bpy.data.objects],"
    "'collections':[c.name for c in bpy.data.collections]}))"
)


def find_blender() -> Path | None:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    return None


def resolve_master(asset_id: str, manifest_value: str | None) -> Path | None:
    if not manifest_value:
        return None
    root = SUBMARINE_MANIFEST.parents[1]
    name = Path(manifest_value.replace('\\', '/')).name
    hits = [path for path in root.rglob(name) if path.is_file()]
    if not hits:
        return None
    hits.sort(key=lambda path: (asset_id not in str(path), len(str(path))))
    return hits[0]


def scan_master(blender: Path, blend: Path, timeout: int = 900) -> dict:
    try:
        completed = subprocess.run(
            [str(blender), '--background', str(blend), '--python-expr', SCAN_EXPR],
            capture_output=True, text=True, timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'status': 'FAILED', 'error': f'{type(error).__name__}: {error}'}
    for line in completed.stdout.splitlines():
        if line.startswith('SDS_SCAN='):
            payload = json.loads(line[len('SDS_SCAN='):])
            objects = payload['objects']
            return {
                'status': 'SCANNED',
                'socket_objects': sorted(name for name in objects if name.upper().startswith('SOCKET_')),
                'mount_objects': sorted(name for name in objects if name.upper().startswith('MOUNT_')),
                'ucx_objects': sorted(name for name in objects if name.upper().startswith('UCX_')),
                'object_count': len(objects),
                'collection_count': len(payload['collections']),
            }
    return {'status': 'FAILED', 'error': (completed.stderr or completed.stdout)[-400:]}


def build_audit(use_blender: bool) -> dict:
    assets = load_json(SUBMARINE_MANIFEST)['assets']
    blender = find_blender() if use_blender else None

    entries = []
    for asset in assets:
        master = resolve_master(asset['asset_id'], asset.get('master'))
        scan = {'status': 'NOT_APPLICABLE'}
        if master is None:
            scan = {'status': 'NO_LOCAL_MASTER'}
        elif blender is None:
            scan = {'status': 'BLENDER_UNAVAILABLE'}
        else:
            scan = scan_master(blender, master)
        entries.append({
            'submarine': asset['asset_id'],
            'country': asset['country'],
            'type': asset['type'],
            'class': asset['class'],
            'tier': asset['tier'],
            'master_blend': str(master) if master else None,
            'inherited_model': True,
            'scan': scan,
            'defensive_sockets_present': scan.get('socket_objects', []) if scan.get('status') == 'SCANNED' else None,
            'available_mount_points': scan.get('mount_objects', []) if scan.get('status') == 'SCANNED' else None,
            'required_for_loadout': sorted({slot['socket'] for slot in dataset.LOADOUT_SLOTS if slot['socket']}),
            'note_zh': (
                '继承资产不做几何修改；防御系统以附加展示层资产与统一 socket 词表接入。'
                '本艇当前是否存在 socket 以 scan 结果为准。'
            ),
        })

    scanned = [e for e in entries if e['scan']['status'] == 'SCANNED']
    return {
        'schema': 'silent-depth-defensive-socket-audit-v1',
        'generated_at': TODAY,
        'sockets_vocabulary': SOCKETS,
        'policy_zh': [
            '审计只读：不创建、不移动、不修改任何潜艇对象。',
            '缺少 socket 的艇在接入防御系统前需要一次专门的挂点作业（本任务不做）。',
            'socket 词表由 sds_common.SOCKETS 唯一定义。',
        ],
        'totals': {
            'submarines': len(entries),
            'masters_scanned': len(scanned),
            'with_defensive_socket': sum(1 for e in scanned if e['defensive_sockets_present']),
            'without_defensive_socket': sum(1 for e in scanned if not e['defensive_sockets_present']),
            'no_local_master': sum(1 for e in entries if e['scan']['status'] == 'NO_LOCAL_MASTER'),
        },
        'entries': entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--blender-scan', action='store_true',
                        help='scan local master .blend files for existing socket objects')
    parser.add_argument('--out', default=str(DOC_DIR / 'defensive_socket_audit.json'))
    args = parser.parse_args()

    audit = build_audit(args.blender_scan)
    save_json(Path(args.out), audit)
    print(f"SUBMARINES={audit['totals']['submarines']}")
    print(f"MASTERS_SCANNED={audit['totals']['masters_scanned']}")
    print(f"WITH_DEFENSIVE_SOCKET={audit['totals']['with_defensive_socket']}")
    print(f"NO_LOCAL_MASTER={audit['totals']['no_local_master']}")
    print(f"OUT={args.out}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
