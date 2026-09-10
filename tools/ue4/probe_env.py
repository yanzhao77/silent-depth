"""Headless environment and API probe for the SilentDepth UE4.27 project.

Run with:
  UE4Editor-Cmd.exe <project>.uproject -run=pythonscript -script=<this file> -unattended -nopause -stdout

Output goes to LogPython in Saved/Logs/<Project>.log, not to stdout.
"""

import unreal


def dump_api(label, obj, names):
    missing = [n for n in names if not hasattr(obj, n)]
    present = [n for n in names if hasattr(obj, n)]
    unreal.log("[probe] {} present={}".format(label, present))
    if missing:
        unreal.log_warning("[probe] {} MISSING={}".format(label, missing))


def main():
    unreal.log("[probe] engine_version=" + str(unreal.SystemLibrary.get_engine_version()))
    unreal.log("[probe] project_dir=" + str(unreal.Paths.project_dir()))

    dump_api(
        "EditorStaticMeshLibrary",
        unreal.EditorStaticMeshLibrary,
        [
            "set_lod_from_static_mesh",
            "get_lod_count",
            "get_number_triangles",
            "get_number_vertices",
            "get_number_uv_channels",
            "get_number_materials",
            "set_lod_reduction_settings",
            "remove_lods",
            "set_convex_decomposition_collision",
            "has_simple_collision",
            "has_complex_collision",
        ],
    )

    dump_api(
        "EditorAssetLibrary",
        unreal.EditorAssetLibrary,
        ["does_asset_exist", "load_asset", "save_loaded_asset", "make_directory", "delete_asset"],
    )

    dump_api(
        "FbxImportUI",
        unreal.FbxImportUI,
        ["import_mesh", "import_as_skeletal", "import_materials", "import_textures", "mesh_type_to_import"],
    )

    unreal.log("[probe] FBXImportType=" + str([e for e in dir(unreal.FBXImportType) if not e.startswith("_")]))
    unreal.log("[probe] FBXNormalImportMethod=" + str([e for e in dir(unreal.FBXNormalImportMethod) if not e.startswith("_")]))
    unreal.log("[probe] TextureCompressionSettings=" + str([e for e in dir(unreal.TextureCompressionSettings) if not e.startswith("_")]))
    unreal.log("[probe] TextureGroup=" + str([e for e in dir(unreal.TextureGroup) if not e.startswith("_")]))

    ui = unreal.FbxImportUI()
    data = ui.static_mesh_import_data
    unreal.log("[probe] FbxStaticMeshImportData props=" + str(sorted([p for p in dir(data) if not p.startswith("_")])))

    for name in ("set_lod_from_static_mesh", "get_lod_count", "get_number_materials", "set_lod_reduction_settings"):
        func = getattr(unreal.EditorStaticMeshLibrary, name, None)
        doc = (getattr(func, "__doc__", "") or "").replace("\n", " | ")
        unreal.log("[probe] sig {}: {}".format(name, doc))

    unreal.log("[probe] PROBE_OK")


main()
