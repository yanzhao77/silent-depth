import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


SRC = r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-propeller.glb"
DEST = "/Game/Meshes"
TARGET = "/Game/Meshes/SM_Propeller"

unreal.EditorAssetLibrary.make_directory(DEST)
if unreal.EditorAssetLibrary.does_asset_exist(TARGET):
    unreal.EditorAssetLibrary.delete_asset(TARGET)
    log("deleted old %s" % TARGET)

task = unreal.AssetImportTask()
task.filename = SRC
task.destination_path = DEST
task.automated = True
task.save = True
task.replace_existing = True
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

# The import makes an asset named from the glTF node ("Propeller"); find & rename.
try:
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = reg.get_assets_by_path(DEST, recursive=True)
    for a in assets:
        name = str(a.asset_name)
        if name.startswith(("Propeller", "0_Propeller", "hero")):
            old = str(a.package_name)
            if not unreal.EditorAssetLibrary.does_asset_exist(TARGET):
                ok = unreal.EditorAssetLibrary.rename_asset(old, TARGET)
                log("rename %s -> %s ok=%s" % (old, TARGET, ok))
            break
except Exception as exc:
    log("rename err: %s" % exc)

log("UE_IMPORT_PROPELLER_DONE")
