import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


log("MaterialEditingLibrary funcs: %s" % sorted(
    [x for x in dir(unreal.MaterialEditingLibrary) if not x.startswith("_")
     and any(k in x.lower() for k in ("create", "connect", "material_property", "expression"))]
))
log("MaterialProperty members: %s" % [m for m in dir(unreal.MaterialProperty) if "MP_" in m])


def make_hull_material():
    existing = unreal.EditorAssetLibrary.load_asset(
        "/Game/Materials/M_SubmarineHull.M_SubmarineHull"
    )
    if existing is not None:
        log("loaded existing M_SubmarineHull")
        return existing

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialFactoryNew()
    mat = asset_tools.create_asset(
        "M_SubmarineHull", "/Game/Materials", unreal.Material, factory
    )
    if mat is None:
        log("create material failed")
        return None

    # BaseColor (VectorParameter)
    bc = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionVectorParameter, -500, -300
    )
    bc.set_editor_property("parameter_name", "BaseColor")
    bc.set_editor_property("default_value", unreal.LinearColor(0.012, 0.024, 0.040, 1.0))
    unreal.MaterialEditingLibrary.connect_material_property(
        bc, "", unreal.MaterialProperty.MP_BASE_COLOR
    )

    # Metallic
    mt = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionScalarParameter, -500, -120
    )
    mt.set_editor_property("parameter_name", "Metallic")
    mt.set_editor_property("default_value", 0.6)
    unreal.MaterialEditingLibrary.connect_material_property(
        mt, "", unreal.MaterialProperty.MP_METALLIC
    )

    # Roughness (low = wet highlight)
    rg = unreal.MaterialEditingLibrary.create_material_expression(
        mat, unreal.MaterialExpressionScalarParameter, -500, 60
    )
    rg.set_editor_property("parameter_name", "Roughness")
    rg.set_editor_property("default_value", 0.30)
    unreal.MaterialEditingLibrary.connect_material_property(
        rg, "", unreal.MaterialProperty.MP_ROUGHNESS
    )

    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
    log("built + saved M_SubmarineHull")
    return mat


mat = make_hull_material()

mesh = unreal.EditorAssetLibrary.load_asset("/Game/Meshes/SM_HeroSubmarine.SM_HeroSubmarine")
if mesh is not None and mat is not None:
    nsec = mesh.get_num_sections(0)
    for i in range(nsec):
        try:
            mesh.set_material(i, mat)
            log("set slot %d -> M_SubmarineHull" % i)
        except Exception as exc:
            log("set_material(%d) error: %s" % (i, exc))
    unreal.EditorAssetLibrary.save_asset(mesh.get_path_name())
    log("saved mesh with hull material")

log("UE_BUILD_SUB_MATERIAL_DONE")
