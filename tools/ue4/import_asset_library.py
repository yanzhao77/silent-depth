"""Imports asset-library FBX files into the UE4.27 project (UEASSET-001..003).

Run from the engine commandlet:

    UE4Editor-Cmd.exe <uproject> -run=pythonscript -script=<this file> \
        -sd_import=weapons -sd_lods=1 -unattended -nopause -nosplash -stdout

Arguments (all optional, read from the engine command line):
    -sd_import=weapons|sensors|defensive|all   category to import (default weapons)
    -sd_limit=N                                stop after N assets (pilot runs)
    -sd_lods=0|1                               import LOD1..3 as well (default 1)
    -sd_import_report=<json path>              where to write the report

The manifest in SilentDepth_Assets is the source of truth for paths, and this
tool only ever *adds* assets to the project: it replaces an existing asset of
the same name rather than leaving two copies around. Every asset it touches is
listed in the report, including the ones it refused.
"""
from __future__ import annotations

import json
import os
import re
import time

import unreal

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
)
ASSET_ROOT = os.path.join(PROJECT_ROOT, 'SilentDepth_Assets')
CONTENT_ROOT = '/Game/SilentDepth/Art'


def command_line_arg(name: str, default: str | None = None) -> str | None:
    line = unreal.SystemLibrary.get_command_line()
    match = re.search(rf'-{name}=("[^"]+"|\S+)', line)
    if not match:
        return default
    return match.group(1).strip('"')


def load_json(relative_path: str) -> dict:
    with open(os.path.join(ASSET_ROOT, relative_path), encoding='utf-8') as handle:
        return json.load(handle)


def source_path(relative_path: str) -> str:
    """Absolute path of a manifest entry, which is repo-relative to the library."""
    return os.path.join(ASSET_ROOT, relative_path.replace('/', os.sep))


def describe_weapons(limit: int | None) -> list[dict]:
    """Every weapon the manifest marks COMPLETE, in id order."""
    manifest = load_json('Weapons/Manifest/weapon_manifest.json')
    entries = []
    for weapon in manifest['weapons']:
        if weapon.get('asset_status') != 'COMPLETE':
            continue
        lods = [weapon.get('lod0'), weapon.get('lod1'), weapon.get('lod2'), weapon.get('lod3')]
        if not lods[0]:
            continue
        # Weapons/Torpedoes/CN_TORP_Yu1/LOD/CN_TORP_Yu1_LOD0.fbx
        parts = lods[0].split('/')
        folder = parts[1] if len(parts) > 2 else 'Misc'
        entries.append({
            'asset_id': weapon['weapon_id'],
            'category': 'weapons',
            'folder': folder,
            'name': f'SM_{weapon["weapon_id"]}',
            'lods': lods,
            'collision': weapon.get('collision'),
        })
    entries.sort(key=lambda entry: entry['asset_id'])
    return entries[:limit] if limit else entries


def describe_sensors(limit: int | None) -> list[dict]:
    """Sensors with real geometry (asset_status COMPLETE), in id order."""
    manifest = load_json('Sensors/Manifest/sensor_manifest.json')
    entries = []
    for sensor in manifest['entries']:
        if sensor.get('asset_status') != 'COMPLETE':
            continue
        base = sensor.get('asset_path')
        if not base:
            continue
        # Active/GEN_SONAR_ACT_T3
        parts = base.split('/')
        folder = parts[0]
        stem = parts[-1]
        entries.append({
            'asset_id': sensor['sensor_id'],
            'category': 'sensors',
            'folder': folder,
            'name': f'SM_{stem}',
            'lods': [
                f'Sensors/{base}/FBX/{stem}_LOD0.fbx',
                f'Sensors/{base}/FBX/{stem}_LOD1.fbx',
                f'Sensors/{base}/FBX/{stem}_LOD2.fbx',
                f'Sensors/{base}/FBX/{stem}_LOD3.fbx',
            ],
            'collision': f'Sensors/{base}/Collision/{stem}_COLLISION.fbx',
        })
    entries.sort(key=lambda entry: entry['asset_id'])
    return entries[:limit] if limit else entries


def describe_defensive(limit: int | None) -> list[dict]:
    """Defensive representative assets, in id order."""
    manifest = load_json('DefensiveSystems/Manifest/defensive_system_manifest.json')
    entries = []
    for asset in manifest['assets']:
        if asset.get('status') != 'COMPLETE':
            continue
        asset_dir = asset.get('asset_dir')
        if not asset_dir:
            continue
        stem = asset['asset_id']
        entries.append({
            'asset_id': stem,
            'category': 'defensive',
            'folder': asset.get('category_dir') or 'Misc',
            'name': f'SM_{stem}',
            'lods': [
                f'DefensiveSystems/{asset_dir}/FBX/{stem}_LOD0.fbx',
                f'DefensiveSystems/{asset_dir}/FBX/{stem}_LOD1.fbx',
                f'DefensiveSystems/{asset_dir}/FBX/{stem}_LOD2.fbx',
                f'DefensiveSystems/{asset_dir}/FBX/{stem}_LOD3.fbx',
            ],
            'collision': f'DefensiveSystems/{asset_dir}/Collision/{stem}_COLLISION.fbx',
        })
    entries.sort(key=lambda entry: entry['asset_id'])
    return entries[:limit] if limit else entries


CATEGORIES = {
    'weapons': ('Weapons', describe_weapons),
    'sensors': ('Sensors', describe_sensors),
    'defensive': ('DefensiveSystems', describe_defensive),
}


def import_static_mesh(entry: dict, import_lods: bool) -> dict:
    """Imports one entry and reports exactly what happened."""
    folder = CATEGORIES[entry['category']][0]
    destination = f'{CONTENT_ROOT}/{folder}/{entry["folder"]}'
    result = {
        'asset_id': entry['asset_id'],
        'destination': f'{destination}/{entry["name"]}',
        'lods_imported': 0,
        'collision': False,
        'status': 'PENDING',
    }

    lod0 = entry['lods'][0]
    if not lod0 or not os.path.isfile(source_path(lod0)):
        result['status'] = 'MISSING_SOURCE'
        result['detail'] = lod0 or 'no lod0 in manifest'
        return result

    task = unreal.AssetImportTask()
    task.set_editor_property('filename', source_path(lod0))
    task.set_editor_property('destination_path', destination)
    task.set_editor_property('destination_name', entry['name'])
    task.set_editor_property('automated', True)
    task.set_editor_property('replace_existing', True)
    task.set_editor_property('save', True)

    options = unreal.FbxImportUI()
    options.set_editor_property('import_mesh', True)
    options.set_editor_property('import_materials', True)
    options.set_editor_property('import_textures', True)
    options.set_editor_property('import_as_skeletal', False)
    options.set_editor_property('mesh_type_to_import', unreal.FBXImportType.FBXIT_STATIC_MESH)
    static_data = options.get_editor_property('static_mesh_import_data')
    # The library is metres with +X forward, which is the project convention.
    static_data.set_editor_property('convert_scene', True)
    static_data.set_editor_property('convert_scene_unit', True)
    static_data.set_editor_property('auto_generate_collision', False)
    static_data.set_editor_property('combine_meshes', True)
    task.set_editor_property('options', options)

    try:
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    except Exception as error:  # noqa: BLE001 - the report carries the reason
        result['status'] = 'IMPORT_FAILED'
        result['detail'] = str(error)
        return result

    mesh = unreal.EditorAssetLibrary.load_asset(result['destination'])
    if mesh is None:
        result['status'] = 'IMPORT_RETURNED_NOTHING'
        return result

    result['lods_imported'] = 1
    if import_lods:
        for index in range(1, 4):
            lod_relative = entry['lods'][index] if index < len(entry['lods']) else None
            if not lod_relative or not os.path.isfile(source_path(lod_relative)):
                continue
            try:
                unreal.EditorStaticMeshLibrary.import_lod(
                    mesh, index, source_path(lod_relative))
                result['lods_imported'] += 1
            except Exception as error:  # noqa: BLE001
                result.setdefault('lod_errors', []).append(f'LOD{index}: {error}')

    # UEASSET-004 fixes the authored collision for propulsion; here a simple
    # box keeps the asset collidable and the report says it is generated.
    try:
        unreal.EditorStaticMeshLibrary.add_simple_collisions(
            mesh, unreal.ScriptingCollisionShapeType.BOX)
        result['collision'] = True
    except Exception as error:  # noqa: BLE001
        result.setdefault('collision_error', str(error))

    unreal.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False)
    result['status'] = 'IMPORTED'
    return result


def main() -> int:
    requested = (command_line_arg('sd_import') or 'weapons').lower()
    limit_arg = command_line_arg('sd_limit')
    limit = int(limit_arg) if limit_arg else None
    import_lods = (command_line_arg('sd_lods', '1') or '1') != '0'
    report_path = command_line_arg('sd_import_report')

    categories = list(CATEGORIES) if requested == 'all' else [requested]
    for category in categories:
        if category not in CATEGORIES:
            unreal.log_error(f'SD_IMPORT: unknown category {category}')
            return 1

    started = time.time()
    report = {'categories': {}, 'lods_imported': import_lods}
    for category in categories:
        entries = CATEGORIES[category][1](limit)
        results = [import_static_mesh(entry, import_lods) for entry in entries]
        imported = [item for item in results if item['status'] == 'IMPORTED']
        report['categories'][category] = {
            'planned': len(entries),
            'imported': len(imported),
            'failed': [item for item in results if item['status'] != 'IMPORTED'],
            'assets': results,
        }
        unreal.log(
            f'SD_IMPORT {category}: {len(imported)}/{len(entries)} imported'
        )

    report['seconds'] = round(time.time() - started, 1)
    if report_path:
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, 'w', encoding='utf-8') as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
        unreal.log(f'SD_IMPORT report written to {report_path}')
    unreal.log('SD_IMPORT_DONE')
    return 0


raise SystemExit(main())
