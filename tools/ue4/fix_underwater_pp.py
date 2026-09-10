import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


pp = unreal.EditorAssetLibrary.load_asset(
    "/Water/Materials/PostProcessing/M_UnderWater_PostProcess_Volume.M_UnderWater_PostProcess_Volume"
)
log("underwater PP material: %s" % pp)
MAPS = ["/Game/Maps/Ocean_Main", "/Game/Maps/Ocean_Cloudy", "/Game/Maps/Ocean_Storm", "/Game/Maps/Ocean_Night"]
for path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        continue
    unreal.EditorLevelLibrary.load_level(path)
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        if a.get_class().get_name() == "WaterBodyOcean" and pp is not None:
            try:
                a.set_editor_property("UnderwaterPostProcessMaterial", pp)
                log("set default underwater PP on %s" % path)
            except Exception as exc:
                log("set underwater pp err %s: %s" % (path, exc))
    unreal.EditorLevelLibrary.save_current_level()

log("UE_FIX_UNDERWATER_PP_DONE")
