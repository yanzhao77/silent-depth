"""Import RU_SSBN_Typhoon (Project 941) into the UE4.27 project.

Source of truth for the import settings is
ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md. This script only encodes that plan;
it does not invent new settings.

Run with:
  UE4Editor-Cmd.exe <project>.uproject -run=pythonscript -script=<this file> \
    -unattended -nopause -nosplash -stdout

Output goes to LogPython in Saved/Logs/SilentDepthUE.log, not to stdout.
"""

import os

import unreal

REPO_ROOT = r"C:\workspace\ue4\silent-depth"
ASSET_ID = "RU_SSBN_Typhoon"
SRC_DIR = os.path.join(
    REPO_ROOT, "SilentDepth_Assets", "Submarines", "SSBN", "Russia", "Typhoon_Project941"
)
DEST_ROOT = "/Game/SilentDepth/Art/Submarines/SSBN/Russia/Typhoon"
LOD_SRC_DIR = DEST_ROOT + "/LODSources"
TEXTURE_DIR = DEST_ROOT + "/Textures"

MESH_NAME = "SM_" + ASSET_ID
LOD_TEMPLATE = "SM_{}_LOD{}"

# (source png, destination name, srgb, compression)
TEXTURES = [
    ("Textures/BaseColor/T_Typhoon_Hull_BaseColor.png", "T_Typhoon_Hull_BaseColor", True, "TC_DEFAULT"),
    ("Textures/BaseColor/T_Typhoon_Rubber_BaseColor.png", "T_Typhoon_Rubber_BaseColor", True, "TC_DEFAULT"),
    ("Textures/AO/T_Typhoon_Hull_ORM.png", "T_Typhoon_Hull_ORM", False, "TC_MASKS"),
    ("Textures/AO/T_Typhoon_Rubber_ORM.png", "T_Typhoon_Rubber_ORM", False, "TC_MASKS"),
    ("Textures/Normal/T_Typhoon_Hull_NormalDX.png", "T_Typhoon_Hull_NormalDX", False, "TC_NORMALMAP"),
    ("Textures/Normal/T_Typhoon_Rubber_NormalDX.png", "T_Typhoon_Rubber_NormalDX", False, "TC_NORMALMAP"),
    # NormalGL is deliberately skipped: it is the Blender-facing green channel.
]


def log(message):
    unreal.log("[typhoon] " + str(message))


def warn(message):
    unreal.log_warning("[typhoon] " + str(message))


def set_prop(target, name, value):
    """Set an editor property, logging instead of failing on version drift."""
    try:
        target.set_editor_property(name, value)
        return True
    except Exception as exc:  # noqa: BLE001 - report and continue
        warn("could not set {}={}: {}".format(name, value, exc))
        return False


def make_static_mesh_import_ui():
    """Import settings per docs/UE427_IMPORT_PLAN.md, table '通用静态网格导入设置'."""
    ui = unreal.FbxImportUI()
    ui.set_editor_property("import_mesh", True)
    ui.set_editor_property("import_as_skeletal", False)
    ui.set_editor_property("import_materials", False)
    ui.set_editor_property("import_textures", False)
    ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)

    data = ui.static_mesh_import_data
    set_prop(data, "combine_meshes", False)
    set_prop(data, "auto_generate_collision", False)
    set_prop(data, "generate_lightmap_u_vs", False)
    set_prop(data, "import_uniform_scale", 1.0)
    set_prop(data, "convert_scene", True)
    set_prop(data, "convert_scene_unit", True)
    set_prop(data, "normal_import_method", unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS)
    set_prop(data, "one_convex_hull_per_ucx", True)
    set_prop(data, "remove_degenerates", False)
    set_prop(data, "import_mesh_lo_ds", False)
    return ui


def import_fbx(fbx_path, destination_path, destination_name):
    if not os.path.isfile(fbx_path):
        warn("missing source fbx: " + fbx_path)
        return None

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", fbx_path)
    task.set_editor_property("destination_path", destination_path)
    task.set_editor_property("destination_name", destination_name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    task.set_editor_property("options", make_static_mesh_import_ui())

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.get_editor_property("imported_object_paths"))
    log("imported {} -> {}".format(os.path.basename(fbx_path), imported))
    if not imported:
        warn("import produced no assets for " + fbx_path)
        return None
    return imported[0]


def import_texture(relative_path, destination_name, srgb, compression):
    source = os.path.join(SRC_DIR, relative_path.replace("/", os.sep))
    if not os.path.isfile(source):
        warn("missing source texture: " + source)
        return None

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source)
    task.set_editor_property("destination_path", TEXTURE_DIR)
    task.set_editor_property("destination_name", destination_name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = list(task.get_editor_property("imported_object_paths"))
    if not imported:
        warn("texture import produced no asset: " + source)
        return None

    texture = unreal.EditorAssetLibrary.load_asset(imported[0])
    set_prop(texture, "srgb", srgb)
    set_prop(texture, "compression_settings", getattr(unreal.TextureCompressionSettings, compression))
    set_prop(texture, "flip_green_channel", False)
    unreal.EditorAssetLibrary.save_loaded_asset(texture)
    log("texture {} srgb={} compression={}".format(destination_name, srgb, compression))
    return imported[0]


def attach_lods(mesh_path):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if mesh is None:
        warn("could not load imported mesh " + mesh_path)
        return

    for index in (1, 2, 3):
        fbx = os.path.join(SRC_DIR, "FBX", "{}_LOD{}.fbx".format(ASSET_ID, index))
        lod_name = "SM_{}_LOD{}".format(ASSET_ID, index)
        imported = import_fbx(fbx, LOD_SRC_DIR, lod_name)
        if not imported:
            continue
        source_mesh = unreal.EditorAssetLibrary.load_asset(imported)
        try:
            # UE4.27 signature:
            #   set_lod_from_static_mesh(destination_static_mesh, destination_lod_index,
            #                            source_static_mesh, source_lod_index,
            #                            reuse_existing_material_slots) -> int32
            result = unreal.EditorStaticMeshLibrary.set_lod_from_static_mesh(
                mesh, index, source_mesh, 0, True
            )
            log("attached {} as LOD{} (result={})".format(lod_name, index, result))
        except Exception as exc:  # noqa: BLE001
            warn("set_lod_from_static_mesh failed for LOD{}: {}".format(index, exc))

    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    report_mesh(mesh_path)


def report_mesh(mesh_path):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)

    try:
        log("lod_count={}".format(unreal.EditorStaticMeshLibrary.get_lod_count(mesh)))
    except Exception as exc:  # noqa: BLE001
        warn("get_lod_count failed: " + str(exc))

    try:
        log("material_slots={}".format(unreal.EditorStaticMeshLibrary.get_number_materials(mesh)))
    except Exception as exc:  # noqa: BLE001
        warn("get_number_materials failed: " + str(exc))

    try:
        bounds = mesh.get_bounds()
        extent = bounds.box_extent
        log("bounds_extent_cm=({:.1f}, {:.1f}, {:.1f})  length_cm={:.1f}".format(
            extent.x, extent.y, extent.z, extent.x * 2.0))
    except Exception as exc:  # noqa: BLE001
        warn("get_bounds failed: " + str(exc))

    try:
        agg = mesh.get_editor_property("body_setup").get_editor_property("agg_geom")
        log("convex_collision_elements={}".format(len(list(agg.get_editor_property("convex_elems")))))
    except Exception as exc:  # noqa: BLE001
        warn("collision introspection failed: " + str(exc))


def main():
    log("=== import {} ===".format(ASSET_ID))
    log("source=" + SRC_DIR)
    log("destination=" + DEST_ROOT)

    unreal.EditorAssetLibrary.make_directory(DEST_ROOT)
    mesh_path = import_fbx(os.path.join(SRC_DIR, "FBX", "{}_LOD0.fbx".format(ASSET_ID)), DEST_ROOT, MESH_NAME)
    if not mesh_path:
        warn("LOD0 import failed, stopping")
        return

    log("LOD0 mesh=" + mesh_path)
    report_mesh(mesh_path)
    attach_lods(mesh_path)

    for relative_path, name, srgb, compression in TEXTURES:
        import_texture(relative_path, name, srgb, compression)

    log("=== done ===")


main()
