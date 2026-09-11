#!/usr/bin/env python3
"""在 Blender 内构建传感器资产的 MASTER、LOD0–3、碰撞、插槽与预览。

用法（命令行）：
    blender --background --factory-startup --python Tools/build_sensor_assets.py -- --all
    blender --background --factory-startup --python Tools/build_sensor_assets.py -- --asset-id US_SONAR_LAB

产物（每个资产目录下）：
    Blend/<ID>_MASTER.blend
    FBX/<ID>_LOD0.fbx ... LOD3.fbx
    Collision/<ID>_COLLISION.fbx
    Preview/<ID>_{Front,Side,Top,Perspective}.png

几何完全程序化、确定性生成；同一输入必然产出同一网格，不使用任何随机数。
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from sensor_common import BRANCH_DIR, PREVIEW_VIEWS, SENSORS_ROOT  # noqa: E402
from sensor_common import save_json  # noqa: E402
from sensor_dataset_assets import CORE_ASSETS  # noqa: E402
from sensor_geometry import BUILDERS, ensure_materials, join  # noqa: E402

SUBDIRS = ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures', 'Preview', 'Documentation', 'Validation')

_VARIANT_CACHE: dict[str, dict] | None = None


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset-id', '--sensor-id', dest='asset_id', action='append', default=[],
                        help='要构建的资产 id；可重复，或使用 --all')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--skip-previews', action='store_true')
    parser.add_argument('--previews-only', action='store_true',
                        help='只对既有 MASTER.blend 重新渲染预览，不重建网格与 FBX')
    parser.add_argument('--output-root', default=str(SENSORS_ROOT))
    return parser.parse_args(argv)


def asset_dir(asset: dict, output_root: Path) -> Path:
    return output_root / BRANCH_DIR[asset['branch']] / asset['sensor_id']


def new_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(collection)
    return collection


def build_lod(asset: dict, detail: int, materials: dict, lod_collection: bpy.types.Collection):
    builder = BUILDERS[asset['form_factor']]
    objects, socket_point, note = builder(asset, detail, materials)
    joined = join(objects, f'SEN_{asset["sensor_id"]}_LOD{detail}')
    for owner in list(joined.users_collection):
        owner.objects.unlink(joined)
    lod_collection.objects.link(joined)
    prepare_mesh(joined)
    joined.data.name = joined.name
    return joined, socket_point, note


def prepare_mesh(obj: bpy.types.Object) -> None:
    """三角化并展开 UV0，保证 UE4 导入时不出现 n-gon 与缺失 UV。"""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    triangulate = obj.modifiers.new('Triangulate', 'TRIANGULATE')
    triangulate.quad_method = 'BEAUTY'
    triangulate.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')


def convex_collision(source: bpy.types.Object, name: str, collection: bpy.types.Collection):
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.duplicate()
    duplicate = bpy.context.active_object
    for coll in list(duplicate.users_collection):
        coll.objects.unlink(duplicate)
    collection.objects.link(duplicate)
    duplicate.name = name
    bpy.context.view_layer.objects.active = duplicate
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.convex_hull()
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_flat()
    return duplicate


def export_selected(objects: list[bpy.types.Object], path: Path) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={'MESH'},
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


def render_previews(asset: dict, target: Path, subject: bpy.types.Object) -> list[str]:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    # 透明底渲染：验证器用 alpha 通道精确统计主体占比。
    scene.render.film_transparent = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    corners = [subject.matrix_world @ mathutils_vector(corner) for corner in subject.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    center = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs), 0.35)
    aspect = scene.render.resolution_x / scene.render.resolution_y

    views = {
        'Front': (1.0, 0.0, 0.45),
        'Side': (0.0, -1.0, 0.45),
        'Top': (0.0, 0.0, 1.0),
        'Perspective': (0.9, -0.9, 0.7),
    }
    written: list[str] = []
    for name in PREVIEW_VIEWS:
        direction = views[name]
        rotation, right, up = mathutils_view_basis(direction)
        projected_x = [sum((c[i] - center[i]) * right[i] for i in range(3)) for c in corners]
        projected_y = [sum((c[i] - center[i]) * up[i] for i in range(3)) for c in corners]
        width = max(projected_x) - min(projected_x)
        height = max(projected_y) - min(projected_y)
        camera_data = bpy.data.cameras.new(f'CAM_{asset["sensor_id"]}_{name}')
        camera = bpy.data.objects.new(f'CAM_{asset["sensor_id"]}_{name}', camera_data)
        scene.collection.objects.link(camera)
        distance = span * 2.6
        length = math.sqrt(sum(component * component for component in direction))
        camera.location = (
            center[0] + direction[0] / length * distance,
            center[1] + direction[1] / length * distance,
            center[2] + direction[2] / length * distance,
        )
        camera.rotation_euler = rotation
        camera_data.type = 'ORTHO'
        camera_data.ortho_scale = max(width * aspect, height, 0.05) * 1.28
        camera_data.clip_end = span * 20
        scene.camera = camera
        filename = f'{asset["sensor_id"]}_{name}.png'
        scene.render.filepath = str(target / filename)
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(camera, do_unlink=True)
        written.append(filename)
    return written


def mathutils_vector(corner):
    from mathutils import Vector
    return Vector(corner)


def mathutils_direction(origin, target):
    from mathutils import Vector
    direction = Vector(target) - Vector(origin)
    return direction.to_track_quat('-Z', 'Y').to_euler()


def mathutils_view_basis(direction):
    """返回相机欧拉角与其右/上轴，用于把包围盒投影到成像平面。"""
    from mathutils import Vector
    # 相机位于 center + direction * distance，因此视线方向是 -direction。
    vector = -Vector(direction).normalized()
    quaternion = vector.to_track_quat('-Z', 'Y')
    matrix = quaternion.to_matrix()
    right = matrix @ Vector((1.0, 0.0, 0.0))
    up = matrix @ Vector((0.0, 1.0, 0.0))
    return quaternion.to_euler(), right, up


def build_asset(asset: dict, output_root: Path, skip_previews: bool) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    target = asset_dir(asset, output_root)
    for sub in SUBDIRS:
        (target / sub).mkdir(parents=True, exist_ok=True)
    scaffold_asset(asset, target)

    materials = ensure_materials()
    root = new_collection(f'SEN_{asset["sensor_id"]}')
    lod_root = new_collection('90_LOD', root)
    socket_collection = new_collection('95_SOCKETS', root)
    collision_collection = new_collection('99_COLLISION', root)

    lod_objects: dict[int, bpy.types.Object] = {}
    socket_point = (0, 0, 0)
    note = ''
    for detail in range(4):
        collection = new_collection(f'LOD{detail}', lod_root)
        obj, socket_point, note = build_lod(asset, detail, materials, collection)
        lod_objects[detail] = obj

    socket_name = asset['socket'] or 'SOCKET_SENSOR_ORIGIN'
    empty = bpy.data.objects.new(socket_name, None)
    empty.empty_display_type = 'ARROWS'
    empty.empty_display_size = 0.4
    empty.location = socket_point
    socket_collection.objects.link(empty)

    collision = convex_collision(lod_objects[3], f'UCX_SEN_{asset["sensor_id"]}_00', collision_collection)
    collision.data.name = f'UCX_SEN_{asset["sensor_id"]}_00'

    master_path = target / 'Blend' / f'{asset["sensor_id"]}_MASTER.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(master_path), compress=False, copy=True)

    export_selected([lod_objects[0]], target / 'FBX' / f'{asset["sensor_id"]}_LOD0.fbx')
    export_selected([lod_objects[1]], target / 'FBX' / f'{asset["sensor_id"]}_LOD1.fbx')
    export_selected([lod_objects[2]], target / 'FBX' / f'{asset["sensor_id"]}_LOD2.fbx')
    export_selected([lod_objects[3]], target / 'FBX' / f'{asset["sensor_id"]}_LOD3.fbx')
    export_selected([collision], target / 'Collision' / f'{asset["sensor_id"]}_COLLISION.fbx')

    previews: list[str] = []
    if not skip_previews:
        previews = render_previews(asset, target / 'Preview', lod_objects[0])

    triangles = {
        f'LOD{detail}': len(obj.data.polygons)
        for detail, obj in lod_objects.items()
    }
    report = {
        'sensor_id': asset['sensor_id'],
        'form_factor': asset['form_factor'],
        'geometry_source': asset['geometry_source'],
        'socket': socket_name,
        'note': note,
        'triangles': triangles,
        'collision_faces': len(collision.data.polygons),
        'collision_object': collision.name,
        'object_names': [
            lod_objects[detail].name for detail in range(4)
        ] + [collision.name, socket_name],
        'mesh_names': [lod_objects[detail].data.name for detail in range(4)],
        'units': 'meters',
        'master': str(master_path),
        'previews': previews,
    }
    save_json(target / 'Validation' / f'{asset["sensor_id"]}_GEOMETRY.json', report)
    return report


def scaffold_asset(asset: dict, target: Path) -> None:
    """确保文本产物（SPEC/README/几何规格/材质表）存在。"""
    global _VARIANT_CACHE
    from create_sensor_asset import create
    from sensor_dataset import dataset

    if _VARIANT_CACHE is None:
        _VARIANT_CACHE = {variant['sensor_id']: variant for variant in dataset()['variants']}
    create(asset, _VARIANT_CACHE[asset['sensor_id']])


def main() -> int:
    args = parse_args()
    output_root = Path(args.output_root)
    if args.asset_id:
        wanted = set(args.asset_id)
        assets = [asset for asset in CORE_ASSETS if asset['sensor_id'] in wanted]
        missing = wanted - {asset['sensor_id'] for asset in assets}
        if missing:
            raise SystemExit(f'未知资产 id：{sorted(missing)}')
    elif args.all:
        assets = list(CORE_ASSETS)
    else:
        raise SystemExit('请指定 --all 或 --asset-id')

    if args.previews_only:
        written = 0
        for asset in assets:
            target = asset_dir(asset, output_root)
            master = target / 'Blend' / f'{asset["sensor_id"]}_MASTER.blend'
            if not master.is_file():
                print(f'[sensor-factory] 缺少 MASTER，跳过：{asset["sensor_id"]}')
                continue
            bpy.ops.wm.open_mainfile(filepath=str(master))
            subject = bpy.data.objects.get(f'SEN_{asset["sensor_id"]}_LOD0')
            if subject is None:
                print(f'[sensor-factory] MASTER 中缺少 LOD0，跳过：{asset["sensor_id"]}')
                continue
            render_previews(asset, target / 'Preview', subject)
            written += 1
            print(f'[sensor-factory] previews {asset["sensor_id"]}')
        print(f'SENSOR_PREVIEWS_REBUILT={written}')
        return 0

    results = []
    for asset in assets:
        results.append(build_asset(asset, output_root, args.skip_previews))
        print(f'[sensor-factory] built {asset["sensor_id"]}')
    print(f'SENSOR_ASSETS_BUILT={len(results)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
