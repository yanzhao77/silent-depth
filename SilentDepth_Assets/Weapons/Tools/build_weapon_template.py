#!/usr/bin/env python3
"""生成武器主模板（Templates/Weapon）。

在 Blender 内运行：
    blender --background --factory-startup --python build_weapon_template.py

模板包含：标准集合层级、共享材质库、占位参考件（不参与导出）与导出/校验契约文件。
它是生产契约，不是某个具体武器的模型；具体武器由 weapon_factory_blender.py 依据
weapon_dataset 的几何参数生成。
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sdw_common import TEMPLATE_DIR  # noqa: E402

TODAY = date.today().isoformat()
PREFIX = 'SilentDepth_Weapon'

ROOT_COLLECTIONS = [
    '00_ROOT',
    '01_BODY',
    '02_NOSE',
    '03_TAIL',
    '04_FINS',
    '05_WINGS',
    '06_PROPULSOR',
    '07_SEEKER',
    '08_MARKINGS',
    '09_SHELL',
    '10_DETAIL',
    '20_VARIANTS',
    '90_LOD/LOD0',
    '90_LOD/LOD1',
    '90_LOD/LOD2',
    '90_LOD/LOD3',
    '95_SOCKETS',
    '99_COLLISION',
    'STUDIO_NOT_FOR_EXPORT',
]

EXPORT_PRESET = {
    'engine': 'UE4.27',
    'fbx_binary_version': 7400,
    'axis_forward': '-Y',
    'axis_up': 'Z',
    'apply_unit_scale': True,
    'global_scale': 1.0,
    'embed_textures': False,
    'object_types': ['MESH'],
    'use_selection': True,
    'mesh_smooth_type': 'FACE',
    'use_tspace': True,
    'bake_anim': False,
    'path_mode': 'STRIP',
}

TEMPLATE_JSON = {
    'template_id': f'{PREFIX}_Asset_Template',
    'version': 'v1.0.0',
    'created_at': TODAY,
    'source_of_truth': 'Weapons/Tools/weapon_dataset.py',
    'generator': 'Weapons/Tools/weapon_factory_blender.py',
    'scope': '公开资料可见的武器外部外形与游戏数据；不含任何武器内部工程、装药、引信或制造信息。',
    'collection_policy': {
        'root': 'WPN_[WEAPON_ID]',
        'required_collections': ROOT_COLLECTIONS,
        'export_collections': [
            '90_LOD/LOD0', '90_LOD/LOD1', '90_LOD/LOD2', '90_LOD/LOD3', '99_COLLISION',
        ],
        'rule': '只有 90_LOD 与 99_COLLISION 集合参与 FBX 导出，其余集合仅用于编辑。',
    },
    'naming_policy': {
        'asset_id': '[COUNTRY]_[CATEGORY]_[FAMILY]',
        'object': 'WPN_[WEAPON_ID]_LOD[0-3]_[PART]',
        'collision': 'UCX_WPN_[WEAPON_ID]_SEG_##',
        'material': 'WPN_MAT_[NAME]',
        'forbidden_prefixes': ['Cube', 'Object', 'Cylinder', 'Cone', 'Sphere', 'Plane'],
    },
    'transform_rules': {
        'units': 'Metric meters',
        'unreal_conversion': '1 Blender meter = 100 Unreal Units',
        'axis': '弹头 +X，Y 左右，Z 上',
        'final_scale': [1, 1, 1],
        'final_rotation': [0, 0, 0],
        'apply_transform': True,
        'origin': '弹体纵向中心；需要挂点定位时使用 95_SOCKETS 下的空物体。',
    },
    'material_rules': {
        'shared_materials': [
            'WPN_MAT_Body', 'WPN_MAT_Nose', 'WPN_MAT_Fin', 'WPN_MAT_Metal',
            'WPN_MAT_Seeker', 'WPN_MAT_Marking', 'WPN_MAT_Shell',
        ],
        'texture_sets': [],
        'note': '武器使用共享程序化 PBR 材质，不引用外部贴图，保证运行时完全离线。',
    },
    'lod_rules': {
        'levels': ['LOD0', 'LOD1', 'LOD2', 'LOD3'],
        'source': '每一级 LOD 都由同一声明参数重新生成，不做 LOD1→LOD2→LOD3 链式简化。',
        'silhouette_lock': ['Body', 'Nose', 'Tail', 'Fins', 'Wings', 'Propulsor'],
        'triangle_policy': '三角面数逐级递减；LOD0 与 LOD3 的长度偏差不超过 5%。',
    },
    'collision_rules': {
        'prefix': 'UCX_',
        'shape': '低模凸包（长方体分段），不使用高模渲染网格',
        'manifest': 'Collision/[WEAPON_ID]_COLLISION.json',
    },
    'preview_rules': {
        'views': ['PERSPECTIVE', 'SIDE', 'FRONT', 'TOP', 'DETAIL'],
        'sizes': [128, 256, 512],
        'icons': [128, 256, 512],
        'camera': '正交相机，统一光照与深色背景，按武器长度自动取景。',
    },
    'export_rules': {
        'engine': 'UE4.27',
        'fbx_binary_version': 7400,
        'axis_forward': '-Y',
        'axis_up': 'Z',
        'apply_unit_scale': True,
        'global_scale': 1.0,
        'embed_textures': False,
        'paths': {
            'master': 'Blend/[WEAPON_ID]_MASTER.blend',
            'lod': 'LOD/[WEAPON_ID]_LOD[0-3].fbx',
            'lod_mirror': 'FBX/[WEAPON_ID]_LOD[0-3].fbx',
            'collision': 'Collision/[WEAPON_ID]_COLLISION.fbx',
        },
    },
    'validation_rules_file': f'{PREFIX}_Validation_Rules.json',
}

VALIDATION_RULES = {
    'version': 'v1.0.0',
    'required_asset_dirs': [
        'Source', 'Blend', 'FBX', 'LOD', 'Collision', 'Textures',
        'Preview', 'Documentation', 'Validation',
    ],
    'required_complete_files': [
        'Blend/[WEAPON_ID]_MASTER.blend',
        'LOD/[WEAPON_ID]_LOD0.fbx',
        'LOD/[WEAPON_ID]_LOD1.fbx',
        'LOD/[WEAPON_ID]_LOD2.fbx',
        'LOD/[WEAPON_ID]_LOD3.fbx',
        'Collision/[WEAPON_ID]_COLLISION.fbx',
        'Collision/[WEAPON_ID]_COLLISION.json',
        'Documentation/[WEAPON_ID]_SPEC.json',
        'Documentation/[WEAPON_ID]_README.md',
        'Validation/[WEAPON_ID]_VALIDATION.json',
    ],
    'quality_gate': [
        'recognizable_weapon_class_silhouette',
        'correct_public_proportions',
        'category_specific_features_present',
        'shared_material_set_present',
        'lod_triangle_count_descending',
        'lod_silhouette_preserved',
        'collision_convex_and_named',
        'fbx_binary_version_7400',
        'preview_and_icon_rendered',
        'no_placeholder_geometry',
    ],
    'honesty_rules': [
        '未执行的检查必须记为 NOT VERIFIED。',
        '预览图为渲染产物；除非人工查看过，不得声称已完成目视确认。',
        'UE4.27 导入只有在编辑器真实导入成功后才能标记 VERIFIED。',
    ],
}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def build_template(path: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    root = bpy.data.collections.new('WPN_TEMPLATE')
    scene.collection.children.link(root)
    collections = {}
    for name in ROOT_COLLECTIONS:
        collection = bpy.data.collections.new(name.replace('/', '_'))
        root.children.link(collection)
        collections[name] = collection

    from weapon_geometry_kit import MATERIAL_LIBRARY

    for material_name, spec in MATERIAL_LIBRARY.items():
        material = bpy.data.materials.new(material_name)
        material.use_nodes = True
        material.diffuse_color = spec['base_color']
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = spec['base_color']
        shader.inputs['Metallic'].default_value = spec['metallic']
        shader.inputs['Roughness'].default_value = spec['roughness']
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])

    mesh = bpy.data.meshes.new('WPN_TEMPLATE_REFERENCE_BODY')
    mesh.from_pydata(
        [(0.5, 0.05, 0.05), (0.5, -0.05, 0.05), (0.5, -0.05, -0.05), (0.5, 0.05, -0.05),
         (-0.5, 0.05, 0.05), (-0.5, -0.05, 0.05), (-0.5, -0.05, -0.05), (-0.5, 0.05, -0.05)],
        [], [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
    )
    mesh.validate()
    mesh.update()
    reference = bpy.data.objects.new('WPN_TEMPLATE_REFERENCE_BODY', mesh)
    reference['SDW_TEMPLATE'] = 'placeholder reference, never exported'
    collections['STUDIO_NOT_FOR_EXPORT'].objects.link(reference)

    socket = bpy.data.objects.new('SOCKET_WPN_TEMPLATE_ATTACH', None)
    socket.empty_display_type = 'ARROWS'
    socket['SDW_TEMPLATE'] = 'attach point convention (弹体纵向中心)'
    collections['95_SOCKETS'].objects.link(socket)

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


README_LINES = [
    '# SilentDepth Weapon Asset Template',
    '',
    '版本：v1.0.0',
    f'生成时间：{TODAY}',
    '',
    '本模板是**生产契约**，不是某个具体武器的模型。它规定武器资产的集合层级、部件命名、',
    '共享材质、LOD 策略、碰撞命名、预览规范与 UE4.27 导出参数。',
    '',
    '实际几何由 `Weapons/Tools/weapon_factory_blender.py` 依据 `Weapons/Tools/weapon_dataset.py`',
    '中每个变体声明的公开外形参数生成，绝不复制其它武器的几何。',
    '',
    '| 文件 | 内容 |',
    '| --- | --- |',
    f'| `{PREFIX}_Asset_Template.blend` | 标准集合与材质库（占位参考件不参与导出） |',
    f'| `{PREFIX}_Asset_Template.json` | 命名、集合、材质、LOD、碰撞、导出契约 |',
    f'| `{PREFIX}_Validation_Rules.json` | 完成度与质量门槛 |',
    f'| `{PREFIX}_Export_Preset.json` | UE4.27 FBX 导出参数 |',
    '',
    '> 武器资产只包含公开资料可见的外部外形与游戏数据，不含任何武器内部工程、装药或制造信息。',
    '',
]


def main() -> int:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    blend_path = TEMPLATE_DIR / f'{PREFIX}_Asset_Template.blend'
    build_template(blend_path)
    write_json(TEMPLATE_DIR / f'{PREFIX}_Asset_Template.json', TEMPLATE_JSON)
    write_json(TEMPLATE_DIR / f'{PREFIX}_Validation_Rules.json', VALIDATION_RULES)
    write_json(TEMPLATE_DIR / f'{PREFIX}_Export_Preset.json', EXPORT_PRESET)
    (TEMPLATE_DIR / 'README.md').write_text('\n'.join(README_LINES), encoding='utf-8')
    print(f'WPN_TEMPLATE={blend_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
