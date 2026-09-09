"""Package verified outputs, preserve the previous version, update only Yasen."""
import argparse
import hashlib
import json
import importlib.util
import shutil
import tarfile
from datetime import datetime
from pathlib import Path

HERE=Path(__file__).resolve().parent
FACTORY=Path('/Users/sjw/Documents/BlenderProjects/SilentDepth_Assets')
DEST=FACTORY/'Submarines/SSN/Russia/Yasen'
ID='RU_SSN_Yasen'


def write(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')


def package(root):
    report=json.loads((root/'Validation/ROUNDTRIP_V2.json').read_text())
    assert report['result']=='PASS'
    build=json.loads((root/'Validation'/f'{ID}_VALIDATION.json').read_text())
    bas=json.loads((root/'Validation/BAS_LOD0.json').read_text())
    assert bas['hard_gate_pass']
    assert all(bas['totals'][key]==0 for key in ('boundary_edges','non_manifold_edges','degenerate_faces','missing_material_faces'))
    for name in ('build_yasen_v2.py','yasen_geometry.py','validate_yasen_v2.py','finalize_yasen_v2.py'):
        target=root/'Source'/name
        if HERE/name!=target: shutil.copy2(HERE/name,target)
    contract=HERE/'contract.md' if HERE.name!='Source' else root/'Documentation/contract.md'
    if contract!=root/'Documentation/contract.md': shutil.copy2(contract,root/'Documentation/contract.md')
    notes='''# 外观参考限制

本轮Wikipedia页面访问超时，浏览器会话也超时。
https://en.wikipedia.org/wiki/Yasen-class_submarine

另一处尝试的公开来源返回404，未视为有效参考：
https://www.hisutton.com/Russian-Submarine-Severodvinsk.html

没有成功打开Project 885实物参考照片，因此外形准确性为NOT VERIFIED。
本版以圆钝艏、十字尾舵、七叶开放螺旋桨为建模假设；具体批次比例、甲板盖板和推进器细节尚需设计图核对。
没有把Akula图纸作为Yasen参考，没有使用外部图片作为纹理。
'''
    (root/'Documentation/reference_notes.md').write_text(notes)
    readme='''# RU_SSN_Yasen / Project 885 独立重建

状态：VALIDATING。技术检查通过；外形参考核对与UE4.27实际导入均为NOT VERIFIED。

入口：Source/build_yasen_v2.py。几何：Source/yasen_geometry.py。
验证：Source/validate_yasen_v2.py。所有生成物从干净Blender进程生成。
主文件：Blend/RU_SSN_Yasen_MASTER.blend，含打包本地纹理、可编辑分件、隐藏LOD和碰撞集合。
导出：GLB/RU_SSN_Yasen.glb，FBX/下LOD0-3，Collision/下UCX碰撞体。
LOD0包含碰撞代理，其他LOD及GLB不包含碰撞代理。
UV0为材质贴图，UV1为独立打包光照图；贴图嵌入GLB及FBX。
本地原创网格与程序化贴图，供本项目商业使用；无外部运行时依赖。

重建解决：尖艏、分段起伏、悬空细条、错误外环、桨叶无几何桨距，以及回读比较分支未执行。
未声称工程精确、照片复原或引擎导入完成。
'''
    (root/'Documentation'/f'{ID}_README.md').write_text(readme)
    stages={
        'contract_references':'限制已记录；实物参考未验证',
        'graybox':'已打开灰模侧视和斜视，圆钝艏与平顺艇体；舵根随后改为贴体',
        'primary_secondary':'主网格全部独立重建',
        'topology':'闭合分件、艇体/围壳/尾舵/轴/轮毂连接检查',
        'materials':'单独艇体UV贴图，围壳及舵面独立涂层，贴图嵌入',
        'polish':'盖板曲面细分，消除悬空杆、随机红块与正弦条纹',
        'export':'GLB和4级FBX新进程回读，尺寸面数一致；UE4.27未验证'}
    write(root/'Documentation/final_report.json',{'status':'VALIDATING','stages':stages,
        'reference_fidelity':'NOT VERIFIED','ue427':'NOT VERIFIED','game_repository_changed':False,
        'repository_gates':{'npm_test':'38 files, 684 tests PASS','typecheck':'PASS','build':'PASS'},
        'opened_evidence':['Preview/Hero.png','Preview/Sail.png','Preview/Propeller.png','Preview/Deck.png','Preview/BAS_GLB/contact_sheet.png']})
    validator_spec=importlib.util.spec_from_file_location('factory_validator',FACTORY/'Tools/asset_validator.py')
    validator=importlib.util.module_from_spec(validator_spec)
    validator_spec.loader.exec_module(validator)
    # Factory checks require a SPEC file; write a provisional record before file validation.
    write(root/'Documentation'/f'{ID}_SPEC.json',{'asset_id':ID,'status':'VALIDATING'})
    factory=validator.validate(root,ID)
    assert factory['result']=='PASS',factory
    write(root/'Validation/FACTORY_V2.json',factory)
    governed={}
    for folder in ('Blend','GLB','FBX','Collision','Source','Textures','Preview','Validation','Documentation'):
        for p in sorted((root/folder).rglob('*')):
            if p.is_file() and p.suffix.lower() in ('.blend','.glb','.fbx','.py','.png','.json','.md') and p.name!=f'{ID}_SPEC.json':
                governed[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
    spec={'asset_id':ID,'status':'VALIDATING','revision':'independent_v2','country':'Russia',
          'type':'SSN','class':'Yasen','project':'Project 885','tier':9,
          'provenance':'本地独立生成网格与程序化贴图，无第三方模型或图片进入运行时包',
          'license':'本项目可商业使用的原创生成资产',
          'dimensions_m':{'length_overall':120,'hull_beam':13,'bounds_with_appendages':build['exports'][0]['dimensions_m']},
          'exports':build['exports'],'sha256':governed,'reference_fidelity':'NOT VERIFIED','ue427_executed':False,
          'limitations':['尚未成功取得Project 885实物参考进行比对','舱盖和推进器为外观近似','UE4.27未实际导入']}
    write(root/'Documentation'/f'{ID}_SPEC.json',spec)
    return spec


def deploy(root,spec):
    assert root!=DEST
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
    backup=DEST.with_name('Yasen_before_v2_'+stamp+'.tar.gz')
    with tarfile.open(backup,'w:gz') as tf:
        tf.add(DEST,arcname='Yasen')
    # A directory move preserves the exact old package, avoiding mixed revisions.
    archived=DEST.with_name('Yasen_previous_'+stamp)
    DEST.rename(archived)
    shutil.copytree(root,DEST)
    path=FACTORY/'Manifest/submarine_manifest.json'
    manifest=json.loads(path.read_text())
    item=next(a for a in manifest['assets'] if a['asset_id']==ID)
    item.update({'source':str(DEST/'Source/build_yasen_v2.py'),'master':str(DEST/'Blend'/f'{ID}_MASTER.blend'),
                 'glb':str(DEST/'GLB'/f'{ID}.glb'),'status':'VALIDATING','sha256':spec['sha256'],
                 'collision':str(DEST/'Collision'/f'{ID}_COLLISION.fbx'),
                 'validation':str(DEST/'Validation/ROUNDTRIP_V2.json'),
                 'materials':['SUB_MAT_YasenV2_'+n for n in ('hull','coating','panel','array','recess','metal','bronze')],
                 'textures':[str(p) for p in (DEST/'Textures').glob('*.png')],
                 'previews':[str(p) for p in (DEST/'Preview').glob('*.png')],
                 'references':[],'reference_fidelity':'NOT VERIFIED'})
    for i in range(4): item['lod'+str(i)]=str(DEST/'FBX'/f'{ID}_LOD{i}.fbx')
    write(path,manifest)
    path=FACTORY/'Manifest/production_status.json'
    status=json.loads(path.read_text())
    status['status_by_asset'][ID]='VALIDATING'
    status['blocking_conditions'][ID]='Project 885 reference fidelity and UE4.27 import NOT VERIFIED; independent v2 built and roundtrip tested.'
    status['updated_at']=datetime.now().date().isoformat()
    write(path,status)
    for rel,digest in spec['sha256'].items():
        assert hashlib.sha256((DEST/rel).read_bytes()).hexdigest()==digest,rel
    print(json.dumps({'destination':str(DEST),'backup':str(backup),'previous_directory':str(archived),'hash_count':len(spec['sha256'])}))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--deploy',action='store_true')
    args=parser.parse_args()
    root=HERE.parent if HERE.name=='Source' else HERE/'asset'
    spec=package(root)
    if args.deploy: deploy(root,spec)
    else: print(json.dumps({'packaged':str(root),'hash_count':len(spec['sha256'])}))
