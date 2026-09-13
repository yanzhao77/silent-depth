#!/usr/bin/env python3
"""推进系统数据库构建器。

从 propulsor_specs.json、各资产 SPEC/构建报告、公开资料研究结果生成：
  Manifest/propulsion_manifest.json
  Manifest/propulsion_family.json
  TechnologyTree/propulsion_technology_tree.json
  Manifest/submarine_propulsion_compatibility.json
  Manifest/SubmarinePropulsionMatrix.csv
  Documentation/propulsion_coverage_report.md

纯标准库，可在没有 Blender 的机器上运行。只写上面这些文件。
"""
import argparse
import csv
import json
from datetime import date
from pathlib import Path

CATEGORIES = ['Propellers', 'PumpJets', 'Shafts', 'Thrusters']
TODAY = date.today().isoformat()

# 家族归属：把每个推进器资产归入一个公开技术路线家族。
FAMILY_OF_ASSET = {
    'PROP_T01_EARLY': 'FAM_PROP_CONVENTIONAL',
    'PROP_T02_IMPROVED': 'FAM_PROP_CONVENTIONAL',
    'PROP_T03_MULTIBLADE': 'FAM_PROP_MULTIBLADE',
    'PROP_T04_SKEWED': 'FAM_PROP_SKEWED',
    'PROP_T05_QUIET': 'FAM_PROP_QUIET',
    'RU_PROP_Typhoon': 'RU_PROP_SHROUDED',
    'RU_PROP_Akula': 'RU_PROP_SKEWED',
    'US_PROP_LosAngeles': 'US_PROP_SKEWED',
    'CN_PROP_Type093': 'CN_PROP_SKEWED',
    'US_PJ_Seawolf': 'US_PUMPJET_SEAWOLF',
    'US_PJ_Virginia': 'US_PUMPJET_VIRGINIA',
    'UK_PJ_Astute': 'UK_PUMPJET_ASTUTE',
    'RU_PJ_Yasen': 'RU_PUMPJET_YASEN',
    'FR_PJ_Suffren': 'FR_PUMPJET_SUFFREN',
    'PJ_T10_NEXTGEN': 'FAM_PJ_NEXTGEN',
    'SHAFT_PLAIN': 'FAM_SHAFT_DIRECT',
    'SHAFT_GEARED': 'FAM_SHAFT_GEARED',
    'SHAFT_FAIRING_LONG': 'RU_SHAFT_FAIRED',
    'THRUSTER_TUNNEL': 'FAM_THRUSTER_TUNNEL',
    'THRUSTER_RIM_DRIVEN': 'FAM_THRUSTER_RIM',
}

FAMILY_META = {
    'FAM_PROP_CONVENTIONAL': {
        'display_name': '常规少叶螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['GENERIC'],
        'public_label': 'early / improved plain propeller',
        'description': '两叶到三叶、几乎无后掠的早期桨型，用来表达 T1–T2 世代。',
    },
    'FAM_PROP_MULTIBLADE': {
        'display_name': '多叶螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['GENERIC'],
        'public_label': 'multi-blade propeller',
        'description': 'T3 世代：叶片数增加、单叶载荷下降；叶片数本身不等于更高 Tier。',
    },
    'FAM_PROP_SKEWED': {
        'display_name': '后掠螺旋桨（通用）',
        'kind': 'PROPELLER',
        'country_scope': ['GENERIC'],
        'public_label': 'skewed propeller',
        'description': 'T4 世代：后掠（skew）是主要降噪概念。',
    },
    'FAM_PROP_QUIET': {
        'display_name': '高后掠静音螺旋桨（通用）',
        'kind': 'PROPELLER',
        'country_scope': ['GENERIC'],
        'public_label': 'advanced quiet propeller',
        'description': 'T5 世代：高后掠 + 多叶 + 薄叶型的综合降噪设计成熟度。',
    },
    'RU_PROP_SHROUDED': {
        'display_name': '苏/俄导管螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['Russia'],
        'public_label': 'shrouded propeller',
        'description': '带围罩的螺旋桨构型，代表作为 Project 941 的双桨布置。',
    },
    'RU_PROP_SKEWED': {
        'display_name': '苏/俄后掠螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['Russia'],
        'public_label': 'skewed propeller',
        'description': '苏/俄多叶后掠桨家族。',
    },
    'US_PROP_SKEWED': {
        'display_name': '美制高后掠螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['USA'],
        'public_label': 'highly skewed propeller',
        'description': '美制核潜艇上长期使用的高后掠多叶桨。',
    },
    'CN_PROP_SKEWED': {
        'display_name': '中国后掠螺旋桨',
        'kind': 'PROPELLER',
        'country_scope': ['China'],
        'public_label': 'skewed propeller',
        'description': '公开资料有限的桨型；几何为游戏美术取值。',
    },
    'US_PUMPJET_SEAWOLF': {
        'display_name': '美制泵喷（Seawolf 世代）',
        'kind': 'PUMPJET',
        'country_scope': ['USA'],
        'public_label': 'pump-jet propulsor',
        'description': 'Seawolf 级公开报道的泵喷构型。',
    },
    'US_PUMPJET_VIRGINIA': {
        'display_name': '美制泵喷（Virginia 世代）',
        'kind': 'PUMPJET',
        'country_scope': ['USA'],
        'public_label': 'pump-jet propulsor',
        'description': 'Virginia 级公开报道的泵喷构型。',
    },
    'UK_PUMPJET_ASTUTE': {
        'display_name': '英制泵喷（Astute 世代）',
        'kind': 'PUMPJET',
        'country_scope': ['UK'],
        'public_label': 'pump-jet propulsor',
        'description': 'Astute 级公开报道的泵喷构型。',
    },
    'RU_PUMPJET_YASEN': {
        'display_name': '俄制泵喷（Yasen 世代）',
        'kind': 'PUMPJET',
        'country_scope': ['Russia'],
        'public_label': 'pump-jet propulsor',
        'description': 'Yasen 级公开报道的泵喷构型。',
    },
    'FR_PUMPJET_SUFFREN': {
        'display_name': '法制泵喷（Suffren 世代）',
        'kind': 'PUMPJET',
        'country_scope': ['France'],
        'public_label': 'pump-jet propulsor',
        'description': 'Suffren / Barracuda 级公开报道的泵喷构型。',
    },
    'FAM_PJ_NEXTGEN': {
        'display_name': '下一代集成推进器（通用）',
        'kind': 'PUMPJET',
        'country_scope': ['GENERIC'],
        'public_label': 'next generation integrated propulsor',
        'description': 'T10 世代表达：无外露轴系的集成式推进器概念。',
    },
    'FAM_SHAFT_DIRECT': {
        'display_name': '直轴',
        'kind': 'SHAFT',
        'country_scope': ['GENERIC'],
        'public_label': 'direct shaft',
        'description': '基础直轴系。',
    },
    'FAM_SHAFT_GEARED': {
        'display_name': '齿轮减速轴系',
        'kind': 'SHAFT',
        'country_scope': ['GENERIC'],
        'public_label': 'geared shaft',
        'description': '带齿轮减速的轴系路线。',
    },
    'RU_SHAFT_FAIRED': {
        'display_name': '长轴包',
        'kind': 'SHAFT',
        'country_scope': ['Russia'],
        'public_label': 'faired shaft',
        'description': '带长整流包覆的轴系，尺寸取自 Typhoon 母版实测。',
    },
    'FAM_THRUSTER_TUNNEL': {
        'display_name': '隧道式侧推',
        'kind': 'THRUSTER',
        'country_scope': ['GENERIC'],
        'public_label': 'tunnel thruster',
        'description': '横向隧道式辅助推进器。',
    },
    'FAM_THRUSTER_RIM': {
        'display_name': '轮缘驱动推进器',
        'kind': 'THRUSTER',
        'country_scope': ['GENERIC'],
        'public_label': 'rim-driven thruster',
        'description': 'T10 世代辅助推进器概念。',
    },
}

# 科技树：五大分支 × T1–T10。propulsor 分支的 T1–T5 名称由用户指定。
PROPULSOR_TIERS = {
    1: ('Early Propeller', '早期少叶螺旋桨', '两叶、几乎无后掠、厚叶型；以可靠性为主，降噪不是设计目标。'),
    2: ('Improved Propeller', '改进型螺旋桨', '桨叶型线与螺距分布改进，开始出现轻微后掠。'),
    3: ('Multi-Blade Propeller', '多叶螺旋桨', '叶片数量增加、单叶载荷下降；注意叶片数不是 Tier 判定标准。'),
    4: ('Skewed Propeller', '后掠螺旋桨', '后掠（skew）成为主要降噪手段，兼顾空泡控制。'),
    5: ('Advanced Quiet Propeller', '先进静音螺旋桨', '高后掠 + 多叶 + 薄叶型的综合设计成熟度。'),
    6: ('Improved Propulsion Plant', '改进型推进装置', '桨型趋于成熟，改进重心转到整机布置与轴系。'),
    7: ('Advanced Integrated Propulsion', '先进综合推进', '推进器与艇尾一体化设计，舵与桨的耦合被纳入外形设计。'),
    8: ('Modern Pump-Jet', '现代泵喷', '导管 + 转子 + 定子的泵喷构型成为主流降噪方案。'),
    9: ('Advanced Pump-Jet', '先进泵喷', '泵喷的壳体一体化与定子优化，外形更紧凑。'),
    10: ('Next Generation Propulsion', '下一代推进', '集成式推进概念：无外露轴系、推进与操纵进一步融合。'),
}

REACTOR_TIERS = {
    1: ('Early Naval Reactor', '早期海军反应堆'),
    2: ('Improved Naval Reactor', '改进型海军反应堆'),
    3: ('Compact Reactor', '紧凑型反应堆'),
    4: ('Advanced Naval Reactor', '先进海军反应堆'),
    5: ('Improved Core-Life Reactor', '长寿命堆芯改进型反应堆'),
    6: ('Modern Naval Reactor', '现代海军反应堆'),
    7: ('Advanced Long-Life Reactor', '先进长寿命反应堆'),
    8: ('Integrated Advanced Reactor', '综合先进反应堆'),
    9: ('Next Generation Reactor', '下一代反应堆'),
    10: ('Future Naval Reactor', '未来海军反应堆'),
}

POWER_CONVERSION_TIERS = {
    1: ('Steam Turbine (Direct)', '蒸汽轮机直驱'),
    2: ('Improved Steam Plant', '改进型蒸汽动力装置'),
    3: ('Geared Steam Turbine', '齿轮减速汽轮机'),
    4: ('Turbo-electric', '涡轮发电传动'),
    5: ('Improved Turbo-electric', '改进型涡轮发电传动'),
    6: ('Electric Drive', '电力推进'),
    7: ('Integrated Electric Drive', '综合电力推进'),
    8: ('Integrated Electric Propulsion', '综合电力推进系统'),
    9: ('Advanced Integrated Electric Propulsion', '先进综合电力推进'),
    10: ('Next Generation Power Conversion', '下一代能量转换'),
}

TRANSMISSION_TIERS = {
    1: ('Direct Shaft', '直轴传动'),
    2: ('Improved Direct Shaft', '改进型直轴'),
    3: ('Geared Shaft', '齿轮减速轴系'),
    4: ('Multi-shaft Geared', '多轴齿轮传动'),
    5: ('Quiet Geared Shaft', '低噪声齿轮轴系'),
    6: ('Electric Drive', '电力传动'),
    7: ('Hybrid / Integrated', '混合/综合传动'),
    8: ('Integrated Electric Drive', '综合电力传动'),
    9: ('Advanced Integrated Transmission', '先进综合传动'),
    10: ('Next Generation Transmission', '下一代传动'),
}

CONTROL_TIERS = {
    1: ('Manual / Mechanical', '机械/手动操纵'),
    2: ('Assisted Mechanical', '助力机械操纵'),
    3: ('Analogue Control', '模拟量控制'),
    4: ('Early Digital Monitoring', '早期数字监控'),
    5: ('Digital Control', '数字控制'),
    6: ('Integrated Digital Control', '综合数字控制'),
    7: ('Automated Propulsion Control', '自动化推进控制'),
    8: ('Integrated Platform Control', '平台综合控制'),
    9: ('Advanced Automation', '先进自动化'),
    10: ('Autonomous Propulsion Control', '自主推进控制'),
}

THRUSTER_TIERS = {
    1: ('None', '无辅助推进'),
    2: ('None', '无辅助推进'),
    3: ('Basic Tunnel Thruster', '基础隧道侧推'),
    4: ('Improved Tunnel Thruster', '改进型隧道侧推'),
    5: ('Quiet Tunnel Thruster', '低噪声隧道侧推'),
    6: ('Tunnel Thruster', '隧道式侧推'),
    7: ('Ducted Auxiliary Thruster', '导管式辅助推进'),
    8: ('Integrated Auxiliary Thruster', '综合辅助推进'),
    9: ('Advanced Auxiliary Thruster', '先进辅助推进'),
    10: ('Rim-Driven Thruster', '轮缘驱动推进器'),
}

# 每个 Tier 在游戏中实际可用的 3D 推进器资产。
PROPULSOR_ASSETS_BY_TIER = {
    1: ['PROP_T01_EARLY'],
    2: ['PROP_T02_IMPROVED'],
    3: ['PROP_T03_MULTIBLADE'],
    4: ['PROP_T04_SKEWED'],
    5: ['PROP_T05_QUIET'],
    6: ['US_PROP_LosAngeles'],
    7: ['RU_PROP_Akula', 'CN_PROP_Type093'],
    8: ['RU_PROP_Typhoon', 'US_PJ_Seawolf'],
    # CN_PJ_Type093B closes the gap the compatibility matrix recorded: public
    # reporting says 093B uses a pump-jet, so the produced asset now backs that
    # claim instead of leaving it as a pending one.
    9: ['US_PJ_Virginia', 'UK_PJ_Astute', 'RU_PJ_Yasen', 'FR_PJ_Suffren', 'CN_PJ_Type093B'],
    10: ['PJ_T10_NEXTGEN', 'THRUSTER_RIM_DRIVEN'],
}

SHAFT_ASSETS_BY_TIER = {
    1: ['SHAFT_PLAIN'],
    2: ['SHAFT_PLAIN'],
    3: ['SHAFT_GEARED'],
    4: ['SHAFT_GEARED'],
    5: ['SHAFT_GEARED'],
    6: ['SHAFT_GEARED'],
    7: ['SHAFT_FAIRING_LONG'],
    8: ['SHAFT_FAIRING_LONG'],
    9: ['SHAFT_FAIRING_LONG'],
    10: [],
}

THRUSTER_ASSETS_BY_TIER = {
    1: [],
    2: [],
    3: ['THRUSTER_TUNNEL'],
    4: ['THRUSTER_TUNNEL'],
    5: ['THRUSTER_TUNNEL'],
    6: ['THRUSTER_TUNNEL'],
    7: ['THRUSTER_TUNNEL'],
    8: ['THRUSTER_TUNNEL'],
    9: ['THRUSTER_TUNNEL'],
    10: ['THRUSTER_RIM_DRIVEN'],
}

# 游戏内计划配发（PLAN，不是事实声明）。按国家 + Tier 选择最接近的 3D 资产。
PLAN_BY_TIER_COUNTRY = {
    (1, '*'): 'PROP_T01_EARLY',
    (2, '*'): 'PROP_T02_IMPROVED',
    (3, '*'): 'PROP_T03_MULTIBLADE',
    (4, '*'): 'PROP_T04_SKEWED',
    (5, '*'): 'PROP_T05_QUIET',
    (6, 'USA'): 'US_PROP_LosAngeles',
    (6, '*'): 'PROP_T05_QUIET',
    (7, 'Russia'): 'RU_PROP_Akula',
    (7, 'China'): 'CN_PROP_Type093',
    (7, '*'): 'PROP_T05_QUIET',
    (8, 'Russia'): 'RU_PROP_Typhoon',
    (8, 'USA'): 'US_PJ_Seawolf',
    (8, '*'): 'US_PJ_Seawolf',
    (9, 'USA'): 'US_PJ_Virginia',
    (9, 'UK'): 'UK_PJ_Astute',
    (9, 'Russia'): 'RU_PJ_Yasen',
    (9, 'France'): 'FR_PJ_Suffren',
    (9, 'China'): 'CN_PROP_Type093',
    (9, 'India'): 'FR_PJ_Suffren',
    (10, 'USA'): 'PJ_T10_NEXTGEN',
    (10, 'Russia'): 'PJ_T10_NEXTGEN',
    (10, 'UK'): 'PJ_T10_NEXTGEN',
    (10, 'France'): 'PJ_T10_NEXTGEN',
    (10, 'China'): 'PJ_T10_NEXTGEN',
    (10, 'India'): 'PJ_T10_NEXTGEN',
}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def asset_directory(root, spec):
    return root / spec['category'] / spec['asset_id']


def load_ue_import_results(root):
    """读取 UE4.27 编辑器导入证据（如果已经跑过）。"""
    report_path = root / 'Validation' / 'UE427_IMPORT_REPORT.json'
    if not report_path.exists():
        return {}
    report = read_json(report_path)
    results = {}
    for entry in report.get('results', []):
        mesh = entry.get('mesh') or {}
        results[entry['asset_id']] = {
            'imported': bool(entry.get('ok')),
            'lod_count': mesh.get('lod_count'),
            'dimensions_cm': mesh.get('bounds_cm', {}).get('size'),
            'convex_collision_count': mesh.get('convex_collision_count'),
            'simple_collision_count': mesh.get('simple_collision_count'),
            'base_source': entry.get('base_source'),
        }
    return results


def discover_asset(root, spec, ue_import_results):
    """读取磁盘上的真实产物，生成清单条目。"""
    asset_id = spec['asset_id']
    directory = asset_directory(root, spec)
    report_path = directory / 'Validation' / f'{asset_id}_BUILD_REPORT.json'
    spec_path = directory / 'Documentation' / f'{asset_id}_SPEC.json'
    report = read_json(report_path) if report_path.exists() else None
    previews = sorted((directory / 'Preview').glob('*.png')) if (directory / 'Preview').exists() else []
    lods = {entry['lod']: entry['triangles'] for entry in report['lods']} if report else {}
    paths = {
        'blend': f"{spec['category']}/{asset_id}/Blend/{asset_id}_MASTER.blend",
        'lod0': f"{spec['category']}/{asset_id}/FBX/{asset_id}_LOD0.fbx",
        'lod1': f"{spec['category']}/{asset_id}/FBX/{asset_id}_LOD1.fbx",
        'lod2': f"{spec['category']}/{asset_id}/FBX/{asset_id}_LOD2.fbx",
        'lod3': f"{spec['category']}/{asset_id}/FBX/{asset_id}_LOD3.fbx",
        'combined': f"{spec['category']}/{asset_id}/FBX/{asset_id}_COMBINED.fbx",
        'collision': f"{spec['category']}/{asset_id}/Collision/{asset_id}_COLLISION.fbx",
        'spec': f"{spec['category']}/{asset_id}/Documentation/{asset_id}_SPEC.json",
        'readme': f"{spec['category']}/{asset_id}/Documentation/{asset_id}_README.md",
        'build_report': f"{spec['category']}/{asset_id}/Validation/{asset_id}_BUILD_REPORT.json",
        'validation': f"{spec['category']}/{asset_id}/Validation/{asset_id}_VALIDATION.json",
        'preview': [
            f"{spec['category']}/{asset_id}/Preview/{path.name}" for path in previews
        ],
    }
    present = all((root / paths[key]).exists() for key in ['blend', 'lod0', 'lod1', 'lod2', 'lod3', 'collision', 'spec', 'readme'])
    return {
        'asset_id': asset_id,
        'display_name': spec['display_name'],
        'category': spec['category'],
        'kind': spec['kind'],
        'family_id': FAMILY_OF_ASSET.get(asset_id, 'FAM_UNASSIGNED'),
        'country': spec.get('country', 'GENERIC'),
        'tier': spec['tier'],
        'era': spec.get('era', 'UNKNOWN'),
        'technology_route': spec.get('technology_route', 'UNKNOWN'),
        'coverage': '3D_ASSET' if present else 'IMPLEMENTING',
        'status': 'VALIDATING' if present else spec.get('status', 'PLANNED'),
        'lods': lods,
        'sockets': [socket['name'] for socket in report['sockets']] if report else [],
        'materials': [material['name'] for material in report['materials']] if report else [],
        'dimensions_m': report['lods'][0]['dimensions_m'] if report else None,
        'paths': paths,
        'validation': '',
        'ue427_import': ue_import_results.get(asset_id),
        'references': spec.get('references', []),
        'limitations': report['limitations'] if report else [],
    }


def load_research(root):
    research_dir = root / 'Documentation' / 'research'
    propulsor = {}
    propulsor_path = research_dir / 'propulsor_research.json'
    if propulsor_path.exists():
        propulsor = read_json(propulsor_path)
    powerplant = {}
    powerplant_path = research_dir / 'powerplant_research.json'
    if powerplant_path.exists():
        powerplant = read_json(powerplant_path)
    return propulsor, powerplant


def build_family_document(manifest_assets):
    families = []
    for family_id, meta in FAMILY_META.items():
        members = [
            asset['asset_id'] for asset in manifest_assets if asset['family_id'] == family_id
        ]
        families.append({
            'family_id': family_id,
            'display_name': meta['display_name'],
            'kind': meta['kind'],
            'country_scope': meta['country_scope'],
            'public_label': meta['public_label'],
            'description': meta['description'],
            'members': members,
            'member_count': len(members),
        })
    return {
        'generated_at': TODAY,
        'schema': 'silent-depth-propulsion-family-v1',
        'note': '家族划分按公开技术路线，只描述外形族系与世代，不定义任何性能参数。',
        'families': families,
    }


def build_technology_tree(propulsor_research, powerplant_research):
    def tier_entry(tier, label_source, branch, description_override=None):
        label, cn = label_source[tier]
        return {
            'tier': tier,
            'public_label': label,
            'display_name_cn': cn,
            'description': description_override or cn,
            'linked_assets': [],
        }

    branches = []

    propulsor_entries = []
    for tier in range(1, 11):
        label, cn, description = PROPULSOR_TIERS[tier]
        propulsor_entries.append({
            'tier': tier,
            'public_label': label,
            'display_name_cn': cn,
            'description': description,
            'linked_assets': PROPULSOR_ASSETS_BY_TIER.get(tier, []),
        })
    branches.append({
        'branch_id': 'BRANCH_PROPULSOR',
        'display_name': '推进器（Propeller / Pump-Jet）',
        'note': 'T1–T5 是桨型世代，T6–T10 是整机与泵喷世代。叶片数量本身不构成 Tier 判定。',
        'tiers': propulsor_entries,
    })

    reactor_entries = [
        {
            'tier': tier,
            'public_label': REACTOR_TIERS[tier][0],
            'display_name_cn': REACTOR_TIERS[tier][1],
            'description': '只定义公开资料层面的世代名称与时代区间；功率、燃料与内部结构一律不进入本资产库。',
            'linked_assets': [],
            'asset_policy': 'DATABASE_ONLY',
        }
        for tier in range(1, 11)
    ]
    branches.append({
        'branch_id': 'BRANCH_REACTOR',
        'display_name': '反应堆（世代）',
        'note': '游戏没有显示需求，因此该分支只建立数据库条目，不产出内部工程模型。',
        'tiers': reactor_entries,
    })

    branches.append({
        'branch_id': 'BRANCH_POWER_CONVERSION',
        'display_name': '能量转换',
        'note': '公开技术路线：蒸汽轮机直驱 → 齿轮减速 → 涡轮发电 → 电力推进 → 综合电力推进。',
        'tiers': [tier_entry(tier, POWER_CONVERSION_TIERS, 'POWER_CONVERSION') for tier in range(1, 11)],
    })
    branches.append({
        'branch_id': 'BRANCH_TRANSMISSION',
        'display_name': '传动',
        'note': '公开技术路线：直轴 → 齿轮轴系 → 电力传动 → 混合/综合传动。',
        'tiers': [
            {
                **tier_entry(tier, TRANSMISSION_TIERS, 'TRANSMISSION'),
                'linked_assets': SHAFT_ASSETS_BY_TIER.get(tier, []),
            }
            for tier in range(1, 11)
        ],
    })
    branches.append({
        'branch_id': 'BRANCH_SHAFT',
        'display_name': '轴系',
        'note': '轴系是传动分支的可视化部分；长轴包尺寸取自 Typhoon 母版实测。',
        'tiers': [
            {
                'tier': tier,
                'public_label': TRANSMISSION_TIERS[tier][0],
                'display_name_cn': TRANSMISSION_TIERS[tier][1],
                'description': TRANSMISSION_TIERS[tier][1],
                'linked_assets': SHAFT_ASSETS_BY_TIER.get(tier, []),
            }
            for tier in range(1, 11)
        ],
    })
    branches.append({
        'branch_id': 'BRANCH_THRUSTER',
        'display_name': '辅助推进',
        'note': '侧推与辅助推进器，用于 T3 以后的机动性表达。',
        'tiers': [
            {
                'tier': tier,
                'public_label': THRUSTER_TIERS[tier][0],
                'display_name_cn': THRUSTER_TIERS[tier][1],
                'description': THRUSTER_TIERS[tier][1],
                'linked_assets': THRUSTER_ASSETS_BY_TIER.get(tier, []),
            }
            for tier in range(1, 11)
        ],
    })
    branches.append({
        'branch_id': 'BRANCH_CONTROL',
        'display_name': '控制',
        'note': '只描述控制架构世代，不涉及任何具体实现参数。',
        'tiers': [tier_entry(tier, CONTROL_TIERS, 'CONTROL') for tier in range(1, 11)],
    })

    return {
        'generated_at': TODAY,
        'schema': 'silent-depth-propulsion-technology-tree-v1',
        'note': '所有 Tier 均为游戏科技层级，不等于历史事实或工程事实。',
        'history_vs_game_tier': '历史服役年份与技术世代只作为 Tier 划分的参考；Tier 是游戏数值与内容组织的层级标签。',
        'branches': branches,
        'powerplant_research_available': bool(powerplant_research),
        'propulsor_research_available': bool(propulsor_research),
    }


def plan_propulsor_for(platform, propulsor_ids):
    tier = platform.get('tier') or 1
    country = platform.get('country', 'GENERIC')
    for key in [(tier, country), (tier, '*')]:
        candidate = PLAN_BY_TIER_COUNTRY.get(key)
        if candidate and candidate in propulsor_ids:
            return candidate
    for fallback_tier in range(min(tier, 10), 0, -1):
        candidate = PLAN_BY_TIER_COUNTRY.get((fallback_tier, '*'))
        if candidate and candidate in propulsor_ids:
            return candidate
    return None


def build_compatibility(root, propulsor_research, propulsor_ids):
    submarine_manifest = read_json(root.parent / 'Manifest' / 'submarine_manifest.json')
    assignments = {
        entry['platform_asset_id']: entry
        for entry in propulsor_research.get('assignments', [])
    }
    research_entries = {
        entry['propulsor_id']: entry for entry in propulsor_research.get('entries', [])
    }

    rows = []
    for platform in submarine_manifest['assets']:
        asset_id = platform['asset_id']
        assignment = assignments.get(asset_id)
        verified = assignment['propulsor_id'] if assignment else None
        status = assignment['status'] if assignment else 'UNKNOWN'
        rationale = assignment.get('rationale') if assignment else '尚无公开资料研究结论，保持 UNKNOWN。'
        entry = research_entries.get(verified) if verified else None
        planned = plan_propulsor_for(platform, propulsor_ids)
        rows.append({
            'platform_asset_id': asset_id,
            'country': platform['country'],
            'type': platform['type'],
            'class': platform['class'],
            'tier': platform.get('tier'),
            'verified_propulsor_id': verified,
            'verified_kind': entry['propulsor_kind'] if entry else 'UNKNOWN',
            'verification_status': status,
            'verification_rationale': rationale,
            'game_plan_propulsor_id': planned,
            'game_plan_note': '游戏内美术配发方案，不是公开事实声明。',
            'confidence': entry['confidence'] if entry else 'UNKNOWN',
        })
    return {
        'generated_at': TODAY,
        'schema': 'silent-depth-submarine-propulsion-compatibility-v1',
        'note': 'verified_* 字段来自公开资料研究；game_plan_* 字段是游戏美术配发计划。两者不得混淆。',
        'status_legend': {
            'CONFIRMED': '公开资料明确可确认',
            'REPORTED': '公开报道支持，但缺少官方确认',
            'UNKNOWN': '公开资料不足，保持 UNKNOWN',
        },
        'entries': rows,
    }


def write_matrix_csv(path, compatibility):
    fieldnames = [
        'platform_asset_id', 'country', 'type', 'class', 'tier',
        'verified_propulsor_id', 'verified_kind', 'verification_status', 'confidence',
        'game_plan_propulsor_id', 'verification_rationale',
    ]
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for entry in compatibility['entries']:
            writer.writerow({key: entry.get(key) for key in fieldnames})


def write_coverage_report(path, manifest, compatibility, technology_tree):
    assets = manifest['assets']
    by_category = {}
    for asset in assets:
        by_category.setdefault(asset['category'], []).append(asset)
    verified = [entry for entry in compatibility['entries'] if entry['verification_status'] in {'CONFIRMED', 'REPORTED'}]
    planned = [entry for entry in compatibility['entries'] if entry['game_plan_propulsor_id']]
    verified_pct = 100.0 * len(verified) / max(len(compatibility['entries']), 1)
    planned_pct = 100.0 * len(planned) / max(len(compatibility['entries']), 1)
    ue_imported = [asset for asset in assets if asset.get('ue427_import', {}) and asset['ue427_import'].get('imported')]

    lines = [
        '# 推进系统覆盖报告（Propulsion Coverage Report）',
        '',
        f'生成日期：{manifest["generated_at"]}',
        '',
        '## 1. 3D 资产覆盖',
        '',
        '| 分类 | 资产数 | 已完成（Blend+FBX+LOD+碰撞+预览） | LOD0 三角面合计 |',
        '| --- | ---: | ---: | ---: |',
    ]
    for category in CATEGORIES:
        entries = by_category.get(category, [])
        complete = [entry for entry in entries if entry['coverage'] == '3D_ASSET']
        triangles = sum(entry['lods'].get(0, 0) for entry in complete)
        lines.append(f'| {category} | {len(entries)} | {len(complete)} | {triangles} |')
    lines += [
        '',
        f'合计：{len(assets)} 个推进器资产，其中 {sum(1 for a in assets if a["coverage"] == "3D_ASSET")} 个已经产出完整 3D 资产集。',
        '',
        '## 2. 科技树覆盖',
        '',
        '| 分支 | Tier 条目数 | 已挂接 3D 资产的 Tier |',
        '| --- | ---: | --- |',
    ]
    for branch in technology_tree['branches']:
        linked = [str(tier['tier']) for tier in branch['tiers'] if tier.get('linked_assets')]
        lines.append(f"| {branch['display_name']} | {len(branch['tiers'])} | {', '.join(linked) if linked else '—'} |")
    lines += [
        '',
        '## 3. 潜艇兼容性覆盖',
        '',
        f'- 平台条目：{len(compatibility["entries"])}',
        f'- 有公开资料结论（CONFIRMED / REPORTED）：{len(verified)}（{verified_pct:.1f}%）',
        f'- 有游戏配发计划：{len(planned)}（{planned_pct:.1f}%）',
        f'- 保持 UNKNOWN：{len(compatibility["entries"]) - len(verified)}',
        '',
        '## 4. 未覆盖与后续工作',
        '',
        '- 反应堆、能量转换、涡轮、齿轮箱、电力推进、控制分支按 `DATABASE_ONLY` 处理，不产出内部工程模型。',
        '- 公开资料结论只覆盖 9 个重点平台；其余平台保持 UNKNOWN，等待公开资料研究。',
        f'- UE4.27 编辑器导入：{len(ue_imported)} / {len(assets)} 个资产已实测导入（静态网格 + 4 级 LOD + 1:1 尺寸）。',
        '- UE4.27 简单碰撞的脚本化挂接未打通，碰撞资产本身通过校验器检查；材质外观、LOD 屏幕尺寸与帧率未测量。',
        '- 因此在材质、碰撞与性能验证完成之前，资产状态保持 VALIDATING。',
    ]
    Path(path).write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()

    specs = read_json(root / 'Manifest' / 'propulsor_specs.json')['specs']
    propulsor_research, powerplant_research = load_research(root)

    ue_import_results = load_ue_import_results(root)
    manifest_assets = [discover_asset(root, spec, ue_import_results) for spec in specs]
    manifest = {
        'generated_at': TODAY,
        'schema': 'silent-depth-propulsion-manifest-v1',
        'root': 'SilentDepth_Assets/Propulsion',
        'template': 'Templates/PROPULSION_ASSET_TEMPLATE.md',
        'note': '推进系统资产清单。只描述技术、资产与外形身份，不含功率/航速/噪声等游戏平衡数据。',
        'counts': {
            'assets': len(manifest_assets),
            'complete_3d': sum(1 for asset in manifest_assets if asset['coverage'] == '3D_ASSET'),
        },
        'assets': manifest_assets,
    }
    write_json(root / 'Manifest' / 'propulsion_manifest.json', manifest)

    family_document = build_family_document(manifest_assets)
    write_json(root / 'Manifest' / 'propulsion_family.json', family_document)

    technology_tree = build_technology_tree(propulsor_research, powerplant_research)
    write_json(root / 'TechnologyTree' / 'propulsion_technology_tree.json', technology_tree)

    compatibility = build_compatibility(
        root, propulsor_research, {asset['asset_id'] for asset in manifest_assets}
    )
    write_json(root / 'Manifest' / 'submarine_propulsion_compatibility.json', compatibility)
    write_matrix_csv(root / 'Manifest' / 'SubmarinePropulsionMatrix.csv', compatibility)
    write_coverage_report(root / 'Documentation' / 'propulsion_coverage_report.md', manifest, compatibility, technology_tree)

    print(json.dumps({
        'assets': manifest['counts'],
        'families': len(family_document['families']),
        'branches': len(technology_tree['branches']),
        'platforms': len(compatibility['entries']),
        'research_available': {
            'propulsor': bool(propulsor_research),
            'powerplant': bool(powerplant_research),
        },
    }, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
