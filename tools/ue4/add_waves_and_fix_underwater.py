import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


# --- 1. Create a WaterWaves asset with a few Gerstner waves. ---
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
factory = unreal.WaterWavesAssetFactory()
ww = asset_tools.create_asset("WW_Ocean", "/Game/FX", unreal.WaterWaves, factory)
if ww is None:
    log("WaterWaves create failed")
else:
    log("created WW_Ocean: %s" % ww.get_path_name())
    # Try to configure a simple Gerstner generator.
    try:
        gen = unreal.GerstnerWaterWaveGeneratorSimple()
        gen.set_editor_property("name", "GerstnerWaves")
        # A couple of octaves via GerstnerWaveOctave.
        octaves = unreal.Array(unreal.GerstnerWaveOctave)
        o1 = unreal.GerstnerWaveOctave()
        o1.set_editor_property("amplitude", 0.6)
        o1.set_editor_property("wave_length", 60.0)
        o1.set_editor_property("steepness", 0.8)
        octaves.append(o1)
        o2 = unreal.GerstnerWaveOctave()
        o2.set_editor_property("amplitude", 0.35)
        o2.set_editor_property("wave_length", 30.0)
        o2.set_editor_property("steepness", 0.7)
        octaves.append(o2)
        gen.set_editor_property("water_waves_parameters", octaves)
        ww.set_editor_property("wave_generator", gen)
        log("configured Gerstner waves")
    except Exception as exc:
        log("gerstner config err (non-fatal): %s" % exc)
    unreal.EditorAssetLibrary.save_asset(ww.get_path_name())

# --- 2. Assign the waves to each WaterBody. ---
MAPS = ["/Game/Maps/Ocean_Main", "/Game/Maps/Ocean_Cloudy", "/Game/Maps/Ocean_Storm", "/Game/Maps/Ocean_Night"]
for path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        continue
    unreal.EditorLevelLibrary.load_level(path)
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        if a.get_class().get_name() == "WaterBodyOcean" and ww is not None:
            try:
                a.set_editor_property("WaterWaves", ww)
                log("set WaterWaves on %s" % path)
            except Exception as exc:
                log("set waves err %s: %s" % (path, exc))
    unreal.EditorLevelLibrary.save_current_level()

# --- 3. Lighten the underwater post-process (so underwater isn't black). ---
up = unreal.EditorAssetLibrary.load_asset("/Game/Materials/MI_UnderWater_SilentDepth.MI_UnderWater_SilentDepth")
if up is not None:
    try:
        unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(up, "Fog", 0.12)
        log("underwater Fog -> 0.12")
    except Exception as exc:
        log("fog err: %s" % exc)
    try:
        unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
            up, "Fog Scatter Color", unreal.LinearColor(0.10, 0.20, 0.32, 1.0)
        )
        log("underwater scatter lightened")
    except Exception as exc:
        log("scatter err: %s" % exc)
    unreal.EditorAssetLibrary.save_asset(up.get_path_name())

log("UE_WAVES_UNDERWATER_DONE")
