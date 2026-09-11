#!/usr/bin/env python3
"""导出后验证：把生成的 FBX 重新导入 Blender，独立测量几何与碰撞。

审查结论（P1-7）指出：只看 FBX 文件头的二进制版本号无法证明导出内容正确。
本脚本对每个武器把 LOD0..LOD3 与碰撞体 FBX 重新导入空场景，记录真实的
顶点数 / 三角面数 / 包围盒 / 材质数，写入 `Validation/{id}_FBX_ROUNDTRIP.json`。

注意：这是 **Blender 导入器 roundtrip**，不是 UE4.27 编辑器导入。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_and_measure(path: Path) -> dict:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH']
    if not imported:
        return {'imported': False, 'reason': '导入后没有网格对象'}
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    vertices = 0
    triangles = 0
    materials = set()
    for obj in imported:
        obj.data.calc_loop_triangles()
        vertices += len(obj.data.vertices)
        triangles += len(obj.data.loop_triangles)
        materials.update(material.name for material in obj.data.materials if material)
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            minimum = Vector((min(minimum[i], world[i]) for i in range(3)))
            maximum = Vector((max(maximum[i], world[i]) for i in range(3)))
    return {
        'imported': True,
        'objects': len(imported),
        'vertices': vertices,
        'triangles': triangles,
        'materials': sorted(materials),
        'dimensions_m': [round(maximum[i] - minimum[i], 4) for i in range(3)],
    }


def main() -> int:
    args = parse_args()
    job = json.loads(Path(args.job).read_text(encoding='utf-8'))
    results = []
    for entry in job['weapons']:
        weapon_id = entry['weapon_id']
        root = Path(entry['asset_dir'])
        record: dict = {'weapon_id': weapon_id, 'lod': {}, 'errors': []}
        for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
            path = root / 'FBX' / f'{weapon_id}_{lod}.fbx'
            reset_scene()
            if not path.is_file():
                record['lod'][lod] = {'imported': False, 'reason': 'missing file'}
                record['errors'].append(f'缺少 {lod} FBX')
                continue
            try:
                record['lod'][lod] = import_and_measure(path)
            except Exception as error:  # 单个 LOD 失败不影响其他 LOD
                record['lod'][lod] = {'imported': False, 'reason': f'{type(error).__name__}: {error}'}
                record['errors'].append(f'{lod} 导入失败：{error}')
        reset_scene()
        collision_path = root / 'Collision' / f'{weapon_id}_COLLISION.fbx'
        if collision_path.is_file():
            try:
                record['collision'] = import_and_measure(collision_path)
            except Exception as error:
                record['collision'] = {'imported': False, 'reason': f'{type(error).__name__}: {error}'}
                record['errors'].append(f'碰撞体导入失败：{error}')
        else:
            record['collision'] = {'imported': False, 'reason': 'missing file'}
            record['errors'].append('缺少碰撞体 FBX')
        record['result'] = 'PASS' if not record['errors'] else 'FAIL'
        out = root / 'Validation' / f'{weapon_id}_FBX_ROUNDTRIP.json'
        out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        results.append(record)
    print('FBX_ROUNDTRIP_RESULT=' + json.dumps({
        'checked': len(results),
        'pass': sum(1 for r in results if r['result'] == 'PASS'),
        'fail': sum(1 for r in results if r['result'] == 'FAIL'),
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
