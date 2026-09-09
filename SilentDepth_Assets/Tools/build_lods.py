# Run inside Blender against a working copy. This script creates LOD duplicates from MASTER and never saves over the source unless Blender is invoked with an output save path by the caller.
import argparse, sys, bpy
from pathlib import Path

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--asset-id', required=True)
    p.add_argument('--source-collection', default='LOD0')
    return p.parse_args(argv)

args = parse_args()
ratios = {'LOD1': 0.5, 'LOD2': 0.22, 'LOD3': 0.085}
source = bpy.data.collections.get(args.source_collection)
if not source:
    raise RuntimeError(f'Missing source collection {args.source_collection}; build LOD0 from MASTER first')
root = bpy.data.collections.get('90_LOD') or bpy.data.collections.new('90_LOD')
if not root.name in bpy.context.scene.collection.children:
    try:
        bpy.context.scene.collection.children.link(root)
    except Exception:
        pass
for lod, ratio in ratios.items():
    col = bpy.data.collections.get(lod) or bpy.data.collections.new(lod)
    if col.name not in root.children:
        try:
            root.children.link(col)
        except Exception:
            pass
    for obj in source.objects:
        if obj.type != 'MESH':
            continue
        dup = obj.copy(); dup.data = obj.data.copy(); dup.name = obj.name.replace('LOD0', lod) if 'LOD0' in obj.name else f'{obj.name}_{lod}'
        col.objects.link(dup)
        mod = dup.modifiers.new('LOD_Simplification', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
print('LODS_BUILT_FROM_MASTER_COPY')
