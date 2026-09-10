import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


OLD = "/Game/Meshes/hero-submarine-lod0-merged/0_HeroSubmarine"
NEW = "/Game/Meshes/SM_HeroSubmarine"

if unreal.EditorAssetLibrary.does_asset_exist(NEW):
    unreal.EditorAssetLibrary.delete_asset(NEW)
    log("deleted existing SM_HeroSubmarine")

ok = unreal.EditorAssetLibrary.rename_asset(OLD, NEW)
log("rename %s -> %s ok=%s" % (OLD, NEW, ok))

mesh = unreal.EditorAssetLibrary.load_asset(NEW)
if mesh is None:
    log("could not load %s" % NEW)
else:
    log("loaded mesh: %s class=%s" % (mesh.get_path_name(), mesh.get_class().get_name()))
    # Try to read bounds.
    try:
        bounds = mesh.get_bounds()
        log("bounds origin=%s extent=%s sphere=%s" % (
            bounds.origin, bounds.box_extent, bounds.sphere_radius
        ))
    except Exception as exc:
        log("get_bounds error: %s" % exc)
    try:
        mat_count = mesh.get_num_materials()
        log("material count=%d" % mat_count)
    except Exception as exc:
        log("material count error: %s" % exc)

log("UE_FINALIZE_MESH_DONE")
