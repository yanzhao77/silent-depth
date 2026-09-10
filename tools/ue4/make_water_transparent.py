import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


mic = unreal.EditorAssetLibrary.load_asset("/Game/Materials/MI_Ocean_SilentDepth.MI_Ocean_SilentDepth")
if mic is None:
    log("MI missing")
    raise SystemExit("no MI")

log("blend mode = %s" % mic.get_editor_property("blend_mode"))
log("shading model = %s" % mic.get_editor_property("shading_model"))

try:
    vp = [str(n) for n in unreal.MaterialEditingLibrary.get_vector_parameter_names(mic)]
    log("vector params: %s" % vp)
except Exception as exc:
    log("vec err: %s" % exc)
try:
    sp = [str(n) for n in unreal.MaterialEditingLibrary.get_scalar_parameter_names(mic)]
    log("scalar params: %s" % sp)
except Exception as exc:
    log("scalar err: %s" % exc)

# Force translucent so the submerged hull is visible through the surface.
try:
    mic.set_editor_property("blend_mode", unreal.BlendMode.BLEND_Translucent)
    log("set blend_mode = Translucent")
except Exception as exc:
    log("blend set err: %s" % exc)

# If the material has an Opacity scalar, keep it higher so it's visible but see-through.
try:
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(mic, "Opacity", 0.55)
    log("set Opacity = 0.55")
except Exception as exc:
    log("opacity set err (non-fatal): %s" % exc)

unreal.EditorAssetLibrary.save_asset(mic.get_path_name())
log("UE_WATER_TRANSPARENT_DONE")
