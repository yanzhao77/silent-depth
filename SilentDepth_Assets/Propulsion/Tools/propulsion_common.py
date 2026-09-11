"""推进系统几何工厂的共享模块。

本模块只在 Blender 内运行（依赖 bpy / mathutils）。所有尺寸单位为米，
坐标约定与 Typhoon 母版一致：+X 指向艏部，Z 轴向上，Y 轴指向右舷。
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

TAU = math.tau

# 由 Typhoon 母版实测抽取的 LOD 比例（1 / 0.50 / 0.22 / 0.085）。
LOD_PROFILE = {
    0: {'blade_radial': 14, 'blade_chordwise': 12, 'duct_segments': 32, 'hub_segments': 24},
    1: {'blade_radial': 10, 'blade_chordwise': 8, 'duct_segments': 24, 'hub_segments': 20},
    2: {'blade_radial': 7, 'blade_chordwise': 5, 'duct_segments': 16, 'hub_segments': 12},
    3: {'blade_radial': 4, 'blade_chordwise': 3, 'duct_segments': 12, 'hub_segments': 8},
}

# 基准色为线性空间，与 Typhoon 的 Propeller 材质保持一致的观感。
MATERIALS = {
    'M_Propulsor_Blade': {'base_color_linear': [0.250, 0.180, 0.075], 'roughness': 0.43, 'metallic': 0.84},
    'M_Propulsor_Hub': {'base_color_linear': [0.190, 0.230, 0.250], 'roughness': 0.40, 'metallic': 0.82},
    'M_Propulsor_Duct': {'base_color_linear': [0.105, 0.130, 0.145], 'roughness': 0.64, 'metallic': 0.35},
    'M_Propulsor_Rubber': {'base_color_linear': [0.018, 0.027, 0.035], 'roughness': 0.83, 'metallic': 0.08},
}

FORBIDDEN_OBJECT_NAMES = {'Cube', 'Object', 'Cylinder', 'Plane', 'Sphere', 'Torus', 'Cone'}

# 每个 LOD 的比例上限，校验器据此判断是否单调递减。
MAX_LOD_RATIO = {1: 0.60, 2: 0.35, 3: 0.15}

# 轴系是简单回转体，面数几乎完全由周向分段决定，
# 因此单独给一档更陡的分段序列，保证 LOD 比例落在模板要求的区间内。
SHAFT_LOD_SEGMENTS = {0: 32, 1: 16, 2: 8, 3: 4}

PREVIEW_VIEWS = {
    'ThreeQuarter': (1.75, -1.75, 0.95),
    'Side': (0.0, -3.0, 0.15),
    'Rear': (-2.6, 0.0, 0.35),
    'Top': (0.15, -0.55, 3.0),
}

STUDIO_LENS_MM = 50.0
STUDIO_DISTANCE_FACTOR = 5.6


def prop_root() -> Path:
    return Path(__file__).resolve().parents[1]


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def fbx_version_of(path) -> int | None:
    """读取 FBX 头部，返回二进制版本号；非二进制 FBX 返回 None。"""
    with open(path, 'rb') as handle:
        header = handle.read(27)
        if len(header) < 27 or b'Kaydara FBX Binary' not in header[:23]:
            return None
        return int.from_bytes(header[23:27], 'little')


# --------------------------------------------------------------------------
# 场景与集合
# --------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'
    return scene


def ensure_collection(name, parent=None):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    target = parent if parent is not None else bpy.context.scene.collection
    if collection.name not in {child.name for child in target.children}:
        target.children.link(collection)
    return collection


def link_object(obj, collection):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------
# 材质
# --------------------------------------------------------------------------

def make_materials():
    materials = {}
    for name, spec in MATERIALS.items():
        material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        rgba = list(spec['base_color_linear']) + [1.0]
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = spec['roughness']
        bsdf.inputs['Metallic'].default_value = spec['metallic']
        material.diffuse_color = rgba
        material.roughness = spec['roughness']
        material.metallic = spec['metallic']
        materials[name] = material
    return materials


# --------------------------------------------------------------------------
# 网格构造
# --------------------------------------------------------------------------

def assign_cylindrical_uvs(mesh):
    """按柱坐标给出确定性的 UV，避免依赖 Blender 的交互式展开算子。"""
    layer = mesh.uv_layers.new(name='UV0')
    xs = [vertex.co.x for vertex in mesh.vertices]
    minimum, maximum = min(xs), max(xs)
    span = max(maximum - minimum, 1e-6)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            coordinate = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            u = (math.atan2(coordinate.z, coordinate.y) / TAU) + 0.5
            v = (coordinate.x - minimum) / span
            layer.data[loop_index].uv = (u, v)


def make_mesh_object(name, vertices, faces, material, collection, smooth=True, custom_props=None):
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], [list(face) for face in faces])
    mesh.validate(verbose=False)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    assign_cylindrical_uvs(mesh)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    if custom_props:
        for key, value in custom_props.items():
            obj[key] = value
    return obj


def revolve_x(profile, segments, closed_profile=False):
    """把 (x, r) 剖面绕 X 轴旋转成回转体。r≈0 的点会退化为极点。"""
    vertices = []
    rings = []
    for x, radius in profile:
        if radius <= 1e-6:
            vertices.append((x, 0.0, 0.0))
            rings.append(('pole', len(vertices) - 1))
            continue
        ring = []
        for step in range(segments):
            angle = TAU * step / segments
            vertices.append((x, radius * math.cos(angle), radius * math.sin(angle)))
            ring.append(len(vertices) - 1)
        rings.append(('ring', ring))
    faces = []
    for index in range(len(rings) - 1):
        kind_a, data_a = rings[index]
        kind_b, data_b = rings[index + 1]
        if kind_a == 'pole' and kind_b == 'ring':
            for step in range(segments):
                faces.append((data_a, data_b[step], data_b[(step + 1) % segments]))
        elif kind_a == 'ring' and kind_b == 'pole':
            for step in range(segments):
                faces.append((data_a[step], data_b, data_a[(step + 1) % segments]))
        elif kind_a == 'ring' and kind_b == 'ring':
            for step in range(segments):
                nxt = (step + 1) % segments
                faces.append((data_a[step], data_a[nxt], data_b[nxt], data_b[step]))
    if closed_profile and rings[0][0] == 'ring' and rings[-1][0] == 'ring':
        first = rings[0][1]
        last = rings[-1][1]
        for step in range(segments):
            nxt = (step + 1) % segments
            faces.append((last[step], last[nxt], first[nxt], first[step]))
    return vertices, faces


def cylinder_x(x_start, x_end, radius, segments, taper_end=None):
    taper = radius if taper_end is None else taper_end
    profile = [(x_start, 0.0), (x_start, radius), (x_end, taper), (x_end, 0.0)]
    return revolve_x(profile, segments)


def box_mesh(center, size):
    cx, cy, cz = center
    sx, sy, sz = (component / 2.0 for component in size)
    vertices = [
        (cx - sx, cy - sy, cz - sz),
        (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy + sy, cz + sz),
        (cx - sx, cy - sy, cz + sz),
        (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz),
        (cx + sx, cy + sy, cz + sz),
        (cx + sx, cy - sy, cz + sz),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    return vertices, faces


def _lerp_table(table, x):
    """按控制点线性插值。table 形如 [(x0, v0), (x1, v1), ...]，x 单调递增。"""
    if x <= table[0][0]:
        return table[0][1]
    if x >= table[-1][0]:
        return table[-1][1]
    for index in range(len(table) - 1):
        x0, v0 = table[index]
        x1, v1 = table[index + 1]
        if x0 <= x <= x1:
            ratio = (x - x0) / max(x1 - x0, 1e-9)
            return v0 + (v1 - v0) * ratio
    return table[-1][1]


CHORD_TABLE = [(0.0, 0.58), (0.2, 0.94), (0.45, 1.0), (0.75, 0.72), (1.0, 0.26)]
THICKNESS_TABLE = [(0.0, 1.35), (0.6, 1.0), (1.0, 0.45)]


def naca_thickness(u, thickness_ratio):
    """NACA 四位数对称厚度分布（后缘闭合）。u 为弦向位置 0→1。"""
    u = min(max(u, 1e-5), 1.0)
    return (
        5.0 * thickness_ratio
        * (0.2969 * math.sqrt(u) - 0.1260 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4)
    )


def camber_line(u):
    m, p = 0.04, 0.35
    if u < p:
        return m / (p ** 2) * (2 * p * u - u ** 2)
    return m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * u - u ** 2)


def blade_section_loop(chordwise):
    """返回闭合剖面环的弦向参数序列（上表面 0→1，再下表面 1→0）。"""
    upper = [index / chordwise for index in range(chordwise + 1)]
    lower = [1.0 - index / chordwise for index in range(chordwise + 1)]
    return upper + lower[1:-1]


def build_blade(params, lod, blade_index, blade_count, root_radius, tip_radius, pitch_sign=-1.0):
    """生成一片桨叶的曲面。返回 (vertices, faces)。"""
    profile = LOD_PROFILE[lod]
    radial = profile['blade_radial']
    chordwise = profile['blade_chordwise']

    diameter = params['main_diameter_m']
    pitch = params.get('pitch_ratio', 1.0) * diameter
    skew_deg = params.get('skew_deg', 0.0)
    rake = params.get('rake_m', 0.0)
    thickness_ratio = params.get('blade_thickness_ratio', 0.055)
    max_chord = diameter * 0.26
    theta0 = TAU * blade_index / blade_count

    loop = blade_section_loop(chordwise)
    vertices = []
    for station in range(radial + 1):
        x_norm = station / radial
        radius = root_radius + (tip_radius - root_radius) * x_norm
        chord = max_chord * _lerp_table(CHORD_TABLE, x_norm)
        thickness = thickness_ratio * _lerp_table(THICKNESS_TABLE, x_norm)
        skew = math.radians(skew_deg) * (x_norm ** 2)
        theta = theta0 + skew
        pitch_angle = math.atan2(pitch, TAU * max(radius, 1e-3))
        axial = -rake * (x_norm ** 1.5)

        radial_dir = Vector((0.0, math.cos(theta), math.sin(theta)))
        tangent_dir = Vector((0.0, -math.sin(theta), math.cos(theta)))
        chord_dir = pitch_sign * math.sin(pitch_angle) * Vector((1.0, 0.0, 0.0)) + math.cos(pitch_angle) * tangent_dir
        chord_dir.normalize()
        normal_dir = radial_dir.cross(chord_dir)
        normal_dir.normalize()

        for u in loop:
            thickness_offset = naca_thickness(u, thickness) * chord
            camber_offset = camber_line(u) * chord
            position = (
                radial_dir * radius
                + chord_dir * ((u - 0.5) * chord)
                + normal_dir * (camber_offset + thickness_offset)
                + Vector((axial, 0.0, 0.0))
            )
            vertices.append((position.x, position.y, position.z))

    ring_size = len(loop)
    faces = []
    for station in range(radial):
        base_a = station * ring_size
        base_b = (station + 1) * ring_size
        for index in range(ring_size):
            nxt = (index + 1) % ring_size
            faces.append((base_a + index, base_a + nxt, base_b + nxt, base_b + index))

    # 叶根与叶尖用三角扇封口，避免 n-gon 在 FBX 里无法计算切线空间。
    root_center = len(vertices)
    vertices.append(tuple(sum(vertex[axis] for vertex in vertices[:ring_size]) / ring_size for axis in range(3)))
    for index in range(ring_size):
        nxt = (index + 1) % ring_size
        faces.append((root_center, nxt, index))
    tip_base = radial * ring_size
    tip_center = len(vertices)
    vertices.append(tuple(
        sum(vertices[tip_base + index][axis] for index in range(ring_size)) / ring_size
        for axis in range(3)
    ))
    for index in range(ring_size):
        nxt = (index + 1) % ring_size
        faces.append((tip_center, tip_base + index, tip_base + nxt))
    return vertices, faces


def build_vane(params, lod, index, count, root_radius, tip_radius, pitch_deg):
    vane_params = dict(params)
    vane_params['blade_count'] = count
    vane_params['skew_deg'] = 0.0
    vane_params['rake_m'] = 0.0
    vane_params['pitch_ratio'] = math.tan(math.radians(pitch_deg)) * TAU * tip_radius / params['main_diameter_m'] / TAU
    vane_params['blade_thickness_ratio'] = params.get('blade_thickness_ratio', 0.06) * 1.1
    return build_blade(vane_params, lod, index, count, root_radius, tip_radius)


# --------------------------------------------------------------------------
# 插槽与摄影棚
# --------------------------------------------------------------------------

def create_socket(name, location, collection):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'ARROWS'
    obj.empty_display_size = 0.6
    obj.location = Vector(location)
    collection.objects.link(obj)
    obj['socket_role'] = name
    return obj


def setup_studio(bounding_radius, center_x=0.0):
    studio = ensure_collection('STUDIO_NOT_FOR_EXPORT')
    scene = bpy.context.scene

    scale_reference_vertices, scale_reference_faces = box_mesh(
        (center_x + bounding_radius * 1.05, 0.0, -bounding_radius * 0.95), (1.0, 1.0, 1.0)
    )
    reference = make_mesh_object(
        'SCALE_REFERENCE_1M', scale_reference_vertices, scale_reference_faces,
        None, studio, smooth=False,
    )
    reference['not_for_export'] = True

    world = bpy.data.worlds.new('PropulsionWorld') if bpy.data.worlds.get('PropulsionWorld') is None else bpy.data.worlds['PropulsionWorld']
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.020, 0.048, 0.070, 1.0)
    background.inputs['Strength'].default_value = 1.0

    light_specs = [
        ('STUDIO_KEY', (1.6, -1.3, 1.5), 3600.0, 2.6),
        ('STUDIO_FILL', (-1.4, -1.2, 0.6), 1500.0, 3.4),
        ('STUDIO_RIM', (-1.2, 1.5, 1.1), 2400.0, 2.8),
    ]
    for name, direction, power, size in light_specs:
        light_data = bpy.data.lights.new(name, type='AREA')
        light_data.energy = power
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        distance = bounding_radius * 2.6
        light.location = Vector((center_x + direction[0] * distance, direction[1] * distance, direction[2] * distance))
        direction_vector = (Vector((center_x, 0.0, 0.0)) - light.location).normalized()
        light.rotation_euler = direction_vector.to_track_quat('-Z', 'Y').to_euler()
        studio.objects.link(light)
        light['not_for_export'] = True

    camera_data = bpy.data.cameras.new('STUDIO_CAMERA')
    camera_data.lens = STUDIO_LENS_MM
    camera = bpy.data.objects.new('STUDIO_CAMERA', camera_data)
    studio.objects.link(camera)
    camera['not_for_export'] = True
    scene.camera = camera
    return {'studio': studio, 'camera': camera, 'reference': reference}


def aim_camera(camera, direction, distance, center_x, bounding_radius):
    target = Vector((center_x, 0.0, 0.0))
    camera.location = target + Vector(direction).normalized() * (bounding_radius * STUDIO_DISTANCE_FACTOR * distance)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = STUDIO_LENS_MM


def analyze_render(path, sample_step=3):
    """读取渲染结果，给出非背景像素比例与平均亮度，用于自动化检查取景是否有效。"""
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = list(image.pixels)
    background = pixels[0:3]
    total = 0
    non_background = 0
    luminance_sum = 0.0
    for y in range(0, height, sample_step):
        for x in range(0, width, sample_step):
            offset = (y * width + x) * 4
            r, g, b = pixels[offset], pixels[offset + 1], pixels[offset + 2]
            luminance_sum += (r + g + b) / 3.0
            if abs(r - background[0]) + abs(g - background[1]) + abs(b - background[2]) > 0.06:
                non_background += 1
            total += 1
    bpy.data.images.remove(image)
    return {
        'non_background_fraction': round(non_background / max(total, 1), 4),
        'mean_luminance': round(luminance_sum / max(total, 1), 4),
        'resolution': [width, height],
    }


def render_previews(asset_id, out_dir, center_x, bounding_radius, samples=24, resolution=(800, 450)):
    studio = setup_studio(bounding_radius, center_x)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Filmic'

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for view, direction in PREVIEW_VIEWS.items():
        aim_camera(studio['camera'], direction, 1.0, center_x, bounding_radius)
        path = out_dir / f'{asset_id}_{view}.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        written.append({'file': str(path), 'view': view, **analyze_render(path)})
    return written


# --------------------------------------------------------------------------
# 导出与测量
# --------------------------------------------------------------------------

FBX_EXPORT_ARGS = {
    'object_types': {'MESH'},
    'global_scale': 1.0,
    'apply_unit_scale': True,
    'apply_scale_options': 'FBX_SCALE_UNITS',
    'axis_forward': '-Y',
    'axis_up': 'Z',
    'use_space_transform': True,
    'bake_space_transform': False,
    'use_mesh_modifiers': True,
    'mesh_smooth_type': 'FACE',
    'use_tspace': True,
    'add_leaf_bones': False,
    'bake_anim': False,
    'path_mode': 'STRIP',
    'embed_textures': False,
}


def export_selection(objects, filepath):
    """按 UE4.27 约定导出：几何写入厘米，节点单位标记保持 FBX 单位制。

    Typhoon 母版导出的 FBX 顶点值就是厘米（175 m 艇长写成 ±87.5 左右），
    工程里既有资产也是按这个约定 1:1 导入的，因此推进资产沿用同一约定。
    这里用临时副本做缩放，绝不改动工作场景里的原始网格。
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    if filepath.exists():
        filepath.unlink()

    temp_collection = ensure_collection('EXPORT_TEMP_CM')
    exported = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        # UE 的 UCX 识别看的是 FBX 里的网格节点名，因此让网格数据名跟对象名一致。
        duplicate.data.name = duplicate.name
        for vertex in duplicate.data.vertices:
            vertex.co = Vector((vertex.co.x * 100.0, vertex.co.y * 100.0, vertex.co.z * 100.0))
        duplicate.location = Vector((obj.location.x * 100.0, obj.location.y * 100.0, obj.location.z * 100.0))
        duplicate.scale = (1.0, 1.0, 1.0)
        temp_collection.objects.link(duplicate)
        exported.append(duplicate)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in exported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = exported[0]
    bpy.ops.export_scene.fbx(filepath=str(filepath), use_selection=True, **FBX_EXPORT_ARGS)
    bpy.ops.object.select_all(action='DESELECT')

    for duplicate in exported:
        mesh = duplicate.data
        bpy.data.objects.remove(duplicate, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    return filepath


def export_combined_fbx(asset_id, visible_objects, filepath):
    """导出 UE 用的合并 FBX：把 LOD0 的各个部件合并成单一网格 <ASSET_ID>。

    碰撞凸包单独导出（见 export_collision_hulls），因为 UE4.27 在脚本化导入时
    会把文件里的 UCX_ 对象当成可见几何，而不是自动转成简单碰撞。
    """
    temp_collection = ensure_collection('EXPORT_TEMP_JOIN')
    visible_duplicates = []
    for obj in visible_objects:
        if obj.type != 'MESH':
            continue
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        duplicate.data.name = duplicate.name
        temp_collection.objects.link(duplicate)
        visible_duplicates.append(duplicate)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in visible_duplicates:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = visible_duplicates[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = asset_id

    export_selection([joined], filepath)

    mesh = joined.data
    bpy.data.objects.remove(joined, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return filepath


def export_collision_hulls(objects, filepath, asset_id):
    """导出可被 UE 当普通网格导入的碰撞凸包，命名 COL_<ASSET_ID>_<NN>。"""
    temp_collection = ensure_collection('EXPORT_TEMP_HULLS')
    duplicates = []
    for index, obj in enumerate(sorted(objects, key=lambda item: item.name)):
        if obj.type != 'MESH':
            continue
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        duplicate.name = f'COL_{asset_id}_{index:02d}'
        duplicate.data.name = duplicate.name
        temp_collection.objects.link(duplicate)
        duplicates.append(duplicate)
    export_selection(duplicates, filepath)
    for obj in duplicates:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    return filepath


def measure_selection(objects):
    bounds = []
    triangles = 0
    vertices = 0
    materials = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        vertices += len(mesh.vertices)
        triangles += sum(max(len(poly.vertices) - 2, 0) for poly in mesh.polygons)
        for corner in obj.bound_box:
            bounds.append(obj.matrix_world @ Vector(corner))
        for slot in obj.material_slots:
            if slot.material and slot.material.name not in materials:
                materials.append(slot.material.name)
    if not bounds:
        return {'vertices': 0, 'triangles': 0, 'dimensions_m': [0.0, 0.0, 0.0]}
    xs = [point.x for point in bounds]
    ys = [point.y for point in bounds]
    zs = [point.z for point in bounds]
    return {
        'vertices': vertices,
        'triangles': triangles,
        'dimensions_m': [round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4)],
        'materials': materials,
    }


def import_fbx_report(filepath):
    """把 FBX 重新导入空场景，返回实测尺寸与版本，作为往返证据。

    FBX 里的几何按厘米写出（与 Typhoon 母版一致），因此导入时用 0.01 的全局缩放
    把它换回米，得到的尺寸才能和 Blender 里的建模尺寸直接比对。
    """
    path = Path(filepath)
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path), global_scale=0.01, use_anim=False)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    measured = measure_selection(meshes)
    return {
        'file': str(path),
        'fbx_binary_version': fbx_version_of(path),
        'roundtrip_dimensions_m': measured['dimensions_m'],
        'roundtrip_triangles': measured['triangles'],
        'roundtrip_objects': len(meshes),
    }


def convex_hull_object(name, vertices, material, collection):
    mesh = bpy.data.meshes.new(f'{name}_mesh')
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], [])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate(verbose=False)
    mesh.update()
    if material is not None:
        mesh.materials.append(material)
    return obj
