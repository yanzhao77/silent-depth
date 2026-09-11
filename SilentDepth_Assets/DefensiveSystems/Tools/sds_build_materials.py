#!/usr/bin/env python3
"""Writes Materials/shared_materials.json from the single material library."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sds_common import MATERIAL_LIBRARY, MATERIALS_DIR, TODAY, save_json  # noqa: E402


def build() -> dict:
    return {
        'schema': 'silent-depth-defensive-materials-v1',
        'generated_at': TODAY,
        'note_zh': '防御系统资产共享材质库。Blender 侧作为 Principled BSDF 参数；'
                   'UE 侧按此重建材质实例。数值为线性空间。',
        'materials': {
            name: {
                'material_name': f'M_Def_{name}',
                'base_color_linear': list(spec['base_color']),
                'metallic': spec['metallic'],
                'roughness': spec['roughness'],
                'usage_zh': spec['usage_zh'],
            }
            for name, spec in MATERIAL_LIBRARY.items()
        },
    }


def main() -> int:
    data = build()
    path = MATERIALS_DIR / 'shared_materials.json'
    save_json(path, data)
    print(f"MATERIALS={len(data['materials'])}")
    print(f"OUT={path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
