"""Drawing-led rebuild. Only FBX/LOD utility functions are reused."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0,str(Path(__file__).parent))
import akula_drawing_geometry as geo
import build_akula_reference as io

ROOT=io.ROOT
ID=geo.ID


def material(name,color,rough=.65,metal=0):
    mat=bpy.data.materials.new("SUB_MAT_"+name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    node=mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value=(*color,1)
    node.inputs["Roughness"].default_value=rough
    node.inputs["Metallic"].default_value=metal
    return mat


def materials():
    mats={"hull":material("Drawing_Hull",(.045,.054,.063)),
          "bottom":material("Drawing_Antifouling",(.26,.071,.036),.8),
          "prop":material("Drawing_Bronze",(.34,.21,.075),.33,.75),
          "metal":material("Drawing_Metal",(.17,.20,.22),.4,.7),
          "dark":material("Drawing_Recess",(.008,.011,.014),.9),
          "panel":material("Drawing_Panel",(.029,.037,.044),.8)}
    rng=np.random.default_rng(971)
    for key in ("hull","bottom"):
        mat=mats[key]
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        bsdf=nodes.get("Principled BSDF")
        rgba=np.ones((512,1024,4),dtype=np.float32)
        color=np.array(mat.diffuse_color[:3])
        noise=rng.uniform(-.025,.025,(512,1024,1))
        linear=np.clip(color*(1+noise),0,1)
        rgba[:,:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
        image=bpy.data.images.new("T_Akula_Drawing_"+key,1024,512,alpha=True)
        image.colorspace_settings.name="Non-Color"
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw=str(ROOT/"Textures/BaseColor"/(image.name+".png"))
        image.file_format="PNG"
        image.save()
        texture=nodes.new("ShaderNodeTexImage")
        texture.image=bpy.data.images.load(image.filepath_raw,check_existing=False)
        texture.image.colorspace_settings.name="sRGB"
        links.new(texture.outputs["Color"],bsdf.inputs["Base Color"])
    return mats


def collision(c,m):
    result=[]
    xs=[geo.UPPER[0][0],-46,-35,-24,-8,12,32,44,51,55.099]
    clouds=[]
    for i in range(len(xs)-1):
        clouds.append([geo.surface(xs[i]+(xs[i+1]-xs[i])*k/4,j*2*math.pi/16) for k in range(5) for j in range(16)])
    clouds.append([v.co.copy() for v in bpy.data.objects["SUB_RU_Akula_Sail_AsymmetricDrawing04"].data.vertices])
    for i,points in enumerate(clouds):
        bm=bmesh.new()
        for p in points:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        interior=[v for v in bm.verts if not v.link_faces]
        if interior:
            bmesh.ops.delete(bm,geom=interior,context="VERTS")
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        data=bpy.data.meshes.new("Collision")
        bm.to_mesh(data)
        bm.free()
        obj=bpy.data.objects.new("UCX_"+ID+"_LOD0_%02d"%i,data)
        c["99_COLLISION"].objects.link(obj)
        obj.display_type="WIRE"
        result.append(obj)
    return result


def tree(obj):
    verts=[obj.matrix_world@v.co for v in obj.data.vertices]
    return BVHTree.FromPolygons(verts,[list(p.vertices) for p in obj.data.polygons])


def validate_geometry(parts):
    checks={}
    for name,obj in [("hull",parts["hull"]),("sail",parts["sail"]),("hub",parts["hub"])]+[("blade_%d"%i,b) for i,b in enumerate(parts["blades"])]:
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        checks[name+"_closed"]=all(e.is_manifold for e in bm.edges)
        checks[name+"_nondegenerate"]=all(f.calc_area()>1e-12 for f in bm.faces)
        bm.free()
    body=tree(parts["hull"])
    checks["sail_intersects_hull"]=bool(body.overlap(tree(parts["sail"])))
    checks["all_tail_roots_intersect_hull"]=all(bool(body.overlap(tree(o))) for o in parts["fins"])
    checks["pod_intersects_upper_rudder"]=bool(tree(parts["pod"]).overlap(tree(parts["fins"][2])))
    checks["seven_blades"]=len(parts["blades"])==7
    checks["all_blades_intersect_hub"]=all(bool(tree(parts["hub"]).overlap(tree(b))) for b in parts["blades"])
    checks["pitch_decreases_root_to_tip"]=all(0<b["pitch_tip_deg"]<b["pitch_root_deg"]<90 for b in parts["blades"])
    checks["all_masts_intersect_sail"]=all(bool(tree(parts["sail"]).overlap(tree(o))) for o in bpy.data.objects if o.name.startswith("SUB_RU_Akula_Mast_"))
    assert all(checks.values()),checks
    return checks


def previews(scene,c):
    for name in ("LOD0","LOD1","LOD2","LOD3","99_COLLISION"):
        for obj in c[name].objects:
            obj.hide_render=True
            obj.hide_viewport=True
    world=bpy.data.worlds.new("DrawingStudio")
    world.use_nodes=True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value=(.65,.69,.73,1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.7
    scene.world=world
    scene.render.engine="CYCLES"
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    scene.view_settings.exposure=.2
    studio=c["STUDIO_NOT_FOR_EXPORT"]
    for name,location,power,size in [("Key",(15,-35,45),65000,50),("Fill",(-30,30,20),40000,40),("Tail",(-70,-18,16),18000,18)]:
        data=bpy.data.lights.new(name,"AREA")
        data.energy=power
        data.shape="DISK"
        data.size=size
        obj=bpy.data.objects.new(name,data)
        obj.location=location
        io.look_at(obj,(-10,0,0))
        studio.objects.link(obj)
    views={"Profile":((0,-160,0),(0,0,0),122),
           "Deck":((0,0,160),(0,0,0),122),
           "Hero":((85,-115,52),(0,0,2),123),
           "Sail":((32,-45,26),(6,0,9),48),
           "Stern":((-77,-38,18),(-44,0,1),42),
           "Tail_QA":((-64,-11,6),(-52,0,0),12),
           "Rear":((-155,0,6),(-44,0,6),55)}
    scene.render.resolution_x=1800
    scene.render.resolution_y=1000
    scene.render.resolution_percentage=100
    for name,(loc,target,scale) in views.items():
        data=bpy.data.cameras.new("CAM_"+name)
        obj=bpy.data.objects.new("CAM_"+name,data)
        obj.location=loc
        data.type="ORTHO"
        data.ortho_scale=scale
        io.look_at(obj,target)
        studio.objects.link(obj)
        scene.camera=obj
        scene.render.filepath=str(ROOT/"Preview"/(name+".png"))
        bpy.ops.render.render(write_still=True)
    scene.camera=bpy.data.objects["CAM_Hero"]
    for obj in studio.objects:
        obj.hide_set(True)


def write_json(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")


def metadata(stats,checks):
    files=[p for folder in ("Blend","FBX","Collision","Source","Preview") for p in (ROOT/folder).glob("*") if p.is_file() and p.suffix in (".blend",".fbx",".py",".png")]
    files+=list((ROOT/"Textures/BaseColor").glob("T_Akula_Drawing_*.png"))
    hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    spec={"asset_id":ID,"status":"VALIDATING","source_builder":Path(__file__).name,
          "reference_priority":["04_russian_scheme.png","03_line_drawing.png","01_side_render.png"],
          "reference_notes":"第4张用于主轮廓，第3张用于结构核对，第1张用于涂装；第2张高度标注不一致，未用作尺寸约束。",
          "dimensions_m":{"length_overall":geo.LENGTH,"beam":geo.BEAM},"exports":stats,
          "provenance":"本地原创网格和程序化纹理；参考图由用户提供，未作为游戏纹理或待分发资产。",
          "license":"原创网格及纹理供本项目商业使用；参考图片著作权未核实，不包含在运行时资产中。",
          "limitations":["外观美术模型，并非工程复原或特定批次的精确测绘","桨叶曲面为视觉近似，不代表真实推进器设计","UE4.27实际导入未验证"],
          "sha256":hashes}
    write_json(ROOT/"Documentation"/(ID+"_SPEC.json"),spec)
    report={"asset_id":ID,"status":"VALIDATING","geometry_checks":checks,"exports":stats,
            "ue427_executed":False,"result":"PASS" if all(checks.values()) else "FAIL"}
    write_json(ROOT/"Validation"/(ID+"_VALIDATION.json"),report)
    (ROOT/"Documentation"/(ID+"_README.md")).write_text(
        "# RU_SSN_Akula\n\n状态：VALIDATING。\n\n"
        "本版放弃旧艇体、围壳、舵面及螺旋桨几何，以用户第4张侧视和俯视线稿重新取样建模。"
        "仅复用既有FBX导出和LOD整理工具，不调用旧版造型函数。\n\n"
        "运行入口：Source/build_akula_drawing.py。几何：Source/akula_drawing_geometry.py。"
        "Profile、Deck为正交视图；Tail_QA为推进器近景。参考图仅供本地审阅，不随游戏分发。\n\n"
        "UE4.27实际导入：NOT VERIFIED。几何连接为有交叠的独立零件，并非单一布尔焊接体。\n")
    path=io.ASSET_ROOT/"Manifest/submarine_manifest.json"
    manifest=json.loads(path.read_text())
    asset=next(a for a in manifest["assets"] if a["asset_id"]==ID)
    asset.update({"source":str(Path(__file__)),"status":"VALIDATING","sha256":hashes,
                  "materials":[m.name for m in bpy.data.materials if m.name.startswith("SUB_MAT_Drawing")],
                  "textures":[str(p) for p in (ROOT/"Textures/BaseColor").glob("T_Akula_Drawing_*.png")],
                  "previews":[str(p) for p in (ROOT/"Preview").glob("*.png")]})
    write_json(path,manifest)


def main():
    io.ensure_dirs()
    scene=io.reset_scene()
    scene.name="RU_SSN_Akula_DRAWING04"
    c=io.make_collections(scene)
    m=materials()
    parts=geo.build(c,m)
    bpy.context.view_layer.update()
    checks=validate_geometry(parts)
    colliders=collision(c,m)
    stats=io.build_exports(c,colliders)
    previews(scene,c)
    scene["asset_id"]=ID
    scene["status"]="VALIDATING"
    scene["build_basis"]="Drawing04 independent geometry"
    bpy.ops.file.pack_all()
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    parts["hull"].select_set(True)
    bpy.context.view_layer.objects.active=parts["hull"]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.region_3d.view_distance=135
                space.region_3d.view_location=(0,0,1)
                space.region_3d.view_rotation=bpy.data.objects["CAM_Hero"].rotation_euler.to_quaternion()
                space.clip_end=1000
                space.shading.type="MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"Blend"/(ID+"_MASTER.blend")))
    metadata(stats,checks)
    print(json.dumps({"checks":checks,"stats":stats},indent=2))


if __name__=="__main__":
    main()
