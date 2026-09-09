#!/usr/bin/env python3
"""Non-destructive Silent Depth submarine asset production queue runner.

This runner advances only machine-verifiable planning steps. It does not create
fake geometry or mark an asset COMPLETE unless validator requirements pass.
"""
import argparse
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS_FILE = ROOT / 'Manifest' / 'production_status.json'
DB_FILE = ROOT / 'Documentation' / 'GLOBAL_SUBMARINE_DATABASE.json'

COUNTRY_DIR = {
    'USA': 'USA',
    'Russia': 'Russia',
    'UK': 'UK',
    'France': 'France',
    'China': 'China',
    'India': 'India',
}
REQUIRED_DIRS = [
    'Source','Blend','FBX','LOD','Collision','Textures/BaseColor','Textures/Normal',
    'Textures/Roughness','Textures/Metallic','Textures/AO','Preview','Documentation','Validation'
]

def load_json(path):
    return json.loads(path.read_text())

def save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def class_dir(entry):
    safe_class = entry['class'].replace(' ', '_').replace('/', '_').replace('-', '')
    return ROOT / 'Submarines' / entry['type'] / COUNTRY_DIR[entry['country']] / safe_class

def ensure_slot(entry):
    root = class_dir(entry)
    for rel in REQUIRED_DIRS:
        (root / rel).mkdir(parents=True, exist_ok=True)
    spec = root / 'Documentation' / f"{entry['asset_id']}_SPEC.json"
    if not spec.exists():
        spec.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + '\n')
    return root

def choose_next(status):
    for asset_id in status.get('queue_order', []):
        current = status.get('status_by_asset', {}).get(asset_id)
        if current in {'PLANNED', 'RESEARCH'}:
            return asset_id
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--max-assets', type=int, default=1)
    args = parser.parse_args()
    status = load_json(STATUS_FILE)
    db = load_json(DB_FILE)
    entries = {e['asset_id']: e for e in db['entries']}
    advanced = []
    for _ in range(args.max_assets):
        asset_id = choose_next(status)
        if not asset_id:
            break
        entry = entries[asset_id]
        root = ensure_slot(entry)
        reason = 'Reference board and class-specific modeling pass required before geometry generation.'
        if not args.dry_run:
            status['status_by_asset'][asset_id] = 'RESEARCH'
            status.setdefault('blocking_conditions', {})[asset_id] = reason
        advanced.append({'asset_id': asset_id, 'status': 'RESEARCH', 'path': str(root), 'note': reason})
    if not args.dry_run:
        status['updated_at'] = date.today().isoformat()
        save_json(STATUS_FILE, status)
    print(json.dumps({'advanced': advanced, 'dry_run': args.dry_run}, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
