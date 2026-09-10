import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


mat = unreal.EditorAssetLibrary.load_asset("/Game/Materials/M_SubmarineWater.M_SubmarineWater")
if mat:
    try:
        mat.set_editor_property("two_sided", True)
        unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
        log("set M_SubmarineWater two_sided + saved")
    except Exception as exc:
        log("two_sided err: %s" % exc)
else:
    log("M_SubmarineWater missing")

log("UE_TWOSIDED_DONE")
