"""按 UE4.27 的厘米约定重新导出 FBX，并刷新构建报告里的导出与往返证据。

只在已经存在 MASTER.blend 的资产上工作：不重建几何、不渲染预览，
只重写 FBX/ 与 Collision/ 下的文件，以及构建报告中的 exports / collision.file / roundtrip 字段。

用法：
  blender --background --factory-startup --python reexport_fbx.py -- \
      --root <Propulsion 根> [--ids A B ...]
"""
import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

import propulsion_common as common  # noqa: E402

CATEGORIES = ['Propellers', 'PumpJets', 'Shafts', 'Thrusters']
LODS = [0, 1, 2, 3]


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--ids', nargs='*')
    return parser.parse_args(argv)


def main():
    args = parse_args()
    root = Path(args.root).resolve()
    updated = []
    for category in CATEGORIES:
        for asset_dir in sorted((root / category).glob('*')):
            if not asset_dir.is_dir():
                continue
            asset_id = asset_dir.name
            if args.ids and asset_id not in args.ids:
                continue
            blend = asset_dir / 'Blend' / f'{asset_id}_MASTER.blend'
            report_path = asset_dir / 'Validation' / f'{asset_id}_BUILD_REPORT.json'
            if not blend.exists() or not report_path.exists():
                print(f'跳过（缺 MASTER 或构建报告）：{asset_id}')
                continue

            bpy.ops.wm.open_mainfile(filepath=str(blend))
            bpy.context.preferences.filepaths.save_version = 0
            lod_objects = {}
            for lod in LODS:
                collection = bpy.data.collections.get(f'LOD{lod}')
                lod_objects[lod] = [
                    obj for obj in (collection.objects if collection else []) if obj.type == 'MESH'
                ]
            collision_collection = bpy.data.collections.get('COLLISION')
            collision_objects = [
                obj for obj in (collision_collection.objects if collision_collection else [])
                if obj.type == 'MESH'
            ]
            # UE 的 FBX 导入器只把 UCX_<网格名>_<编号> 当作简单碰撞，
            # 所以碰撞凸包统一改成 UCX_<ASSET_ID>_<两位编号>。
            for index, obj in enumerate(sorted(collision_objects, key=lambda item: item.name)):
                obj.name = f'UCX_{asset_id}_{index:02d}'
            collision_names = [obj.name for obj in collision_objects]
            bpy.ops.wm.save_as_mainfile(filepath=str(blend))

            exports = []
            for lod in LODS:
                target = asset_dir / 'FBX' / f'{asset_id}_LOD{lod}.fbx'
                common.export_selection(lod_objects[lod], target)
                exports.append({
                    'file': str(target),
                    'lod': lod,
                    'fbx_binary_version': common.fbx_version_of(target),
                    'unit_scale_factor_cm': 100.0,
                    'unit_scale_factor_source': '几何按厘米写出（与 Typhoon 母版 FBX 相同约定），并用往返导入核验',
                })

            collision_path = asset_dir / 'Collision' / f'{asset_id}_COLLISION.fbx'
            common.export_selection(collision_objects, collision_path)

            combined_path = asset_dir / 'FBX' / f'{asset_id}_COMBINED.fbx'
            common.export_combined_fbx(asset_id, lod_objects[0], combined_path)

            hulls_path = asset_dir / 'FBX' / f'{asset_id}_HULLS.fbx'
            common.export_collision_hulls(collision_objects, hulls_path, asset_id)

            roundtrip = []
            for lod in LODS:
                report = common.import_fbx_report(asset_dir / 'FBX' / f'{asset_id}_LOD{lod}.fbx')
                report['lod'] = lod
                roundtrip.append(report)
            roundtrip.append(common.import_fbx_report(collision_path))

            build_report = common.read_json(report_path)
            build_report['exports'] = exports
            build_report['collision']['file'] = str(collision_path)
            build_report['roundtrip'] = roundtrip
            build_report['combined_export'] = str(combined_path)
            build_report['hulls_export'] = str(hulls_path)
            build_report['collision']['objects'] = collision_names
            common.write_json(report_path, build_report)
            print(f'REEXPORTED={asset_id} LOD0_M={build_report["lods"][0]["dimensions_m"]}')
            updated.append(asset_id)

    print(f'REEXPORT_COUNT={len(updated)}')


if __name__ == '__main__':
    main()
