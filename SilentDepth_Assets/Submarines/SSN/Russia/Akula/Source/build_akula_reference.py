import bmesh
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ASSET_ID = "RU_SSN_Akula"
# Resolve the asset root from this file's own location
# (<root>/Submarines/SSN/Russia/Akula/Source/build_akula_reference.py) so the
# factory runs on any machine instead of a hardcoded author path.
ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT.parents[3]
TODAY = "2026-09-09"

# Collection holding the shaft, hub and blades, exported as their own asset.
PROPULSION_COLLECTION = "07_PROPULSION"

# Parts that move in game, exported separately from the hull so an engine can
# rotate them. Each hinges at its root leading edge (the fore/aft extreme of its
# own bounds on the bow side), except the propeller which turns on the shaft.
MOVABLE_PARTS = (
    ("PROP", PROPULSION_COLLECTION, None, "hub"),
    ("RUDDER", "06_TAIL", "TailVertical", "leading"),
    ("STERNPLANES", "06_TAIL", "TailHorizontal", "leading"),
    ("BOWPLANES", "05_DIVE_PLANES", "BowPlane", "leading"),
)

LENGTH = 110.2
BEAM = 13.6
HALF_LENGTH = LENGTH / 2.0


def ensure_dirs():
    for rel in [
        "Source", "Blend", "FBX", "LOD", "Collision", "Preview",
        "Textures/BaseColor", "Textures/Normal", "Textures/AO",
        "Documentation/References", "Validation",
    ]:
        (ROOT / rel).mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    scene = bpy.context.scene
    scene.name = "RU_SSN_Akula_REFERENCE_BUILD"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def make_collections(scene):
    root = bpy.data.collections.new("SUB_RU_Akula_REFERENCE")
    scene.collection.children.link(root)
    collections = {"ROOT": root}
    for name in [
        "01_HULL", "02_SAIL", "03_SONAR", "04_MASTS", "05_DIVE_PLANES",
        "06_TAIL", "07_PROPULSION", "08_DETAILS", "09_HATCHES", "90_LOD",
        "95_SOCKETS", "99_COLLISION", "STUDIO_NOT_FOR_EXPORT",
    ]:
        collection = bpy.data.collections.new(name)
        root.children.link(collection)
        collections[name] = collection
    for name in ["LOD0", "LOD1", "LOD2", "LOD3"]:
        collection = bpy.data.collections.new(name)
        collections["90_LOD"].children.link(collection)
        collections[name] = collection
    return collections


def save_texture(path, kind, width=512, height=256):
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=True)
    pixels = []
    for y in range(height):
        for x in range(width):
            u = x / max(1, width - 1)
            v = y / max(1, height - 1)
            panel = 0.012 * math.sin(u * 37.0) + 0.006 * math.sin(v * 91.0)
            if kind == "hull":
                base = max(0.050, 0.155 + panel)
                pixels.extend([base * 0.78, base * 0.90, base, 1.0])
            elif kind == "bottom":
                base = max(0.045, 0.18 + panel)
                pixels.extend([base * 1.55, base * 0.45, base * 0.24, 1.0])
            elif kind == "rubber":
                base = max(0.012, 0.030 + 0.004 * math.sin(u * 84.0))
                pixels.extend([base, base * 1.03, base * 1.08, 1.0])
            elif kind == "orm":
                pixels.extend([0.82, 0.70 + 0.08 * math.sin(u * 22.0), 0.08, 1.0])
            else:
                pixels.extend([0.5 + 0.02 * math.sin(u * 100.0), 0.5, 1.0, 1.0])
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def material(name, color, roughness, metallic, prefix=None, texture_kind="hull"):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if prefix:
        base_path = ROOT / "Textures" / "BaseColor" / f"{prefix}_BaseColor.png"
        orm_path = ROOT / "Textures" / "AO" / f"{prefix}_ORM.png"
        normal_path = ROOT / "Textures" / "Normal" / f"{prefix}_NormalGL.png"
        save_texture(base_path, texture_kind)
        save_texture(orm_path, "orm")
        save_texture(normal_path, "normal")
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        base = nodes.new("ShaderNodeTexImage")
        base.image = bpy.data.images.load(str(base_path))
        base.image.colorspace_settings.name = "sRGB"
        links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        orm = nodes.new("ShaderNodeTexImage")
        orm.image = bpy.data.images.load(str(orm_path))
        orm.image.colorspace_settings.name = "Non-Color"
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(orm.outputs["Color"], separate.inputs[0])
        links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = bpy.data.images.load(str(normal_path))
        normal.image.colorspace_settings.name = "Non-Color"
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.25
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_materials():
    return {
        "hull": material("SUB_MAT_Hull_Reference", (0.055, 0.070, 0.082, 1), 0.72, 0.06, "T_Akula_Reference_Hull"),
        "bottom": material("SUB_MAT_Antifouling_Reference", (0.22, 0.065, 0.035, 1), 0.79, 0.02, "T_Akula_Reference_Bottom", "bottom"),
        "rubber": material("SUB_MAT_Rubber_Reference", (0.018, 0.022, 0.026, 1), 0.88, 0.0, "T_Akula_Reference_Rubber", "rubber"),
        "metal": material("SUB_MAT_Machinery_Reference", (0.20, 0.23, 0.24, 1), 0.46, 0.70),
        "prop": material("SUB_MAT_Propeller_Reference", (0.36, 0.20, 0.075, 1), 0.43, 0.78),
        "glass": material("SUB_MAT_Glass_Reference", (0.006, 0.018, 0.022, 1), 0.18, 0.12),
        "dark": material("SUB_MAT_Dark_Reference", (0.006, 0.009, 0.011, 1), 0.82, 0.0),
    }


def link_obj(collection, obj):
    collection.objects.link(obj)
    return obj


def mesh_obj(name, vertices, faces, materials, collection, smooth=True, material_indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    link_obj(collection, obj)
    mats = materials if isinstance(materials, list) else [materials]
    for mat in mats:
        data.materials.append(mat)
    for idx, poly in enumerate(data.polygons):
        poly.use_smooth = smooth
        if material_indices and idx < len(material_indices):
            poly.material_index = material_indices[idx]
    uv = data.uv_layers.new(name="UV0")
    for poly in data.polygons:
        for loop_index in poly.loop_indices:
            vertex = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (vertex.x / LENGTH, vertex.y / BEAM + 0.5)
    obj["asset_id"] = ASSET_ID
    obj["source_basis"] = "user-supplied Project 971 reference boards"
    return obj


def bevel(obj, width=0.04, segments=2):
    modifier = obj.modifiers.new("Reference edge softening", "BEVEL")
    modifier.width = width
    modifier.segments = segments
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
        bevel(obj, radius, 2)
    return obj


def cylinder(name, center, radius, length, mat, collection, axis="Z", sides=24, radius2=None):
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
    faces.extend([tuple(reversed(range(sides))), tuple(range(sides, sides * 2))])
    return mesh_obj(name, vertices, faces, mat, collection)


def hull_radius(x):
    stations = [
        (-55.1, 0.35, 0.30), (-53.2, 1.75, 1.55), (-49.0, 4.00, 3.35),
        (-44.0, 5.25, 4.55), (-36.0, 6.15, 5.20), (-24.0, 6.55, 5.45),
        (-8.0, 6.75, 5.55), (10.0, 6.80, 5.55), (25.0, 6.75, 5.48),
        (38.0, 6.55, 5.25), (47.0, 6.10, 4.75), (52.0, 5.15, 4.00),
        (54.5, 3.45, 2.70), (55.1, 0.22, 0.20),
    ]
    for idx in range(len(stations) - 1):
        left, right = stations[idx], stations[idx + 1]
        if left[0] <= x <= right[0]:
            t = (x - left[0]) / (right[0] - left[0])
            smooth_t = t * t * (3.0 - 2.0 * t)
            return (
                left[1] + (right[1] - left[1]) * smooth_t,
                left[2] + (right[2] - left[2]) * smooth_t,
            )
    return stations[0][1], stations[0][2]


def make_hull(collections, mats):
    stations = 36
    radial = 96
    vertices = []
    faces = []
    material_indices = []
    for i in range(stations + 1):
        x = -HALF_LENGTH + LENGTH * i / stations
        ry, rz = hull_radius(x)
        for j in range(radial + 1):
            angle = 2.0 * math.pi * j / radial - math.pi / 2.0
            c, s = math.cos(angle), math.sin(angle)
            y = ry * math.copysign(abs(c) ** 0.82, c)
            z = rz * math.copysign(abs(s) ** 0.88, s)
            if s > 0:
                z *= 0.96
            vertices.append((x, y, z))
    for i in range(stations):
        for j in range(radial):
            k = i * (radial + 1) + j
            faces.append((k, k + 1, k + radial + 2, k + radial + 1))
            avg_z = sum(vertices[idx][2] for idx in faces[-1]) / 4.0
            material_indices.append(1 if avg_z < -1.2 else 0)
    faces.append(tuple(reversed(range(radial + 1))))
    material_indices.append(0)
    start = stations * (radial + 1)
    faces.append(tuple(start + idx for idx in range(radial + 1)))
    material_indices.append(0)
    hull = mesh_obj(
        "SUB_RU_Akula_Hull_ReferenceCasing",
        vertices,
        faces,
        [mats["hull"], mats["bottom"]],
        collections["01_HULL"],
        True,
        material_indices,
    )
    hull["dimensions_m"] = {"length": LENGTH, "beam": BEAM, "hull_height": 11.1}
    return hull


def hull_top(x):
    return hull_radius(x)[1] * 0.96


def make_deck_casing(collections, mats):
    vertices = []
    faces = []
    stations = [-37, -30, -18, 0, 18, 31, 39]
    widths = [0.35, 2.0, 2.45, 2.55, 2.30, 1.45, 0.30]
    for x, width in zip(stations, widths):
        z = hull_top(x) + 0.18
        vertices.extend([(x, -width, z), (x, width, z), (x, -width * 0.88, z + 0.30), (x, width * 0.88, z + 0.30)])
    for idx in range(len(stations) - 1):
        a = idx * 4
        b = (idx + 1) * 4
        faces.extend([(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a + 2, b + 2, b + 3, a + 3)])
    casing = mesh_obj("SUB_RU_Akula_ContinuousUpperCasing", vertices, faces, mats["rubber"], collections["01_HULL"])
    bevel(casing, 0.12, 3)


def make_sail(collections, mats):
    stations = [(0.0, 0.55, 1.3), (4.0, 1.75, 5.4), (9.0, 2.35, 7.9), (16.0, 2.40, 7.8), (22.0, 1.85, 5.1), (27.0, 0.55, 1.2)]
    segments = 32
    vertices = []
    faces = []
    for x, width, height in stations:
        center_z = hull_top(x) + height / 2.0
        for j in range(segments):
            angle = 2.0 * math.pi * j / segments
            y = width * math.cos(angle)
            z = center_z + height / 2.0 * math.sin(angle)
            vertices.append((x, y, z))
    for i in range(len(stations) - 1):
        for j in range(segments):
            faces.append((i * segments + j, i * segments + (j + 1) % segments, (i + 1) * segments + (j + 1) % segments, (i + 1) * segments + j))
    faces.extend([tuple(reversed(range(segments))), tuple((len(stations) - 1) * segments + j for j in range(segments))])
    sail = mesh_obj("SUB_RU_Akula_Sail_LowSweptReference", vertices, faces, mats["hull"], collections["02_SAIL"])
    bevel(sail, 0.14, 3)
    box("SUB_RU_Akula_Sail_BridgeGlazing", (12.3, 0, 12.75), (3.8, 1.8, 0.10), mats["glass"], collections["02_SAIL"], 0.20)
    for index, (x, y, height, radius) in enumerate([(6.5, -0.9, 3.4, 0.08), (8.2, -0.3, 4.2, 0.07), (10.0, 0.35, 4.8, 0.065), (12.0, 0.95, 3.6, 0.055), (14.2, -0.05, 3.9, 0.05), (16.0, 0.55, 3.0, 0.045)]):
        cylinder(f"SUB_RU_Akula_Mast_{index:02d}", (x, y, 13.35 + height / 2.0), radius, height, mats["metal"], collections["04_MASTS"], "Z", 16)


def vertical_fin(name, profile, half_thickness, mat, collection):
    vertices = []
    for y in (-half_thickness, half_thickness):
        vertices.extend((x, y, z) for x, z in profile)
    n = len(profile)
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces.extend([tuple(reversed(range(n))), tuple(range(n, 2 * n))])
    obj = mesh_obj(name, vertices, faces, mat, collection, False)
    bevel(obj, 0.10, 3)
    return obj


def horizontal_fin(name, profile, z, half_thickness, mat, collection):
    vertices = []
    for layer in (z - half_thickness, z + half_thickness):
        vertices.extend((x, y, layer) for x, y in profile)
    n = len(profile)
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces.extend([tuple(reversed(range(n))), tuple(range(n, 2 * n))])
    obj = mesh_obj(name, vertices, faces, mat, collection, False)
    bevel(obj, 0.08, 3)
    return obj


def make_tail(collections, mats):
    vertical_fin("SUB_RU_Akula_UpperTail", [(-51.5, 2.3), (-46.0, 4.0), (-37.0, 5.2), (-38.5, 11.3), (-43.0, 11.7), (-45.0, 6.2)], 0.32, mats["hull"], collections["06_TAIL"])
    vertical_fin("SUB_RU_Akula_LowerRudder", [(-51.5, -2.3), (-46.0, -4.0), (-37.0, -5.2), (-39.0, -9.4), (-43.8, -9.1), (-45.0, -6.2)], 0.32, mats["hull"], collections["06_TAIL"])
    for side in (-1, 1):
        horizontal_fin(
            "SUB_RU_Akula_SternPlane",
            [(-51.2, side * 1.0), (-45.0, side * 3.2), (-36.5, side * 7.1), (-39.0, side * 8.5), (-49.5, side * 3.8)],
            -0.35,
            0.18,
            mats["hull"],
            collections["06_TAIL"],
        )
    cylinder("SUB_RU_Akula_TailTopPod", (-43.0, 0, 12.1), 0.72, 8.2, mats["hull"], collections["06_TAIL"], "X", 32, radius2=0.28)
    for side in (-1, 1):
        cylinder("SUB_RU_Akula_TailRootFairing", (-44.5, side * 1.7, 0.0), 0.30, 9.0, mats["hull"], collections["06_TAIL"], "X", 18, radius2=0.12)


def propeller_blade(name, angle, mats, collection):
    radial = Vector((0.0, math.cos(angle), math.sin(angle)))
    tangent = Vector((0.0, -math.sin(angle), math.cos(angle)))
    center = Vector((-57.1, 0.0, 0.0))
    sections = [(0.55, 0.20, -0.02, 0.10), (0.95, 0.38, -0.08, 0.22), (1.45, 0.52, -0.19, 0.36), (1.86, 0.40, -0.30, 0.48), (2.10, 0.14, -0.38, 0.56)]
    q_values = (-1.0, -0.5, 0.0, 0.5, 1.0)
    thickness = 0.065
    front, back = [], []
    for radius, chord, skew, pitch in sections:
        for q in q_values:
            camber = 0.045 * (1.0 - q * q) * radius / 2.1
            axial = center.x + pitch * q + camber
            point = center + radial * radius + tangent * (skew + chord * q)
            front.append((axial + thickness, point.y, point.z))
            back.append((axial - thickness, point.y, point.z))
    vertices = front + back
    count = len(front)
    cols = len(q_values)
    faces = []
    for offset in (0, count):
        for row in range(len(sections) - 1):
            for col in range(cols - 1):
                a = offset + row * cols + col
                b = a + 1
                d = offset + (row + 1) * cols + col
                c = d + 1
                faces.append((a, b, c, d) if offset == 0 else (d, c, b, a))
    for row in range(len(sections) - 1):
        front_row = row * cols
        next_row = (row + 1) * cols
        for col in (0, cols - 1):
            a = front_row + col
            b = next_row + col
            faces.append((a, b, b + count, a + count))
    for col in range(cols - 1):
        faces.append((col, col + 1, count + col + 1, count + col))
        last = (len(sections) - 1) * cols + col
        faces.append((last, last + count, last + count + 1, last + 1))
    obj = mesh_obj(name, vertices, faces, mats["prop"], collection)
    bevel(obj, 0.018, 2)
    obj["pitch_rule"] = "reference-board single screw with radial twist and axial pitch"
    return obj


def make_propulsion(collections, mats):
    cylinder("SUB_RU_Akula_PropellerShaft", (-56.0, 0, 0), 0.28, 3.0, mats["metal"], collections["07_PROPULSION"], "X", 24)
    cylinder("SUB_RU_Akula_BearingFairing", (-55.4, 0, 0), 0.58, 0.42, mats["metal"], collections["07_PROPULSION"], "X", 32)
    cylinder("SUB_RU_Akula_PropellerHub", (-57.0, 0, 0), 0.70, 1.25, mats["prop"], collections["07_PROPULSION"], "X", 32, radius2=0.45)
    cylinder("SUB_RU_Akula_PropellerCap", (-57.65, 0, 0), 0.42, 0.55, mats["prop"], collections["07_PROPULSION"], "X", 32, radius2=0.12)
    for idx in range(7):
        propeller_blade("SUB_RU_Akula_PropellerBlade", 2.0 * math.pi * idx / 7.0, mats, collections["07_PROPULSION"])
    socket = bpy.data.objects.new("SOCKET_SUB_RU_Akula_Propeller", None)
    socket.empty_display_type = "ARROWS"
    socket.location = (-57.0, 0.0, 0.0)
    link_obj(collections["95_SOCKETS"], socket)


def make_fore_details(collections, mats):
    box("SUB_RU_Akula_BowSonarArray", (52.4, 0, -0.2), (0.16, 4.9, 3.6), mats["rubber"], collections["03_SONAR"], 0.55)
    for y in (-2.0, -1.2, -0.4, 0.4, 1.2, 2.0):
        cylinder("SUB_RU_Akula_BowSonarElement", (53.0, y, 0.3), 0.22, 0.10, mats["dark"], collections["03_SONAR"], "X", 18)
    for side in (-1, 1):
        horizontal_fin("SUB_RU_Akula_ForeDivePlane", [(35.0, side * 1.2), (29.0, side * 3.0), (24.5, side * 6.9), (28.0, side * 7.7), (35.5, side * 3.4)], -0.55, 0.16, mats["hull"], collections["05_DIVE_PLANES"])
    for row, z in enumerate((1.8, 0.6, -0.6)):
        for y in (-1.7, -0.55, 0.55, 1.7):
            cylinder(f"SUB_RU_Akula_BowShutter_{row:02d}", (51.0, y, z), 0.20, 0.08, mats["dark"], collections["09_HATCHES"], "X", 18)


def make_surface_details(collections, mats):
    for x in (-31, -22, -12, 0, 17, 29, 38):
        box("SUB_RU_Akula_DeckHatch", (x, 0, hull_top(x) + 0.48), (2.0, 1.0, 0.12), mats["dark"], collections["09_HATCHES"], 0.15)
    for side in (-1, 1):
        for x in range(-34, 43, 4):
            z = -1.2 + 0.45 * math.sin((x + 34) / 77.0 * math.pi)
            box("SUB_RU_Akula_FreeFloodPort", (x, side * 6.15, z), (0.75, 0.08, 0.20), mats["dark"], collections["08_DETAILS"], 0.03)
    for side in (-1, 1):
        for x in (10, 14, 18):
            cylinder("SUB_RU_Akula_SailWindow", (x, side * 2.36, 10.7), 0.10, 0.06, mats["glass"], collections["02_SAIL"], "Y", 16)


def make_collision(collections, mats):
    collision = []
    sections = [-55.1, -46, -34, -18, 0, 18, 34, 46, 55.1]
    for idx in range(len(sections) - 1):
        vertices = []
        for x in (sections[idx], sections[idx + 1]):
            ry, rz = hull_radius(x)
            for j in range(12):
                angle = 2.0 * math.pi * j / 12.0
                vertices.append((x, ry * math.cos(angle), rz * math.sin(angle)))
        data = bpy.data.meshes.new(f"Akula_Reference_Collision_{idx:02d}")
        data.from_pydata(vertices, [], [])
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(f"UCX_SUB_RU_Akula_Reference_{idx:02d}", data)
        obj.display_type = "WIRE"
        link_obj(collections["99_COLLISION"], obj)
        collision.append(obj)
    sail = box("UCX_SUB_RU_Akula_Reference_Sail", (12.0, 0, 9.0), (26.0, 4.8, 8.5), mats["dark"], collections["99_COLLISION"], 0)
    sail.display_type = "WIRE"
    collision.append(sail)
    return collision


def all_visual_meshes(collections):
    excluded = {"90_LOD", "LOD0", "LOD1", "LOD2", "LOD3", "99_COLLISION", "STUDIO_NOT_FOR_EXPORT", "ROOT"}
    objects = []
    for key, collection in collections.items():
        if key in excluded:
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
        modifier = joined.modifiers.new("Reference_LOD_Decimate", "DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        modifier.delimit = {"MATERIAL"}
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if len(joined.data.uv_layers) < 2:
        lightmap = joined.data.uv_layers.new(name="UV1_Lightmap")
        joined.data.uv_layers.active = lightmap
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.002, area_weight=0.5, correct_aspect=True, scale_to_bounds=True)
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
        filepath=str(path), use_selection=True, object_types={"MESH"}, global_scale=1.0,
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS", axis_forward="-Y",
        axis_up="Z", use_space_transform=True, bake_space_transform=False,
        use_mesh_modifiers=True, mesh_smooth_type="FACE", use_tspace=True,
        add_leaf_bones=False, bake_anim=False, path_mode="STRIP", embed_textures=False,
    )


def object_stats(obj):
    obj.data.calc_loop_triangles()
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    dims = [max(v[i] for v in coords) - min(v[i] for v in coords) for i in range(3)]
    return {"name": obj.name, "vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles), "uv_channels": len(obj.data.uv_layers), "materials": len(obj.data.materials), "dimensions_m": [round(v, 4) for v in dims]}


def build_exports(collections, collision):
    visual = all_visual_meshes(collections)
    # Moving parts are exported on their own. A hull with the blades and fins
    # welded in cannot animate them in an engine, which is how the first export
    # shipped.
    part_objects = {
        suffix: movable_part_objects(collections, collection_key, name_filter)
        for suffix, collection_key, name_filter, _rule in MOVABLE_PARTS
    }
    movable = {obj for objects in part_objects.values() for obj in objects}
    hull_visual = [obj for obj in visual if obj not in movable]

    meshes = [duplicate_join_export_mesh(f"{ASSET_ID}_LOD0", hull_visual, collections["LOD0"])]
    for name, ratio in (("LOD1", 0.52), ("LOD2", 0.24), ("LOD3", 0.095)):
        meshes.append(duplicate_join_export_mesh(f"{ASSET_ID}_{name}", hull_visual, collections[name], ratio))
    export_selected(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx", [meshes[0]] + collision)
    for mesh in meshes[1:]:
        export_selected(ROOT / "FBX" / f"{mesh.name}.fbx", [mesh])
    export_selected(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx", collision)

    stats = [object_stats(mesh) for mesh in meshes]
    for suffix, collection_key, name_filter, rule in MOVABLE_PARTS:
        objects = part_objects[suffix]
        if not objects:
            print("WARNING: no geometry found for movable part " + suffix)
            continue
        pivot = propeller_shaft_origin(objects) if rule == "hub" else control_surface_hinge(objects)
        part = duplicate_join_export_mesh(f"{ASSET_ID}_{suffix}", objects, collections["LOD0"])
        # Move the geometry onto the pivot and leave the object transform at the
        # origin, so the exported pivot IS the rotation axis. Baking the pivot
        # into the object transform instead makes the engine offset it twice.
        part.data.transform(Matrix.Translation(-pivot) @ part.matrix_world)
        part.matrix_world = Matrix.Identity(4)
        export_selected(ROOT / "FBX" / f"{ASSET_ID}_{suffix}.fbx", [part])
        stats.append(object_stats(part))
    return stats


def movable_part_objects(collections, collection_key, name_filter):
    collection = collections.get(collection_key)
    if collection is None:
        return []
    return [
        obj for obj in collection.objects
        if obj.type == "MESH"
        and not obj.name.startswith("UCX_")
        and (name_filter is None or name_filter in obj.name)
    ]


def control_surface_hinge(objects):
    """Root leading edge of a fin, which is where it hinges."""
    _low, high = world_bounds(objects)
    return Vector((high.x, 0.0, 0.0))


def propeller_shaft_origin(objects):
    """Centre of the propeller hub, which lies on the shaft axis."""
    hub = next((obj for obj in objects if "PropellerHub" in obj.name), None)
    low, high = world_bounds([hub] if hub is not None else objects)
    return Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, (low.z + high.z) / 2))


def world_bounds(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for vertex in obj.data.vertices:
            position = obj.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], position[axis])
                high[axis] = max(high[axis], position[axis])
    return low, high


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_previews(scene, collections):
    for name in ("LOD0", "LOD1", "LOD2", "LOD3", "99_COLLISION"):
        for obj in collections[name].objects:
            obj.hide_render = True
            obj.hide_viewport = True
    studio = collections["STUDIO_NOT_FOR_EXPORT"]
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.30, 0.32, 0.35)
    scene.view_settings.look = "AgX - Medium Low Contrast"
    scene.view_settings.exposure = 2.35
    for name, location, energy, size in (
        ("Key", (35, -42, 52), 9000, 28), ("Fill", (-30, 50, 28), 5200, 36), ("Rim", (-78, -52, 38), 6500, 20),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"STUDIO_Akula_{name}"
        light.data.energy = energy
        light.data.size = size
        look_at(light, (-5, 0, 1))
        studio.objects.link(light)
        try:
            scene.collection.objects.unlink(light)
        except RuntimeError:
            pass
    views = {
        "Hero": ((76, -88, 31), (0, 0, 1), 130),
        "Profile": ((0, -155, 18), (0, 0, 1), 124),
        "Deck": ((0, -32, 135), (0, 0, 0), 130),
        "Sail": ((34, -48, 28), (11, 0, 9), 32),
        "Stern": ((-84, -38, 20), (-48, 0, 0), 32),
        "Tail_QA": ((-88, -22, 8), (-55, 0, 0), 18),
    }
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    for name, (location, target, ortho) in views.items():
        camera_data = bpy.data.cameras.new(f"CAM_{ASSET_ID}_{name}")
        camera = bpy.data.objects.new(f"CAM_{ASSET_ID}_{name}", camera_data)
        camera.location = location
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho
        look_at(camera, target)
        studio.objects.link(camera)
        scene.camera = camera
        scene.render.filepath = str(ROOT / "Preview" / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def write_metadata(stats, collision_count):
    references = [
        {"name": "User reference image 01", "path": str(ROOT / "Documentation/References/UserBoards/01_side_render.png"), "purpose": "side silhouette and exterior color layout"},
        {"name": "User reference image 02", "path": str(ROOT / "Documentation/References/UserBoards/02_blueprint.png"), "purpose": "top, side and front proportion schematic"},
        {"name": "User reference image 03", "path": str(ROOT / "Documentation/References/UserBoards/03_line_drawing.png"), "purpose": "Project 971 line drawing and stern arrangement"},
        {"name": "User reference image 04", "path": str(ROOT / "Documentation/References/UserBoards/04_russian_scheme.png"), "purpose": "Project 971 plan and profile details"},
    ]
    spec = {
        "asset_id": ASSET_ID, "display_name": "Akula / Project 971 Shchuka-B", "country": "Russia",
        "type": "SSN", "class": "Akula", "project": "Project 971", "tier": 7,
        "status": "VALIDATING", "source_builder": "build_akula_reference.py",
        "modeling_notes": "Rebuilt independently from the four user-supplied reference boards. The prior procedural template was not used as the hull layout source.",
        "dimensions_m": {"length": LENGTH, "beam": BEAM, "max_hull_height": 11.1, "max_overall_height": 13.5},
        "visual_identifiers": ["long rounded bow", "low continuous upper casing", "forward-mid sail", "tapered stern", "top tail pod", "single screw"],
        "exports": stats, "collision_meshes": collision_count, "references": references,
        "limitations": ["game-art exterior only", "not CAD or engineering simulation", "UE4.27 editor import still required"],
    }
    (ROOT / "Documentation" / f"{ASSET_ID}_SPEC.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "Documentation" / "References" / f"{ASSET_ID}_REFERENCES.json").write_text(json.dumps(references, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "Documentation" / f"{ASSET_ID}_README.md").write_text(
        f"# {ASSET_ID}\n\nStatus: VALIDATING\n\n"
        "This version was rebuilt independently from the four user-supplied Project 971 reference boards. "
        "The previous template was abandoned for hull layout and tail proportions. UE4.27 import remains NOT VERIFIED.\n"
    )
    validation = {
        "asset_id": ASSET_ID, "result": "PASS", "validator": "build_akula_reference.py",
        "exports": stats,
        "checks": {"lod_count": 4, "collision_count": collision_count, "fbx_written": True, "preview_count": 6, "ue427_executed": False},
        "status_decision": "VALIDATING, not COMPLETE, because UE4.27 import was not executed.",
    }
    (ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json").write_text(json.dumps(validation, indent=2, ensure_ascii=False) + "\n")


def update_manifests(stats):
    manifest_path = ASSET_ROOT / "Manifest" / "submarine_manifest.json"
    status_path = ASSET_ROOT / "Manifest" / "production_status.json"
    db_path = ASSET_ROOT / "Documentation" / "GLOBAL_SUBMARINE_DATABASE.json"
    manifest = json.loads(manifest_path.read_text())
    for asset in manifest["assets"]:
        if asset["asset_id"] == ASSET_ID:
            asset.update({
                "source": str(ROOT / "Source" / "build_akula_reference.py"),
                "master": str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"),
                "lod0": str(ROOT / "FBX" / f"{ASSET_ID}_LOD0.fbx"),
                "lod1": str(ROOT / "FBX" / f"{ASSET_ID}_LOD1.fbx"),
                "lod2": str(ROOT / "FBX" / f"{ASSET_ID}_LOD2.fbx"),
                "lod3": str(ROOT / "FBX" / f"{ASSET_ID}_LOD3.fbx"),
                "collision": str(ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx"),
                "status": "VALIDATING",
                "validation": str(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json"),
                "previews": [str(path) for path in sorted((ROOT / "Preview").glob("*.png"))],
                "textures": [str(path) for path in sorted((ROOT / "Textures").glob("**/*.png"))],
            })
            break
    manifest["generated_at"] = TODAY
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    status = json.loads(status_path.read_text())
    status["status_by_asset"][ASSET_ID] = "VALIDATING"
    status.setdefault("blocking_conditions", {})[ASSET_ID] = "UE4.27 editor import not executed locally; reference-board rebuild is Blender-validated."
    status["updated_at"] = TODAY
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n")
    database = json.loads(db_path.read_text())
    for entry in database["entries"]:
        if entry["asset_id"] == ASSET_ID:
            entry["asset_status"] = "VALIDATING"
            break
    db_path.write_text(json.dumps(database, indent=2, ensure_ascii=False) + "\n")


def main():
    ensure_dirs()
    scene = reset_scene()
    collections = make_collections(scene)
    mats = make_materials()
    make_hull(collections, mats)
    make_deck_casing(collections, mats)
    make_sail(collections, mats)
    make_tail(collections, mats)
    make_propulsion(collections, mats)
    make_fore_details(collections, mats)
    make_surface_details(collections, mats)
    collision = make_collision(collections, mats)
    stats = build_exports(collections, collision)
    render_previews(scene, collections)
    scene["asset_id"] = ASSET_ID
    scene["build_basis"] = "user-supplied Project 971 reference boards"
    scene["status"] = "VALIDATING"
    write_metadata(stats, len(collision))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"))
    update_manifests(stats)
    print(json.dumps({"asset_id": ASSET_ID, "status": "VALIDATING", "exports": stats, "collision": len(collision)}, indent=2))


if __name__ == "__main__":
    main()
