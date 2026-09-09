"""Run against the saved MASTER, then independently reimport each exported FBX."""
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0,str(Path(__file__).parent))
import build_akula_drawing as build
import build_akula_reference as io

ROOT=io.ROOT
ID=io.ASSET_ID


def contours():
    result={}
    for name in ("Hull_Drawing04","Sail_AsymmetricDrawing04","TowedArrayPod"):
        obj=bpy.data.objects["SUB_RU_Akula_"+name]
        sections={}
        for v in obj.data.vertices:
            x,y,z=obj.matrix_world@v.co
            sections.setdefault(round(x,5),[]).append((y,z))
        result[name]={"upper":[[x,max(p[1] for p in points)] for x,points in sorted(sections.items())],
                      "lower":[[x,min(p[1] for p in points)] for x,points in sorted(sections.items())],
                      "port":[[x,max(p[0] for p in points)] for x,points in sorted(sections.items())],
                      "starboard":[[x,min(p[0] for p in points)] for x,points in sorted(sections.items())]}
    build.write_json(ROOT/"Validation/DRAWING_CONTOURS.json",result)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/"Blend"/(ID+"_MASTER.blend")))
    contours()
    spec=json.loads((ROOT/"Documentation"/(ID+"_SPEC.json")).read_text())
    results=[]
    for expected in spec["exports"]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        path=ROOT/"FBX"/(expected["name"]+".fbx")
        bpy.ops.import_scene.fbx(filepath=str(path))
        meshes=[o for o in bpy.data.objects if o.type=="MESH" and not o.name.startswith("UCX_")]
        assert len(meshes)==1
        actual=io.object_stats(meshes[0])
        assert actual["triangles"]==expected["triangles"],(expected,actual)
        assert actual["uv_channels"]==2
        assert all(abs(a-b)<.01 for a,b in zip(sorted(actual["dimensions_m"]),sorted(expected["dimensions_m"])))
        colliders=[o for o in bpy.data.objects if o.name.startswith("UCX_")]
        assert all(o.name.startswith("UCX_"+ID+"_LOD0_") for o in colliders)
        results.append({"file":path.name,"triangles":actual["triangles"],"uv_channels":2,
                        "dimensions_m":actual["dimensions_m"],"collision_count":len(colliders),"result":"PASS"})
    build.write_json(ROOT/"Validation/FBX_ROUNDTRIP.json",{"result":"PASS","exports":results,"ue427_executed":False})
    sys.path.insert(0,str(io.ASSET_ROOT/"Tools"))
    from asset_validator import validate
    factory=validate(ROOT,ID)
    assert factory["result"]=="PASS"
    build.write_json(ROOT/"Validation"/(ID+"_FACTORY_VALIDATION.json"),factory)
    print(json.dumps(results,indent=2))


if __name__=="__main__":
    main()
