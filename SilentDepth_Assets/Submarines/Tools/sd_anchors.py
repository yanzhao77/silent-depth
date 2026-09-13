"""The standard equipment anchor set for a submarine (SOCKET-001/DEC-002).

DEC-002 fixed the vocabulary and the naming; this module places the same set on
every hull so the equipment layer does not have to special-case one boat. The
fractions are of the hull's own length/beam/height measured from its centre, so
the anchors follow the geometry instead of a remembered number.

They are gameplay-derived mount points, not measured equipment stations, and
the Assembly document says so.
"""
from __future__ import annotations

import math

#: (logical id, assembly purpose, (x, y, z) as fractions of L / B / H)
ANCHOR_SPEC = [
    ('torpedo_tube_01_muzzle', 'torpedo_muzzle', (0.470, -0.060, -0.080)),
    ('torpedo_tube_02_muzzle', 'torpedo_muzzle', (0.470, 0.060, -0.080)),
    ('sonar_bow', 'sensor_mount', (0.462, 0.000, -0.020)),
    # Aft of midships but inside the hull: the array streams, the fairing does
    # not, and the anchor marks where it leaves the boat.
    ('towed_array', 'sensor_mount', (-0.455, 0.000, 0.060)),
    ('ew_antenna', 'defense_mount', (0.170, 0.000, 0.420)),
    ('decoy_launcher_01', 'decoy_launcher', (0.120, 0.100, -0.050)),
    ('decoy_launcher_02', 'decoy_launcher', (0.120, -0.100, -0.050)),
    ('propulsor_01', 'propulsion_mount', (-0.494, 0.000, 0.000)),
    ('periscope', 'sensor_mount', (0.022, 0.003, 0.300)),
]

#: Sockets that must exist for a hull to be usable by the vertical slice.
REQUIRED_SOCKETS = ['torpedo_tube_01_muzzle']


def anchor_name(asset_id: str, logical_id: str) -> str:
    """DEC-002 §3.3.1: ``SOCKET_SUB_<HULL>_<PURPOSE>`` in the Blender layer."""
    return f'SOCKET_SUB_{asset_id.split("_", 1)[1]}_{logical_id.upper()}'


def placement(low, high, fraction):
    """Metres for one anchor, from the hull's bounding box."""
    size_x, size_y, size_z = high.x - low.x, high.y - low.y, high.z - low.z
    return (size_x * fraction[0], size_y * fraction[1], size_z * fraction[2])


def envelope_allows(location, low, high, purpose) -> bool:
    """False when an anchor sits somewhere the hull cannot have a mount.

    The propulsor is mounted on the shaft *behind* the hull, so insisting it sit
    inside the envelope would force a false position.
    """
    size_x = high.x - low.x
    aft_allowance = size_x * 0.08 if purpose == 'propulsion_mount' else 0.0
    centre_x = (high.x + low.x) * 0.5
    centre_z = (high.z + low.z) * 0.5
    return (centre_x - size_x * 0.5 - aft_allowance <= location[0] <= centre_x + size_x * 0.5
            and abs(location[1]) <= (high.y - low.y) * 0.6
            and centre_z - (high.z - low.z) * 0.6 <= location[2] <= centre_z + (high.z - low.z) * 0.6)


def assembly_sockets(asset_id: str) -> list[dict]:
    """The ``sockets[]`` entries an Assembly document carries."""
    return [{
        'id': logical_id,
        'parent': 'root',
        'purpose': purpose,
    } for logical_id, purpose, _fraction in ANCHOR_SPEC]


def build(collection, asset_id: str, low, high, fallback_sail_height: float = 8.0):
    """Creates the empties and returns (audit rows, assembly socket entries)."""
    import bpy  # imported here so the module stays importable outside Blender

    audit, sockets = [], []
    for logical_id, purpose, fraction in ANCHOR_SPEC:
        location = placement(low, high, fraction)
        name = anchor_name(asset_id, logical_id)
        obj = bpy.data.objects.get(name)
        if obj is None:
            obj = bpy.data.objects.new(name, None)
            collection.objects.link(obj)
        obj.empty_display_type = 'ARROWS'
        obj.empty_display_size = max((high.z - low.z) * 0.12, 0.8)
        obj.location = location
        obj.rotation_euler = (0.0, 0.0, 0.0)

        # The periscope anchor rides on the sail when the hull has one.
        if logical_id == 'periscope':
            location = (location[0], location[1], max(location[2], fallback_sail_height * 0.62))
            obj.location = location

        audit.append({
            'anchor': name,
            'logical_id': logical_id,
            'purpose': purpose,
            'location_m': [round(value, 6) for value in location],
            'inside_hull_envelope': envelope_allows(location, low, high, purpose),
            'aft_of_hull_by_design': purpose == 'propulsion_mount',
        })
        sockets.append({
            'id': logical_id,
            'parent': 'root',
            'purpose': purpose,
            'sourceAnchor': name,
            'transform': {
                'translation': [round(value, 6) for value in location],
                'rotationDegrees': [0, 0, 0],
                'scale': [1, 1, 1],
            },
        })
    return audit, sockets
