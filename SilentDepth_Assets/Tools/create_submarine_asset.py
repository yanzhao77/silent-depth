#!/usr/bin/env python3
import argparse, json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_DIRS = ['Source','Blend','FBX','LOD','Collision','Textures/BaseColor','Textures/Normal','Textures/Roughness','Textures/Metallic','Textures/AO','Preview','Documentation','Validation']

def asset_path(country, submarine_type, class_name):
    safe_class = class_name.replace(' ', '_').replace('/', '_').replace('-', '')
    return ROOT / 'Submarines' / submarine_type / country / safe_class

def create_submarine_asset(country, submarine_type, class_name, asset_id, tier):
    dst = asset_path(country, submarine_type, class_name)
    for rel in REQUIRED_DIRS:
        (dst / rel).mkdir(parents=True, exist_ok=True)
    manifest = {
        'asset_id': asset_id,
        'country': country,
        'type': submarine_type,
        'class': class_name,
        'tier': tier,
        'status': 'PLANNED',
        'template_version': 'v1.0.0',
        'paths': {rel: str(dst / rel) for rel in REQUIRED_DIRS},
    }
    spec = dst / 'Documentation' / f'{asset_id}_SPEC.json'
    if not spec.exists():
        spec.write_text(json.dumps(manifest, indent=2) + '\n')
    readme = dst / 'Documentation' / f'{asset_id}_README.md'
    if not readme.exists():
        readme.write_text(f'# {asset_id}\n\nStatus: PLANNED\n\nCreated from SilentDepth submarine asset template v1.0.0.\n')
    return manifest

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--country', required=True)
    p.add_argument('--type', required=True, choices=['SSN','SSBN'])
    p.add_argument('--class-name', required=True)
    p.add_argument('--asset-id', required=True)
    p.add_argument('--tier', required=True, type=int)
    args = p.parse_args()
    print(json.dumps(create_submarine_asset(args.country, args.type, args.class_name, args.asset_id, args.tier), indent=2))
