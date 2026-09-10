import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


MAPS = [
    "/Game/Maps/Ocean_Main",
    "/Game/Maps/Ocean_Cloudy",
    "/Game/Maps/Ocean_Storm",
    "/Game/Maps/Ocean_Night",
]


def set_movable(actor):
    if actor is None:
        return
    for comp in actor.get_components_by_class(unreal.ActorComponent):
        try:
            comp.set_mobility(unreal.ComponentMobility.MOVABLE)
        except Exception:
            pass
    log("  set movable: %s" % actor.get_class().get_name())


for path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        log("skip missing %s" % path)
        continue
    unreal.EditorLevelLibrary.load_level(path)
    log("loaded %s" % path)
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        name = a.get_class().get_name()
        if name in ("DirectionalLight", "SkyAtmosphere", "SkyLight", "ExponentialHeightFog"):
            set_movable(a)
    unreal.EditorLevelLibrary.save_current_level()
    log("saved %s" % path)

log("UE_LIGHTS_MOVABLE_DONE")
