"""SOCKET-001: equipment anchors for the Akula vertical slice.

    blender --background --python Source/build_akula_anchors.py

DEC-002 fixed the rules: the master is read-only, the work happens in a copy,
and only Anchor/Empty objects plus Assembly data are added. This script opens
the master, builds a ``30_ANCHORS`` collection, writes the work copy, exports
the anchor-only FBX, and produces the Assembly document the UE loader reads.

Anchor positions are derived from the master's own bounding box, so they follow
the geometry rather than a remembered number. They are gameplay-derived mount
points, not measured equipment stations, and the Assembly says so: the same
caveat the Yasen anchors carry.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
MASTER = ROOT / 'Blend' / 'RU_SSN_Akula_MASTER.blend'
WORK = ROOT / 'Work'
ID = 'RU_SSN_Akula'
HULL_TOKEN = 'HULL'

#: DEC-002 §3.3's minimal set, with the purpose vocabulary from the assembly
#: schema. ``muzzle`` purposes carry the documented +X launch axis.
#:
#: The triple is a fraction of the hull's own length/beam/height measured from
#: the hull centre, so ``+0.470`` is 47% of the length forward of the centre and
#: ``-0.494`` is the documented shaft position 54.4 m aft on a 110.2 m boat.
SOCKETS = [
    ('torpedo_tube_01_muzzle', 'torpedo_muzzle', (0.470, -0.060, -0.080)),
    ('torpedo_tube_02_muzzle', 'torpedo_muzzle', (0.470, 0.060, -0.080)),
    ('sonar_bow', 'sensor_mount', (0.462, 0.000, -0.020)),
    # Aft of midships but inside the hull: the array is streamed, the fairing
    # is not, and the anchor marks where it leaves the boat.
    ('towed_array', 'sensor_mount', (-0.455, 0.000, 0.060)),
    ('ew_antenna', 'defense_mount', (0.170, 0.000, 0.420)),
    ('decoy_launcher_01', 'decoy_launcher', (0.120, 0.100, -0.050)),
    ('decoy_launcher_02', 'decoy_launcher', (0.120, -0.100, -0.050)),
    ('propulsor_01', 'propulsion_mount', (-0.494, 0.000, 0.000)),
    ('periscope', 'sensor_mount', (0.022, 0.003, 0.300)),
]


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def hull_bounds():
    """Bounding box of the master's hull mesh, in metres."""
    candidates = [obj for obj in bpy.data.objects
                  if obj.type == 'MESH' and HULL_TOKEN in obj.name.upper()]
    if not candidates:
        candidates = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    coords = [obj.matrix_world @ Vector(corner)
              for obj in candidates for corner in obj.bound_box]
    low = Vector((min(p.x for p in coords), min(p.y for p in coords), min(p.z for p in coords)))
    high = Vector((max(p.x for p in coords), max(p.y for p in coords), max(p.z for p in coords)))
    return low, high


def main() -> int:
    if not MASTER.is_file():
        raise SystemExit(f'master not found: {MASTER}')
    # The master is opened, never saved: every write below targets the work copy.
    bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    low, high = hull_bounds()
    size = high - low
    centre = (high + low) * 0.5

    collection = bpy.data.collections.get('30_ANCHORS')
    if collection is None:
        collection = bpy.data.collections.new('30_ANCHORS')
        bpy.context.scene.collection.children.link(collection)

    assembly_sockets = []
    audit = []
    for logical_id, purpose, fraction in SOCKETS:
        location = Vector((
            size.x * fraction[0],
            size.y * fraction[1],
            size.z * fraction[2],
        ))
        anchor_name = f'SOCKET_SUB_{ID.split("_", 1)[1]}_{logical_id.upper()}'
        existing = bpy.data.objects.get(anchor_name)
        obj = existing or bpy.data.objects.new(anchor_name, None)
        if existing is None:
            collection.objects.link(obj)
        obj.empty_display_type = 'ARROWS'
        obj.empty_display_size = max(size.z * 0.12, 0.8)
        obj.location = location
        # Launch sockets point down the bow axis, which is the documented +X.
        obj.rotation_euler = (0.0, 0.0, 0.0)

        # The propulsor is mounted on the shaft *behind* the hull: insisting it
        # sit inside the envelope would force a false anchor position.
        aft_allowance = size.x * 0.08 if purpose == 'propulsion_mount' else 0.0
        inside = (centre.x - size.x * 0.5 - aft_allowance <= location.x <= centre.x + size.x * 0.5
                  and abs(location.y) <= size.y * 0.6
                  and centre.z - size.z * 0.6 <= location.z <= centre.z + size.z * 0.6)
        audit.append({
            'anchor': anchor_name,
            'logical_id': logical_id,
            'purpose': purpose,
            'location_m': [round(value, 6) for value in location],
            'inside_hull_envelope': inside,
            'aft_of_hull_by_design': purpose == 'propulsion_mount',
        })
        assembly_sockets.append({
            'id': logical_id,
            'parent': 'root',
            'purpose': purpose,
            'sourceAnchor': anchor_name,
            'transform': {
                'translation': [round(value, 6) for value in location],
                'rotationDegrees': [0, 0, 0],
                'scale': [1, 1, 1],
            },
        })

    outside = [item['anchor'] for item in audit if not item['inside_hull_envelope']]
    if outside:
        raise SystemExit(f'anchors outside the hull envelope: {outside}')

    WORK.mkdir(parents=True, exist_ok=True)
    work_copy = WORK / f'{ID}_WORK_ANCHORS.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(work_copy))

    # Anchor-only export for the asset library's own reference.
    for obj in bpy.data.objects:
        obj.select_set(obj.name in {item['anchor'] for item in audit})
    bpy.context.view_layer.objects.active = bpy.data.objects[audit[0]['anchor']]
    (ROOT / 'Sockets').mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(ROOT / 'Sockets' / f'{ID}_SOCKETS.fbx'),
        use_selection=True, object_types={'EMPTY'}, axis_forward='-Y', axis_up='Z',
        apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS')

    assembly = {
        'schemaVersion': 1,
        'assetId': ID,
        'units': 'meters',
        'coordinateSystem': {
            'forward': '+X', 'right': '+Y', 'up': '+Z',
            'unrealConversion': '1 Blender meter = 100 Unreal Units',
        },
        'templateNotice': (
            'SOCKET-001 Akula equipment anchors, added to a working copy of the master '
            '(DEC-002). Positions are gameplay-derived from the master bounding box, not '
            'measured equipment stations.'),
        'sockets': assembly_sockets,
        'validation': {
            'requiredSockets': ['torpedo_tube_01_muzzle'],
        },
        'source': {
            'master': f'Blend/{ID}_MASTER.blend',
            'workCopy': f'Work/{work_copy.name}',
            'anchorDerivation': 'GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY',
        },
        'hullEnvelopeM': {
            'min': [round(value, 6) for value in low],
            'max': [round(value, 6) for value in high],
        },
    }
    write(ROOT / 'Documentation' / f'{ID}_ASSEMBLY.json', assembly)
    write(ROOT / 'Validation' / f'{ID}_SOCKET_AUDIT.json', {
        'result': 'PASS',
        'anchorCount': len(audit),
        'anchors': audit,
        'hullEnvelopeM': assembly['hullEnvelopeM'],
        'masterUntouched': True,
    })
    print(f'ANCHORS {ID}: {len(audit)} anchors, work copy {work_copy.name}')
    return 0


raise SystemExit(main())
