import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


log("StaticMesh funcs: %s" % sorted(
    [x for x in dir(unreal.StaticMesh) if not x.startswith("_")
     and any(k in x.lower() for k in ("material", "section", "mat", "bounds", "lod", "bd"))]
))

# Registry: find MaterialInstanceConstant / Material assets in the project.
try:
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    for cls in ("Material", "MaterialInstanceConstant"):
        assets = reg.get_assets_by_class(cls)
        log("class %s count=%d" % (cls, len(assets)))
        for a in assets[:40]:
            name = str(a.asset_name)
            if any(k in name for k in ("Wet", "Glass", "Deck", "Rubber",
                                       "Painted", "Bronze", "Waterline", "Submarine", "glTF", "gltf")):
                log("   %s @ %s" % (a.asset_name, a.package_name))
except Exception as exc:
    log("registry error: %s" % exc)

# Package objects inside SM_HeroSubmarine.
try:
    mesh = unreal.EditorAssetLibrary.load_asset("/Game/Meshes/SM_HeroSubmarine.SM_HeroSubmarine")
    log("mesh material slots via API:")
    for i in range(12):
        try:
            m = mesh.get_material(i)
            if m:
                log("   slot %d -> %s (%s)" % (i, m.get_path_name(), m.get_class().get_name()))
        except Exception as exc:
            # stop after first failure
            break
except Exception as exc:
    log("mesh slot probe error: %s" % exc)

log("UE_PROBE_MESH_DONE")
