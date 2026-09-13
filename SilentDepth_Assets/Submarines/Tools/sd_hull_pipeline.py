"""Batch A production pipeline: one parametric hull in, a full asset set out.

Generalised from the hand-written Yasen pipeline, which is the pattern the
finished Akula/Yasen masters follow. Given a hull parameter dict it produces:

    Blend/<ID>_MASTER.blend          master (read-only afterwards)
    FBX/<ID>_LOD0..3.fbx             hull LOD chain (collision on LOD0)
    FBX/<ID>_<PART>.fbx              movable parts, pivots on their own axes
    Collision/<ID>_COLLISION.fbx     UCX convex pieces
    GLB/<ID>.glb                     single-file review copy
    Documentation/<ID>_SPEC.json     dimensions, triangles, hashes, limitations
    Documentation/<ID>_ASSEMBLY.json anchors, parts, motion and sockets
    Validation/<ID>_VALIDATION.json  topology, contacts, export metrics
    Preview/*.png                    rendered evidence for human review
    Sockets/<ID>_SOCKETS.fbx|.blend  anchor-only reference

Everything is deterministic. The geometry is procedural and follows the
published proportions recorded in the hull's REFERENCE.md; it is not a
measurement of any specific boat, and the SPEC says so.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import sd_hull_library as geo
import sd_anchors

GRAY = '--gray' in sys.argv
#: Skips the renders while still writing every other artifact. Used when the
#: previews already exist and only the documents need refreshing.
NO_PREVIEW = '--no-preview' in sys.argv


def preview_engine() -> str:
    """Cycles for hero shots, EEVEE for the bulk silhouette pass.

    Both write the same views; EEVEE is two orders of magnitude faster, which is
    what makes previews for forty-odd hulls practical. Which one produced a file
    is recorded in the validation document, so nobody has to guess later.
    """
    for value in sys.argv:
        if value.startswith('--preview-engine='):
            return value.split('=', 1)[1].lower()
    return 'cycles'

#: Material slots the pump-jet / screw pipeline creates, in slot order.
PIPELINE_MATERIALS = ['SD_hull', 'SD_coating', 'SD_panel', 'SD_array',
                      'SD_recess', 'SD_metal', 'SD_bronze']


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------
def material(name, color, rough=0.72, metal=0.0):
    mat = bpy.data.materials.new('SD_' + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return mat


def make_materials(params, root: Path):
    """Hull coating, panels, recesses and metals; a seeded texture on the hull."""
    mats = {k: material(k, *args) for k, args in {
        'hull': ((0.026, 0.031, 0.035), 0.76, 0.04),
        'coating': ((0.026, 0.031, 0.035), 0.76, 0.04),
        'panel': ((0.020, 0.025, 0.028), 0.69, 0.07),
        'array': ((0.032, 0.037, 0.039), 0.82, 0.0),
        'recess': ((0.006, 0.008, 0.009), 0.88, 0.0),
        'metal': ((0.12, 0.14, 0.15), 0.40, 0.7),
        'bronze': ((0.34, 0.22, 0.092), 0.34, 0.78),
    }.items()}
    if GRAY:
        for mat in mats.values():
            mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (0.24, 0.24, 0.24, 1)
        return mats

    width, height = 2048, 1024
    rng = np.random.default_rng(params.get('texture_seed', 1))
    v = np.arange(height)[:, None] / height
    base = np.zeros((height, width, 4), dtype=np.float32)
    base[:, :, :3] = (0.026, 0.031, 0.035)
    # Anti-fouling red below the waterline; the boundary is angular on the mesh,
    # so it stays smooth across sections (same trick as the Yasen texture).
    red = np.sin(v * math.tau) < -0.46
    base[:, :, :3] = np.where(red[:, :, None], np.array((0.13, 0.027, 0.019)), base[:, :, :3])
    tile = ((np.arange(width)[None, :] + ((np.arange(height)[:, None] // 26) % 2) * 13) // 26)
    variation = rng.uniform(0.96, 1.04, (height // 26 + 2, width // 26 + 2))
    base[:, :, :3] *= variation[np.arange(height)[:, None] // 26, tile][:, :, None]
    base[:, :, 3] = 1
    image = bpy.data.images.new(f'T_{params["id"]}_Hull_BaseColor', width, height)
    base[:, :, :3] = np.where(base[:, :, :3] <= 0.0031308,
                              base[:, :, :3] * 12.92,
                              1.055 * base[:, :, :3] ** (1 / 2.4) - 0.055)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(base.ravel())
    image.filepath_raw = str(root / 'Textures' / f'{image.name}.png')
    image.file_format = 'PNG'
    image.save()
    image = bpy.data.images.load(image.filepath_raw, check_existing=False)
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    node = mats['hull'].node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mats['hull'].node_tree.links.new(
        node.outputs['Color'], mats['hull'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return mats


# --------------------------------------------------------------------------
# measuring and checking
# --------------------------------------------------------------------------
def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def stats(obj) -> dict:
    obj.data.calc_loop_triangles()
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return {
        'name': obj.name,
        'triangles': len(obj.data.loop_triangles),
        'vertices': len(obj.data.vertices),
        'uv_channels': len(obj.data.uv_layers),
        'dimensions_m': [round(max(p[i] for p in coords) - min(p[i] for p in coords), 5) for i in range(3)],
    }


def topology(obj) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = {
        'boundary_edges': sum(e.is_boundary for e in bm.edges),
        'non_manifold_edges': sum(not e.is_manifold for e in bm.edges),
        'degenerate_faces': sum(f.calc_area() < 1e-10 for f in bm.faces),
    }
    bm.free()
    return result


def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
                                [list(p.vertices) for p in obj.data.polygons])


def unwrap(obj) -> None:
    select([obj])
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UV0')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


def geometry_checks(parts, params) -> dict:
    checks = {obj.name: topology(obj) for obj in geo.PARTS}
    assert all(not any(r.values()) for r in checks.values()), checks
    body = tree(parts['hull'])
    shaft = tree(parts['shaft'])
    # Reported per part: "a plane does not touch the hull" is not actionable,
    # the name of the plane that floats is.
    plane_hits = {obj.name: bool(body.overlap(tree(obj))) for obj in parts['planes']}
    propulsor_hits = {obj.name: bool(shaft.overlap(tree(obj))) for obj in parts['propulsor']}
    contacts = {
        'sail_hull': bool(body.overlap(tree(parts['sail']))),
        'shaft_hull': bool(body.overlap(tree(parts['shaft']))),
        'planes_missing': sorted(name for name, hit in plane_hits.items() if not hit),
        # The propulsor hangs behind the stern: it must meet the shaft, not the
        # hull, otherwise the rotor floats free of the boat.
        'propulsor_missing': sorted(name for name, hit in propulsor_hits.items() if not hit),
    }
    if parts.get('missile_deck') is not None:
        contacts['deck_hull'] = bool(body.overlap(tree(parts['missile_deck'])))
    assert contacts['sail_hull'], 'the sail does not touch the hull'
    assert contacts['shaft_hull'], 'the shaft does not reach the hull'
    assert not contacts['planes_missing'], contacts['planes_missing']
    assert not contacts['propulsor_missing'], contacts['propulsor_missing']
    if 'deck_hull' in contacts:
        assert contacts['deck_hull'], 'the missile deck does not touch the hull'
    return {'topology': checks, 'contacts': contacts,
            'length_m': params['length'], 'beam_m': params['beam']}


def dimension_checks(parts, params) -> dict:
    """Structural facts a person would otherwise have to eyeball.

    The previews are for a human; these assertions catch the failures that are
    actually measurable without one: wrong overall length, an asymmetric boat,
    a sail that does not rise above the hull, a propulsor sitting inside it.
    """
    def bounds(objects):
        coords = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
        return {
            'min': [min(p[i] for p in coords) for i in range(3)],
            'max': [max(p[i] for p in coords) for i in range(3)],
        }

    hull = bounds([parts['hull']])
    result = {}
    length = hull['max'][0] - hull['min'][0]
    beam = hull['max'][1] - hull['min'][1]
    result['hull_length_m'] = round(length, 3)
    result['hull_beam_m'] = round(beam, 3)
    result['sail_top_m'] = round(bounds([parts['sail']])['max'][2], 3)
    result['hull_top_m'] = round(hull['max'][2], 3)

    assert abs(length - params['length']) / params['length'] < 0.01, result
    assert abs(beam - params['beam']) / params['beam'] < 0.02, result
    # Port and starboard must match: an asymmetric hull is a modelling error,
    # not a design choice, for every hull in this batch.
    assert abs(abs(hull['min'][1]) - abs(hull['max'][1])) < 1e-3, result
    # The sail has to stand above the hull, otherwise the silhouette is wrong.
    assert result['sail_top_m'] > result['hull_top_m'] + 2.0, result
    # The propulsor hangs behind the stern tip.
    propulsor = bounds(parts['propulsor'])
    result['propulsor_max_x_m'] = round(propulsor['max'][0], 3)
    assert propulsor['max'][0] <= hull['min'][0] + 1.0, result

    everything = bounds(geo.PARTS)
    result['bounds_with_appendages_m'] = [round(everything['max'][i] - everything['min'][i], 3)
                                          for i in range(3)]
    # Appendages may widen the silhouette, but not by an absurd factor.
    assert result['bounds_with_appendages_m'][1] < params['beam'] * 2.2, result
    return result


def hull_bounds(parts):
    """World-space bounding box of the hull mesh, for anchor placement."""
    coords = [parts['hull'].matrix_world @ v.co for v in parts['hull'].data.vertices]
    low = Vector((min(p.x for p in coords), min(p.y for p in coords), min(p.z for p in coords)))
    high = Vector((max(p.x for p in coords), max(p.y for p in coords), max(p.z for p in coords)))
    return low, high


# --------------------------------------------------------------------------
# collision, exports, previews
# --------------------------------------------------------------------------
def collision(collection, materials, params):
    """Convex pieces along the hull plus the sail, named for UE's UCX import."""
    lo, hi = geo.SURFACE_RANGE
    # Keep the slices off the very tips: a cross-section there is a few
    # centimetres across and its convex hull is a sliver with zero-area faces.
    margin = (hi - lo) * 0.05
    lo, hi = lo + margin, hi - margin
    pieces = []
    slices = 8
    for index in range(slices):
        a = lo + (hi - lo) * index / slices
        b = lo + (hi - lo) * (index + 1) / slices
        bm = bmesh.new()
        for x in np.linspace(a, b, 6):
            for j in range(20):
                bm.verts.new(geo.surface(float(x), math.tau * j / 20))
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        data = bpy.data.meshes.new(f'UCX_{params["id"]}_{index:02d}')
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(f'UCX_{params["id"]}_LOD0_{index:02d}', data)
        collection.objects.link(obj)
        obj.data.materials.append(materials['recess'])
        obj.display_type = 'WIRE'
        pieces.append(obj)
    # Sail collider: its bounding box. A sail is a box, and building it from the
    # tapered mesh's convex hull only invites coplanar zero-area faces.
    sail = bpy.data.objects['SUB_Sail']
    coords = [sail.matrix_world @ v.co for v in sail.data.vertices]
    low = [min(p[i] for p in coords) for i in range(3)]
    high = [max(p[i] for p in coords) for i in range(3)]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            low[0] + (vertex.co.x + 0.5) * (high[0] - low[0]),
            low[1] + (vertex.co.y + 0.5) * (high[1] - low[1]),
            low[2] + (vertex.co.z + 0.5) * (high[2] - low[2]),
        ))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    data = bpy.data.meshes.new(f'UCX_{params["id"]}_Sail')
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(f'UCX_{params["id"]}_LOD0_{slices:02d}', data)
    collection.objects.link(obj)
    obj.data.materials.append(materials['recess'])
    pieces.append(obj)

    # An SSBN's missile casing needs its own collider piece, otherwise rounds
    # would pass straight through the hump.
    deck = bpy.data.objects.get('SUB_MissileDeck')
    if deck is not None:
        coords = [deck.matrix_world @ v.co for v in deck.data.vertices]
        low = [min(p[i] for p in coords) for i in range(3)]
        high = [max(p[i] for p in coords) for i in range(3)]
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for vertex in bm.verts:
            vertex.co = Vector((
                low[0] + (vertex.co.x + 0.5) * (high[0] - low[0]),
                low[1] + (vertex.co.y + 0.5) * (high[1] - low[1]),
                low[2] + (vertex.co.z + 0.5) * (high[2] - low[2]),
            ))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        data = bpy.data.meshes.new(f'UCX_{params["id"]}_Deck')
        bm.to_mesh(data)
        bm.free()
        deck_collider = bpy.data.objects.new(f'UCX_{params["id"]}_LOD0_{len(pieces):02d}', data)
        deck_collider.data.materials.append(materials['recess'])
        deck_collider.display_type = 'WIRE'
        collection.objects.link(deck_collider)
        pieces.append(deck_collider)
    broken = {o.name: topology(o) for o in pieces if any(topology(o).values())}
    assert not broken, broken
    return pieces


def export_fbx(path: Path, objects) -> None:
    select(objects)
    bpy.ops.export_scene.fbx(
        filepath=str(path), use_selection=True, object_types={'MESH'},
        axis_forward='-Y', axis_up='Z', apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_UNITS', mesh_smooth_type='FACE',
        use_tspace=True, add_leaf_bones=False, bake_anim=False,
        path_mode='COPY', embed_textures=True)


def join_copy(collection, objects, name):
    copies = []
    for src in objects:
        obj = bpy.data.objects.new(src.name + '_export', src.data.copy())
        collection.objects.link(obj)
        obj.matrix_world = src.matrix_world.copy()
        copies.append(obj)
    select(copies)
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    return joined


def bake_pivot(obj, pivot):
    """Move the object's origin onto ``pivot`` without moving the geometry.

    UE drives each movable part by placing its component at the hinge and
    rotating it, so the mesh origin has to *be* that hinge. Exporting hull-space
    vertices would make every part sit a boat-length away from its pivot.
    """
    origin = Vector(pivot)
    for vertex in obj.data.vertices:
        vertex.co -= origin
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    return obj


def exports(collection, colliders, parts, params):
    """Hull LOD chain, movable parts, collision FBX and a review GLB."""
    root = Path(params['root'])
    base = join_copy(collection, geo.PARTS, params['id'] + '_LOD0')
    bm = bmesh.new()
    bm.from_mesh(base.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(base.data)
    bm.free()

    meshes = [base]
    for index, ratio in enumerate((0.5, 0.22, 0.08), 1):
        obj = bpy.data.objects.new(f'{params["id"]}_LOD{index}', base.data.copy())
        collection.objects.link(obj)
        select([obj])
        modifier = obj.modifiers.new('LOD_Decimate', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        meshes.append(obj)

    for index, obj in enumerate(meshes):
        select([obj])
        lightmap = obj.data.uv_layers.new(name='UV1_Lightmap')
        obj.data.uv_layers.active = lightmap
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.1, island_margin=0.006)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.data.uv_layers.active_index = 0
        export_fbx(root / 'FBX' / f'{obj.name}.fbx', [obj] + (colliders if index == 0 else []))

    # Movable parts: each becomes its own FBX so UE can drive it separately.
    stern = geo.stern_x() + params.get('stern_plane_inset', 5.0)
    part_groups = {
        'PROPULSOR_01': (parts['propulsor'],
                         (geo.stern_x() - params.get('shaft_inset', 3.4) * 0.35 - 1.0, 0.0, 0.0)),
        'RUDDER_01': (parts['rudder'], (stern, 0.0, 0.0)),
        'STERN_PLANES_01': (parts['stern_planes'], (stern, 0.0, 0.0)),
        'BOW_PLANES_01': (parts['bow_planes'],
                          (params.get('bow_plane_x', params['sail_x']), 0.0, 0.0)),
        'PERISCOPE_01': (parts['masts'][:2] if parts['masts'] else [],
                         (params['masts'][0] if params.get('masts') else params['sail_x'],
                          0.0, params['sail_height'] + 0.6)),
    }
    part_metrics = {}
    for name, (group, pivot) in part_groups.items():
        if not group:
            continue
        joined = join_copy(collection, group, f'{params["id"]}_{name}')
        bake_pivot(joined, pivot)
        export_fbx(root / 'FBX' / f'{params["id"]}_{name}.fbx', [joined])
        part_metrics[name] = stats(joined)
        joined.hide_render = True
        joined.hide_viewport = True

    export_fbx(root / 'Collision' / f'{params["id"]}_COLLISION.fbx', colliders)
    select([base])
    bpy.ops.export_scene.gltf(filepath=str(root / 'GLB' / f'{params["id"]}.glb'),
                              export_format='GLB', use_selection=True, export_yup=True)

    metrics = [stats(obj) for obj in meshes]
    assert metrics[0]['triangles'] < 120000, metrics[0]
    for obj in meshes + colliders:
        obj.hide_render = True
        obj.hide_viewport = True
    return metrics, part_metrics


def aim(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def previews(scene, collection, params, colliders) -> None:
    """Rendered evidence. Cycles keeps it honest; samples stay low on purpose."""
    for obj in colliders:
        obj.hide_render = True
    scene.world = bpy.data.worlds.new('SDStudio')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.62, 0.67, 0.71, 1)
    background.inputs['Strength'].default_value = 0.5
    length = params['length']
    for name, loc, power, size in [
        ('Key', (length * 0.25, -length * 0.36, length * 0.5), 100000, 50),
        ('Fill', (-length * 0.32, length * 0.23, length * 0.27), 65000, 40),
        ('Rim', (-length * 0.5, -length * 0.11, length * 0.25), 38000, 22),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = power
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        aim(obj, (0, 0, 0))
        collection.objects.link(obj)

    engine = preview_engine()
    if engine == 'eevee':
        # Blender 5.2 names the rasteriser BLENDER_EEVEE (the "next" suffix of
        # 4.2 was dropped again); read the enum instead of hard-coding a name.
        available = [item.identifier for item in
                     scene.render.bl_rna.properties['engine'].enum_items]
        scene.render.engine = ('BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in available
                               else 'BLENDER_EEVEE')
        scene.eevee.taa_render_samples = 16
    else:
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 24 if GRAY else 32
        scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    span = length
    views = {
        'Hero': ((span * 0.62, -span * 1.04, span * 0.5), (0, 0, 1), span * 1.08),
        'Profile': ((0, -span * 1.33, 0), (0, 0, 1), span * 1.1),
        'Deck': ((0, 0, span * 1.33), (0, 0, 0), span * 1.1),
        'Stern': ((-span * 0.7, -span * 0.2, span * 0.12), (-span * 0.42, 0, 0), span * 0.27),
        'Propeller': ((-span * 0.62, -span * 0.09, span * 0.06), (-span * 0.5, 0, 0), span * 0.11),
        'Sail': ((span * 0.35, -span * 0.25, span * 0.2), (span * 0.17, 0, 0), span * 0.25),
        'Rear': ((-span * 1.33, 0, 0), (-span * 0.38, 0, 0), span * 0.28),
    }
    for name, (loc, target, scale) in views.items():
        if GRAY and name not in ('Hero', 'Profile', 'Deck'):
            continue
        data = bpy.data.cameras.new('CAM_' + name)
        obj = bpy.data.objects.new('CAM_' + name, data)
        collection.objects.link(obj)
        obj.location = loc
        data.type = 'ORTHO'
        data.ortho_scale = scale
        aim(obj, target)
        scene.camera = obj
        scene.render.filepath = str(Path(params['root']) / 'Preview' /
                                    f'{"Gray_" if GRAY else ""}{name}.png')
        bpy.ops.render.render(write_still=True)
    scene.camera = bpy.data.objects['CAM_Hero']


# --------------------------------------------------------------------------
# assembly / spec
# --------------------------------------------------------------------------
def assembly_document(params, parts, part_metrics, sockets) -> dict:
    stern = round(geo.stern_x() + params.get('stern_plane_inset', 5.0), 3)
    prop_x = round(geo.stern_x() - params.get('shaft_inset', 3.4) * 0.35 - 1.0, 3)
    mast_x = params['masts'][0] if params.get('masts') else params['sail_x']
    hull_x = geo.bow_x() - params.get('tube_x_inset', 3.0)
    return {
        'schemaVersion': 1,
        'assetId': params['id'],
        'units': 'meters',
        'coordinateSystem': {
            'forward': '+X', 'right': '+Y', 'up': '+Z',
            'unrealConversion': '1 Blender meter = 100 Unreal Units',
        },
        'hull': {
            'lods': {f'LOD{i}': f'FBX/{params["id"]}_LOD{i}.fbx' for i in range(4)},
            'collision': {
                'owner': 'hull',
                'path': f'Collision/{params["id"]}_COLLISION.fbx',
                'strategy': 'separate_fbx',
                'sourceObjects': [f'UCX_{params["id"]}_LOD0_{i:02d}' for i in range(9)],
            },
            'sourceObjects': [obj.name for obj in geo.PARTS],
        },
        'parts': [
            {
                'id': 'propulsor_01',
                'exportName': f'{params["id"]}_PROPULSOR_01',
                'parent': 'root',
                'pivotAnchor': f'PIVOT_SUB_{params["id"].split("_", 1)[1]}_PROPULSOR_01',
                'semanticGroup': '20_MOVABLE/PROPULSOR',
                'sourceObjects': [obj.name for obj in parts['propulsor']],
                'mountTransform': {'translation': [prop_x, 0, 0], 'rotationDegrees': [0, 0, 0], 'scale': [1, 1, 1]},
                'motion': {'type': 'rotate', 'axis': [1, 0, 0], 'continuousRotation': True,
                           'stateSource': 'propulsor_rpm'},
                'lodPolicy': {'fallback': 'hide', 'hideBeyondMeters': 2200,
                              'levels': ['LOD0', 'LOD1', 'LOD2'], 'visibleDistanceMeters': [0, 2200]},
                'collision': {'owner': 'none', 'strategy': 'none'},
            },
            {
                'id': 'rudder_01',
                'exportName': f'{params["id"]}_RUDDER_01',
                'parent': 'root',
                'pivotAnchor': f'PIVOT_SUB_{params["id"].split("_", 1)[1]}_RUDDER_01',
                'semanticGroup': '20_MOVABLE/RUDDER',
                'sourceObjects': [obj.name for obj in parts['rudder']],
                'mountTransform': {'translation': [stern, 0, 0], 'rotationDegrees': [0, 0, 0], 'scale': [1, 1, 1]},
                'motion': {'type': 'rotate', 'axis': [0, 0, 1],
                           'rotationRangeDegrees': {'min': -32, 'max': 32}, 'stateSource': 'rudder_angle'},
                'lodPolicy': {'fallback': 'hide', 'hideBeyondMeters': 1700,
                              'levels': ['LOD0', 'LOD1', 'LOD2'], 'visibleDistanceMeters': [0, 1700]},
                'collision': {'owner': 'none', 'strategy': 'none'},
            },
            {
                'id': 'stern_planes_01',
                'exportName': f'{params["id"]}_STERN_PLANES_01',
                'parent': 'root',
                'pivotAnchor': f'PIVOT_SUB_{params["id"].split("_", 1)[1]}_STERN_PLANES_01',
                'semanticGroup': '20_MOVABLE/STERN_PLANES',
                'sourceObjects': [obj.name for obj in parts['stern_planes']],
                'mountTransform': {'translation': [stern, 0, 0], 'rotationDegrees': [0, 0, 0], 'scale': [1, 1, 1]},
                'motion': {'type': 'rotate', 'axis': [0, 1, 0],
                           'rotationRangeDegrees': {'min': -26, 'max': 26}, 'stateSource': 'stern_planes_angle'},
                'lodPolicy': {'fallback': 'hide', 'hideBeyondMeters': 1650,
                              'levels': ['LOD0', 'LOD1', 'LOD2'], 'visibleDistanceMeters': [0, 1650]},
                'collision': {'owner': 'none', 'strategy': 'none'},
            },
            {
                'id': 'bow_planes_01',
                'exportName': f'{params["id"]}_BOW_PLANES_01',
                'parent': 'root',
                'pivotAnchor': f'PIVOT_SUB_{params["id"].split("_", 1)[1]}_BOW_PLANES_01',
                'semanticGroup': '20_MOVABLE/BOW_PLANES',
                'sourceObjects': [obj.name for obj in parts['bow_planes']],
                'mountTransform': {
                    'translation': [round(params.get('bow_plane_x', params['sail_x']), 3), 0, 0],
                    'rotationDegrees': [0, 0, 0], 'scale': [1, 1, 1]},
                'motion': {'type': 'rotate', 'axis': [0, 1, 0],
                           'rotationRangeDegrees': {'min': -25, 'max': 25}, 'stateSource': 'bow_planes_angle'},
                'lodPolicy': {'fallback': 'hide', 'hideBeyondMeters': 1650,
                              'levels': ['LOD0', 'LOD1', 'LOD2'], 'visibleDistanceMeters': [0, 1650]},
                'collision': {'owner': 'none', 'strategy': 'none'},
            },
            {
                'id': 'periscope_01',
                'exportName': f'{params["id"]}_PERISCOPE_01',
                'parent': 'root',
                'pivotAnchor': f'PIVOT_SUB_{params["id"].split("_", 1)[1]}_PERISCOPE_01',
                'semanticGroup': '20_MOVABLE/PERISCOPES',
                'sourceObjects': [obj.name for obj in parts['masts'][:2]],
                'mountTransform': {'translation': [round(mast_x, 3), 0, round(params['sail_height'] + 0.6, 3)],
                                   'rotationDegrees': [0, 0, 0], 'scale': [1, 1, 1]},
                'motion': {'type': 'translate', 'axis': [0, 0, 1],
                           'translationRangeMeters': {'min': 0, 'max': 2.6},
                           'stateSource': 'periscope_extension'},
                'lodPolicy': {'fallback': 'hide', 'hideBeyondMeters': 850,
                              'levels': ['LOD0', 'LOD1'], 'visibleDistanceMeters': [0, 850]},
                'collision': {'owner': 'none', 'strategy': 'none'},
            },
        ],
        'sockets': sockets,
        'validation': {
            'requiredParts': ['propulsor_01', 'rudder_01', 'stern_planes_01',
                              'bow_planes_01', 'periscope_01'],
            'requiredSockets': sd_anchors.REQUIRED_SOCKETS,
        },
        'templateNotice': (
            'Batch A procedural hull. Source objects come from this MASTER; anchor names follow '
            'DEC-002. Motion ranges are gameplay configuration values, not submarine engineering '
            'measurements.'),
        'partMetrics': part_metrics,
    }


def spec_document(params, metrics, root: Path, checks) -> dict:
    hashes = {}
    for relative in (
        [f'Blend/{params["id"]}_MASTER.blend', f'GLB/{params["id"]}.glb',
         f'Collision/{params["id"]}_COLLISION.fbx']
        + [f'FBX/{params["id"]}_LOD{i}.fbx' for i in range(4)]
        + [f'FBX/{params["id"]}_{name}.fbx' for name in
           ('PROPULSOR_01', 'RUDDER_01', 'STERN_PLANES_01', 'BOW_PLANES_01', 'PERISCOPE_01')]
        + [f'Textures/T_{params["id"]}_Hull_BaseColor.png']
    ):
        path = root / relative
        if path.is_file():
            hashes[relative] = sha256(path)
    return {
        'asset_id': params['id'],
        'status': 'VALIDATING',
        'revision': 'batch_a_procedural_v1',
        'country': params['country'],
        'type': params['type'],
        'class': params['class'],
        'project': params.get('project', ''),
        'tier': params['tier'],
        'provenance': '本地程序化生成网格与程序化贴图，无第三方模型或图片进入运行时包',
        'license': '本项目可商业使用的原创生成资产',
        'materials': PIPELINE_MATERIALS,
        'textures': [f'Textures/T_{params["id"]}_Hull_BaseColor.png'],
        'dimensions_m': {
            'length_overall': params['length'],
            'hull_beam': params['beam'],
            'bounds_with_appendages': metrics[0]['dimensions_m'],
        },
        'exports': metrics,
        'sha256': hashes,
        'reference_fidelity': 'PROCEDURAL: 比例来自 REFERENCE.md，外形不是任何具体艇的实测复制',
        'ue427_executed': False,
        'limitations': [
            '程序化外形，未与实物或照片逐点比对',
            '舱盖、阵列与推进器为外观近似',
            'UE4.27 尚未实际导入与人工验收',
        ],
        'geometry': checks,
    }


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------
def run(params: dict) -> None:
    root = Path(params['root'])
    for folder in ('Source', 'Blend', 'FBX', 'GLB', 'Collision', 'LOD', 'Textures',
                   'Preview', 'Validation', 'Documentation', 'Sockets'):
        (root / folder).mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    collections = {}
    for name in ('EDITABLE', 'EXPORTS', 'COLLISION', 'STUDIO'):
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collections[name] = collection

    materials = make_materials(params, root)
    parts = geo.build(collections['EDITABLE'], materials, not GRAY, params)
    bpy.context.view_layer.update()
    checks = geometry_checks(parts, params)
    checks['dimensions'] = dimension_checks(parts, params)

    # The standard equipment anchors (DEC-002). They are built for every hull so
    # the equipment layer never has to special-case one boat, and the audit goes
    # into the validation document like every other check.
    low, high = hull_bounds(parts)
    anchor_rows, socket_entries = sd_anchors.build(
        collections['EDITABLE'], params['id'], low, high, params['sail_height'])
    outside = [row['anchor'] for row in anchor_rows if not row['inside_hull_envelope']]
    assert not outside, f'anchors outside the hull envelope: {outside}'
    checks['anchors'] = anchor_rows

    colliders = collision(collections['COLLISION'], materials, params)
    metrics, part_metrics = ([], {})
    if not GRAY:
        for obj in geo.PARTS:
            unwrap(obj)
        metrics, part_metrics = exports(collections['EXPORTS'], colliders, parts, params)
    if not NO_PREVIEW:
        previews(scene, collections['STUDIO'], params, colliders)

    if GRAY:
        write(root / 'Validation' / f'{params["id"]}_GRAYBOX.json', checks)
        print(f'GRAYBOX OK {params["id"]}: {checks["contacts"]}')
        return

    scene['asset_id'] = params['id']
    scene['status'] = 'VALIDATING'
    select([parts['hull']])
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(root / 'Blend' / f'{params["id"]}_MASTER.blend'))

    write(root / 'Documentation' / f'{params["id"]}_ASSEMBLY.json',
          assembly_document(params, parts, part_metrics, socket_entries))
    spec = spec_document(params, metrics, root, checks)
    write(root / 'Documentation' / f'{params["id"]}_SPEC.json', spec)
    write(root / 'Validation' / f'{params["id"]}_VALIDATION.json', {
        'result': 'PASS',
        'geometry': checks,
        'exports': metrics,
        'part_exports': part_metrics,
        'anchor_count': len(anchor_rows),
        'preview_engine': 'none' if NO_PREVIEW else preview_engine(),
        'ue427_executed': False,
        'reference_fidelity': spec['reference_fidelity'],
    })
    print(f'BUILT {params["id"]}: LOD0 {metrics[0]["triangles"]} tri, '
          f'{len(part_metrics)} part FBX, contacts {checks["contacts"]}')
