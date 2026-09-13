"""Parameter sets for the Batch A hulls (DEC-003).

Every number here traces to the hull's own REFERENCE.md, which is the research
record for that class. The proportions are published figures; the resulting
mesh is procedural and is *not* a measurement of any specific boat, which the
generated SPEC repeats.

The batch ambiguity recorded in each REFERENCE.md is resolved by the project's
own weapon data (see docs/UE4_BATCH_A_WORK_ORDER.md):
  * Los Angeles: the platform carries 12 VLS cells, so it is modelled as the
    Flight II / 688i shape (bow planes on the hull, VLS behind the sail).
  * Virginia: 12 VLS cells, no payload module data, so Block I-II (115 m).
  * Seawolf: eight 660 mm tubes and no payload module, so SSN-21/22 (108 m).
"""
from __future__ import annotations

#: Shared normalised radius profile: sharp bow, long parallel midbody, tapered
#: stern. Bow occupies the first ~18%, the stern taper the last ~20%.
STOCK_PROFILE = [
    (0.00, 0.00), (0.02, 0.28), (0.05, 0.52), (0.10, 0.72), (0.18, 0.86),
    (0.30, 0.94), (0.45, 0.99), (0.60, 1.00), (0.72, 0.97), (0.82, 0.88),
    (0.90, 0.70), (0.96, 0.42), (1.00, 0.10),
]

#: A fuller midbody for the wide American hulls (Seawolf especially).
FAT_PROFILE = [
    (0.00, 0.00), (0.02, 0.30), (0.05, 0.55), (0.10, 0.76), (0.18, 0.89),
    (0.28, 0.96), (0.40, 1.00), (0.62, 1.00), (0.72, 0.98), (0.82, 0.90),
    (0.90, 0.74), (0.96, 0.46), (1.00, 0.12),
]


def _base(asset_id: str, country: str, hull_class: str, project: str, tier: int,
          length: float, beam: float, root: str, **overrides) -> dict:
    params = {
        'id': asset_id,
        'country': country,
        'type': 'SSN',
        'class': hull_class,
        'project': project,
        'tier': tier,
        'length': length,
        'beam': beam,
        'profile': STOCK_PROFILE,
        'bow_fraction': 0.34,
        'vertical_scale': 1.0,
        'sail_x': round(length * 0.14, 3),
        'sail_length': max(round(length * 0.105, 3), 8.0),
        'sail_height': 8.6,
        'sail_width': round(beam * 0.32, 3),
        'sail_taper': 0.24,
        'sail_rake': 0.16,
        'masts': [round(length * 0.10, 3), round(length * 0.17, 3)],
        'bow_planes': 'sail',
        'plane_span': round(beam * 0.42, 3),
        'bow_plane_x': round(length * 0.20, 3),
        'stern_form': 'cross',
        'stern_plane_span': round(beam * 0.44, 3),
        'rudder_span': round(beam * 0.40, 3),
        'stern_plane_inset': round(length * 0.045, 3),
        'propulsor': 'pumpjet',
        'blade_count': 7,
        'shaft_inset': round(length * 0.028, 3),
        'bow_tubes': 4,
        'tube_radius': 0.30,
        'tube_x_inset': 3.0,
        'vls_cells': 0,
        'vls_x': round(length * 0.20, 3),
        'texture_seed': 1,
        'root': root,
    }
    params.update(overrides)
    return params


def los_angeles(root: str) -> dict:
    """US_SSN_LosAngeles: Flight II / 688i, 110 m, hull-mounted bow planes."""
    return _base('US_SSN_LosAngeles', 'USA', 'Los Angeles', 'SSN-688', 6, 110.0, 10.0, root,
                 bow_planes='hull',
                 bow_plane_x=28.0,
                 vls_cells=12,
                 vls_x=6.0,
                 propulsor='propeller',
                 blade_count=7,
                 texture_seed=11)


def virginia(root: str) -> dict:
    """US_SSN_Virginia: Block I-II, 115 m, sail planes, 12 VLS, pump-jet."""
    return _base('US_SSN_Virginia', 'USA', 'Virginia', 'SSN-774', 9, 115.0, 10.0, root,
                 vls_cells=12,
                 vls_x=4.0,
                 texture_seed=12)


def seawolf(root: str) -> dict:
    """US_SSN_Seawolf: SSN-21/22, 108 m, 12 m beam, eight 660 mm tubes."""
    return _base('US_SSN_Seawolf', 'USA', 'Seawolf', 'SSN-21', 8, 108.0, 12.0, root,
                 profile=FAT_PROFILE,
                 bow_tubes=8,
                 tube_radius=0.36,
                 plane_span=5.4,
                 stern_plane_span=5.6,
                 rudder_span=5.2,
                 texture_seed=13)


def astute(root: str) -> dict:
    """UK_SSN_Astute: 97 m, 11.3 m beam, six 533 mm tubes, pump-jet."""
    return _base('UK_SSN_Astute', 'UK', 'Astute', 'SSN-A', 9, 97.0, 11.3, root,
                 bow_tubes=6,
                 texture_seed=14)


def suffren(root: str) -> dict:
    """FR_SSN_Suffren: 99.5 m, slim 8.8 m beam, four 533 mm tubes."""
    return _base('FR_SSN_Suffren', 'France', 'Suffren', 'SNLE-BN', 9, 99.5, 8.8, root,
                 bow_tubes=4,
                 sail_width=3.0,
                 plane_span=3.8,
                 stern_plane_span=4.0,
                 rudder_span=3.8,
                 texture_seed=15)


BUILDERS = {
    'US_SSN_LosAngeles': los_angeles,
    'US_SSN_Virginia': virginia,
    'US_SSN_Seawolf': seawolf,
    'UK_SSN_Astute': astute,
    'FR_SSN_Suffren': suffren,
}
