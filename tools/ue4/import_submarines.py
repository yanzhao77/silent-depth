"""Import every configured submarine asset into the UE4.27 project.

Single entry point for submarine asset import: geometry (LOD0 + LOD1-3),
textures, the shared master materials and per-slot material instances.

Import settings come from ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md:
  - Import Uniform Scale 1.0, Convert Scene/Unit on, lightmap UVs off
  - materials/textures off during FBX import (instances are built separately)
  - BaseColor sRGB on; ORM sRGB off + Masks; NormalDX sRGB off + Normalmap
  - ORM packing R = cavity AO, G = roughness, B = metallic; normal strength 0.45

Material values are taken from each asset's own Blender build script, not
invented here:
  Typhoon  - ue4/SilentDepthUE/docs/UE427_IMPORT_PLAN.md (no generator script shipped)
  Akula    - SilentDepth_Assets/Submarines/SSN/Russia/Akula/Source/build_akula_drawing.py
  Yasen    - SilentDepth_Assets/Submarines/SSN/Russia/Yasen/Source/build_yasen_v2.py
Blender Principled Base Color is linear, and so is a UE vector parameter, so the
values are copied across unchanged.

Every sub in the library exports its UCX collision hulls inside LOD0, so the
separate Collision/*.fbx files are redundant and are not imported.

Run with:
  UE4Editor-Cmd.exe <project>.uproject -run=pythonscript -script=<this file> \
    -unattended -nopause -nosplash -stdout

Output goes to LogPython in Saved/Logs/SilentDepthUE.log, not to stdout.

Assets are created when missing and reused afterwards; material instance
parameters, parents and mesh slot assignments are refreshed on every run.

To force a full rebuild, close the editor, move Content/SilentDepth/Art out of
the way and run again. Deleting assets from inside the same scripted session is
avoided on purpose: repeated delete+recreate left dangling pointers and crashed
UE with an access violation.
"""

import os
import re
import shutil
import struct
import tempfile
import zlib

import unreal

REPO_ROOT = r"C:\workspace\ue4\silent-depth"
SOURCE_ROOT = os.path.join(REPO_ROOT, "SilentDepth_Assets")

MASTER_DIR = "/Game/SilentDepth/Art/Materials"
DEFAULT_TEXTURE_DIR = MASTER_DIR + "/Defaults"
PBR_MASTER = "M_SD_Submarine_PBR"
FLAT_MASTER = "M_SD_Submarine_Flat"
FALLBACK_MI = "MI_SD_Fallback"

NORMAL_STRENGTH = 0.45

ASSETS = [
    {
        "id": "RU_SSBN_Typhoon",
        "src": "Submarines/SSBN/Russia/Typhoon_Project941",
        "dest": "/Game/SilentDepth/Art/Submarines/SSBN/Russia/Typhoon",
        "lod_indices": (1, 2, 3),
        "textures": [
            ("Textures/BaseColor/T_Typhoon_Hull_BaseColor.png", "T_Typhoon_Hull_BaseColor", True, "TC_DEFAULT"),
            ("Textures/BaseColor/T_Typhoon_Rubber_BaseColor.png", "T_Typhoon_Rubber_BaseColor", True, "TC_DEFAULT"),
            ("Textures/AO/T_Typhoon_Hull_ORM.png", "T_Typhoon_Hull_ORM", False, "TC_MASKS"),
            ("Textures/AO/T_Typhoon_Rubber_ORM.png", "T_Typhoon_Rubber_ORM", False, "TC_MASKS"),
            ("Textures/Normal/T_Typhoon_Hull_NormalDX.png", "T_Typhoon_Hull_NormalDX", False, "TC_NORMALMAP"),
            ("Textures/Normal/T_Typhoon_Rubber_NormalDX.png", "T_Typhoon_Rubber_NormalDX", False, "TC_NORMALMAP"),
        ],
        # docs/UE427_IMPORT_PLAN.md, table "材质槽"
        "slots": {
            "hull": ("Hull", dict(basecolor="T_Typhoon_Hull_BaseColor", orm="T_Typhoon_Hull_ORM",
                                  normal="T_Typhoon_Hull_NormalDX", roughness=0.50, metallic=0.10)),
            "rubber": ("Rubber", dict(basecolor="T_Typhoon_Rubber_BaseColor", orm="T_Typhoon_Rubber_ORM",
                                      normal="T_Typhoon_Rubber_NormalDX", roughness=0.90, metallic=0.00)),
            "paintedsteel": ("PaintedSteel", dict(color=(0.025, 0.033, 0.037), roughness=0.68, metallic=0.10)),
            "recess": ("Recess", dict(color=(0.004, 0.006, 0.007), roughness=0.83, metallic=0.00)),
            "steel": ("Steel", dict(color=(0.19, 0.23, 0.25), roughness=0.40, metallic=0.82)),
            "propeller": ("Propeller", dict(color=(0.25, 0.18, 0.075), roughness=0.43, metallic=0.84)),
            "markings": ("Markings", dict(color=(0.54, 0.58, 0.56), roughness=0.75, metallic=0.00)),
            "opticalglass": ("OpticalGlass", dict(color=(0.004, 0.012, 0.016), roughness=0.19, metallic=0.12)),
        },
    },
    {
        "id": "RU_SSN_Akula",
        "src": "Submarines/SSN/Russia/Akula",
        "dest": "/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula",
        "lod_indices": (1, 2, 3),
        # Moving parts are exported by the factory as their own FBX with the
        # origin on the hinge axis (hull LODs carry none of this geometry), so a
        # component can rotate each one. See the asset's
        # Source/build_akula_reference.py -> MOVABLE_PARTS.
        "parts": ("PROP", "RUDDER", "STERNPLANES", "BOWPLANES", "PERISCOPE"),
        # Only the two Drawing maps are used by the current Drawing-based model.
        # T_Akula_Hull_*/Rubber_*/Reference_* belong to the abandoned earlier revision.
        "textures": [
            ("Textures/BaseColor/T_Akula_Drawing_hull.png", "T_Akula_Drawing_hull", True, "TC_DEFAULT"),
            ("Textures/BaseColor/T_Akula_Drawing_bottom.png", "T_Akula_Drawing_bottom", True, "TC_DEFAULT"),
        ],
        # build_akula_drawing.py -> materials()
        "slots": {
            "hull": ("Hull", dict(basecolor="T_Akula_Drawing_hull", roughness=0.65, metallic=0.00)),
            "antifouling": ("Antifouling", dict(basecolor="T_Akula_Drawing_bottom", roughness=0.80, metallic=0.00)),
            "bronze": ("Bronze", dict(color=(0.34, 0.21, 0.075), roughness=0.33, metallic=0.75)),
            "metal": ("Metal", dict(color=(0.17, 0.20, 0.22), roughness=0.40, metallic=0.70)),
            "recess": ("Recess", dict(color=(0.008, 0.011, 0.014), roughness=0.90, metallic=0.00)),
            "panel": ("Panel", dict(color=(0.029, 0.037, 0.044), roughness=0.80, metallic=0.00)),
        },
    },
    {
        "id": "RU_SSN_Yasen",
        "src": "Submarines/SSN/Russia/Yasen",
        "dest": "/Game/SilentDepth/Art/Submarines/SSN/Russia/Yasen",
        "lod_indices": (1, 2, 3),
        # Reference gap: this asset ships no ORM and no normal map.
        "textures": [
            ("Textures/T_YasenV2_Hull_BaseColor.png", "T_YasenV2_Hull_BaseColor", True, "TC_DEFAULT"),
        ],
        # build_yasen_v2.py -> make_materials()
        "slots": {
            "hull": ("Hull", dict(basecolor="T_YasenV2_Hull_BaseColor", roughness=0.76, metallic=0.04)),
            "coating": ("Coating", dict(color=(0.024, 0.029, 0.032), roughness=0.76, metallic=0.04)),
            "panel": ("Panel", dict(color=(0.019, 0.024, 0.027), roughness=0.69, metallic=0.07)),
            "array": ("Array", dict(color=(0.030, 0.035, 0.037), roughness=0.82, metallic=0.00)),
            "recess": ("Recess", dict(color=(0.005, 0.007, 0.008), roughness=0.88, metallic=0.00)),
            "metal": ("Metal", dict(color=(0.12, 0.14, 0.15), roughness=0.40, metallic=0.70)),
            "bronze": ("Bronze", dict(color=(0.34, 0.22, 0.092), roughness=0.34, metallic=0.78)),
        },
    },
]

# --------------------------------------------------------------------------
# Batch A (DEC-003): Los Angeles, Virginia, Seawolf, Astute, Suffren.
#
# All five came out of the shared parametric pipeline
# (SilentDepth_Assets/Submarines/Tools/sd_hull_pipeline.py), so they share one
# material set and one texture naming rule, and each ships five movable part
# FBX with the same suffixes. The per-hull differences that matter for import
# are only the source folder and the destination path.
# --------------------------------------------------------------------------
BATCH_A_SLOTS = {
    "hull": ("Hull", dict(basecolor="{texture}", roughness=0.76, metallic=0.04)),
    "coating": ("Coating", dict(color=(0.026, 0.031, 0.035), roughness=0.76, metallic=0.04)),
    "panel": ("Panel", dict(color=(0.020, 0.025, 0.028), roughness=0.69, metallic=0.07)),
    "array": ("Array", dict(color=(0.032, 0.037, 0.039), roughness=0.82, metallic=0.00)),
    "recess": ("Recess", dict(color=(0.006, 0.008, 0.009), roughness=0.88, metallic=0.00)),
    "metal": ("Metal", dict(color=(0.12, 0.14, 0.15), roughness=0.40, metallic=0.70)),
    "bronze": ("Bronze", dict(color=(0.34, 0.22, 0.092), roughness=0.34, metallic=0.78)),
}

BATCH_A_PARTS = ("PROPULSOR_01", "RUDDER_01", "STERN_PLANES_01", "BOW_PLANES_01", "PERISCOPE_01")

BATCH_A_HULLS = (
    ("US_SSN_LosAngeles", "SSN/USA/Los_Angeles", "SSN/USA/Los_Angeles"),
    ("US_SSN_Virginia", "SSN/USA/Virginia", "SSN/USA/Virginia"),
    ("US_SSN_Seawolf", "SSN/USA/Seawolf", "SSN/USA/Seawolf"),
    ("UK_SSN_Astute", "SSN/UK/Astute", "SSN/UK/Astute"),
    ("FR_SSN_Suffren", "SSN/France/Suffren", "SSN/France/Suffren"),
)

for _asset_id, _src, _dest in BATCH_A_HULLS:
    _texture = "T_{}_Hull_BaseColor".format(_asset_id)
    ASSETS.append({
        "id": _asset_id,
        "src": "Submarines/" + _src,
        "dest": "/Game/SilentDepth/Art/Submarines/" + _dest,
        "lod_indices": (1, 2, 3),
        "parts": BATCH_A_PARTS,
        "textures": [
            ("Textures/{}.png".format(_texture), _texture, True, "TC_DEFAULT"),
        ],
        "slots": {
            key: (value[0], {**value[1],
                             **({"basecolor": _texture} if value[1].get("basecolor") == "{texture}" else {})})
            for key, value in BATCH_A_SLOTS.items()
        },
    })


def log(message):
    unreal.log("[sub] " + str(message))


def warn(message):
    unreal.log_warning("[sub] " + str(message))


def asset_tools():
    return unreal.AssetToolsHelpers.get_asset_tools()


def set_prop(target, name, value):
    try:
        target.set_editor_property(name, value)
        return True
    except Exception as exc:  # noqa: BLE001
        warn("could not set {}={}: {}".format(name, value, exc))
        return False


def ensure_asset(path, name, package_path, asset_class, factory):
    """Create the asset if missing, otherwise reuse it. Never deletes."""
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        existing = unreal.EditorAssetLibrary.load_asset(path)
        if existing is not None:
            return existing
    created = asset_tools().create_asset(name, package_path, asset_class, factory)
    if created is None:
        warn("create_asset failed for " + path)
    return created


def expression(material, expression_class, x, y):
    return unreal.MaterialEditingLibrary.create_material_expression(material, expression_class, x, y)


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


def add_texture_parameter(material, name, sampler_type, x, y):
    node = expression(material, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("sampler_type", sampler_type)
    return node


def add_constant(material, value, x, y):
    node = expression(material, unreal.MaterialExpressionConstant, x, y)
    node.set_editor_property("r", value)
    return node


def add_constant3(material, color, x, y):
    node = expression(material, unreal.MaterialExpressionConstant3Vector, x, y)
    node.set_editor_property("constant", unreal.LinearColor(color[0], color[1], color[2], 1.0))
    return node


def connect(source, output, target, input_name):
    unreal.MaterialEditingLibrary.connect_material_expressions(source, output, target, input_name)


def connect_property(source, output, prop):
    unreal.MaterialEditingLibrary.connect_material_property(source, output, prop)


def write_png(path, width, height, rows):
    """Write an 8-bit RGB PNG. rows is a list of height lists of (r, g, b)."""
    raw = b"".join(b"\x00" + bytes(v for pixel in row for v in pixel) for row in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", header)
                     + chunk(b"IDAT", zlib.compress(raw, 9))
                     + chunk(b"IEND", b""))


def ensure_default_textures():
    """Create the neutral maps the PBR master's texture parameters point at.

    A texture parameter left without a texture falls back to the engine's
    DefaultTexture, whose sampler type is Color. UE then refuses to compile a
    Normal or Masks sampler against it:

        Failed to compile Material ... Default Material will be used in game.
        Sampler type is Normal, should be Color for DefaultTexture

    and every material instance silently renders as the default grey material.
    These four-pixel maps keep the master valid; instances override them.
    """
    staging = os.path.join(tempfile.gettempdir(), "silent_depth_defaults")
    if not os.path.isdir(staging):
        os.makedirs(staging)

    specs = (
        ("T_SD_Default_BaseColor", (255, 255, 255), True, "TC_DEFAULT"),
        ("T_SD_Default_ORM", (255, 128, 0), False, "TC_MASKS"),
        ("T_SD_Default_Normal", (128, 128, 255), False, "TC_NORMALMAP"),
    )
    paths = {}
    for name, color, srgb, compression in specs:
        png = os.path.join(staging, name + ".png")
        write_png(png, 4, 4, [[color] * 4 for _ in range(4)])
        import_texture_file(png, DEFAULT_TEXTURE_DIR, name, srgb, compression)
        paths[name] = "{}/{}".format(DEFAULT_TEXTURE_DIR, name)
    log("default master textures ready: {}".format(sorted(paths)))
    return paths


def build_pbr_master(defaults):
    """One master covers complete and partial texture sets.

    ORMWeight / NormalWeight fade between the packed maps and scalar fallbacks,
    so an asset without an ORM or normal map runs the master with the matching
    weight at 0 instead of sampling an unset texture parameter.
    """
    path = "{}/{}".format(MASTER_DIR, PBR_MASTER)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        # The graph is authored once. Re-running would append a second copy of
        # every node, so an existing master is reused as-is. Move the asset out
        # of Content to force a rebuild.
        log("master already exists, graph left untouched: " + path)
        return unreal.EditorAssetLibrary.load_asset(path)
    material = asset_tools().create_asset(PBR_MASTER, MASTER_DIR, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        warn("create_asset failed for " + path)
        return None

    base_color = add_texture_parameter(
        material, "BaseColorTexture", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -1100, -400
    )
    set_node_texture(base_color, defaults["T_SD_Default_BaseColor"])
    connect_property(base_color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)

    orm = add_texture_parameter(
        material, "ORMTexture", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, -1100, -120
    )
    set_node_texture(orm, defaults["T_SD_Default_ORM"])
    orm_weight = add_scalar(material, "ORMWeight", 1.0, -1100, 140)
    roughness = add_scalar(material, "Roughness", 0.5, -1100, 260)
    metallic = add_scalar(material, "Metallic", 0.0, -1100, 380)
    ambient_occlusion = add_constant(material, 1.0, -1100, 500)

    for scalar, channel, prop, y in (
        (roughness, "G", unreal.MaterialProperty.MP_ROUGHNESS, 200),
        (metallic, "B", unreal.MaterialProperty.MP_METALLIC, 380),
        (ambient_occlusion, "", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION, 500),
    ):
        lerp = expression(material, unreal.MaterialExpressionLinearInterpolate, -700, y)
        connect(scalar, "", lerp, "A")
        connect(orm, channel, lerp, "B")
        connect(orm_weight, "", lerp, "Alpha")
        connect_property(lerp, "", prop)

    normal = add_texture_parameter(
        material, "NormalTexture", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, -1100, 680
    )
    set_node_texture(normal, defaults["T_SD_Default_Normal"])
    _connect_normal(material, normal)

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    log("built master " + path)
    return material


def set_node_texture(node, texture_path):
    """Bind a default texture to a texture parameter node and read it back.

    A Normal or Masks sampler left unbound falls back to the engine's
    DefaultTexture, whose sampler type is Color. UE then refuses to compile the
    material ("Default Material will be used in game") and every instance
    silently renders grey - only visible once the editor is opened. Reading the
    value back here makes that failure show up in the import log instead.
    """
    texture = unreal.EditorAssetLibrary.load_asset(texture_path)
    if texture is None:
        warn("missing default texture " + texture_path)
        return
    set_prop(node, "texture", texture)
    actual = node.get_editor_property("texture")
    if actual is None:
        warn("default texture did not stick on '{}'".format(node.get_editor_property("parameter_name")))
        return
    log("node '{}' -> {} ({})".format(
        node.get_editor_property("parameter_name"),
        actual.get_name(),
        actual.get_editor_property("compression_settings"),
    ))


def _connect_normal(material, normal):
    """normalize(lerp((0,0,1), sample.RG * NormalStrength + Z 1, NormalWeight))."""
    try:
        strength = add_scalar(material, "NormalStrength", NORMAL_STRENGTH, -1100, 800)
        weight = add_scalar(material, "NormalWeight", 1.0, -1100, 920)

        mask = expression(material, unreal.MaterialExpressionComponentMask, -900, 680)
        mask.set_editor_property("r", True)
        mask.set_editor_property("g", True)
        mask.set_editor_property("b", False)
        mask.set_editor_property("a", False)
        connect(normal, "RGB", mask, "")

        scaled = expression(material, unreal.MaterialExpressionMultiply, -740, 680)
        connect(mask, "", scaled, "A")
        connect(strength, "", scaled, "B")

        one = add_constant(material, 1.0, -740, 840)
        appended = expression(material, unreal.MaterialExpressionAppendVector, -560, 720)
        connect(scaled, "", appended, "A")
        connect(one, "", appended, "B")

        flat = add_constant3(material, (0.0, 0.0, 1.0), -560, 560)
        blended = expression(material, unreal.MaterialExpressionLinearInterpolate, -380, 640)
        connect(flat, "", blended, "A")
        connect(appended, "", blended, "B")
        connect(weight, "", blended, "Alpha")

        normalized = expression(material, unreal.MaterialExpressionNormalize, -200, 640)
        connect(blended, "", normalized, "VectorInput")
        connect_property(normalized, "", unreal.MaterialProperty.MP_NORMAL)
        log("normal chain wired (strength + weight)")
    except Exception as exc:  # noqa: BLE001 - fall back rather than fail the build
        warn("normal chain failed ({}), wiring the sample straight through".format(exc))
        connect_property(normal, "RGB", unreal.MaterialProperty.MP_NORMAL)


def build_flat_master():
    path = "{}/{}".format(MASTER_DIR, FLAT_MASTER)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        log("master already exists, graph left untouched: " + path)
        return unreal.EditorAssetLibrary.load_asset(path)
    material = asset_tools().create_asset(FLAT_MASTER, MASTER_DIR, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        warn("create_asset failed for " + path)
        return None

    base_color = add_vector(material, "BaseColor", (0.02, 0.02, 0.02), -600, -200)
    roughness = add_scalar(material, "Roughness", 0.5, -600, 0)
    metallic = add_scalar(material, "Metallic", 0.0, -600, 160)
    connect_property(base_color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    connect_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    connect_property(metallic, "", unreal.MaterialProperty.MP_METALLIC)

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    log("built master " + path)
    return material


def build_instance(path, name, master):
    instance = ensure_asset(
        path, name, os.path.dirname(path), unreal.MaterialInstanceConstant,
        unreal.MaterialInstanceConstantFactoryNew(),
    )
    if instance is None:
        return None
    try:
        unreal.MaterialEditingLibrary.set_material_instance_parent(instance, master)
    except Exception as exc:  # noqa: BLE001
        warn("set_material_instance_parent unavailable ({}); setting property directly".format(exc))
        instance.set_editor_property("parent", master)
    return instance


def build_slot_material(asset, display_name, spec, masters):
    texture_dir = asset["dest"] + "/Textures"
    name = "MI_{}_{}".format(asset["id"], display_name)
    path = "{}/Materials/{}".format(asset["dest"], name)

    if spec.get("basecolor"):
        instance = build_instance(path, name, masters["pbr"])
        if instance is None:
            return None
        for parameter, texture_name in (
            ("BaseColorTexture", spec.get("basecolor")),
            ("ORMTexture", spec.get("orm")),
            ("NormalTexture", spec.get("normal")),
        ):
            if not texture_name:
                continue
            texture = unreal.EditorAssetLibrary.load_asset("{}/{}".format(texture_dir, texture_name))
            if texture is None:
                warn("{}: missing texture {}".format(name, texture_name))
                continue
            unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
                instance, parameter, texture
            )
        for parameter, value in (
            ("ORMWeight", 1.0 if spec.get("orm") else 0.0),
            ("NormalWeight", 1.0 if spec.get("normal") else 0.0),
            ("NormalStrength", NORMAL_STRENGTH),
            ("Roughness", spec.get("roughness", 0.5)),
            ("Metallic", spec.get("metallic", 0.0)),
        ):
            unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
                instance, parameter, value
            )
        unreal.EditorAssetLibrary.save_loaded_asset(instance)
        log("instance {} (pbr basecolor={} orm={} normal={})".format(
            name, spec.get("basecolor"), bool(spec.get("orm")), bool(spec.get("normal"))))
        return instance

    instance = build_instance(path, name, masters["flat"])
    if instance is None:
        return None
    color = spec.get("color", (0.02, 0.02, 0.02))
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        instance, "BaseColor", unreal.LinearColor(color[0], color[1], color[2], 1.0)
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance, "Roughness", spec.get("roughness", 0.5)
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance, "Metallic", spec.get("metallic", 0.0)
    )
    unreal.EditorAssetLibrary.save_loaded_asset(instance)
    log("instance {} (flat r={} m={})".format(
        name, spec.get("roughness"), spec.get("metallic")))
    return instance


def build_fallback_material(masters):
    path = "{}/{}".format(MASTER_DIR, FALLBACK_MI)
    instance = build_instance(path, FALLBACK_MI, masters["flat"])
    if instance is None:
        return None
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        instance, "BaseColor", unreal.LinearColor(0.18, 0.18, 0.20, 1.0)
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(instance, "Roughness", 0.6)
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(instance, "Metallic", 0.0)
    unreal.EditorAssetLibrary.save_loaded_asset(instance)
    log("built fallback material " + path)
    return instance


def make_import_ui():
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
    task.set_editor_property("options", make_import_ui())
    asset_tools().import_asset_tasks([task])
    imported = list(task.get_editor_property("imported_object_paths"))
    if not imported:
        warn("import produced no asset: " + fbx_path)
        return None
    return imported[0]


def import_texture_file(source, destination_path, name, srgb, compression):
    """Import one image and apply the colour space and compression settings."""
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source)
    task.set_editor_property("destination_path", destination_path)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)
    asset_tools().import_asset_tasks([task])
    imported = list(task.get_editor_property("imported_object_paths"))
    if not imported:
        warn("texture import produced no asset: " + source)
        return
    texture = unreal.EditorAssetLibrary.load_asset(imported[0])
    set_prop(texture, "srgb", srgb)
    set_prop(texture, "compression_settings", getattr(unreal.TextureCompressionSettings, compression))
    set_prop(texture, "flip_green_channel", False)
    unreal.EditorAssetLibrary.save_loaded_asset(texture)


def import_texture(asset, relative_path, name, srgb, compression):
    source = os.path.join(SOURCE_ROOT, asset["src"], relative_path.replace("/", os.sep))
    if not os.path.isfile(source):
        warn("missing source texture: " + source)
        return
    import_texture_file(source, asset["dest"] + "/Textures", name, srgb, compression)


def fbx_directory(asset):
    """Where this asset's LOD exports live."""
    if asset.get("fbx_src"):
        return os.path.join(REPO_ROOT, asset["fbx_src"])
    return os.path.join(SOURCE_ROOT, asset["src"], "FBX")


def import_geometry(asset):
    src_dir = os.path.join(SOURCE_ROOT, asset["src"])
    fbx_dir = fbx_directory(asset)
    mesh_path = import_fbx(
        os.path.join(fbx_dir, "{}_LOD0.fbx".format(asset["id"])), asset["dest"], "SM_" + asset["id"]
    )
    if mesh_path is None:
        warn("LOD0 import failed for " + asset["id"])
        return None
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)

    for index in asset["lod_indices"]:
        fbx = os.path.join(fbx_dir, "{}_LOD{}.fbx".format(asset["id"], index))
        if not os.path.isfile(fbx):
            warn("missing LOD{} source for {}".format(index, asset["id"]))
            continue
        try:
            result = unreal.EditorStaticMeshLibrary.import_lod(mesh, index, fbx)
            log("import_lod {} -> LOD{} (result={})".format(asset["id"], index, result))
        except Exception as exc:  # noqa: BLE001
            warn("import_lod failed for LOD{}: {}".format(index, exc))

    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    clean_sidecar_textures(fbx_dir)
    return mesh_path


def clean_sidecar_textures(fbx_dir):
    """Delete the <name>.fbm sidecar folders the FBX SDK writes next to exports.

    UE extracts embedded FBX textures to disk even when material and texture
    import are both off. Those folders land in the shared source asset library,
    which is version controlled, so they are removed after every import.
    """
    if not os.path.isdir(fbx_dir):
        return
    for entry in os.listdir(fbx_dir):
        if entry.endswith(".fbm"):
            shutil.rmtree(os.path.join(fbx_dir, entry), ignore_errors=True)
            log("removed FBX sidecar folder {}".format(entry))


def discover_slots(asset, mesh_path):
    """Return [(slot_index, slot_name, spec_key_or_None)] using this asset's table."""
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    order = sorted(asset["slots"].keys(), key=len, reverse=True)
    discovered = []
    for index, static_material in enumerate(mesh.get_editor_property("static_materials")):
        slot_name = str(static_material.get_editor_property("material_slot_name"))
        normalized = re.sub(r"[^a-z0-9]", "", slot_name.lower())
        key = next((k for k in order if k in normalized), None)
        discovered.append((index, slot_name, key))
    log("{} discovered slots: {}".format(asset["id"], [s[1] for s in discovered]))
    return discovered


def assign_slots(asset, mesh_path, discovered, fallback):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    materials = list(mesh.get_editor_property("static_materials"))
    unmatched = []
    assigned = 0

    for index, slot_name, key in discovered:
        static_material = materials[index]
        if key is None:
            unmatched.append(slot_name)
            static_material.set_editor_property("material_interface", fallback)
            warn("{} slot {} '{}' matched no spec -> fallback material".format(
                asset["id"], index, slot_name))
            continue
        instance = unreal.EditorAssetLibrary.load_asset(
            "{}/Materials/MI_{}_{}".format(asset["dest"], asset["id"], asset["slots"][key][0])
        )
        if instance is None:
            warn("{} slot {} '{}' has no instance".format(asset["id"], index, slot_name))
            continue
        static_material.set_editor_property("material_interface", instance)
        assigned += 1
        log("{} slot {} '{}' -> {}".format(asset["id"], index, slot_name, instance.get_name()))

    mesh.set_editor_property("static_materials", materials)
    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    log("{} assigned {}/{} slots{}".format(
        asset["id"], assigned, len(materials),
        ", unmatched={}".format(unmatched) if unmatched else ""))


def import_parts(asset, masters, fallback):
    """Import the separately exported moving parts and wire up their materials.

    A part's material is not used by the hull any more, so any instances it
    needs are built here rather than being left over from the hull pass.
    """
    imported = {}
    for suffix in asset.get("parts", ()):
        source = os.path.join(fbx_directory(asset), "{}_{}.fbx".format(asset["id"], suffix))
        path = import_fbx(source, asset["dest"], "SM_{}_{}".format(asset["id"], suffix))
        if path is None:
            continue
        discovered = discover_slots(asset, path)
        for key in sorted({key for _i, _n, key in discovered if key}):
            display_name, spec = asset["slots"][key]
            build_slot_material(asset, display_name, spec, masters)
        assign_slots(asset, path, discovered, fallback)
        report_mesh(asset, path, label="{}_{}".format(asset["id"], suffix))
        imported[suffix] = path
    return imported


def report_mesh(asset, mesh_path, label=None):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    lib = unreal.EditorStaticMeshLibrary
    tag = label or asset["id"]
    for metric, call in (
        ("lod_count", lambda: lib.get_lod_count(mesh)),
        ("material_slots", lambda: lib.get_number_materials(mesh)),
        ("vertices_lod0", lambda: lib.get_number_verts(mesh, 0)),
        ("uv_channels_lod0", lambda: lib.get_num_uv_channels(mesh, 0)),
        ("convex_collision", lambda: lib.get_convex_collision_count(mesh)),
        ("simple_collision", lambda: lib.get_simple_collision_count(mesh)),
    ):
        try:
            log("{} {} = {}".format(tag, metric, call()))
        except Exception as exc:  # noqa: BLE001
            warn("{} {} failed: {}".format(tag, metric, exc))
    try:
        extent = mesh.get_bounds().box_extent
        log("{} bounds_cm=({:.1f}, {:.1f}, {:.1f}) length_cm={:.1f}".format(
            tag, extent.x, extent.y, extent.z, extent.x * 2.0))
    except Exception as exc:  # noqa: BLE001
        warn("{} get_bounds failed: {}".format(tag, exc))


def process_asset(asset, masters, fallback):
    log("=== {} ===".format(asset["id"]))
    unreal.EditorAssetLibrary.make_directory(asset["dest"] + "/Materials")

    mesh_path = import_geometry(asset)
    if mesh_path is None:
        return
    for relative_path, name, srgb, compression in asset["textures"]:
        import_texture(asset, relative_path, name, srgb, compression)

    discovered = discover_slots(asset, mesh_path)
    for key in sorted({key for _i, _n, key in discovered if key}):
        display_name, spec = asset["slots"][key]
        build_slot_material(asset, display_name, spec, masters)
    assign_slots(asset, mesh_path, discovered, fallback)
    report_mesh(asset, mesh_path)
    # Moving parts reuse the material instances built for the hull, so they are
    # imported after them.
    import_parts(asset, masters, fallback)


def main():
    unreal.EditorAssetLibrary.make_directory(MASTER_DIR)
    defaults = ensure_default_textures()
    masters = {"pbr": build_pbr_master(defaults), "flat": build_flat_master()}
    if masters["pbr"] is None or masters["flat"] is None:
        warn("master material creation failed, stopping")
        return
    fallback = build_fallback_material(masters)
    for asset in ASSETS:
        process_asset(asset, masters, fallback)
    log("=== all assets processed ===")


main()
