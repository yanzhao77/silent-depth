import unreal


def log(msg):
    try:
        unreal.log(msg)
    except Exception:
        print(msg)


LEVEL_PATH = "/Game/Maps/Ocean_Main"


def get_class(py_name, asset_path):
    """Return the Python class wrapper, falling back to load_class by path."""
    try:
        return getattr(unreal, py_name)
    except Exception as exc:
        log("load_class fallback for %s (%s)" % (py_name, exc))
        return unreal.load_class(None, asset_path)


def spawn_actor(cls, location=(0, 0, 0), rotation=(0, 0, 0)):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        cls,
        unreal.Vector(*location),
        unreal.Rotator(*rotation),
    )
    log("spawned %s" % str(actor))
    return actor


def spawn_named(py_name, asset_path, location=(0, 0, 0)):
    cls = get_class(py_name, asset_path)
    if not cls:
        log("missing class %s" % py_name)
        return None
    return spawn_actor(cls, location, (0, 0, 0))


# 1. Create the Maps folder and the new level (this also saves it).
try:
    unreal.EditorAssetLibrary.make_directory("/Game/Maps")
    log("ensured /Game/Maps")
except Exception as exc:
    log("make_directory error: %s" % exc)

try:
    if unreal.EditorAssetLibrary.does_asset_exist(LEVEL_PATH):
        unreal.EditorAssetLibrary.delete_asset(LEVEL_PATH)
        log("deleted existing level %s" % LEVEL_PATH)
    unreal.EditorLevelLibrary.new_level(LEVEL_PATH)
    log("created level %s" % LEVEL_PATH)
    if not unreal.EditorAssetLibrary.does_asset_exist(LEVEL_PATH):
        log("new_level did not produce an asset; aborting")
        raise SystemExit("new_level failed to create level")
except Exception as exc:
    log("new_level error: %s" % exc)
    raise

# 2. Water mesh actor - required to actually render the water surface.
water_mesh_cls = get_class("WaterMeshActor", "/Script/Water.WaterMeshActor")
if water_mesh_cls:
    water_mesh = spawn_actor(water_mesh_cls, (0, 0, 0))
    try:
        wm = water_mesh.water_mesh
        wm.set_editor_property("TileSize", 10000)
        wm.set_editor_property("ExtentInTiles", unreal.IntPoint(200, 200))
        wm.set_editor_property("FarDistance", 2000000)
        wm.set_editor_property("FarDistanceMeshExtent", 2000000)
        log("water mesh extents set")
    except Exception as exc:
        log("water mesh property error (non-fatal): %s" % exc)

# 3. Ocean water body.
ocean_cls = get_class("WaterBodyOcean", "/Script/Water.WaterBodyOcean")
if ocean_cls:
    body = spawn_actor(ocean_cls, (0, 0, 0))
    try:
        body.set_actor_label("Ocean")
    except Exception:
        pass

# 4. Light, sky and fog so the scene is readable.
spawn_named("DirectionalLight", "/Script/Engine.DirectionalLight", (0, 0, 4000))
spawn_named("SkyAtmosphere", "/Script/Engine.SkyAtmosphere", (0, 0, 0))
spawn_named("ExponentialHeightFog", "/Script/Engine.ExponentialHeightFog", (0, 0, 1000))
spawn_named("PlayerStart", "/Script/Engine.PlayerStart", (0, 0, 1000))

# 5. Save.
try:
    unreal.EditorLevelLibrary.save_current_level()
    log("saved current level")
except Exception as exc:
    log("save_current_level error: %s" % exc)
    try:
        unreal.EditorLevelLibrary.save_all_dirty_levels()
        log("saved all dirty levels")
    except Exception as exc2:
        log("save_all error: %s" % exc2)

log("OCEAN_SCENE_DONE")
