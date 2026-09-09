#!/usr/bin/env python3
import argparse, json
from pathlib import Path

REQUIRED_DIRS = ['Source','Blend','FBX','LOD','Collision','Textures','Preview','Documentation','Validation']
REQUIRED_COMPLETE = ['Blend/{id}_MASTER.blend','FBX/{id}_LOD0.fbx','FBX/{id}_LOD1.fbx','FBX/{id}_LOD2.fbx','FBX/{id}_LOD3.fbx','Collision/{id}_COLLISION.fbx','Documentation/{id}_SPEC.json','Documentation/{id}_README.md','Validation/{id}_VALIDATION.json']
FORBIDDEN_NAMES = ('Cube','Object','Cylinder','Plane')

def detect_fbx_version(path):
    data = Path(path).read_bytes()[:64]
    if b'Kaydara FBX Binary' not in data:
        return None
    raw = Path(path).read_bytes()[23:27]
    return int.from_bytes(raw, 'little')

def validate(asset_dir, asset_id):
    root = Path(asset_dir)
    issues = []
    for d in REQUIRED_DIRS:
        if not (root / d).exists():
            issues.append(f'missing directory: {d}')
    for pattern in REQUIRED_COMPLETE:
        path = root / pattern.format(id=asset_id)
        if not path.exists():
            issues.append(f'missing complete file: {path.relative_to(root)}')
    for fbx in (root / 'FBX').glob('*.fbx') if (root / 'FBX').exists() else []:
        version = detect_fbx_version(fbx)
        if version != 7400:
            issues.append(f'{fbx.name}: expected FBX binary version 7400, got {version}')
    return {'asset_id': asset_id, 'asset_dir': str(root), 'result': 'PASS' if not issues else 'FAIL', 'issues': issues}

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('asset_dir')
    p.add_argument('asset_id')
    args = p.parse_args()
    result = validate(args.asset_dir, args.asset_id)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['result'] == 'PASS' else 1)
