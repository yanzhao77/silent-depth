# Run inside Blender with: blender --background ASSET.blend --python Tools/export_ue427.py -- --asset-id RU_SSBN_Typhoon --out /path/file.fbx
import argparse, sys
from pathlib import Path
import bpy

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--asset-id', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--collection', default=None)
    return p.parse_args(argv)

args = parse_args()
if Path(args.out).exists():
    raise RuntimeError(f'Refusing to overwrite existing export: {args.out}')
objects = []
if args.collection:
    col = bpy.data.collections.get(args.collection)
    if not col:
        raise RuntimeError(f'Missing collection: {args.collection}')
    objects = [o for o in col.objects if o.type == 'MESH']
else:
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.name.startswith('SUB_') or o.name.startswith('UCX_'))]
if not objects:
    raise RuntimeError('No exportable SUB_/UCX_ mesh objects found')
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.export_scene.fbx(filepath=args.out, use_selection=True, object_types={'MESH'}, global_scale=1.0, apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS', axis_forward='-Y', axis_up='Z', use_space_transform=True, bake_space_transform=False, use_mesh_modifiers=True, mesh_smooth_type='FACE', use_tspace=True, add_leaf_bones=False, bake_anim=False, path_mode='STRIP', embed_textures=False)
print(f'EXPORTED_UE427_FBX={args.out}')
