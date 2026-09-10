import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


SRC = r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-lod0-merged.glb"
DEST = "/Game/Meshes"
OLD = "/Game/Meshes/hero-submarine-lod0-merged/0_HeroSubmarine"
TARGET = "/Game/Meshes/SM_HeroSubmarine"

unreal.EditorAssetLibrary.make_directory(DEST)
log("made dir %s" % DEST)

# Remove a previous SM_HeroSubmarine so the rename below is clean.
if unreal.EditorAssetLibrary.does_asset_exist(TARGET):
    unreal.EditorAssetLibrary.delete_asset(TARGET)
    log("deleted existing %s" % TARGET)

# Clean up the earlier per-part import (49 meshes under /Game/Meshes/hero-submarine-lod0).
try:
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    old = reg.get_assets_by_path("/Game/Meshes/hero-submarine-lod0", recursive=True)
    log("removing %d old per-part meshes" % len(old))
    for a in old:
        unreal.EditorAssetLibrary.delete_asset(str(a.package_name))
except Exception as exc:
    log("cleanup error: %s" % exc)

task = unreal.AssetImportTask()
task.filename = SRC
task.destination_path = DEST
task.automated = True
task.save = True
task.replace_existing = True

unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

try:
    paths = task.get_imported_asset_paths()
    log("imported %d assets" % len(paths))
    for p in paths:
        log("  -> %s" % p)
except Exception as exc:
    log("get_imported_asset_paths error: %s" % exc)

# Registry scan for what landed under /Game/Meshes.
try:
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    assets = reg.get_assets_by_path(DEST, recursive=False)
    log("assets under %s: %d" % (DEST, len(assets)))
    for a in assets:
        log(
            "  %s (%s) asset_class=%s"
            % (a.asset_name, a.package_name, a.asset_class)
        )
except Exception as exc:
    log("registry scan error: %s" % exc)

# Rename the single imported mesh to the canonical name the pawn expects.
if unreal.EditorAssetLibrary.does_asset_exist(OLD) and not unreal.EditorAssetLibrary.does_asset_exist(TARGET):
    ok = unreal.EditorAssetLibrary.rename_asset(OLD, TARGET)
    log("rename %s -> %s ok=%s" % (OLD, TARGET, ok))

log("UE_IMPORT_MODEL_DONE")
