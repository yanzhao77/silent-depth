#!/usr/bin/env python3
"""在既有潜艇资产上增量生成武器插座（SOCKET_*），不修改原始潜艇模型。

用法（在 Blender 内运行）：
    blender --background --factory-startup --python weapon_socket_pass_blender.py -- \
        --jobs <socket_jobs.json>

每个 job：
    {asset_id, master_blend, output_dir, sockets: [{name, kind, location, index}], dimensions}

约束：
- 只读取潜艇 MASTER.blend，产物写入独立的 Sockets/ 目录，原始文件不被覆盖。
- 插座是表现层接口（Empty），不参与任何仿真真值推导。
- 位置由公开尺寸与发射器布局推导（艏部发射管、指挥台后部导弹舱等），不推测内部结构。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', required=True)
    return parser.parse_args(argv)


def mesh_bounds() -> tuple[Vector, Vector]:
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            minimum = Vector((min(minimum[i], world[i]) for i in range(3)))
            maximum = Vector((max(maximum[i], world[i]) for i in range(3)))
    return minimum, maximum


def socket_position(kind: str, index: int, count: int, minimum: Vector, maximum: Vector,
                    dimensions: dict) -> Vector:
    length = maximum.x - minimum.x
    height = maximum.z - minimum.z
    beam = maximum.y - minimum.y
    centre_z = (minimum.z + maximum.z) * 0.5
    hull_half_height = height * 0.5

    if kind in ('TORPEDO_TUBE', 'MISSILE_TUBE'):
        # 艏部发射管：靠近艏端，垂直成对排列（避开中轴）。
        column = (index - 1) // 2
        side = 1 if index % 2 else -1
        x = maximum.x - length * (0.035 + 0.012 * column)
        z = centre_z + side * hull_half_height * 0.34
        return Vector((x, 0.0, z))
    if kind == 'VLS':
        # 垂直发射装置：指挥台围壳前后甲板，成对横向排列。
        per_row = max(4, int(math.ceil(math.sqrt(max(count, 1)))))
        row = (index - 1) // per_row
        column = (index - 1) % per_row
        x = maximum.x - length * (0.30 + 0.055 * row)
        y = (column - (per_row - 1) * 0.5) * (beam * 0.28 / max(per_row - 1, 1) * 2.0)
        return Vector((x, y, maximum.z - height * 0.02))
    # 弹道导弹发射筒：沿导弹甲板纵向排列。
    per_row = 4
    row = (index - 1) // per_row
    column = (index - 1) % per_row
    x = maximum.x - length * (0.30 + 0.085 * row)
    y = (column - (per_row - 1) * 0.5) * (beam * 0.22)
    return Vector((x, y, maximum.z - height * 0.015))


def build_job(job: dict) -> dict:
    bpy.ops.wm.open_mainfile(filepath=job['master_blend'])
    minimum, maximum = mesh_bounds()
    if minimum.x > maximum.x:
        raise RuntimeError('未在潜艇主文件中找到网格对象')

    created = []
    grouped: dict[str, list[dict]] = {}
    for socket in job['sockets']:
        grouped.setdefault(socket['kind'], []).append(socket)

    for kind, items in grouped.items():
        items.sort(key=lambda item: item['name'])
        for index, socket in enumerate(items, start=1):
            position = socket_position(kind, index, len(items), minimum, maximum, job.get('dimensions') or {})
            empty = bpy.data.objects.new(socket['name'], None)
            empty.empty_display_type = 'ARROWS'
            empty.empty_display_size = max(job.get('dimensions', {}).get('length', 100.0) * 0.01, 0.5)
            empty.location = position
            bpy.context.scene.collection.objects.link(empty)
            created.append({'name': socket['name'], 'kind': kind, 'location_m': [round(v, 4) for v in position]})

    output_dir = Path(job['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    blend_path = output_dir / f"{job['asset_id']}_SOCKETS.blend"
    fbx_path = output_dir / f"{job['asset_id']}_SOCKETS.fbx"
    if blend_path.exists() or fbx_path.exists():
        raise RuntimeError(f'拒绝覆盖已存在的插座产出：{blend_path}')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type == 'EMPTY' and obj.name.startswith('SOCKET_'):
            obj.select_set(True)
    bpy.ops.export_scene.fbx(
        filepath=str(fbx_path), use_selection=True, object_types={'EMPTY'}, global_scale=1.0,
        apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS', axis_forward='-Y',
        axis_up='Z', use_space_transform=True, bake_space_transform=False,
        add_leaf_bones=False, bake_anim=False, path_mode='STRIP', embed_textures=False,
    )
    return {
        'asset_id': job['asset_id'],
        'status': 'OK',
        'source_master': job['master_blend'],
        'source_master_modified': False,
        'sockets_blend': str(blend_path),
        'sockets_fbx': str(fbx_path),
        'socket_count': len(created),
        'sockets': created,
        'bounds_m': {
            'min': [round(v, 3) for v in minimum],
            'max': [round(v, 3) for v in maximum],
        },
    }


def main() -> int:
    args = parse_args()
    jobs = json.loads(Path(args.jobs).read_text(encoding='utf-8'))['jobs']
    results = []
    for job in jobs:
        try:
            results.append(build_job(job))
        except Exception as error:  # 单个平台失败不影响其他平台
            import traceback
            results.append({
                'asset_id': job.get('asset_id'),
                'status': 'FAILED',
                'error': f'{type(error).__name__}: {error}',
                'traceback': traceback.format_exc()[-1200:],
            })
    print('SOCKET_PASS_RESULT=' + json.dumps(results, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
