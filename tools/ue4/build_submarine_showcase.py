"""Lays the whole submarine library out in one editor level.

Run it in a *full* editor session, never in `-run=pythonscript`: spawning actors
through the commandlet path crashes inside UnrealEd.

    UE4Editor.exe <uproject> -ExecutePythonScript=<this file> -ExecCmds=Quit \
        -unattended -nopause -nosplash -stdout

The level is a generated view of the library, not a hand-tended scene, so it is
rebuilt from scratch on every run:

* the boat list comes from the platform asset table, which is the same table the
  pawn resolves a hull from, so the level cannot show a boat the game cannot
  load;
* the grid spacing and the keel height come from the actual mesh bounds, so a
  new or rescaled hull re-lays the scene instead of quietly overlapping;
* each boat is one hull plus the five movable parts, placed at the pivots the
  assembly documents declare.

It deliberately does not screenshot: `AutomationLibrary.take_high_res_screenshot`
access-violates the editor when it runs this early in startup.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import unreal

ROOT = Path(os.environ.get('SD_SHOWCASE_ROOT', r'C:\workspace\ue4\silent-depth'))
TABLE = ROOT / 'ue4' / 'SilentDepthUE' / 'Config' / 'SilentDepth' / 'platform_assets.json'
LEVEL_PATH = '/Game/Maps/Submarine_Library'

#: Boats are bow-on +X, so cells are long in X and only a beam wide in Y. Four
#: columns of twelve keeps the block squarish enough that one camera can hold
#: every boat at once; a wider grid turns into a kilometre-long strip.
COLUMNS = 4
MARGIN_X_CM = 4000.0
MARGIN_Y_CM = 900.0
LABEL_WORLD_SIZE = 300.0
FLOOR_SLAB_CM = 60.0

PARTS = ('propulsor', 'rudder', 'sternPlanes', 'bowPlanes', 'periscope')
ORIGIN = (0.0, 0.0, 0.0)


def log(message: str) -> None:
    unreal.log(f'[showcase] {message}')


def load_table() -> list[tuple[str, dict]]:
    document = json.loads(TABLE.read_text(encoding='utf-8'))
    rows = []
    for asset_id, entry in document.get('platforms', {}).items():
        if not entry.get('hull'):
            log(f'skipping {asset_id}: no hull path')
            continue
        rows.append((asset_id, entry))

    def sort_key(item):
        country, type_name, class_name = (item[0].split('_', 2) + ['', ''])[:3]
        # SSNs and SSBNs in their own blocks, then by navy, then class.
        return (type_name, country, class_name)

    rows.sort(key=sort_key)
    return rows


def load_mesh(path: str):
    mesh = unreal.EditorAssetLibrary.load_asset(path)
    if mesh is None:
        log(f'missing mesh: {path}')
    return mesh


def mesh_bounds(mesh):
    """Returns (origin, extent) in the mesh's own space, or None."""
    try:
        bounds = mesh.get_bounds()
        return bounds.origin, bounds.box_extent
    except Exception:  # noqa: BLE001 - fall back to the box accessor
        pass
    try:
        box = mesh.get_bounding_box()
        return (box.min + box.max) * 0.5, (box.max - box.min) * 0.5
    except Exception as error:  # noqa: BLE001
        log(f'no bounds for {mesh.get_path_name()}: {error}')
        return None


def boat_pieces(entry: dict) -> list[tuple[str, object, tuple]]:
    """Every mesh of one boat as (label suffix, mesh, offset from hull origin)."""
    hull = load_mesh(entry['hull'])
    if hull is None:
        return []

    pieces = [('hull', hull, ORIGIN)]
    offsets = entry.get('partOffsetsCm') or {}
    for part in PARTS:
        path = entry.get(part)
        if not path:
            continue
        mesh = load_mesh(path)
        if mesh is None:
            continue
        offset = offsets.get(part) or ORIGIN
        pieces.append((part, mesh, tuple(float(value) for value in offset)))
    return pieces


def measure(pieces) -> dict:
    """Half length, half width, keel z and top z of a boat, in world units."""
    half_x = half_y = top_z = 0.0
    keel_z = 0.0
    for _name, mesh, offset in pieces:
        found = mesh_bounds(mesh)
        if found is None:
            continue
        origin, extent = found
        centre = (origin.x + offset[0], origin.y + offset[1], origin.z + offset[2])
        half_x = max(half_x, abs(centre[0]) + extent.x)
        half_y = max(half_y, abs(centre[1]) + extent.y)
        top_z = max(top_z, centre[2] + extent.z)
        keel_z = min(keel_z, centre[2] - extent.z)
    return {'half_x': half_x, 'half_y': half_y, 'keel_z': keel_z, 'top_z': top_z}


def spawn_mesh(mesh, location, label: str):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor, location, unreal.Rotator(0.0, 0.0, 0.0))
    if actor is None:
        log(f'could not spawn {label}')
        return None
    component = actor.static_mesh_component
    component.set_static_mesh(mesh)
    component.set_mobility(unreal.ComponentMobility.STATIC)
    component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    actor.set_actor_label(label, mark_dirty=True)
    return actor


def spawn_label(text: str, location, rotation) -> None:
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.TextRenderActor, location, rotation)
    if actor is None:
        log(f'could not spawn label {text}')
        return
    text_component = actor.text_render
    text_component.set_text(unreal.Text(text))
    text_component.set_world_size(LABEL_WORLD_SIZE)
    # Colour is cosmetic: a name that differs between engine versions must not
    # abort a build that has already placed the boats.
    try:
        text_component.set_text_render_color(unreal.Color(255, 235, 180, 255))
    except Exception as error:  # noqa: BLE001
        log(f'label colour skipped: {error}')
    actor.set_actor_label(f'Label_{text}', mark_dirty=True)


def build_environment(min_x, max_x, min_y, max_y) -> None:
    """Floor and lights, sized to the grid the boats actually need.

    The lights are movable on purpose: a static light only contributes after a
    baked lighting build, so a level someone opens straight from a fresh clone
    would render black.
    """
    span_x = max(max_x - min_x, 2000.0) * 1.15
    span_y = max(max_y - min_y, 2000.0) * 1.15
    centre = unreal.Vector((min_x + max_x) * 0.5, (min_y + max_y) * 0.5, -FLOOR_SLAB_CM * 0.5)
    middle = unreal.Vector((min_x + max_x) * 0.5, (min_y + max_y) * 0.5, 60000.0)

    # A slab, not a plane: the basic plane is single sided, so a camera on the
    # wrong side of it sees straight through the floor.
    floor = load_mesh('/Engine/BasicShapes/Cube.Cube')
    if floor is not None:
        actor = spawn_mesh(floor, centre, 'ShowcaseFloor')
        if actor is not None:
            # The basic cube is 100 cm across, so the scale factor is the span
            # it has to cover divided by that. The slab straddles z = 0, so the
            # keels of the boats sit on its top face.
            actor.set_actor_scale3d(unreal.Vector(span_x / 100.0, span_y / 100.0, FLOOR_SLAB_CM / 100.0))
            actor.static_mesh_component.set_material(
                0, unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/BasicShapeMaterial'))

    sun = add_directional_light('ShowcaseSun', middle, unreal.Rotator(-42.0, 35.0, 0.0), 3.5)
    if sun is None:
        log('no key light')
    add_directional_light('ShowcaseFill', middle, unreal.Rotator(-14.0, 215.0, 0.0), 1.2)

    sky = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0.0, 0.0, 30000.0), unreal.Rotator(0.0, 0.0, 0.0))
    if sky is not None:
        sky.set_actor_label('ShowcaseSky', mark_dirty=True)
        light_component = sky.get_component_by_class(unreal.SkyLightComponent)
        if light_component is not None:
            light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
            light_component.set_intensity(1.0)
            try:
                light_component.recapture_sky()
            except Exception as error:  # noqa: BLE001
                log(f'sky recapture skipped: {error}')

    # Manual exposure keeps a row of dark hulls from swinging the whole view
    # around as the camera moves. It only works with the *physical* camera
    # exposure switched off: manual exposure is scored as EV100 from
    # ISO/shutter/aperture, and the engine defaults (ISO 100, f/4, 1/60 s) put
    # it at EV100 9.9 -- about ten stops below what this level's unitless light
    # intensities put out, which renders every viewport black. These property
    # names moved between engine versions, so a failure here is cosmetic only.
    try:
        volume = unreal.EditorLevelLibrary.spawn_actor_from_class(
            unreal.PostProcessVolume, unreal.Vector(0.0, 0.0, 0.0), unreal.Rotator(0.0, 0.0, 0.0))
        volume.set_actor_label('ShowcaseExposure', mark_dirty=True)
        volume.set_editor_property('unbound', True)
        settings = volume.get_editor_property('settings')
        settings.set_editor_property('override_auto_exposure_apply_physical_camera_exposure', True)
        settings.set_editor_property('auto_exposure_apply_physical_camera_exposure', False)
        settings.set_editor_property('override_auto_exposure_method', True)
        settings.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_MANUAL)
        volume.set_editor_property('settings', settings)
    except Exception as error:  # noqa: BLE001
        log(f'exposure volume skipped: {error}')


def add_directional_light(label: str, location, rotation, intensity):
    sun = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.DirectionalLight, location, rotation)
    if sun is None:
        return None
    sun.set_actor_label(label, mark_dirty=True)
    light_component = sun.get_component_by_class(unreal.DirectionalLightComponent)
    if light_component is not None:
        light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
        light_component.set_intensity(intensity)
    return sun


def frame_camera(min_x, max_x, min_y, max_y) -> None:
    """Points the editor viewport at the grid, so opening the level shows it.

    The editor viewport opens with a 90 degree horizontal field of view, which
    covers about `2 * height` of ground, so the height and the shallow pitch are
    both about holding as much of the block as the frame allows. Anything the
    frame still cuts off is one `F` away: select everything in the World Outliner
    and focus.
    """
    span_x = max(max_x - min_x, 1000.0)
    span_y = max(max_y - min_y, 1000.0)
    location = unreal.Vector((min_x + max_x) * 0.5, min_y - span_y * 0.55, span_x * 0.26)
    try:
        unreal.EditorLevelLibrary.set_level_viewport_camera_info(
            location, unreal.Rotator(-35.0, 90.0, 0.0))
        log(f'viewport placed at ({location.x:.0f}, {location.y:.0f}, {location.z:.0f})')
    except Exception as error:  # noqa: BLE001
        log(f'viewport camera skipped: {error}')


def open_level() -> None:
    if unreal.EditorAssetLibrary.does_asset_exist(LEVEL_PATH):
        unreal.EditorLevelLibrary.load_level(LEVEL_PATH)
        for actor in unreal.EditorLevelLibrary.get_all_level_actors():
            unreal.EditorLevelLibrary.destroy_actor(actor)
        log('rebuilt the existing level')
    else:
        unreal.EditorLevelLibrary.new_level(LEVEL_PATH)
        log('created the level')


def main() -> int:
    rows = load_table()
    log(f'{len(rows)} platform(s) in the asset table')

    boats = []
    for asset_id, entry in rows:
        pieces = boat_pieces(entry)
        if not pieces:
            log(f'skipping {asset_id}: no loadable mesh')
            continue
        boats.append((asset_id, pieces, measure(pieces)))
    if not boats:
        log('nothing to place')
        return 1

    cell_x = 2.0 * max(boat['half_x'] for _id, _pieces, boat in boats) + MARGIN_X_CM
    cell_y = 2.0 * max(boat['half_y'] for _id, _pieces, boat in boats) + MARGIN_Y_CM
    log(f'cell {cell_x:.0f} x {cell_y:.0f} cm for {len(boats)} boat(s)')

    open_level()

    columns = min(COLUMNS, len(boats))
    row_count = (len(boats) + columns - 1) // columns
    min_x = -cell_x * 0.5
    max_x = min_x + (columns - 0.5) * cell_x
    min_y = -cell_y * 0.5
    max_y = min_y + (row_count - 0.5) * cell_y
    build_environment(min_x, max_x, min_y, max_y)

    hulls = 0
    parts = 0
    for index, (asset_id, pieces, boat) in enumerate(boats):
        x = (index % columns) * cell_x + min_x
        y = (index // columns) * cell_y + min_y
        keel = -boat['keel_z']  # sit the boat on the floor instead of sinking it
        for piece_name, mesh, offset in pieces:
            label = asset_id if piece_name == 'hull' else f'{asset_id}_{piece_name}'
            location = unreal.Vector(x + offset[0], y + offset[1], keel + offset[2])
            if spawn_mesh(mesh, location, label) is None:
                continue
            if piece_name == 'hull':
                hulls += 1
            else:
                parts += 1
        # The text faces -X, which is where the starting camera sits.
        spawn_label(asset_id, unreal.Vector(x, y - cell_y * 0.35, keel + boat['top_z'] + 400.0),
                    unreal.Rotator(0.0, 90.0, 0.0))

    frame_camera(min_x, max_x, min_y, max_y)
    unreal.EditorLevelLibrary.save_current_level()
    log(f'SHOWCASE_DONE hulls={hulls} parts={parts} level={LEVEL_PATH}')
    return 0 if hulls == len(boats) else 1


raise SystemExit(main())
