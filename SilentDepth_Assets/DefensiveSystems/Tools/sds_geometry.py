#!/usr/bin/env python3
"""Procedural geometry for the SILENT DEPTH defensive system assets.

Run inside Blender. Every builder returns the list of visible objects for one
asset; the build entry point (``sds_build_asset.py``) owns LODs, collision,
FBX export, previews, SPEC and validation.

Conventions
-----------
* Units: metres. Z is up, +X is towards the bow.
* Origin: mast/antenna = base centre; canisters = geometric centre;
  launcher/sensor = mounting-face centre; console = base centre.
* Deterministic: no ``random`` anywhere; every dimension comes from
  ``sds_dataset.ASSETS``.
* Detail is game-representative, not a survey of real hardware.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
import bmesh  # noqa: E402

import sds_dataset as dataset  # noqa: E402
from sds_common import MATERIAL_LIBRARY  # noqa: E402

# Linear-space material values (Blender Principled base colour is linear).
MATERIALS = MATERIAL_LIBRARY


# --------------------------------------------------------------------------
# Scene helpers
# --------------------------------------------------------------------------
def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj: bpy.types.Object, col: bpy.types.Collection) -> bpy.types.Object:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def material_for(name: str) -> bpy.types.Material:
    spec = MATERIALS[name]
    mat = bpy.data.materials.get(f'M_Def_{name}')
    if mat is None:
        mat = bpy.data.materials.new(f'M_Def_{name}')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf is not None:
            bsdf.inputs['Base Color'].default_value = (*spec['base_color'], 1.0)
            bsdf.inputs['Metallic'].default_value = spec['metallic']
            bsdf.inputs['Roughness'].default_value = spec['roughness']
    return mat


def assign(obj: bpy.types.Object, material_name: str) -> bpy.types.Object:
    obj.data.materials.append(material_for(material_name))
    return obj


def shade(obj: bpy.types.Object, smooth: bool = True, angle_deg: float = 40.0) -> None:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if smooth:
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
        except (AttributeError, RuntimeError, TypeError):
            bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()


def bevel(obj: bpy.types.Object, width: float = 0.006, segments: int = 2) -> None:
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)


# --------------------------------------------------------------------------
# Primitive builders
# --------------------------------------------------------------------------
def lathe(name: str, profile: list[tuple[float, float]], segments: int = 32,
          cap_bottom: bool = True, cap_top: bool = True) -> bpy.types.Object:
    """Revolve a (radius, height) profile around the Z axis."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    for radius, height in profile:
        if radius <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, height))])
            continue
        ring = []
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            ring.append(bm.verts.new((radius * math.cos(angle), radius * math.sin(angle), height)))
        rings.append(ring)

    for lower, upper in zip(rings, rings[1:]):
        if len(lower) == 1 and len(upper) == 1:
            continue
        if len(lower) == 1:
            apex = lower[0]
            for index in range(segments):
                bm.faces.new((apex, upper[index], upper[(index + 1) % segments]))
            continue
        if len(upper) == 1:
            apex = upper[0]
            for index in range(segments):
                bm.faces.new((lower[index], lower[(index + 1) % segments], apex))
            continue
        for index in range(segments):
            nxt = (index + 1) % segments
            bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))

    if cap_bottom and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(name: str, size: tuple[float, float, float], location: tuple[float, float, float] = (0, 0, 0),
        rotation: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cyl(name: str, radius: float, depth: float, location: tuple[float, float, float] = (0, 0, 0),
        rotation: tuple[float, float, float] = (0, 0, 0), vertices: int = 32,
        cap: str = 'NGON') -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation, end_fill_type=cap)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def torus(name: str, major: float, minor: float, location: tuple[float, float, float] = (0, 0, 0),
          rotation: tuple[float, float, float] = (0, 0, 0), major_segments: int = 32,
          minor_segments: int = 10) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=major_segments, minor_segments=minor_segments,
                                     location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def sphere(name: str, radius: float, location: tuple[float, float, float] = (0, 0, 0),
           segments: int = 24, rings: int = 12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius,
                                         location=location)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def cone(name: str, radius1: float, radius2: float, depth: float,
         location: tuple[float, float, float] = (0, 0, 0),
         rotation: tuple[float, float, float] = (0, 0, 0), vertices: int = 24) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2,
                                    depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def join(objects: list[bpy.types.Object], name: str, col: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.active_object
    merged.name = name
    link(merged, col)
    return merged


def empty(name: str, location: tuple[float, float, float], col: bpy.types.Collection,
          display: str = 'PLAIN_AXES') -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display
    obj.empty_display_size = 0.25
    obj.location = location
    col.objects.link(obj)
    return obj


# --------------------------------------------------------------------------
# Asset builders
# --------------------------------------------------------------------------
def _collar(prefix: str, radius: float, height: float, base_z: float) -> list[bpy.types.Object]:
    parts = [cyl(f'{prefix}_Collar', radius, height, location=(0, 0, base_z), vertices=28)]
    return parts


def _bolt_ring(prefix: str, radius: float, z: float, count: int = 12,
               bolt_radius: float = 0.012, bolt_height: float = 0.03) -> list[bpy.types.Object]:
    bolts = []
    for index in range(count):
        angle = 2.0 * math.pi * index / count
        bolts.append(cyl(f'{prefix}_Bolt_{index:02d}', bolt_radius, bolt_height,
                         location=(radius * math.cos(angle), radius * math.sin(angle), z),
                         vertices=8))
    return bolts


def build_esm_mast(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Generic cylindrical ESM mast with a liftable head and a top plate array."""
    asset_id = asset['asset_id']
    height = asset['dimensions_m']['height']
    radius = asset['dimensions_m']['diameter'] / 2.0
    body_h = height - 1.4
    parts = [
        lathe(f'{asset_id}_Mast', [
            (radius * 1.15, 0.0), (radius * 1.15, 0.10), (radius, 0.14),
            (radius * 0.92, body_h * 0.55), (radius * 0.88, body_h),
        ], segments=28),
        lathe(f'{asset_id}_Head', [
            (radius * 0.88, body_h), (radius * 1.05, body_h + 0.18),
            (radius * 1.05, body_h + 0.95), (radius * 0.95, body_h + 1.15),
            (radius * 0.95, height),
        ], segments=28),
        cyl(f'{asset_id}_BaseFlange', radius * 1.75, 0.09, location=(0, 0, 0.045), vertices=28),
    ]
    parts += _bolt_ring(asset_id, radius * 1.45, 0.045, count=10)
    for index in range(3):
        parts += _collar(f'{asset_id}_Ring{index}', radius * 1.02, 0.05, body_h * (0.22 + 0.24 * index))
    # Two blade antennas on the head.
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Blade_{index}', (0.05, 0.16, 0.72),
                         location=(0.0, sign * (radius * 0.95 + 0.07), body_h + 0.72)))
    parts.append(cyl(f'{asset_id}_TopDisc', radius * 0.72, 0.06,
                     location=(0, 0, height + 0.03), vertices=24))
    return parts


def build_esm_mast_integrated(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Integrated ESM mast: cylindrical shaft plus a wrap-around radome."""
    asset_id = asset['asset_id']
    height = asset['dimensions_m']['height']
    radius = asset['dimensions_m']['diameter'] / 2.0
    shaft_h = height - 3.0
    parts = [
        lathe(f'{asset_id}_Shaft', [
            (radius * 1.2, 0.0), (radius * 1.2, 0.12), (radius, 0.16), (radius * 0.9, shaft_h),
        ], segments=28),
        cyl(f'{asset_id}_BaseFlange', radius * 1.8, 0.10, location=(0, 0, 0.05), vertices=28),
        # Wrap-around radome: bulged drum with faceted shoulders.
        lathe(f'{asset_id}_Radome', [
            (radius * 0.9, shaft_h), (radius * 1.5, shaft_h + 0.30),
            (radius * 1.62, shaft_h + 1.20), (radius * 1.5, shaft_h + 2.10),
            (radius * 0.98, shaft_h + 2.55), (radius * 0.95, shaft_h + 2.75),
        ], segments=32),
        lathe(f'{asset_id}_Cap', [
            (radius * 0.95, shaft_h + 2.75), (radius * 0.8, height - 0.15),
            (radius * 0.45, height),
        ], segments=24),
    ]
    parts += _bolt_ring(asset_id, radius * 1.5, 0.05, count=12)
    for index in range(6):
        angle = 2.0 * math.pi * index / 6.0
        parts.append(box(f'{asset_id}_Panel_{index}', (0.03, 0.30, 1.10),
                         location=(radius * 1.60 * math.cos(angle),
                                   radius * 1.60 * math.sin(angle), shaft_h + 1.25),
                         rotation=(0, 0, angle)))
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Blade_{index}', (0.05, 0.18, 0.85),
                         location=(0.0, sign * (radius * 1.05), shaft_h + 3.1)))
    return parts


def build_esm_mast_blade(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Wide-section mast with two prominent side blades."""
    asset_id = asset['asset_id']
    height = asset['dimensions_m']['height']
    radius = asset['dimensions_m']['diameter'] / 2.0
    parts = [
        box(f'{asset_id}_MastCore', (radius * 1.9, radius * 1.5, height - 0.9),
            location=(0, 0, (height - 0.9) / 2.0 + 0.09)),
        lathe(f'{asset_id}_Base', [
            (radius * 1.5, 0.0), (radius * 1.5, 0.09), (radius * 1.05, 0.14),
        ], segments=24),
        box(f'{asset_id}_Head', (radius * 2.1, radius * 1.7, 0.85),
            location=(0, 0, height - 0.55)),
        cyl(f'{asset_id}_TopPost', radius * 0.30, 0.24, location=(0, 0, height - 0.05), vertices=16),
    ]
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Blade_{index}', (0.06, 0.34, 1.25),
                         location=(0.0, sign * radius * 1.45, height * 0.62)))
        parts.append(box(f'{asset_id}_BladeRoot_{index}', (0.14, 0.12, 0.5),
                         location=(0.0, sign * radius * 1.1, height * 0.62)))
    parts += _bolt_ring(asset_id, radius * 1.3, 0.05, count=10)
    return parts


def build_esm_mast_rugged(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Thick mast with a blocky antenna base (Russian-style silhouette)."""
    asset_id = asset['asset_id']
    height = asset['dimensions_m']['height']
    radius = asset['dimensions_m']['diameter'] / 2.0
    parts = [
        lathe(f'{asset_id}_Mast', [
            (radius * 1.1, 0.0), (radius * 1.1, 0.16), (radius, 0.22),
            (radius * 0.95, height - 1.6), (radius * 0.9, height - 0.9),
        ], segments=20),
        box(f'{asset_id}_AntennaBlock', (radius * 1.8, radius * 1.8, 0.9),
            location=(0, 0, height - 0.45)),
        box(f'{asset_id}_BlockCap', (radius * 1.3, radius * 1.3, 0.22),
            location=(0, 0, height + 0.05)),
        cyl(f'{asset_id}_BaseFlange', radius * 1.7, 0.12, location=(0, 0, 0.06), vertices=20),
    ]
    for index in range(4):
        parts += _collar(f'{asset_id}_Seal{index}', radius * 1.06, 0.07,
                         (height - 1.9) * (0.18 + 0.22 * index))
    for index in range(4):
        angle = math.pi / 2 * index
        parts.append(cyl(f'{asset_id}_Port_{index}', radius * 0.10, 0.16,
                         location=(radius * 1.72 * math.cos(angle), radius * 1.72 * math.sin(angle),
                                   height - 0.8),
                         rotation=(0, math.pi / 2, angle), vertices=12))
    return parts


def build_esm_mast_slim(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Slim mast with stacked disc arrays."""
    asset_id = asset['asset_id']
    height = asset['dimensions_m']['height']
    radius = asset['dimensions_m']['diameter'] / 2.0
    parts = [
        lathe(f'{asset_id}_Mast', [
            (radius * 1.2, 0.0), (radius * 1.2, 0.10), (radius, 0.15), (radius * 0.85, height - 0.6),
        ], segments=24),
        cyl(f'{asset_id}_BaseFlange', radius * 1.6, 0.08, location=(0, 0, 0.04), vertices=24),
    ]
    for index in range(5):
        z = height - 0.55 - index * 0.42
        disc_radius = radius * (1.55 - index * 0.16)
        parts.append(lathe(f'{asset_id}_Disc{index}', [
            (radius * 0.85, z - 0.16), (disc_radius, z - 0.13),
            (disc_radius, z + 0.13), (radius * 0.85, z + 0.16),
        ], segments=24, cap_bottom=False, cap_top=False))
    parts.append(cyl(f'{asset_id}_TopCap', radius * 0.6, 0.10, location=(0, 0, height + 0.05),
                     vertices=20))
    parts += _bolt_ring(asset_id, radius * 1.35, 0.04, count=8)
    return parts


def build_antenna_array(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Conformal ESM antenna panel with element grid and mounting rails."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    width = asset['dimensions_m']['width']
    thickness = asset['dimensions_m']['thickness']
    parts = [
        box(f'{asset_id}_Panel', (length, width, thickness)),
        box(f'{asset_id}_Backing', (length * 0.98, width * 0.94, thickness * 0.6),
            location=(0, 0, -thickness * 0.7)),
    ]
    columns, rows = 6, 3
    for column in range(columns):
        for row in range(rows):
            x = (column - (columns - 1) / 2.0) * (length / columns) * 0.82
            y = (row - (rows - 1) / 2.0) * (width / rows) * 0.62
            parts.append(box(f'{asset_id}_Elem_{column}_{row}',
                             (length / columns * 0.62, width / rows * 0.5, thickness * 0.55),
                             location=(x, y, thickness * 0.7)))
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Rail_{index}', (length * 0.96, 0.05, 0.05),
                         location=(0, sign * width * 0.46, thickness * 0.35)))
    parts.append(box(f'{asset_id}_Connector', (0.24, 0.20, 0.14),
                     location=(-length * 0.42, 0, -thickness * 0.9)))
    return parts


def build_decoy_canister(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Acoustic device countermeasure canister (ADC-family silhouette)."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    radius = asset['dimensions_m']['diameter'] / 2.0
    half = length / 2.0
    parts = [
        lathe(f'{asset_id}_Body', [
            (0.0, -half), (radius * 0.55, -half + 0.03), (radius, -half + 0.10),
            (radius, half - 0.34), (radius * 0.92, half - 0.26), (radius * 0.92, half - 0.10),
            (radius * 0.55, half), (0.0, half),
        ], segments=24),
        cyl(f'{asset_id}_Transducer', radius * 0.62, 0.05, location=(0, 0, -half + 0.115),
            vertices=20),
        torus(f'{asset_id}_TailRing', radius * 1.05, radius * 0.10, location=(0, 0, half - 0.30),
              major_segments=24, minor_segments=8),
    ]
    for index in range(4):
        angle = 2.0 * math.pi * index / 4.0 + math.pi / 4.0
        parts.append(box(f'{asset_id}_Fin_{index}', (0.10, radius * 0.06, 0.20),
                         location=(radius * 0.95 * math.cos(angle),
                                   radius * 0.95 * math.sin(angle), half - 0.20),
                         rotation=(0, 0, angle)))
    parts += _collar(f'{asset_id}_Band', radius * 1.04, 0.03, -half + 0.30)
    parts += _collar(f'{asset_id}_Band2', radius * 1.04, 0.03, 0.0)
    return parts


def build_decoy_mobile(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Mobile acoustic decoy: powered body with tail cone and four fins."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    radius = asset['dimensions_m']['diameter'] / 2.0
    half = length / 2.0
    parts = [
        lathe(f'{asset_id}_Body', [
            (0.0, -half), (radius * 0.42, -half + 0.05), (radius, -half + 0.22),
            (radius, half - 0.55), (radius * 0.86, half - 0.42),
            (radius * 0.6, half - 0.12), (radius * 0.34, half - 0.02), (0.0, half),
        ], segments=28),
        lathe(f'{asset_id}_TailCone', [
            (radius * 0.6, half - 0.42), (radius * 0.5, half - 0.30), (radius * 0.3, half - 0.16),
        ], segments=20, cap_bottom=False, cap_top=False),
        torus(f'{asset_id}_DriveRing', radius * 0.9, radius * 0.07, location=(0, 0, -half * 0.35),
              major_segments=28, minor_segments=8),
    ]
    for index in range(4):
        angle = 2.0 * math.pi * index / 4.0
        parts.append(box(f'{asset_id}_Fin_{index}', (0.075, 0.02, 0.30),
                         location=(radius * 0.85 * math.cos(angle),
                                   radius * 0.85 * math.sin(angle), half - 0.42),
                         rotation=(0, 0, angle)))
        parts.append(box(f'{asset_id}_FinRoot_{index}', (0.16, 0.02, 0.22),
                         location=(radius * 0.55 * math.cos(angle),
                                   radius * 0.55 * math.sin(angle), half - 0.45),
                         rotation=(0, 0, angle)))
    parts += _collar(f'{asset_id}_Band', radius * 1.03, 0.04, -half + 0.32)
    return parts


def build_noise_maker(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Short noise-maker canister with vented end caps and launch rails."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    radius = asset['dimensions_m']['diameter'] / 2.0
    half = length / 2.0
    parts = [
        lathe(f'{asset_id}_Body', [
            (0.0, -half), (radius * 0.8, -half + 0.03), (radius, -half + 0.08),
            (radius, half - 0.08), (radius * 0.8, half - 0.03), (0.0, half),
        ], segments=24),
        cyl(f'{asset_id}_CapFront', radius * 0.9, 0.04, location=(0, 0, half - 0.02), vertices=20),
        cyl(f'{asset_id}_CapRear', radius * 0.9, 0.04, location=(0, 0, -half + 0.02), vertices=20),
    ]
    for index in range(6):
        angle = 2.0 * math.pi * index / 6.0
        parts.append(cyl(f'{asset_id}_Vent_{index}', radius * 0.09, 0.05,
                         location=(radius * 0.55 * math.cos(angle),
                                   radius * 0.55 * math.sin(angle), half - 0.015),
                         vertices=10))
    for index, sign in enumerate((-1, 1)):
        # Rails run along the canister axis (Z before the whole-body rotation).
        parts.append(box(f'{asset_id}_Rail_{index}', (0.035, 0.035, length * 0.8),
                         location=(0, sign * radius * 1.05, 0)))
    parts.append(cyl(f'{asset_id}_Float', radius * 0.35, 0.16, location=(0, 0, 0), vertices=16))
    return parts


def build_launcher_external(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """External countermeasure launcher housing with two rows of ports."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    width = asset['dimensions_m']['width']
    height = asset['dimensions_m']['height']
    parts = [
        lathe(f'{asset_id}_Shell', [
            (width * 0.30, -length / 2.0), (width * 0.48, -length / 2.0 + 0.14),
            (width * 0.50, -length * 0.25), (width * 0.50, length * 0.25),
            (width * 0.48, length / 2.0 - 0.14), (width * 0.30, length / 2.0),
        ], segments=20, cap_bottom=False, cap_top=False),
        box(f'{asset_id}_Fairing', (length, width * 0.92, height * 0.82)),
        box(f'{asset_id}_MountPlate', (length * 0.72, width * 0.72, 0.06),
            location=(0, 0, -height * 0.46)),
        box(f'{asset_id}_Hatch', (length * 0.34, 0.04, height * 0.42),
            location=(-length * 0.18, -width * 0.47, 0.0)),
    ]
    for row in range(2):
        for index in range(4):
            x = (index - 1.5) * (length / 5.2)
            y = (row - 0.5) * (width * 0.46)
            parts.append(cyl(f'{asset_id}_Port_{row}_{index}', 0.085, 0.05,
                             location=(x, y, height * 0.43), vertices=16))
            parts.append(cyl(f'{asset_id}_PortRim_{row}_{index}', 0.105, 0.02,
                             location=(x, y, height * 0.46), vertices=16))
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Cable_{index}', (0.18, 0.10, 0.10),
                         location=(length * 0.40, sign * width * 0.30, -height * 0.34)))
    return parts


def build_launcher_tube(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Single countermeasure tube with hinged front door and rear flange."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    radius = asset['dimensions_m']['diameter'] / 2.0
    half = length / 2.0
    parts = [
        lathe(f'{asset_id}_Tube', [
            (radius * 1.2, -half), (radius * 1.2, -half + 0.05), (radius, -half + 0.07),
            (radius, half - 0.07), (radius * 1.2, half - 0.05), (radius * 1.2, half),
        ], segments=24, cap_bottom=False, cap_top=False),
        cyl(f'{asset_id}_RearFlange', radius * 1.32, 0.06, location=(0, 0, -half + 0.03),
            vertices=24),
        cyl(f'{asset_id}_Door', radius * 1.05, 0.05, location=(0, 0, half + 0.02), vertices=24),
        cyl(f'{asset_id}_Hinge', 0.035, 0.24, location=(radius * 1.25, 0, half - 0.02),
            rotation=(math.pi / 2, 0, 0), vertices=10),
    ]
    for index in range(4):
        angle = 2.0 * math.pi * index / 4.0
        parts.append(box(f'{asset_id}_Lug_{index}', (0.06, 0.05, 0.12),
                         location=(radius * 1.18 * math.cos(angle),
                                   radius * 1.18 * math.sin(angle), -half * 0.45),
                         rotation=(0, 0, angle)))
    parts.append(cyl(f'{asset_id}_Index', 0.05, 0.02, location=(radius * 1.28, 0, half - 0.22),
                     rotation=(0, math.pi / 2, 0), vertices=12))
    return parts


def build_torpedo_warning_sensor(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Streamlined torpedo-warning sensor fairing with three transducer windows."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    width = asset['dimensions_m']['width']
    height = asset['dimensions_m']['height']
    parts = [
        lathe(f'{asset_id}_Fairing', [
            (0.0, -length / 2.0), (width * 0.22, -length / 2.0 + 0.07),
            (width * 0.46, -length * 0.22), (width * 0.50, 0.0),
            (width * 0.46, length * 0.22), (width * 0.30, length / 2.0 - 0.08),
            (0.0, length / 2.0),
        ], segments=24),
        box(f'{asset_id}_Base', (length * 0.86, width * 0.72, height * 0.30),
            location=(0, 0, -height * 0.30)),
        box(f'{asset_id}_ConnectorPanel', (0.20, 0.14, 0.10),
            location=(-length * 0.30, 0, -height * 0.42)),
    ]
    for index in range(3):
        x = (index - 1) * length * 0.26
        parts.append(cyl(f'{asset_id}_Window_{index}', width * 0.16, 0.03,
                         location=(x, 0, height * 0.48), vertices=16))
    for index, sign in enumerate((-1, 1)):
        parts.append(box(f'{asset_id}_Bracket_{index}', (length * 0.16, 0.05, 0.10),
                         location=(0, sign * width * 0.52, -height * 0.2)))
    return parts


def build_control_console(asset: dict, col: bpy.types.Collection) -> list[bpy.types.Object]:
    """Two-seat defensive control console with an angled display deck."""
    asset_id = asset['asset_id']
    length = asset['dimensions_m']['length']
    width = asset['dimensions_m']['width']
    height = asset['dimensions_m']['height']
    parts = [
        box(f'{asset_id}_Cabinet', (length, width, height * 0.62),
            location=(0, 0, height * 0.31)),
        box(f'{asset_id}_Deck', (length * 0.98, width * 0.92, 0.06),
            location=(0, 0, height * 0.64)),
        box(f'{asset_id}_DisplayDeck', (length * 0.30, width * 0.96, 0.08),
            location=(-length * 0.28, 0, height * 0.78),
            rotation=(0, math.radians(-22), 0)),
        box(f'{asset_id}_KickPlate', (length * 0.94, width * 0.80, 0.10),
            location=(0, 0, 0.05)),
    ]
    for index in range(2):
        y = (index - 0.5) * width * 0.44
        parts.append(box(f'{asset_id}_Screen_{index}', (length * 0.04, width * 0.34, 0.34),
                         location=(-length * 0.30, y, height * 0.86),
                         rotation=(0, math.radians(-22), 0)))
        parts.append(box(f'{asset_id}_Keyboard_{index}', (length * 0.22, width * 0.30, 0.03),
                         location=(length * 0.02, y, height * 0.66)))
    parts.append(box(f'{asset_id}_CabinetPanel', (0.03, width * 0.86, height * 0.42),
                     location=(length * 0.49, 0, height * 0.34)))
    for index in range(3):
        parts.append(box(f'{asset_id}_Handle_{index}', (0.04, 0.16, 0.03),
                         location=(length * 0.51, (index - 1) * width * 0.24, height * 0.34)))
    return parts


BUILDERS = {
    'esm_mast': build_esm_mast,
    'esm_mast_integrated': build_esm_mast_integrated,
    'esm_mast_blade': build_esm_mast_blade,
    'esm_mast_rugged': build_esm_mast_rugged,
    'esm_mast_slim': build_esm_mast_slim,
    'antenna_array': build_antenna_array,
    'decoy_canister': build_decoy_canister,
    'decoy_mobile': build_decoy_mobile,
    'noise_maker': build_noise_maker,
    'launcher_external': build_launcher_external,
    'launcher_tube': build_launcher_tube,
    'torpedo_warning_sensor': build_torpedo_warning_sensor,
    'control_console': build_control_console,
}

# Geometries whose long axis is the launcher axis (bow-aft, +X) rather than the
# vertical mast axis. They are built along Z and rotated once, after assembly.
LONG_AXIS_X = ('decoy_canister', 'decoy_mobile', 'noise_maker', 'launcher_tube')

# Material assignment per geometry kind: object-name prefix -> material name.
MATERIAL_RULES = {
    'esm_mast': [('Mast', 'Metal'), ('Head', 'DarkMetal'), ('Blade', 'AntennaMaterial'),
                 ('BaseFlange', 'Metal'), ('Bolt', 'Metal'), ('Ring', 'Rubber'),
                 ('TopDisc', 'AntennaMaterial')],
    'esm_mast_integrated': [('Shaft', 'Metal'), ('Radome', 'Composite'), ('Panel', 'AntennaMaterial'),
                            ('Blade', 'AntennaMaterial'), ('BaseFlange', 'Metal'),
                            ('Bolt', 'Metal'), ('Cap', 'DarkMetal')],
    'esm_mast_blade': [('MastCore', 'Metal'), ('Head', 'DarkMetal'), ('Blade', 'AntennaMaterial'),
                       ('BladeRoot', 'Composite'), ('Base', 'Metal'), ('Bolt', 'Metal'),
                       ('TopPost', 'AntennaMaterial')],
    'esm_mast_rugged': [('Mast', 'Metal'), ('AntennaBlock', 'DarkMetal'), ('BlockCap', 'AntennaMaterial'),
                        ('BaseFlange', 'Metal'), ('Seal', 'Rubber'), ('Port', 'Metal')],
    'esm_mast_slim': [('Mast', 'Metal'), ('Disc', 'AntennaMaterial'), ('BaseFlange', 'Metal'),
                      ('TopCap', 'DarkMetal'), ('Bolt', 'Metal')],
    'antenna_array': [('Panel', 'Composite'), ('Backing', 'DarkMetal'), ('Elem', 'AntennaMaterial'),
                      ('Rail', 'Rubber'), ('Connector', 'Metal')],
    'decoy_canister': [('Body', 'Composite'), ('Transducer', 'Glass'), ('TailRing', 'Metal'),
                       ('Fin', 'Metal'), ('Band', 'Rubber')],
    'decoy_mobile': [('Body', 'Composite'), ('TailCone', 'DarkMetal'), ('DriveRing', 'Metal'),
                     ('Fin', 'Metal'), ('FinRoot', 'Composite'), ('Band', 'Rubber')],
    'noise_maker': [('Body', 'Composite'), ('Cap', 'Metal'), ('Vent', 'DarkMetal'),
                    ('Rail', 'Rubber'), ('Float', 'Metal')],
    'launcher_external': [('Shell', 'Composite'), ('Fairing', 'Paint'), ('MountPlate', 'Metal'),
                          ('Hatch', 'DarkMetal'), ('Port', 'Metal'), ('PortRim', 'DarkMetal'),
                          ('Cable', 'Rubber')],
    'launcher_tube': [('Tube', 'Metal'), ('RearFlange', 'Metal'), ('Door', 'Paint'),
                      ('Hinge', 'DarkMetal'), ('Lug', 'Metal'), ('Index', 'Rubber')],
    'torpedo_warning_sensor': [('Fairing', 'Composite'), ('Base', 'Metal'),
                               ('ConnectorPanel', 'DarkMetal'), ('Window', 'Glass'),
                               ('Bracket', 'Rubber')],
    'control_console': [('Cabinet', 'Paint'), ('Deck', 'DarkMetal'), ('DisplayDeck', 'DarkMetal'),
                        ('KickPlate', 'Metal'), ('Screen', 'Glass'), ('Keyboard', 'DarkMetal'),
                        ('CabinetPanel', 'Composite'), ('Handle', 'Metal')],
}


def material_for_object(geometry: str, object_name: str) -> str:
    asset_token = object_name.split('_', 2)[-1] if object_name.count('_') >= 2 else object_name
    for prefix, material in MATERIAL_RULES[geometry]:
        if prefix in asset_token:
            return material
    return 'Metal'


def build_asset_objects(asset: dict) -> tuple[list[bpy.types.Object], list[str]]:
    """Build one asset. Returns (visible objects, material slot names in order)."""
    geometry = asset['geometry']
    if geometry not in BUILDERS:
        raise KeyError(f'no geometry builder for {geometry}')
    col = collection(asset['asset_id'])
    raw_parts = BUILDERS[geometry](asset, col)

    material_slots: list[str] = []
    visible: list[bpy.types.Object] = []
    for obj, definition in zip(raw_parts, [material_for_object(geometry, obj.name) for obj in raw_parts]):
        link(obj, col)
        assign(obj, definition)
        if definition not in material_slots:
            material_slots.append(definition)
        visible.append(obj)

    for socket_name in asset['sockets']:
        location = _socket_location(asset, socket_name)
        empty(socket_name, location, col)
    return visible, material_slots


def _socket_location(asset: dict, socket_name: str) -> tuple[float, float, float]:
    dims = asset['dimensions_m']
    if socket_name == 'SOCKET_EW_MAST':
        return (0.0, 0.0, 0.0)
    if socket_name == 'SOCKET_EW_ANTENNA':
        return (0.0, 0.0, dims.get('height', dims.get('length', 0.0)))
    if socket_name in ('SOCKET_COUNTERMEASURE_01', 'SOCKET_DECOY_LAUNCHER_01'):
        return (-dims.get('length', 0.0) / 2.0, 0.0, 0.0)
    return (dims.get('length', 0.0) / 2.0, 0.0, 0.0)


def asset_by_id(asset_id: str) -> dict:
    return dataset.ASSET_BY_ID[asset_id]
