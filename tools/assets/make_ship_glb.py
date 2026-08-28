import bpy
import math
import os

OUT_DIR = os.environ.get('SILENT_DEPTH_GLB_OUT', '/home/ubuntu/v23_generated_models')


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)


def material(name, color, roughness, metallic):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return value


def materials():
    return {
        'hull': material('HullPaint', (0.13, 0.16, 0.17), 0.45, 0.68),
        'deck': material('DeckAntiSlip', (0.085, 0.11, 0.12), 0.76, 0.36),
        'wet': material('WetPaint', (0.20, 0.28, 0.30), 0.28, 0.70),
        'glass': material('BridgeGlass', (0.025, 0.085, 0.11), 0.12, 0.25),
        'rust': material('HullWear', (0.24, 0.12, 0.055), 0.72, 0.14),
        'white': material('Superstructure', (0.44, 0.48, 0.46), 0.54, 0.40),
        'red': material('Waterline', (0.20, 0.040, 0.028), 0.62, 0.20),
    }


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if hasattr(obj.data, 'polygons'):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def cube(name, loc, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        modifier = obj.modifiers.new('edge-softening', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cylinder(name, loc, radius, depth, mat, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    smooth(obj)
    return obj


def sphere(name, loc, scale, mat, seg=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    smooth(obj)
    return obj


def finish(root, name):
    for obj in list(bpy.context.scene.objects):
        if obj != root:
            obj.parent = root
    root.rotation_euler[2] = math.pi / 2
    root['asset_class'] = name
    root['authoring'] = 'SILENT DEPTH original project-owned geometry'


def build_destroyer(lod):
    clear()
    m = materials()
    root = bpy.data.objects.new(f'SD_Destroyer_LOD{lod}', None)
    bpy.context.collection.objects.link(root)
    seg = {1: 32, 2: 20, 3: 12}[lod]

    sphere('destroyer-hull', (0, 0, 0), (11.0, 1.75, 1.20), m['hull'], seg, max(8, seg // 2))
    cube('destroyer-deck', (0.0, 0, 0.85), (9.2, 1.22, 0.12), m['deck'], 0.08)
    cube('destroyer-waterline', (0.0, 0, -0.12), (9.0, 1.77, 0.10), m['red'], 0.04)
    cube('forward-superstructure', (-2.5, 0, 1.70), (2.2, 0.95, 0.75), m['white'], 0.10)
    cube('bridge-window-band', (-3.1, -0.97, 1.92), (0.85, 0.035, 0.22), m['glass'], 0.02)
    cube('aft-superstructure', (2.8, 0, 1.42), (1.55, 0.82, 0.45), m['white'], 0.08)
    cylinder('main-radar-mast', (-1.1, 0, 3.05), 0.09, 2.30, m['wet'], 10)
    cube('main-radar-array', (-1.1, 0, 3.72), (0.10, 0.85, 0.13), m['wet'], 0.03)
    cylinder('forward-gun-turret', (-6.5, 0, 1.30), 0.48, 0.35, m['wet'], 16)
    for side in (-1, 1):
        cylinder(f'gun-barrel-{side}', (-7.15, side * 0.16, 1.46), 0.06, 1.25, m['wet'], 8, rotation=(0, math.pi / 2, 0))
    cube('aft-flight-deck', (6.2, 0, 1.04), (2.1, 1.20, 0.06), m['deck'], 0.04)
    cube('stern-hangar', (4.5, 0, 1.50), (0.85, 0.75, 0.45), m['white'], 0.07)

    if lod <= 2:
        for index, x in enumerate((-5.2, -3.9, 0.6, 1.8, 3.2)):
            cylinder(f'deck-fitting-{index}', (x, 0, 1.14), 0.16, 0.10, m['wet'], 10)
        for side in (-1, 1):
            cube(f'sensor-pod-{side}', (-1.1, side * 0.98, 2.30), (0.32, 0.06, 0.20), m['wet'], 0.02)
    if lod == 1:
        for side in (-1, 1):
            for index, x in enumerate((-7.8, -5.8, -3.8, -0.8, 1.6, 3.8, 5.8)):
                cylinder(f'rail-post-{side}-{index}', (x, side * 1.22, 1.20), 0.025, 0.32, m['wet'], 6)
        for index, x in enumerate((-4.6, 0.8, 2.7)):
            cube(f'hull-wear-{index}', (x, -1.76, 0.04), (0.50, 0.02, 0.09), m['rust'], 0.01)
    finish(root, 'destroyer')
    return root


def build_tanker(lod):
    clear()
    m = materials()
    root = bpy.data.objects.new(f'SD_Tanker_LOD{lod}', None)
    bpy.context.collection.objects.link(root)
    seg = {1: 30, 2: 18, 3: 12}[lod]
    sphere('tanker-hull', (0, 0, 0), (15.2, 2.55, 1.62), m['hull'], seg, max(8, seg // 2))
    cube('tanker-deck', (0, 0, 1.22), (12.8, 1.95, 0.11), m['deck'], 0.08)
    cube('tanker-waterline', (0, 0, -0.10), (13.4, 2.54, 0.12), m['red'], 0.04)
    cube('aft-bridge', (9.7, 0, 2.55), (2.0, 1.35, 1.30), m['white'], 0.16)
    cube('bridge-window-band', (9.1, -1.38, 2.72), (0.65, 0.04, 0.27), m['glass'], 0.02)
    cylinder('funnel-stack', (7.5, 0, 4.2), 0.58, 2.60, m['wet'], 16)
    cube('funnel-cap', (7.5, 0, 5.56), (0.63, 0.63, 0.10), m['rust'], 0.05)
    for index, x in enumerate((-9.4, -6.4, -3.4, -0.4, 2.6, 5.0)):
        cylinder(f'cargo-tank-{index}', (x, 0, 1.58), 1.02, 0.35, m['wet'], 18)
    cube('forecastle', (-11.4, 0, 1.52), (1.5, 1.25, 0.34), m['white'], 0.08)
    cylinder('fore-mast', (-9.2, 0, 3.7), 0.07, 2.2, m['wet'], 8)
    if lod <= 2:
        for index, x in enumerate((-8.3, -5.0, -1.9, 1.2, 4.3)):
            cube(f'pipeline-{index}', (x, -0.95, 1.70), (1.05, 0.08, 0.08), m['wet'], 0.02)
    if lod == 1:
        for side in (-1, 1):
            for index, x in enumerate((-10.4, -7.2, -4.0, -0.8, 2.4, 5.6, 8.6)):
                cylinder(f'rail-post-{side}-{index}', (x, side * 1.98, 1.48), 0.024, 0.33, m['wet'], 6)
        for index, x in enumerate((-7.0, -2.5, 2.2)):
            cube(f'hull-wear-{index}', (x, -2.55, 0.05), (0.55, 0.02, 0.10), m['rust'], 0.01)
    finish(root, 'tanker')
    return root


def export(asset, lod, factory):
    root = factory(lod)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(OUT_DIR, exist_ok=True)
    output = os.path.join(OUT_DIR, f'{asset}-lod{lod}.glb')
    bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
    print(output)

for lod in (1, 2, 3):
    export('destroyer', lod, build_destroyer)
    export('tanker', lod, build_tanker)
