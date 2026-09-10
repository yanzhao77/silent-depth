import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


names = [x for x in dir(unreal) if "wave" in x.lower() and ("water" in x.lower() or "gerstner" in x.lower())]
log("water wave classes: %s" % sorted(names))

# Any factory for waves?
factories = [x for x in dir(unreal) if "wave" in x.lower() and ("factory" in x.lower() or "new" in x.lower())]
log("wave factories: %s" % sorted(factories))

# WaterBodyOcean actor props for waves.
ocean = unreal.load_class(None, "/Script/Water.WaterBodyOcean")
log("water wave factory new: %s" % str(getattr(unreal, "WaterWavesFactoryNew", None)))
log("water waves asset factory: %s" % str(getattr(unreal, "WaterWavesAssetFactoryNew", None)))
log("water waves class: %s" % str(getattr(unreal, "WaterWaves", None)))
log("water waves asset class: %s" % str(getattr(unreal, "WaterWavesAsset", None)))

log("UE_PROBE_WAVES_DONE")
