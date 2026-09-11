#!/usr/bin/env python3
"""传感器外形构建器（必须在 Blender 内运行）。

只按公开外形与游戏代表性外形建几何，不建真实内部结构（任务书 §9）。
所有尺寸单位为米，+X 为艇艏方向，Z 向上，与潜艇资产模板一致。

每个构建器接收 `(spec, detail)`，返回 `(objects, socket_point, note)`：

* `spec`：`sensor_dataset_assets.CORE_ASSETS` 中的条目。
* `detail`：细分档位 0–3（LOD0 最细，LOD3 仅保留轮廓）。
"""
from __future__ import annotations

import math

import bpy

from sensor_dataset_assets import MATERIALS

def segments(detail: int, base: int = 32) -> int:
    """按 detail 档位返回圆周细分，必须严格随档位递减以保住 LOD 单调性。"""
    table = {0: base, 1: max(8, base // 2), 2: max(6, base // 3), 3: 6}
    return table.get(detail, base)


def ensure_materials() -> dict[str, bpy.types.Material]:
    materials: dict[str, bpy.types.Material] = {}
    for spec in MATERIALS:
        material = bpy.data.materials.get(spec['material_id'])
        if material is None:
            material = bpy.data.materials.new(spec['material_id'])
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        if bsdf is not None:
            bsdf.inputs['Base Color'].default_value = tuple(spec['base_color'])
            bsdf.inputs['Metallic'].default_value = spec['metallic']
            bsdf.inputs['Roughness'].default_value = spec['roughness']
        material.diffuse_color = tuple(spec['base_color'])
        materials[spec['material_id']] = material
    return materials


def _finish(obj: bpy.types.Object, material: bpy.types.Material | None) -> bpy.types.Object:
    if material is not None:
        obj.data.materials.append(material)
    bpy.ops.object.shade_flat()
    return obj


def cyl(name, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=32, material=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=max(4, verts), radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, material)


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, material)


def sphere(name, radius, loc=(0, 0, 0), segments_v=24, rings=16, scale=(1, 1, 1), material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=max(6, segments_v), ring_count=max(4, rings),
                                         radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, material)


def cone(name, r1, r2, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=24, material=None):
    bpy.ops.mesh.primitive_cone_add(vertices=max(4, verts), radius1=r1, radius2=r2,
                                    depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, material)


def torus(name, major, minor, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=32, minor_segments=8,
                                     location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, material)


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def planar_tiles(prefix, rows, cols, spacing, tile_radius, tile_depth, origin, material):
    """在 +X 朝向的平面上铺开阵元块。"""
    objects = []
    y0 = -(cols - 1) * spacing / 2.0
    z0 = -(rows - 1) * spacing / 2.0
    for row in range(rows):
        for col in range(cols):
            obj = cyl(
                f'{prefix}_{row}_{col}', tile_radius, tile_depth,
                loc=(origin[0], origin[1] + y0 + col * spacing, origin[2] + z0 + row * spacing),
                rot=(0, math.pi / 2, 0), verts=12, material=material)
            objects.append(obj)
    return objects


def ring_tiles(prefix, radius, count, tile_radius, tile_depth, origin, material):
    objects = []
    for index in range(count):
        angle = 2 * math.pi * index / count
        obj = cyl(
            f'{prefix}_r{index}', tile_radius, tile_depth,
            loc=(origin[0], origin[1] + radius * math.cos(angle), origin[2] + radius * math.sin(angle)),
            rot=(0, math.pi / 2, 0), verts=10, material=material)
        objects.append(obj)
    return objects


# --- 外形构建器 ---------------------------------------------------------

def build_hydrophone_pair(spec, detail, mats):
    d = spec['dimensions_m']
    plate = box('PLATE', (d['length'], d['diameter'], 0.10), (0, 0, 0), material=mats['SEN_MAT_Hull'])
    objects = [plate]
    count = 3 if detail <= 1 else 0
    for index in range(count):
        offset = (index - (count - 1) / 2.0) * (d['length'] * 0.32)
        objects.append(cyl(
            f'HYDRO_{index}', d['diameter'] * 0.35, 0.30, (offset, 0, 0.18),
            (0, math.pi / 2, 0), verts=segments(detail, 16), material=mats['SEN_MAT_ArrayFace']))
    return objects, (0, 0, 0), '舷侧水听器外形'


def build_bow_dome_sphere(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    dome = sphere('DOME', radius, (-d['length'] * 0.35, 0, 0),
                  segments(detail, 24), max(8, 18 - detail * 4), (1.0, 1.0, 1.0),
                  material=mats['SEN_MAT_Hull'])
    face = cyl('FACE', radius * 0.82, 0.18, (d['length'] * 0.30, 0, 0),
               (0, math.pi / 2, 0), verts=segments(detail, 40), material=mats['SEN_MAT_ArrayFace'])
    rim = torus('RIM', radius * 0.92, radius * 0.06, (d['length'] * 0.28, 0, 0),
                (0, math.pi / 2, 0), material=mats['SEN_MAT_DarkMetal'])
    objects = [dome, face, rim]
    if detail == 0:
        objects += ring_tiles('TILE', radius * 0.45, 12, 0.14, 0.10, (d['length'] * 0.34, 0, 0), mats['SEN_MAT_ArrayFace'])
        objects += ring_tiles('TILEO', radius * 0.72, 16, 0.12, 0.10, (d['length'] * 0.34, 0, 0), mats['SEN_MAT_ArrayFace'])
    return objects, (d['length'] * 0.30, 0, 0), '艇艏球形阵（公开外形）'


def build_bow_dome_cylinder(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    body = cyl('BODY', radius, d['length'], (0, 0, 0), (0, math.pi / 2, 0),
               verts=segments(detail, 40), material=mats['SEN_MAT_Hull'])
    face = cyl('FACE', radius * 0.92, 0.16, (d['length'] / 2 + 0.06, 0, 0),
               (0, math.pi / 2, 0), verts=segments(detail, 40), material=mats['SEN_MAT_ArrayFace'])
    objects = [body, face]
    if detail <= 1:
        for ring in range(2):
            objects += ring_tiles(
                f'TILE{ring}', radius * (0.40 + ring * 0.30), 10 + ring * 6, 0.13, 0.09,
                (d['length'] / 2 + 0.14, 0, 0), mats['SEN_MAT_ArrayFace'])
    return objects, (d['length'] / 2, 0, 0), '艇艏柱形阵（公开外形）'


def build_bow_water_backed(spec, detail, mats):
    objects, point, _ = build_bow_dome_cylinder(spec, detail, mats)
    d = spec['dimensions_m']
    backer = box('WATER_BACK', (0.45, d['diameter'] * 0.95, d['diameter'] * 0.95),
                 (-d['length'] / 2 - 0.25, 0, 0), material=mats['SEN_MAT_Composite'])
    objects.append(backer)
    return objects, point, '水背衬柱形阵（公开结构项）'


def build_bow_large_aperture(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    body = cyl('BODY', radius, d['length'], (0, 0, 0), (0, math.pi / 2, 0),
               verts=segments(detail, 48), material=mats['SEN_MAT_Hull'])
    face = cyl('FACE', radius * 0.96, 0.14, (d['length'] / 2 + 0.05, 0, 0),
               (0, math.pi / 2, 0), verts=segments(detail, 48), material=mats['SEN_MAT_ArrayFace'])
    rim = torus('RIM', radius * 0.98, 0.10, (d['length'] / 2 + 0.02, 0, 0),
                (0, math.pi / 2, 0), material=mats['SEN_MAT_DarkMetal'])
    objects = [body, face, rim]
    if detail <= 1:
        grid = 6 if detail == 0 else 4
        objects += planar_tiles('TILE', grid, grid, radius * 1.55 / grid, 0.22, 0.10,
                                (d['length'] / 2 + 0.13, 0, 0), mats['SEN_MAT_ArrayFace'])
    for index in range(4):
        angle = math.pi / 2 * index
        objects.append(box(
            f'STRUT_{index}', (0.30, 0.16, 0.16),
            (-d['length'] * 0.9, radius * 0.7 * math.cos(angle), radius * 0.7 * math.sin(angle)),
            material=mats['SEN_MAT_DarkMetal']))
    return objects, (d['length'] / 2, 0, 0), '大型孔径艇艏阵（Virginia Block III 公开外形）'


def build_flank_panel(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    plate = box('PANEL', (length, 0.16, 0.55), (0, 0, 0), material=mats['SEN_MAT_Hull'])
    objects = [plate]
    if detail <= 1:
        cols = 9 if detail == 0 else 5
        objects += planar_tiles('TILE', 2, cols, length * 0.92 / cols, 0.13, 0.10,
                                (0, -0.10, 0), mats['SEN_MAT_ArrayFace'])
    objects.append(box('ENDCAP_A', (0.20, 0.22, 0.62), (-length / 2 - 0.08, 0, 0), material=mats['SEN_MAT_DarkMetal']))
    objects.append(box('ENDCAP_B', (0.20, 0.22, 0.62), (length / 2 + 0.08, 0, 0), material=mats['SEN_MAT_DarkMetal']))
    return objects, (0, 0, 0), '侧舷阵板外形'


def build_flank_conformal(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    segments_count = 5 if detail <= 1 else 3
    objects = []
    arc = math.radians(24)
    for index in range(segments_count):
        t = (index - (segments_count - 1) / 2.0)
        angle = arc * t / max(1, (segments_count - 1) / 2.0)
        seg_length = length / segments_count * 1.02
        y = math.sin(angle) * 0.6
        z = (1 - math.cos(angle)) * 0.6
        objects.append(box(f'SEG_{index}', (seg_length, 0.10, 0.42), (-t * seg_length * 0.98, y, z),
                           (angle, 0, 0), material=mats['SEN_MAT_ArrayFace']))
    objects.append(box('BACKING', (length * 0.96, 0.10, 0.24), (0, 0.08, 0.10), material=mats['SEN_MAT_Composite'])
                   )
    return objects, (0, 0, 0), '共形侧阵外形'


def build_towed_housing(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    radius = d['diameter'] / 2.0
    body = cyl('BODY', radius, length, (0, 0, 0), (0, math.pi / 2, 0),
               verts=segments(detail, 24), material=mats['SEN_MAT_Hull'])
    nose = cone('NOSE', radius, radius * 0.55, 0.5, (length / 2 + 0.25, 0, 0),
                (0, math.pi / 2, 0), verts=segments(detail, 24), material=mats['SEN_MAT_Hull'])
    hatch = box('HATCH', (length * 0.5, radius * 1.1, 0.06), (0, 0, radius * 0.92),
                material=mats['SEN_MAT_DarkMetal'])
    port = cyl('CABLE_PORT', radius * 0.28, 0.35, (-length / 2 - 0.12, 0, 0), (0, math.pi / 2, 0),
               verts=segments(detail, 12), material=mats['SEN_MAT_Cable'])
    return [body, nose, hatch, port], (-length / 2, 0, 0), '拖曳阵收放舱外形'


def build_towed_line(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    radius = d['diameter'] / 2.0
    cable = cyl('CABLE', radius, length * 0.55, (-length * 0.2, 0, 0), (0, math.pi / 2, 0),
                verts=segments(detail, 10), material=mats['SEN_MAT_Cable'])
    array_body = cyl('ARRAY_BODY', radius * 2.0, length * 0.32, (length * 0.24, 0, 0),
                     (0, math.pi / 2, 0), verts=segments(detail, 16), material=mats['SEN_MAT_Hull'])
    objects = [cable, array_body]
    if detail <= 1:
        count = 8 if detail == 0 else 4
        spacing = length * 0.30 / max(1, count)
        for index in range(count):
            objects.append(torus(
                f'RING_{index}', radius * 2.1, radius * 0.5,
                (length * 0.10 + index * spacing, 0, 0), (0, math.pi / 2, 0),
                material=mats['SEN_MAT_DarkMetal']))
    objects.append(cyl('REEL', 0.42, 0.30, (-length * 0.49, 0, 0), (0, math.pi / 2, 0),
                       verts=segments(detail, 20), material=mats['SEN_MAT_DarkMetal']))
    return objects, (-length * 0.5, 0, 0), '拖曳线列阵外形（不含内部结构）'


def build_hf_dome(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    dome = sphere('DOME', radius, (0, 0, 0.1), segments(detail, 20), max(8, 14 - detail * 2),
                  (1.0, 1.0, 0.75), material=mats['SEN_MAT_Composite'])
    flange = cyl('FLANGE', radius * 1.05, 0.12, (0, 0, -0.18), (0, 0, 0),
                 verts=segments(detail, 24), material=mats['SEN_MAT_Hull'])
    objects = [dome, flange]
    if detail == 0:
        objects += ring_tiles('TILE', radius * 0.5, 8, 0.08, 0.06, (0, 0, 0.34), mats['SEN_MAT_ArrayFace'])
    return objects, (0, 0, -0.2), '高频声呐导流罩外形'


def build_mine_head(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    body = box('BODY', (d['length'], radius * 1.7, radius * 1.5), (0, 0, 0),
               material=mats['SEN_MAT_Hull'])
    window = cyl('WINDOW', radius * 0.6, 0.08, (d['length'] / 2 + 0.03, 0, 0),
                 (0, math.pi / 2, 0), verts=segments(detail, 24), material=mats['SEN_MAT_Glass'])
    objects = [body, window]
    for index in range(3 if detail <= 1 else 1):
        objects.append(cyl(f'XFDU_{index}', 0.09, 0.18,
                           (-d['length'] * 0.3, (index - 1) * radius * 0.5, -radius * 0.75),
                           (0, 0, 0), verts=segments(detail, 12), material=mats['SEN_MAT_ArrayFace']))
    return objects, (0, 0, 0), '探雷声呐头部外形'


def build_dvl_probe(spec, detail, mats):
    d = spec['dimensions_m']
    plate = cyl('PLATE', d['diameter'] / 2.0, 0.10, (0, 0, 0), (0, 0, 0),
                verts=segments(detail, 24), material=mats['SEN_MAT_Hull'])
    objects = [plate]
    for index in range(4):
        angle = math.pi / 2 * index + math.pi / 4
        objects.append(cyl(
            f'XFDU_{index}', 0.09, 0.18,
            (math.cos(angle) * d['diameter'] * 0.28, math.sin(angle) * d['diameter'] * 0.28, -0.12),
            (0, 0, 0), verts=segments(detail, 12), material=mats['SEN_MAT_ArrayFace']))
    return objects, (0, 0, 0.1), '多普勒测速换能器外形'


def build_distributed_pod(spec, detail, mats):
    d = spec['dimensions_m']
    body = sphere('POD', d['diameter'] / 2.0, (0, 0, 0), segments(detail, 18),
                  max(8, 12 - detail * 2), (1.4, 1.0, 1.0), material=mats['SEN_MAT_Hull'])
    objects = [body]
    for index in range(2):
        objects.append(cyl(
            f'PORT_{index}', 0.09, 0.30,
            (-d['length'] * 0.55, (index - 0.5) * 0.3, 0), (0, math.pi / 2, 0),
            verts=segments(detail, 12), material=mats['SEN_MAT_Cable']))
    if detail <= 1:
        objects += planar_tiles('TILE', 2, 4, d['diameter'] * 0.32, 0.08, 0.06,
                                (0, -d['diameter'] * 0.42, 0), mats['SEN_MAT_ArrayFace'])
    return objects, (0, 0, 0), '分布式阵节点外形'


def build_mast_periscope(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    radius = d['diameter'] / 2.0
    tube = cyl('TUBE', radius, length, (0, 0, 0), (0, 0, 0),
               verts=segments(detail, 20), material=mats['SEN_MAT_Mast'])
    head = box('HEAD', (0.46, 0.30, 0.34), (0, 0, length / 2 + 0.17), material=mats['SEN_MAT_Hull'])
    window = cyl('WINDOW', 0.11, 0.06, (0.24, 0, length / 2 + 0.17), (0, math.pi / 2, 0),
                 verts=segments(detail, 16), material=mats['SEN_MAT_Glass'])
    eyepiece = box('EYEPIECE', (0.22, 0.22, 0.26), (-0.24, 0, length / 2 + 0.05),
                   material=mats['SEN_MAT_Hull'])
    base = cyl('BASE_FLANGE', radius * 2.6, 0.22, (0, 0, -length / 2 + 0.11), (0, 0, 0),
               verts=segments(detail, 24), material=mats['SEN_MAT_DarkMetal'])
    return [tube, head, window, eyepiece, base], (0, 0, -length / 2), '潜望镜外形'


def build_mast_photonics(spec, detail, mats):
    d = spec['dimensions_m']
    length = d['length']
    radius = d['diameter'] / 2.0
    tube = cyl('TUBE', radius, length * 0.88, (0, 0, -length * 0.06), (0, 0, 0),
               verts=segments(detail, 20), material=mats['SEN_MAT_Mast'])
    head = box('SENSOR_HEAD', (0.62, 0.46, 0.42), (0.12, 0, length * 0.44), material=mats['SEN_MAT_Hull'])
    objects = [tube, head]
    for index in range(2 if detail <= 1 else 1):
        objects.append(cyl(
            f'WINDOW_{index}', 0.13, 0.06,
            (0.44, (index - 0.5) * 0.22, length * 0.44 + 0.05), (0, math.pi / 2, 0),
            verts=segments(detail, 16), material=mats['SEN_MAT_Glass']))
    objects.append(cyl('TOP_CAP', radius * 0.9, 0.16, (0.12, 0, length * 0.44 + 0.28), (0, 0, 0),
                       verts=segments(detail, 16), material=mats['SEN_MAT_Composite']))
    objects.append(cyl('BASE_FLANGE', radius * 2.8, 0.24, (0, 0, -length * 0.5 + 0.12), (0, 0, 0),
                       verts=segments(detail, 24), material=mats['SEN_MAT_DarkMetal']))
    return objects, (0, 0, -length / 2), '光电桅杆外形'


def build_eo_turret(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    body = sphere('TURRET', radius, (0, 0, 0.05), segments(detail, 20),
                  max(8, 14 - detail * 2), (1.15, 1.0, 1.0), material=mats['SEN_MAT_Hull'])
    base = cyl('BASE', radius * 1.05, 0.16, (0, 0, -radius * 0.75), (0, 0, 0),
               verts=segments(detail, 24), material=mats['SEN_MAT_DarkMetal'])
    objects = [body, base]
    windows = 2 if detail <= 1 else 1
    for index in range(windows):
        objects.append(cyl(
            f'WINDOW_{index}', 0.10, 0.05,
            (radius * 1.05, (index - (windows - 1) / 2.0) * 0.2, 0.10), (0, math.pi / 2, 0),
            verts=segments(detail, 16), material=mats['SEN_MAT_Glass']))
    return objects, (0, 0, -radius), '光电/红外转塔外形'


def build_radar_dish(spec, detail, mats):
    d = spec['dimensions_m']
    radius = d['diameter'] / 2.0
    dish = cyl('DISH', radius, 0.10, (0, 0, 0.35), (math.radians(72), 0, 0),
               verts=segments(detail, 32), material=mats['SEN_MAT_RadarFace'])
    feed = cone('FEED', 0.06, 0.02, 0.34, (0, -0.28, 0.42), (math.radians(72), 0, 0),
                verts=segments(detail, 12), material=mats['SEN_MAT_DarkMetal'])
    post = cyl('POST', 0.09, d['length'], (0, 0, -0.1), (0, 0, 0),
               verts=segments(detail, 16), material=mats['SEN_MAT_DarkMetal'])
    gimbal = box('GIMBAL', (0.30, 0.30, 0.22), (0, 0, 0.26), material=mats['SEN_MAT_Hull'])
    return [dish, feed, post, gimbal], (0, 0, -d['length'] / 2), '对海搜索/导航雷达天线外形'


def build_esm_mast(spec, detail, mats):
    d = spec['dimensions_m']
    mast = cyl('MAST', 0.08, d['length'], (0, 0, 0), (0, 0, 0),
               verts=segments(detail, 16), material=mats['SEN_MAT_DarkMetal'])
    objects = [mast]
    for index in range(3 if detail <= 1 else 2):
        objects.append(box(
            f'BLADE_{index}', (0.34, 0.06, 0.20),
            (0, 0, -d['length'] * 0.25 + index * d['length'] * 0.22),
            (0, math.radians(index * 30), 0), material=mats['SEN_MAT_ESM']))
    objects.append(cyl('WHIP', 0.03, d['length'] * 0.3, (0, 0, d['length'] * 0.6), (0, 0, 0),
                       verts=segments(detail, 10), material=mats['SEN_MAT_ESM']))
    return objects, (0, 0, -d['length'] / 2), '电子支援天线组外形'


def build_processor_rack(spec, detail, mats):
    d = spec['dimensions_m']
    width = d['diameter']
    rack = box('RACK', (d['length'], width, width * 1.1), (0, 0, 0), material=mats['SEN_MAT_Rack'])
    objects = [rack]
    slots = 5 if detail <= 1 else 2
    for index in range(slots):
        objects.append(box(
            f'SLOT_{index}', (0.05, width * 0.75, 0.10),
            (d['length'] / 2 + 0.03, 0, -width * 0.4 + index * width * 0.2),
            material=mats['SEN_MAT_DarkMetal']))
    objects.append(box('VENT', (0.05, width * 0.6, 0.16), (d['length'] / 2 + 0.03, 0, width * 0.42),
                       material=mats['SEN_MAT_Hull']))
    return objects, (0, 0, 0), '处理机柜外形（软件层的机柜化表现）'


BUILDERS = {
    'hydrophone_pair': build_hydrophone_pair,
    'bow_dome_sphere': build_bow_dome_sphere,
    'bow_dome_cylinder': build_bow_dome_cylinder,
    'bow_water_backed': build_bow_water_backed,
    'bow_large_aperture': build_bow_large_aperture,
    'flank_panel': build_flank_panel,
    'flank_conformal': build_flank_conformal,
    'towed_housing': build_towed_housing,
    'towed_line': build_towed_line,
    'hf_dome': build_hf_dome,
    'mine_head': build_mine_head,
    'dvl_probe': build_dvl_probe,
    'distributed_pod': build_distributed_pod,
    'mast_periscope': build_mast_periscope,
    'mast_photonics': build_mast_photonics,
    'eo_turret': build_eo_turret,
    'radar_dish': build_radar_dish,
    'esm_mast': build_esm_mast,
    'processor_rack': build_processor_rack,
}
