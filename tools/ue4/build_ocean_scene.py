import unreal


def log(msg):
    try:
        unreal.log(msg)
    except Exception:
        print(msg)


MAPS_DIR = "/Game/Maps"
MATS_DIR = "/Game/Materials"
BASE_MAPS = [
    ("/Game/Maps/Ocean_Main", "Clear"),
    ("/Game/Maps/Ocean_Cloudy", "Cloudy"),
    ("/Game/Maps/Ocean_Storm", "Storm"),
    ("/Game/Maps/Ocean_Night", "Night"),
]

WATER_MATERIAL_BASE = "/Water/Materials/WaterSurface/Water_Material"
WATER_MATERIAL_OCEAN = "/Water/Materials/WaterSurface/Water_Material_Ocean"
UNDERWATER_PP = "/Water/Materials/PostProcessing/M_UnderWater_PostProcess_Volume"


def get_class(py_name, asset_path):
    try:
        return getattr(unreal, py_name)
    except Exception as exc:
        log("load_class fallback for %s (%s)" % (py_name, exc))
        return unreal.load_class(None, asset_path)


def spawn_actor(cls, location=(0, 0, 0), label=None):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        cls,
        unreal.Vector(*location),
        unreal.Rotator(0, 0, 0),
    )
    if label:
        try:
            actor.set_actor_label(label)
        except Exception:
            pass
    log("spawned %s (%s)" % (str(actor), label))
    return actor


def load_asset(path):
    return unreal.EditorAssetLibrary.load_asset(path)


def _vector_names(mat):
    try:
        return [str(n) for n in unreal.MaterialEditingLibrary.get_vector_parameter_names(mat)]
    except Exception:
        return []


def _scalar_names(mat):
    try:
        return [str(n) for n in unreal.MaterialEditingLibrary.get_scalar_parameter_names(mat)]
    except Exception:
        return []


def dump_params(mat, tag):
    if mat is None:
        return
    log("== %s (%s) vector params ==" % (tag, mat.get_name()))
    for name in _vector_names(mat):
        val = None
        try:
            val = unreal.MaterialEditingLibrary.get_default_vector_parameter_value(mat, name)
        except Exception:
            pass
        log("  vector %-28s = %s" % (name, (val.r, val.g, val.b) if val else None))
    log("== %s scalar params ==" % mat.get_name())
    for name in _scalar_names(mat):
        val = None
        try:
            val = unreal.MaterialEditingLibrary.get_default_scalar_parameter_value(mat, name)
        except Exception:
            pass
        log("  scalar %-30s = %s" % (name, val))


def create_mic(name, parent_mat):
    """Create (or replace) a MaterialInstanceConstant and parent it."""
    path = MATS_DIR + "/" + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
        log("deleted stale MI %s" % path)
    factory = unreal.MaterialInstanceConstantFactoryNew()
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    mic = asset_tools.create_asset(name, MATS_DIR, unreal.MaterialInstanceConstant, factory)
    if mic is None:
        log("failed to create MI %s" % path)
        return None
    try:
        unreal.MaterialEditingLibrary.set_material_instance_parent(mic, parent_mat)
        log("MI %s parent -> %s" % (name, parent_mat.get_name()))
    except Exception as exc:
        log("set parent %s error: %s" % (name, exc))
    return mic


def make_ocean_material():
    """Cold ink-blue MaterialInstanceConstant from the plugin's ocean material."""
    unreal.EditorAssetLibrary.make_directory(MATS_DIR)
    base = load_asset(WATER_MATERIAL_BASE)
    ocean = load_asset(WATER_MATERIAL_OCEAN)
    if base is None:
        log("WARN: base water material missing -> %s" % WATER_MATERIAL_BASE)
    if ocean is None:
        log("WARN: ocean water material missing -> %s" % WATER_MATERIAL_OCEAN)

    dump_params(ocean or base, "ocean")
    dump_params(load_asset(UNDERWATER_PP), "underwater_pp")

    mic = create_mic("MI_Ocean_SilentDepth", ocean or base)
    if mic is None:
        return None

    # Cold ink-blue palette (linear approximations of the docs palette).
    albedo = unreal.LinearColor(0.034, 0.104, 0.200, 1.0)      # cold ink-blue base
    absorb = unreal.LinearColor(0.350, 0.500, 0.900, 1.0)      # blue-dominant absorption
    scatter = unreal.LinearColor(0.074, 0.156, 0.286, 1.0)     # cold scatter
    foam_scatter = unreal.LinearColor(0.130, 0.225, 0.345, 1.0)

    vector_names = _vector_names(ocean or base)
    for name in vector_names:
        low = name.lower()
        target = None
        if "albedo" in low or "watercolor" in low or "water_color" in low:
            target = albedo
        elif "absorb" in low:
            target = absorb
        elif "scatter" in low and "foam" not in low:
            target = scatter
        elif "foam" in low and "scatter" in low:
            target = foam_scatter
        if target is not None:
            try:
                unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
                    mic, name, target
                )
                log("set vector %-24s -> (%0.3f,%0.3f,%0.3f)" % (name, target.r, target.g, target.b))
            except Exception as exc:
                log("set vector %s error: %s" % (name, exc))

    unreal.EditorAssetLibrary.save_asset(mic.get_path_name())
    log("MI saved at %s" % mic.get_path_name())
    return mic


def make_underwater_material():
    """Cold MaterialInstanceConstant for the underwater post-process volume."""
    pp = load_asset(UNDERWATER_PP)
    if pp is None:
        log("WARN: underwater PP material missing -> %s" % UNDERWATER_PP)
        return None
    mic = create_mic("MI_UnderWater_SilentDepth", pp)
    if mic is None:
        return None

    absorb = unreal.LinearColor(0.300, 0.450, 0.850, 1.0)
    fog_scatter = unreal.LinearColor(0.060, 0.140, 0.240, 1.0)
    fog_ambient = unreal.LinearColor(0.020, 0.050, 0.100, 1.0)
    band = unreal.LinearColor(0.040, 0.100, 0.180, 1.0)

    for name in _vector_names(pp):
        low = name.lower()
        target = None
        if "absorb" in low:
            target = absorb
        elif "scatter" in low:
            target = fog_scatter
        elif "ambient" in low:
            target = fog_ambient
        elif "band" in low:
            target = band
        if target is not None:
            try:
                unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
                    mic, name, target
                )
                log("underwater vector %-20s set" % name)
            except Exception as exc:
                log("underwater vector %s error: %s" % (name, exc))

    # Scalars: keep the water readable but let depth darken it.
    for name in _scalar_names(pp):
        low = name.lower()
        val = None
        if low == "fog":
            val = 0.45
        elif "max depth" in low:
            val = 40.0
        elif "near plane" in low:
            val = 5.0
        if val is not None:
            try:
                unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
                    mic, name, val
                )
                log("underwater scalar %-20s = %s" % (name, val))
            except Exception as exc:
                log("underwater scalar %s error: %s" % (name, exc))

    unreal.EditorAssetLibrary.save_asset(mic.get_path_name())
    log("underwater MI saved at %s" % mic.get_path_name())
    return mic


def find_water_component(actor):
    """Find the real WaterBody* component (not the spline) on a water body actor."""
    comps = []
    try:
        comps = actor.get_components_by_class(unreal.ActorComponent)
    except Exception as exc:
        log("actor.get_components_by_class error: %s" % exc)
    log("actor %s has %d ActorComponents" % (actor.get_name(), len(comps)))
    for c in comps:
        cname = c.get_class().get_name()
        log("   comp class=%s name=%s" % (cname, c.get_name()))
        if "WaterBody" in cname and "Spline" not in cname:
            log("water comp selected: %s" % cname)
            return c
    return None


def _set_any(obj, names, value):
    """Try setting the first matching editor property on an object."""
    for name in names:
        try:
            obj.set_editor_property(name, value)
            log("set %s on %s" % (name, obj.get_name()))
            return True
        except Exception:
            continue
    return False


def assign_water(actor, water_mic, underwater_mic):
    done_mat = _set_any(
        actor,
        ("WaterMaterial", "Material", "WaterSurfaceMaterial"),
        water_mic,
    )
    done_pp = _set_any(
        actor,
        ("UnderwaterPostProcessMaterial", "UnderwaterPostProcess"),
        underwater_mic,
    )
    done_col = _set_any(
        actor,
        ("GenerateCollision", "bGenerateCollision", "bFillCollisionUnderWaterBodies"),
        True,
    )
    log("water assign mat=%s pp=%s collision=%s" % (done_mat, done_pp, done_col))

    # Report which water-related editor properties the actor actually exposes.
    try:
        props = [
            p for p in dir(actor)
            if "water" in p.lower() or "underwater" in p.lower() or "material" in p.lower()
        ]
        log("water-ish actor properties: %s" % sorted(props))
    except Exception as exc:
        log("dir(actor) error: %s" % exc)


def apply_weather(light, fog, weather):
    presets = {
        "Clear": (6.5, (1.0, 1.0, 1.0), 0.0012, (0.02, 0.04, 0.07)),
        "Cloudy": (3.0, (0.76, 0.81, 0.87), 0.004, (0.05, 0.08, 0.12)),
        "Storm": (0.7, (0.40, 0.44, 0.50), 0.016, (0.03, 0.045, 0.08)),
        "Night": (0.38, (0.13, 0.17, 0.32), 0.008, (0.006, 0.01, 0.025)),
    }
    intensity, light_rgb, fog_density, fog_rgb = presets[weather]
    log("weather=%s light_intensity=%s" % (weather, intensity))

    # Directional light component.
    light_comp = None
    try:
        comps = light.get_components_by_class(unreal.DirectionalLightComponent)
        light_comp = comps[0] if comps else None
    except Exception as exc:
        log("directional light comp error: %s" % exc)
    if light_comp is not None:
        ok_i = False
        ok_c = False
        try:
            interesting = [
                m for m in dir(light_comp)
                if "intens" in m.lower() or "color" in m.lower() or "light" in m.lower()
            ]
            log("directional light comp props: %s" % sorted(interesting))
        except Exception as exc:
            log("dir(light_comp) err: %s" % exc)
        for name in ("LightIntensity", "Intensity", "ScaledIntensity"):
            try:
                light_comp.set_editor_property(name, float(intensity))
                ok_i = True
                log("light intensity set via %s" % name)
                break
            except Exception:
                continue
        for name in ("LightColor", "Color"):
            try:
                light_comp.set_editor_property(
                    name,
                    unreal.LinearColor(light_rgb[0], light_rgb[1], light_rgb[2], 1.0),
                )
                ok_c = True
                log("light color set via %s" % name)
                break
            except Exception:
                continue
        if not ok_c:
            try:
                light_comp.set_editor_property(
                    "LightColor",
                    unreal.Color(
                        int(light_rgb[0] * 255),
                        int(light_rgb[1] * 255),
                        int(light_rgb[2] * 255),
                        255,
                    ),
                )
                ok_c = True
                log("light color set via LightColor(FColor)")
            except Exception:
                pass
        log("directional light set intensity=%s color=%s" % (ok_i, ok_c))
    else:
        log("directional light component not found")

    # Exponential height fog component.
    fog_comp = None
    try:
        comps = fog.get_components_by_class(unreal.ExponentialHeightFogComponent)
        fog_comp = comps[0] if comps else None
    except Exception as exc:
        log("fog comp error: %s" % exc)
    if fog_comp is not None:
        ok_f = False
        ok_fc = False
        try:
            fog_comp.set_editor_property("FogDensity", float(fog_density))
            ok_f = True
        except Exception:
            pass
        try:
            fog_comp.set_editor_property(
                "FogInscatteringColor",
                unreal.LinearColor(fog_rgb[0], fog_rgb[1], fog_rgb[2], 1.0),
            )
            ok_fc = True
        except Exception:
            pass
        log("fog set density=%s color=%s" % (ok_f, ok_fc))
    else:
        log("fog component not found")

def configure_skylight(actor):
    comps = []
    try:
        comps = actor.get_components_by_class(unreal.SkyLightComponent)
    except Exception as exc:
        log("skylight component error: %s" % exc)
    if not comps:
        log("no SkyLightComponent found on SkyLight")
        return
    slc = comps[0]
    src = None
    for name in (
        "SLS_CapturedScene",
        "SLS_CAPTURED_SCENE",
        "SLS_Captured",
        "CapturedScene",
        "SLS_RealTimeCapture",
    ):
        if hasattr(unreal.SkyLightSourceType, name):
            src = getattr(unreal.SkyLightSourceType, name)
            break
    if src is None:
        members = [
            m for m in dir(unreal.SkyLightSourceType) if not m.startswith("_")
        ]
        log("SkyLightSourceType members: %s" % members)
    else:
        try:
            slc.set_editor_property("SourceType", src)
            slc.set_editor_property("bRealTimeCapture", True)
            log("skylight configured (captured scene, realtime) -> %s" % src)
        except Exception as exc:
            log("skylight config error: %s" % exc)


def configure_exposure(actor, weather):
    """Lock auto-exposure to a fixed value so the weather mood actually shows."""
    # A constant lock keeps brightness driven by the light intensity, which is
    # what actually varies per weather. Lower values allow more gain (brighter).
    exposure = 0.40
    try:
        actor.set_editor_property("bUnbound", True)
        settings = actor.get_editor_property("settings")
        setattr(settings, "override_auto_exposure_min_brightness", True)
        setattr(settings, "auto_exposure_min_brightness", exposure)
        setattr(settings, "override_auto_exposure_max_brightness", True)
        setattr(settings, "auto_exposure_max_brightness", exposure)
        # Bias can fail quietly; min==max is the primary lock.
        try:
            setattr(settings, "override_auto_exposure_bias", True)
            setattr(settings, "auto_exposure_bias", exposure - 1.0)
        except Exception:
            pass
        actor.set_editor_property("settings", settings)
        log("exposure locked for %s at %.2f" % (weather, exposure))
    except Exception as exc:
        log("exposure config error: %s" % exc)
        try:
            light_comp.set_editor_property(
                "LightColor",
                unreal.LinearColor(light_rgb[0], light_rgb[1], light_rgb[2], 1.0),
            )
        except Exception:
            pass

    try:
        fog_comp = fog.exponential_height_fog_component
    except Exception:
        fog_comp = None
    if fog_comp is not None:
        try:
            fog_comp.set_editor_property("FogDensity", float(fog_density))
        except Exception:
            pass
        try:
            fog_comp.set_editor_property(
                "FogInscatteringColor",
                unreal.LinearColor(fog_rgb[0], fog_rgb[1], fog_rgb[2], 1.0),
            )
        except Exception:
            pass


def ensure_level(level_path):
    """Load the level if it exists, otherwise create a fresh one."""
    if unreal.EditorAssetLibrary.does_asset_exist(level_path):
        unreal.EditorLevelLibrary.load_level(level_path)
        log("loaded level %s" % level_path)
    else:
        unreal.EditorLevelLibrary.new_level(level_path)
        log("created new level %s" % level_path)


def dedupe_level(target_classes):
    """Keep exactly one actor per target class; destroy duplicates (if any)."""
    try:
        actors = unreal.EditorLevelLibrary.get_all_level_actors()
    except Exception as exc:
        log("dedupe enumerate error: %s" % exc)
        return
    seen = {}
    for a in actors:
        try:
            cname = a.get_class().get_name()
        except Exception:
            continue
        if cname not in target_classes:
            continue
        if cname in seen:
            try:
                a.destroy_actor()
                log("dedupe: removed extra %s" % cname)
            except Exception as exc:
                log("dedupe destroy %s error: %s" % (cname, exc))
        else:
            seen[cname] = a


def get_or_spawn(cls, cls_name, location=(0, 0, 0), label=None):
    """Reuse an existing actor of this class, or spawn it."""
    try:
        actors = unreal.EditorLevelLibrary.get_all_level_actors()
        for a in actors:
            try:
                if a.get_class().get_name() == cls_name:
                    if label:
                        a.set_actor_label(label)
                    return a
            except Exception:
                continue
    except Exception as exc:
        log("get_or_spawn enumerate error: %s" % exc)
    return spawn_actor(cls, location, label)


def build_one(level_path, weather, water_mic, underwater_mic):
    ensure_level(level_path)
    dedupe_level({
        "WaterMeshActor", "WaterBodyOcean", "DirectionalLight",
        "SkyAtmosphere", "ExponentialHeightFog", "PlayerStart", "SkyLight",
        "PostProcessVolume",
    })

    water_mesh_cls = get_class("WaterMeshActor", "/Script/Water.WaterMeshActor")
    ocean_cls = get_class("WaterBodyOcean", "/Script/Water.WaterBodyOcean")
    light_cls = get_class("DirectionalLight", "/Script/Engine.DirectionalLight")
    sky_cls = get_class("SkyAtmosphere", "/Script/Engine.SkyAtmosphere")
    fog_cls = get_class("ExponentialHeightFog", "/Script/Engine.ExponentialHeightFog")
    start_cls = get_class("PlayerStart", "/Script/Engine.PlayerStart")
    skylight_cls = get_class("SkyLight", "/Script/Engine.SkyLight")
    ppv_cls = get_class("PostProcessVolume", "/Script/Engine.PostProcessVolume")

    water_mesh = get_or_spawn(water_mesh_cls, "WaterMeshActor", label="WaterMesh")
    body = get_or_spawn(ocean_cls, "WaterBodyOcean", label="Ocean")
    light = get_or_spawn(light_cls, "DirectionalLight", (0, 0, 4000), label="Sun")
    # Raise the sun so the atmosphere reads as a cool blue sky, not a warm horizon.
    try:
        light.set_actor_rotation(unreal.Rotator(-70, -20, 0), False)
        log("sun rotation set to high elevation")
    except Exception as exc:
        log("sun rotation error: %s" % exc)
    get_or_spawn(sky_cls, "SkyAtmosphere", label="SkyAtmosphere")
    fog = get_or_spawn(fog_cls, "ExponentialHeightFog", (0, 0, 1000), label="Fog")
    get_or_spawn(start_cls, "PlayerStart", (0, 0, 1000), label="PlayerStart")
    sky_light = get_or_spawn(skylight_cls, "SkyLight", (0, 0, 2000), label="SkyLight")
    configure_skylight(sky_light)
    ppv = get_or_spawn(ppv_cls, "PostProcessVolume", label="Exposure")
    configure_exposure(ppv, weather)

    try:
        wm = water_mesh.water_mesh
        wm.set_editor_property("TileSize", 10000)
        wm.set_editor_property("ExtentInTiles", unreal.IntPoint(200, 200))
        log("water mesh extent set")
    except Exception as exc:
        log("water mesh extent error: %s" % exc)

    # In the UE4.27 Water plugin the water material lives on the body actor.
    assign_water(body, water_mic, underwater_mic)

    apply_weather(light, fog, weather)

    try:
        unreal.EditorLevelLibrary.save_current_level()
        log("saved %s (%s)" % (level_path, weather))
    except Exception as exc:
        log("save error for %s: %s" % (level_path, exc))
        try:
            unreal.EditorLevelLibrary.save_all_dirty_levels()
        except Exception as exc2:
            log("save_all error: %s" % exc2)


def main():
    unreal.EditorAssetLibrary.make_directory(MAPS_DIR)
    unreal.EditorAssetLibrary.make_directory(MATS_DIR)
    water_mic = make_ocean_material()
    underwater_mic = make_underwater_material()
    for level_path, weather in BASE_MAPS:
        build_one(level_path, weather, water_mic, underwater_mic)
    log("OCEAN_BUILD_ALL_DONE")


main()
