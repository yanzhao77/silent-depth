#!/usr/bin/env python3
"""为每个传感器资产生成 Manifest 与哈希清单（§21 的 Manifest 交付项）。

用法：
    python Tools/build_sensor_asset_manifest.py --all

产物：`<分支>/<SENSOR_ID>/Documentation/<SENSOR_ID>_MANIFEST.json`

内容来自真实文件系统：路径、字节数、SHA-256、FBX 二进制版本与生成的 UTC 时间。
本工具不推断任何几何或性能信息，只登记已经存在的产物。
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone

from sensor_common import (
    BRANCH_DIR,
    SENSORS_ROOT,
    fbx_binary_version,
    save_json,
    sha256_file,
)
from sensor_dataset import dataset
from sensor_dataset_assets import CORE_ASSETS

INVENTORY = (
    ('Blend/{id}_MASTER.blend', 'blend'),
    ('FBX/{id}_LOD0.fbx', 'fbx'),
    ('FBX/{id}_LOD1.fbx', 'fbx'),
    ('FBX/{id}_LOD2.fbx', 'fbx'),
    ('FBX/{id}_LOD3.fbx', 'fbx'),
    ('Collision/{id}_COLLISION.fbx', 'fbx'),
    ('Preview/{id}_Front.png', 'png'),
    ('Preview/{id}_Side.png', 'png'),
    ('Preview/{id}_Top.png', 'png'),
    ('Preview/{id}_Perspective.png', 'png'),
)


def build(asset: dict, variant: dict) -> dict:
    root = SENSORS_ROOT / BRANCH_DIR[asset['branch']] / asset['sensor_id']
    files = []
    for pattern, kind in INVENTORY:
        relative = pattern.format(id=asset['sensor_id'])
        path = root / relative
        record = {
            'path': relative,
            'kind': kind,
            'present': path.is_file(),
        }
        if path.is_file():
            record['bytes'] = path.stat().st_size
            record['sha256'] = sha256_file(path)
            if kind == 'fbx':
                record['fbx_binary_version'] = fbx_binary_version(path)
        files.append(record)
    return {
        'asset_id': asset['sensor_id'],
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'branch': asset['branch'],
        'tier': f'T{variant["branch_tier"]}',
        'country': variant['country'],
        'family': variant['family'],
        'socket': asset['socket'],
        'geometry_source': asset['geometry_source'],
        'dimensions_m': asset['dimensions_m'],
        'template_version': 'v1.0.0',
        'files': files,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sensor-id', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()

    variants = {variant['sensor_id']: variant for variant in dataset()['variants']}
    if args.sensor_id:
        wanted = set(args.sensor_id)
        assets = [asset for asset in CORE_ASSETS if asset['sensor_id'] in wanted]
        missing = wanted - {asset['sensor_id'] for asset in assets}
        if missing:
            raise SystemExit(f'未知资产 id：{sorted(missing)}')
    elif args.all:
        assets = list(CORE_ASSETS)
    else:
        raise SystemExit('请指定 --all 或 --sensor-id')

    for asset in assets:
        variant = variants[asset['sensor_id']]
        manifest = build(asset, variant)
        save_json(
            SENSORS_ROOT / BRANCH_DIR[asset['branch']] / asset['sensor_id'] / 'Documentation'
            / f'{asset["sensor_id"]}_MANIFEST.json',
            manifest,
        )
        present = sum(1 for record in manifest['files'] if record['present'])
        print(f'[manifest] {asset["sensor_id"]} files={present}/{len(manifest["files"])}')
    print(f'SENSOR_ASSET_MANIFESTS={len(assets)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
