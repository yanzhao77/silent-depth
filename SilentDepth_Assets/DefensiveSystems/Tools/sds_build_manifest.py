#!/usr/bin/env python3
"""Builds Manifest/defensive_system_manifest.json from the real files on disk.

The manifest is disk truth, never intent: a missing file is reported as
present=false, and a hash is only written when the file really exists.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    ASSET_PRIORITIES,
    CATEGORY_DIR,
    DEFENSIVE_ROOT,
    FBX_BINARY_VERSION,
    MANIFEST_DIR,
    SHARED_MATERIALS,
    SOCKETS,
    TODAY,
    defensive_asset_dir,
    fbx_binary_version,
    save_json,
    sha256_file,
)

ASSET_DIRS = ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures', 'Preview',
              'Documentation', 'Validation')


def scan_asset_files(asset_dir: Path) -> dict[str, dict]:
    files: dict[str, dict] = {}
    if not asset_dir.is_dir():
        return files
    for path in sorted(asset_dir.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(asset_dir).as_posix()
        if '__pycache__' in rel or rel.endswith('.pyc'):
            continue
        files[rel] = {'bytes': path.stat().st_size, 'sha256': sha256_file(path)}
    return files


def load_spec(asset_dir: Path, asset_id: str) -> dict | None:
    spec = asset_dir / 'Documentation' / f'{asset_id}_SPEC.json'
    if not spec.is_file():
        return None
    try:
        return json.loads(spec.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return None


def build_asset_manifest() -> dict:
    production_path = MANIFEST_DIR / 'defensive_production_status.json'
    production = json.loads(production_path.read_text(encoding='utf-8')) if production_path.is_file() else {}

    assets = []
    for asset in dataset.ASSETS:
        asset_dir = defensive_asset_dir(asset)
        files = scan_asset_files(asset_dir)
        spec = load_spec(asset_dir, asset['asset_id'])
        lod_fbx = {}
        for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
            rel = f"FBX/{asset['asset_id']}_{lod}.fbx"
            path = asset_dir / rel
            lod_fbx[lod] = {
                'path': rel,
                'present': path.is_file(),
                'fbx_binary_version': fbx_binary_version(path) if path.is_file() else None,
                'sha256': files.get(rel, {}).get('sha256'),
            }
        collision_rel = f"Collision/{asset['asset_id']}_COLLISION.fbx"
        master_rel = f"Blend/{asset['asset_id']}_MASTER.blend"
        exports = (spec or {}).get('exports') or []
        missing_dirs = [d for d in ASSET_DIRS if not (asset_dir / d).is_dir()]
        assets.append({
            'asset_id': asset['asset_id'],
            'category': asset['category'],
            'category_dir': CATEGORY_DIR[asset['category']],
            'branch': asset['branch'],
            'family_id': asset['family_id'],
            'country': asset['country'],
            'priority': asset['priority'],
            'label': asset['label'],
            'label_zh': asset['label_zh'],
            'geometry': asset['geometry'],
            'dimensions_m': asset['dimensions_m'],
            'sockets': asset['sockets'],
            'materials': asset['materials'],
            'interior': bool(asset.get('interior')),
            'asset_dir': asset_dir.relative_to(DEFENSIVE_ROOT).as_posix(),
            'missing_dirs': missing_dirs,
            'master': {'path': master_rel, 'present': (asset_dir / master_rel).is_file(),
                       'sha256': files.get(master_rel, {}).get('sha256')},
            'lod_fbx': lod_fbx,
            'collision': {'path': collision_rel, 'present': (asset_dir / collision_rel).is_file(),
                          'sha256': files.get(collision_rel, {}).get('sha256')},
            'spec_present': spec is not None,
            'preview_count': sum(1 for rel in files if rel.startswith('Preview/') and rel.endswith('.png')),
            'export_stats': [
                {'name': e.get('name'), 'triangles': e.get('triangles'), 'vertices': e.get('vertices')}
                for e in exports
            ],
            'triangles_lod0': next((e.get('triangles') for e in exports
                                    if str(e.get('name', '')).endswith('LOD0')), None),
            'files': files,
            'status': production.get('status_by_asset', {}).get(asset['asset_id'], 'PLANNED'),
            'priority_valid': asset['priority'] in ASSET_PRIORITIES,
        })

    unregistered_dirs = []
    for category_dir in sorted({value for value in CATEGORY_DIR.values()}):
        root = DEFENSIVE_ROOT / category_dir
        if not root.is_dir():
            continue
        for child in sorted(root.iterdir()):
            if child.is_dir() and child.name not in dataset.ASSET_BY_ID:
                unregistered_dirs.append(f'{category_dir}/{child.name}')

    pipeline_complete = [
        a['asset_id'] for a in assets
        if a['master']['present'] and all(v['present'] for v in a['lod_fbx'].values())
        and a['collision']['present'] and a['spec_present'] and not a['missing_dirs']
    ]

    return {
        'schema': 'silent-depth-defensive-asset-manifest-v1',
        'generated_at': TODAY,
        'ue_target': {'engine': 'Unreal Engine', 'version': '4.27',
                      'fbx_binary_version': FBX_BINARY_VERSION, 'fbx_label': 'FBX 2018 compatible'},
        'shared_materials': list(SHARED_MATERIALS),
        'sockets': SOCKETS,
        'policy_zh': [
            'manifest 记录磁盘真实状态；缺失文件如实为 present=false，不写占位。',
            '每个资产由 sds_dataset.ASSETS 定义，未登记的目录视为越权创建并在此列出。',
        ],
        'assets': assets,
        'unregistered_asset_dirs': unregistered_dirs,
        'totals': {
            'assets': len(assets),
            'high_priority': sum(1 for a in assets if a['priority'] == 'HIGH'),
            'with_master_blend': sum(1 for a in assets if a['master']['present']),
            'with_full_lod_set': sum(1 for a in assets if all(v['present'] for v in a['lod_fbx'].values())),
            'with_collision': sum(1 for a in assets if a['collision']['present']),
            'with_spec': sum(1 for a in assets if a['spec_present']),
            'with_previews': sum(1 for a in assets if a['preview_count'] >= 4),
            'pipeline_complete': len(pipeline_complete),
            'unregistered_asset_dirs': len(unregistered_dirs),
        },
        'pipeline_complete_assets': pipeline_complete,
    }


def main() -> int:
    manifest = build_asset_manifest()
    save_json(MANIFEST_DIR / 'defensive_system_manifest.json', manifest)
    print(f"ASSETS={manifest['totals']['assets']}")
    print(f"WITH_MASTER={manifest['totals']['with_master_blend']}")
    print(f"WITH_FULL_LOD={manifest['totals']['with_full_lod_set']}")
    print(f"PIPELINE_COMPLETE={manifest['totals']['pipeline_complete']}")
    print(f"UNREGISTERED_DIRS={manifest['totals']['unregistered_asset_dirs']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
