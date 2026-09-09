"""Independent validation for RU_SSN_Yasen Project 885 generated assets."""
import json
import sys
from pathlib import Path

import bpy


ASSET_ID = "RU_SSN_Yasen"
ASSET_ROOT = Path("/Users/sjw/Documents/BlenderProjects/SilentDepth_Assets")
ROOT = ASSET_ROOT / "Submarines" / "SSN" / "Russia" / "Yasen"


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def object_stats(obj):
    obj.data.calc_loop_triangles()
    coords = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    dims = [max(v[i] for v in coords) - min(v[i] for v in coords) for i in range(3)]
    return {
        "name": obj.name,
        "vertices": len(obj.data.vertices),
        "triangles": len(obj.data.loop_triangles),
        "uv_channels": len(obj.data.uv_layers),
        "materials": len(obj.data.materials),
        "dimensions_m": [round(v, 4) for v in dims],
    }


def main():
    master = ROOT / "Blend" / f"{ASSET_ID}_MASTER.blend"
    assert master.exists(), f"missing master blend: {master}"
    bpy.ops.wm.open_mainfile(filepath=str(master))
    assert bpy.context.scene.get("asset_id") == ASSET_ID
    spec = json.loads((ROOT / "Documentation" / f"{ASSET_ID}_SPEC.json").read_text())
    expected = {item["name"]: item for item in spec["exports"]}
    roundtrip = []
    for lod in ("LOD0", "LOD1", "LOD2", "LOD3"):
        fbx = ROOT / "FBX" / f"{ASSET_ID}_{lod}.fbx"
        assert fbx.exists(), f"missing FBX: {fbx}"
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(fbx))
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.name.startswith("UCX_")]
        assert len(meshes) == 1, f"{fbx.name}: expected one visual mesh, got {len(meshes)}"
        stats = object_stats(meshes[0])
        assert stats["uv_channels"] >= 2, f"{fbx.name}: missing UV channels"
        if lod in expected:
            assert stats["triangles"] == expected[lod]["triangles"], (stats, expected[lod])
            assert all(abs(a - b) < 0.02 for a, b in zip(sorted(stats["dimensions_m"]), sorted(expected[lod]["dimensions_m"]))), (stats, expected[lod])
        colliders = [obj for obj in bpy.data.objects if obj.name.startswith("UCX_")]
        if lod == "LOD0":
            assert colliders, "LOD0 export should include UCX collision helpers"
            assert all(obj.name.startswith(f"UCX_{ASSET_ID}_LOD0_") for obj in colliders)
        else:
            assert not colliders, f"{lod} should not duplicate collision helpers"
        roundtrip.append({"file": fbx.name, "stats": stats, "collision_count": len(colliders), "result": "PASS"})
    collision = ROOT / "Collision" / f"{ASSET_ID}_COLLISION.fbx"
    assert collision.exists(), f"missing collision FBX: {collision}"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(collision))
    colliders = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith("UCX_")]
    assert len(colliders) >= 8, f"expected at least 8 colliders, got {len(colliders)}"
    sys.path.insert(0, str(ASSET_ROOT / "Tools"))
    from asset_validator import validate
    factory = validate(ROOT, ASSET_ID)
    assert factory["result"] == "PASS", factory
    report = {"asset_id": ASSET_ID, "result": "PASS", "roundtrip": roundtrip, "collision_objects": len(colliders), "factory_validation": factory, "ue427_executed": False}
    write_json(ROOT / "Validation" / "FBX_ROUNDTRIP.json", report)
    write_json(ROOT / "Validation" / f"{ASSET_ID}_FACTORY_VALIDATION.json", factory)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
