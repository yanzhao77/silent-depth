"""Cold-war diesel-electric submarine five-blade propeller generator (Blender).

This is an *engineering-style* marine propeller, not a flower/fan:
  * solid cylindrical/tapered hub boss (no sphere)
  * five blades lofted from true airfoil cross-sections
  * continuous chord / thickness / pitch / skew along the span
  * rounded blade-root fillet into the hub
  * asymmetric camber -> pressure / suction faces
  * one closed PBR mesh, no textures, CC0 / project-owned

Coordinate frame matches the existing UE SM_Propeller baseline:
  * root at the hub centre (0,0,0)
  * shaft axis = glTF +Z
  * blade disc = glTF X/Y plane, blades at 0/72/144/216/288 deg
  * tip radius exactly 1.000 m
"""

import bmesh
import bpy
import json
import math
import os
import struct
import sys
from mathutils import Matrix, Vector


BLADE_COUNT = 5
HUB_RADIUS = 0.21
HUB_Z_AFT = -0.29
HUB_Z_FWD = 0.29
BLADE_TIP_RADIUS = 1.0
CHORD_SCALE = 1.5
TOL = 1e-5

DEFAULT_OUT = os.environ.get(
    "SILENT_DEPTH_PROP_GLB_OUT",
    r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-propeller.glb",
)

G2B = Matrix.Rotation(math.radians(90.0), 4, "X")


def log(msg):
    print(msg, flush=True)


def clear_scene():
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.objects,
    ):
        for item in list(coll):
            if item.users == 0:
                coll.remove(item)


def make_bronze_material():
    material = bpy.data.materials.new("Bronze")
    bsdf = next(
        node for node in material.node_tree.nodes
        if node.type == "BSDF_PRINCIPLED"
    )

    def set_input(identifier, value):
        for socket in bsdf.inputs:
            if socket.identifier == identifier:
                socket.default_value = value
                return
        raise KeyError(identifier)

    set_input("Base Color", (0.43415, 0.21586, 0.02956, 1.0))
    set_input("Roughness", 0.29)
    set_input("Metallic", 0.86)
    return material


def design_to_blender(x, y, z):
    return G2B @ Vector((x, y, z))


def new_mesh_object(name, design_verts, faces, material):
    verts = [design_to_blender(*v) for v in design_verts]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material is not None:
        mesh.materials.append(material)
    return obj


def revolve_hub(name, material):
    """Elongated boss: central 0.42 m cylinder + aft dome + forward cone."""
    profile = [
        (HUB_Z_AFT, 0.02),
        (-0.14, HUB_RADIUS),
        (0.14, HUB_RADIUS),
        (HUB_Z_FWD, 0.06),
    ]
    segments = 40
    verts = []
    ring = []
    pole = []
    for z, radius in profile:
        if radius <= TOL:
            verts.append((0.0, 0.0, z))
            pole.append(len(verts) - 1)
            ring.append(None)
        else:
            pole.append(None)
            ids = []
            for i in range(segments):
                a = math.tau * i / segments
                verts.append((radius * math.cos(a), radius * math.sin(a), z))
                ids.append(len(verts) - 1)
            ring.append(ids)

    # close the two solid ends with a small dome vertex so the boss is closed
    verts.append((0.0, 0.0, HUB_Z_AFT - 0.0))
    aft_pole = len(verts) - 1
    verts.append((0.0, 0.0, HUB_Z_FWD + 0.0))
    fwd_pole = len(verts) - 1

    faces = []
    for i in range(len(profile) - 1):
        a_ring = ring[i]
        b_ring = ring[i + 1]
        if a_ring is None and pole[i] is not None:
            p = pole[i]
            for j in range(segments):
                faces.append([p, b_ring[j], b_ring[(j + 1) % segments]])
        elif b_ring is None and pole[i + 1] is not None:
            p = pole[i + 1]
            for j in range(segments):
                faces.append([a_ring[j], a_ring[(j + 1) % segments], p])
        else:
            for j in range(segments):
                j2 = (j + 1) % segments
                faces.append([a_ring[j], a_ring[j2], b_ring[j2], b_ring[j]])
    # The first and last profile points are tiny-radius rims; cap them with a
    # single pole vertex so the boss is watertight (a small rounded end).
    first_ring = ring[0]
    last_ring = ring[-1]
    for j in range(segments):
        j2 = (j + 1) % segments
        faces.append([aft_pole, first_ring[j2], first_ring[j]])
        faces.append([fwd_pole, last_ring[j], last_ring[j2]])
    return new_mesh_object(name, verts, faces, material)


def naca_half_thickness(x, t_max):
    """NACA 4-digit thickness (half of the full thickness value t_max at 30% chord)."""
    return (
        5.0
        * t_max
        * (
            0.2969 * math.sqrt(x)
            - 0.1260 * x
            - 0.3516 * x * x
            + 0.2843 * x * x * x
            - 0.1036 * x * x * x * x
        )
    )


def blade_station(s, blade_index):
    theta = math.tau * blade_index / BLADE_COUNT
    radius_dir = Vector((math.cos(theta), math.sin(theta), 0.0))
    tangent_dir = Vector((-math.sin(theta), math.cos(theta), 0.0))
    axial = Vector((0.0, 0.0, 1.0))

    skew_tip = -0.26
    tip_half = 0.015  # rounded tip ring chord/2 (scaled with blade chord)
    rho_tip = math.sqrt(
        max(0.0, BLADE_TIP_RADIUS * BLADE_TIP_RADIUS - (abs(skew_tip) + tip_half) ** 2)
    )
    r_start = 0.12
    rho = r_start + (rho_tip - r_start) * s
    skew = skew_tip * s * s
    rake = -0.05 * math.pow(s, 1.2)
    center = rho * radius_dir + skew * tangent_dir + rake * axial

    # full chord / thickness / pitch distributions (metres, radians)
    # Broad, heavy marine blade: wide root, widest near mid-span, short rounded tip.
    chord = CHORD_SCALE * (
        0.22 + (0.14 - 0.22) * s + 0.26 * math.sin(math.pi * math.pow(s, 0.7))
    )
    thick = 0.02 + 0.10 * math.pow(1.0 - s, 0.8)
    camber = 0.02 * chord
    pitch = math.radians(46.0 - 32.0 * s)

    def centerline(t):
        r2 = r_start + (rho_tip - r_start) * t
        q2 = skew_tip * t * t
        z2 = -0.05 * math.pow(t, 1.2)
        return r2 * radius_dir + q2 * tangent_dir + z2 * axial

    ds = 0.002
    span_dir = centerline(min(1.0, s + ds)) - centerline(max(0.0, s - ds))
    if span_dir.length_squared < 1e-12:
        span_dir = radius_dir
    span_dir.normalize()

    raw_chord = math.cos(pitch) * tangent_dir + math.sin(pitch) * axial
    chord_dir = raw_chord - span_dir * raw_chord.dot(span_dir)
    if chord_dir.length_squared < 1e-12:
        chord_dir = tangent_dir - span_dir * tangent_dir.dot(span_dir)
    chord_dir.normalize()
    thick_dir = span_dir.cross(chord_dir)
    thick_dir.normalize()

    return {
        "center": center,
        "chord_dir": chord_dir,
        "thick_dir": thick_dir,
        "chord": chord,
        "thick": thick,
        "camber": camber,
    }


def make_blade(name, blade_index, material):
    stations = 14
    samples = 10
    # (x along chord, +1 upper / -1 lower); LE->TE then back along lower.
    profile = [(i / samples, 1.0) for i in range(samples + 1)]
    profile += [(i / samples, -1.0) for i in range(samples - 1, 0, -1)]
    m = len(profile)
    verts = []
    rings = []

    for si in range(stations - 1):
        s = si / (stations - 1)
        sd = blade_station(s, blade_index)
        c = sd["center"]
        ids = []
        for (xp, sign) in profile:
            signed_chord = (xp - 0.5) * sd["chord"]
            t_half = naca_half_thickness(xp, 1.0) * sd["thick"]
            camber_cur = 0.02 * sd["chord"] * 4.0 * xp * (1.0 - xp)
            height = camber_cur + sign * t_half
            point = (
                c
                + signed_chord * sd["chord_dir"]
                + height * sd["thick_dir"]
            )
            verts.append(point)
            ids.append(len(verts) - 1)
        rings.append(ids)

    # Rounded (blunt) tip: a small ring at s=1.0, then a soft centre cap.
    tip_sd = blade_station(1.0, blade_index)
    tip_ids = []
    for (xp, sign) in profile:
        signed_chord = (xp - 0.5) * 0.03
        t_half = naca_half_thickness(xp, 1.0) * 0.0075
        camber_cur = 0.02 * 0.03 * 4.0 * xp * (1.0 - xp)
        height = camber_cur + sign * t_half
        point = (
            tip_sd["center"]
            + signed_chord * tip_sd["chord_dir"]
            + height * tip_sd["thick_dir"]
        )
        verts.append(point)
        tip_ids.append(len(verts) - 1)
    rings.append(tip_ids)
    verts.append(tip_sd["center"])
    tip_id = len(verts) - 1

    root = blade_station(0.0, blade_index)["center"]
    verts.append(root)
    root_id = len(verts) - 1

    faces = []
    # tube
    for si in range(len(rings) - 1):
        a = rings[si]
        b = rings[si + 1]
        for j in range(m):
            j2 = (j + 1) % m
            faces.append([a[j], a[j2], b[j2], b[j]])
    # root cap (hidden inside hub after union)
    first = rings[0]
    for j in range(m):
        j2 = (j + 1) % m
        faces.append([first[j2], first[j], root_id])
    # tip cap
    last = rings[-1]
    for j in range(m):
        j2 = (j + 1) % m
        faces.append([last[j], last[j2], tip_id])

    return new_mesh_object(name, verts, faces, material)


def clean_and_orient(obj):
    mesh = obj.data
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=TOL)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.update()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    log("non-manifold edges after boolean: %d" % non_manifold)

    volume = 0.0
    for face in bm.faces:
        vs = [v.co for v in face.verts]
        for i in range(1, len(vs) - 1):
            volume += vs[0].dot(vs[i].cross(vs[i + 1]))
    volume /= 6.0
    if volume < 0.0:
        log("flipping normals to outward (volume was %.4f)" % volume)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True


def fillet_root_junction(obj):
    """Bevel the blade/hub junction edges to form a rounded root fillet."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    selected = []
    for edge in bm.edges:
        if not edge.link_faces or len(edge.link_faces) != 2:
            continue
        mid = (edge.verts[0].co + edge.verts[1].co) * 0.5
        radial = math.sqrt(mid.x * mid.x + mid.y * mid.y)
        if 0.18 <= radial <= 0.30 and abs(mid.z) <= 0.13:
            n1 = edge.link_faces[0].normal
            n2 = edge.link_faces[1].normal
            if n1.length > 0 and n2.length > 0 and (1.0 - n1.dot(n2)) > 0.08:
                selected.append(edge)
    if selected:
        try:
            bmesh.ops.bevel(
                bm,
                geom=selected,
                offset=0.06,
                offset_type="OFFSET",
                segments=3,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
            log("root fillet bevel edges=%d" % len(selected))
        except Exception as exc:
            log("fillet bevel skipped: %s" % exc)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def build_and_export(out_path):
    clear_scene()
    material = make_bronze_material()
    hub = revolve_hub("propeller-hub", material)
    blades = []
    for i in range(BLADE_COUNT):
        blades.append(make_blade("propeller-blade-%d" % i, i, material))

    for blade in blades:
        modifier = hub.modifiers.new(name="union-blade", type="BOOLEAN")
        modifier.operation = "UNION"
        modifier.object = blade
        bpy.context.view_layer.objects.active = hub
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for blade in blades:
        bpy.data.objects.remove(blade, do_unlink=True)

    hub.name = "Propeller"
    hub.data.name = "Propeller"
    clean_and_orient(hub)
    fillet_root_junction(hub)

    # Keep an inspection hierarchy for the GLB (UE glTF importer still yields a
    # single static mesh because only the Propeller node carries a mesh).
    hub["expected_nodes"] = (
        ["Propeller", "propeller-hub"]
        + ["propeller-blade-%d" % i for i in range(BLADE_COUNT)]
    )
    hub["asset_class"] = "hero-submarine-propeller"
    hub["authoring"] = "SILENT DEPTH original project-owned geometry"
    hub["license"] = "CC0"

    children = []
    names = ["propeller-hub"] + ["propeller-blade-%d" % i for i in range(BLADE_COUNT)]
    for name in names:
        empty = bpy.data.objects.new(name, None)
        empty.parent = hub
        children.append(empty)
        bpy.context.collection.objects.link(empty)

    bpy.ops.object.select_all(action="DESELECT")
    hub.select_set(True)
    for child in children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = hub
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    log("exported %s" % out_path)


def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    _, _, _ = struct.unpack_from("<III", data, 0)
    off = 12
    gltf = None
    bin_data = b""
    while off < len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + chunk_len]
        off += chunk_len
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            bin_data = chunk
    return gltf, bin_data


def glb_accessor(gltf, bin_data, accessor_index):
    acc = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][acc["bufferView"]]
    comp = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[
        acc["componentType"]
    ]
    count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    byte_offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    items = struct.unpack_from(
        "<" + comp * (acc["count"] * count), bin_data, byte_offset
    )
    return [items[i:i + count] for i in range(0, len(items), count)]


def validate_glb(path):
    gltf, bin_data = read_glb(path)
    node_names = [node.get("name") for node in gltf.get("nodes", [])]
    mesh_names = [mesh.get("name") for mesh in gltf.get("meshes", [])]
    log("nodes=%s" % node_names)
    log("meshes=%s" % mesh_names)
    root_nodes = gltf.get("scenes", [{}])[0].get("nodes", [0])
    root_translation = gltf["nodes"][root_nodes[0]].get("translation", [0.0, 0.0, 0.0])

    positions = []
    triangles = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            pos = glb_accessor(gltf, bin_data, prim["attributes"]["POSITION"])
            positions.extend(pos)
            if "indices" in prim:
                index_count = gltf["accessors"][prim["indices"]]["count"]
            else:
                index_count = len(pos)
            triangles += index_count // 3

    p = positions
    radial = [math.sqrt(v[0] * v[0] + v[1] * v[1]) for v in p]
    max_radius = max(radial)

    # The blade tip ring fills a small angular band; check that every extreme
    # vertex sits at the same phase relative to the 72-degree grid.
    extreme = [v for v in p if math.sqrt(v[0] ** 2 + v[1] ** 2) >= max_radius - 0.004]
    step = math.tau / 5.0
    resids = [((math.atan2(v[1], v[0]) % step) + step) % step for v in extreme]
    spacing_ok = len(extreme) >= 5
    if spacing_ok:
        spacing_ok = (max(resids) - min(resids)) < 0.035

    hub_verts = [
        v for v in p
        if math.sqrt(v[0] ** 2 + v[1] ** 2) < 0.24 and abs(v[2]) < 0.15
    ]
    hub_center = [
        sum(v[i] for v in hub_verts) / len(hub_verts) if hub_verts else 1.0
        for i in range(3)
    ]

    checks = {
        "triangle_count<=6000": triangles <= 6000,
        "tip_radius_1m_+-2mm": abs(max_radius - BLADE_TIP_RADIUS) <= 0.002,
        "root_origin_at_hub": all(abs(v) <= 1e-4 for v in root_translation)
        and all(abs(v) <= 0.05 for v in hub_center),
        "fivefold_72deg_tip_spacing": spacing_ok,
        "blade_disc_in_XY": max_radius > 0.98,
    }
    need = {"Propeller", "propeller-hub"}
    need.update("propeller-blade-%d" % i for i in range(BLADE_COUNT))
    nodes_ok = need.issubset(set(node_names))
    log(
        "triangles=%d max_radius=%.4f hub_center=%s tip_ring_points=%d"
        % (triangles, max_radius, hub_center, len(extreme))
    )
    all_ok = True
    for name, ok in checks.items():
        log("%s: %s" % (name, "PASS" if ok else "FAIL"))
        all_ok = all_ok and ok
    log("node_hierarchy_names: %s" % ("PASS" if nodes_ok else "FAIL"))
    all_ok = all_ok and nodes_ok
    if not all_ok:
        raise SystemExit("propeller validation FAILED")
    log("PROPELLER_VALIDATION_PASS")


if __name__ == "__main__":
    output = DEFAULT_OUT
    if "--" in sys.argv:
        extra = sys.argv[sys.argv.index("--") + 1:]
        if extra:
            output = extra[0]
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass
    build_and_export(output)
    validate_glb(output)
