#!/usr/bin/env python3
"""武器数据公共构件：来源表、记录构造器与几何参数字汇。

所有分册（data_torpedoes / data_missiles / data_slbm / data_support）都通过这些
构造器产出记录，保证 weapon_dataset.py 声明的 schema 完全一致。

几何参数只描述公开资料可见的外部轮廓（头部、弹体、控制面、推进段、涂装分带），
由 weapon_factory_blender.py 消费以生成模型；不包含任何内部工程或制造信息。
"""
from __future__ import annotations

from sdw_common import TODAY

# ---------------------------------------------------------------------------
# 公开来源表
# ---------------------------------------------------------------------------
SOURCES = {
    'US_NAVY': {
        'name': 'US Navy Fact File / public ship and submarine references',
        'url': 'https://www.navy.mil/Resources/Fact-Files/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'US_FAS': {
        'name': 'FAS / public torpedo and missile reference pages',
        'url': 'https://nuke.fas.org/guide/usa/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'RU_SHIPS': {
        'name': 'russianships.info public project reference pages',
        'url': 'https://russianships.info/eng/submarines/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'RU_FAS': {
        'name': 'FAS / public Russian submarine weapon reference pages',
        'url': 'https://nuke.fas.org/guide/russia/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'UK_RN': {
        'name': 'Royal Navy public equipment pages',
        'url': 'https://www.royalnavy.mod.uk/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'FR_DEFENSE': {
        'name': 'French Ministry of Armed Forces public equipment pages',
        'url': 'https://www.defense.gouv.fr/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'CN_GS': {
        'name': 'Public open-source summaries of Chinese naval weapons',
        'url': 'https://www.globalsecurity.org/military/world/china/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'IN_DRDO': {
        'name': 'DRDO / Indian Navy public equipment releases',
        'url': 'https://www.drdo.gov.in/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'MBDA': {
        'name': 'MBDA public product pages',
        'url': 'https://www.mbda-systems.com/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'RTX': {
        'name': 'RTX / Raytheon public product pages',
        'url': 'https://www.rtx.com/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'NAVAL_TECH': {
        'name': 'Naval Technology / public naval equipment reference pages',
        'url': 'https://www.naval-technology.com/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
}


# ---------------------------------------------------------------------------
# 几何参数字汇：kind -> 默认参数
# ---------------------------------------------------------------------------
# 允许的取值都写在注释里；工厂只按这些字段建模，因此分册不得引入未知字段。
GEOMETRY_DEFAULTS: dict[str, dict] = {
    'torpedo': {
        'nose': 'ogive',                 # blunt | ogive | hemispherical
        'nose_len_ratio': 2.0,           # 头部长度 / 弹径
        'tail': 'conical',               # conical | blunt | boat_tail
        'tail_len_ratio': 1.2,
        'tail_flare': 0,                 # 0/1 尾段扩张环
        'fin_count': 4,                  # 0/3/4/5/6/8
        'fin_span_ratio': 1.45,          # 翼展 / 弹径
        'fin_chord_ratio': 1.1,          # 翼根弦长 / 弹径
        'fin_sweep_deg': 18.0,
        'propulsor': 'contra_propeller',  # propeller | contra_propeller | pumpjet | none
        'propulsor_shroud': 0,           # 0/1 泵喷整流罩
        'propulsor_cone_ratio': 0.6,
        'wire_dispenser': 0,             # 0/1 导线释放整流罩
        'sonar_windows': 1,              # 0..3 声呐透声窗
        'bands': 2,                      # 涂装分带数量
        'strakes': 0,                    # 弹体纵向导流条数量
        'canister': 0,                   # 0/1 发射运载筒
    },
    'cruise_missile': {
        'nose': 'ogive',                 # ogive | conical | blunt
        'nose_len_ratio': 3.0,
        'body_shape': 'cylinder',        # cylinder | flattened
        'wing_type': 'popout',           # none | fixed | popout | folding
        'wing_pairs': 1,                 # 0..2
        'wing_span_ratio': 3.2,
        'wing_chord_ratio': 1.1,
        'wing_position': 0.45,           # 0..1 弹体位置
        'wing_sweep_deg': 35.0,
        'tail_type': 'x_config',         # none | cruciform | three_fin | x_config
        'tail_count': 4,
        'tail_span_ratio': 2.4,
        'tail_chord_ratio': 0.9,
        'intake_type': 'none',           # none | ventral | chin | four | side
        'intake_position': 0.2,
        'intake_len_ratio': 1.2,
        'booster': 0,                    # 0/1 固体助推段
        'booster_len_ratio': 0.25,
        'booster_fins': 0,
        'dorsal': 0,                     # 0/1 背部整流罩
        'bands': 2,
        'windows': 0,
        'canister': 0,
    },
    'supersonic_missile': {
        'nose': 'conical',
        'nose_len_ratio': 4.0,
        'body_shape': 'cylinder',
        'wing_type': 'fixed',
        'wing_pairs': 1,
        'wing_span_ratio': 2.6,
        'wing_chord_ratio': 1.3,
        'wing_position': 0.55,
        'wing_sweep_deg': 55.0,
        'tail_type': 'cruciform',
        'tail_count': 4,
        'tail_span_ratio': 2.2,
        'tail_chord_ratio': 1.0,
        'intake_type': 'four',
        'intake_position': 0.28,
        'intake_len_ratio': 1.6,
        'booster': 1,
        'booster_len_ratio': 0.22,
        'booster_fins': 4,
        'dorsal': 0,
        'bands': 2,
        'windows': 0,
        'canister': 0,
    },
    'slbm': {
        'nose': 'shroud',                # shroud | ogive
        'nose_len_ratio': 2.2,
        'shroud_shape': 'blunt',         # blunt | hemispherical | pointed
        'stage_rings': 2,                # 级间环数量
        'tail_skirt': 1,                 # 0/1 尾部裙
        'skirt_flare_ratio': 1.25,
        'nozzle': 'single',              # single | four | none
        'nozzle_len_ratio': 0.6,
        'fins': 0,
        'fin_span_ratio': 1.2,
        'fin_chord_ratio': 0.8,
        'cable_trays': 0,
        'base_cover': 1,
        'bands': 2,
        'windows': 0,
        'canister': 0,
    },
    'glide_body': {
        'body_shape': 'wedge',           # wedge | flattened
        'nose': 'blunt',
        'nose_len_ratio': 1.2,
        'fin_count': 2,
        'fin_span_ratio': 2.0,
        'fin_chord_ratio': 1.4,
        'tail_type': 'flaps',            # flaps | none
        'bands': 1,
        'windows': 0,
        'booster': 0,
        'booster_len_ratio': 0.3,
    },
    'mine': {
        'body': 'cylindrical',           # cylindrical | spherical | torpedo_shaped
        'nose': 'hemispherical',         # hemispherical | ogive | blunt
        'nose_len_ratio': 0.6,
        'mooring': 0,                    # 0/1 系留索具
        'mooring_len_ratio': 1.5,
        'canister': 0,
        'horns': 0,                      # 0/8/12 外部触点柱
        'rails': 0,                      # 外部导轨数量
        'fins': 0,
        'fin_span_ratio': 1.2,
        'fin_chord_ratio': 0.7,
        'tail_len_ratio': 0.4,
        'bands': 2,
    },
    'decoy': {
        'body': 'capsule',               # capsule | cylinder | sphere
        'capsule_ratio': 2.2,
        'nose': 'hemispherical',
        'nose_len_ratio': 0.5,
        'rings': 2,                      # 分带环数量
        'dispenser': 0,                  # 0/1 投放器外观
        'fins': 0,
        'fin_span_ratio': 1.2,
        'fin_chord_ratio': 0.6,
        'tail': 'none',                  # none | conical
        'tail_len_ratio': 0.5,
        'bands': 1,
    },
    'shelter': {
        'shape': 'boxy',                 # boxy
        'hatch_rings': 2,
        'corner_radius_ratio': 0.08,
        'runner_rails': 1,
        'bands': 1,
    },
    'sdv': {
        'nose': 'blunt',
        'nose_len_ratio': 1.0,
        'canopy': 1,                     # 0/1 驾驶舱罩
        'propulsor': 'shrouded',         # shrouded | propeller | none
        'propulsor_shroud': 1,
        'fins': 4,
        'fin_span_ratio': 1.3,
        'fin_chord_ratio': 0.8,
        'docking_collar': 1,             # 0/1 对接环
        'bands': 1,
    },
    'rocket_payload': {
        'nose': 'ogive',
        'nose_len_ratio': 1.6,
        'booster_len_ratio': 0.35,
        'booster_fins': 4,
        'booster_fin_span_ratio': 1.4,
        'payload_shape': 'torpedo',      # torpedo | depth_bomb
        'payload_separation_ring': 1,
        'fins': 4,
        'fin_span_ratio': 1.3,
        'fin_chord_ratio': 0.9,
        'bands': 2,
    },
}


def geometry_keys(kind: str) -> tuple[str, ...]:
    return tuple(GEOMETRY_DEFAULTS[kind])


def geo(kind: str, features, **params):
    """构造几何记录；未知 kind 或未知参数立即报错，避免分册写错字段。"""
    if kind not in GEOMETRY_DEFAULTS:
        raise ValueError(f'unknown geometry kind: {kind}')
    unknown = sorted(set(params) - set(GEOMETRY_DEFAULTS[kind]))
    if unknown:
        raise ValueError(f'{kind}: unknown geometry params {unknown}')
    merged = dict(GEOMETRY_DEFAULTS[kind])
    merged.update(params)
    return {'kind': kind, 'features': list(features), 'params': merged}


def dim(length_m, diameter_m, mass_kg, scale_source, scale_note):
    return {
        'length_m': length_m,
        'diameter_m': diameter_m,
        'mass_kg': mass_kg,
        'scale_source': scale_source,
        'scale_note': scale_note,
    }


def variant(
    weapon_id, display_name, short_name, category, role, subrole, era, service_years,
    tier, tier_reason, guidance, propulsion, launch_methods, role_tags, dimensions,
    asset_priority, geometry, confidence, sources, status, notes=None, variant_of=None,
):
    return {
        'weapon_id': weapon_id,
        'display_name': display_name,
        'short_name': short_name,
        'category': category,
        'role': role,
        'subrole': subrole,
        'era': era,
        'service_years': service_years,
        'status': status,
        'tier': tier,
        'tier_reason': tier_reason,
        'guidance': guidance,
        'propulsion': propulsion,
        'launch_methods': launch_methods,
        'role_tags': role_tags,
        'dimensions': dimensions,
        'asset_priority': asset_priority,
        'geometry': geometry,
        'confidence': confidence,
        'sources': sources,
        'variant_of': variant_of or weapon_id,
        'notes': notes or '',
    }


# 允许的服役状态取值（与需求 §56 一致）。
WEAPON_STATUS = ('HISTORICAL', 'RETIRED', 'ACTIVE', 'PROTOTYPE', 'PLANNED', 'GAMEPLAY', 'UNKNOWN')


def family(family_id, country, family_name, primary_category, categories, base_geometry, variants, notes=''):
    return {
        'family_id': family_id,
        'country': country,
        'family_name': family_name,
        'primary_category': primary_category,
        'categories': list(categories),
        'base_geometry': base_geometry,
        'variants': variants,
        'notes': notes,
    }


def merge_sources(*extra):
    """把分册自定义来源合并进公共来源表（同名覆盖）。"""
    SOURCES.update({item['key']: item['value'] for item in extra if 'key' in item})
    return SOURCES
