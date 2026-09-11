#!/usr/bin/env python3
"""Blender entry point: build one defensive asset end to end.

Usage:
    blender --background --factory-startup --python sds_build_asset.py -- --asset-id US_EW_ESM_GENERIC

Stages (``--mode all`` runs them in order):
    master    geometry + sockets + collision, saved as Blend/<Id>_MASTER.blend
    lods      LOD1..LOD3 derived from LOD0
    export    FBX/<Id>_LOD0..3.fbx (binary 7400) and Collision/<Id>_COLLISION.fbx
    preview   Preview/*.png orthographic views
    spec      Documentation/<Id>_SPEC.json and <Id>_README.md
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import sds_dataset as dataset  # noqa: E402
import sds_geometry as geometry  # noqa: E402
from sds_common import (  # noqa: E402
    CATEGORY_DIR,
    FBX_BINARY_VERSION,
    FBX_LABEL,
    TODAY,
    UE_TARGET,
    defensive_asset_dir,
    save_json,
    save_text,
    sha256_file,
)

LOD_RATIOS = {'LOD1': 0.50, 'LOD2': 0.22, 'LOD3': 0.085}
EXPORT_KWARGS = dict(
    global_scale=1.0,
    apply_unit_scale=True,
    apply_scale_options='FBX_SCALE_UNITS',
    axis_forward='-Y',
    axis_up='Z',
    use_space_transform=True,
    bake_space_transform=False,
    use_mesh_modifiers=True,
    mesh_smooth_type='FACE',
    use_tspace=True,
    add_leaf_bones=False,
    bake_anim=False,
    path_mode='STRIP',
    embed_textures=False,
)
PREVIEW_VIEWS = (
    ('Front', (0.0, -1.0, 0.18)),
    ('Side', (1.0, 0.0, 0.18)),
    ('Top', (0.0, 0.0, 1.0)),
    ('ThreeQuarter', (0.78, -0.78, 0.42)),
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset-id', required=True)
    parser.add_argument('--mode', default='all',
                        choices=('all', 'master', 'lods', 'export', 'preview', 'spec'))
    parser.add_argument('--preview-size', type=int, default=512)
    return parser.parse_args(argv)


def directories(asset: dict) -> dict[str, Path]:
    root = defensive_asset_dir(asset)
    paths = {name: root / name for name in
             ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures', 'Preview',
              'Documentation', 'Validation')}
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifiers(obj: bpy.types.Object) -> None:
    activate(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def mesh_stats(obj: bpy.types.Object) -> dict:
    mesh = obj.data
    mesh.calc_loop_triangles()
    dims = obj.dimensions
    return {
        'triangles': len(mesh.loop_triangles),
        'vertices': len(mesh.vertices),
        'uv_channels': len(mesh.uv_layers),
        'dimensions_m': [round(dims[0], 5), round(dims[1], 5), round(dims[2], 5)],
        'material_slots': [slot.material.name for slot in obj.material_slots if slot.material],
    }


def build_master(asset: dict, paths: dict[str, Path]) -> dict:
    asset_id = asset['asset_id']
    geometry.reset_scene()
    parts, material_slots = geometry.build_asset_objects(asset)
    col = bpy.data.collections[asset_id]

    body = geometry.join(parts, f'DEF_{asset_id}_LOD0', col)
    if asset['geometry'] in geometry.LONG_AXIS_X:
        # Launcher-axis assets are modelled along Z and rotated once, as a whole,
        # so every part keeps its relative placement.
        activate(body)
        body.rotation_euler = (0.0, math.radians(90), 0.0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    # Hard-surface finishing: a single bevel pass plus an edge split keeps the
    # joined mesh readable without stacking modifiers on every source part.
    activate(body)
    for modifier in list(body.modifiers):
        body.modifiers.remove(modifier)
    bevel_modifier = body.modifiers.new('Finish_Bevel', 'BEVEL')
    bevel_modifier.width = 0.004 if max(asset['dimensions_m'].values()) > 1.0 else 0.003
    bevel_modifier.segments = 2
    bevel_modifier.limit_method = 'ANGLE'
    bevel_modifier.angle_limit = math.radians(35)
    split_modifier = body.modifiers.new('Finish_EdgeSplit', 'EDGE_SPLIT')
    split_modifier.split_angle = math.radians(40)
    split_modifier.use_edge_angle = True
    split_modifier.use_edge_sharp = False
    apply_modifiers(body)
    activate(body)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    if not body.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
    else:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')

    collision = build_collision(asset, col, body)
    blend_path = paths['Blend'] / f'{asset_id}_MASTER.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    stats = mesh_stats(body)
    stats['collision_objects'] = [obj.name for obj in collision]
    stats['material_slots_declared'] = material_slots
    return {'body': body.name, 'blend': str(blend_path), 'stats': stats}


def build_collision(asset: dict, col: bpy.types.Collection,
                    body: bpy.types.Object) -> list[bpy.types.Object]:
    """Simple convex hulls: convex primitives on the asset's long axis."""
    asset_id = asset['asset_id']
    dims = asset['dimensions_m']
    bpy.ops.object.select_all(action='DESELECT')
    hulls: list[bpy.types.Object] = []

    if asset['geometry'].startswith('esm_mast'):
        height = dims['height']
        radius = dims['diameter'] / 2.0
        for index in range(4):
            z0 = height * index / 4.0
            z1 = height * (index + 1) / 4.0
            obj = geometry.cyl(f'UCX_{asset_id}_{index:02d}', radius * 1.15, z1 - z0,
                               location=(0, 0, (z0 + z1) / 2.0), vertices=12)
            hulls.append(geometry.link(obj, col))
    elif asset['geometry'] == 'antenna_array':
        length, width, thickness = dims['length'], dims['width'], dims['thickness']
        obj = geometry.box(f'UCX_{asset_id}_00', (length, width, thickness * 2.2))
        hulls.append(geometry.link(obj, col))
    elif asset['geometry'] in ('decoy_canister', 'noise_maker', 'launcher_tube'):
        length, radius = dims['length'], dims['diameter'] / 2.0
        for index in range(2):
            segment = length / 2.0
            obj = geometry.cyl(f'UCX_{asset_id}_{index:02d}', radius * 1.2, segment,
                               location=(-length / 2.0 + segment * (index + 0.5), 0, 0),
                               rotation=(0.0, math.radians(90), 0.0), vertices=12)
            hulls.append(geometry.link(obj, col))
    elif asset['geometry'] == 'decoy_mobile':
        length, radius = dims['length'], dims['diameter'] / 2.0
        for index in range(2):
            segment = length / 2.0
            obj = geometry.cyl(f'UCX_{asset_id}_{index:02d}', radius * 1.15, segment,
                               location=(-length / 2.0 + segment * (index + 0.5), 0, 0),
                               rotation=(0.0, math.radians(90), 0.0), vertices=12)
            hulls.append(geometry.link(obj, col))
    else:
        length = dims['length']
        width = dims.get('width', 0.5)
        height = dims.get('height', 0.5)
        for index in range(2):
            obj = geometry.box(f'UCX_{asset_id}_{index:02d}',
                               (length * 0.52, width, height),
                               location=((index - 0.5) * length * 0.5, 0, height * (0.5 if asset['geometry'] == 'control_console' else 0.0)))
            hulls.append(geometry.link(obj, col))

    for obj in hulls:
        activate(obj)
        obj.display_type = 'WIRE'
    return hulls


def build_lods(asset: dict, paths: dict[str, Path]) -> dict:
    asset_id = asset['asset_id']
    body = bpy.data.objects[f'DEF_{asset_id}_LOD0']
    stats = {'LOD0': mesh_stats(body)}
    for lod, ratio in LOD_RATIOS.items():
        duplicate = body.copy()
        duplicate.data = body.data.copy()
        duplicate.name = f'DEF_{asset_id}_{lod}'
        duplicate.data.name = f'DEF_{asset_id}_{lod}'
        bpy.context.scene.collection.objects.link(duplicate)
        modifier = duplicate.modifiers.new('LOD_Decimate', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        apply_modifiers(duplicate)
        stats[lod] = mesh_stats(duplicate)
    return stats


def export_fbx(asset: dict, paths: dict[str, Path]) -> dict:
    asset_id = asset['asset_id']
    written = {}
    collision_objects = [obj for obj in bpy.data.objects if obj.name.startswith(f'UCX_{asset_id}_')]

    for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
        body = bpy.data.objects[f'DEF_{asset_id}_{lod}']
        targets = [body]
        if lod == 'LOD0':
            targets += collision_objects
        bpy.ops.object.select_all(action='DESELECT')
        for obj in targets:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = body
        out = paths['FBX'] / f'{asset_id}_{lod}.fbx'
        if out.exists():
            out.unlink()
        bpy.ops.export_scene.fbx(filepath=str(out), use_selection=True, object_types={'MESH'},
                                 **EXPORT_KWARGS)
        written[lod] = str(out)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in collision_objects:
        obj.select_set(True)
    if collision_objects:
        bpy.context.view_layer.objects.active = collision_objects[0]
        out = paths['Collision'] / f'{asset_id}_COLLISION.fbx'
        if out.exists():
            out.unlink()
        bpy.ops.export_scene.fbx(filepath=str(out), use_selection=True, object_types={'MESH'},
                                 **EXPORT_KWARGS)
        written['COLLISION'] = str(out)
    return written


def setup_render(preview_dir: Path, size: int) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    if background is not None:
        background.inputs[0].default_value = (0.35, 0.38, 0.42, 1.0)
        background.inputs[1].default_value = 1.0
    scene.world = world

    if not any(obj.type == 'LIGHT' for obj in scene.objects):
        key = bpy.data.lights.new('KeyLight', 'SUN')
        key.energy = 4.0
        key_obj = bpy.data.objects.new('KeyLight', key)
        key_obj.rotation_euler = (math.radians(52), 0.0, math.radians(40))
        scene.collection.objects.link(key_obj)
        fill = bpy.data.lights.new('FillLight', 'AREA')
        fill.energy = 260.0
        fill.size = 6.0
        fill_obj = bpy.data.objects.new('FillLight', fill)
        fill_obj.location = (-3.0, -3.0, 3.0)
        fill_obj.rotation_euler = (math.radians(55), 0.0, math.radians(-45))
        scene.collection.objects.link(fill_obj)


def render_previews(asset: dict, paths: dict[str, Path], size: int) -> int:
    from mathutils import Vector

    asset_id = asset['asset_id']
    body = bpy.data.objects[f'DEF_{asset_id}_LOD0']
    setup_render(paths['Preview'], size)
    scene = bpy.context.scene
    bbox = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
    xs = [point.x for point in bbox]
    ys = [point.y for point in bbox]
    zs = [point.z for point in bbox]
    center = Vector(((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0,
                     (min(zs) + max(zs)) / 2.0))
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    span_z = max(zs) - min(zs)
    extent = max(span_x, span_y, span_z)
    slender = (extent / max(min(span_x, span_y, span_z), 1e-3)) > 2.5
    if slender:
        # Portrait frames keep long, thin hardware readable instead of a hairline.
        scene.render.resolution_x = size
        scene.render.resolution_y = size * 3
    res_x = scene.render.resolution_x
    res_y = scene.render.resolution_y
    distance = max(extent * 3.0, 2.0)

    camera_data = bpy.data.cameras.new(f'CAM_{asset_id}')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new(f'CAM_{asset_id}', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    def frame(direction: tuple[float, float, float], target: Vector | None = None) -> None:
        """Point the camera at ``target`` and fit the bbox with a small margin."""
        focus = center if target is None else target
        vector = Vector(direction).normalized()
        camera.location = focus + vector * distance
        look_at(camera, tuple(focus))
        basis = camera.matrix_world.to_3x3()
        right = basis.col[0]
        up = basis.col[1]
        proj_right = max(abs((point - focus).dot(right)) for point in bbox) * 2.0
        proj_up = max(abs((point - focus).dot(up)) for point in bbox) * 2.0
        if res_y >= res_x:
            scale = max(proj_up, proj_right * (res_y / res_x))
        else:
            scale = max(proj_right, proj_up * (res_x / res_y))
        camera_data.ortho_scale = max(scale * 1.15, 0.05)

    written = 0
    original_materials = [slot.material for slot in body.material_slots]
    gray = bpy.data.materials.new('M_Def_Preview_Gray')
    gray.use_nodes = True
    bsdf = gray.node_tree.nodes.get('Principled BSDF')
    if bsdf is not None:
        bsdf.inputs['Base Color'].default_value = (0.22, 0.23, 0.24, 1.0)
        bsdf.inputs['Metallic'].default_value = 0.6
        bsdf.inputs['Roughness'].default_value = 0.45

    views = list(PREVIEW_VIEWS)
    if slender:
        views.append(('Detail', PREVIEW_VIEWS[3][1]))
    for label, direction in views:
        if label == 'Detail':
            focus = Vector((center.x, center.y, center.z + extent * 0.36))
            frame(direction, focus)
            camera_data.ortho_scale = max(extent * 0.30, 0.15)
        else:
            frame(direction)
        scene.render.filepath = str(paths['Preview'] / f'{asset_id}_{label}.png')
        bpy.ops.render.render(write_still=True)
        written += 1

    for slot in body.material_slots:
        slot.material = gray
    for label, direction in (('Front', PREVIEW_VIEWS[0][1]), ('ThreeQuarter', PREVIEW_VIEWS[3][1])):
        frame(direction)
        scene.render.filepath = str(paths['Preview'] / f'{asset_id}_Gray_{label}.png')
        bpy.ops.render.render(write_still=True)
        written += 1

    for slot, material in zip(body.material_slots, original_materials):
        slot.material = material
    return written


def look_at(camera: bpy.types.Object, target: tuple[float, float, float]) -> None:
    from mathutils import Vector
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def write_spec(asset: dict, paths: dict[str, Path], stats: dict, preview_count: int) -> dict:
    asset_id = asset['asset_id']
    hashes = {}
    for folder in ('Blend', 'FBX', 'Collision', 'Preview', 'Source'):
        folder_path = paths[folder]
        if not folder_path.is_dir():
            continue
        for path in sorted(folder_path.rglob('*')):
            if path.is_file():
                rel = path.relative_to(defensive_asset_dir(asset)).as_posix()
                hashes[rel] = sha256_file(path)

    exports = []
    for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
        entry = stats.get(lod, {})
        exports.append({
            'name': f'{asset_id}_{lod}',
            'triangles': entry.get('triangles'),
            'vertices': entry.get('vertices'),
            'uv_channels': entry.get('uv_channels'),
            'dimensions_m': entry.get('dimensions_m'),
        })

    lod0 = stats.get('LOD0', {})
    spec = {
        'asset_id': asset_id,
        'status': 'VALIDATING',
        'category': asset['category'],
        'category_dir': CATEGORY_DIR[asset['category']],
        'branch': asset['branch'],
        'family_id': asset['family_id'],
        'country': asset['country'],
        'priority': asset['priority'],
        'label': asset['label'],
        'label_zh': asset['label_zh'],
        'geometry': asset['geometry'],
        'provenance': '本地程序化生成网格与材质，无第三方模型或图片进入运行时包',
        'license': '本项目可商业使用的原创生成资产',
        'representation_zh': '游戏化的外形表达，不是对真实装备的测绘复刻',
        'dimensions_m': {
            'declared': asset['dimensions_m'],
            'bounds_lod0': lod0.get('dimensions_m'),
        },
        'exports': exports,
        'materials': lod0.get('material_slots', []),
        'sockets': asset['sockets'],
        'collision': {
            'objects': stats.get('collision_objects', []),
            'embedded_in_lod0': True,
        },
        'preview_count': preview_count,
        'ue_target': {'engine': UE_TARGET, 'fbx_binary_version': FBX_BINARY_VERSION,
                      'fbx_label': FBX_LABEL},
        'generated_at': TODAY,
        'sha256': hashes,
    }
    save_json(paths['Documentation'] / f'{asset_id}_SPEC.json', spec)

    readme = [
        f'# {asset_id}',
        '',
        f'- 中文名：{asset["label_zh"]}',
        f'- 分类：{CATEGORY_DIR[asset["category"]]} / 分支 {asset["branch"]} / 家族 {asset["family_id"]}',
        f'- 国家：{asset["country"]}',
        f'- 优先级：{asset["priority"]}',
        f'- 尺寸（声明）：{json.dumps(asset["dimensions_m"], ensure_ascii=False)}',
        f'- LOD0 包围盒：{lod0.get("dimensions_m")}',
        f'- Socket：{", ".join(asset["sockets"]) if asset["sockets"] else "无（艇内设备）"}',
        f'- 碰撞：{len(stats.get("collision_objects", []))} 个 UCX 凸包，随 LOD0 导出',
        f'- 预览：{preview_count} 张（Preview/）',
        f'- 导出：FBX 二进制 {FBX_BINARY_VERSION}（{FBX_LABEL}），目标 {UE_TARGET}',
        '',
        asset['geometry_notes_zh'],
        '',
        '本资产由 `Tools/sds_geometry.py` 程序化生成，可重复构建；'
        '不含第三方模型或贴图，运行时完全离线。',
        '',
    ]
    save_text(paths['Documentation'] / f'{asset_id}_README.md', '\n'.join(readme))
    return spec


def main() -> int:
    args = parse_args()
    asset = dataset.ASSET_BY_ID[args.asset_id]
    paths = directories(asset)
    started = time.time()
    result: dict = {'asset_id': asset['asset_id'], 'mode': args.mode, 'stages': {}}

    if args.mode in ('all', 'master'):
        master = build_master(asset, paths)
        result['stages']['master'] = {'blend': master['blend'], 'stats': master['stats']}
    elif not bpy.data.filepath:
        raise SystemExit('non-master stages require an already opened MASTER blend')

    stats: dict = {}
    if args.mode in ('all', 'lods'):
        stats = build_lods(asset, paths)
        result['stages']['lods'] = stats
        save_json(paths['Validation'] / f'{asset["asset_id"]}_BUILD_STATS.json',
                  {'asset_id': asset['asset_id'], 'stats': stats, 'generated_at': TODAY})
    else:
        stats_path = paths['Validation'] / f'{asset["asset_id"]}_BUILD_STATS.json'
        if stats_path.is_file():
            stats = json.loads(stats_path.read_text(encoding='utf-8'))['stats']

    if args.mode in ('all', 'export'):
        result['stages']['export'] = export_fbx(asset, paths)

    if args.mode == 'all':
        # The LOD/collision objects are already written to FBX; drop them before
        # rendering so the preview pass runs with a small, LOD0-only scene.
        for obj in [item for item in bpy.data.objects
                    if item.name.startswith(f'DEF_{asset["asset_id"]}_')
                    and not item.name.endswith('_LOD0')]:
            bpy.data.objects.remove(obj, do_unlink=True)
        for obj in [item for item in bpy.data.objects
                    if item.name.startswith(f'UCX_{asset["asset_id"]}_')]:
            bpy.data.objects.remove(obj, do_unlink=True)

    preview_count = 0
    if args.mode in ('all', 'preview'):
        preview_count = render_previews(asset, paths, args.preview_size)
        result['stages']['preview'] = {'count': preview_count, 'size': args.preview_size}

    if args.mode in ('all', 'spec'):
        preview_count = len(list(paths['Preview'].glob('*.png')))
        spec = write_spec(asset, paths, stats, preview_count)
        result['stages']['spec'] = {'exports': spec['exports'], 'sockets': spec['sockets']}

    result['status'] = 'OK'
    result['seconds'] = round(time.time() - started, 2)
    print('SDS_BUILD_RESULT=' + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
