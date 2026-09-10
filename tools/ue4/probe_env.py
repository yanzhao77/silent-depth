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

    probe_materials()
    probe_material_api()
    probe_player_vessel()
    unreal.log("[probe] EditorStaticMeshLibrary all=" + str(sorted(
        n for n in dir(unreal.EditorStaticMeshLibrary) if not n.startswith("_"))))
    for name in (
        "import_lod",
        "add_simple_collisions",
        "bulk_set_convex_decomposition_collisions",
        "set_convex_decomposition_collisions",
        "get_convex_collision_count",
        "get_simple_collision_count",
        "get_collision_complexity",
        "remove_collisions",
    ):
        func = getattr(unreal.EditorStaticMeshLibrary, name, None)
        doc = (getattr(func, "__doc__", "") or "").replace("\n", " | ")
        unreal.log("[probe] sig {}: {}".format(name, doc))
    unreal.log("[probe] PROBE_OK")


def probe_materials():
    """Report which project materials can drive material instances."""
    paths = [
        "/Game/Materials/M_SubmarineHull",
        "/Game/Materials/M_PropellerBronze",
        "/Game/Materials/M_SubmarineWater",
        "/Game/Materials/MI_Ocean_SilentDepth",
    ]
    for path in paths:
        material = unreal.EditorAssetLibrary.load_asset(path)
        if material is None:
            unreal.log_warning("[probe] material not found: " + path)
            continue
        try:
            scalars = sorted(str(n) for n in unreal.MaterialEditingLibrary.get_scalar_parameter_names(material))
            vectors = sorted(str(n) for n in unreal.MaterialEditingLibrary.get_vector_parameter_names(material))
            textures = sorted(str(n) for n in unreal.MaterialEditingLibrary.get_texture_parameter_names(material))
            unreal.log("[probe] material {} scalars={} vectors={} textures={}".format(path, scalars, vectors, textures))
        except Exception as exc:  # noqa: BLE001
            unreal.log_warning("[probe] material introspection failed for {}: {}".format(path, exc))


def probe_material_api():
    """Report the material-graph API surface needed to author master materials."""
    needed_classes = [
        "MaterialExpressionVectorParameter",
        "MaterialExpressionScalarParameter",
        "MaterialExpressionTextureSampleParameter2D",
        "MaterialExpressionComponentMask",
        "MaterialExpressionMultiply",
        "MaterialExpressionConstant",
        "MaterialExpressionConstant2Vector",
        "MaterialExpressionConstant3Vector",
        "MaterialExpressionAppendVector",
        "MaterialExpressionNormalize",
        "MaterialExpressionTextureObjectParameter",
        "MaterialExpressionLinearInterpolate",
        "MaterialExpressionMultiply",
        "MaterialExpressionSubtract",
    ]
    missing = [c for c in needed_classes if not hasattr(unreal, c)]
    unreal.log("[probe] material expression classes present={}".format(
        [c for c in needed_classes if hasattr(unreal, c)]))
    if missing:
        unreal.log_warning("[probe] material expression classes MISSING={}".format(missing))

    for enum_name in ("MaterialProperty", "MaterialSamplerType", "MaterialShadingModel"):
        enum = getattr(unreal, enum_name, None)
        if enum is None:
            unreal.log_warning("[probe] enum missing: " + enum_name)
        else:
            unreal.log("[probe] {}={}".format(enum_name, sorted(e for e in dir(enum) if not e.startswith("_"))))

    lib = getattr(unreal, "MaterialEditingLibrary", None)
    if lib is None:
        unreal.log_warning("[probe] MaterialEditingLibrary missing")
        return
    dump_api(
        "MaterialEditingLibrary",
        lib,
        [
            "create_material_expression",
            "connect_material_property",
            "connect_material_expressions",
            "recompile_material",
            "layout_material_expressions",
            "set_material_instance_vector_parameter_value",
            "set_material_instance_scalar_parameter_value",
            "set_material_instance_texture_parameter_value",
        ],
    )


def probe_player_vessel():
    """Report where the player hull and propeller pivots sit.

    A static mesh import bakes the FBX object transform into the vertices by
    default, so a mesh can carry an offset that makes its pivot differ from its
    geometric centre. That matters when a component is placed by hand.
    """
    paths = (
        ("hull", "/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula"),
        ("prop", "/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula_PROP"),
    )
    for label, path in paths:
        if not unreal.EditorAssetLibrary.does_asset_exist(path):
            unreal.log_warning("[probe] {} mesh missing: {}".format(label, path))
            continue
        bounds = unreal.EditorAssetLibrary.load_asset(path).get_bounds()
        unreal.log("[probe] {} bounds origin={} extent={}".format(
            label, bounds.origin, bounds.box_extent))


main()
