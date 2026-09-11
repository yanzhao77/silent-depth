#!/usr/bin/env python3
"""从既有 MASTER.blend 单独导出 UE4.27 兼容 FBX（§26、§27）。

用法：
    blender --background MASTER.blend --python Tools/export_sensor_ue427.py -- \
        --sensor-id US_SONAR_LAB --out-dir Bow/US_SONAR_LAB --force

导出约定（与潜艇工厂一致）：
    FBX 2018 兼容（二进制版本 7400）
    axis_forward=-Y, axis_up=Z, global_scale=1.0, apply_unit_scale=True
    仅导出选定网格；不嵌入贴图；不烘焙动画。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from sensor_common import SENSORS_ROOT  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--sensor-id', required=True)
    parser.add_argument('--out-dir', required=True, help='相对 Sensors/ 的资产目录')
    parser.add_argument('--force', action='store_true')
    return parser.parse_args(argv)


def find_object(name: str) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise SystemExit(f'场景中找不到对象：{name}')
    return obj


def export_one(obj: bpy.types.Object, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={'MESH'},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_UNITS',
        axis_forward='-Y',
        axis_up='Z',
        use_space_transform=True,
        bake_space_transform=False,
        use_mesh_modifiers=True,
        mesh_smooth_type='FACE',
        use_tspace=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode='STRIP',
        embed_textures=False,
    )
    print(f'EXPORTED={path}')


def main() -> int:
    args = parse_args()
    root = SENSORS_ROOT / args.out_dir
    targets = [(f'SEN_{args.sensor_id}_LOD{n}', root / 'FBX' / f'{args.sensor_id}_LOD{n}.fbx') for n in range(4)]
    targets.append((f'UCX_SEN_{args.sensor_id}_00', root / 'Collision' / f'{args.sensor_id}_COLLISION.fbx'))
    for _, path in targets:
        if path.exists() and not args.force:
            raise SystemExit(f'拒绝覆盖既有导出：{path}（如需覆盖请加 --force）')
    for name, path in targets:
        export_one(find_object(name), path)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
