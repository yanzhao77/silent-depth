import unreal


def log(message):
    try:
        unreal.log(message)
    except Exception:
        print(message)


BRONZE_PATH = "/Game/Materials/M_PropellerBronze.M_PropellerBronze"
BRONZE_RGBA = unreal.LinearColor(0.43415, 0.21586, 0.02956, 1.0)


def ensure_bronze_material():
    material = unreal.EditorAssetLibrary.load_asset(BRONZE_PATH)
    if material is not None:
        log("loaded existing M_PropellerBronze")
        return material

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    material = asset_tools.create_asset(
        "M_PropellerBronze", "/Game/Materials", unreal.Material, unreal.MaterialFactoryNew()
    )
    if material is None:
        log("create M_PropellerBronze failed")
        return None

    base = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionVectorParameter, -500, -300
    )
    base.set_editor_property("parameter_name", "BaseColor")
    base.set_editor_property("default_value", BRONZE_RGBA)
    unreal.MaterialEditingLibrary.connect_material_property(
        base, "", unreal.MaterialProperty.MP_BASE_COLOR
    )

    metallic = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionScalarParameter, -500, -120
    )
    metallic.set_editor_property("parameter_name", "Metallic")
    metallic.set_editor_property("default_value", 0.86)
    unreal.MaterialEditingLibrary.connect_material_property(
        metallic, "", unreal.MaterialProperty.MP_METALLIC
    )

    roughness = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionScalarParameter, -500, 60
    )
    roughness.set_editor_property("parameter_name", "Roughness")
    roughness.set_editor_property("default_value", 0.29)
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness, "", unreal.MaterialProperty.MP_ROUGHNESS
    )

    material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    unreal.EditorAssetLibrary.save_asset(material.get_path_name())
    log("created and saved M_PropellerBronze")
    return material


mesh = unreal.EditorAssetLibrary.load_asset("/Game/Meshes/SM_Propeller.SM_Propeller")
bronze = ensure_bronze_material()
if mesh is None:
    log("SM_Propeller missing")
elif bronze is None:
    log("bronze material missing; left mesh slots untouched")
else:
    sections = mesh.get_num_sections(0)
    log("propeller sections=%d" % sections)
    for i in range(sections):
        try:
            mesh.set_material(i, bronze)
            log("set slot %d -> M_PropellerBronze" % i)
        except Exception as exc:
            log("set_material(%d) error: %s" % (i, exc))
    unreal.EditorAssetLibrary.save_asset(mesh.get_path_name())

# Remove duplicate auto-reimport assets and leftover importer-created material
# packages so only the project-owned M_PropellerBronze is authoritative.
try:
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    prefixes = (
        "/Game/SourceAssets/hero-submarine-propeller",
        "/Game/Meshes/Propeller",
        "/Game/Meshes/hero-submarine-propeller",
    )
    for prefix in prefixes:
        for asset in registry.get_assets_by_path(prefix, recursive=True):
            package = str(asset.package_name)
            name = str(asset.asset_name)
            if package == "/Game/Meshes/SM_Propeller":
                continue
            if "Material" in package or package.startswith(prefix):
                unreal.EditorAssetLibrary.delete_asset(package)
                log("deleted duplicate/auto asset %s" % package)
except Exception as exc:
    log("cleanup error: %s" % exc)

log("UE_FIX_PROPELLER_DONE")
