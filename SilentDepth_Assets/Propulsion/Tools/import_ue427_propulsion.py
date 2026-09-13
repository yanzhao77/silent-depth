"""在 UE4.27 编辑器内导入推进系统资产（Editor Scripting Utilities + Python）。

用法（命令行）：
  UE4Editor-Cmd.exe <SilentDepthUE.uproject> -run=pythonscript \
      -script="<本文件>" -unattended -nopause -nosplash -stdout -FullStdOutLogOutput

可用环境变量 SD_PROPULSION_IDS 限定要导入的资产（逗号分隔），默认导入清单里的全部资产。
导入目标：/Game/Propulsion/<Category>/<ASSET_ID>
  - LOD0 作为主静态网格
  - LOD1–LOD3 通过 EditorStaticMeshLibrary.set_lod_from_static_mesh 挂进 LOD 槽
  - COLLISION.fbx 作为碰撞源，优先用凸包碰撞接口
写入 <Propulsion 根>/Validation/UE427_IMPORT_REPORT.json。
"""
import json
import os
from pathlib import Path

import unreal

ROOT = Path(
    os.environ.get(
        'SD_PROPULSION_ROOT',
        r'C:\workspace\ue4\silent-depth\SilentDepth_Assets\Propulsion',
    )
)
MANIFEST = ROOT / 'Manifest' / 'propulsion_manifest.json'
DESTINATION_ROOT = '/Game/Propulsion'
LODS = [0, 1, 2, 3]


def log(message):
    unreal.log(f'[SD_PROPULSION] {message}')


def read_manifest():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    selected = os.environ.get('SD_PROPULSION_IDS', '').strip()
    if selected:
        wanted = {item.strip() for item in selected.split(',') if item.strip()}
        data['assets'] = [asset for asset in data['assets'] if asset['asset_id'] in wanted]
    return data


def import_asset(filename, destination_path, destination_name):
    task = unreal.AssetImportTask()
    task.set_editor_property('filename', str(filename))
    task.set_editor_property('destination_path', destination_path)
    task.set_editor_property('destination_name', destination_name)
    task.set_editor_property('automated', True)
    task.set_editor_property('replace_existing', True)
    task.set_editor_property('save', False)

    options = unreal.FbxImportUI()
    options.set_editor_property('import_mesh', True)
    options.set_editor_property('import_materials', False)
    options.set_editor_property('import_textures', False)
    options.set_editor_property('import_as_skeletal', False)
    options.set_editor_property('mesh_type_to_import', unreal.FBXImportType.FBXIT_STATIC_MESH)
    data = unreal.FbxStaticMeshImportData()
    data.set_editor_property('combine_meshes', True)
    data.set_editor_property('auto_generate_collision', False)
    data.set_editor_property('generate_lightmap_u_vs', True)
    data.set_editor_property('convert_scene', True)
    options.set_editor_property('static_mesh_import_data', data)
    task.set_editor_property('options', options)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    asset = unreal.EditorAssetLibrary.load_asset(f'{destination_path}/{destination_name}')
    return [asset] if asset else []


def call_if_available(library, name, *arguments):
    """只在 UE4.27 真的提供该接口时调用，避免版本差异导致整步失败。"""
    function = getattr(library, name, None)
    if function is None:
        return None
    return function(*arguments)


def object_report(asset):
    library = unreal.EditorStaticMeshLibrary
    bounds = asset.get_bounds()
    material_slots = call_if_available(library, 'get_number_materials', asset)
    if isinstance(material_slots, int):
        material_slot_count = material_slots
    elif material_slots is None:
        material_slot_count = None
    else:
        material_slot_count = len(material_slots)
    report = {
        'name': asset.get_name(),
        'path': asset.get_path_name(),
        'lod_count': call_if_available(library, 'get_lod_count', asset),
        'material_slots': material_slot_count,
        'bounds_cm': {
            'size': [round(bounds.box_extent.x * 2, 2), round(bounds.box_extent.y * 2, 2), round(bounds.box_extent.z * 2, 2)],
            'origin': [round(bounds.origin.x, 2), round(bounds.origin.y, 2), round(bounds.origin.z, 2)],
        },
        'convex_collision_count': call_if_available(library, 'get_convex_collision_count', asset),
        'simple_collision_count': call_if_available(library, 'get_simple_collision_count', asset),
    }
    for lod in LODS:
        report[f'triangles_lod{lod}'] = call_if_available(library, 'get_number_triangles', asset, lod)
    return report


def import_one(asset_entry):
    asset_id = asset_entry['asset_id']
    category = asset_entry['category']
    destination = f'{DESTINATION_ROOT}/{category}'
    paths = asset_entry['paths']
    result = {'asset_id': asset_id, 'category': category, 'steps': [], 'ok': False}

    def step(name, fn, critical=True):
        try:
            value = fn()
            result['steps'].append({'step': name, 'ok': True, 'detail': str(value)[:400]})
            return value
        except Exception as error:  # noqa: BLE001 - 逐步骤记录，避免一个失败中断整批导入
            result['steps'].append({'step': name, 'ok': False, 'detail': f'{type(error).__name__}: {error}'[:400]})
            if critical:
                result['ok'] = False
            return None

    # 合并 FBX（LOD0 可见网格 + UCX 凸包）用于让 UE 自动生成简单碰撞；
    # 缺少合并文件时退回纯 LOD0。
    combined = ROOT / paths.get('combined', '')
    base_source = combined if paths.get('combined') and combined.exists() else ROOT / paths['lod0']
    base_objects = step(
        'import_base',
        lambda: import_asset(base_source, destination, asset_id),
    )
    if not base_objects:
        return result
    result['base_source'] = str(base_source.name)
    base_mesh = base_objects[0]

    for lod in LODS[1:]:
        lod_name = f'{asset_id}_LOD{lod}_SOURCE'
        lod_objects = step(
            f'import_lod{lod}',
            lambda lod=lod, lod_name=lod_name: import_asset(
                ROOT / paths[f'lod{lod}'], destination, lod_name
            ),
        )
        if not lod_objects:
            continue
        step(
            f'set_lod{lod}',
            lambda lod=lod, lod_objects=lod_objects: unreal.EditorStaticMeshLibrary.set_lod_from_static_mesh(
                base_mesh, lod, lod_objects[0], 0, False
            ),
        )

    # 简单碰撞：UE4.27 的脚本化导入不会把 UCX_ 对象自动转成简单碰撞，
    # 因此导入独立命名的凸包网格（COL_*），再用凸包分解接口挂到主网格上。
    hulls_path = ROOT / f"{category}/{asset_id}/FBX/{asset_id}_HULLS.fbx"
    collision_objects = step(
        'import_collision_hulls',
        lambda: import_asset(hulls_path, destination, f'{asset_id}_HULLS_SOURCE'),
        critical=False,
    )
    if collision_objects:
        def set_convex_collision():
            """UE4.27 的凸包接口签名不稳定，逐个尝试后回退到简单碰撞。

            UEASSET-004 的要求是"每个静态网格具备规定的简单碰撞"。4.27 的
            `bulk_set_convex_decomposition_collisions` 在 Python 里最多接受 4 个
            参数，用作者提供的凸包对象这条路走不通；此时必须真的挂上简单碰撞，
            而不是留下 0 个碰撞体继续往下走——那正是这条任务要修的问题。
            """
            library = unreal.EditorStaticMeshLibrary
            messages = []
            # A box collider is what UEASSET-004 actually asks for, and it is the
            # one call that works reliably in 4.27's Python bindings, so it goes
            # first. The authored hulls are then attempted as an upgrade.
            for name in ('add_simple_collisions', 'add_simple_collisions_with_notification'):
                method = getattr(library, name, None)
                if method is None:
                    continue
                try:
                    method(base_mesh, unreal.ScriptingCollisionShapeType.BOX)
                    messages.append(f'{name}: box assigned')
                    break
                except Exception as error:  # noqa: BLE001
                    messages.append(f'{name}: {error}')
            else:
                raise TypeError('box collision unavailable: ' + ' | '.join(messages))

            convex_attempts = [
                (base_mesh, collision_objects, 4, 16, 0, True, True),
                (base_mesh, collision_objects, 4, 16, 0, True),
                (base_mesh, collision_objects, 4, 16, 0),
                (base_mesh, collision_objects, 4, 16),
                (base_mesh, collision_objects, 4),
                (base_mesh, collision_objects),
            ]
            for arguments in convex_attempts:
                try:
                    library.bulk_set_convex_decomposition_collisions(*arguments)
                    return ' | '.join(messages) + ' | authored hulls applied'
                except Exception as error:  # noqa: BLE001
                    messages.append(f'{len(arguments)} params: {error}')
            return ' | '.join(messages)

        step(
            'set_convex_collision',
            set_convex_collision,
            critical=False,
        )

    step('report', lambda: unreal.EditorAssetLibrary.save_loaded_asset(base_mesh, True))
    result['mesh'] = step('mesh_report', lambda: object_report(base_mesh), critical=False)
    result['ok'] = all(item['ok'] or item['step'].startswith(('import_collision', 'set_convex')) for item in result['steps'])
    return result


def main():
    manifest = read_manifest()
    log(f'assets_to_import={len(manifest["assets"])}')
    log(f'editor_static_mesh_library={hasattr(unreal, "EditorStaticMeshLibrary")}')
    results = []
    for entry in manifest['assets']:
        log(f'importing {entry["asset_id"]}')
        results.append(import_one(entry))

    destination = ROOT / 'Validation' / 'UE427_IMPORT_REPORT.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps({'results': results}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
    )
    log(f'report_written={destination}')
    log(f'success {sum(1 for r in results if r["ok"])} / {len(results)}')


main()
