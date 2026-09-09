# Run inside Blender. Generates standard orthographic preview cameras/renders for a prepared asset scene.
import argparse, sys, bpy, math
from pathlib import Path
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
p = argparse.ArgumentParser(); p.add_argument('--out-dir', required=True); p.add_argument('--asset-id', required=True); args = p.parse_args(argv)
out = Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
views = {'Front':(0,-220,40),'Side':(220,0,40),'Top':(0,0,260),'Rear':(0,220,40),'Perspective':(180,-180,95)}
for name, loc in views.items():
    cam = bpy.data.objects.new(f'CAM_{args.asset_id}_{name}', bpy.data.cameras.new(f'CAM_{args.asset_id}_{name}'))
    bpy.context.scene.collection.objects.link(cam); cam.location = loc; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 210
    direction = -cam.location.to_track_quat('-Z','Y'); cam.rotation_euler = direction.to_euler()
    bpy.context.scene.camera = cam; bpy.context.scene.render.filepath = str(out / f'{args.asset_id}_{name}.png')
    bpy.ops.render.render(write_still=True)
print(f'PREVIEWS_WRITTEN={out}')
