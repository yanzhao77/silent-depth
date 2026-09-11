# 只读抽取脚本：打开 Typhoon 母版 .blend，导出推进系统相关的对象清单。
# 本脚本从不保存 .blend，也不写入 Typhoon 资产目录。
#
# 用法：
#   blender --background --python extract_typhoon_propulsion.py -- \
#       --blend <MASTER.blend> --out <report.json>
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

PROPULSION_KEYWORDS = (
    'propeller',
    'prop',
    'blade',
    'hub',
    'shaft',
    'rudder',
    'hydroplane',
    'dive_plane',
    'diveplane',
    'stern',
    'nozzle',
    'duct',
    'shroud',
    'thruster',
    'cone',
)


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--blend', required=True)
    parser.add_argument('--out', required=True)
    return parser.parse_args(argv)


def vec(value):
    return [round(float(component), 6) for component in value]


def collections_of(obj):
    return sorted(collection.name for collection in obj.users_collection)


def plain(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    try:
        return [plain(item) for item in value]
    except TypeError:
        return str(value)


def object_record(obj):
    record = {
        'name': obj.name,
        'type': obj.type,
        'parent': obj.parent.name if obj.parent else None,
        'collections': collections_of(obj),
        'location_m': vec(obj.location),
        'rotation_euler_rad': vec(obj.rotation_euler),
        'scale': vec(obj.scale),
    }
    if obj.type == 'MESH':
        mesh = obj.data
        record['dimensions_m'] = vec(obj.dimensions)
        record['bound_box_world_m'] = [vec(obj.matrix_world @ Vector(corner)) for corner in obj.bound_box]
        record['vertices'] = len(mesh.vertices)
        record['polygons'] = len(mesh.polygons)
        record['triangles'] = sum(max(len(poly.vertices) - 2, 0) for poly in mesh.polygons)
        record['uv_layers'] = [layer.name for layer in mesh.uv_layers]
        record['materials'] = [slot.material.name if slot.material else None for slot in obj.material_slots]
        record['modifiers'] = [modifier.type for modifier in obj.modifiers]
        record['custom_properties'] = {
            key: plain(obj[key]) for key in obj.keys() if key not in {'_RNA_UI'}
        }
    return record


def is_propulsion_related(name):
    lowered = name.lower()
    return any(keyword in lowered for keyword in PROPULSION_KEYWORDS)


def main():
    args = parse_args()
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))

    scene = bpy.context.scene
    unit = scene.unit_settings
    records = [object_record(obj) for obj in bpy.data.objects]
    propulsion_records = [record for record in records if is_propulsion_related(record['name'])]

    propulsion_meshes = [record for record in propulsion_records if record['type'] == 'MESH']
    totals = {
        'vertices': sum(record['vertices'] for record in propulsion_meshes),
        'triangles': sum(record['triangles'] for record in propulsion_meshes),
    }

    sockets = [
        record for record in records
        if record['type'] in {'EMPTY', 'ARMATURE'} and 'socket' in record['name'].lower()
    ]

    report = {
        'source_blend': str(Path(args.blend).resolve()),
        'blender_version': bpy.app.version_string,
        'scene': {
            'name': scene.name,
            'unit_system': unit.system,
            'scale_length': float(unit.scale_length),
            'object_count': len(records),
            'mesh_object_count': sum(1 for record in records if record['type'] == 'MESH'),
            'collections': sorted(collection.name for collection in bpy.data.collections),
        },
        'propulsion_related_objects': propulsion_records,
        'propulsion_mesh_totals': totals,
        'socket_like_objects': sockets,
        'material_names': sorted(
            material.name for material in bpy.data.materials if material.users > 0
        ),
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'TYPHOON_PROPULSION_EXTRACT_WRITTEN={out}')
    print(f'PROPULSION_RELATED_OBJECTS={len(propulsion_records)}')


if __name__ == '__main__':
    main()
