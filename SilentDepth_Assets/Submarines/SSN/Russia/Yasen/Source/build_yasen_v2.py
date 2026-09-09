"""Reproducible clean rebuild; --gray stops after proportion evidence."""
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SOURCE=Path(__file__).resolve().parent
sys.path.insert(0,str(SOURCE))
import yasen_geometry as geo

ID='RU_SSN_Yasen'
ROOT=SOURCE.parent if SOURCE.name=='Source' else SOURCE/'asset'
GRAY='--gray' in sys.argv


def write(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


def material(name,color,rough=.72,metal=0):
    mat=bpy.data.materials.new('SUB_MAT_YasenV2_'+name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=rough
    bsdf.inputs['Metallic'].default_value=metal
    return mat


def make_materials():
    m={k:material(k,*args) for k,args in {
        'hull':((.024,.029,.032),.76,.04),
        'coating':((.024,.029,.032),.76,.04),
        'panel':((.019,.024,.027),.69,.07),
        'array':((.030,.035,.037),.82,0),
        'recess':((.005,.007,.008),.88,0),
        'metal':((.12,.14,.15),.40,.7),
        'bronze':((.34,.22,.092),.34,.78)}.items()}
    if GRAY:
        for mat in m.values():
            mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.24,.24,.24,1)
        return m
    w,h=2048,1024
    rng=np.random.default_rng(885)
    u=np.arange(w)[None,:]/w
    v=np.arange(h)[:,None]/h
    base=np.zeros((h,w,4),dtype=np.float32)
    base[:,:,:3]=(.024,.029,.032)
    # Fixed angular waterline keeps the material boundary smooth across sections.
    red=np.sin(v*math.tau)<-.46
    base[:,:,:3]=np.where(red[:,:,None],np.array((.13,.027,.019)),base[:,:,:3])
    tile=((np.arange(w)[None,:]+((np.arange(h)[:,None]//26)%2)*13)//26)
    variation=rng.uniform(.96,1.04,(h//26+2,w//26+2))
    tone=variation[np.arange(h)[:,None]//26,tile]
    base[:,:,:3]*=tone[:,:,None]
    base[:,:,3]=1
    im=bpy.data.images.new('T_YasenV2_Hull_BaseColor',w,h)
    base[:,:,:3]=np.where(base[:,:,:3]<=.0031308,base[:,:,:3]*12.92,1.055*base[:,:,:3]**(1/2.4)-.055)
    im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(base.ravel())
    im.filepath_raw=str(ROOT/'Textures'/f'{im.name}.png')
    im.file_format='PNG'
    im.save()
    im=bpy.data.images.load(im.filepath_raw,check_existing=False)
    im.colorspace_settings.name='sRGB'
    im.pack()
    tex=m['hull'].node_tree.nodes.new('ShaderNodeTexImage')
    tex.image=im
    m['hull'].node_tree.links.new(tex.outputs['Color'],m['hull'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return m


def stats(obj):
    obj.data.calc_loop_triangles()
    coords=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'name':obj.name,'triangles':len(obj.data.loop_triangles),
            'vertices':len(obj.data.vertices),'uv_channels':len(obj.data.uv_layers),
            'dimensions_m':[round(max(p[i] for p in coords)-min(p[i] for p in coords),5) for i in range(3)]}


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.hide_set(False)
        o.hide_viewport=False
        o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]


def unwrap(obj):
    select([obj])
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UV0')
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006)
        bpy.ops.object.mode_set(mode='OBJECT')


def topology(obj):
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    result={'boundary_edges':sum(e.is_boundary for e in bm.edges),
            'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
            'degenerate_faces':sum(f.calc_area()<1e-10 for f in bm.faces)}
    bm.free()
    return result


def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],
                               [list(p.vertices) for p in obj.data.polygons])


def geometry_checks(parts):
    checks={o.name:topology(o) for o in geo.PARTS}
    assert all(not any(r.values()) for r in checks.values()),checks
    body=tree(parts['hull'])
    contacts={'sail_hull':bool(body.overlap(tree(parts['sail']))),
              'tail_hull':all(body.overlap(tree(o)) for o in parts['tail']),
              'plane_hull':all(body.overlap(tree(o)) for o in parts['planes']),
              'shaft_hull':bool(body.overlap(tree(parts['shaft']))),
              'shaft_hub':bool(tree(parts['shaft']).overlap(tree(parts['hub']))),
              'blade_hub':all(tree(parts['hub']).overlap(tree(o)) for o in parts['blades'])}
    # Measure pitch from opposite chord vertices instead of trusting custom properties.
    pitches=[]
    for blade in parts['blades']:
        measured=[]
        for ring in (0,22):
            d=blade.data.vertices[ring*24].co-blade.data.vertices[ring*24+12].co
            measured.append(math.degrees(math.atan2(abs(d.x),math.hypot(d.y,d.z))))
        pitches.append(measured)
    contacts['geometric_pitch']=all(abs(p[0]-48)<.1 and abs(p[1]-21)<.1 for p in pitches)
    assert all(contacts.values()),contacts
    return {'topology':checks,'contacts':contacts,'measured_blade_pitch':pitches}


def collision(collection,materials):
    result=[]
    for idx,(a,b) in enumerate(zip((-57.2,-48,-38,-24,0,24,46,56),(-48,-38,-24,0,24,46,56,60))):
        bm=bmesh.new()
        for x in np.linspace(a,b,6):
            for j in range(20): bm.verts.new(geo.surface(float(x),math.tau*j/20))
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        data=bpy.data.meshes.new('UCX_Hull')
        bm.to_mesh(data)
        bm.free()
        o=bpy.data.objects.new(f'UCX_{ID}_LOD0_{idx:02d}',data)
        collection.objects.link(o)
        o.data.materials.append(materials['recess'])
        o.display_type='WIRE'
        result.append(o)
    bm=bmesh.new()
    for v in bpy.data.objects['SUB_Yasen_Sail'].data.vertices:
        bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    data=bpy.data.meshes.new('UCX_Sail')
    bm.to_mesh(data)
    bm.free()
    o=bpy.data.objects.new(f'UCX_{ID}_LOD0_08',data)
    collection.objects.link(o)
    o.data.materials.append(materials['recess'])
    result.append(o)
    assert all(not any(topology(o).values()) for o in result)
    return result


def export_fbx(path,objects):
    select(objects)
    bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},
        axis_forward='-Y',axis_up='Z',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',
        mesh_smooth_type='FACE',use_tspace=True,add_leaf_bones=False,bake_anim=False,path_mode='COPY',embed_textures=True)


def exports(collection,colliders):
    copies=[]
    for src in geo.PARTS:
        o=bpy.data.objects.new(src.name+'_export',src.data.copy())
        collection.objects.link(o)
        copies.append(o)
    select(copies)
    bpy.ops.object.join()
    base=bpy.context.object
    base.name=ID+'_LOD0'
    bm=bmesh.new()
    bm.from_mesh(base.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.to_mesh(base.data)
    bm.free()
    meshes=[base]
    for i,ratio in enumerate((.5,.22,.08),1):
        o=bpy.data.objects.new(ID+'_LOD'+str(i),base.data.copy())
        collection.objects.link(o)
        select([o])
        mod=o.modifiers.new('LOD_Decimate','DECIMATE')
        mod.ratio=ratio
        mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-6)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bm.to_mesh(o.data)
        bm.free()
        meshes.append(o)
    for i,o in enumerate(meshes):
        select([o])
        lightmap=o.data.uv_layers.new(name='UV1_Lightmap')
        o.data.uv_layers.active=lightmap
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.1,island_margin=.006)
        bpy.ops.object.mode_set(mode='OBJECT')
        o.data.uv_layers.active_index=0
        export_fbx(ROOT/'FBX'/f'{o.name}.fbx',[o]+(colliders if i==0 else []))
    export_fbx(ROOT/'Collision'/f'{ID}_COLLISION.fbx',colliders)
    select([base])
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'GLB'/f'{ID}.glb'),export_format='GLB',use_selection=True,export_yup=True)
    metrics=[stats(o) for o in meshes]
    assert metrics[0]['triangles']<100000
    for o in meshes+colliders:
        o.hide_render=True
        o.hide_viewport=True
    return metrics


def aim(o,target):
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()


def previews(scene,collection):
    scene.world=bpy.data.worlds.new('YasenStudio')
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value=(.62,.67,.71,1)
    bg.inputs['Strength'].default_value=.50
    for name,loc,power,size in [('Key',(28,-40,55),100000,50),('Fill',(-35,25,30),65000,40),('Rim',(-55,-12,28),38000,22)]:
        data=bpy.data.lights.new(name,'AREA')
        data.energy=power
        data.size=size
        o=bpy.data.objects.new(name,data)
        o.location=loc
        aim(o,(0,0,0))
        collection.objects.link(o)
    scene.render.engine='CYCLES'
    scene.cycles.samples=24 if GRAY else 40
    scene.cycles.use_denoising=True
    scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=1600
    scene.render.resolution_y=850
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    views={'Hero':((75,-125,60),(0,0,1),130),'Profile':((0,-160,0),(0,0,1),132),
           'Deck':((0,0,160),(0,0,0),132),'Stern':((-85,-24,15),(-48,0,0),32),
           'Propeller':((-74,-10,7),(-58,0,0),13),'Sail':((42,-30,24),(20,0,8),30),
           'Rear':((-160,0,0),(-46,0,0),34)}
    for name,(loc,target,scale) in views.items():
        if GRAY and name not in ('Hero','Profile','Deck'): continue
        data=bpy.data.cameras.new('CAM_'+name)
        o=bpy.data.objects.new('CAM_'+name,data)
        collection.objects.link(o)
        o.location=loc
        data.type='ORTHO'
        data.ortho_scale=scale
        aim(o,target)
        scene.camera=o
        scene.render.filepath=str(ROOT/'Preview'/f'{"Gray_" if GRAY else ""}{name}.png')
        bpy.ops.render.render(write_still=True)
    scene.camera=bpy.data.objects['CAM_Hero']


def main():
    for folder in ('Source','Blend','FBX','GLB','Collision','LOD','Textures','Preview','Validation','Documentation'):
        (ROOT/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC'
    collections={}
    for name in ('EDITABLE','EXPORTS','COLLISION','STUDIO'):
        c=bpy.data.collections.new(name)
        scene.collection.children.link(c)
        collections[name]=c
    mats=make_materials()
    parts=geo.build(collections['EDITABLE'],mats,not GRAY)
    bpy.context.view_layer.update()
    checks=geometry_checks(parts)
    metrics=[]
    if not GRAY:
        for o in geo.PARTS: unwrap(o)
        colliders=collision(collections['COLLISION'],mats)
        metrics=exports(collections['EXPORTS'],colliders)
    previews(scene,collections['STUDIO'])
    if GRAY:
        write(ROOT/'Validation/GRAYBOX.json',checks)
        return
    scene['asset_id']=ID
    scene['status']='VALIDATING'
    scene['reference_fidelity']='NOT VERIFIED: network references unavailable'
    select([parts['hull']])
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_distance=140
                area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
                area.spaces.active.clip_end=1000
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Blend'/f'{ID}_MASTER.blend'))
    write(ROOT/'Validation'/f'{ID}_VALIDATION.json',{'result':'PASS','geometry':checks,'exports':metrics,'ue427_executed':False,'reference_fidelity':'NOT VERIFIED'})
    print(json.dumps(metrics,indent=2))


if __name__=='__main__': main()
