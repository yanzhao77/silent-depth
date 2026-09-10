import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


names = [x for x in dir(unreal) if "niagara" in x.lower()]
log("niagara members: %s" % sorted(names))

for clsname in ("NiagaraSystemFactoryNew", "NiagaraEmitterFactoryNew", "NiagaraEditorLibrary", "NiagaraDataInterfaceGrid2DCollection"):
    cls = getattr(unreal, clsname, None)
    if cls is not None:
        log("%s: %s" % (clsname, sorted([m for m in dir(cls) if not m.startswith("_")]))[:200])

# Try to create an empty Niagara system asset.
try:
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.NiagaraSystemFactoryNew()
    asset = asset_tools.create_asset("NS_RestProbe", "/Game/FX", unreal.NiagaraSystem, factory)
    log("created NiagaraSystem: %s" % asset)
except Exception as exc:
    log("create NiagaraSystem err: %s" % exc)

log("UE_NIAGARA_PROBE_DONE")
