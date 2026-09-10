import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


mic = unreal.EditorAssetLibrary.load_asset("/Game/Materials/MI_Ocean_SilentDepth.MI_Ocean_SilentDepth")
MAPS = ["/Game/Maps/Ocean_Main", "/Game/Maps/Ocean_Cloudy", "/Game/Maps/Ocean_Storm", "/Game/Maps/Ocean_Night"]
for path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        continue
    unreal.EditorLevelLibrary.load_level(path)
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        if a.get_class().get_name() == "WaterBodyOcean":
            try:
                a.set_editor_property("WaterMaterial", mic)
                log("reverted WaterMaterial on %s" % path)
            except Exception as exc:
                log("revert err %s: %s" % (path, exc))
    unreal.EditorLevelLibrary.save_current_level()

log("UE_REVERT_WATER_DONE")
