import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


def vec_params(mat):
    try:
        return [str(n) for n in unreal.MaterialEditingLibrary.get_vector_parameter_names(mat)]
    except Exception:
        return []


def scalar_params(mat):
    try:
        return [str(n) for n in unreal.MaterialEditingLibrary.get_scalar_parameter_names(mat)]
    except Exception:
        return []


MESH = "/Game/Meshes/SM_HeroSubmarine.SM_HeroSubmarine"
mesh = unreal.EditorAssetLibrary.load_asset(MESH)
if mesh is None:
    log("mesh not found")
    raise SystemExit("mesh missing")

nsec = mesh.get_num_sections(0)
log("mesh sections=%d" % nsec)

DARK_STEEL = unreal.LinearColor(0.012, 0.024, 0.040, 1.0)
DARK_WET = unreal.LinearColor(0.010, 0.022, 0.038, 1.0)
GLASS_DARK = unreal.LinearColor(0.005, 0.012, 0.020, 1.0)
RUBBER_DARK = unreal.LinearColor(0.008, 0.009, 0.010, 1.0)
BRONZE_DARK = unreal.LinearColor(0.020, 0.018, 0.014, 1.0)
DIRT_DARK = unreal.LinearColor(0.016, 0.016, 0.014, 1.0)

for i in range(nsec):
    mat = None
    try:
        mat = mesh.get_material(i)
    except Exception:
        try:
            mat = mesh.get_material(i, 0)
        except Exception:
            log("get_material(%d) error" % i)
    if mat is None:
        log("section %d: (null)" % i)
        continue
    name = mat.get_name()
    log("== section %d material=%s class=%s" % (i, name, mat.get_class().get_name()))
    vp = vec_params(mat)
    sp = scalar_params(mat)
    log("   vector params: %s" % vp)
    log("   scalar params: %s" % sp)

    low = name.lower()
    base = DARK_STEEL
    metal = 0.6
    rough = 0.30
    opacity = None
    if "glass" in low:
        base = GLASS_DARK
        metal = 0.9
        rough = 0.08
        opacity = 0.45
    elif "rubber" in low:
        base = RUBBER_DARK
        metal = 0.1
        rough = 0.65
    elif "bronze" in low:
        base = BRONZE_DARK
        metal = 0.85
        rough = 0.35
    elif "dirt" in low or "waterline" in low:
        base = DIRT_DARK
        metal = 0.2
        rough = 0.7
    elif "wet" in low:
        base = DARK_WET
        metal = 0.7
        rough = 0.22

    for vname in ("BaseColor", "base_color", "BaseColorFactor", "Base Color"):
        if vname in vp:
            unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
                mat, vname, base
            )
            log("   set %s -> dark cold" % vname)
            break
    for sname, val in (("Metallic", metal), ("Roughness", rough)):
        if sname in sp:
            unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
                mat, sname, val
            )
            log("   set %s=%s" % (sname, val))
    if opacity is not None:
        for oname in ("Opacity", "opacity"):
            if oname in sp:
                unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
                    mat, oname, opacity
                )
                log("   set %s=%s" % (oname, opacity))
                break

unreal.EditorAssetLibrary.save_asset(mesh.get_path_name())
log("UE_TUNE_MATERIALS_DONE")
