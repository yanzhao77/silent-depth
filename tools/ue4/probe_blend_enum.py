import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


log("BlendMode members: %s" % [m for m in dir(unreal.BlendMode) if m.startswith("BLEND_")])
log("MaterialShadingModel members: %s" % [m for m in dir(unreal.MaterialShadingModel) if m.startswith("MSM_")])
log("UE_PROBE_BLEND_DONE")
