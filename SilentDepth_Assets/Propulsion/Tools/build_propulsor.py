"""推进系统几何工厂。

用法（在 Blender 内运行）：
  blender --background --factory-startup --python build_propulsor.py -- \
      --spec <propulsor_specs.json> --id <ASSET_ID> --root <Propulsion 根目录> \
      [--no-preview] [--samples 24] [--skip-roundtrip]

输出布局见 Templates/PROPULSION_ASSET_TEMPLATE.md。本脚本只新增文件，
不修改任何既有资产（尤其是 Typhoon 母版）。
"""
import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

import propulsion_common as common  # noqa: E402

LODS = [0, 1, 2, 3]
REQUIRED_DIRS = ['Blend', 'FBX', 'Collision', 'Preview', 'Documentation', 'Validation', 'Textures']


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', required=True)
    parser.add_argument('--id', required=True)
    parser.add_argument('--root', required=True)
    parser.add_argument('--no-preview', action='store_true')
    parser.add_argument('--skip-roundtrip', action='store_true')
    parser.add_argument('--samples', type=int, default=24)
    return parser.parse_args(argv)


def load_spec(spec_path, asset_id):
    data = common.read_json(spec_path)
    for entry in data['specs']:
        if entry['asset_id'] == asset_id:
            return entry
    raise SystemExit(f'未找到资产规格：{asset_id}')


def build_propeller_lod(asset_id, params, lod, materials, collection):
    objects = []
    diameter = params['main_diameter_m']
    hub_radius = params['hub_diameter_m'] / 2.0
    hub_length = params['hub_length_m']
    tip_radius = diameter / 2.0
    hub_segments = common.LOD_PROFILE[lod]['hub_segments']

    hub_profile = [
        (hub_length * 0.50, 0.0),
        (hub_length * 0.44, hub_radius * 0.62),
        (hub_length * 0.22, hub_radius),
        (-hub_length * 0.20, hub_radius),
        (-hub_length * 0.44, hub_radius * 0.58),
        (-hub_length * 0.50, 0.0),
    ]
    hub_vertices, hub_faces = common.revolve_x(hub_profile, hub_segments)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Hub', hub_vertices, hub_faces, materials['M_Propulsor_Hub'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    blade_count = params['blade_count']
    blade_material = materials['M_Propulsor_Blade']
    for index in range(blade_count):
        vertices, faces = common.build_blade(params, lod, index, blade_count, hub_radius * 0.92, tip_radius)
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Blade_{index:02d}', vertices, faces, blade_material, collection,
            custom_props={
                'asset_role': 'exterior_visual',
                'movable_part': True,
                'hinge_pivot_m': [0.0, 0.0, 0.0],
            },
        ))

    shroud = params.get('shroud', {})
    if shroud.get('enabled'):
        inner_radius = shroud['outer_diameter_m'] / 2.0 - shroud['thickness_m']
        half = shroud['length_m'] / 2.0
        duct_profile = [
            (half, inner_radius),
            (half, shroud['outer_diameter_m'] / 2.0),
            (-half, shroud['outer_diameter_m'] / 2.0),
            (-half, inner_radius),
        ]
        duct_vertices, duct_faces = common.revolve_x(
            duct_profile, common.LOD_PROFILE[lod]['duct_segments'], closed_profile=True
        )
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Shroud', duct_vertices, duct_faces,
            materials['M_Propulsor_Duct'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    if params.get('shaft', {}).get('enabled'):
        shaft = params['shaft']
        shaft_start = hub_length * 0.45
        shaft_vertices, shaft_faces = common.cylinder_x(
            shaft_start, shaft_start + shaft['length_m'], shaft['diameter_m'] / 2.0,
            common.LOD_PROFILE[lod]['hub_segments'],
        )
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Shaft', shaft_vertices, shaft_faces,
            materials['M_Propulsor_Hub'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    return objects


def build_pumpjet_lod(asset_id, params, lod, materials, collection):
    objects = []
    diameter = params['main_diameter_m']
    hub_radius = params['hub_diameter_m'] / 2.0
    hub_length = params['hub_length_m']
    tip_radius = diameter / 2.0
    segments = common.LOD_PROFILE[lod]['duct_segments']
    hub_segments = common.LOD_PROFILE[lod]['hub_segments']
    shroud = params['shroud']
    housing_inner = shroud['outer_diameter_m'] / 2.0 - shroud['thickness_m']

    hub_profile = [
        (hub_length * 0.50, 0.0),
        (hub_length * 0.42, hub_radius * 0.70),
        (hub_length * 0.10, hub_radius),
        (-hub_length * 0.30, hub_radius * 0.94),
        (-hub_length * 0.48, hub_radius * 0.52),
        (-hub_length * 0.58, 0.0),
    ]
    hub_vertices, hub_faces = common.revolve_x(hub_profile, hub_segments)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Hub', hub_vertices, hub_faces, materials['M_Propulsor_Hub'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    half = shroud['length_m'] / 2.0
    housing_profile = [
        (half * 1.04, housing_inner),
        (half * 1.04, shroud['outer_diameter_m'] / 2.0),
        (-half, shroud['outer_diameter_m'] / 2.0),
        (-half, housing_inner),
    ]
    housing_vertices, housing_faces = common.revolve_x(housing_profile, segments, closed_profile=True)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Housing', housing_vertices, housing_faces,
        materials['M_Propulsor_Duct'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    lining_profile = [
        (half * 1.0, housing_inner * 0.99),
        (half * 1.0, housing_inner * 0.93),
        (-half * 0.96, housing_inner * 0.93),
        (-half * 0.96, housing_inner * 0.99),
    ]
    lining_vertices, lining_faces = common.revolve_x(lining_profile, segments, closed_profile=True)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Lining', lining_vertices, lining_faces,
        materials['M_Propulsor_Rubber'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    rotor_material = materials['M_Propulsor_Blade']
    for index in range(params['blade_count']):
        vertices, faces = common.build_blade(params, lod, index, params['blade_count'], hub_radius * 0.92, tip_radius)
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Rotor_{index:02d}', vertices, faces, rotor_material, collection,
            custom_props={
                'asset_role': 'exterior_visual',
                'movable_part': True,
                'hinge_pivot_m': [0.0, 0.0, 0.0],
            },
        ))

    stator_count = int(params.get('stator_count', 0))
    if stator_count > 0:
        for index in range(stator_count):
            vertices, faces = common.build_vane(
                params, lod, index, stator_count, hub_radius * 0.98, housing_inner * 0.99, 12.0
            )
            shifted = [(vertex[0] - shroud['length_m'] * 0.30, vertex[1], vertex[2]) for vertex in vertices]
            objects.append(common.make_mesh_object(
                f'{asset_id}_LOD{lod}_Stator_{index:02d}', shifted, faces,
                materials['M_Propulsor_Hub'], collection,
                custom_props={'asset_role': 'exterior_visual'},
            ))

    nozzle = params.get('nozzle', {})
    if nozzle.get('enabled'):
        exit_radius = nozzle['exit_diameter_m'] / 2.0
        nozzle_profile = [
            (-half, housing_inner),
            (-half - nozzle['length_m'], exit_radius),
            (-half - nozzle['length_m'], exit_radius * 1.06),
            (-half, shroud['outer_diameter_m'] / 2.0),
        ]
        nozzle_vertices, nozzle_faces = common.revolve_x(nozzle_profile, segments, closed_profile=True)
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Nozzle', nozzle_vertices, nozzle_faces,
            materials['M_Propulsor_Duct'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    if params.get('shaft', {}).get('enabled'):
        shaft = params['shaft']
        shaft_start = hub_length * 0.45
        shaft_vertices, shaft_faces = common.cylinder_x(
            shaft_start, shaft_start + shaft['length_m'], shaft['diameter_m'] / 2.0, hub_segments
        )
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Shaft', shaft_vertices, shaft_faces,
            materials['M_Propulsor_Hub'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    return objects


def build_shaft_lod(asset_id, params, lod, materials, collection):
    objects = []
    shaft = params['shaft']
    length = shaft['length_m']
    radius = shaft['diameter_m'] / 2.0
    segments = common.SHAFT_LOD_SEGMENTS[lod]

    shaft_vertices, shaft_faces = common.cylinder_x(-length / 2.0, length / 2.0, radius, segments)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Shaft', shaft_vertices, shaft_faces,
        materials['M_Propulsor_Hub'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    coupling = params.get('coupling', {})
    if coupling.get('enabled'):
        coupling_start = length / 2.0 - coupling['length_m']
        coupling_vertices, coupling_faces = common.cylinder_x(
            coupling_start, coupling_start + coupling['length_m'],
            coupling['diameter_m'] / 2.0, segments,
        )
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Coupling', coupling_vertices, coupling_faces,
            materials['M_Propulsor_Duct'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    fairing = params.get('fairing', {})
    if fairing.get('enabled'):
        fairing_length = fairing['length_m']
        fairing_radius = fairing['diameter_m'] / 2.0
        fairing_profile = [
            (fairing_length / 2.0, fairing_radius * 0.18),
            (fairing_length * 0.36, fairing_radius * 0.72),
            (fairing_length * 0.05, fairing_radius),
            (-fairing_length * 0.30, fairing_radius * 0.96),
            (-fairing_length * 0.46, fairing_radius * 0.42),
            (-fairing_length / 2.0, fairing_radius * 0.10),
        ]
        fairing_vertices, fairing_faces = common.revolve_x(fairing_profile, segments)
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Fairing', fairing_vertices, fairing_faces,
            materials['M_Propulsor_Duct'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    return objects


def build_thruster_lod(asset_id, params, lod, materials, collection):
    objects = []
    diameter = params['main_diameter_m']
    hub_radius = params['hub_diameter_m'] / 2.0
    tip_radius = diameter / 2.0
    shroud = params['shroud']
    segments = common.LOD_PROFILE[lod]['duct_segments']
    hub_segments = common.LOD_PROFILE[lod]['hub_segments']
    inner_radius = shroud['outer_diameter_m'] / 2.0 - shroud['thickness_m']
    half = shroud['length_m'] / 2.0

    duct_profile = [
        (half, inner_radius),
        (half, shroud['outer_diameter_m'] / 2.0),
        (-half, shroud['outer_diameter_m'] / 2.0),
        (-half, inner_radius),
    ]
    duct_vertices, duct_faces = common.revolve_x(duct_profile, segments, closed_profile=True)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Duct', duct_vertices, duct_faces,
        materials['M_Propulsor_Duct'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    hub_profile = [
        (half * 0.55, 0.0),
        (half * 0.35, hub_radius),
        (-half * 0.35, hub_radius),
        (-half * 0.55, 0.0),
    ]
    hub_vertices, hub_faces = common.revolve_x(hub_profile, hub_segments)
    objects.append(common.make_mesh_object(
        f'{asset_id}_LOD{lod}_Hub', hub_vertices, hub_faces,
        materials['M_Propulsor_Hub'], collection,
        custom_props={'asset_role': 'exterior_visual'},
    ))

    for index in range(params['blade_count']):
        vertices, faces = common.build_blade(params, lod, index, params['blade_count'], hub_radius, tip_radius)
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_Impeller_{index:02d}', vertices, faces,
            materials['M_Propulsor_Blade'], collection,
            custom_props={
                'asset_role': 'exterior_visual',
                'movable_part': True,
                'hinge_pivot_m': [0.0, 0.0, 0.0],
            },
        ))

    coupling = params.get('coupling', {})
    if coupling.get('enabled'):
        flange_start = half - coupling['length_m'] * 0.2
        flange_vertices, flange_faces = common.cylinder_x(
            flange_start, flange_start + coupling['length_m'],
            coupling['diameter_m'] / 2.0, hub_segments,
        )
        objects.append(common.make_mesh_object(
            f'{asset_id}_LOD{lod}_MountFlange', flange_vertices, flange_faces,
            materials['M_Propulsor_Duct'], collection,
            custom_props={'asset_role': 'exterior_visual'},
        ))

    return objects


LOD_BUILDERS = {
    'PROPELLER': build_propeller_lod,
    'PUMPJET': build_pumpjet_lod,
    'SHAFT': build_shaft_lod,
    'THRUSTER': build_thruster_lod,
}


def build_collision(asset_id, params, kind, materials, collection):
    duct_material = materials['M_Propulsor_Duct']
    hub_material = materials['M_Propulsor_Hub']
    objects = []
    segments = 16

    if kind == 'SHAFT':
        length = params['shaft']['length_m']
        radius = params['shaft']['diameter_m'] / 2.0
        vertices, faces = common.cylinder_x(-length / 2.0, length / 2.0, radius, segments)
        objects.append(common.convex_hull_object(f'UCX_{asset_id}_SHAFT', vertices, hub_material, collection))
        fairing = params.get('fairing', {})
        if fairing.get('enabled'):
            vertices, faces = common.cylinder_x(
                -fairing['length_m'] / 2.0, fairing['length_m'] / 2.0,
                fairing['diameter_m'] / 2.0, segments,
            )
            objects.append(common.convex_hull_object(f'UCX_{asset_id}_FAIRING', vertices, duct_material, collection))
        return objects

    diameter = params['main_diameter_m']
    hub_radius = params['hub_diameter_m'] / 2.0
    shroud = params.get('shroud', {})
    hub_length = params.get('hub_length_m', shroud.get('length_m', diameter * 0.4))
    vertices, faces = common.cylinder_x(-hub_length / 2.0, hub_length / 2.0, hub_radius * 1.05, segments)
    objects.append(common.convex_hull_object(f'UCX_{asset_id}_HUB', vertices, hub_material, collection))

    vertices, faces = common.cylinder_x(-diameter * 0.14, diameter * 0.14, diameter / 2.0, segments)
    objects.append(common.convex_hull_object(f'UCX_{asset_id}_BLADES', vertices, hub_material, collection))

    if shroud.get('enabled'):
        vertices, faces = common.cylinder_x(
            -shroud['length_m'] / 2.0, shroud['length_m'] / 2.0,
            shroud['outer_diameter_m'] / 2.0, segments,
        )
        objects.append(common.convex_hull_object(f'UCX_{asset_id}_HOUSING', vertices, duct_material, collection))

    return objects


def build_sockets(asset_id, params, kind, collection):
    sockets = []
    hub_half = params.get('hub_length_m', 0.0) / 2.0
    if kind in {'PROPELLER', 'PUMPJET'}:
        sockets.append(common.create_socket('SOCKET_PROPULSOR', (0.0, 0.0, 0.0), collection))
        sockets.append(common.create_socket('SOCKET_SHAFT', (0.0, 0.0, 0.0), collection))
        if kind == 'PUMPJET':
            back = -params['shroud']['length_m'] / 2.0
            sockets.append(common.create_socket('SOCKET_PUMPJET', (back, 0.0, 0.0), collection))
    elif kind == 'SHAFT':
        sockets.append(common.create_socket('SOCKET_SHAFT', (-params['shaft']['length_m'] / 2.0, 0.0, 0.0), collection))
    elif kind == 'THRUSTER':
        sockets.append(common.create_socket('SOCKET_THRUSTER', (0.0, 0.0, 0.0), collection))
    return sockets


def relative_to_root(path, root):
    try:
        return str(Path(path).resolve().relative_to(root)).replace('\\', '/')
    except ValueError:
        return str(path).replace('\\', '/')


def write_asset_documentation(category_root, root, spec, build_report, previews):
    asset_id = spec['asset_id']
    documentation = category_root / 'Documentation'
    paths = {
        'blend': relative_to_root(category_root / 'Blend' / f'{asset_id}_MASTER.blend', root),
        'lod0': relative_to_root(category_root / 'FBX' / f'{asset_id}_LOD0.fbx', root),
        'lod1': relative_to_root(category_root / 'FBX' / f'{asset_id}_LOD1.fbx', root),
        'lod2': relative_to_root(category_root / 'FBX' / f'{asset_id}_LOD2.fbx', root),
        'lod3': relative_to_root(category_root / 'FBX' / f'{asset_id}_LOD3.fbx', root),
        'collision': relative_to_root(category_root / 'Collision' / f'{asset_id}_COLLISION.fbx', root),
        'spec': relative_to_root(documentation / f'{asset_id}_SPEC.json', root),
        'readme': relative_to_root(documentation / f'{asset_id}_README.md', root),
        'preview': [relative_to_root(entry['file'], root) for entry in previews],
    }
    asset_spec = {
        'asset_id': asset_id,
        'display_name': spec['display_name'],
        'category': spec['category'],
        'kind': spec['kind'],
        'country': spec.get('country', 'GENERIC'),
        'tier': spec['tier'],
        'era': spec.get('era', 'UNKNOWN'),
        'technology_route': spec.get('technology_route', 'UNKNOWN'),
        'status': spec.get('status', 'IMPLEMENTING'),
        'template_version': 'v1.0.0',
        'template_source': 'SilentDepth_Assets/Propulsion/Templates/PROPULSION_ASSET_TEMPLATE.md',
        'params': spec['params'],
        'provenance': {
            'count_provenance': spec['params'].get('count_provenance', 'GAME_ART_SPEC'),
            'note': spec['params'].get('provenance_note', ''),
        },
        'units': {'system': 'METRIC', 'scale_length': 1.0, 'dimension_unit': 'm'},
        'lods': {entry['lod']: entry['triangles'] for entry in build_report['lods']},
        'dimensions_m': build_report['lods'][0]['dimensions_m'],
        'sockets': [socket['name'] for socket in build_report['sockets']],
        'materials': [material['name'] for material in build_report['materials']],
        'textures': [],
        'paths': paths,
        'validation': relative_to_root(category_root / 'Validation' / f'{asset_id}_VALIDATION.json', root),
        'build_report': relative_to_root(category_root / 'Validation' / f'{asset_id}_BUILD_REPORT.json', root),
        'references': spec.get('references', []),
        'limitations': build_report['limitations'],
    }
    common.write_json(documentation / f'{asset_id}_SPEC.json', asset_spec)

    lod_lines = '\n'.join(
        f"| LOD{entry['lod']} | {entry['triangles']} | {entry['vertices']} | "
        f"{entry['dimensions_m'][0]} × {entry['dimensions_m'][1]} × {entry['dimensions_m'][2]} |"
        for entry in build_report['lods']
    )
    preview_lines = '\n'.join(
        f"- `{Path(entry['file']).name}`（{entry['view']}，非背景像素 {entry['non_background_fraction'] * 100:.1f}%）"
        for entry in previews
    ) or '- 本次构建跳过了预览渲染。'
    readme = f"""# {asset_id} — {spec['display_name']}

分类：`{spec['category']}` · 类型：`{spec['kind']}` · 科技层级：T{spec['tier']} · 时代：{spec.get('era', 'UNKNOWN')}

技术路线：{spec.get('technology_route', 'UNKNOWN')}

## 建模来源

几何由 `Tools/build_propulsor.py` 按 `Manifest/propulsor_specs.json` 的参数程序化生成，
建模规范来自 `Templates/PROPULSION_ASSET_TEMPLATE.md`（从 Typhoon 母版实测抽取）。

叶片数量来源：`{spec['params'].get('count_provenance', 'GAME_ART_SPEC')}`。
{spec['params'].get('provenance_note', '')}

## LOD

| LOD | 三角面 | 顶点 | 尺寸（X × Y × Z，米） |
| --- | ---: | ---: | --- |
{lod_lines}

## 插槽

{', '.join('`' + socket['name'] + '`' for socket in build_report['sockets'])}

## 预览

{preview_lines}

## 已知限制

{chr(10).join('- ' + item for item in build_report['limitations'])}
"""
    (documentation / f'{asset_id}_README.md').write_text(readme, encoding='utf-8')


def main():
    args = parse_args()
    spec = load_spec(args.spec, args.id)
    asset_id = spec['asset_id']
    kind = spec['kind']
    params = spec['params']
    root = Path(args.root).resolve()
    category_root = root / spec['category'] / asset_id
    for rel in REQUIRED_DIRS:
        (category_root / rel).mkdir(parents=True, exist_ok=True)

    common.reset_scene()
    # 不生成 .blend1 备份：这些母版是可再生产物，备份只会污染资产库体积。
    bpy.context.preferences.filepaths.save_version = 0
    materials = common.make_materials()
    scene = bpy.context.scene
    scene.name = f'{asset_id}_MASTER'
    scene_scale_length = float(scene.unit_settings.scale_length)
    scene_unit_system = scene.unit_settings.system
    root_collection = common.ensure_collection('PROPULSION_ROOT')
    lod_collections = {lod: common.ensure_collection(f'LOD{lod}', root_collection) for lod in LODS}
    socket_collection = common.ensure_collection('SOCKETS', root_collection)
    collision_collection = common.ensure_collection('COLLISION', root_collection)

    builder = LOD_BUILDERS[kind]
    lod_objects = {}
    for lod in LODS:
        lod_objects[lod] = builder(asset_id, params, lod, materials, lod_collections[lod])

    sockets = build_sockets(asset_id, params, kind, socket_collection)
    collision_objects = build_collision(asset_id, params, kind, materials, collision_collection)

    blend_path = category_root / 'Blend' / f'{asset_id}_MASTER.blend'
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    export_reports = []
    for lod in LODS:
        target = category_root / 'FBX' / f'{asset_id}_LOD{lod}.fbx'
        common.export_selection(lod_objects[lod], target)
        export_reports.append({
            'file': str(target),
            'lod': lod,
            'fbx_binary_version': common.fbx_version_of(target),
            'unit_scale_factor_cm': 100.0,
            'unit_scale_factor_source': '按 FBX_SCALE_UNITS + apply_unit_scale 导出设置写入，并用往返导入尺寸核验',
        })

    collision_path = category_root / 'Collision' / f'{asset_id}_COLLISION.fbx'
    common.export_selection(collision_objects, collision_path)

    lod_reports = []
    for lod in LODS:
        measured = common.measure_selection(lod_objects[lod])
        lod_reports.append({
            'lod': lod,
            'objects': [obj.name for obj in lod_objects[lod]],
            'vertices': measured['vertices'],
            'triangles': measured['triangles'],
            'dimensions_m': measured['dimensions_m'],
            'materials': measured['materials'],
            'uv_channels': sorted({layer.name for obj in lod_objects[lod] for layer in obj.data.uv_layers}),
        })

    overall = common.measure_selection(lod_objects[0])
    bounding_radius = max(overall['dimensions_m']) / 2.0

    checks = {
        'scale_applied': all(
            all(abs(value - 1.0) < 1e-6 for value in obj.scale) for obj in lod_objects[0]
        ),
        'object_transforms_applied': all(
            all(abs(value) < 1e-6 for value in obj.rotation_euler) for obj in lod_objects[0]
        ),
        'forbidden_names': [
            obj.name for lod in LODS for obj in lod_objects[lod]
            if obj.name in common.FORBIDDEN_OBJECT_NAMES
        ],
        'objects_missing_uv': [
            obj.name for lod in LODS for obj in lod_objects[lod] if len(obj.data.uv_layers) == 0
        ],
        'objects_missing_material': [
            obj.name for lod in LODS for obj in lod_objects[lod] if len(obj.data.materials) == 0
        ],
    }
    sockets_report = [
        {
            'name': socket.name,
            'location_m': [round(float(value), 6) for value in socket.location],
            'rotation_euler_rad': [0.0, 0.0, 0.0],
            'parent': None,
        }
        for socket in sockets
    ]
    collision_report = {
        'file': str(collision_path),
        'convex_hull_count': len(collision_objects),
        'objects': [obj.name for obj in collision_objects],
    }

    previews = []
    if not args.no_preview:
        previews = common.render_previews(
            asset_id, category_root / 'Preview', 0.0, bounding_radius, samples=args.samples
        )

    roundtrip = []
    if not args.skip_roundtrip:
        for lod in LODS:
            report = common.import_fbx_report(category_root / 'FBX' / f'{asset_id}_LOD{lod}.fbx')
            report['lod'] = lod
            roundtrip.append(report)
        roundtrip.append(common.import_fbx_report(collision_path))

    build_report = {
        'asset_id': asset_id,
        'category': spec['category'],
        'kind': kind,
        'generated_at': date.today().isoformat(),
        'blender_version': bpy.app.version_string,
        'units': {'system': scene_unit_system, 'scale_length': scene_scale_length},
        'origin_rule': 'PIVOT_ON_SHAFT_AXIS' if kind in {'PROPELLER', 'PUMPJET'} else 'ORIGIN_AT_ASSEMBLY_CENTER',
        'origin_m': [0.0, 0.0, 0.0],
        'sockets': sockets_report,
        'lods': lod_reports,
        'materials': [
            {
                'name': name,
                'base_color_linear': spec_values['base_color_linear'],
                'roughness': spec_values['roughness'],
                'metallic': spec_values['metallic'],
                'texture_files': [],
            }
            for name, spec_values in common.MATERIALS.items()
        ],
        'collision': collision_report,
        'exports': export_reports,
        'previews': previews,
        'roundtrip': roundtrip,
        'checks': checks,
        'limitations': [
            '程序化生成的推进器外形成像，不是任何具体艇号的实测复制。',
            '未在 UE4.27 编辑器内实际导入验证，状态保持 VALIDATING。',
            '叶片数量与几何参数的游戏取值不属于公开事实声明。',
        ],
    }
    normalized = json.loads(json.dumps(build_report, default=str))
    common.write_json(category_root / 'Validation' / f'{asset_id}_BUILD_REPORT.json', normalized)
    write_asset_documentation(category_root, root, spec, normalized, previews)
    print(f'PROPULSOR_BUILT={asset_id}')
    print(f'LOD0_TRIANGLES={lod_reports[0]["triangles"]}')


if __name__ == '__main__':
    main()
