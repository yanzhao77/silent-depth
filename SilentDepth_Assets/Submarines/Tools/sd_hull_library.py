"""Shared procedural hull builder for SILENT DEPTH submarines.

Batch A introduced five hulls at once, so the geometry lives here as one
parametric builder instead of five near-identical scripts: a hull is described
by a normalised radius profile plus a few appendage parameters, and every hull
in the batch is a parameter set over this builder.

Conventions (same as the hand-built Akula/Yasen masters):
  * metres, bow on +X, Z up, origin at the hull centre.
  * the hull surface is a function of one parameter: ``surface(x, theta)``.
  * parts are separate objects so the UE side can drive them independently.
  * everything is deterministic: no RNG except the texture generator, which is
    seeded.

The geometry is procedural. It follows the published proportions recorded in
each hull's REFERENCE.md and is *not* a measurement of any specific boat.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

TAU = math.tau
PARTS: list = []
MAT: dict = {}
COL = None


# --------------------------------------------------------------------------
# low level mesh helpers
# --------------------------------------------------------------------------
def mesh(name, verts, faces, material='hull', smooth=True, prefix='SUB'):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(f'{prefix}_{name}', data)
    COL.objects.link(obj)
    data.materials.append(MAT[material])
    for face in data.polygons:
        face.use_smooth = smooth
    PARTS.append(obj)
    return obj


def loft(name, rings, material='hull', prefix='SUB', closed_ends=True):
    """Skin a list of equal-length rings; the ends are capped by default."""
    n = len(rings[0])
    verts = [tuple(p) for ring in rings for p in ring]
    faces = [(i * n + j, i * n + (j + 1) % n, (i + 1) * n + (j + 1) % n, (i + 1) * n + j)
             for i in range(len(rings) - 1) for j in range(n)]
    if closed_ends:
        faces += [tuple(reversed(range(n))), tuple((len(rings) - 1) * n + j for j in range(n))]
    return mesh(name, verts, faces, material, prefix=prefix)


def box(name, center, size, material='panel', prefix='SUB', bevel=0.0, segments=1):
    """Axis aligned box, optionally with a single bevel for a softer silhouette."""
    cx, cy, cz = center
    sx, sy, sz = (s * 0.5 for s in size)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                        offset=bevel, segments=segments, affect='EDGES', clamp_overlap=True)
    for v in bm.verts:
        v.co += Vector((cx, cy, cz))
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(f'{prefix}_{name}', data)
    COL.objects.link(obj)
    data.materials.append(MAT[material])
    PARTS.append(obj)
    return obj


def cylinder(name, center, radius, length, axis='X', material='metal', n=32,
             prefix='SUB', radius_end=None):
    """Capped cylinder along an axis; ``radius_end`` makes it a shallow cone."""
    radius_end = radius if radius_end is None else radius_end
    rings = []
    for t, r in ((0.0, radius_end), (1.0, radius)):
        ring = []
        for j in range(n):
            a = TAU * j / n
            u, v = math.cos(a) * r, math.sin(a) * r
            if axis == 'X':
                ring.append((center[0] + (-0.5 + t) * length, center[1] + u, center[2] + v))
            elif axis == 'Y':
                ring.append((center[0] + u, center[1] + (-0.5 + t) * length, center[2] + v))
            else:
                ring.append((center[0] + u, center[1] + v, center[2] + (-0.5 + t) * length))
        rings.append(ring)
    return loft(name, rings, material, prefix=prefix)


def fin(name, station_x, theta, span, chord_root, chord_tip, sweep, thickness,
        material='panel', side=1.0, prefix='SUB', cant=0.0, root_offset=None):
    """One lifting surface rooted on the hull.

    ``theta`` follows :func:`surface`: 0 = +Z (top), pi/2 = +Y (starboard). The
    root sits slightly inside the hull so the part really touches the body
    instead of floating beside it.
    """
    up = Vector((0.0, 0.0, 1.0))
    out = Vector((0.0, math.sin(theta) * side, math.cos(theta) * side))
    out = (out + up * cant).normalized() if cant else out.normalized()
    axis = Vector((1.0, 0.0, 0.0))
    tangent = out.cross(axis).normalized()
    # Root on the same side as the fin: using the raw sine/cosine here would
    # place a port fin's root on the starboard side and bury the whole surface
    # inside the hull, where it neither shows nor touches the skin.
    # Behind the stern there is no hull radius to sit on, so a caller that
    # mounts on the shaft (rotor blades, duct vanes) passes its own offset.
    offset = root_offset if root_offset is not None else radius(station_x) * 0.86
    root = Vector((station_x, 0.0, 0.0)) + out * offset
    verts, faces = [], []
    steps = 3
    for s in range(steps + 1):
        f = s / steps
        centre = root + out * (span * f) + axis * (sweep * f)
        chord = chord_root + (chord_tip - chord_root) * f
        thick = thickness * (1.0 - 0.65 * f)
        for sweep_sign in (-1.0, 1.0):
            for thick_sign in (-1.0, 1.0):
                verts.append(tuple(centre + axis * (sweep_sign * chord * 0.5)
                                   + tangent * (thick_sign * thick * 0.5)))
    for s in range(steps):
        base = s * 4
        nxt = (s + 1) * 4
        faces += [(base + 0, base + 1, nxt + 1, nxt + 0),
                  (base + 2, nxt + 2, nxt + 3, base + 3),
                  (base + 0, nxt + 0, nxt + 2, base + 2),
                  (base + 1, base + 3, nxt + 3, nxt + 1)]
    faces += [(0, 2, 3, 1), (steps * 4 + 0, steps * 4 + 1, steps * 4 + 3, steps * 4 + 2)]
    return mesh(name, verts, faces, material, prefix=prefix)


def patch(name, x, theta, length, width, material='panel', depth=0.03, prefix='SUB', n=6,
          thickness=0.09):
    """A closed slab on the hull: array plate, hatch or tube rim.

    The plate has thickness on purpose. A single-sided sheet would be a
    boundary-edge surface, and the pipeline's topology rule treats that as a
    defect rather than a stylistic choice.
    """
    verts, faces = [], []
    for offset in (depth + thickness * 0.5, depth - thickness * 0.5):
        for i in range(n + 1):
            for j in range(2):
                ang = theta + (j - 0.5) * width
                xx = x + (i / n - 0.5) * length
                base = Vector(surface(xx, ang))
                # Radial normal: the slab lies on the curved hull, no cross
                # product of nearly parallel vectors.
                normal = Vector((0.0, math.sin(ang), math.cos(ang) * _VERTICAL)).normalized()
                verts.append(tuple(base + normal * offset))

    def index(layer, i, j):
        return layer * (n + 1) * 2 + i * 2 + j

    for i in range(n):
        faces.append((index(0, i, 0), index(0, i, 1), index(0, i + 1, 1), index(0, i + 1, 0)))
        faces.append((index(1, i, 0), index(1, i + 1, 0), index(1, i + 1, 1), index(1, i, 1)))
        faces.append((index(0, i, 0), index(0, i + 1, 0), index(1, i + 1, 0), index(1, i, 0)))
        faces.append((index(0, i, 1), index(1, i, 1), index(1, i + 1, 1), index(0, i + 1, 1)))
    faces.append((index(0, 0, 0), index(1, 0, 0), index(1, 0, 1), index(0, 0, 1)))
    faces.append((index(0, n, 0), index(0, n, 1), index(1, n, 1), index(1, n, 0)))
    return mesh(name, verts, faces, material, smooth=False, prefix=prefix)


# --------------------------------------------------------------------------
# hull surface
# --------------------------------------------------------------------------
#: x range of the hull surface, set by :func:`set_profile`.
SURFACE_RANGE = (-1.0, 1.0)
_PROFILE_U: np.ndarray = np.array([0.0, 1.0])
_PROFILE_R: np.ndarray = np.array([0.0, 0.0])
_BEAM = 10.0
_VERTICAL = 1.0


def set_profile(length_m: float, beam_m: float, radius_profile: list[tuple[float, float]],
                bow_fraction: float = 0.34, vertical_scale: float = 1.0):
    """Define the hull: length, beam and a normalised radius profile.

    ``radius_profile`` is a list of ``(u, r)`` where ``u`` runs 0 (bow tip) to 1
    (stern tip) and ``r`` is in units of the maximum radius. The bow occupies
    ``bow_fraction`` of the length so the nose stays sharp while the parallel
    midbody stays long, which is what the references describe for these classes.
    """
    global SURFACE_RANGE, _PROFILE_U, _PROFILE_R, _BEAM, _VERTICAL
    SURFACE_RANGE = (-length_m * 0.5, length_m * 0.5)
    _PROFILE_U = np.array([p[0] for p in radius_profile], dtype=float)
    _PROFILE_R = np.array([p[1] for p in radius_profile], dtype=float)
    _BEAM = beam_m
    _VERTICAL = vertical_scale


def radius(x: float) -> float:
    """Hull radius (metres) at station ``x``.

    The convention is bow on +X: the profile parameter runs 0 at the bow
    (+length/2) to 1 at the stern (-length/2), so a positive station is forward.
    """
    lo, hi = SURFACE_RANGE
    u = min(max((hi - x) / (hi - lo), 0.0), 1.0)
    return float(np.interp(u, _PROFILE_U, _PROFILE_R)) * _BEAM * 0.5


def bow_x() -> float:
    """Station of the bow tip (positive X)."""
    return SURFACE_RANGE[1]


def stern_x() -> float:
    """Station of the stern tip (negative X)."""
    return SURFACE_RANGE[0]


def surface(x: float, theta: float, offset: float = 0.0):
    """Point on the hull surface: ``theta`` 0 = +Z, increasing to +Y."""
    r = radius(x) + offset
    return (x, math.sin(theta) * r, math.cos(theta) * r * _VERTICAL)


def hull_sections(count: int = 84, around: int = 48, cap: float = 0.012):
    """Rings from bow to stern.

    The tips keep a small radius instead of collapsing to a single vertex: a
    collapsed ring produces degenerate quads on the cap, which the topology
    check (rightly) refuses.
    """
    rings = []
    for i in range(count + 1):
        # Bow first, then aft: the section list reads the way the boat is drawn.
        x = bow_x() - (bow_x() - stern_x()) * (i / count)
        r = max(radius(x), cap)
        rings.append([(x, math.sin(TAU * j / around) * r, math.cos(TAU * j / around) * r * _VERTICAL)
                      for j in range(around)])
    return rings


def build_hull(name='Hull'):
    return loft(name, hull_sections())


# --------------------------------------------------------------------------
# appendages
# --------------------------------------------------------------------------

def build_sail(params: dict):
    """Sail (conning tower), optionally carrying the bow planes and masts."""
    length = params['sail_length']
    height = params['sail_height']
    width = params['sail_width']
    x = params['sail_x']
    top = height
    rings = []
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        taper = 1.0 - params.get('sail_taper', 0.22) * t
        w = width * 0.5 * taper
        z = top * t
        lead = x + length * 0.5 - params.get('sail_rake', 0.16) * length * t
        trail = lead - length * (0.62 + 0.38 * taper)
        # Ring order must walk the cross-section, not cross it: a twisted ring
        # makes the lofted side faces degenerate.
        ring = [(lead, w, z), (lead, -w, z), (trail, -w, z), (trail, w, z)]
        rings.append(ring)
    sail = loft('Sail', rings, material='panel')
    # Fairwater cap: a slightly inset plate on top keeps the silhouette closed.
    box('SailCap', (x - params.get('sail_rake', 0.16) * length * 0.5, 0.0, top),
        (length * 0.8, width * 0.9, 0.16), material='panel', bevel=0.05)
    masts = []
    for i, mast_x in enumerate(params.get('masts', [])):
        mast = cylinder(f'Mast_{i}', (mast_x, 0.0, top + 1.2), 0.16, 2.6,
                        axis='Z', material='metal')
        cyl = cylinder(f'MastHead_{i}', (mast_x, 0.0, top + 2.6), 0.28, 0.5,
                       axis='Z', material='array')
        masts += [mast, cyl]
    planes = []
    if params.get('bow_planes') == 'sail':
        for side in (1.0, -1.0):
            planes.append(fin(f'SailPlane_{"P" if side > 0 else "S"}', x,
                              math.pi * 0.5, span=params.get('plane_span', 4.2),
                              chord_root=2.6, chord_tip=1.7, sweep=-1.1,
                              thickness=0.34, side=side))
    return {'sail': sail, 'masts': masts, 'planes': planes}


def build_bow_planes(params: dict):
    planes = []
    if params.get('bow_planes') == 'hull':
        x = params.get('bow_plane_x', 0.0)
        for side in (1.0, -1.0):
            planes.append(fin(f'BowPlane_{"P" if side > 0 else "S"}', x,
                              math.pi * 0.5, span=params.get('plane_span', 4.0),
                              chord_root=2.4, chord_tip=1.5, sweep=-0.9,
                              thickness=0.30, side=side))
    return planes


def build_stern(params: dict):
    """Stern control surfaces: cross (planes + rudder) or X form."""
    x = stern_x() + params.get('stern_plane_inset', 5.0)
    planes, rudders = [], []
    if params.get('stern_form', 'cross') == 'cross':
        for side in (1.0, -1.0):
            planes.append(fin(f'SternPlane_{"P" if side > 0 else "S"}', x,
                              math.pi * 0.5, span=params.get('stern_plane_span', 4.4),
                              chord_root=2.8, chord_tip=1.8, sweep=-1.4,
                              thickness=0.34, side=side))
        for side in (1.0, -1.0):
            rudders.append(fin(f'Rudder_{"T" if side > 0 else "B"}', x,
                               0.0 if side > 0 else math.pi, span=params.get('rudder_span', 4.0),
                               chord_root=2.6, chord_tip=1.6, sweep=-1.1,
                               thickness=0.36, side=1.0))
    else:
        for i, theta in enumerate((math.pi * 0.25, math.pi * 0.75,
                                   -math.pi * 0.25, -math.pi * 0.75)):
            planes.append(fin(f'SternFin_{i}', x, theta, span=params.get('stern_plane_span', 4.2),
                              chord_root=2.7, chord_tip=1.7, sweep=-1.3,
                              thickness=0.34, side=1.0))
    return {'planes': planes, 'rudders': rudders}


def build_propulsor(params: dict):
    """Single shaft with either a screw or a pump-jet duct."""
    # Everything aft is placed from the shaft's own endpoints rather than from
    # fixed offsets: a hand-tuned gap of a few centimetres is invisible in a
    # render and still means the rotor does not touch the shaft.
    shaft_center = stern_x() - 0.6
    shaft_length = 4.0
    shaft_aft = shaft_center - shaft_length * 0.5
    overlap = 0.35
    tail = shaft_aft + overlap
    kind = params.get('propulsor', 'pumpjet')
    # The shaft reaches back into the hull so the parts really connect.
    shaft = cylinder('Shaft', (shaft_center, 0.0, 0.0), 0.34, shaft_length, axis='X', material='metal')
    hub = cylinder('Hub', (shaft_aft - 0.4, 0.0, 0.0), 0.42, 1.5,
                   axis='X', material='bronze', radius_end=0.30)
    blades, duct = [], None
    if kind == 'pumpjet':
        duct = cylinder('PumpJetDuct', (shaft_aft - 0.6, 0.0, 0.0),
                        max(radius(stern_x() + 4.0) * 0.78, 1.5), 3.0, axis='X', material='metal')
        # A duct is a shell: cut an inner ring so the nozzle reads as a tube.
        bm = bmesh.new()
        bm.from_mesh(duct.data)
        inner = max(radius(stern_x() + 4.0) * 0.58, 1.1)
        bmesh.ops.inset_region(bm, faces=list(bm.faces), thickness=inner * 0.35, depth=0.0)
        bm.to_mesh(duct.data)
        bm.free()
        for i in range(7):
            theta = TAU * i / 7
            blades.append(fin(f'RotorBlade_{i}', tail, theta,
                              span=inner * 0.92, chord_root=0.7, chord_tip=0.5,
                              sweep=0.0, thickness=0.12, material='bronze',
                              root_offset=0.12))
    else:
        blade_count = params.get('blade_count', 7)
        for i in range(blade_count):
            theta = TAU * i / blade_count
            blades.append(fin(f'PropellerBlade_{i}', tail, theta,
                              span=max(radius(stern_x() + 3.0), 1.6) * 0.92,
                              chord_root=1.1, chord_tip=0.7,
                              sweep=0.35, thickness=0.16, material='bronze', cant=0.35,
                              root_offset=0.12))
        # The spinner caps the shaft: it overlaps the end instead of sitting
        # behind it, so the assembly has no floating cone.
        duct = cylinder('PropellerSpinner', (shaft_aft, 0.0, 0.0), 0.34, 0.8,
                        axis='X', material='bronze', radius_end=0.16)
    return {'shaft': shaft, 'hub': hub, 'blades': blades, 'duct': duct}


def build_openings(params: dict):
    """Visible bow tube openings and VLS hatches, as shallow recessed plates."""
    out = []
    tubes = params.get('bow_tubes', 0)
    tube_r = params.get('tube_radius', 0.30)
    if tubes:
        rows = 2 if tubes > 4 else 1
        per_row = math.ceil(tubes / rows)
        for i in range(tubes):
            row = i % rows
            col = i // rows
            side = 1.0 if row % 2 == 0 else -1.0
            theta = side * (0.22 + 0.16 * (col % 2))
            x = bow_x() - params.get('tube_x_inset', 3.0)
            out.append(patch(f'TubeRim_{i}', x, theta, 0.6, 0.5,
                             material='recess', depth=-0.05, n=4))
    cells = params.get('vls_cells', 0)
    if cells:
        behind = params.get('vls_x', bow_x() * 0.45)
        per_side = cells // 2
        for i in range(per_side):
            x = behind - i * 1.5
            for side in (1.0, -1.0):
                out.append(cylinder(f'VLSHatch_{i}_{"P" if side > 0 else "S"}',
                                    (x, side * radius(x) * 0.55, radius(x) * 0.72),
                                    0.55, 0.25, axis='Z', material='recess', n=12))
    return out


def build_missile_deck(params: dict):
    """The raised missile casing an SSBN carries behind its sail.

    Without it a ballistic-missile boat and an attack boat of the same length
    look alike, which is the one silhouette difference the references keep
    repeating (Delta's hump, Ohio's flat deck, Borei's rounded casing).
    """
    if not params.get('missile_deck'):
        return None
    length = params['length']
    sail = params['sail_x']
    aft = sail - params['sail_length'] * 0.5
    deck_length = length * params.get('missile_deck_fraction', 0.42)
    fore = aft + 1.0
    stern_end = max(fore - deck_length, stern_x() + length * 0.12)
    width = params['beam'] * 0.55
    height = params['beam'] * 0.17

    rings = []
    steps = 8
    for i in range(steps + 1):
        t = i / steps
        x = fore + (stern_end - fore) * t
        # The hump tapers into the hull at both ends.
        taper = math.sin(math.pi * min(max(t, 0.0), 1.0)) ** 0.55
        top = radius(x) * params.get('vertical_scale', 1.0) + height * (0.35 + 0.65 * taper)
        w = width * (0.55 + 0.45 * taper)
        rings.append([(x, w * 0.5, top), (x, -w * 0.5, top),
                      (x, -w * 0.5, top - height * 0.9), (x, w * 0.5, top - height * 0.9)])
    return loft('MissileDeck', rings, material='panel')


def build(collection, materials, detail=True, params: dict | None = None):
    """Build every part of one hull; returns the parts the tools expect."""
    global COL, MAT
    COL = collection
    MAT = materials
    PARTS.clear()
    params = params or {}
    set_profile(params['length'], params['beam'], params['profile'],
                params.get('bow_fraction', 0.34),
                params.get('vertical_scale', 1.0))
    body = build_hull()
    sail = build_sail(params)
    bow_planes = build_bow_planes(params)
    stern = build_stern(params)
    propulsor = build_propulsor(params)
    openings = build_openings(params) if detail else []
    missile_deck = build_missile_deck(params)
    parts = {
        'hull': body,
        'sail': sail['sail'],
        'missile_deck': missile_deck,
        'masts': sail['masts'],
        # Movable groups the UE side drives independently.
        'propulsor': propulsor['blades'] + [propulsor['hub']] + ([propulsor['duct']] if propulsor['duct'] else []),
        'rudder': stern['rudders'],
        'stern_planes': stern['planes'],
        'bow_planes': sail['planes'] + bow_planes,
        'planes': sail['planes'] + bow_planes + stern['planes'] + stern['rudders'],
        'tail': stern['planes'] + stern['rudders'],
        'shaft': propulsor['shaft'],
        'hub': propulsor['hub'],
        'blades': propulsor['blades'],
        'duct': propulsor['duct'],
        'openings': openings,
    }
    return parts
