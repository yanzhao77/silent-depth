#!/usr/bin/env python3
"""Phase 1 audit: existing submarine technology tree -> weapon integration slots.

Reads the existing GLOBAL SUBMARINE TECHNOLOGY TREE (submarine_manifest.json +
GLOBAL_SUBMARINE_DATABASE.json), resolves the real on-disk asset files, and
records what each platform exposes for weapon integration: launch interfaces,
payload modules and existing socket/mount objects.

Nothing is created here. This audit is the contract the weapon factory consumes.

Usage:
    python audit_submarine_weapon_integration.py [--blender-socket-scan]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    DOC_DIR,
    SILENT_DEPTH_ASSETS_ROOT,
    SUBMARINE_DATABASE,
    SUBMARINE_MANIFEST,
    TODAY,
    fbx_binary_version,
    load_json,
    save_json,
    sha256_file,
)

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)

# Weapon-relevant visual features worth flagging for the mount/socket pass.
FEATURE_KEYWORDS = {
    'torpedo_tube_door': ('torpedo', 'tube', 'bow tube'),
    'missile_hatch': ('missile hatch', 'missile bay', 'missile deck', 'hatch'),
    'vertical_launch': ('vertical launch', 'vls', 'missile tube'),
    'mast': ('periscope', 'mast', 'antenna'),
    'propulsor': ('propeller', 'propulsor', 'pumpjet', 'pump-jet', 'shrouded'),
    'dive_plane': ('dive plane', 'hydroplane', 'bow plane', 'stern plane'),
    'rudder': ('rudder',),
    'dry_deck_shelter': ('dry deck', 'dds', 'shelter'),
    'escape_hatch': ('escape', 'hatch'),
}


def find_blender() -> Path | None:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    return None


def resolve_on_disk(asset_id: str, manifest_value: str, suffix: str) -> str | None:
    """The manifest carries macOS-era absolute paths; resolve by basename."""
    if not manifest_value:
        return None
    name = Path(manifest_value.replace('\\', '/')).name
    hits = [p for p in SILENT_DEPTH_ASSETS_ROOT.rglob(name) if p.is_file()]
    if not hits:
        return None
    hits.sort(key=lambda p: (asset_id not in str(p), suffix.lower() not in str(p).lower(), len(str(p))))
    return str(hits[0])


def scan_directory(asset_dir: Path) -> dict:
    result: dict[str, list[str]] = {}
    for kind in ('Blend', 'FBX', 'Collision', 'LOD', 'Preview', 'Textures', 'Validation', 'Documentation', 'Source'):
        folder = asset_dir / kind
        result[kind.lower()] = sorted(p.name for p in folder.rglob('*') if p.is_file()) if folder.is_dir() else []
    return result


def feature_flags(entry: dict) -> list[str]:
    haystack = ' '.join(
        str(entry.get(key) or '') for key in
        ('sail_features', 'rudder_features', 'propeller_features', 'sonar_features',
         'missile_hatch_features', 'propulsion_visual_features')
    ).lower()
    haystack += ' ' + ' '.join(str(v) for v in entry.get('visual_identifiers') or [])
    flags = [flag for flag, words in FEATURE_KEYWORDS.items() if any(word in haystack for word in words)]
    if entry.get('type') == 'SSBN':
        flags.extend(['missile_hatch', 'vertical_launch'])
    if entry.get('type') == 'SSN':
        flags.append('torpedo_tube_door')
    return sorted(set(flags))


def blender_socket_scan(blender: Path, blend: Path) -> dict:
    """Read SOCKET_/MOUNT_/UCX_ object names and collection names from a master."""
    script = (
        "import bpy,json;"
        "names=[o.name for o in bpy.data.objects];"
        "cols=[c.name for c in bpy.data.collections];"
        "print('SDW_SCAN='+json.dumps({'objects':names,'collections':cols}))"
    )
    try:
        completed = subprocess.run(
            [str(blender), '--background', str(blend), '--python-expr', script],
            capture_output=True, text=True, timeout=900,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'status': 'FAILED', 'error': f'{type(error).__name__}: {error}'}
    for line in completed.stdout.splitlines():
        if line.startswith('SDW_SCAN='):
            payload = json.loads(line[len('SDW_SCAN='):])
            objects = payload['objects']
            return {
                'status': 'SCANNED',
                'socket_objects': sorted(n for n in objects if n.upper().startswith('SOCKET_')),
                'mount_objects': sorted(n for n in objects if n.upper().startswith('MOUNT_')),
                'ucx_objects': sorted(n for n in objects if n.upper().startswith('UCX_')),
                'collection_count': len(payload['collections']),
            }
    return {'status': 'FAILED', 'error': (completed.stderr or completed.stdout)[-400:]}


def load_launch_interfaces() -> dict:
    """Optional: curated public launch-interface data from the weapon dataset."""
    try:
        from weapon_dataset import SUBMARINE_LAUNCH_INTERFACES
    except ImportError:
        return {}
    return SUBMARINE_LAUNCH_INTERFACES


def build_audit(with_blender_scan: bool) -> dict:
    assets = load_json(SUBMARINE_MANIFEST)['assets']
    database = {e['asset_id']: e for e in load_json(SUBMARINE_DATABASE)['entries']}
    launch = load_launch_interfaces()

    entries = []
    for asset in assets:
        asset_id = asset['asset_id']
        type_dir = SILENT_DEPTH_ASSETS_ROOT / 'Submarines' / asset['type']
        class_token = asset['class'].replace(' ', '_')
        candidates = [p for p in type_dir.rglob(f'{class_token}*') if p.is_dir() and p.name.startswith(class_token)]
        asset_dir = candidates[0] if candidates else type_dir / asset['country'].replace(' ', '_') / class_token

        master = resolve_on_disk(asset_id, asset.get('master', ''), 'blend')
        lod_paths = {}
        for lod in ('lod0', 'lod1', 'lod2', 'lod3'):
            resolved = resolve_on_disk(asset_id, asset.get(lod, ''), 'fbx')
            lod_paths[lod] = {
                'path': resolved,
                'fbx_binary_version': fbx_binary_version(resolved) if resolved else None,
            }
        collision = resolve_on_disk(asset_id, asset.get('collision', ''), 'fbx')
        db_entry = database.get(asset_id, {})
        interface = launch.get(asset_id, {})

        entries.append({
            'asset_id': asset_id,
            'country': asset['country'],
            'type': asset['type'],
            'class': asset['class'],
            'project': asset.get('project'),
            'tier': asset['tier'],
            'variant': asset.get('variant_of'),
            'variants': asset.get('variants', []),
            'manifest_status': asset.get('status'),
            'model_path': str(asset_dir) if asset_dir.is_dir() else None,
            'master_path': master,
            'master_sha256': sha256_file(master) if master else None,
            'lod0': lod_paths['lod0']['path'],
            'lod1': lod_paths['lod1']['path'],
            'lod2': lod_paths['lod2']['path'],
            'lod3': lod_paths['lod3']['path'],
            'lod_fbx_versions': {k: v['fbx_binary_version'] for k, v in lod_paths.items()},
            'collision': collision,
            'collision_sha256': sha256_file(collision) if collision else None,
            'asset_completeness': {
                'has_master': bool(master),
                'has_lod0': bool(lod_paths['lod0']['path']),
                'has_lod1': bool(lod_paths['lod1']['path']),
                'has_lod2': bool(lod_paths['lod2']['path']),
                'has_lod3': bool(lod_paths['lod3']['path']),
                'has_collision': bool(collision),
                'has_validation': bool(list((asset_dir / 'Validation').glob('*.json'))) if (asset_dir / 'Validation').is_dir() else False,
            },
            'on_disk': scan_directory(asset_dir) if asset_dir.is_dir() else {},
            'sockets': [],
            'socket_scan': {'status': 'NOT_RUN'},
            'torpedo_tubes': interface.get('torpedo_tubes'),
            'missile_tubes': interface.get('missile_tubes'),
            'vertical_launch': interface.get('vertical_launch'),
            'payload_modules': interface.get('payload_modules', []),
            'weapon_mount_points': [],
            'weapon_related_visual_features': feature_flags(db_entry),
            'dimensions_m': {
                'length': db_entry.get('approx_length_m'),
                'beam': db_entry.get('approx_beam_m'),
            },
            'integration_status': 'PENDING_WEAPON_SOCKET_PASS',
            'notes': (
                'Submarine model is inherited from the platform technology tree and must not be '
                'redesigned. Only additive presentation-layer weapon sockets are permitted.'
            ),
        })

    if with_blender_scan:
        blender = find_blender()
        for entry in entries:
            if not entry['master_path'] or not blender:
                entry['socket_scan'] = {
                    'status': 'NOT_RUN',
                    'reason': 'no Blender executable' if not blender else 'no local MASTER.blend for this asset',
                }
                continue
            scan = blender_socket_scan(blender, Path(entry['master_path']))
            entry['socket_scan'] = scan
            entry['sockets'] = scan.get('socket_objects', [])
            entry['weapon_mount_points'] = scan.get('mount_objects', [])
            entry['existing_collision_objects'] = scan.get('ucx_objects', [])

    return {
        'audit': 'SubmarineWeaponIntegrationAudit',
        'generated_at': TODAY,
        'scope': 'All SSN/SSBN assets inherited from the GLOBAL SUBMARINE TECHNOLOGY TREE.',
        'source_of_truth': {
            'submarine_manifest': str(SUBMARINE_MANIFEST),
            'submarine_database': str(SUBMARINE_DATABASE),
        },
        'policy': [
            'Existing submarine models are inherited; this audit does not modify them.',
            'Weapon integration uses additive presentation-layer sockets only.',
            'Missing launch interface data stays null/UNKNOWN rather than being guessed.',
        ],
        'totals': {
            'submarines': len(entries),
            'with_master_blend': sum(1 for e in entries if e['asset_completeness']['has_master']),
            'with_full_lod_set': sum(
                1 for e in entries
                if all(e['asset_completeness'][k] for k in ('has_lod0', 'has_lod1', 'has_lod2', 'has_lod3'))
            ),
            'with_collision': sum(1 for e in entries if e['asset_completeness']['has_collision']),
            'with_launch_interface': sum(
                1 for e in entries if e['torpedo_tubes'] or e['missile_tubes'] or e['vertical_launch']
            ),
            'tier_coverage': {f'T{tier}': sum(1 for e in entries if e['tier'] == tier) for tier in range(1, 11)},
        },
        'entries': entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--blender-socket-scan', action='store_true')
    parser.add_argument('--out', default=str(DOC_DIR / 'SubmarineWeaponIntegrationAudit.json'))
    args = parser.parse_args()
    audit = build_audit(args.blender_socket_scan)
    save_json(Path(args.out), audit)
    totals = audit['totals']
    print(f"AUDITED_SUBMARINES={totals['submarines']}")
    print(f"WITH_MASTER_BLEND={totals['with_master_blend']}")
    print(f"WITH_FULL_LOD_SET={totals['with_full_lod_set']}")
    print(f"WITH_COLLISION={totals['with_collision']}")
    print(f"OUT={args.out}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
