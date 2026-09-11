#!/usr/bin/env python3
"""导出共享武器材质库（Weapons/Materials/weapon_materials.json）。

材质定义来自 weapon_geometry_kit.MATERIAL_LIBRARY，是工厂与模板的唯一来源；
武器资产不使用外部贴图，保证运行时完全离线。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import TODAY, WEAPONS_ROOT, save_json  # noqa: E402
from weapon_geometry_kit import MATERIAL_LIBRARY, MATERIAL_ORDER  # noqa: E402


def main() -> int:
    payload = {
        'library': 'SilentDepth_Weapon_Materials',
        'generated_at': TODAY,
        'policy': [
            '所有武器共用同一套程序化 PBR 材质，不引用外部贴图。',
            '材质名以 WPN_MAT_ 前缀统一命名，便于 UE4 侧复用。',
        ],
        'order': list(MATERIAL_ORDER),
        'materials': {
            name: {
                'base_color': list(spec['base_color']),
                'metallic': spec['metallic'],
                'roughness': spec['roughness'],
            }
            for name, spec in sorted(MATERIAL_LIBRARY.items())
        },
    }
    path = WEAPONS_ROOT / 'Materials' / 'weapon_materials.json'
    save_json(path, payload)
    print(f'MATERIALS={len(payload["materials"])}')
    print(f'OUT={path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
