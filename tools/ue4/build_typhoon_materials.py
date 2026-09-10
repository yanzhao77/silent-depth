"""Build the shared submarine master materials and the Typhoon material instances.

Master materials (shared by every submarine asset):
  /Game/SilentDepth/Art/Materials/M_SD_Submarine_PBR   textured hulls (BaseColor + ORM + Normal)
  /Game/SilentDepth/Art/Materials/M_SD_Submarine_Flat  untextured parts (BaseColor + Roughness + Metallic)

Values come from ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md, table "材质槽".
ORM packing is R = cavity AO, G = roughness, B = metallic; normal strength is 0.45.

Run with:
  UE4Editor-Cmd.exe <project>.uproject -run=pythonscript -script=<this file> \
    -unattended -nopause -nosplash -stdout

Output goes to LogPython in Saved/Logs/SilentDepthUE.log, not to stdout.
Idempotent: existing masters and instances are deleted and rebuilt.
"""

import re

import unreal

ASSET_ID = "RU_SSBN_Typhoon"
ASSET_DIR = "/Game/SilentDepth/Art/Submarines/SSBN/Russia/Typhoon"
MESH_PATH = ASSET_DIR + "/SM_" + ASSET_ID
TEXTURE_DIR = ASSET_DIR + "/Textures"
MASTER_DIR = "/Game/SilentDepth/Art/Materials"
MI_DIR = ASSET_DIR + "/Materials"

PBR_MASTER = "M_SD_Submarine_PBR"
FLAT_MASTER = "M_SD_Submarine_Flat"

NORMAL_STRENGTH = 0.45

# key -> (display name, spec). Keys are matched as substrings of the mesh slot
# name after stripping non-alphanumerics, longest key first.
SLOTS = {
    "paintedsteel": (
        "PaintedSteel",
        {"kind": "flat", "color": (0.025, 0.033, 0.037), "roughness": 0.68, "metallic": 0.10},
    ),
    "opticalglass": (
        "OpticalGlass",
        {"kind": "flat", "color": (0.004, 0.012, 0.016), "roughness": 0.19, "metallic": 0.12},
    ),
    "propeller": (
        "Propeller",
        {"kind": "flat", "color": (0.25, 0.18, 0.075), "roughness": 0.43, "metallic": 0.84},
    ),
    "markings": (
        "Markings",
        {"kind": "flat", "color": (0.54, 0.58, 0.56), "roughness": 0.75, "metallic": 0.00},
    ),
    "rubber": (
        "Rubber",
        {"kind": "pbr", "basecolor": "T_Typhoon_Rubber_BaseColor",
         "orm": "T_Typhoon_Rubber_ORM", "normal": "T_Typhoon_Rubber_NormalDX"},
    ),
    "recess": (
        "Recess",
        {"kind": "flat", "color": (0.004, 0.006, 0.007), "roughness": 0.83, "metallic": 0.00},
    ),
    "steel": (
        "Steel",
        {"kind": "flat", "color": (0.19, 0.23, 0.25), "roughness": 0.40, "metallic": 0.82},
    ),
    "hull": (
        "Hull",
        {"kind": "pbr", "basecolor": "T_Typhoon_Hull_BaseColor",
         "orm": "T_Typhoon_Hull_ORM", "normal": "T_Typhoon_Hull_NormalDX"},
    ),
}

MATCH_ORDER = sorted(SLOTS.keys(), key=len, reverse=True)


def log(message):
    unreal.log("[mat] " + str(message))


def warn(message):
    unreal.log_warning("[mat] " + str(message))


def asset_tools():
    return unreal.AssetToolsHelpers.get_asset_tools()


def rebuild_asset(path, name, package_path, asset_class, factory):
    """Delete an existing asset and create a fresh one so re-runs stay clean."""
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    created = asset_tools().create_asset(name, package_path, asset_class, factory)
    if created is None:
        warn("create_asset failed for " + path)
    return created


def expression(material, expression_class, x, y):
    return unreal.MaterialEditingLibrary.create_material_expression(
        material, expression_class, x, y
    )


def add_scalar(material, name, value, x, y):
    node = expression(material, unreal.MaterialExpressionScalarParameter, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("default_value", value)
    return node


def add_vector(material, name, color, x, y):
    node = expression(material, unreal.MaterialExpressionVectorParameter, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("default_value", unreal.LinearColor(color[0], color[1], color[2], 1.0))
    return node


def add_texture(material, name, texture_path, sampler_type, x, y):
    node = expression(material, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("sampler_type", sampler_type)
    if texture_path:
        texture = unreal.EditorAssetLibrary.load_asset(texture_path)
        if texture is None:
            warn("texture not found: " + texture_path)
        else:
            node.set_editor_property("texture", texture)
    return node


def build_pbr_master():
    material = rebuild_asset(
        "{}/{}".format(MASTER_DIR, PBR_MASTER),
        PBR_MASTER,
        MASTER_DIR,
        unreal.Material,
        unreal.MaterialFactoryNew(),
    )
    if material is None:
        return None

    # Master parameters deliberately carry no default texture; each material
    # instance supplies its own.
    base_color = add_texture(
        material, "BaseColorTexture", None, unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -900, -300
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        base_color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )

    orm = add_texture(
        material, "ORMTexture", None, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, -900, 0
    )
    for channel, prop in (
        ("R", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION),
        ("G", unreal.MaterialProperty.MP_ROUGHNESS),
        ("B", unreal.MaterialProperty.MP_METALLIC),
    ):
        unreal.MaterialEditingLibrary.connect_material_property(orm, channel, prop)

    normal = add_texture(
        material, "NormalTexture", None, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, -900, 300
    )
    strength = add_scalar(material, "NormalStrength", NORMAL_STRENGTH, -900, 620)
    _connect_normal(material, normal, strength)

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    log("built master " + material.get_path_name())
    return material


def _connect_normal(material, normal, strength):
    """Scale the decoded normal XY by NormalStrength, then renormalise Z.

    Chain: sample.RG -> ComponentMask(RG) -> Multiply(NormalStrength)
           -> AppendVector(B = 1) -> Normalize -> MP_NORMAL.
    Falls back to wiring the sample straight through if any node is unavailable.
    """
    try:
        mask = expression(material, unreal.MaterialExpressionComponentMask, -650, 300)
        mask.set_editor_property("r", True)
        mask.set_editor_property("g", True)
        mask.set_editor_property("b", False)
        mask.set_editor_property("a", False)
        unreal.MaterialEditingLibrary.connect_material_expressions(normal, "RGB", mask, "")

        multiply = expression(material, unreal.MaterialExpressionMultiply, -480, 300)
        unreal.MaterialEditingLibrary.connect_material_expressions(mask, "", multiply, "A")
        unreal.MaterialEditingLibrary.connect_material_expressions(strength, "", multiply, "B")

        one = expression(material, unreal.MaterialExpressionConstant, -480, 460)
        one.set_editor_property("r", 1.0)

        append = expression(material, unreal.MaterialExpressionAppendVector, -300, 340)
        unreal.MaterialEditingLibrary.connect_material_expressions(multiply, "", append, "A")
        unreal.MaterialEditingLibrary.connect_material_expressions(one, "", append, "B")

        normalize = expression(material, unreal.MaterialExpressionNormalize, -140, 340)
        unreal.MaterialEditingLibrary.connect_material_expressions(append, "", normalize, "VectorInput")
        unreal.MaterialEditingLibrary.connect_material_property(
            normalize, "", unreal.MaterialProperty.MP_NORMAL
        )
        log("normal chain: sample.RG * NormalStrength -> append(Z=1) -> normalize")
    except Exception as exc:  # noqa: BLE001 - fall back rather than fail the build
        warn("normal strength chain failed ({}), wiring normal straight through".format(exc))
        unreal.MaterialEditingLibrary.connect_material_property(
            normal, "RGB", unreal.MaterialProperty.MP_NORMAL
        )


def build_flat_master():
    material = rebuild_asset(
        "{}/{}".format(MASTER_DIR, FLAT_MASTER),
        FLAT_MASTER,
        MASTER_DIR,
        unreal.Material,
        unreal.MaterialFactoryNew(),
    )
    if material is None:
        return None

    base_color = add_vector(material, "BaseColor", (0.02, 0.02, 0.02), -600, -200)
    roughness = add_scalar(material, "Roughness", 0.5, -600, 0)
    metallic = add_scalar(material, "Metallic", 0.0, -600, 160)

    unreal.MaterialEditingLibrary.connect_material_property(
        base_color, "", unreal.MaterialProperty.MP_BASE_COLOR
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness, "", unreal.MaterialProperty.MP_ROUGHNESS
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        metallic, "", unreal.MaterialProperty.MP_METALLIC
    )

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    log("built master " + material.get_path_name())
    return material


def build_instance(name, master):
    path = "{}/{}".format(MI_DIR, name)
    instance = rebuild_asset(
        path, name, MI_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew()
    )
    if instance is None:
        return None
    try:
        unreal.MaterialEditingLibrary.set_material_instance_parent(instance, master)
    except Exception as exc:  # noqa: BLE001
        warn("set_material_instance_parent unavailable ({}), setting property directly".format(exc))
        instance.set_editor_property("parent", master)
    return instance


def build_pbr_instance(display_name, spec, master):
    instance = build_instance("MI_{}_{}".format(ASSET_ID, display_name), master)
    if instance is None:
        return None
    for parameter, key in (
        ("BaseColorTexture", "basecolor"),
        ("ORMTexture", "orm"),
        ("NormalTexture", "normal"),
    ):
        texture = unreal.EditorAssetLibrary.load_asset("{}/{}".format(TEXTURE_DIR, spec[key]))
        if texture is None:
            warn("missing texture for {}: {}".format(display_name, spec[key]))
            continue
        unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
            instance, parameter, texture
        )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance, "NormalStrength", NORMAL_STRENGTH
    )
    unreal.EditorAssetLibrary.save_loaded_asset(instance)
    log("built instance MI_{}_{} (pbr)".format(ASSET_ID, display_name))
    return instance


def build_flat_instance(display_name, spec, master):
    instance = build_instance("MI_{}_{}".format(ASSET_ID, display_name), master)
    if instance is None:
        return None
    color = spec["color"]
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        instance, "BaseColor", unreal.LinearColor(color[0], color[1], color[2], 1.0)
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance, "Roughness", spec["roughness"]
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance, "Metallic", spec["metallic"]
    )
    unreal.EditorAssetLibrary.save_loaded_asset(instance)
    log("built instance MI_{}_{} (flat roughness={} metallic={})".format(
        ASSET_ID, display_name, spec["roughness"], spec["metallic"]))
    return instance


def match_slot(slot_name):
    normalized = re.sub(r"[^a-z0-9]", "", slot_name.lower())
    for key in MATCH_ORDER:
        if key in normalized:
            return key
    return None


def assign_slots(instances_by_key):
    mesh = unreal.EditorAssetLibrary.load_asset(MESH_PATH)
    if mesh is None:
        warn("mesh not found: " + MESH_PATH)
        return

    materials = list(mesh.get_editor_property("static_materials"))
    assigned = 0
    for index, static_material in enumerate(materials):
        slot_name = str(static_material.get_editor_property("material_slot_name"))
        key = match_slot(slot_name)
        if key is None:
            warn("slot {} '{}' matched no spec, left unassigned".format(index, slot_name))
            continue
        instance = instances_by_key.get(key)
        if instance is None:
            warn("slot {} '{}' has no instance".format(index, slot_name))
            continue
        static_material.set_editor_property("material_interface", instance)
        assigned += 1
        log("slot {} '{}' -> {}".format(index, slot_name, instance.get_name()))

    mesh.set_editor_property("static_materials", materials)
    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    log("assigned {}/{} slots".format(assigned, len(materials)))


def main():
    log("=== build materials for {} ===".format(ASSET_ID))
    unreal.EditorAssetLibrary.make_directory(MASTER_DIR)
    unreal.EditorAssetLibrary.make_directory(MI_DIR)

    pbr_master = build_pbr_master()
    flat_master = build_flat_master()
    if pbr_master is None or flat_master is None:
        warn("master material creation failed, stopping")
        return

    instances_by_key = {}
    for key, (display_name, spec) in sorted(SLOTS.items()):
        if spec["kind"] == "pbr":
            instance = build_pbr_instance(display_name, spec, pbr_master)
        else:
            instance = build_flat_instance(display_name, spec, flat_master)
        if instance is not None:
            instances_by_key[key] = instance

    assign_slots(instances_by_key)
    verify(instances_by_key)
    log("=== done, {} instances ===".format(len(instances_by_key)))


def verify(instances_by_key):
    """Read the assignment and parameters back so a run proves its own result."""
    mesh = unreal.EditorAssetLibrary.load_asset(MESH_PATH)
    if mesh is None:
        warn("verify: mesh not found")
        return

    for index, static_material in enumerate(mesh.get_editor_property("static_materials")):
        interface = static_material.get_editor_property("material_interface")
        log("verify slot {} '{}' -> {}".format(
            index,
            static_material.get_editor_property("material_slot_name"),
            interface.get_name() if interface else "NONE",
        ))

    for key, instance in sorted(instances_by_key.items()):
        log("verify instance {}".format(instance.get_name()))
        for parameter in ("BaseColorTexture", "ORMTexture", "NormalTexture"):
            try:
                value = unreal.MaterialEditingLibrary.get_material_instance_texture_parameter_value(
                    instance, parameter
                )
                log("    texture {} = {}".format(parameter, value.get_name() if value else "NONE"))
            except Exception as exc:  # noqa: BLE001
                warn("    texture {} readback failed: {}".format(parameter, exc))
        for parameter in ("NormalStrength", "Roughness", "Metallic"):
            try:
                value = unreal.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(
                    instance, parameter
                )
                if value != 0.0:
                    log("    scalar {} = {}".format(parameter, value))
            except Exception as exc:  # noqa: BLE001
                warn("    scalar {} readback failed: {}".format(parameter, exc))


main()
