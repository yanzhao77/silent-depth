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

import unreal

REPO_ROOT = r"C:\workspace\ue4\silent-depth"
SOURCE_ROOT = os.path.join(REPO_ROOT, "SilentDepth_Assets")

MASTER_DIR = "/Game/SilentDepth/Art/Materials"
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


def build_pbr_master():
    """One master covers complete and partial texture sets.

    ORMWeight / NormalWeight fade between the packed maps and scalar fallbacks,
    so an asset without an ORM or normal map runs the master with the matching
    weight at 0 instead of sampling an unset texture parameter.
    """
    path = "{}/{}".format(MASTER_DIR, PBR_MASTER)
    material = ensure_asset(path, PBR_MASTER, MASTER_DIR, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
        return None

    base_color = add_texture_parameter(
        material, "BaseColorTexture", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -1100, -400
    )
    connect_property(base_color, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)

    orm = add_texture_parameter(
        material, "ORMTexture", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, -1100, -120
    )
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
    _connect_normal(material, normal)

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    log("built master " + path)
    return material


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
    material = ensure_asset(path, FLAT_MASTER, MASTER_DIR, unreal.Material, unreal.MaterialFactoryNew())
    if material is None:
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


def import_texture(asset, relative_path, name, srgb, compression):
    source = os.path.join(SOURCE_ROOT, asset["src"], relative_path.replace("/", os.sep))
    if not os.path.isfile(source):
        warn("missing source texture: " + source)
        return
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source)
    task.set_editor_property("destination_path", asset["dest"] + "/Textures")
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


def import_geometry(asset):
    src_dir = os.path.join(SOURCE_ROOT, asset["src"])
    mesh_path = import_fbx(
        os.path.join(src_dir, "FBX", "{}_LOD0.fbx".format(asset["id"])), asset["dest"], "SM_" + asset["id"]
    )
    if mesh_path is None:
        warn("LOD0 import failed for " + asset["id"])
        return None
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)

    for index in asset["lod_indices"]:
        fbx = os.path.join(src_dir, "FBX", "{}_LOD{}.fbx".format(asset["id"], index))
        if not os.path.isfile(fbx):
            warn("missing LOD{} source for {}".format(index, asset["id"]))
            continue
        try:
            result = unreal.EditorStaticMeshLibrary.import_lod(mesh, index, fbx)
            log("import_lod {} -> LOD{} (result={})".format(asset["id"], index, result))
        except Exception as exc:  # noqa: BLE001
            warn("import_lod failed for LOD{}: {}".format(index, exc))

    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    clean_sidecar_textures(src_dir)
    return mesh_path


def clean_sidecar_textures(src_dir):
    """Delete the <name>.fbm sidecar folders the FBX SDK writes next to exports.

    UE extracts embedded FBX textures to disk even when material and texture
    import are both off. Those folders land in the shared source asset library,
    which is version controlled, so they are removed after every import.
    """
    fbx_dir = os.path.join(src_dir, "FBX")
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


def report_mesh(asset, mesh_path):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    lib = unreal.EditorStaticMeshLibrary
    for label, call in (
        ("lod_count", lambda: lib.get_lod_count(mesh)),
        ("material_slots", lambda: lib.get_number_materials(mesh)),
        ("vertices_lod0", lambda: lib.get_number_verts(mesh, 0)),
        ("uv_channels_lod0", lambda: lib.get_num_uv_channels(mesh, 0)),
        ("convex_collision", lambda: lib.get_convex_collision_count(mesh)),
        ("simple_collision", lambda: lib.get_simple_collision_count(mesh)),
    ):
        try:
            log("{} {} = {}".format(asset["id"], label, call()))
        except Exception as exc:  # noqa: BLE001
            warn("{} {} failed: {}".format(asset["id"], label, exc))
    try:
        extent = mesh.get_bounds().box_extent
        log("{} bounds_cm=({:.1f}, {:.1f}, {:.1f}) length_cm={:.1f}".format(
            asset["id"], extent.x, extent.y, extent.z, extent.x * 2.0))
    except Exception as exc:  # noqa: BLE001
        warn("{} get_bounds failed: {}".format(asset["id"], exc))


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


def main():
    unreal.EditorAssetLibrary.make_directory(MASTER_DIR)
    masters = {"pbr": build_pbr_master(), "flat": build_flat_master()}
    if masters["pbr"] is None or masters["flat"] is None:
        warn("master material creation failed, stopping")
        return
    fallback = build_fallback_material(masters)
    for asset in ASSETS:
        process_asset(asset, masters, fallback)
    log("=== all assets processed ===")


main()
