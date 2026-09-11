#!/usr/bin/env python3
"""生成传感器母版与材质库（§21 TEMPLATE、§26）。

用法：
    blender --background --factory-startup --python Tools/build_sensor_template.py

产物：
    Templates/Sensor/SilentDepth_Sensor_Asset_Template.blend
    Materials/SilentDepth_Sensor_Materials.blend

母版只包含集合结构、8 个统一插槽空物体、共享材质与说明文本块，不含任何成品几何；
建模工作必须从复制母版开始。
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from sensor_common import MATERIAL_DIR, SOCKETS, TEMPLATE_DIR, save_json  # noqa: E402
from sensor_dataset_assets import MATERIALS  # noqa: E402
from sensor_geometry import ensure_materials  # noqa: E402

SOCKET_PLACEMENT = {
    'SOCKET_SONAR_BOW': ((2.0, 0.0, 0.0), '艇艏声呐插槽：朝 +X'),
    'SOCKET_SONAR_FLANK_L': ((0.0, 2.5, 0.0), '左舷侧阵插槽：朝 +Y'),
    'SOCKET_SONAR_FLANK_R': ((0.0, -2.5, 0.0), '右舷侧阵插槽：朝 -Y'),
    'SOCKET_TOWED_ARRAY': ((-2.0, 0.0, 0.5), '拖曳阵插槽：朝 -X'),
    'SOCKET_PHOTONICS_MAST': ((0.0, 0.0, 8.0), '光电桅杆插槽：朝 +Z'),
    'SOCKET_PERISCOPE': ((0.5, 0.0, 8.0), '潜望镜插槽：朝 +Z'),
    'SOCKET_RADAR': ((-0.5, 0.0, 8.0), '雷达插槽：朝 +Z'),
    'SOCKET_ESM': ((1.0, 0.0, 8.5), '电子支援插槽：朝 +Z'),
}

TEMPLATE_NOTES = """SILENT DEPTH 传感器资产母版 v1.0.0

1. 复制本文件到 Sensors/<分支>/<SENSOR_ID>/Blend/<SENSOR_ID>_MASTER.blend。
2. 只在 01_STRUCTURE / 02_ARRAY_FACE / 03_CABLE / 04_OPTICS 这些工作集合里建模，
   成品网格命名 SEN_<SENSOR_ID>_LOD<n>，并放入 90_LOD/LOD<n>。
3. 碰撞体必须是独立凸包，命名 UCX_SEN_<SENSOR_ID>_00，放入 99_COLLISION。
4. 只使用 95_SOCKETS 中已有的统一插槽名，不要自创插槽。
5. 单位：米；朝向：艇艏 +X，Z 向上；缩放与旋转必须归零。
6. 材质只使用 SEN_MAT_* 共享材质；不引入任何外部贴图，运行期必须完全离线。
7. 导出：FBX 2018 兼容（二进制 7400），axis_forward=-Y，axis_up=Z。
"""


def new_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(collection)
    return collection


def build_template_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ensure_materials()
    root = new_collection('SEN_TEMPLATE')
    for name in ('01_STRUCTURE', '02_ARRAY_FACE', '03_CABLE', '04_OPTICS'):
        new_collection(name, root)
    lod_root = new_collection('90_LOD', root)
    for level in range(4):
        new_collection(f'LOD{level}', lod_root)
    socket_collection = new_collection('95_SOCKETS', root)
    new_collection('99_COLLISION', root)
    for socket in SOCKETS:
        location, label = SOCKET_PLACEMENT[socket]
        empty = bpy.data.objects.new(socket, None)
        empty.empty_display_type = 'ARROWS'
        empty.empty_display_size = 0.5
        empty.location = location
        empty['mount_note'] = label
        socket_collection.objects.link(empty)
    text = bpy.data.texts.new('README_TEMPLATE')
    text.write(TEMPLATE_NOTES)
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(TEMPLATE_DIR / 'SilentDepth_Sensor_Asset_Template.blend'),
        compress=False,
    )


def build_material_library() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = ensure_materials()
    collection = new_collection('SEN_MATERIAL_PREVIEWS')
    for index, spec in enumerate(MATERIALS):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.5,
                                             location=((index % 5) * 1.4, -(index // 5) * 1.4, 0.5))
        sphere = bpy.context.active_object
        sphere.name = f'PREVIEW_{spec["material_id"]}'
        sphere.data.name = sphere.name
        sphere.data.materials.append(materials[spec['material_id']])
        for owner in list(sphere.users_collection):
            owner.objects.unlink(sphere)
        collection.objects.link(sphere)
    MATERIAL_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(MATERIAL_DIR / 'SilentDepth_Sensor_Materials.blend'),
        compress=False,
    )
    save_json(MATERIAL_DIR / 'sensor_materials.json', {
        'library': 'SilentDepth_Sensor_Materials.blend',
        'texture_policy': '程序化材质；无外部位图；运行期完全离线。',
        'materials': MATERIALS,
    })


def main() -> int:
    build_template_scene()
    print('TEMPLATE_WRITTEN')
    build_material_library()
    print('MATERIAL_LIBRARY_WRITTEN')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
