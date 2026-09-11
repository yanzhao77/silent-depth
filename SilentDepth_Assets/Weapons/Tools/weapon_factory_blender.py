#!/usr/bin/env python3
"""SILENT DEPTH 武器资产工厂（在 Blender 内运行）。

用法：
    blender --background --factory-startup --python weapon_factory_blender.py -- \
        --job <job.json> --root <SilentDepth_Assets/Weapons> [--no-preview] [--result <path>]

job.json（由 build_weapon_assets.py 生成）：
    {
      "batch_index": 0,
      "category_dirs": {"TORP": "Torpedoes", ...},
      "weapons": [ {weapon_spec}, ... ]
    }

每个武器在独立场景中由 weapon_geometry_kit 从数据集参数重建：LOD0..LOD3、碰撞盒、
共享材质、MASTER.blend、UE4.27 FBX、预览图与图标、Source 配方、SPEC/README 与构建报告。
工厂不猜测任何外形：几何、尺寸、分层全部来自 weapon_dataset。

成功后向 stdout 输出一行：WPN_BATCH_RESULT=<json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

GENERATOR_VERSION = 'weapon_factory_blender v1.1.0'
LOD_LEVELS = (0, 1, 2, 3)
SMOOTH_GROUPS = {'Body', 'Nose', 'Tail', 'Propulsor', 'Seeker', 'Detail'}
FBX_BINARY_VERSION = 7400

# (视图名, 相机方向) —— 与 dataset_index.PREVIEW_VIEWS 对齐
VIEW_DIRECTIONS = {
    'PERSPECTIVE': (0.85, -1.0, 0.5),
    'SIDE': (0.0, -1.0, 0.0),
    'FRONT': (1.0, 0.0, 0.0),
    'TOP': (0.0, 0.0, 1.0),
}
ALIAS_NAMES = {
    'PERSPECTIVE': 'Hero.png',
    'SIDE': 'Profile.png',
    'FRONT': 'Front.png',
    'TOP': 'Top.png',
    'DETAIL': 'Detail.png',
}
VIEW_SIZES = (512, 256, 128)
ICON_SIZES = (512, 256, 128)
ASSET_DIRS = ('Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures',
              'Preview', 'Documentation', 'Validation')
BOX_FACES = (
    (0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4),
    (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6),
)


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    parser.add_argument('--root', required=True)
    parser.add_argument('--no-preview', action='store_true')
    parser.add_argument('--result')
    return parser.parse_args(argv)


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path: Path, data) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def write_text(path: Path, text: str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def sha256_file(path: Path) -> str | None:
    path = Path(path)
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0  # 不产生 .blend1 备份
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    # 资产预览只需稳定的轮廓与材质区分，降低采样以缩短批量生产时间。
    if hasattr(scene, 'eevee'):
        scene.eevee.taa_render_samples = 12
        scene.eevee.use_raytracing = False


def clear_previous_asset() -> None:
    """清掉上一个武器的几何，但保留材质/相机/灯光，避免每次重建着色器缓存。"""
    for obj in list(bpy.data.objects):
        if obj.name.startswith('WPN_') or obj.name.startswith('UCX_WPN_'):
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


# ---------------------------------------------------------------------------
# 材质
# ---------------------------------------------------------------------------
def ensure_materials(kit) -> dict:
    materials = {}
    for name, spec in kit.MATERIAL_LIBRARY.items():
        material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        material.use_nodes = True
        material.diffuse_color = spec['base_color']
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = spec['base_color']
        shader.inputs['Metallic'].default_value = spec['metallic']
        shader.inputs['Roughness'].default_value = spec['roughness']
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        materials[name] = material
    return materials


# ---------------------------------------------------------------------------
# 网格
# ---------------------------------------------------------------------------
def part_to_meshes(part, weapon_id: str, lod: int, materials: dict, collection) -> list:
    grouped: dict[str, list[int]] = {}
    for index, _face in enumerate(part.faces):
        grouped.setdefault(part.face_groups[index], []).append(index)

    objects = []
    for group in sorted(grouped):
        face_indexes = grouped[group]
        used = sorted({vertex for face_index in face_indexes for vertex in part.faces[face_index]})
        remap = {old: new for new, old in enumerate(used)}
        vertices = [part.vertices[index] for index in used]
        faces = [tuple(remap[vertex] for vertex in part.faces[face_index]) for face_index in face_indexes]

        material_names: list[str] = []
        for face_index in face_indexes:
            name = part.face_materials[face_index]
            if name not in material_names:
                material_names.append(name)
        slot_of = {name: position for position, name in enumerate(material_names)}

        mesh = bpy.data.meshes.new(f'WPN_{weapon_id}_LOD{lod}_{group}')
        mesh.from_pydata(vertices, [], faces)
        for name in material_names:
            mesh.materials.append(materials[name])
        for position, face_index in enumerate(face_indexes):
            mesh.polygons[position].material_index = slot_of[part.face_materials[face_index]]
        if group in SMOOTH_GROUPS:
            for polygon in mesh.polygons:
                polygon.use_smooth = True
        mesh.validate(verbose=False)
        mesh.update()

        obj = bpy.data.objects.new(mesh.name, mesh)
        obj['SDW_PART_GROUP'] = group
        obj['SDW_WEAPON_ID'] = weapon_id
        obj['SDW_LOD'] = lod
        collection.objects.link(obj)
        objects.append(obj)
    return objects


def build_collision_objects(spec: dict, kit, collection) -> list:
    weapon_id = spec['weapon_id']
    objects = []
    for segment in kit.build_collision(spec):
        centre = segment['centre']
        half = [component * 0.5 for component in segment['size']]
        vertices = [
            (centre[0] + sx * half[0], centre[1] + sy * half[1], centre[2] + sz * half[2])
            for sx in (-1, 1)
            for sy in (-1, 1)
            for sz in (-1, 1)
        ]
        name = f"UCX_WPN_{weapon_id}_{segment['name']}"
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], [list(face) for face in BOX_FACES])
        mesh.validate(verbose=False)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        obj['SDW_SEGMENT'] = segment['name']
        obj['SDW_WEAPON_ID'] = weapon_id
        collection.objects.link(obj)
        objects.append(obj)
    return objects


def mesh_stats(objects) -> dict:
    triangles = 0
    vertices = 0
    for obj in objects:
        mesh = obj.data
        vertices += len(mesh.vertices)
        triangles += sum(max(len(polygon.vertices) - 2, 0) for polygon in mesh.polygons)
    return {'objects': len(objects), 'vertices': vertices, 'triangles': triangles}


def collection_bounds(objects) -> dict:
    xs, ys, zs = [], [], []
    for obj in objects:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            xs.append(point.x)
            ys.append(point.y)
            zs.append(point.z)
    if not xs:
        return {}
    return {
        'x': [min(xs), max(xs)],
        'y': [min(ys), max(ys)],
        'z': [min(zs), max(zs)],
        'dimensions_m': [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
        'centre': [(min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5, (min(zs) + max(zs)) * 0.5],
    }


# ---------------------------------------------------------------------------
# FBX（UE4.27 管线）
# ---------------------------------------------------------------------------
def export_fbx(objects, filepath: Path) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=str(filepath),
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


# ---------------------------------------------------------------------------
# 预览渲染
# ---------------------------------------------------------------------------
def setup_studio(scene) -> None:
    world = bpy.data.worlds.get('SDW_WEAPON_WORLD') or bpy.data.worlds.new('SDW_WEAPON_WORLD')
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    if background:
        background.inputs['Color'].default_value = (0.05, 0.07, 0.10, 1.0)
        background.inputs['Strength'].default_value = 0.6

    if bpy.data.objects.get('SDW_CAM'):
        scene.camera = bpy.data.objects['SDW_CAM']
        return

    for name, vector, energy, size in (
        ('SDW_KEY', (2.2, -2.6, 2.4), 2600.0, 6.0),
        ('SDW_FILL', (-2.6, -2.0, 0.8), 900.0, 7.0),
        ('SDW_RIM', (-1.4, 2.8, 1.9), 1500.0, 5.0),
    ):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = vector
        scene.collection.objects.link(light)

    camera_data = bpy.data.cameras.new('SDW_CAM')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new('SDW_CAM', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera


def place_camera(camera, centre, direction, ortho_scale: float) -> None:
    vector = Vector(direction).normalized()
    camera.data.ortho_scale = ortho_scale
    camera.location = Vector(centre) + vector * max(ortho_scale, 1.0) * 3.0
    camera.rotation_euler = (-vector).to_track_quat('-Z', 'Y').to_euler()


def render_still(scene, path: Path, width: int, height: int) -> float:
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    return round(time.time() - started, 2)


def scale_to(source: Path, target: Path, size: int) -> None:
    image = bpy.data.images.load(str(source))
    image.scale(size, size)
    image.filepath_raw = str(target)
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def render_previews(scene, root: Path, bounds: dict) -> dict:
    preview = root / 'Preview'
    preview.mkdir(parents=True, exist_ok=True)
    weapon_id = root.name
    centre = bounds['centre']
    dimensions = bounds['dimensions_m']
    span = max(dimensions[0], dimensions[1] * 1.5, dimensions[2] * 1.5)
    camera = scene.camera
    timings = {}

    for view, direction in VIEW_DIRECTIONS.items():
        place_camera(camera, centre, direction, span * 1.28)
        scene.render.film_transparent = False
        target = preview / f'{weapon_id}_{view}_512.png'
        timings[view] = render_still(scene, target, 512, 512)
        for size in VIEW_SIZES[1:]:
            scale_to(target, preview / f'{weapon_id}_{view}_{size}.png', size)
        shutil.copyfile(target, preview / ALIAS_NAMES[view])

    # 细节视图：弹头方向的近景
    nose_centre = [centre[0] + dimensions[0] * 0.3, centre[1], centre[2]]
    place_camera(camera, nose_centre, (0.7, -1.0, 0.35), max(dimensions[0] * 0.55, 0.4))
    scene.render.film_transparent = False
    detail = preview / f'{weapon_id}_DETAIL_512.png'
    timings['DETAIL'] = render_still(scene, detail, 512, 512)
    for size in VIEW_SIZES[1:]:
        scale_to(detail, preview / f'{weapon_id}_DETAIL_{size}.png', size)
    shutil.copyfile(detail, preview / ALIAS_NAMES['DETAIL'])

    # 图标：透明背景的 3/4 视角
    place_camera(camera, centre, VIEW_DIRECTIONS['PERSPECTIVE'], span * 1.22)
    scene.render.film_transparent = True
    icon_base = preview / f'{weapon_id}_ICON_512.png'
    timings['ICON'] = render_still(scene, icon_base, 512, 512)
    for size in ICON_SIZES[1:]:
        scale_to(icon_base, preview / f'{weapon_id}_ICON_{size}.png', size)
    for size in ICON_SIZES:
        shutil.copyfile(preview / f'{weapon_id}_ICON_{size}.png', preview / f'Icon_{size}.png')
    return timings


# ---------------------------------------------------------------------------
# 文档输出
# ---------------------------------------------------------------------------
def write_spec(root: Path, spec: dict, report: dict, source: dict) -> Path:
    weapon_id = spec['weapon_id']
    payload = {
        'spec': 'SilentDepth_Weapon_Asset_Spec',
        'weapon_id': weapon_id,
        'display_name': spec['display_name'],
        'short_name': spec['short_name'],
        'country': spec['country'],
        'category': spec['category'],
        'family': spec['family_id'],
        'role': spec['role'],
        'subrole': spec['subrole'],
        'tier': spec['tier'],
        'tier_reason': spec['tier_reason'],
        'era': spec['era'],
        'service_years': spec['service_years'],
        'launch_methods': spec['launch_methods'],
        'dimensions': spec['dimensions'],
        'geometry': spec['geometry'],
        'asset_priority': spec['asset_priority'],
        'asset_paths': {
            'master': f'Blend/{weapon_id}_MASTER.blend',
            'lod': [f'LOD/{weapon_id}_LOD{index}.fbx' for index in LOD_LEVELS],
            'lod_fbx_mirror': [f'FBX/{weapon_id}_LOD{index}.fbx' for index in LOD_LEVELS],
            'collision': f'Collision/{weapon_id}_COLLISION.fbx',
            'collision_manifest': f'Collision/{weapon_id}_COLLISION.json',
            'source': f'Source/{weapon_id}_SOURCE.json',
            'preview_dir': 'Preview',
        },
        'lod_triangles': {key: value['triangles'] for key, value in report['lod'].items()},
        'collision_boxes': report['collision_boxes'],
        'materials': report['materials'],
        'generator': GENERATOR_VERSION,
        'blender_version': report['blender'],
        'built_length_m': report['built_length_m'],
        'built_max_diameter_m': report['built_max_diameter_m'],
        'scale_source': source['scale_source'],
        'scale_note': source['scale_note'],
        'note': '资产由公开外形参数程序化生成，仅用于游戏展示与科技树；不含任何工程细节。',
    }
    path = root / 'Documentation' / f'{weapon_id}_SPEC.json'
    write_json(path, payload)
    return path


def write_readme(root: Path, spec: dict, report: dict) -> Path:
    weapon_id = spec['weapon_id']
    dimensions = spec['dimensions']
    lines = [
        f"# {spec['display_name']}（{weapon_id}）",
        '',
        f"- 国家/地区：{spec['country']}",
        f"- 类别：{spec['category']}　家族：{spec['family_id']}",
        f"- 游戏 Tier：T{spec['tier']}　资产优先级：{spec['asset_priority']}",
        f"- 时代：{spec['era']}　服役：{spec['service_years']}",
        f"- 发射方式：{', '.join(spec['launch_methods'])}",
        f"- 外形尺寸：长 {dimensions['length_m']} m，直径 {dimensions['diameter_m']} m"
        f"（尺寸来源：{dimensions['scale_source']}）",
        '',
        '## 产出',
        '',
        f"- MASTER：`Blend/{weapon_id}_MASTER.blend`",
        f"- LOD：`LOD/{weapon_id}_LOD0..3.fbx`（`FBX/` 下保留同名副本）",
        f"- 碰撞：`Collision/{weapon_id}_COLLISION.fbx`",
        f"- 预览：`Preview/`（4 视角 + 细节 + 3 档图标）",
        f"- 配方：`Source/{weapon_id}_SOURCE.json`",
        f"- 构建报告：`Validation/{weapon_id}_BUILD.json`",
        '',
        '## 几何',
        '',
        f"- 几何类型：{spec['geometry']['kind']}",
        f"- 外形特征：{', '.join(spec['geometry'].get('features', [])) or '无'}",
        f"- LOD0 三角面：{report['lod']['LOD0']['triangles']}　"
        f"LOD3 三角面：{report['lod']['LOD3']['triangles']}",
        f"- 生成器：{GENERATOR_VERSION}（Blender {report['blender']}）",
        '',
        '> 本资产只包含公开资料可见的外部外形与游戏数据，不含任何武器内部工程、装药或制造信息。',
        '',
    ]
    path = root / 'Documentation' / f'{weapon_id}_README.md'
    write_text(path, '\n'.join(lines))
    return path


def write_collision_manifest(root: Path, spec: dict, kit, collision_path: Path) -> Path:
    weapon_id = spec['weapon_id']
    segments = [
        {'name': f"UCX_WPN_{weapon_id}_{segment['name']}",
         'centre': list(segment['centre']),
         'size': list(segment['size'])}
        for segment in kit.build_collision(spec)
    ]
    path = root / 'Collision' / f'{weapon_id}_COLLISION.json'
    write_json(path, {
        'weapon_id': weapon_id,
        'shape_policy': '低模凸包（长方体分段），不使用高模渲染网格作为碰撞。',
        'units': 'meters',
        'segments': segments,
        'collision_fbx': collision_path.name,
        'collision_sha256': sha256_file(collision_path),
    })
    return path


# ---------------------------------------------------------------------------
# 单个武器
# ---------------------------------------------------------------------------
def build_weapon(weapons_root: Path, kit, spec: dict, category_dirs: dict, render: bool) -> dict:
    weapon_id = spec['weapon_id']
    root = weapons_root / category_dirs[spec['category']] / weapon_id
    for directory in ASSET_DIRS:
        (root / directory).mkdir(parents=True, exist_ok=True)

    started = time.time()
    clear_previous_asset()
    scene = bpy.context.scene
    materials = ensure_materials(kit)

    root_collection = bpy.data.collections.new(f'WPN_{weapon_id}')
    scene.collection.children.link(root_collection)
    lod_collections = {}
    for lod in LOD_LEVELS:
        collection = bpy.data.collections.new(f'90_LOD_LOD{lod}')
        root_collection.children.link(collection)
        lod_collections[lod] = collection
    collision_collection = bpy.data.collections.new('99_COLLISION')
    root_collection.children.link(collision_collection)

    lod_objects = {}
    lod_stats = {}
    for lod in LOD_LEVELS:
        part = kit.build_geometry(spec, detail=lod)
        objects = part_to_meshes(part, weapon_id, lod, materials, lod_collections[lod])
        lod_objects[lod] = objects
        lod_stats[f'LOD{lod}'] = mesh_stats(objects)

    collision_objects = build_collision_objects(spec, kit, collision_collection)
    collision_stats = mesh_stats(collision_objects)
    bounds = collection_bounds(lod_objects[0])

    blend_path = root / 'Blend' / f'{weapon_id}_MASTER.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    lod_exports = {}
    for lod in LOD_LEVELS:
        lod_path = root / 'LOD' / f'{weapon_id}_LOD{lod}.fbx'
        export_fbx(lod_objects[lod], lod_path)
        mirror = root / 'FBX' / f'{weapon_id}_LOD{lod}.fbx'
        shutil.copyfile(lod_path, mirror)
        digest = sha256_file(lod_path)
        if sha256_file(mirror) != digest:
            raise RuntimeError(f'{weapon_id}: FBX 镜像副本不一致')
        lod_exports[f'LOD{lod}'] = {
            'path': f'LOD/{lod_path.name}',
            'mirror': f'FBX/{mirror.name}',
            'sha256': digest,
            'fbx_binary_version': FBX_BINARY_VERSION,
        }

    collision_path = root / 'Collision' / f'{weapon_id}_COLLISION.fbx'
    export_fbx(collision_objects, collision_path)

    source = {
        'weapon_id': weapon_id,
        'generator': GENERATOR_VERSION,
        'blender_version': bpy.app.version_string,
        'coordinate_frame': '弹头 +X，Y 左右，Z 上；单位为米。',
        'geometry': spec['geometry'],
        'dimensions': spec['dimensions'],
        'launch_methods': spec['launch_methods'],
        'tier': spec['tier'],
        'asset_priority': spec['asset_priority'],
        'scale_source': spec['dimensions']['scale_source'],
        'scale_note': spec['dimensions'].get('scale_note', ''),
        'note': '几何由公开外形参数程序化生成；不含任何内部工程或制造信息。',
    }
    source_path = root / 'Source' / f'{weapon_id}_SOURCE.json'
    write_json(source_path, source)

    report = {
        'weapon_id': weapon_id,
        'generator': GENERATOR_VERSION,
        'blender': bpy.app.version_string,
        'geometry_kind': spec['geometry']['kind'],
        'declared_length_m': spec['dimensions']['length_m'],
        'declared_diameter_m': spec['dimensions']['diameter_m'],
        'built_length_m': round(bounds['dimensions_m'][0], 6),
        'built_max_diameter_m': round(max(bounds['dimensions_m'][1], bounds['dimensions_m'][2]), 6),
        'lod': lod_stats,
        'collision': collision_stats,
        'collision_boxes': collision_stats['objects'],
        'collision_segments': [obj.name for obj in collision_objects],
        'bounds': bounds,
        'materials': sorted(kit.MATERIAL_LIBRARY),
        'exports': {
            'lod': lod_exports,
            'collision': {
                'path': f'Collision/{collision_path.name}',
                'sha256': sha256_file(collision_path),
            },
        },
        'build_seconds': round(time.time() - started, 2),
    }

    collision_manifest = write_collision_manifest(root, spec, kit, collision_path)
    report['exports']['collision_manifest'] = {
        'path': f'Collision/{collision_manifest.name}',
        'sha256': sha256_file(collision_manifest),
    }

    if render:
        setup_studio(scene)
        report['preview_seconds'] = render_previews(scene, root, bounds)
        report['previews'] = sorted(path.name for path in (root / 'Preview').glob('*.png'))

    write_spec(root, spec, report, source)
    write_readme(root, spec, report)
    report['files'] = {
        'blend': {'path': f'Blend/{blend_path.name}', 'sha256': sha256_file(blend_path)},
        'source': {'path': f'Source/{source_path.name}', 'sha256': sha256_file(source_path)},
        'spec': {'path': f'Documentation/{weapon_id}_SPEC.json'},
        'readme': {'path': f'Documentation/{weapon_id}_README.md'},
    }
    write_json(root / 'Validation' / f'{weapon_id}_BUILD.json', report)
    return report


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
def main() -> int:
    args = parse_args()
    job = read_json(args.job)
    weapons_root = Path(args.root).resolve()
    tools_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(tools_dir))

    import weapon_dataset as dataset  # noqa: E402
    import weapon_geometry_kit as kit  # noqa: E402
    from sdw_common import CATEGORY_DIR  # noqa: E402

    category_dirs = dict(CATEGORY_DIR)
    category_dirs.update(job.get('category_dirs') or {})

    def resolve_spec(job_spec: dict) -> dict:
        """job 里缺字段时用数据集补全，数据集始终是唯一事实来源。"""
        authority = dataset.VARIANTS_BY_ID.get(job_spec.get('weapon_id', ''))
        if authority is None:
            return job_spec
        merged = dict(authority)
        merged.update({key: value for key, value in job_spec.items() if value is not None})
        params = merged['geometry'].get('params') or {}
        merged.setdefault('body_diameter_m', params.get('body_diameter_m') or merged['dimensions']['diameter_m'])
        return merged

    render = not args.no_preview
    reset_scene()
    results = []
    for job_spec in job['weapons']:
        spec = resolve_spec(job_spec)
        weapon_id = spec['weapon_id']
        try:
            report = build_weapon(weapons_root, kit, spec, category_dirs, render)
            results.append({
                'weapon_id': weapon_id,
                'status': 'OK',
                'stats': {
                    'lod': report['lod'],
                    'collision_boxes': report['collision_boxes'],
                    'build_seconds': report['build_seconds'],
                },
            })
            print(f"SDW_BUILT {weapon_id} LOD0={report['lod']['LOD0']['triangles']} "
                  f"LOD3={report['lod']['LOD3']['triangles']} t={report['build_seconds']}s", flush=True)
        except Exception as error:  # noqa: BLE001 - 单个武器失败不终止批次
            results.append({
                'weapon_id': weapon_id,
                'status': 'FAILED',
                'error': f'{type(error).__name__}: {error}',
                'traceback': traceback.format_exc()[-2000:],
            })
            print(f'SDW_FAILED {weapon_id} {type(error).__name__}: {error}', flush=True)

    payload = json.dumps(results, ensure_ascii=False)
    if args.result:
        write_json(Path(args.result), results)
    print(f'WPN_BATCH_RESULT={payload}', flush=True)
    built = sum(1 for item in results if item['status'] == 'OK')
    print(f'SDW_BATCH_DONE built={built} failed={len(results) - built}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
