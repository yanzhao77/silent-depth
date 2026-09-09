import bmesh
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ASSET_ID = "RU_SSN_Akula"
ASSET_ROOT = Path("/Users/sjw/Documents/BlenderProjects/SilentDepth_Assets")
ROOT = ASSET_ROOT / "Submarines" / "SSN" / "Russia" / "Akula"
TODAY = "2026-09-09"

LENGTH = 110.23
BEAM = 13.6
HULL_RADIUS_Y = BEAM / 2.0
HULL_RADIUS_Z = 6.75


def ensure_dirs():
    for rel in [
        "Source",
        "Blend",
        "FBX",
        "LOD",
        "Collision",
        "Textures/BaseColor",
        "Textures/Normal",
        "Textures/Roughness",
        "Textures/Metallic",
        "Textures/AO",
        "Preview",
        "Documentation/References",
        "Validation",
    ]:
        (ROOT / rel).mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    scene = bpy.context.scene
    scene.name = "RU_SSN_Akula_MASTER"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    return scene


def make_collections(scene):
    root = bpy.data.collections.new("SUB_RU_Akula")
    scene.collection.children.link(root)
    collections = {"ROOT": root}
    for name in [
        "00_ROOT",
        "01_HULL",
        "02_SAIL",
        "03_SONAR",
        "04_MASTS",
        "05_PERISCOPES",
        "06_DIVE_PLANES",
        "07_RUDDER",
        "08_PROPULSION",
        "09_TORPEDO",
        "10_MISSILE",
        "11_HATCHES",
        "12_DETAILS",
        "20_VARIANTS",
        "90_LOD",
        "95_SOCKETS",
        "99_COLLISION",
        "STUDIO_NOT_FOR_EXPORT",
    ]:
        collection = bpy.data.collections.new(name)
        root.children.link(collection)
        collections[name] = collection
    for name in ["LOD0", "LOD1", "LOD2", "LOD3"]:
        collection = bpy.data.collections.new(name)
        collections["90_LOD"].children.link(collection)
        collections[name] = collection
    return collections


def save_generated_texture(path, kind, width=1024, height=512):
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True)
    pixels = []
    for y in range(height):
        for x in range(width):
            u = x / max(1, width - 1)
            v = y / max(1, height - 1)
            panel = 0.018 if int(u * 34) % 2 == 0 else -0.006
            streak = 0.022 * math.sin(u * 41.0 + v * 9.0) + 0.010 * math.sin(v * 93.0)
            wear = 0.035 if (u > 0.78 and 0.42 < v < 0.61) else 0.0
            if kind == "base":
                c = max(0.025, min(0.22, 0.080 + panel + streak + wear))
                pixels.extend([c * 0.80, c * 0.92, c, 1.0])
            elif kind == "rubber":
                c = max(0.014, min(0.10, 0.034 + 0.006 * math.sin(u * 80.0) + 0.004 * math.sin(v * 61.0)))
                pixels.extend([c, c * 1.03, c * 1.08, 1.0])
            elif kind == "orm":
                ao = max(0.0, min(1.0, 0.78 + 0.08 * math.sin(u * 50.0) * math.sin(v * 20.0)))
                rough = 0.68 + 0.08 * math.sin(u * 19.0 + v * 13.0)
                metal = 0.08
                pixels.extend([ao, rough, metal, 1.0])
            else:
                nx = 0.5 + 0.035 * math.sin(u * 120.0)
                ny = 0.5 + 0.035 * math.sin(v * 95.0)
                pixels.extend([nx, ny, 1.0, 1.0])
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def material(name, color, roughness=0.65, metallic=0.0, texture_prefix=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    if texture_prefix and bsdf:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        base_kind = "rubber" if "Rubber" in name else "base"
        base_path = ROOT / "Textures" / "BaseColor" / f"{texture_prefix}_BaseColor.png"
        orm_path = ROOT / "Textures" / "AO" / f"{texture_prefix}_ORM.png"
        normal_gl = ROOT / "Textures" / "Normal" / f"{texture_prefix}_NormalGL.png"
        normal_dx = ROOT / "Textures" / "Normal" / f"{texture_prefix}_NormalDX.png"
        for path, kind in [(base_path, base_kind), (orm_path, "orm"), (normal_gl, "normal"), (normal_dx, "normal")]:
            save_generated_texture(path, kind)
        base_img = bpy.data.images.load(str(base_path))
        base_img.colorspace_settings.name = "sRGB"
        base = nodes.new("ShaderNodeTexImage")
        base.image = base_img
        links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        orm_img = bpy.data.images.load(str(orm_path))
        orm_img.colorspace_settings.name = "Non-Color"
        orm = nodes.new("ShaderNodeTexImage")
        orm.image = orm_img
        split = nodes.new("ShaderNodeSeparateColor")
        links.new(orm.outputs["Color"], split.inputs[0])
        links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
        normal_img = bpy.data.images.load(str(normal_gl))
        normal_img.colorspace_settings.name = "Non-Color"
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = normal_img
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.35
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_materials():
    return {
        "hull": material("SUB_MAT_Hull", (0.055, 0.066, 0.072, 1), 0.70, 0.08, "T_Akula_Hull"),
        "rubber": material("SUB_MAT_Rubber", (0.020, 0.023, 0.025, 1), 0.84, 0.0, "T_Akula_Rubber"),
        "dark": material("SUB_MAT_DarkMetal", (0.004, 0.006, 0.007, 1), 0.82, 0.0),
        "metal": material("SUB_MAT_Metal", (0.16, 0.19, 0.21, 1), 0.43, 0.78),
        "prop": material("SUB_MAT_Propeller", (0.23, 0.16, 0.075, 1), 0.44, 0.82),
        "glass": material("SUB_MAT_Glass", (0.004, 0.012, 0.016, 1), 0.18, 0.12),
        "mark": material("SUB_MAT_Markings", (0.52, 0.56, 0.55, 1), 0.76, 0.0),
        "red": material("SUB_MAT_Antifouling", (0.20, 0.035, 0.025, 1), 0.78, 0.02),
    }


def link_obj(collection, obj):
    collection.objects.link(obj)
    return obj


def mesh_obj(name, vertices, faces, mat, collection, smooth=True, uv_project=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    link_obj(collection, obj)
    data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = smooth
    if uv_project:
        uv = data.uv_layers.new(name="UV0")
        for poly in data.polygons:
            axis = max(range(3), key=lambda idx: abs(poly.normal[idx]))
            other = [idx for idx in range(3) if idx != axis]
            for loop_index in poly.loop_indices:
                vertex = data.vertices[data.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv = (vertex[other[0]] / 16.0, vertex[other[1]] / 16.0)
    obj["asset_id"] = ASSET_ID
    return obj


def bevel(obj, width=0.04, segments=2):
    mod = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    return obj


def box(name, center, size, mat, collection, radius=0.03):
    x, y, z = center
    sx, sy, sz = [value / 2.0 for value in size]
    verts = [(x + a * sx, y + b * sy, z + c * sz) for a, b, c in [(-1, -1, -1), (-1, -1, 1), (-1, 1, -1), (-1, 1, 1), (1, -1, -1), (1, -1, 1), (1, 1, -1), (1, 1, 1)]]
    faces = [(0, 4, 6, 2), (1, 3, 7, 5), (0, 1, 5, 4), (2, 6, 7, 3), (0, 2, 3, 1), (4, 5, 7, 6)]
    obj = mesh_obj(name, verts, faces, mat, collection, smooth=False)
    if radius:
        bevel(obj, radius, 2)
    return obj


def cylinder(name, center, radius, length, mat, collection, axis="Z", sides=24, radius2=None):
    axis_index = "XYZ".index(axis)
    other = [idx for idx in range(3) if idx != axis_index]
    verts = []
    for end in [-1, 1]:
        r = radius if radius2 is None or end == -1 else radius2
        for i in range(sides):
            angle = 2.0 * math.pi * i / sides
            point = list(center)
            point[axis_index] += end * length / 2.0
            point[other[0]] += r * math.cos(angle)
            point[other[1]] += r * math.sin(angle)
            verts.append(tuple(point))
    faces = []
    for i in range(sides):
        faces.append((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(sides, sides * 2)))
    return mesh_obj(name, verts, faces, mat, collection)


def tube(name, points, radius, mat, collection, sides=8, closed=False):
    verts = []
    faces = []
    for i, point in enumerate(points):
        prev_point = Vector(points[i - 1 if i else (-1 if closed else 0)])
        next_point = Vector(points[(i + 1) % len(points)] if closed or i + 1 < len(points) else points[i])
        direction = (next_point - prev_point).normalized()
        ref = Vector((0, 0, 1)) if abs(direction.z) < 0.9 else Vector((0, 1, 0))
        u = direction.cross(ref).normalized()
        v = direction.cross(u).normalized()
        for j in range(sides):
            angle = 2.0 * math.pi * j / sides
            verts.append(tuple(Vector(point) + radius * (u * math.cos(angle) + v * math.sin(angle))))
    spans = len(points) if closed else len(points) - 1
    for i in range(spans):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides, ((i + 1) % len(points)) * sides + (j + 1) % sides, ((i + 1) % len(points)) * sides + j))
    if not closed:
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple(range((len(points) - 1) * sides, len(points) * sides)))
    return mesh_obj(name, verts, faces, mat, collection)


def hull_scale(x):
    half = LENGTH / 2.0
    bow = half - 16.0
    stern = -half + 21.0
    if x > bow:
        t = (half - x) / max(0.001, half - bow)
        return max(0.04, math.sin(t * math.pi / 2.0) ** 0.55)
    if x < stern:
        t = (x + half) / max(0.001, stern + half)
        return max(0.12, math.sin(t * math.pi / 2.0) ** 0.72)
    return 1.0


def make_hull(collections, mats):
    verts = []
    faces = []
    uvs = []
    nx = 214
    nr = 112
    half = LENGTH / 2.0
    for i in range(nx + 1):
        x = -half + LENGTH * i / nx
        scale = hull_scale(x)
        upper_flatten = 0.88 if -18.0 < x < 32.0 else 1.0
        for j in range(nr + 1):
            angle = 2.0 * math.pi * j / nr - math.pi / 2.0
            c = math.cos(angle)
            s = math.sin(angle)
            y = HULL_RADIUS_Y * scale * math.copysign(abs(c) ** 0.80, c)
            z = HULL_RADIUS_Z * scale * math.copysign(abs(s) ** 0.72, s)
            if s > 0:
                z *= upper_flatten
            verts.append((x, y, z))
            uvs.append((i / nx, j / nr))
    for i in range(nx):
        for j in range(nr):
            k = i * (nr + 1) + j
            faces.append((k, k + 1, k + nr + 2, k + nr + 1))
    faces.append(tuple(reversed(range(nr))))
    faces.append(tuple(nx * (nr + 1) + j for j in range(nr)))
    hull = mesh_obj("SUB_RU_Akula_Hull_OuterCasing", verts, faces, mats["hull"], collections["01_HULL"])
    uv = hull.data.uv_layers["UV0"]
    for poly in hull.data.polygons:
        for loop_index in poly.loop_indices:
            uv.data[loop_index].uv = uvs[hull.data.loops[loop_index].vertex_index]
    hull["visual_basis"] = "Project 971 public exterior proportions; not engineering survey"
    return hull


def rounded_plate(name, center, size, radius, mat, collection):
    x, y, z = center
    lx, ly, lz = size
    outline = []
    for sx, sy, start in [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]:
        for idx in range(7):
            angle = math.radians(start + idx * 90 / 6)
            outline.append((x + sx * (lx / 2 - radius) + radius * math.cos(angle), y + sy * (ly / 2 - radius) + radius * math.sin(angle), z - lz / 2))
    top = [(px, py, z + lz / 2) for px, py, _ in outline]
    n = len(outline)
    faces = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range(n, 2 * n)))
    return mesh_obj(name, outline + top, faces, mat, collection, smooth=False)


def make_sail(collections, mats):
    verts = []
    faces = []
    levels = [
        (5.70, 11.0, 4.8, 11.0),
        (7.10, 10.1, 4.4, 10.6),
        (10.2, 8.5, 3.8, 9.8),
        (14.0, 6.9, 3.05, 8.8),
    ]
    segments = 72
    for z, lx, ly, cx in levels:
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            co = math.cos(angle)
            si = math.sin(angle)
            x = cx + (lx / 2.0) * math.copysign(abs(co) ** 0.56, co)
            y = (ly / 2.0) * math.copysign(abs(si) ** 0.82, si)
            if co > 0:
                x += 0.55 * (z - 5.7) / 8.3
            verts.append((x, y, z))
    for level in range(len(levels) - 1):
        for i in range(segments):
            faces.append((level * segments + i, level * segments + (i + 1) % segments, (level + 1) * segments + (i + 1) % segments, (level + 1) * segments + i))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(range((len(levels) - 1) * segments, len(levels) * segments)))
    sail = mesh_obj("SUB_RU_Akula_Sail_SweptFairwater", verts, faces, mats["hull"], collections["02_SAIL"])
    bevel(sail, 0.12, 3)
    bridge = rounded_plate("SUB_RU_Akula_Sail_BridgeGlazing", (15.0, 0.0, 13.55), (3.5, 1.55, 0.08), 0.24, mats["glass"], collections["02_SAIL"])
    bridge.rotation_euler[1] = math.radians(-5.0)
    for y in [-1.25, -0.42, 0.42, 1.25]:
        box("SUB_RU_Akula_Sail_Window", (16.05, y, 12.3), (0.08, 0.35, 0.18), mats["glass"], collections["02_SAIL"], 0.015)
    for idx, (x, y, h, r) in enumerate([(11.2, -1.2, 3.8, 0.08), (12.2, -0.35, 4.4, 0.07), (13.0, 0.55, 4.8, 0.065), (14.3, 1.15, 3.6, 0.055), (10.2, 1.0, 3.2, 0.045)]):
        cylinder(f"SUB_RU_Akula_Mast_{idx:02d}", (x, y, 15.3 + h / 2), r, h, mats["metal"], collections["04_MASTS"], "Z", 16)
    return sail


def make_details(collections, mats):
    deck = rounded_plate("SUB_RU_Akula_UpperDeck_Casing", (4.0, 0.0, 5.98), (66.0, 4.9, 0.36), 2.2, mats["rubber"], collections["01_HULL"])
    bevel(deck, 0.18, 4)
    for x in [-26, -18, -10, -2, 6, 22, 31, 39]:
        rounded_plate("SUB_RU_Akula_ServiceHatch", (x, 0, 6.27), (2.2, 1.05, 0.09), 0.26, mats["dark"], collections["11_HATCHES"])
    for side in [-1, 1]:
        for idx, x in enumerate(range(-35, 39, 4)):
            y = side * 6.15
            z = 1.80 + 1.15 * math.sin((x + 38) / 80 * math.pi)
            box("SUB_RU_Akula_FreeFloodPort", (x, y, z), (0.86, 0.08, 0.23), mats["dark"], collections["12_DETAILS"], 0.035)
        tube("SUB_RU_Akula_DeckEdge_Gasket", [(x, side * 2.55, 6.22) for x in range(-28, 39, 3)], 0.025, mats["dark"], collections["12_DETAILS"], 6)
        for x in [19.0, 23.2, 27.4]:
            tube("SUB_RU_Akula_ExternalBowTube_Fairing", [(x, side * 4.55, 3.25), (x + 4.7, side * 4.35, 3.55)], 0.13, mats["hull"], collections["09_TORPEDO"], 12)
    for row_z in [-1.4, -0.25, 0.9]:
        for y in [-2.05, -0.70, 0.70, 2.05]:
            cylinder("SUB_RU_Akula_Bow_TorpedoShutter", (54.52, y, row_z), 0.22, 0.08, mats["dark"], collections["09_TORPEDO"], "X", 18)
    rounded_plate("SUB_RU_Akula_Bow_SonarPanel", (53.2, 0.0, 0.0), (0.10, 4.7, 3.5), 0.6, mats["rubber"], collections["03_SONAR"])
    for side in [-1, 1]:
        rounded_plate("SUB_RU_Akula_FlankArrayPanel", (8.0, side * 6.28, 0.55), (21.0, 0.08, 1.35), 0.45, mats["rubber"], collections["03_SONAR"])


def vertical_fin(name, profile_xz, half_thickness_y, mat, collection):
    verts = []
    for y in [-half_thickness_y, half_thickness_y]:
        for x, z in profile_xz:
            verts.append((x, y, z))
    n = len(profile_xz)
    faces = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range(n, 2 * n)))
    obj = mesh_obj(name, verts, faces, mat, collection)
    bevel(obj, 0.08, 3)
    return obj


def horizontal_fin(name, profile_xy, center_z, half_thickness_z, mat, collection):
    verts = []
    for z in [center_z - half_thickness_z, center_z + half_thickness_z]:
        for x, y in profile_xy:
            verts.append((x, y, z))
    n = len(profile_xy)
    faces = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple(range(n, 2 * n)))
    obj = mesh_obj(name, verts, faces, mat, collection)
    bevel(obj, 0.06, 3)
    return obj


def superellipse_ring(x, radius_y, radius_z, segments=64):
    points = []
    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        c = math.cos(angle)
        s = math.sin(angle)
        points.append((x, radius_y * math.copysign(abs(c) ** 0.82, c), radius_z * math.copysign(abs(s) ** 0.72, s)))
    return points


def stern_fairing(name, mat, collection):
    stations = [
        (-52.8, 1.70, 1.45),
        (-54.3, 1.32, 1.18),
        (-55.8, 1.03, 0.94),
        (-57.2, 0.78, 0.72),
        (-58.15, 0.48, 0.46),
    ]
    segments = 64
    verts = []
    faces = []
    for x, ry, rz in stations:
        verts.extend(superellipse_ring(x, ry, rz, segments))
    for station in range(len(stations) - 1):
        for i in range(segments):
            faces.append((station * segments + i, station * segments + (i + 1) % segments, (station + 1) * segments + (i + 1) % segments, (station + 1) * segments + i))
    faces.append(tuple(reversed(range(segments))))
    start = (len(stations) - 1) * segments
    faces.append(tuple(range(start, start + segments)))
    obj = mesh_obj(name, verts, faces, mat, collection)
    obj["purpose"] = "continuous stern taper and propeller shaft fairing"
    return obj


def propeller_blade(name, angle, mat, collection):
    radial = Vector((0.0, math.cos(angle), math.sin(angle)))
    tangent = Vector((0.0, -math.sin(angle), math.cos(angle)))
    center = Vector((-58.72, 0.0, 0.0))
    sections = [
        (0.55, 0.30, -0.08, -0.10, 0.28),
        (1.05, 0.46, -0.18, -0.02, 0.43),
        (1.65, 0.58, -0.34, 0.06, 0.62),
        (2.18, 0.44, -0.48, 0.13, 0.76),
        (2.48, 0.17, -0.55, 0.18, 0.86),
    ]
    # The propeller axis is X.  Each radial station has a real chordwise
    # axial slope, so the blade reads as a pitched helical surface instead of
    # a flat plate when viewed from astern or from the side.
    chord_samples = (-1.0, -0.5, 0.0, 0.5, 1.0)
    thickness = 0.075
    verts_front = []
    verts_back = []
    for radius, chord, skew, rake, pitch in sections:
        for q in chord_samples:
            camber = 0.065 * (1.0 - q * q) * (radius / 2.48)
            axial = center.x + rake + pitch * q + camber
            tangential = skew + chord * q
            point = center + radial * radius + tangent * tangential
            verts_front.append((axial + thickness, point.y, point.z))
            verts_back.append((axial - thickness, point.y, point.z))
    verts = verts_front + verts_back
    faces = []
    samples_per_section = len(chord_samples)
    count = len(verts_front)
    for side_offset in [0, count]:
        for section in range(len(sections) - 1):
            row = section * samples_per_section + side_offset
            next_row = (section + 1) * samples_per_section + side_offset
            for column in range(samples_per_section - 1):
                a = row + column
                b = row + column + 1
                c = next_row + column + 1
                d = next_row + column
                faces.append((a, b, c, d) if side_offset == 0 else (d, c, b, a))
    for section in range(len(sections) - 1):
        front = section * samples_per_section
        back = front + count
        next_front = (section + 1) * samples_per_section
        next_back = next_front + count
        faces.append((front, next_front, next_back, back))
        last = samples_per_section - 1
        faces.append((front + last, back + last, next_back + last, next_front + last))
    for column in range(samples_per_section - 1):
        faces.append((column, column + 1, count + column + 1, count + column))
        last_front = (len(sections) - 1) * samples_per_section + column
        last_back = last_front + count
        faces.append((last_front, last_back, last_back + 1, last_front + 1))
    obj = mesh_obj(name, verts, faces, mat, collection)
    bevel(obj, 0.025, 2)
    obj["pitch_rule"] = "curved chord with radial twist, aft rake, and axial pitch around X-axis propeller shaft"
    obj["blade_count"] = 7
    return obj


def make_tail_and_propulsion(collections, mats):
    stern_fairing("SUB_RU_Akula_Stern_IntegratedCone", mats["hull"], collections["08_PROPULSION"])
    cylinder("SUB_RU_Akula_Propeller_Shaft", (-58.85, 0, 0), 0.31, 2.6, mats["metal"], collections["08_PROPULSION"], "X", 32)
    cylinder("SUB_RU_Akula_Stern_BearingCollar", (-57.88, 0, 0), 0.58, 0.36, mats["metal"], collections["08_PROPULSION"], "X", 32)
    vertical_fin("SUB_RU_Akula_Rudder_Upper", [(-51.2, 3.00), (-43.8, 4.25), (-35.7, 6.25), (-38.6, 10.15), (-50.4, 5.85)], 0.18, mats["hull"], collections["07_RUDDER"])
    vertical_fin("SUB_RU_Akula_Rudder_Lower", [(-51.2, -3.00), (-43.8, -4.20), (-36.4, -5.70), (-39.6, -9.05), (-50.3, -5.65)], 0.18, mats["hull"], collections["07_RUDDER"])
    for side in [-1, 1]:
        horizontal_fin("SUB_RU_Akula_Stern_DivePlane", [(-50.4, side * 1.20), (-42.0, side * 2.95), (-33.8, side * 6.75), (-38.0, side * 8.88), (-50.0, side * 3.95)], -0.58, 0.16, mats["hull"], collections["06_DIVE_PLANES"])
        tube("SUB_RU_Akula_DivePlane_RootFairing", [(-50.4, side * 1.05, -0.56), (-43.0, side * 2.25, -0.54), (-37.0, side * 3.40, -0.58)], 0.22, mats["hull"], collections["06_DIVE_PLANES"], 14)
    cylinder("SUB_RU_Akula_TowedArray_Pod", (-42.5, 0, 10.15), 0.47, 8.8, mats["hull"], collections["12_DETAILS"], "X", 24, radius2=0.22)
    tube("SUB_RU_Akula_UpperRudder_RootFairing", [(-51.0, 0, 3.05), (-45.0, 0, 3.90), (-39.2, 0, 5.05)], 0.23, mats["hull"], collections["07_RUDDER"], 14)
    tube("SUB_RU_Akula_LowerRudder_RootFairing", [(-51.0, 0, -3.05), (-45.0, 0, -3.85), (-40.0, 0, -4.78)], 0.20, mats["hull"], collections["07_RUDDER"], 14)
    cylinder("SUB_RU_Akula_Propeller_Hub", (-59.35, 0, 0), 0.72, 1.12, mats["prop"], collections["08_PROPULSION"], "X", 32, radius2=0.50)
    cylinder("SUB_RU_Akula_Propeller_NoseCap", (-59.95, 0, 0), 0.50, 0.52, mats["prop"], collections["08_PROPULSION"], "X", 32, radius2=0.18)
    blade_count = 7
    for idx in range(blade_count):
        angle = 2 * math.pi * idx / blade_count
        propeller_blade("SUB_RU_Akula_Propeller_Blade", angle, mats["prop"], collections["08_PROPULSION"])
    socket = bpy.data.objects.new("SOCKET_SUB_RU_Akula_Propeller", None)
    socket.empty_display_type = "ARROWS"
    socket.location = (-59.35, 0, 0)
    link_obj(collections["95_SOCKETS"], socket)


def make_collision(collections, mats):
    half = LENGTH / 2.0
    sections = [-half, -46, -32, -16, 0, 16, 32, 45, half]
    collision = []
    for idx in range(len(sections) - 1):
        verts = []
        for x in [sections[idx], sections[idx + 1]]:
            scale = hull_scale(x)
            for j in range(12):
                a = 2 * math.pi * j / 12
                verts.append((x, HULL_RADIUS_Y * scale * math.cos(a), HULL_RADIUS_Z * scale * math.sin(a)))
        data = bpy.data.meshes.new("Akula_Collision")
        data.from_pydata(verts, [], [])
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(f"UCX_SUB_RU_Akula_Hull_{idx:02d}", data)
        obj.display_type = "WIRE"
        link_obj(collections["99_COLLISION"], obj)
        collision.append(obj)
    box_obj = box("UCX_SUB_RU_Akula_Sail_00", (11.0, 0.0, 9.7), (12.5, 4.9, 8.6), mats["dark"], collections["99_COLLISION"], 0)
    box_obj.display_type = "WIRE"
    collision.append(box_obj)
    return collision


def all_visual_meshes(collections):
    excluded = {"99_COLLISION", "STUDIO_NOT_FOR_EXPORT"}
    objects = []
    for key, collection in collections.items():
        if key in excluded or key in {"ROOT", "90_LOD", "LOD0", "LOD1", "LOD2", "LOD3"}:
            continue
        objects.extend([obj for obj in collection.objects if obj.type == "MESH" and not obj.name.startswith("UCX_")])
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
    joined.data.update()
    if ratio:
        bpy.context.view_layer.objects.active = joined
        mod = joined.modifiers.new("LOD_Simplification", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        mod.delimit = {"MATERIAL"}
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if len(joined.data.uv_layers) < 2:
        lightmap = joined.data.uv_layers.new(name="UV1_Lightmap")
        joined.data.uv_layers.active = lightmap
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.5, correct_aspect=True, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        joined.data.uv_layers.active_index = 0
    joined["asset_id"] = ASSET_ID
    return joined


def export_selected(path, objects):
    if path.exists():
        path.unlink()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={"MESH"},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        axis_forward="-Y",
        axis_up="Z",
        use_space_transform=True,
        bake_space_transform=False,
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        use_tspace=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="STRIP",
        embed_textures=False,
    )


def object_stats(obj):
    obj.data.calc_loop_triangles()
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    dims = [max(v[i] for v in coords) - min(v[i] for v in coords) for i in range(3)]
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "triangles": len(obj.data.loop_triangles),
        "uv_channels": len(obj.data.uv_layers),
        "materials": len(obj.data.materials),
        "dimensions_m": [round(v, 4) for v in dims],
    }


def build_lods_and_exports(collections, collision):
    visual = all_visual_meshes(collections)
    export_meshes = []
    lod0 = duplicate_join_export_mesh(f"{ASSET_ID}_LOD0", visual, collections["LOD0"])
    export_meshes.append(lod0)
    for name, ratio in [("LOD1", 0.52), ("LOD2", 0.24), ("LOD3", 0.095)]:
        export_meshes.append(duplicate_join_export_mesh(f"{ASSET_ID}_{name}", visual, collections[name], ratio))
    export_selected(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx", [lod0] + collision)
    for mesh in export_meshes[1:]:
        export_selected(ROOT / "FBX" / f"{mesh.name.split('_')[-1].join([ASSET_ID + '_', ''])}.fbx", [mesh])
    export_selected(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx", collision)
    return [object_stats(mesh) for mesh in export_meshes]


def render_previews(scene, collections):
    for name in ["LOD0", "LOD1", "LOD2", "LOD3", "99_COLLISION"]:
        for obj in collections[name].objects:
            obj.hide_render = True
            obj.hide_viewport = True
    studio = collections["STUDIO_NOT_FOR_EXPORT"]
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.145, 0.155, 0.168)
    scene.view_settings.exposure = 1.8
    bpy.ops.object.light_add(type="AREA", location=(25, -34, 44))
    light = bpy.context.object
    light.name = "STUDIO_Akula_KeyLight"
    light.data.energy = 4200
    light.data.size = 24
    studio.objects.link(light)
    try:
        scene.collection.objects.unlink(light)
    except RuntimeError:
        pass
    bpy.ops.object.light_add(type="AREA", location=(-42, 46, 30))
    fill = bpy.context.object
    fill.name = "STUDIO_Akula_FillLight"
    fill.data.energy = 1800
    fill.data.size = 35
    studio.objects.link(fill)
    try:
        scene.collection.objects.unlink(fill)
    except RuntimeError:
        pass
    bpy.ops.object.light_add(type="AREA", location=(-78, -58, 42))
    rim = bpy.context.object
    rim.name = "STUDIO_Akula_SternRimLight"
    rim.data.energy = 2400
    rim.data.size = 18
    rim.rotation_euler = (Vector((-55, 0, 0)) - rim.location).to_track_quat("-Z", "Y").to_euler()
    studio.objects.link(rim)
    try:
        scene.collection.objects.unlink(rim)
    except RuntimeError:
        pass
    views = {
        "Hero": ((72, -86, 34), (0, 0, 2), 128),
        "Profile": ((0, -150, 18), (0, 0, 1), 126),
        "Deck": ((0, -30, 130), (0, 0, 0), 128),
        "Sail": ((48, -48, 32), (10, 0, 9), 38),
        "Stern": ((-86, -34, 18), (-50, 0, 0), 35),
        "Tail_QA": ((-88, -18, 8), (-55, 0, 0), 18),
    }
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    for name, (location, target, ortho) in views.items():
        camera_data = bpy.data.cameras.new(f"CAM_{ASSET_ID}_{name}")
        camera = bpy.data.objects.new(f"CAM_{ASSET_ID}_{name}", camera_data)
        camera.location = location
        camera.rotation_euler = (Vector(target) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho
        studio.objects.link(camera)
        scene.camera = camera
        scene.render.filepath = str(ROOT / "Preview" / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def write_metadata(export_stats, collision_count):
    references = [
        {
            "name": "RussianShips Project 971",
            "url": "https://russianships.info/eng/submarines/project_971.htm",
            "source_type": "public reference",
            "accessed": TODAY,
            "key_facts": "Project 971 page used for public dimensions and general layout cues.",
        },
        {
            "name": "NTI Project 971 Akula PDF",
            "url": "https://www.nti.org/wp-content/uploads/2021/09/project_971_akula.pdf",
            "source_type": "public reference PDF",
            "accessed": TODAY,
            "key_facts": "Public dimensions include 110.23 m length and 13.6 m beam; weapon notes are not used for gameplay balance.",
        },
    ]
    spec = {
        "asset_id": ASSET_ID,
        "display_name": "Akula / Project 971 Shchuka-B",
        "country": "Russia",
        "type": "SSN",
        "class": "Akula",
        "project": "Project 971",
        "tier": 7,
        "status": "VALIDATING",
        "template_version": "v1.0.0",
        "modeling_notes": "Independent procedural game exterior based on public Project 971 proportions. This is not a CAD model, engineering survey, or real internal structure simulation.",
        "visual_identifiers": [
            "single-screw attack-submarine layout",
            "swept compact sail forward of center",
            "long streamlined teardrop hull",
            "stern cruciform control surfaces",
            "top stern towed-array style pod/fairing",
            "bow torpedo shutter and external fairing cues",
        ],
        "dimensions_m": {"length": LENGTH, "beam": BEAM, "source": "public references; game-art approximation"},
        "exports": export_stats,
        "collision_meshes": collision_count,
        "references": references,
        "limitations": [
            "No classified propulsor or internal systems are modeled.",
            "Fine hull openings and panels are game-art approximations from public exterior cues.",
            "UE4.27 editor import is still required before COMPLETE status.",
        ],
    }
    (ROOT / "Documentation" / f"{ASSET_ID}_SPEC.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "Documentation" / "References" / f"{ASSET_ID}_REFERENCES.json").write_text(json.dumps(references, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "Documentation" / f"{ASSET_ID}_README.md").write_text(
        f"# {ASSET_ID}\n\n"
        "Status: VALIDATING\n\n"
        "Independent Akula / Project 971 game exterior generated for Silent Depth. "
        "The asset uses the submarine factory template, contains MASTER blend, LOD FBX exports, collision, generated offline textures, previews, SPEC and validation files. "
        "UE4.27 import remains NOT VERIFIED.\n"
    )
    validation = {
        "asset_id": ASSET_ID,
        "result": "PASS",
        "validator": "build_akula.py internal Blender generation checks",
        "exports": export_stats,
        "checks": {
            "lod_count": 4,
            "collision_count": collision_count,
            "fbx_written": True,
            "preview_count": 6,
            "texture_sets": ["T_Akula_Hull", "T_Akula_Rubber"],
            "ue427_executed": False,
        },
        "status_decision": "VALIDATING, not COMPLETE, because UE4.27 import was not executed.",
    }
    (ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json").write_text(json.dumps(validation, indent=2, ensure_ascii=False) + "\n")


def update_global_manifests(export_stats):
    manifest_path = ASSET_ROOT / "Manifest" / "submarine_manifest.json"
    status_path = ASSET_ROOT / "Manifest" / "production_status.json"
    db_path = ASSET_ROOT / "Documentation" / "GLOBAL_SUBMARINE_DATABASE.json"
    manifest = json.loads(manifest_path.read_text())
    textures = [str(path) for path in sorted((ROOT / "Textures").glob("**/*.png"))]
    previews = [str(path) for path in sorted((ROOT / "Preview").glob("*.png"))]
    for asset in manifest["assets"]:
        if asset["asset_id"] == ASSET_ID:
            asset.update(
                {
                    "source": str(ROOT / "Source" / "build_akula.py"),
                    "master": str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"),
                    "lod0": str(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx"),
                    "lod1": str(ROOT / "FBX" / f"{ASSET_ID}_LOD1.fbx"),
                    "lod2": str(ROOT / "FBX" / f"{ASSET_ID}_LOD2.fbx"),
                    "lod3": str(ROOT / "FBX" / f"{ASSET_ID}_LOD3.fbx"),
                    "collision": str(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx"),
                    "materials": ["SUB_MAT_Hull", "SUB_MAT_Rubber", "SUB_MAT_Metal", "SUB_MAT_DarkMetal", "SUB_MAT_Glass", "SUB_MAT_Propeller", "SUB_MAT_Antifouling"],
                    "textures": textures,
                    "previews": previews,
                    "status": "VALIDATING",
                    "validation": str(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json"),
                }
            )
            break
    manifest["generated_at"] = TODAY
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    status = json.loads(status_path.read_text())
    status["status_by_asset"][ASSET_ID] = "VALIDATING"
    status.setdefault("blocking_conditions", {})[ASSET_ID] = "UE4.27 editor import not executed locally; Blender-generated FBX and previews exist."
    status["current_batch"] = ["RU_SSN_Akula", "RU_SSN_Yasen"]
    status["updated_at"] = TODAY
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n")
    db = json.loads(db_path.read_text())
    for entry in db["entries"]:
        if entry["asset_id"] == ASSET_ID:
            entry["asset_status"] = "VALIDATING"
            entry["visual_identifiers"] = ["single screw", "swept forward sail", "stern towed-array style pod", "cruciform stern control surfaces"]
            break
    db_path.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n")


def main():
    ensure_dirs()
    scene = reset_scene()
    collections = make_collections(scene)
    mats = make_materials()
    make_hull(collections, mats)
    make_sail(collections, mats)
    make_details(collections, mats)
    make_tail_and_propulsion(collections, mats)
    collision = make_collision(collections, mats)
    export_stats = build_lods_and_exports(collections, collision)
    render_previews(scene, collections)
    scene["asset_id"] = ASSET_ID
    scene["template_version"] = "v1.0.0"
    scene["status"] = "VALIDATING"
    write_metadata(export_stats, len(collision))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"))
    update_global_manifests(export_stats)
    print(json.dumps({"asset_id": ASSET_ID, "status": "VALIDATING", "exports": export_stats, "collision": len(collision)}, indent=2))


if __name__ == "__main__":
    main()
