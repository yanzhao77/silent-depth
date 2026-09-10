import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


mic = unreal.EditorAssetLibrary.load_asset("/Game/Materials/MI_Ocean_SilentDepth.MI_Ocean_SilentDepth")
if mic:
    try:
        parent = mic.get_editor_property("parent")
        log("parent = %s" % parent)
        log("parent blend_mode = %s" % parent.get_editor_property("blend_mode"))
    except Exception as exc:
        log("parent err: %s" % exc)
    try:
        base = mic.get_base_material()
        log("base = %s blend=%s" % (base.get_name(), base.get_editor_property("blend_mode")))
    except Exception as exc:
        log("base err: %s" % exc)

# Also load the direct plugin material to read its blend mode.
water = unreal.EditorAssetLibrary.load_asset("/Water/Materials/WaterSurface/Water_Material_Ocean.Water_Material_Ocean")
if water:
    try:
        log("plugin water blend_mode = %s" % water.get_editor_property("blend_mode"))
    except Exception as exc:
        log("plugin water blend err: %s" % exc)

log("UE_PROBE_WATER_BLEND_DONE")
