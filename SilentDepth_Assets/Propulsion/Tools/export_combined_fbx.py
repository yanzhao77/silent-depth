"""导出 UE 用的合并 FBX：LOD0 可见网格 + UCX 凸包碰撞。

Typhoon 母版的 `SM_Typhoon.fbx` 就是这种形态（一个可见网格 + 若干 UCX 凸包），
UE4.27 的 FBX 导入器据此自动生成简单碰撞。本工具直接从已存在的 MASTER.blend
重新导出，不重算几何、不渲染预览，因此可以在校验之后安全补跑。

用法：
  blender --background --factory-startup --python export_combined_fbx.py -- \
      --root <Propulsion 根> [--ids A B ...]
"""
import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

import propulsion_common as common  # noqa: E402

CATEGORIES = ['Propellers', 'PumpJets', 'Shafts', 'Thrusters']


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--ids', nargs='*')
    return parser.parse_args(argv)


def main():
    args = parse_args()
    root = Path(args.root).resolve()
    written = []
    for category in CATEGORIES:
        for asset_dir in sorted((root / category).glob('*')):
            if not asset_dir.is_dir():
                continue
            asset_id = asset_dir.name
            if args.ids and asset_id not in args.ids:
                continue
            blend = asset_dir / 'Blend' / f'{asset_id}_MASTER.blend'
            if not blend.exists():
                print(f'跳过（无 MASTER）：{asset_id}')
                continue
            bpy.ops.wm.open_mainfile(filepath=str(blend))
            lod0 = bpy.data.collections.get('LOD0')
            collision = bpy.data.collections.get('COLLISION')
            objects = []
            if lod0:
                objects.extend(lod0.objects)
            if collision:
                objects.extend(collision.objects)
            meshes = [obj for obj in objects if obj.type == 'MESH']
            if not meshes:
                print(f'跳过（无可导出网格）：{asset_id}')
                continue
            target = asset_dir / 'FBX' / f'{asset_id}_COMBINED.fbx'
            common.export_selection(meshes, target)
            print(f'COMBINED_EXPORTED={target}')
            written.append(str(target))
    print(f'COMBINED_EXPORT_COUNT={len(written)}')


if __name__ == '__main__':
    main()
