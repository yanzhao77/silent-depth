import bpy
import math
import os
from mathutils import Vector

OUT_DIR = os.environ.get('SILENT_DEPTH_GLB_OUT', '/home/ubuntu/v23_generated_models')

# Authoring intent: an original, fictional, cold-war inspired diesel-electric
# silhouette. It contains no third-party geometry, decals, insignia or textures.
MATERIALS = {
    'PaintedSteel': ((0.105, 0.165, 0.215, 1.0), 0.48, 0.74),
    'WetMetal': ((0.135, 0.225, 0.305, 1.0), 0.22, 0.84),
    'Rubber': ((0.018, 0.027, 0.035, 1.0), 0.83, 0.08),
    'Glass': ((0.050, 0.150, 0.195, 1.0), 0.10, 0.26),
    'Bronze': ((0.290, 0.175, 0.055, 1.0), 0.29, 0.86),
    'Deck': ((0.105, 0.130, 0.145, 1.0), 0.64, 0.35),
    'WaterlineDirt': ((0.120, 0.130, 0.090, 1.0), 0.86, 0.04),
}


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        # Keep named materials created by the next step isolated per export.
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def make_materials():
    result = {}
    for name, (rgba, roughness, metallic) in MATERIALS.items():
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if name == 'Glass':
            bsdf.inputs['Transmission Weight'].default_value = 0.08
            bsdf.inputs['Coat Weight'].default_value = 0.25
        result[name] = material
    return result


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def smooth(obj):
    if hasattr(obj.data, 'polygons'):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def sphere(name, location, scale, material, segments, rings):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    assign(obj, material)
    return obj


def cylinder(name, location, radius, depth, material, vertices, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    bevel = obj.modifiers.new('edge-softening', 'BEVEL')
    bevel.width = min(radius * 0.12, 0.05)
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    smooth(obj)
    return obj


def cube(name, location, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel > 0:
        modifier = obj.modifiers.new('soft-corners', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        smooth(obj)
    return obj


def parent(root, *objects):
    for obj in objects:
        obj.parent = root


def build_submarine(lod):
    clear_scene()
    mats = make_materials()
    root = bpy.data.objects.new(f'SD_HeroSubmarine_LOD{lod}', None)
    bpy.context.collection.objects.link(root)
    root['asset_class'] = 'hero-submarine'
    root['lod'] = lod
    root['authoring'] = 'SILENT DEPTH original project-owned geometry'
    root.rotation_euler[2] = math.pi / 2

    segments = (64, 40, 24, 16)[lod]
    rings = (32, 20, 12, 8)[lod]
    parts = []

    # A single smooth, elongated pressure hull establishes a non-boxy profile.
    hull = sphere('pressure-hull', (0, 0, 0), (9.7, 1.65, 1.85), mats['PaintedSteel'], segments, rings)
    parts.append(hull)
    top_hull = sphere('upper-hull-wet-sheen', (0.15, 0, 0.52), (8.95, 1.47, 1.22), mats['WetMetal'], segments, max(8, rings - 4))
    parts.append(top_hull)
    waterline = cylinder('waterline-grime-band', (0, 0, -0.05), 1.70, 18.5, mats['WaterlineDirt'], max(16, segments // 2), rotation=(0, math.pi / 2, 0))
    waterline.scale = (1.0, 1.0, 0.09)
    parts.append(waterline)

    # Sail/conning tower and bridge window band.
    sail = cube('rounded-sail', (-0.75, 0, 2.00), (1.35, 0.82, 1.58), mats['PaintedSteel'], 0.28)
    parts.append(sail)
    bridge = cube('bridge-window-band', (-0.73, -0.85, 2.18), (0.73, 0.055, 0.31), mats['Glass'], 0.035)
    parts.append(bridge)
    deck = cube('deck-casing', (0.3, 0, 1.30), (6.7, 1.02, 0.12), mats['Deck'], 0.09)
    parts.append(deck)

    # Stern, planes, rudder and shaft stay distinct at all visibility levels.
    stern_plane = cube('stern-horizontal-plane', (7.1, 0, 0.30), (1.25, 3.0, 0.10), mats['WetMetal'], 0.08)
    rudder = cube('stern-rudder', (7.75, 0, 1.35), (0.16, 0.12, 1.15), mats['WetMetal'], 0.06)
    shaft = cylinder('propeller-shaft', (9.35, 0, 0), 0.21, 1.3, mats['WetMetal'], max(8, segments // 4), rotation=(0, math.pi / 2, 0))
    hub = cylinder('propeller-hub', (10.04, 0, 0), 0.40, 0.33, mats['Bronze'], max(8, segments // 4), rotation=(0, math.pi / 2, 0))
    bow_planes = cube('bow-diving-planes', (-6.3, 0, 0.25), (0.52, 2.65, 0.08), mats['WetMetal'], 0.06)
    parts.extend([stern_plane, rudder, shaft, hub, bow_planes])

    if lod <= 2:
        periscope = cylinder('attack-periscope', (-0.76, 0, 4.25), 0.095, 1.85, mats['WetMetal'], max(8, segments // 4))
        observation = cylinder('observation-periscope', (-0.35, 0.24, 3.95), 0.07, 1.25, mats['WetMetal'], max(8, segments // 4))
        radar = cylinder('radar-antenna-mast', (-1.15, -0.25, 3.78), 0.05, 1.05, mats['WetMetal'], max(8, segments // 4))
        snorkel = cylinder('snorkel-mast', (-0.30, -0.30, 3.65), 0.09, 0.90, mats['Rubber'], max(8, segments // 4))
        parts.extend([periscope, observation, radar, snorkel])

    if lod <= 1:
        for index, x in enumerate((-4.8, -3.0, -1.2, 0.8, 2.8, 4.8)):
            hatch = cylinder(f'deck-hatch-{index}', (x, 0, 1.46), 0.27, 0.055, mats['WetMetal'], 16)
            parts.append(hatch)
        for index, x in enumerate((-5.5, -4.1, 1.8, 3.2)):
            vent = cube(f'ventilation-fairing-{index}', (x, 0, 1.58), (0.25, 0.25, 0.17), mats['Rubber'], 0.04)
            parts.append(vent)
        for side in (-1, 1):
            for index, x in enumerate((-4.4, -2.4, 0.3, 2.3, 4.3)):
                rail = cylinder(f'deck-railing-{side}-{index}', (x, side * 1.10, 1.72), 0.028, 0.45, mats['WetMetal'], 8)
                parts.append(rail)

    if lod == 0:
        for index, x in enumerate((-6.2, -5.2, -2.2, -0.2, 1.8, 3.8, 5.8)):
            panel = cube(f'maintenance-panel-{index}', (x, 0, 1.47), (0.32, 0.58, 0.025), mats['PaintedSteel'], 0.015)
            parts.append(panel)
        for blade in range(5):
            angle = blade * (math.tau / 5.0)
            obj = cube(f'propeller-blade-{blade}', (10.15, math.cos(angle) * 0.46, math.sin(angle) * 0.46), (0.10, 0.15, 0.42), mats['Bronze'], 0.04)
            obj.rotation_euler[0] = angle
            parts.append(obj)
        for side in (-1, 1):
            tube = cylinder(f'forward-torpedo-tube-{side}', (-8.35, side * 0.73, -0.05), 0.22, 0.18, mats['Rubber'], 12, rotation=(0, math.pi / 2, 0))
            parts.append(tube)

    parent(root, *parts)
    return root


def export_lod(lod):
    root = build_submarine(lod)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(OUT_DIR, exist_ok=True)
    filepath = os.path.join(OUT_DIR, f'hero-submarine-lod{lod}.glb')
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    print(filepath)


if __name__ == '__main__':
    for level in range(4):
        export_lod(level)
