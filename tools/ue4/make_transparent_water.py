import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


def build_water_material():
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialFactoryNew()
    if unreal.EditorAssetLibrary.does_asset_exist("/Game/Materials/M_SubmarineWater"):
        unreal.EditorAssetLibrary.delete_asset("/Game/Materials/M_SubmarineWater")
        log("deleted stale M_SubmarineWater")
    mat = asset_tools.create_asset(
        "M_SubmarineWater", "/Game/Materials", unreal.Material, factory
    )
    if mat is None:
        log("create water material failed")
        return None

    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)

    # BaseColor: cold ink-blue.
    bc = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionVectorParameter, -600, -300
    )
    bc.set_editor_property("parameter_name", "BaseColor")
    bc.set_editor_property("default_value", unreal.LinearColor(0.02, 0.07, 0.14, 1.0))
    unreal.MaterialEditingLibrary.connect_material_property(
        bc, "", unreal.MaterialProperty.MP_BASE_COLOR
    )

    # Metallic 0 (dielectric water).
    mt = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionScalarParameter, -600, -100
    )
    mt.set_editor_property("parameter_name", "Metallic")
    mt.set_editor_property("default_value", 0.0)
    unreal.MaterialEditingLibrary.connect_material_property(
        mt, "", unreal.MaterialProperty.MP_METALLIC
    )

    # Roughness low (smooth, slight specular).
    rg = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionScalarParameter, -600, 80
    )
    rg.set_editor_property("parameter_name", "Roughness")
    rg.set_editor_property("default_value", 0.05)
    unreal.MaterialEditingLibrary.connect_material_property(
        rg, "", unreal.MaterialProperty.MP_ROUGHNESS
    )

    # Opacity: translucent so the submerged sub shows through.
    op = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionConstant, -600, 260
    )
    op.set_editor_property("R", 0.5)
    unreal.MaterialEditingLibrary.connect_material_property(
        op, "", unreal.MaterialProperty.MP_OPACITY
    )

    unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
    log("built + saved M_SubmarineWater")
    return mat


water = build_water_material()
if water is None:
    raise SystemExit("no material")

MAPS = [
    "/Game/Maps/Ocean_Main",
    "/Game/Maps/Ocean_Cloudy",
    "/Game/Maps/Ocean_Storm",
    "/Game/Maps/Ocean_Night",
]
for path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        continue
    unreal.EditorLevelLibrary.load_level(path)
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        if a.get_class().get_name() != "WaterBodyOcean":
            continue
        # The water material lives on the WaterBodyOcean actor itself.
        try:
            a.set_editor_property("WaterMaterial", water)
            log("set WaterMaterial on %s" % path)
        except Exception as exc:
            log("water material set err on %s: %s" % (path, exc))
    unreal.EditorLevelLibrary.save_current_level()
    log("saved %s" % path)

log("UE_TRANSPARENT_WATER_DONE")
