"""Split a submarine's propeller out of its hull exports, for UE.

The asset library exports each submarine as a single static mesh with the
propeller welded into it, which means the blades cannot rotate. Running this
inside Blender produces a UE-side derivative:

  <AssetId>_LOD0..3.fbx   hull with the propeller faces removed
                          (LOD0 also carries the UCX collision hulls)
  <AssetId>_PROP.fbx      the propeller alone, origin moved onto the shaft axis
                          so a UE component can spin it about its local X

The propeller is identified by material, not by object name, so the same rule
works on every merged LOD. Verify the material really is propeller-only before
running this on a new asset.

Run:
  blender --background <MASTER.blend> --python tools/ue4/export_sub_split.py -- \
    --asset-id RU_SSN_Akula \
    --prop-material SUB_MAT_Drawing_Bronze \
    --part prop \
    --out-dir <project>/ArtSource/Derived/RU_SSN_Akula

--part is one of prop, lod0, lod1, lod2, lod3; run the script once per output.
Selection state does not survive in Blender's background mode, so each run
clones the source object, deletes everything else and exports the scene instead
of relying on use_selection.
"""

import argparse
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--prop-material", required=True)
    parser.add_argument("--part", required=True,
                        choices=["prop", "lod0", "lod1", "lod2", "lod3"])
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--lod-count", type=int, default=4)
    parser.add_argument("--collision-collection", default="99_COLLISION")
    return parser.parse_args(argv)


def world_bounds(obj):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for vertex in obj.data.vertices:
        position = obj.matrix_world @ vertex.co
        for axis in range(3):
            low[axis] = min(low[axis], position[axis])
            high[axis] = max(high[axis], position[axis])
    return low, high


def duplicate(obj, name):
    clone = obj.copy()
    clone.data = obj.data.copy()
    clone.name = name
    bpy.context.scene.collection.objects.link(clone)
    return clone


def strip_material(obj, material_name, keep):
    """Keep or delete every face assigned to material_name."""
    targets = {i for i, mat in enumerate(obj.data.materials) if mat and mat.name == material_name}
    if not targets:
        print("WARNING: {} has no material named {}".format(obj.name, material_name))
        return
    bmesh_data = bmesh.new()
    bmesh_data.from_mesh(obj.data)
    bmesh_data.faces.ensure_lookup_table()
    doomed = [face for face in bmesh_data.faces if (face.material_index in targets) != keep]
    if doomed:
        bmesh.ops.delete(bmesh_data, geom=doomed, context="FACES")
    bmesh_data.to_mesh(obj.data)
    bmesh_data.free()


def export_only(objects, path):
    """Delete everything except `objects`, then export the whole scene."""
    keep = set(objects)
    for obj in list(bpy.data.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    faces = sum(len(obj.data.polygons) for obj in objects)
    print("EXPORT {} objects, {} faces -> {}".format(len(objects), faces, Path(path).name))
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=False,
        object_types={"MESH"},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        axis_forward="-Y",
        axis_up="Z",
        use_space_transform=True,
        bake_space_transform=False,
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        use_tspace=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="STRIP",
        embed_textures=False,
    )
    print("WROTE " + str(path))


def find_shaft_axis(asset_id):
    """Centre of the propeller hub, which sits on the shaft axis."""
    hub = next(
        (o for o in bpy.data.objects if o.type == "MESH" and "PropellerHub" in o.name),
        None,
    )
    if hub is None:
        print("WARNING: no PropellerHub object; falling back to the hull centre")
        low, high = world_bounds(bpy.data.objects[asset_id + "_LOD0"])
        return Vector(((low.x + high.x) / 2, 0.0, 0.0))
    low, high = world_bounds(hub)
    return Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, (low.z + high.z) / 2))


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    lods = [bpy.data.objects["{}_LOD{}".format(args.asset_id, i)] for i in range(args.lod_count)]
    collision = list(bpy.data.collections.get(args.collision_collection).objects)
    shaft = find_shaft_axis(args.asset_id)
    print("SHAFT_AXIS {} {} {}".format(shaft.x, shaft.y, shaft.z))

    if args.part == "prop":
        propeller = duplicate(lods[0], args.asset_id + "_PROP")
        strip_material(propeller, args.prop_material, keep=True)
        propeller.data.transform(Matrix.Translation(-shaft) @ propeller.matrix_world)
        propeller.matrix_world = Matrix.Translation(shaft)
        export_only([propeller], out_dir / "{}_PROP.fbx".format(args.asset_id))
    else:
        index = int(args.part[3:])
        print("COLLISION_OBJECTS {}".format(len(collision)))
        hull = duplicate(lods[index], "{}_HULL_LOD{}".format(args.asset_id, index))
        strip_material(hull, args.prop_material, keep=False)
        export_objects = [hull]
        if index == 0:
            # UCX hulls ride along with LOD0, as in the library exports.
            export_objects += [duplicate(o, o.name) for o in collision]
        export_only(export_objects, out_dir / "{}_LOD{}.fbx".format(args.asset_id, index))

    print("SPLIT_DONE {}".format(args.part))


main()
