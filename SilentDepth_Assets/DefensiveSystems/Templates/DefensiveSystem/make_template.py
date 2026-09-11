#!/usr/bin/env python3
"""Builds the defensive system asset template scene.

    blender --background --factory-startup --python make_template.py

The template carries the collection layout, the SOCKET_* placeholder empties and
the shared M_Def_* materials, so a new asset starts from the same structure the
pipeline expects.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'Tools'))

import bpy  # noqa: E402

from sds_common import MATERIAL_LIBRARY, SOCKETS  # noqa: E402

TEMPLATE_JSON = Path(__file__).resolve().parent / 'SilentDepth_DefensiveSystem_Asset_Template.json'
OUTPUT = Path(__file__).resolve().parent / 'SilentDepth_DefensiveSystem_Asset_Template.blend'
COLLECTIONS = ('00_TEMPLATE', '10_BODY', '20_MOUNTS', '30_COLLISION', '90_LOD')


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    for name in COLLECTIONS:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)

    mounts = bpy.data.collections['20_MOUNTS']
    for socket_name in SOCKETS:
        obj = bpy.data.objects.new(socket_name, None)
        obj.empty_display_type = 'PLAIN_AXES'
        obj.empty_display_size = 0.25
        mounts.objects.link(obj)

    for name, spec in MATERIAL_LIBRARY.items():
        material = bpy.data.materials.new(f'M_Def_{name}')
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        if bsdf is not None:
            bsdf.inputs['Base Color'].default_value = (*spec['base_color'], 1.0)
            bsdf.inputs['Metallic'].default_value = spec['metallic']
            bsdf.inputs['Roughness'].default_value = spec['roughness']

    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    print(f'SDS_TEMPLATE_WRITTEN={OUTPUT}')
    print(f'COLLECTIONS={len(COLLECTIONS)} SOCKETS={len(SOCKETS)} MATERIALS={len(MATERIAL_LIBRARY)}')
    print(f'TEMPLATE_JSON_EXISTS={TEMPLATE_JSON.is_file()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
