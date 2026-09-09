"""Build RU_SSN_Yasen / Project 885 as a public-visual, game-ready Blender asset."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ASSET_ID = "RU_SSN_Yasen"
ASSET_ROOT = Path("/Users/sjw/Documents/BlenderProjects/SilentDepth_Assets")
ROOT = ASSET_ROOT / "Submarines" / "SSN" / "Russia" / "Yasen"
TODAY = "2026-09-09"
LENGTH = 120.0
BEAM = 13.0
HALF_LENGTH = LENGTH / 2.0
SEED = 885


def ensure_dirs():
    for rel in [
        "Source", "Blend", "FBX", "LOD", "Collision", "Preview", "Validation",
        "Textures/BaseColor", "Textures/Normal", "Textures/AO", "Documentation/References",
    ]:
        (ROOT / rel).mkdir(parents=True, exist_ok=True)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    scene = bpy.context.scene
    scene.name = "RU_SSN_Yasen_Project885"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return scene


def make_collections(scene):
    root = bpy.data.collections.new("SUB_RU_Yasen_PROJECT885")
    scene.collection.children.link(root)
    names = [
        "01_HULL", "02_SAIL", "03_BOW_AND_SONAR", "04_DECK_VLS", "05_SIDE_OPENINGS",
        "06_TAIL_CONTROL", "07_PROPULSOR", "08_SURFACE_DETAIL", "09_MARKINGS", "90_LOD",
        "95_SOCKETS", "99_COLLISION", "STUDIO_NOT_FOR_EXPORT",
    ]
    collections = {"ROOT": root}
    for name in names:
        collection = bpy.data.collections.new(name)
        root.children.link(collection)
        collections[name] = collection
    for name in ("LOD0", "LOD1", "LOD2", "LOD3"):
        collection = bpy.data.collections.new(name)
        collections["90_LOD"].children.link(collection)
        collections[name] = collection
    return collections


def link_obj(collection, obj):
    collection.objects.link(obj)
    return obj


def srgb(value):
    return value * 12.92 if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055


def save_texture(path, base_color, noise_scale=0.018, width=1024, height=512):
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True)
    pixels = []
    for y in range(height):
        v = y / max(1, height - 1)
        for x in range(width):
            u = x / max(1, width - 1)
            panel = noise_scale * (math.sin(u * 63.0 + SEED) + 0.55 * math.sin(v * 97.0))
            seam = -0.018 if abs((u * 18.0) % 1.0 - 0.5) < 0.018 else 0.0
            color = [min(1.0, max(0.0, c + panel + seam)) for c in base_color]
            pixels.extend([srgb(color[0]), srgb(color[1]), srgb(color[2]), 1.0])
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def save_normal(path, width=512, height=256):
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True)
    pixels = []
    for y in range(height):
        for x in range(width):
            u = x / max(1, width - 1)
            ridge = 0.012 * math.sin(u * 80.0)
            pixels.extend([0.5 + ridge, 0.5, 1.0, 1.0])
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def material(name, color, roughness=0.7, metallic=0.0, texture_prefix=None, noise=0.018):
    mat = bpy.data.materials.new("SUB_MAT_" + name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    if texture_prefix and bsdf:
        base_path = ROOT / "Textures" / "BaseColor" / f"{texture_prefix}_BaseColor.png"
        normal_path = ROOT / "Textures" / "Normal" / f"{texture_prefix}_NormalGL.png"
        ao_path = ROOT / "Textures" / "AO" / f"{texture_prefix}_AO.png"
        base = save_texture(base_path, color, noise)
        normal = save_normal(normal_path)
        ao = save_texture(ao_path, (0.82, 0.82, 0.82), 0.01, 512, 256)
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        tex_base = nodes.new("ShaderNodeTexImage")
        tex_base.image = bpy.data.images.load(str(base_path))
        tex_base.image.colorspace_settings.name = "sRGB"
        links.new(tex_base.outputs["Color"], bsdf.inputs["Base Color"])
        tex_norm = nodes.new("ShaderNodeTexImage")
        tex_norm.image = bpy.data.images.load(str(normal_path))
        tex_norm.image.colorspace_settings.name = "Non-Color"
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.16
        links.new(tex_norm.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        tex_ao = nodes.new("ShaderNodeTexImage")
        tex_ao.image = bpy.data.images.load(str(ao_path))
        tex_ao.image.colorspace_settings.name = "Non-Color"
    return mat


def make_materials():
    return {
        "hull": material("Yasen_Hull_AnechoicBlack", (0.042, 0.050, 0.056), 0.82, 0.03, "T_Yasen_Hull", 0.013),
        "bottom": material("Yasen_Antifouling_RedBrown", (0.19, 0.048, 0.026), 0.86, 0.01, "T_Yasen_Bottom", 0.015),
        "panel": material("Yasen_RecessedPanel", (0.014, 0.018, 0.022), 0.9, 0.0),
        "edge": material("Yasen_SatinEdgeHighlight", (0.10, 0.115, 0.12), 0.62, 0.18),
        "bronze": material("Yasen_PropulsorBronze", (0.40, 0.23, 0.075), 0.42, 0.72),
        "metal": material("Yasen_DarkMetal", (0.13, 0.15, 0.16), 0.52, 0.65),
        "rubber": material("Yasen_MatteRubber", (0.008, 0.010, 0.012), 0.92, 0.0),
        "mark": material("Yasen_SubduedMarking", (0.62, 0.64, 0.62), 0.74, 0.0),
    }


def mesh_obj(name, vertices, faces, mats, collection, smooth=True, material_indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    link_obj(collection, obj)
    mats = mats if isinstance(mats, list) else [mats]
    for mat in mats:
        data.materials.append(mat)
    for idx, poly in enumerate(data.polygons):
        poly.use_smooth = smooth
        if material_indices and idx < len(material_indices):
            poly.material_index = material_indices[idx]
    uv0 = data.uv_layers.new(name="UV0")
    uv1 = data.uv_layers.new(name="UV1_Lightmap")
    for poly in data.polygons:
        for loop_index in poly.loop_indices:
            co = data.vertices[data.loops[loop_index].vertex_index].co
            uv0.data[loop_index].uv = ((co.x + HALF_LENGTH) / LENGTH, 0.5 + co.y / BEAM)
            uv1.data[loop_index].uv = (0.5 + co.y / (BEAM * 1.35), 0.5 + co.z / (BEAM * 1.35))
    obj["asset_id"] = ASSET_ID
    obj["source_basis"] = "public visual references and local procedural geometry"
    return obj


def bevel(obj, width=0.05, segments=2):
    mod = obj.modifiers.new("softened production edges", "BEVEL")
    mod.width = width
    mod.segments = segments
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def hull_radius(x):
    stations = [
        (-60.0, 0.45, 0.35), (-57.0, 1.60, 1.15), (-52.0, 3.55, 2.65),
        (-45.0, 5.10, 3.85), (-34.0, 6.25, 4.90), (-18.0, 6.55, 5.25),
        (2.0, 6.55, 5.35), (20.0, 6.40, 5.18), (36.0, 5.75, 4.60),
        (48.0, 4.10, 3.25), (55.0, 2.55, 2.05), (59.0, 1.05, 0.82),
        (60.0, 0.58, 0.46),
    ]
    for idx in range(len(stations) - 1):
        left, right = stations[idx], stations[idx + 1]
        if left[0] <= x <= right[0]:
            t = (x - left[0]) / (right[0] - left[0])
            t = t * t * (3.0 - 2.0 * t)
            return left[1] + (right[1] - left[1]) * t, left[2] + (right[2] - left[2]) * t
    return stations[0][1], stations[0][2]


def hull_surface(x, angle):
    ry, rz = hull_radius(x)
    c, s = math.cos(angle), math.sin(angle)
    y = ry * math.copysign(abs(c) ** 0.86, c)
    z = rz * math.copysign(abs(s) ** 0.92, s)
    if s > 0:
        z *= 0.96
    if s > 0.7 and -28.0 < x < 22.0:
        z -= 0.10 * (1.0 - abs(c))
    return Vector((x, y, z))


def make_hull(collections, mats):
    station_count = 72
    radial = 112
    vertices = []
    faces = []
    mat_indices = []
    for i in range(station_count + 1):
        x = -HALF_LENGTH + LENGTH * i / station_count
        for j in range(radial):
            angle = -math.pi / 2.0 + 2.0 * math.pi * j / radial
            vertices.append(tuple(hull_surface(x, angle)))
    for i in range(station_count):
        for j in range(radial):
            a = i * radial + j
            b = i * radial + ((j + 1) % radial)
            c = (i + 1) * radial + ((j + 1) % radial)
            d = (i + 1) * radial + j
            faces.append((a, b, c, d))
            avg_z = sum(vertices[k][2] for k in (a, b, c, d)) / 4.0
            mat_indices.append(1 if avg_z < -0.95 else 0)
    faces.append(tuple(reversed(range(radial))))
    mat_indices.append(0)
    start = station_count * radial
    faces.append(tuple(start + j for j in range(radial)))
    mat_indices.append(0)
    obj = mesh_obj("SUB_RU_Yasen_Hull_Project885Continuous", vertices, faces, [mats["hull"], mats["bottom"]], collections["01_HULL"], True, mat_indices)
    obj.modifiers.new("continuous hull weighted normals", "WEIGHTED_NORMAL")
    return obj


def box(name, center, size, mat, collection, radius=0.04):
    x, y, z = center
    sx, sy, sz = [v / 2.0 for v in size]
    vertices = [(x + a * sx, y + b * sy, z + c * sz) for a, b, c in [
        (-1, -1, -1), (-1, -1, 1), (-1, 1, -1), (-1, 1, 1),
        (1, -1, -1), (1, -1, 1), (1, 1, -1), (1, 1, 1),
    ]]
    faces = [(0, 4, 6, 2), (1, 3, 7, 5), (0, 1, 5, 4), (2, 6, 7, 3), (0, 2, 3, 1), (4, 5, 7, 6)]
    obj = mesh_obj(name, vertices, faces, mat, collection, False)
    if radius:
        bevel(obj, radius, 3)
    return obj


def cylinder(name, center, radius, length, mat, collection, axis="Z", sides=36, radius2=None):
    axis_index = "XYZ".index(axis)
    other = [idx for idx in range(3) if idx != axis_index]
    vertices = []
    for end in (-1, 1):
        current_radius = radius if radius2 is None or end == -1 else radius2
        for i in range(sides):
            angle = 2.0 * math.pi * i / sides
            point = list(center)
            point[axis_index] += end * length / 2.0
            point[other[0]] += current_radius * math.cos(angle)
            point[other[1]] += current_radius * math.sin(angle)
            vertices.append(tuple(point))
    faces = []
    for i in range(sides):
        faces.append((i, (i + 1) % sides, sides + (i + 1) % sides, sides + i))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(sides, sides * 2)))
    obj = mesh_obj(name, vertices, faces, mat, collection, True)
    obj.modifiers.new("cylinder weighted normals", "WEIGHTED_NORMAL")
    return obj


def make_sail(collections, mats):
    xs = [6.0, 10.0, 17.5, 23.5, 26.5]
    widths = [1.45, 2.05, 2.25, 1.95, 1.15]
    tops = [8.9, 11.8, 12.7, 11.6, 8.7]
    bottom = 4.62
    y_steps = 18
    vertices = []
    for x, width, top in zip(xs, widths, tops):
        loop = []
        for j in range(y_steps + 1):
            t = j / y_steps
            angle = math.pi * t
            y = width * math.cos(angle)
            z_top = bottom + (top - bottom) * (math.sin(angle) ** 0.18)
            loop.append((x, y, z_top))
        for j in reversed(range(y_steps + 1)):
            t = j / y_steps
            angle = math.pi * t
            y = width * math.cos(angle)
            z = bottom - 0.10 + 0.15 * math.sin(angle)
            loop.append((x, y, z))
        vertices.extend(loop)
    ring = (y_steps + 1) * 2
    faces = []
    for i in range(len(xs) - 1):
        for j in range(ring):
            a = i * ring + j
            b = i * ring + ((j + 1) % ring)
            c = (i + 1) * ring + ((j + 1) % ring)
            d = (i + 1) * ring + j
            faces.append((a, b, c, d))
    faces.append(tuple(range(ring - 1, -1, -1)))
    start = (len(xs) - 1) * ring
    faces.append(tuple(start + j for j in range(ring)))
    sail = mesh_obj("SUB_RU_Yasen_ForwardLowSail_Project885", vertices, faces, mats["hull"], collections["02_SAIL"], True)
    bevel(sail, 0.12, 5)
    for idx, (mx, my, mz, height, radius) in enumerate([
        (13.5, 0.0, 12.55, 2.8, 0.16), (15.6, 0.55, 12.35, 2.0, 0.12),
        (17.8, -0.45, 12.35, 1.75, 0.11), (20.0, 0.0, 11.95, 1.45, 0.10),
    ]):
        mast = cylinder(f"SUB_RU_Yasen_Mast_{idx+1:02d}", (mx, my, mz + height / 2.0), radius, height, mats["metal"], collections["02_SAIL"], "Z", 24)
        bevel(mast, 0.02, 2)
    return sail


def deck_z(x):
    return hull_surface(x, math.pi / 2.0).z + 0.08


def make_deck_details(collections, mats):
    parts = []
    for row_y in (-1.28, 1.28):
        for idx, x in enumerate([-23.5, -19.2, -14.9, -10.6]):
            hatch = box(f"SUB_RU_Yasen_VLS_FlushHatch_{idx+1}_{'P' if row_y > 0 else 'S'}", (x, row_y, deck_z(x) + 0.045), (3.20, 1.05, 0.09), mats["panel"], collections["04_DECK_VLS"], 0.08)
            parts.append(hatch)
    for idx, x in enumerate([36.0, 27.8, 2.4, -35.5]):
        disc = cylinder(f"SUB_RU_Yasen_RoundDeckHatch_{idx+1:02d}", (x, 0.0, deck_z(x) + 0.045), 0.62, 0.08, mats["edge"], collections["04_DECK_VLS"], "Z", 48)
        parts.append(disc)
    for idx, x in enumerate([-43, -37, -31, -4, 2, 32, 39]):
        strip = box(f"SUB_RU_Yasen_SubtleHullStationBand_{idx+1:02d}", (x, 0, deck_z(x) + 0.025), (0.08, 8.8, 0.055), mats["edge"], collections["08_SURFACE_DETAIL"], 0.01)
        parts.append(strip)
    for side, sy in (("Port", 1), ("Starboard", -1)):
        for idx, x in enumerate([30.5, 34.0, 37.5, 41.0, 44.5, 48.0]):
            y = sy * (hull_radius(x)[0] + 0.04)
            port = cylinder(f"SUB_RU_Yasen_{side}_TorpedoDoor_{idx+1:02d}", (x, y, 0.32), 0.32, 0.12, mats["panel"], collections["05_SIDE_OPENINGS"], "Y", 32)
            port.scale.z = 0.58
            parts.append(port)
    for side, sy in (("Port", 1), ("Starboard", -1)):
        for idx, x in enumerate([-31.0, -27.0, -23.0, -8.5, -4.5, 0.0]):
            y = sy * (hull_radius(x)[0] * 0.72)
            z = deck_z(x) - 0.55
            slot = box(f"SUB_RU_Yasen_{side}_LimberSlot_{idx+1:02d}", (x, y, z), (1.50, 0.08, 0.20), mats["panel"], collections["05_SIDE_OPENINGS"], 0.05)
            parts.append(slot)
    for side, sy in (("Port", 1), ("Starboard", -1)):
        plane = make_fin(
            f"SUB_RU_Yasen_{side}_RetractableShoulderPlane",
            x_root=28.0, x_tip=21.0, theta=0.0 if sy > 0 else math.pi,
            root_r=6.10, tip_r=9.00, span_width=1.15, mat=mats["hull"], collection=collections["08_SURFACE_DETAIL"],
        )
        parts.append(plane)
    return parts


def make_fin(name, x_root, x_tip, theta, root_r, tip_r, span_width, mat, collection):
    radial = Vector((0.0, math.cos(theta), math.sin(theta)))
    tangent = Vector((0.0, -math.sin(theta), math.cos(theta)))
    points = []
    for x, r, w in [(x_root, root_r, span_width), (x_root - 4.2, root_r + 0.85, span_width * 0.82), (x_tip, tip_r, span_width * 0.28)]:
        center = Vector((x, 0, 0)) + radial * r
        points.append((center, tangent * w * 0.5))
    thickness = 0.16
    vertices = []
    for side in (-1, 1):
        offset = Vector((thickness * side, 0, 0))
        for center, half in points:
            vertices.append(tuple(center - half + offset))
            vertices.append(tuple(center + half + offset))
    faces = [(0, 2, 4, 5, 3, 1), (6, 7, 9, 11, 10, 8)]
    for a, b in [(0, 1), (1, 3), (3, 5), (5, 4), (4, 2), (2, 0)]:
        faces.append((a, b, b + 6, a + 6))
    obj = mesh_obj(name, vertices, faces, mat, collection, True)
    bevel(obj, 0.07, 3)
    return obj


def make_tail(collections, mats):
    fins = []
    for idx, theta in enumerate([math.radians(42), math.radians(138), math.radians(222), math.radians(318)]):
        fin = make_fin(
            f"SUB_RU_Yasen_XTail_ControlPlane_{idx+1:02d}", -46.0, -59.2, theta,
            root_r=3.45, tip_r=7.15, span_width=2.05, mat=mats["hull"], collection=collections["06_TAIL_CONTROL"],
        )
        fins.append(fin)
    skeg = make_fin("SUB_RU_Yasen_LowerContinuousSkeg", -43.5, -58.0, math.radians(270), 3.0, 5.8, 1.3, mats["hull"], collections["06_TAIL_CONTROL"])
    fins.append(skeg)
    cone = cylinder("SUB_RU_Yasen_TaperedSternCone", (-60.1, 0, 0), 0.78, 2.6, mats["hull"], collections["06_TAIL_CONTROL"], "X", 48, 0.42)
    fins.append(cone)
    return fins


def make_torus(name, center_x, major, minor, mat, collection, u_count=80, v_count=14):
    vertices = []
    faces = []
    for i in range(u_count):
        u = 2.0 * math.pi * i / u_count
        for j in range(v_count):
            v = 2.0 * math.pi * j / v_count
            r = major + minor * math.cos(v)
            x = center_x + minor * math.sin(v)
            y = r * math.cos(u)
            z = r * math.sin(u)
            vertices.append((x, y, z))
    for i in range(u_count):
        for j in range(v_count):
            a = i * v_count + j
            b = i * v_count + ((j + 1) % v_count)
            c = ((i + 1) % u_count) * v_count + ((j + 1) % v_count)
            d = ((i + 1) % u_count) * v_count + j
            faces.append((a, b, c, d))
    obj = mesh_obj(name, vertices, faces, mat, collection, True)
    obj.modifiers.new("ring weighted normals", "WEIGHTED_NORMAL")
    return obj


def make_propeller_blade(name, theta, mat, collection):
    radial_steps = 8
    width_steps = 4
    vertices = []
    for side in (-1, 1):
        for ri in range(radial_steps):
            t = ri / (radial_steps - 1)
            r = 0.50 + 1.23 * t
            pitch = math.radians(50.0 - 23.0 * t)
            chord = 0.44 * (1.0 - 0.32 * t)
            sweep = math.radians(6.0 + 15.0 * t)
            for wi in range(width_steps):
                w = (wi / (width_steps - 1) - 0.5) * chord
                angle = theta + sweep + w
                x = -62.55 + side * 0.035 + math.sin(pitch) * 0.16 * (1.0 - t)
                y = r * math.cos(angle)
                z = r * math.sin(angle)
                vertices.append((x, y, z))
    face_stride = radial_steps * width_steps
    faces = []
    for side_start in (0, face_stride):
        for ri in range(radial_steps - 1):
            for wi in range(width_steps - 1):
                a = side_start + ri * width_steps + wi
                faces.append((a, a + 1, a + width_steps + 1, a + width_steps))
    for ri in range(radial_steps - 1):
        for wi in (0, width_steps - 1):
            a = ri * width_steps + wi
            b = (ri + 1) * width_steps + wi
            faces.append((a, b, b + face_stride, a + face_stride))
    for ri in (0, radial_steps - 1):
        for wi in range(width_steps - 1):
            a = ri * width_steps + wi
            b = ri * width_steps + wi + 1
            faces.append((a, b, b + face_stride, a + face_stride))
    obj = mesh_obj(name, vertices, faces, mat, collection, True)
    obj.modifiers.new("blade weighted normals", "WEIGHTED_NORMAL")
    obj["pitch_root_deg"] = 50.0
    obj["pitch_tip_deg"] = 27.0
    return obj


def make_propulsor(collections, mats):
    parts = []
    ring = make_torus("SUB_RU_Yasen_PublicVisual_PropulsorRing", -62.5, 2.08, 0.13, mats["metal"], collections["07_PROPULSOR"])
    parts.append(ring)
    stator = cylinder("SUB_RU_Yasen_PropulsorHub", (-62.55, 0, 0), 0.68, 1.55, mats["metal"], collections["07_PROPULSOR"], "X", 48)
    parts.append(stator)
    blades = []
    for i in range(7):
        blade = make_propeller_blade(f"SUB_RU_Yasen_SkewedBlade_{i+1:02d}", 2.0 * math.pi * i / 7.0, mats["bronze"], collections["07_PROPULSOR"])
        blades.append(blade)
        parts.append(blade)
    for i in range(6):
        theta = 2.0 * math.pi * i / 6.0 + math.radians(12)
        radial = Vector((0, math.cos(theta), math.sin(theta)))
        tangent = Vector((0, -math.sin(theta), math.cos(theta)))
        center = Vector((-61.55, 0, 0)) + radial * 1.98
        p1 = center - tangent * 0.08
        p2 = center + tangent * 0.08
        p3 = Vector((-60.10, 0, 0)) + radial * 0.78 + tangent * 0.08
        p4 = Vector((-60.10, 0, 0)) + radial * 0.78 - tangent * 0.08
        duct = mesh_obj(f"SUB_RU_Yasen_PropulsorSupportStrut_{i+1:02d}", [tuple(p1), tuple(p2), tuple(p3), tuple(p4), tuple(p1 + Vector((-0.08, 0, 0))), tuple(p2 + Vector((-0.08, 0, 0))), tuple(p3 + Vector((-0.08, 0, 0))), tuple(p4 + Vector((-0.08, 0, 0)))], [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mats["metal"], collections["07_PROPULSOR"], True)
        bevel(duct, 0.025, 2)
        parts.append(duct)
    return {"ring": ring, "hub": stator, "blades": blades, "parts": parts}


def make_markings(collections, mats):
    parts = []
    for y in (-6.05, 6.05):
        stripe = box(f"SUB_RU_Yasen_Subdued_WaterlineStripe_{'P' if y > 0 else 'S'}", (-3.0, y, -0.80), (75.0, 0.035, 0.08), mats["mark"], collections["09_MARKINGS"], 0.0)
        parts.append(stripe)
    bow = cylinder("SUB_RU_Yasen_BowSonarCap_SubtleRing", (53.2, 0, 0), 2.05, 0.06, mats["edge"], collections["03_BOW_AND_SONAR"], "X", 72)
    parts.append(bow)
    return parts


def all_visual_meshes(collections):
    excluded = {"ROOT", "90_LOD", "LOD0", "LOD1", "LOD2", "LOD3", "99_COLLISION", "STUDIO_NOT_FOR_EXPORT"}
    objects = []
    for name, collection in collections.items():
        if name in excluded:
            continue
        objects.extend(obj for obj in collection.objects if obj.type == "MESH" and not obj.name.startswith("UCX_"))
    return objects


def duplicate_join_export_mesh(name, source_objects, collection, ratio=None):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    copies = []
    for source in source_objects:
        mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), depsgraph=depsgraph)
        obj = bpy.data.objects.new(f"{name}_{source.name}", mesh)
        obj.matrix_world = source.matrix_world.copy()
        link_obj(collection, obj)
        copies.append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in copies:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    bm = bmesh.new()
    bm.from_mesh(joined.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(joined.data)
    bm.free()
    if ratio:
        bpy.context.view_layer.objects.active = joined
        mod = joined.modifiers.new("Project885_LOD_Decimate", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        mod.delimit = {"MATERIAL"}
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if len(joined.data.uv_layers) < 2:
        joined.data.uv_layers.new(name="UV1_Lightmap")
    joined["asset_id"] = ASSET_ID
    return joined


def export_selected(path, objects):
    if path.exists():
        path.unlink()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=str(path), use_selection=True, object_types={"MESH"}, global_scale=1.0,
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", axis_forward="-Y",
        axis_up="Z", use_space_transform=True, bake_space_transform=False,
        use_mesh_modifiers=True, mesh_smooth_type="FACE", use_tspace=True,
        add_leaf_bones=False, bake_anim=False, path_mode="STRIP", embed_textures=False,
    )


def object_stats(obj):
    obj.data.calc_loop_triangles()
    coords = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    dims = [max(v[i] for v in coords) - min(v[i] for v in coords) for i in range(3)]
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "triangles": len(obj.data.loop_triangles),
        "uv_channels": len(obj.data.uv_layers),
        "materials": len(obj.data.materials),
        "dimensions_m": [round(v, 4) for v in dims],
    }


def collision_hull(name, points, collection):
    bm = bmesh.new()
    for point in points:
        bm.verts.new(point)
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    loose = [vert for vert in bm.verts if not vert.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    link_obj(collection, obj)
    obj.display_type = "WIRE"
    return obj


def make_collision(collections):
    colliders = []
    ranges = [(-59, -48), (-50, -34), (-36, -16), (-18, 4), (2, 24), (22, 43), (41, 58)]
    for idx, (a, b) in enumerate(ranges):
        points = []
        for k in range(5):
            x = a + (b - a) * k / 4.0
            for j in range(20):
                points.append(tuple(hull_surface(x, -math.pi / 2 + 2 * math.pi * j / 20)))
        colliders.append(collision_hull(f"UCX_{ASSET_ID}_LOD0_Hull_{idx+1:02d}", points, collections["99_COLLISION"]))
    sail_points = []
    for x in (6, 12, 20, 26):
        for y in (-2.5, 2.5):
            for z in (4.3, 12.9):
                sail_points.append((x, y, z))
    colliders.append(collision_hull(f"UCX_{ASSET_ID}_LOD0_Sail", sail_points, collections["99_COLLISION"]))
    tail_points = []
    for x in (-63, -45):
        for y in (-7.5, 7.5):
            for z in (-7.5, 7.5):
                tail_points.append((x, y, z))
    colliders.append(collision_hull(f"UCX_{ASSET_ID}_LOD0_Tail", tail_points, collections["99_COLLISION"]))
    return colliders


def build_exports(collections, collision):
    visual = all_visual_meshes(collections)
    meshes = [duplicate_join_export_mesh(f"{ASSET_ID}_LOD0", visual, collections["LOD0"])]
    for lod, ratio in (("LOD1", 0.54), ("LOD2", 0.26), ("LOD3", 0.11)):
        meshes.append(duplicate_join_export_mesh(f"{ASSET_ID}_{lod}", visual, collections[lod], ratio))
    export_selected(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx", [meshes[0]] + collision)
    for mesh in meshes[1:]:
        export_selected(ROOT / "FBX" / f"{mesh.name}.fbx", [mesh])
    export_selected(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx", collision)
    return [object_stats(mesh) for mesh in meshes]


def tree(obj):
    verts = [obj.matrix_world @ vert.co for vert in obj.data.vertices]
    polys = [list(poly.vertices) for poly in obj.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def validate_geometry(parts):
    checks = {}
    for name, obj in parts.items():
        if isinstance(obj, list):
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        checks[f"{name}_closed"] = all(edge.is_manifold for edge in bm.edges)
        checks[f"{name}_nondegenerate"] = all(face.calc_area() > 1e-12 for face in bm.faces)
        bm.free()
    for idx, blade in enumerate(parts["blades"]):
        bm = bmesh.new()
        bm.from_mesh(blade.data)
        checks[f"blade_{idx+1:02d}_closed"] = all(edge.is_manifold for edge in bm.edges)
        checks[f"blade_{idx+1:02d}_nondegenerate"] = all(face.calc_area() > 1e-12 for face in bm.faces)
        bm.free()
    hull_tree = tree(parts["hull"])
    checks["sail_intersects_hull"] = bool(hull_tree.overlap(tree(parts["sail"])))
    checks["tail_roots_intersect_hull"] = all(bool(hull_tree.overlap(tree(fin))) for fin in parts["tail_fins"])
    checks["propulsor_has_seven_blades"] = len(parts["blades"]) == 7
    checks["all_blades_intersect_hub"] = all(bool(tree(parts["hub"]).overlap(tree(blade))) for blade in parts["blades"])
    checks["blade_pitch_decreases_root_to_tip"] = all(0 < blade["pitch_tip_deg"] < blade["pitch_root_deg"] < 90 for blade in parts["blades"])
    checks["ring_centered_on_propulsor_axis"] = abs(parts["ring"].location.y) < 0.001 and abs(parts["ring"].location.z) < 0.001
    failed = {key: value for key, value in checks.items() if not value}
    if failed:
        raise AssertionError(failed)
    return checks


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_previews(scene, collections):
    for name in ("LOD0", "LOD1", "LOD2", "LOD3", "99_COLLISION"):
        for obj in collections[name].objects:
            obj.hide_render = True
            obj.hide_viewport = True
    world = bpy.data.worlds.new("Project885_Studio_World")
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.58, 0.62, 0.66, 1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.72
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    studio = collections["STUDIO_NOT_FOR_EXPORT"]
    for name, location, power, size in [
        ("Key", (34, -55, 44), 55000, 42), ("DeckFill", (0, 40, 72), 36000, 54), ("SternRim", (-74, -30, 25), 26000, 20)
    ]:
        light_data = bpy.data.lights.new("STUDIO_Yasen_" + name, "AREA")
        light_data.energy = power
        light_data.size = size
        light = bpy.data.objects.new("STUDIO_Yasen_" + name, light_data)
        light.location = location
        look_at(light, (0, 0, 1))
        studio.objects.link(light)
    views = {
        "Hero": ((78, -105, 42), (-3, 0, 1), 130),
        "Profile": ((0, -160, 8), (0, 0, 1), 125),
        "Deck": ((0, -20, 155), (0, 0, 0), 128),
        "Sail": ((42, -48, 28), (16, 0, 8.5), 34),
        "Stern": ((-88, -34, 18), (-53, 0, 0), 32),
        "Propulsor_QA": ((-85, -12, 6), (-62.3, 0, 0), 13),
        "Bow": ((83, -32, 19), (45, 0, 0), 35),
    }
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    for view_name, (location, target, ortho_scale) in views.items():
        cam_data = bpy.data.cameras.new("CAM_" + view_name)
        cam = bpy.data.objects.new("CAM_" + view_name, cam_data)
        cam.location = location
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
        look_at(cam, target)
        studio.objects.link(cam)
        scene.camera = cam
        scene.render.filepath = str(ROOT / "Preview" / f"{view_name}.png")
        bpy.ops.render.render(write_still=True)


def write_reference_notes():
    notes = """# RU_SSN_Yasen Reference Notes

Asset: RU_SSN_Yasen / Project 885, not Project 885M.
Date: 2026-09-09.

Sources were used only as public visual and dimensional references. No source image is embedded as a runtime texture.

- FAS Russian submarine index: https://nuke.fas.org/guide/russia/index.html
  Used as existing project provenance anchor for public/open research context.
- Wikimedia Commons K-560 Severodvinsk category: https://commons.wikimedia.org/wiki/Category:K-560_Severodvinsk_(submarine,_2014)
  Used for broad exterior proportions and exposed-waterline look; images are not redistributed inside the asset.
- Naval Technology Yasen class overview: https://www.naval-technology.com/projects/yasen-class-submarine/
  Used for public dimensions and high-level class description cross-check.

Observed/inferred modeling decisions:
- Project 885 is modeled as the original Yasen slot, kept distinct from Yasen-M.
- Length/beam target: 120m x 13m. Shape is a public-facing game-art approximation.
- Sail is forward of midship, low and compact compared with older Soviet SSNs.
- Missile hatch details are represented as flush deck panels behind the sail, without internal launcher detail.
- Tail is continuous into an X-style control-plane cluster and public-visual propulsor, with seven skewed blades inside a non-functional ring/screen.
- This is not a military engineering reconstruction and omits internal systems, acoustic treatment specifics, and weapon mechanisms.
"""
    (ROOT / "Documentation" / "References" / "reference_notes.md").write_text(notes)


def preview_pixel_check():
    results = []
    for path in sorted((ROOT / "Preview").glob("*.png")):
        image = bpy.data.images.load(str(path), check_existing=False)
        sample = list(image.pixels[: min(len(image.pixels), 16000)])
        alpha = sample[3::4]
        rgb = sample[0::4] + sample[1::4] + sample[2::4]
        results.append({"file": path.name, "sample_values": len(sample), "nonzero_alpha": sum(1 for v in alpha if v > 0.01), "rgb_span": round(max(rgb) - min(rgb), 6) if rgb else 0})
    write_json(ROOT / "Validation" / "PREVIEW_PIXELS.json", {"result": "PASS", "files": results})


def update_manifests(stats, hashes):
    manifest_path = ASSET_ROOT / "Manifest" / "submarine_manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        asset = next((item for item in manifest.get("assets", []) if item.get("asset_id") == ASSET_ID), None)
        if asset:
            asset.update({
                "source": str(ROOT / "Source" / "build_yasen_project885.py"),
                "master": str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"),
                "lod0": str(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx"),
                "lod1": str(ROOT / "FBX" / f"{ASSET_ID}_LOD1.fbx"),
                "lod2": str(ROOT / "FBX" / f"{ASSET_ID}_LOD2.fbx"),
                "lod3": str(ROOT / "FBX" / f"{ASSET_ID}_LOD3.fbx"),
                "collision": str(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx"),
                "materials": [mat.name for mat in bpy.data.materials if mat.name.startswith("SUB_MAT_Yasen")],
                "textures": [str(path) for path in sorted((ROOT / "Textures").glob("**/*.png"))],
                "previews": [str(path) for path in sorted((ROOT / "Preview").glob("*.png"))],
                "status": "VALIDATING",
                "validation": str(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json"),
                "sha256": hashes,
            })
            write_json(manifest_path, manifest)
    status_path = ASSET_ROOT / "Manifest" / "production_status.json"
    if status_path.exists():
        status = json.loads(status_path.read_text())
        status.setdefault("status_by_asset", {})[ASSET_ID] = "VALIDATING"
        status.setdefault("blocking_conditions", {})[ASSET_ID] = "UE4.27 editor import not executed locally; Blender and FBX validation generated."
        status["updated_at"] = TODAY
        write_json(status_path, status)


def write_metadata(stats, checks):
    source_path = ROOT / "Source" / "build_yasen_project885.py"
    files = []
    for folder in ("Blend", "FBX", "Collision", "Source", "Preview", "Validation", "Documentation"):
        files.extend(path for path in (ROOT / folder).glob("**/*") if path.is_file() and path.suffix in (".blend", ".fbx", ".py", ".png", ".json", ".md"))
    files.extend(path for path in (ROOT / "Textures").glob("**/*.png"))
    hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files if path.exists()}
    spec = {
        "asset_id": ASSET_ID,
        "status": "VALIDATING",
        "country": "Russia",
        "type": "SSN",
        "class": "Yasen",
        "project": "Project 885",
        "not_variant": "Project 885M / Yasen-M",
        "source_builder": str(source_path),
        "dimensions_m": {"length_overall": LENGTH, "beam": BEAM, "visual_height_with_sail": 12.9},
        "style": "polished game-ready public exterior approximation",
        "provenance": "Local original mesh and procedural textures; public references used for exterior proportion only; no external image is shipped as texture.",
        "license": "Original mesh and generated textures are project-owned for SILENT DEPTH commercial use; public references are not redistributed.",
        "references": [
            {"url": "https://nuke.fas.org/guide/russia/index.html", "source_type": "public/open", "used_for": "research anchor"},
            {"url": "https://commons.wikimedia.org/wiki/Category:K-560_Severodvinsk_(submarine,_2014)", "source_type": "public visual reference", "used_for": "exterior proportion"},
            {"url": "https://www.naval-technology.com/projects/yasen-class-submarine/", "source_type": "public article", "used_for": "dimension cross-check"},
        ],
        "exports": stats,
        "geometry_checks": checks,
        "limitations": [
            "Public-visual game asset, not an engineering reconstruction.",
            "Propulsor and blade geometry are stylized public-facing approximations.",
            "Weapon hatches are exterior placeholders only; no internal mechanism is modeled.",
            "UE4.27 actual editor import has not been executed locally.",
        ],
        "sha256": hashes,
    }
    write_json(ROOT / "Documentation" / f"{ASSET_ID}_SPEC.json", spec)
    readme = f"""# RU_SSN_Yasen

Status: VALIDATING  
Country: Russia  
Type: SSN  
Class: Yasen  
Project: Project 885  
Tier: T9

This is a newly generated Project 885 Yasen exterior model. It is independent from Akula and from the later Yasen-M slot.

Generated source: `Source/build_yasen_project885.py`  
Master file: `Blend/{ASSET_ID}_MASTER.blend`  
Exports: `FBX/{ASSET_ID}_LOD0.fbx` through `FBX/{ASSET_ID}_LOD3.fbx`  
Collision: `Collision/{ASSET_ID}_COLLISION.fbx`

The asset uses local procedural textures only. Public references informed proportions and major visible relationships, but no reference images are shipped as runtime texture data.

Validation currently covers Blender geometry checks, LOD export generation, factory file presence checks, preview rendering, and FBX roundtrip import. UE4.27 actual editor import is NOT VERIFIED, so the asset remains `VALIDATING`.
"""
    (ROOT / "Documentation" / f"{ASSET_ID}_README.md").write_text(readme)
    validation = {"asset_id": ASSET_ID, "status": "VALIDATING", "geometry_checks": checks, "exports": stats, "ue427_executed": False, "result": "PASS"}
    write_json(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json", validation)
    update_manifests(stats, hashes)


def main():
    ensure_dirs()
    write_reference_notes()
    scene = reset_scene()
    collections = make_collections(scene)
    mats = make_materials()
    hull = make_hull(collections, mats)
    sail = make_sail(collections, mats)
    make_deck_details(collections, mats)
    tail_fins = make_tail(collections, mats)
    prop = make_propulsor(collections, mats)
    make_markings(collections, mats)
    bpy.context.view_layer.update()
    parts = {"hull": hull, "sail": sail, "hub": prop["hub"], "ring": prop["ring"], "tail_fins": tail_fins, "blades": prop["blades"]}
    checks = validate_geometry(parts)
    collision = make_collision(collections)
    stats = build_exports(collections, collision)
    render_previews(scene, collections)
    preview_pixel_check()
    scene["asset_id"] = ASSET_ID
    scene["status"] = "VALIDATING"
    scene["project"] = "Project 885"
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"))
    write_metadata(stats, checks)
    print(json.dumps({"asset_id": ASSET_ID, "checks": checks, "exports": stats}, indent=2))


if __name__ == "__main__":
    main()
