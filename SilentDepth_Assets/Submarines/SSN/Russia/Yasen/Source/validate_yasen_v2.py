"""Fresh-process import comparisons; assertions are not optional branches."""
import json
import sys
from pathlib import Path
import bpy
import numpy as np

SOURCE=Path(__file__).resolve().parent
sys.path.insert(0,str(SOURCE))
import build_yasen_v2 as build
ROOT=build.ROOT
ID=build.ID


def compare(actual,expected):
    assert actual['triangles']==expected['triangles'],(actual,expected)
    assert actual['uv_channels']==2,actual
    assert all(abs(a-b)<.002 for a,b in zip(sorted(actual['dimensions_m']),sorted(expected['dimensions_m']))),(actual,expected)


def images_ok():
    results=[]
    for im in bpy.data.images:
        if im.name in ('Render Result','Viewer Node'): continue
        assert im.size[0]>0 and im.size[1]>0,im.name
        data=np.empty(len(im.pixels),dtype=np.float32)
        im.pixels.foreach_get(data)
        assert np.isfinite(data).all() and data[0::4].max()>.001,im.name
        results.append({'name':im.name,'size':list(im.size)})
    assert results,'texture did not survive import'
    return results


def main():
    spec=json.loads((ROOT/'Validation'/f'{ID}_VALIDATION.json').read_text())
    exports={item['name']:item for item in spec['exports']}
    reports=[]
    for lod in range(4):
        name=f'{ID}_LOD{lod}'
        expected=exports[name]
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(ROOT/'FBX'/f'{name}.fbx'),use_image_search=True)
        objects=[o for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('UCX_')]
        assert len(objects)==1
        actual=build.stats(objects[0])
        compare(actual,expected)
        textures=images_ok()
        collision=[o for o in bpy.data.objects if o.name.startswith('UCX_')]
        assert len(collision)==(9 if lod==0 else 0)
        assert all(not any(build.topology(o).values()) for o in collision)
        reports.append({'file':f'FBX/{name}.fbx','result':'PASS','actual':actual,'textures':textures})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'GLB'/f'{ID}.glb'))
    objects=[o for o in bpy.data.objects if o.type=='MESH']
    assert len(objects)==1
    actual=build.stats(objects[0])
    compare(actual,exports[ID+'_LOD0'])
    reports.append({'file':f'GLB/{ID}.glb','result':'PASS','actual':actual,'textures':images_ok()})
    # Export-validation negative control proves mismatching geometry is rejected.
    rejected=False
    try: compare({**actual,'triangles':actual['triangles']+1},exports[ID+'_LOD0'])
    except AssertionError: rejected=True
    assert rejected
    previews=[]
    for path in sorted((ROOT/'Preview').glob('*.png')):
        if path.name.startswith('Gray_'): continue
        im=bpy.data.images.load(str(path),check_existing=False)
        data=np.empty(len(im.pixels),dtype=np.float32)
        im.pixels.foreach_get(data)
        rgb=data.reshape(-1,4)[:,:3]
        variance=float(rgb.var(axis=0).mean())
        assert variance>.0002,(path,variance)
        previews.append({'file':path.name,'variance':variance})
    report={'result':'PASS','imports':reports,'negative_control_rejected':rejected,
            'preview_pixels':previews,'ue427_executed':False,'reference_fidelity':'NOT VERIFIED'}
    build.write(ROOT/'Validation/ROUNDTRIP_V2.json',report)
    print(json.dumps(report,indent=2))


if __name__=='__main__': main()
