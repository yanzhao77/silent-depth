#!/usr/bin/env python3
"""Independent FBX inspection for the defensive validator.

Run inside Blender. Imports one FBX into an empty scene and prints the real
geometry facts (object names, triangles, bounding box, material slots) so the
validator never has to trust the asset's own SPEC file.

    blender --background --factory-startup --python sds_inspect_fbx.py -- --fbx <path>
"""
from __future__ import annotations

import argparse
import json
import sys

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--fbx', required=True)
    parser.add_argument('--label', default='')
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.fbx)

    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    triangles = 0
    vertices = 0
    uv_channels = 0
    materials: list[str] = []
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        mesh = obj.data
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        vertices += len(mesh.vertices)
        uv_channels = max(uv_channels, len(mesh.uv_layers))
        for slot in obj.material_slots:
            if slot.material and slot.material.name not in materials:
                materials.append(slot.material.name)
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum = Vector((min(minimum.x, point.x), min(minimum.y, point.y), min(minimum.z, point.z)))
            maximum = Vector((max(maximum.x, point.x), max(maximum.y, point.y), max(maximum.z, point.z)))

    payload = {
        'label': args.label,
        'fbx': args.fbx,
        'objects': sorted(obj.name for obj in bpy.data.objects),
        'mesh_count': len(meshes),
        'triangles': triangles,
        'vertices': vertices,
        'uv_channels': uv_channels,
        'materials': materials,
        'ucx_objects': sorted(obj.name for obj in bpy.data.objects
                              if obj.name.upper().startswith('UCX_')),
        'socket_objects': sorted(obj.name for obj in bpy.data.objects
                                 if obj.name.upper().startswith('SOCKET_')),
        'bounds_min': [round(value, 5) for value in minimum],
        'bounds_max': [round(value, 5) for value in maximum],
        'dimensions_m': [round(maximum[i] - minimum[i], 5) for i in range(3)],
        'center': [round((maximum[i] + minimum[i]) / 2.0, 5) for i in range(3)],
    }
    print('SDS_INSPECT=' + json.dumps(payload))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
