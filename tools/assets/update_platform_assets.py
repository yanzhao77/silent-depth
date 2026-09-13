"""Regenerates Config/SilentDepth/platform_assets.json from the built hulls.

    python tools/assets/update_platform_assets.py [--dry-run]

The platform table is what the pawn resolves a hull from (SUB-001), so it has
to keep up with the asset library. Hand-written entries are preserved: the
three boats that predate the parametric pipeline carry curated paths that this
tool must not overwrite. Everything else is derived from two sources of truth:

  * the manifest, for which hulls exist and where their UE assets live, and
  * each hull's ASSEMBLY.json, for where its movable parts pivot.

A hull whose ASSEMBLY is missing keeps no pivots rather than inheriting another
boat's, which is exactly what the pawn's optional-offset rule expects.
"""
from __future__ import annotations

import argparse
import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
ASSETS = REPO / 'SilentDepth_Assets'
MANIFEST = ASSETS / 'Manifest' / 'submarine_manifest.json'
TABLE = REPO / 'ue4' / 'SilentDepthUE' / 'Config' / 'SilentDepth' / 'platform_assets.json'
UE_ROOT = '/Game/SilentDepth/Art/Submarines'

#: Hulls with curated entries that are not produced by Tools/sd_hull_pipeline.py.
PRESERVE = {'RU_SSN_Akula', 'RU_SSN_Yasen', 'RU_SSBN_Typhoon'}

PART_KEYS = {
    'propulsor_01': 'propulsor',
    'rudder_01': 'rudder',
    'stern_planes_01': 'sternPlanes',
    'bow_planes_01': 'bowPlanes',
    'periscope_01': 'periscope',
}


def assembly_of(asset_id: str) -> dict | None:
    matches = list((ASSETS / 'Submarines').glob(f'**/{asset_id}_ASSEMBLY.json'))
    if not matches:
        return None
    return json.loads(matches[0].read_text(encoding='utf-8'))


def entry_for(entry: dict) -> dict | None:
    master = entry.get('master') or ''
    if not master or 'SD_hull' not in (entry.get('materials') or []):
        return None
    # Submarines/SSN/USA/Virginia/Blend/... -> SSN/USA/Virginia
    parts = master.split('/')
    if len(parts) < 4 or parts[0] != 'Submarines':
        return None
    relative = '/'.join(parts[1:-2])
    asset_id = entry['asset_id']
    destination = f'{UE_ROOT}/{relative}'

    def mesh(suffix: str) -> str:
        name = f'SM_{asset_id}' + (f'_{suffix}' if suffix else '')
        return f'{destination}/{name}.{name}'

    result = {
        'hull': mesh(''),
        'propulsor': mesh('PROPULSOR_01'),
        'rudder': mesh('RUDDER_01'),
        'sternPlanes': mesh('STERN_PLANES_01'),
        'bowPlanes': mesh('BOW_PLANES_01'),
        'periscope': mesh('PERISCOPE_01'),
    }
    assembly = assembly_of(asset_id)
    if assembly:
        offsets = {}
        for part in assembly.get('parts', []):
            key = PART_KEYS.get(part.get('id'))
            translation = (part.get('mountTransform') or {}).get('translation')
            if key and translation:
                offsets[key] = [round(float(value) * 100.0, 3) for value in translation]
        if offsets:
            result['partOffsetsCm'] = offsets
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    table = json.loads(TABLE.read_text(encoding='utf-8'))
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))

    generated = {}
    for entry in manifest['assets']:
        asset_id = entry['asset_id']
        if asset_id in PRESERVE:
            continue
        built = entry_for(entry)
        if built is not None:
            generated[asset_id] = built

    platforms = dict(table.get('platforms', {}))
    added = sorted(set(generated) - set(platforms))
    refreshed = sorted(set(generated) & set(platforms))
    for asset_id, value in generated.items():
        platforms[asset_id] = value

    table['platforms'] = dict(sorted(platforms.items()))
    if not args.dry_run:
        TABLE.write_text(json.dumps(table, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'platform table: {len(table["platforms"])} entries '
          f'(added {len(added)}, refreshed {len(refreshed)})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
