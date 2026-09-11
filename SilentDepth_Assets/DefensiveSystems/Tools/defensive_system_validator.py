#!/usr/bin/env python3
"""Asset validator for the SILENT DEPTH defensive system library.

Standard library only. Every rule either passes on real evidence or reports
``NOT_VERIFIED`` — nothing is assumed to be fine.

    python defensive_system_validator.py --all
    python defensive_system_validator.py --asset US_EW_ESM_GENERIC

Writes:
    Validation/defensive_system_validation.json          (summary of the run)
    <Category>/<AssetId>/Validation/<AssetId>_VALIDATION.json
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
    CATEGORY_DIR,
    FBX_BINARY_VERSION,
    MANIFEST_DIR,
    SOCKETS,
    TODAY,
    VALIDATION_DIR,
    defensive_asset_dir,
    fbx_binary_version,
    load_json,
    save_json,
    sha256_file,
)

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)
REQUIRED_DIRS = ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures', 'Preview',
                 'Documentation', 'Validation')
ORIGIN_RULES = {
    'base_center': ('esm_mast', 'esm_mast_integrated', 'esm_mast_blade', 'esm_mast_rugged',
                    'esm_mast_slim', 'control_console'),
    'centered': ('decoy_canister', 'decoy_mobile', 'noise_maker', 'launcher_tube',
                 'antenna_array', 'launcher_external', 'torpedo_warning_sensor'),
}
PRIMARY_AXIS = {
    'base_center': 2,      # height
    'centered': 0,         # length
}


def find_blender() -> Path | None:
    for candidate in BLENDER_CANDIDATES:
        if candidate.is_file():
            return candidate
    return None


def inspect_fbx(blender: Path, fbx: Path, label: str, timeout: int = 900) -> dict:
    command = [str(blender), '--background', '--factory-startup',
               '--python', str(Path(__file__).resolve().parent / 'sds_inspect_fbx.py'),
               '--', '--fbx', str(fbx), '--label', label]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'status': 'NOT_VERIFIED', 'reason': f'{type(error).__name__}: {error}'}
    for line in completed.stdout.splitlines():
        if line.startswith('SDS_INSPECT='):
            return {'status': 'VERIFIED', **json.loads(line[len('SDS_INSPECT='):])}
    return {'status': 'NOT_VERIFIED',
            'reason': (completed.stderr or completed.stdout or '')[-300:]}


def load_shared_materials() -> dict:
    path = Path(__file__).resolve().parents[1] / 'Materials' / 'shared_materials.json'
    if not path.is_file():
        return {}
    try:
        data = load_json(path)
    except Exception:
        return {}
    return data.get('materials', data) if isinstance(data, dict) else {}


def validate_asset(asset: dict, manifest: dict, blender: Path | None,
                   shared_materials: dict) -> dict:
    asset_id = asset['asset_id']
    root = defensive_asset_dir(asset)
    checks: list[dict] = []

    def check(rule: str, status: str, detail: str) -> None:
        checks.append({'rule': rule, 'status': status, 'detail': detail})

    # --- directories and files -------------------------------------------
    missing_dirs = [name for name in REQUIRED_DIRS if not (root / name).is_dir()]
    check('directories', 'FAIL' if missing_dirs else 'PASS',
          f"missing: {', '.join(missing_dirs)}" if missing_dirs else 'all present')

    expected_files = {
        'master_blend': root / 'Blend' / f'{asset_id}_MASTER.blend',
        'lod0': root / 'FBX' / f'{asset_id}_LOD0.fbx',
        'lod1': root / 'FBX' / f'{asset_id}_LOD1.fbx',
        'lod2': root / 'FBX' / f'{asset_id}_LOD2.fbx',
        'lod3': root / 'FBX' / f'{asset_id}_LOD3.fbx',
        'collision_fbx': root / 'Collision' / f'{asset_id}_COLLISION.fbx',
    }
    missing_files = [name for name, path in expected_files.items() if not path.is_file()]
    check('pipeline_files', 'FAIL' if missing_files else 'PASS',
          f"missing: {', '.join(missing_files)}" if missing_files else 'all present')

    spec_path = root / 'Documentation' / f'{asset_id}_SPEC.json'
    readme_path = root / 'Documentation' / f'{asset_id}_README.md'
    spec = load_json(spec_path) if spec_path.is_file() else None
    check('documentation', 'FAIL' if not spec_path.is_file() or not readme_path.is_file()
          else 'PASS', f'spec={spec_path.is_file()} readme={readme_path.is_file()}')

    prereviews = sorted((root / 'Preview').glob('*.png')) if (root / 'Preview').is_dir() else []
    check('preview', 'PASS' if len(prereviews) >= 4 else 'FAIL', f'{len(prereviews)} png')

    # --- FBX binary version ----------------------------------------------
    versions = {}
    for name, path in expected_files.items():
        if name.endswith('.fbx') or name.startswith('lod') or name == 'collision_fbx':
            versions[name] = fbx_binary_version(path) if path.is_file() else None
    wrong = {name: value for name, value in versions.items() if value not in (FBX_BINARY_VERSION, None)}
    missing_version = [name for name, value in versions.items() if value is None]
    if wrong:
        check('fbx_binary_version', 'FAIL', f'expected {FBX_BINARY_VERSION}, got {wrong}')
    elif missing_version and len(missing_version) == len(versions):
        check('fbx_binary_version', 'FAIL', 'no FBX file present')
    elif missing_version:
        check('fbx_binary_version', 'FAIL', f'not a binary FBX: {missing_version}')
    else:
        check('fbx_binary_version', 'PASS', f'all FBX are {FBX_BINARY_VERSION}')

    # --- independent FBX re-inspection ------------------------------------
    inspections: dict[str, dict] = {}
    if blender is None:
        check('geometry_reinspection', 'NOT_VERIFIED', 'Blender not available')
    else:
        ok = True
        for name, path in expected_files.items():
            if name.endswith('blend') or not path.is_file():
                continue
            result = inspect_fbx(blender, path, name)
            inspections[name] = result
            if result['status'] != 'VERIFIED':
                ok = False
        check('geometry_reinspection', 'PASS' if ok else 'NOT_VERIFIED',
              're-imported every FBX into an empty scene' if ok else 're-import failed')

    # --- LOD monotonicity -------------------------------------------------
    if spec and all(name in inspections for name in ('lod0', 'lod1', 'lod2', 'lod3')):
        triangles = [inspections[f'lod{index}'].get('triangles') for index in range(4)]
        monotonic = all(triangles[i] is not None and triangles[i + 1] is not None
                        and triangles[i] > triangles[i + 1] for i in range(3))
        check('lod_triangle_monotonic', 'PASS' if monotonic else 'FAIL',
              f'triangles LOD0..3 = {triangles}')
    else:
        check('lod_triangle_monotonic', 'NOT_VERIFIED', 'missing SPEC or FBX inspection')

    # --- collision hulls --------------------------------------------------
    lod0 = inspections.get('lod0', {})
    if lod0.get('status') == 'VERIFIED':
        ucx = lod0.get('ucx_objects') or []
        check('collision_hulls', 'PASS' if ucx else 'FAIL',
              f'{len(ucx)} UCX objects inside LOD0')
    else:
        check('collision_hulls', 'NOT_VERIFIED', 'LOD0 not inspected')

    collision_fbx = inspections.get('collision_fbx', {})
    if collision_fbx.get('status') == 'VERIFIED':
        ucx = collision_fbx.get('ucx_objects') or []
        check('collision_asset', 'PASS' if ucx else 'FAIL',
              f'{len(ucx)} UCX objects in the standalone collision FBX')

    # --- materials --------------------------------------------------------
    declared_materials = set(asset['materials'])
    registered = set(shared_materials)
    unregistered = sorted(declared_materials - registered) if registered else []
    if not registered:
        check('materials_registered', 'NOT_VERIFIED', 'Materials/shared_materials.json missing')
    elif unregistered:
        check('materials_registered', 'FAIL', f'not registered: {unregistered}')
    else:
        check('materials_registered', 'PASS', f'{len(declared_materials)} shared materials registered')

    if lod0.get('status') == 'VERIFIED' and spec:
        actual = {name.replace('M_Def_', '') for name in lod0.get('materials') or []}
        unexpected = sorted(actual - registered) if registered else []
        check('material_slots_match', 'FAIL' if unexpected else 'PASS',
              f'slots={sorted(actual)} unexpected={unexpected}')

    # --- textures ---------------------------------------------------------
    textures = sorted((root / 'Textures').rglob('*')) if (root / 'Textures').is_dir() else []
    texture_files = [path for path in textures if path.is_file()]
    remote = [str(path) for path in texture_files if 'http' in path.name]
    check('textures_local', 'FAIL' if remote else 'PASS',
          f'{len(texture_files)} local texture files, {len(remote)} suspicious names')

    # --- sockets ----------------------------------------------------------
    bad_sockets = [name for name in asset['sockets'] if name not in SOCKETS]
    check('sockets_in_vocabulary', 'FAIL' if bad_sockets else 'PASS',
          f'unknown: {bad_sockets}' if bad_sockets else f'{len(asset["sockets"])} sockets declared')

    # --- scale and origin -------------------------------------------------
    rule_key = 'base_center' if asset['geometry'] in ORIGIN_RULES['base_center'] else 'centered'
    primary = PRIMARY_AXIS[rule_key]
    declared = asset['dimensions_m']
    declared_primary = (declared.get('height') if rule_key == 'base_center'
                        else declared.get('length'))
    if lod0.get('status') == 'VERIFIED' and declared_primary:
        actual_primary = (lod0.get('dimensions_m') or [None] * 3)[primary]
        ratio = actual_primary / declared_primary if actual_primary else None
        if ratio is None:
            check('scale_primary_axis', 'NOT_VERIFIED', 'no measured dimension')
        elif 0.9 <= ratio <= 1.25:
            check('scale_primary_axis', 'PASS',
                  f'declared {declared_primary} m vs measured {actual_primary} m (x{ratio:.3f})')
        else:
            check('scale_primary_axis', 'FAIL',
                  f'declared {declared_primary} m vs measured {actual_primary} m (x{ratio:.3f})')

        center = lod0.get('center') or [0, 0, 0]
        bounds_min = lod0.get('bounds_min') or [0, 0, 0]
        largest = max(lod0.get('dimensions_m') or [1.0])
        if rule_key == 'base_center':
            offset = abs(bounds_min[2])
            tolerance = max(0.03 * declared_primary, 0.01)
            check('origin_rule', 'PASS' if offset <= tolerance else 'FAIL',
                  f'base at z={bounds_min[2]} m (tolerance {round(tolerance, 4)} m)')
        else:
            offset = max(abs(value) for value in center)
            tolerance = max(0.10 * largest, 0.02)
            check('origin_rule', 'PASS' if offset <= tolerance else 'FAIL',
                  f'bbox centre {center} (tolerance {round(tolerance, 4)} m)')
    else:
        check('scale_primary_axis', 'NOT_VERIFIED', 'LOD0 not inspected or no declared size')
        check('origin_rule', 'NOT_VERIFIED', 'LOD0 not inspected')

    # --- manifest consistency --------------------------------------------
    manifest_entry = next((row for row in manifest.get('assets', [])
                           if row['asset_id'] == asset_id), None)
    if manifest_entry is None:
        check('manifest_entry', 'FAIL', 'asset missing from defensive_system_manifest.json')
    else:
        problems = []
        if manifest_entry['category_dir'] != CATEGORY_DIR[asset['category']]:
            problems.append('category_dir mismatch')
        if manifest_entry['priority'] != asset['priority']:
            problems.append('priority mismatch')
        if manifest_entry['master']['present'] != expected_files['master_blend'].is_file():
            problems.append('master presence mismatch')
        for rel, record in manifest_entry.get('files', {}).items():
            path = root / rel
            if not path.is_file():
                problems.append(f'manifest lists missing file {rel}')
            elif record.get('sha256') != sha256_file(path):
                problems.append(f'sha256 mismatch for {rel}')
        check('manifest_consistency', 'FAIL' if problems else 'PASS',
              '; '.join(problems) if problems else 'hashes and paths agree with disk')

    # --- SPEC hash coverage ----------------------------------------------
    if spec and spec.get('sha256'):
        uncovered = []
        for rel in spec['sha256']:
            if not (root / rel).is_file():
                uncovered.append(rel)
        check('spec_hash_coverage', 'FAIL' if uncovered else 'PASS',
              f'missing files: {uncovered}' if uncovered else f'{len(spec["sha256"])} hashed files')
    else:
        check('spec_hash_coverage', 'NOT_VERIFIED', 'no SPEC or empty hash table')

    statuses = [item['status'] for item in checks]
    result = 'FAIL' if 'FAIL' in statuses else ('NOT_VERIFIED' if 'NOT_VERIFIED' in statuses else 'PASS')
    record = {
        'asset_id': asset_id,
        'asset_dir': str(root),
        'generated_at': TODAY,
        'result': result,
        'checks': checks,
        'summary': {status: statuses.count(status) for status in ('PASS', 'FAIL', 'NOT_VERIFIED')},
    }
    save_json(root / 'Validation' / f'{asset_id}_VALIDATION.json', record)
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset', action='append', default=None)
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--no-blender', action='store_true',
                        help='skip the independent FBX re-import check')
    args = parser.parse_args()

    manifest_path = MANIFEST_DIR / 'defensive_system_manifest.json'
    manifest = load_json(manifest_path) if manifest_path.is_file() else {}
    shared_materials = load_shared_materials()
    blender = None if args.no_blender else find_blender()

    selected = [asset for asset in dataset.ASSETS
                if args.all or not args.asset or asset['asset_id'] in set(args.asset)]
    records = [validate_asset(asset, manifest, blender, shared_materials) for asset in selected]

    summary = {
        'schema': 'silent-depth-defensive-validation-v1',
        'generated_at': TODAY,
        'blender': str(blender) if blender else None,
        'shared_materials_known': len(shared_materials),
        'totals': {
            'assets': len(records),
            'PASS': sum(1 for r in records if r['result'] == 'PASS'),
            'FAIL': sum(1 for r in records if r['result'] == 'FAIL'),
            'NOT_VERIFIED': sum(1 for r in records if r['result'] == 'NOT_VERIFIED'),
        },
        'assets': records,
    }
    save_json(VALIDATION_DIR / 'defensive_system_validation.json', summary)
    for record in records:
        failed = [item['rule'] for item in record['checks'] if item['status'] == 'FAIL']
        print(f"{record['asset_id']}: {record['result']}"
              + (f" failed={failed}" if failed else ''))
    print(json.dumps(summary['totals'], ensure_ascii=False))
    return 0 if summary['totals']['FAIL'] == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
