#!/usr/bin/env python3
"""鱼雷武器分册：Family -> Variant 数据表。

所有字段遵循 weapon_dataset.py 中声明的 schema。这里只记录公开资料中的身份、
类别、时代、外形尺寸与游戏科技树分层；不包含任何武器内部工程或制造信息。
"""
from __future__ import annotations

from sdw_common import TODAY

# 公共开放来源（不针对任何单一型号做精确引用，避免伪造链接）。
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
}


def _variant(
    weapon_id, display_name, short_name, category, role, subrole, era, service_years,
    tier, tier_reason, guidance, propulsion, launch_methods, role_tags, dimensions,
    asset_priority, geometry, confidence, sources, notes=None, variant_of=None,
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
        'status': _TORPEDO_STATUS.get(weapon_id, 'UNKNOWN'),
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


def _dim(length_m, diameter_m, mass_kg, scale_source, scale_note):
    return {
        'length_m': length_m,
        'diameter_m': diameter_m,
        'mass_kg': mass_kg,
        'scale_source': scale_source,
        'scale_note': scale_note,
    }


def _geo(kind, features, **params):
    return {'kind': kind, 'features': features, 'params': params}


# 公开资料可确认的服役状态；未列出的型号保持 UNKNOWN，不做推测。
_TORPEDO_STATUS = {
    'US_TORP_Mk14': 'HISTORICAL',
    'US_TORP_Mk18': 'HISTORICAL',
    'US_TORP_Mk23': 'HISTORICAL',
    'US_TORP_Mk16': 'RETIRED',
    'US_TORP_Mk27': 'RETIRED',
    'US_TORP_Mk37': 'RETIRED',
    'US_TORP_Mk37_Mod2': 'RETIRED',
    'US_TORP_Mk45': 'RETIRED',
    'US_TORP_Mk48': 'RETIRED',
    'US_TORP_Mk48_ADCAP': 'ACTIVE',
    'US_TORP_Mk48_Mod6': 'ACTIVE',
    'US_TORP_Mk48_Mod7': 'ACTIVE',
    'RU_TORP_SET53': 'RETIRED',
    'RU_TORP_SET65': 'RETIRED',
    'RU_TORP_SAET60': 'RETIRED',
    'RU_TORP_USET80': 'ACTIVE',
    'RU_TORP_USET80K': 'ACTIVE',
    'RU_TORP_TEST71': 'RETIRED',
    'RU_TORP_TEST71M': 'RETIRED',
    'RU_TORP_TEST96': 'ACTIVE',
    'RU_TORP_UGST': 'ACTIVE',
    'RU_TORP_UGST_M': 'ACTIVE',
    'RU_TORP_5365': 'ACTIVE',
    'RU_TORP_5365K': 'ACTIVE',
    'RU_TORP_5365M': 'ACTIVE',
    'RU_TORP_6576': 'RETIRED',
    'RU_TORP_6576A': 'RETIRED',
    'RU_TORP_Shkval': 'RETIRED',
    'RU_TORP_Fizik': 'ACTIVE',
    'UK_TORP_Mk8': 'HISTORICAL',
    'UK_TORP_Tigerfish': 'RETIRED',
    'UK_TORP_Tigerfish_Mod1': 'RETIRED',
    'UK_TORP_Spearfish': 'ACTIVE',
    'UK_TORP_Spearfish_Mod1': 'ACTIVE',
    'UK_TORP_StingRay': 'ACTIVE',
    'FR_TORP_L5': 'RETIRED',
    'FR_TORP_L5_Mod3': 'RETIRED',
    'FR_TORP_L5_Mod4': 'RETIRED',
    'FR_TORP_F17': 'RETIRED',
    'FR_TORP_F21': 'ACTIVE',
    'CN_TORP_Yu1': 'RETIRED',
    'CN_TORP_Yu3': 'RETIRED',
    'CN_TORP_Yu4': 'RETIRED',
    'CN_TORP_Yu5': 'ACTIVE',
    'CN_TORP_Yu6': 'ACTIVE',
    'CN_TORP_Yu7': 'ACTIVE',
    'IN_TORP_Varunastra': 'ACTIVE',
    'IN_TORP_TAL': 'ACTIVE',
}


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


# ---------------------------------------------------------------------------
# 通用参数：鱼雷外形剖面（几何工厂消费）
# ---------------------------------------------------------------------------
def _t(params=None, features=(), **overrides):
    """构造鱼雷几何参数；变体只覆盖与基础型不同的可见特征。"""
    base = {
        'nose': 'ogive',
        'nose_len_ratio': 2.0,
        'tail': 'conical',
        'tail_len_ratio': 1.2,
        'fin_count': 4,
        'fin_span_ratio': 1.45,
        'fin_chord_ratio': 1.1,
        'propulsor': 'contra_propeller',
        'wire_dispenser': 0,
        'sonar_windows': 1,
        'bands': 2,
    }
    if params:
        base.update(params)
    base.update(overrides)
    return _geo('torpedo', list(features), **base)


TORPEDO_FAMILIES = [
    # =======================================================================
    # 美国
    # =======================================================================
    family(
        'US_TORP_Mk14', 'USA', 'Mk 14 / Mk 18 / Mk 23', 'TORP', ['TORP'], 'us_torp_mk14',
        [
            _variant(
                'US_TORP_Mk14', 'Mk 14 torpedo', 'Mk14', 'TORP',
                '早期重型蒸汽鱼雷', 'Early_Heavyweight', 'Early', '1940-1960s',
                1,
                '游戏 T1 早期基础鱼雷：无制导、外形简单，作为鱼雷科技树的起点节点。',
                '陀螺仪直线航行', '蒸汽推进', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(6.25, 0.533, 1360, 'PUBLIC_REFERENCE', '公开资料常见数据，保留为整数级近似。'),
                'MEDIUM',
                _t(features=['wwii_blunt_tail', 'straight_running'], nose='blunt', nose_len_ratio=1.2,
                   propulsor='propeller', sonar_windows=0, bands=1),
                'PUBLIC', [SOURCES['US_NAVY'], SOURCES['US_FAS']],
            ),
            _variant(
                'US_TORP_Mk18', 'Mk 18 torpedo', 'Mk18', 'TORP',
                '早期电动鱼雷', 'Early_Heavyweight', 'Early', '1943-1950s',
                1,
                '游戏 T1 电动鱼雷分支：与 Mk 14 同代但尾段更短、无蒸汽痕迹。',
                '陀螺仪直线航行', '电池电动', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(6.20, 0.533, 1350, 'ESTIMATED', '电动型尺寸与 Mk 14 同级别，取公开近似值。'),
                'LOW',
                _t(features=['electric', 'straight_running'], nose='blunt', nose_len_ratio=1.15,
                   propulsor='propeller', sonar_windows=0, bands=1),
                'PUBLIC', [SOURCES['US_NAVY']],
            ),
            _variant(
                'US_TORP_Mk23', 'Mk 23 torpedo', 'Mk23', 'TORP',
                '早期无航迹鱼雷', 'Early_Heavyweight', 'Early', '1944-1946',
                1,
                '游戏 T1 末段型号：与 Mk 14 共享弹体，尾段与装订标记不同。',
                '陀螺仪直线航行', '蒸汽推进（无航迹）', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(6.25, 0.533, 1360, 'ESTIMATED', 'Mk 14 弹体的改型，尺寸沿用公开近似。'),
                'LOW',
                _t(features=['wakeless', 'straight_running'], nose='blunt', nose_len_ratio=1.2,
                   propulsor='propeller', sonar_windows=0, bands=1),
                'PUBLIC', [SOURCES['US_NAVY']],
            ),
        ],
        notes='美国二战潜艇主力鱼雷家族，作为鱼雷树 T1 起点。',
    ),
    family(
        'US_TORP_Mk16', 'USA', 'Mk 16', 'TORP', ['TORP'], 'us_torp_mk16',
        [
            _variant(
                'US_TORP_Mk16', 'Mk 16 torpedo', 'Mk16', 'TORP',
                '战后高速蒸汽鱼雷', 'Early_Heavyweight', 'Cold War', '1950s-1970s',
                2,
                '游戏 T2 过渡型号：从无制导向早期成熟重型鱼雷过渡的节点。',
                '陀螺仪直线航行', '蒸汽推进', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(6.25, 0.533, 1600, 'ESTIMATED', '公开资料尺寸与 Mk 14 同级，取近似值。'),
                'LOW',
                _t(features=['high_speed_steam'], nose='ogive', nose_len_ratio=1.7, bands=1),
                'PUBLIC', [SOURCES['US_FAS']],
            ),
        ],
    ),
    family(
        'US_TORP_Mk27', 'USA', 'Mk 27', 'TORP', ['TORP'], 'us_torp_mk27',
        [
            _variant(
                'US_TORP_Mk27', 'Mk 27 Mod 4 torpedo', 'Mk27', 'TORP',
                '早期声自导鱼雷', 'Acoustic_Homing', 'Early', '1944-1945',
                2,
                '游戏 T2 首个声自导节点：小批量应急型号，外形短粗、尾鳍布局独特。',
                '被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(3.24, 0.533, 1170, 'PUBLIC_REFERENCE', '短弹体，公开资料长度约 3.2 米。'),
                'LOW',
                _t(features=['acoustic_homing', 'short_body'], nose='blunt', nose_len_ratio=1.0,
                   tail_len_ratio=0.6, fin_span_ratio=1.8, propulsor='propeller', bands=1),
                'PUBLIC', [SOURCES['US_FAS']],
            ),
        ],
    ),
    family(
        'US_TORP_Mk37', 'USA', 'Mk 37', 'TORP', ['TORP'], 'us_torp_mk37',
        [
            _variant(
                'US_TORP_Mk37', 'Mk 37 Mod 0 torpedo', 'Mk37', 'TORP',
                '冷战早期反潜鱼雷', 'Acoustic_Homing', 'Cold War', '1956-1970s',
                3,
                '游戏 T3 早期成熟鱼雷：首个批量装备核潜艇的电动反潜鱼雷。',
                '被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(4.83, 0.483, 635, 'PUBLIC_REFERENCE', '公开资料口径 48 厘米级。'),
                'HIGH',
                _t(features=['small_diameter', 'acoustic_homing'], nose='ogive', nose_len_ratio=1.8,
                   fin_span_ratio=1.7, bands=1),
                'PUBLIC', [SOURCES['US_FAS'], SOURCES['US_NAVY']],
            ),
            _variant(
                'US_TORP_Mk37_Mod2', 'Mk 37 Mod 2 torpedo', 'Mk37-2', 'TORP',
                '线导反潜鱼雷', 'Wire_Guided', 'Cold War', '1960s-1970s',
                4,
                '游戏 T4 线导节点：外形在 Mk 37 基础上增加导线释放整流罩。',
                '线导 + 被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(4.83, 0.483, 660, 'ESTIMATED', 'Mod 2 尺寸沿用基础型公开近似。'),
                'MEDIUM',
                _t(features=['small_diameter', 'wire_dispenser'], nose='ogive', nose_len_ratio=1.8,
                   fin_span_ratio=1.7, wire_dispenser=1, bands=1),
                'PUBLIC', [SOURCES['US_FAS']],
            ),
        ],
        notes='Mk 37 是冷战早期美国核潜艇最典型的电动反潜鱼雷。',
    ),
    family(
        'US_TORP_Mk45', 'USA', 'Mk 45 ASTOR', 'TORP', ['TORP'], 'us_torp_mk45',
        [
            _variant(
                'US_TORP_Mk45', 'Mk 45 ASTOR torpedo', 'Mk45', 'TORP',
                '核装药反潜鱼雷', 'Heavyweight', 'Cold War', '1963-1976',
                5,
                '游戏 T5 特种反潜节点：与常规重型鱼雷外形接近，弹体更长、尾部更方。',
                '线导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine', 'special_payload'],
                _dim(5.8, 0.483, 1050, 'PUBLIC_REFERENCE',
                     'Mk 45 ASTOR 公开资料为 19 英寸（483 毫米）弹径，长度约 5.8 米。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'square_stern'], nose='ogive', nose_len_ratio=2.1,
                   tail='square', wire_dispenser=1, sonar_windows=0, bands=2),
                'PUBLIC', [SOURCES['US_FAS']],
                notes='仅作为游戏科技树中的历史反潜节点，不涉及任何载荷工程细节。',
            ),
        ],
    ),
    family(
        'US_TORP_Mk48', 'USA', 'Mk 48', 'TORP', ['TORP'], 'us_torp_mk48',
        [
            _variant(
                'US_TORP_Mk48', 'Mk 48 Mod 1 torpedo', 'Mk48-1', 'TORP',
                '重型线导鱼雷', 'Modern_Heavyweight', 'Cold War Late', '1972-1990s',
                6,
                '游戏 T6 现代重型鱼雷起点：取代 Mk 37 的深潜高速型号。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.79, 0.533, 1582, 'PUBLIC_REFERENCE', '公开资料 533 毫米口径标准重型鱼雷尺寸。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'contra_propeller'], nose='ogive', nose_len_ratio=2.1,
                   wire_dispenser=1, fin_span_ratio=1.5, bands=3),
                'PUBLIC', [SOURCES['US_NAVY'], SOURCES['US_FAS']],
            ),
            _variant(
                'US_TORP_Mk48_ADCAP', 'Mk 48 Mod 4 ADCAP', 'Mk48-ADCAP', 'TORP',
                '远程重型鱼雷', 'Modern_Heavyweight', 'Cold War Late', '1988-2000s',
                7,
                '游戏 T7 成熟现代鱼雷：增加推进段与更长的尾段控制面。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.79, 0.533, 1676, 'PUBLIC_REFERENCE', 'ADCAP 公开质量约 1.6 吨级。'),
                'HIGH',
                _t(features=['wire_dispenser', 'contra_propeller', 'extended_propulsion'],
                   nose='ogive', nose_len_ratio=2.1, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['US_NAVY'], SOURCES['US_FAS']],
            ),
            _variant(
                'US_TORP_Mk48_Mod6', 'Mk 48 Mod 6 CBASS', 'Mk48-6', 'TORP',
                '现代重型鱼雷', 'Modern_Heavyweight', 'Modern', '2000s-present',
                8,
                '游戏 T8 现代先进鱼雷：与 Mod 4 共享弹体，弹带与声学窗口数据不同。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.79, 0.533, 1676, 'PUBLIC_REFERENCE', '与 ADCAP 同级尺寸。'),
                'HIGH',
                _t(features=['wire_dispenser', 'contra_propeller', 'wide_band_sonar'],
                   nose='ogive', nose_len_ratio=2.1, wire_dispenser=1, sonar_windows=2, bands=4),
                'PUBLIC', [SOURCES['US_NAVY']],
            ),
            _variant(
                'US_TORP_Mk48_Mod7', 'Mk 48 Mod 7 CBASS', 'Mk48-7', 'TORP',
                '现代先进重型鱼雷', 'Modern_Heavyweight', 'Modern', '2010s-present',
                8,
                '游戏 T8 顶级重型鱼雷：Mod 6 的继续改进型，可见特征一致。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.79, 0.533, 1676, 'PUBLIC_REFERENCE', '与 Mod 6 同级尺寸。'),
                'HIGH',
                _t(features=['wire_dispenser', 'contra_propeller', 'wide_band_sonar'],
                   nose='ogive', nose_len_ratio=2.1, wire_dispenser=1, sonar_windows=2, bands=4),
                'PUBLIC', [SOURCES['US_NAVY']],
                notes='与 Mod 6 共享基础几何，仅数据与标记层不同。',
            ),
        ],
        notes='Mk 48 家族是游戏中最主要的美国潜艇鱼雷分支，多个 Block/Mod 共享基础几何。',
    ),

    # =======================================================================
    # 俄罗斯 / 苏联
    # =======================================================================
    family(
        'RU_TORP_SET53', 'Russia', 'SET-53 / SET-65 / SAET-60', 'TORP', ['TORP'], 'ru_torp_set53',
        [
            _variant(
                'RU_TORP_SET53', 'SET-53 torpedo', 'SET-53', 'TORP',
                '早期电动反潜鱼雷', 'Acoustic_Homing', 'Cold War', '1950s-1960s',
                3,
                '游戏 T3 苏联早期电动鱼雷：噪声低、外形圆钝。',
                '被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(7.0, 0.533, 1400, 'ESTIMATED', '公开资料只给出级别尺寸，取近似值。'),
                'MEDIUM',
                _t(features=['electric', 'round_nose'], nose='blunt', nose_len_ratio=1.1, bands=1),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_SET65', 'SET-65 torpedo', 'SET-65', 'TORP',
                '电动声自导鱼雷', 'Acoustic_Homing', 'Cold War', '1960s-1980s',
                4,
                '游戏 T4 成熟电动鱼雷：与 SET-53 共享弹体，声学窗口增加。',
                '主动/被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(7.0, 0.533, 1400, 'ESTIMATED', '沿用同族尺寸近似。'),
                'MEDIUM',
                _t(features=['electric', 'active_homing'], nose='blunt', nose_len_ratio=1.15,
                   sonar_windows=2, bands=2),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
            _variant(
                'RU_TORP_SAET60', 'SAET-60 torpedo', 'SAET-60', 'TORP',
                '高速电动鱼雷', 'Acoustic_Homing', 'Cold War', '1960s-1970s',
                4,
                '游戏 T4 高速分支：更长的尾段与推进整流罩。',
                '声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine', 'anti_ship'],
                _dim(7.0, 0.533, 1500, 'ESTIMATED', '公开资料为级别近似。'),
                'LOW',
                _t(features=['electric', 'high_speed'], nose='ogive', nose_len_ratio=1.5, bands=2),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_USET80', 'Russia', 'USET-80', 'TORP', ['TORP'], 'ru_torp_uset80',
        [
            _variant(
                'RU_TORP_USET80', 'USET-80 torpedo', 'USET-80', 'TORP',
                '通用电动鱼雷', 'Modern_Heavyweight', 'Cold War Late', '1980s-present',
                6,
                '游戏 T6 通用鱼雷：兼顾反潜与反舰的电动重型鱼雷。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.2, 0.533, 1800, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['electric', 'wire_dispenser'], nose='ogive', nose_len_ratio=1.9,
                   wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_USET80K', 'USET-80K torpedo', 'USET-80K', 'TORP',
                '通用电动鱼雷改进型', 'Modern_Heavyweight', 'Modern', '1990s-present',
                7,
                '游戏 T7 改进型：与基础型共享几何，控制段与标记不同。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.2, 0.533, 1800, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM',
                _t(features=['electric', 'wire_dispenser', 'improved_control'], nose='ogive',
                   nose_len_ratio=1.9, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_TEST71', 'Russia', 'TEST-71 / TEST-96', 'TORP', ['TORP'], 'ru_torp_test71',
        [
            _variant(
                'RU_TORP_TEST71', 'TEST-71 torpedo', 'TEST-71', 'TORP',
                '线导反潜鱼雷', 'Wire_Guided', 'Cold War', '1970s-1990s',
                6,
                '游戏 T6 苏联线导代表型号：细长弹体 + 明显导线整流罩。',
                '线导 + 主动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(8.0, 0.533, 1820, 'ESTIMATED', '公开资料为级别近似，长度约 8 米级。'),
                'HIGH',
                _t(features=['wire_dispenser', 'long_body'], nose='ogive', nose_len_ratio=1.9,
                   tail_len_ratio=1.4, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_TEST71M', 'TEST-71M torpedo', 'TEST-71M', 'TORP',
                '线导反潜鱼雷改进型', 'Wire_Guided', 'Cold War Late', '1980s-1990s',
                7,
                '游戏 T7 改进型：同族几何，控制段与声学窗口不同。',
                '线导 + 主动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(8.0, 0.533, 1820, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'long_body', 'improved_control'], nose='ogive',
                   nose_len_ratio=1.9, tail_len_ratio=1.4, wire_dispenser=1, sonar_windows=2, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
            _variant(
                'RU_TORP_TEST96', 'TEST-96 torpedo', 'TEST-96', 'TORP',
                '深水线导鱼雷', 'Modern_Heavyweight', 'Modern', '1990s-present',
                8,
                '游戏 T8 现代俄罗斯鱼雷：TEST 系列的现代化终点。',
                '线导 + 主动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine', 'anti_ship'],
                _dim(8.0, 0.533, 1900, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'long_body', 'deep_water'], nose='ogive',
                   nose_len_ratio=1.9, tail_len_ratio=1.4, wire_dispenser=1, sonar_windows=2, bands=4),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_UGST', 'Russia', 'UGST', 'TORP', ['TORP'], 'ru_torp_ugst',
        [
            _variant(
                'RU_TORP_UGST', 'UGST torpedo', 'UGST', 'TORP',
                '现代热动力重型鱼雷', 'Modern_Heavyweight', 'Modern', '1990s-present',
                7,
                '游戏 T7 俄罗斯现代重型鱼雷：热动力推进、外形与电动族明显不同。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.0, 0.533, 1800, 'ESTIMATED', '公开资料为级别近似，长度约 6 米级。'),
                'HIGH',
                _t(features=['wire_dispenser', 'contra_propeller', 'thermal'], nose='ogive',
                   nose_len_ratio=2.0, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_UGST_M', 'UGST-M torpedo', 'UGST-M', 'TORP',
                '现代热动力重型鱼雷改进型', 'Modern_Heavyweight', 'Modern', '2000s-present',
                8,
                '游戏 T8 改进型：延长推进段，尾控制面重新设计。',
                '线导 + 主动声自导', '热动力活塞发动机', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.3, 0.533, 1900, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH',
                _t(features=['wire_dispenser', 'contra_propeller', 'extended_propulsion'],
                   nose='ogive', nose_len_ratio=2.0, wire_dispenser=1, bands=4),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_5365', 'Russia', '53-65', 'TORP', ['TORP'], 'ru_torp_5365',
        [
            _variant(
                'RU_TORP_5365K', '53-65K torpedo', '53-65K', 'TORP',
                '尾流自导反舰鱼雷', 'Heavyweight', 'Cold War', '1960s-1990s',
                5,
                '游戏 T5 反舰专用节点：尾流自导、弹体修长、无导线整流罩。',
                '尾流自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(7.0, 0.533, 2000, 'PUBLIC_REFERENCE', '公开资料长度约 7 米。'),
                'HIGH',
                _t(features=['wake_homing', 'long_body'], nose='ogive', nose_len_ratio=2.2,
                   tail_len_ratio=1.3, bands=2),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_5365M', '53-65M torpedo', '53-65M', 'TORP',
                '尾流自导反舰鱼雷改进型', 'Heavyweight', 'Cold War Late', '1970s-1990s',
                6,
                '游戏 T6 改进型：同族几何，尾段与识别标记不同。',
                '尾流自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(7.0, 0.533, 2000, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM',
                _t(features=['wake_homing', 'long_body'], nose='ogive', nose_len_ratio=2.2,
                   tail_len_ratio=1.35, bands=3),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_6576', 'Russia', '65-76 Kit', 'TORP', ['TORP'], 'ru_torp_6576',
        [
            _variant(
                'RU_TORP_6576', '65-76 Kit torpedo', '65-76', 'TORP',
                '650 毫米重型远程鱼雷', 'Heavyweight', 'Cold War', '1970s-1990s',
                6,
                '游戏 T6 大口径分支：650 毫米口径，仅适配具大口径发射管的平台。',
                '线导 + 尾流/声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(11.0, 0.65, 4500, 'PUBLIC_REFERENCE', '公开资料 650 毫米口径重型鱼雷。'),
                'HIGH',
                _t(features=['large_diameter', 'very_long_body', 'wire_dispenser'], nose='ogive',
                   nose_len_ratio=2.0, tail_len_ratio=1.6, fin_span_ratio=1.35, wire_dispenser=1, bands=4),
                'PUBLIC', [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
            ),
            _variant(
                'RU_TORP_6576A', '65-76A torpedo', '65-76A', 'TORP',
                '650 毫米重型鱼雷改进型', 'Heavyweight', 'Modern', '1990s-2000s',
                7,
                '游戏 T7 改进型：同族几何，尾部与导线系统不同。',
                '线导 + 尾流/声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(11.0, 0.65, 4500, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM',
                _t(features=['large_diameter', 'very_long_body', 'wire_dispenser'], nose='ogive',
                   nose_len_ratio=2.0, tail_len_ratio=1.6, fin_span_ratio=1.35, wire_dispenser=1, bands=4),
                'PUBLIC', [SOURCES['RU_SHIPS']],
            ),
        ],
    ),
    family(
        'RU_TORP_Shkval', 'Russia', 'VA-111 Shkval', 'TORP', ['TORP'], 'ru_torp_shkval',
        [
            _variant(
                'RU_TORP_Shkval', 'VA-111 Shkval', 'Shkval', 'TORP',
                '超空泡火箭鱼雷', 'Future', 'Cold War Late', '1970s-present (limited)',
                7,
                '游戏 T7 特殊高速节点：无常规尾鳍、头部空泡发生器，视觉差异极大。',
                '直线航行', '火箭推进', ['TORPEDO_TUBE'], ['anti_ship', 'fast_attack'],
                _dim(8.2, 0.533, 2700, 'PUBLIC_REFERENCE', '公开资料长度约 8 米。'),
                'HIGH',
                _t(features=['supercavitating', 'rocket_nozzle', 'cavitator'], nose='cavitator',
                   nose_len_ratio=0.9, tail_len_ratio=0.9, fin_count=0, fin_span_ratio=1.0,
                   propulsor='rocket_nozzle', sonar_windows=0, bands=2),
                'PUBLIC', [SOURCES['RU_FAS']],
            ),
        ],
        notes='视觉上最独特的俄罗斯鱼雷，用于游戏科技树的高速分支。',
    ),
    family(
        'RU_TORP_Fizik', 'Russia', 'Fizik', 'TORP', ['TORP'], 'ru_torp_fizik',
        [
            _variant(
                'RU_TORP_Fizik', 'Fizik torpedo', 'Fizik', 'TORP',
                '新一代深水高速鱼雷', 'Future', 'Modern', '2010s-present',
                9,
                '游戏 T9 新一代节点：公开资料有限，几何按可确认外形特征建模。',
                '线导 + 声自导', '热动力', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(6.5, 0.533, 2000, 'ESTIMATED', '公开资料不足，尺寸为级别估计。'),
                'LOW',
                _t(features=['deep_water', 'high_speed', 'wire_dispenser'], nose='ogive',
                   nose_len_ratio=2.2, wire_dispenser=1, bands=3),
                'ESTIMATED', [SOURCES['RU_SHIPS']],
                notes='公开资料有限，标记为 ESTIMATED，建模前需补充参考。',
            ),
        ],
    ),

    # =======================================================================
    # 英国
    # =======================================================================
    family(
        'UK_TORP_Mk8', 'UK', 'Mk 8', 'TORP', ['TORP'], 'uk_torp_mk8',
        [
            _variant(
                'UK_TORP_Mk8', 'Mk 8 Mod 4 torpedo', 'Mk8', 'TORP',
                '早期蒸汽鱼雷', 'Early_Heavyweight', 'Cold War', '1950s-1980s',
                2,
                '游戏 T2 英国早期节点：服役期极长，覆盖第一代核潜艇。',
                '陀螺仪直线航行', '蒸汽推进', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(6.5, 0.533, 1600, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['wwii_blunt_tail', 'straight_running'], nose='ogive', nose_len_ratio=1.4,
                   propulsor='propeller', sonar_windows=0, bands=1),
                'PUBLIC', [SOURCES['UK_RN']],
            ),
        ],
    ),
    family(
        'UK_TORP_Tigerfish', 'UK', 'Tigerfish', 'TORP', ['TORP'], 'uk_torp_tigerfish',
        [
            _variant(
                'UK_TORP_Tigerfish', 'Tigerfish Mod 0', 'Tigerfish', 'TORP',
                '线导反潜/反舰鱼雷', 'Wire_Guided', 'Cold War Late', '1979-1990s',
                6,
                '游戏 T6 英国线导节点：电动推进、外形细长。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.5, 0.533, 1550, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'electric'], nose='ogive', nose_len_ratio=1.9,
                   wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['UK_RN']],
            ),
            _variant(
                'UK_TORP_Tigerfish_Mod1', 'Tigerfish Mod 1', 'Tigerfish-1', 'TORP',
                '线导鱼雷改进型', 'Wire_Guided', 'Cold War Late', '1980s-1990s',
                6,
                '游戏 T6 同族改进型：几何一致，控制段数据不同。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.5, 0.533, 1550, 'ESTIMATED', '沿用同族近似。'),
                'LOW',
                _t(features=['wire_dispenser', 'electric', 'improved_control'], nose='ogive',
                   nose_len_ratio=1.9, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['UK_RN']],
            ),
        ],
    ),
    family(
        'UK_TORP_Spearfish', 'UK', 'Spearfish', 'TORP', ['TORP'], 'uk_torp_spearfish',
        [
            _variant(
                'UK_TORP_Spearfish', 'Spearfish Mod 0', 'Spearfish', 'TORP',
                '深水重型鱼雷', 'Modern_Heavyweight', 'Modern', '1994-present',
                8,
                '游戏 T8 英国顶级鱼雷：泵喷推进、钝圆尾部，与 Mk 48 外形明显不同。',
                '线导 + 主动声自导', '热动力涡轮泵喷', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.0, 0.533, 1850, 'PUBLIC_REFERENCE', '公开资料长度约 7 米。'),
                'HIGH',
                _t(features=['pumpjet', 'wire_dispenser', 'deep_water'], nose='ogive',
                   nose_len_ratio=1.9, tail_len_ratio=1.0, fin_span_ratio=1.35,
                   propulsor='pumpjet', wire_dispenser=1, sonar_windows=2, bands=4),
                'PUBLIC', [SOURCES['UK_RN']],
            ),
            _variant(
                'UK_TORP_Spearfish_Mod1', 'Spearfish Mod 1', 'Spearfish-1', 'TORP',
                '深水重型鱼雷升级型', 'Modern_Heavyweight', 'Modern', '2020s-present',
                9,
                '游戏 T9 升级型：与 Mod 0 共享弹体，尾部与声学组件重做。',
                '线导 + 主动声自导', '热动力涡轮泵喷', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.0, 0.533, 1850, 'PUBLIC_REFERENCE', '与 Mod 0 同级尺寸。'),
                'HIGH',
                _t(features=['pumpjet', 'wire_dispenser', 'deep_water', 'modern_sonar'],
                   nose='ogive', nose_len_ratio=1.9, tail_len_ratio=1.0, fin_span_ratio=1.35,
                   propulsor='pumpjet', wire_dispenser=1, sonar_windows=3, bands=4),
                'PUBLIC', [SOURCES['UK_RN']],
            ),
        ],
    ),
    family(
        'UK_TORP_StingRay', 'UK', 'Sting Ray', 'TORP', ['TORP'], 'uk_torp_stingray',
        [
            _variant(
                'UK_TORP_StingRay', 'Sting Ray Mod 1', 'StingRay', 'TORP',
                '轻型反潜鱼雷', 'Lightweight', 'Modern', '1980s-present',
                7,
                '游戏 T7 轻型分支：324 毫米级小弹体，是鱼雷树中的尺寸对照节点。',
                '主动声自导', '电池电动（泵喷）', ['TORPEDO_TUBE', 'AIR_LAUNCH', 'SURFACE_LAUNCH'],
                ['anti_submarine'],
                _dim(2.6, 0.324, 267, 'PUBLIC_REFERENCE', '公开资料为 324 毫米轻型鱼雷。'),
                'LOW',
                _t(features=['lightweight', 'pumpjet'], nose='blunt', nose_len_ratio=1.0,
                   tail_len_ratio=0.8, fin_span_ratio=1.6, propulsor='pumpjet',
                   sonar_windows=2, bands=2),
                'PUBLIC', [SOURCES['UK_RN']],
                notes='公开资料显示主要由反潜机与水面舰使用；潜艇发射兼容性标记为 GAMEPLAY。',
            ),
        ],
    ),

    # =======================================================================
    # 法国
    # =======================================================================
    family(
        'FR_TORP_L5', 'France', 'L5', 'TORP', ['TORP'], 'fr_torp_l5',
        [
            _variant(
                'FR_TORP_L5_Mod3', 'L5 Mod 3 torpedo', 'L5-3', 'TORP',
                '电动线导鱼雷', 'Wire_Guided', 'Cold War', '1970s-1990s',
                5,
                '游戏 T5 法国早期线导节点：细长电动鱼雷。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.2, 0.533, 1150, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['wire_dispenser', 'electric'], nose='ogive', nose_len_ratio=1.9,
                   wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['FR_DEFENSE']],
            ),
            _variant(
                'FR_TORP_L5_Mod4', 'L5 Mod 4 torpedo', 'L5-4', 'TORP',
                '电动线导鱼雷改进型', 'Wire_Guided', 'Cold War Late', '1980s-1990s',
                6,
                '游戏 T6 改进型：同族几何，控制与声学组件不同。',
                '线导 + 声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.2, 0.533, 1150, 'ESTIMATED', '沿用同族近似。'),
                'LOW',
                _t(features=['wire_dispenser', 'electric', 'improved_control'], nose='ogive',
                   nose_len_ratio=1.9, wire_dispenser=1, sonar_windows=2, bands=3),
                'PUBLIC', [SOURCES['FR_DEFENSE']],
            ),
        ],
    ),
    family(
        'FR_TORP_F17', 'France', 'F17', 'TORP', ['TORP'], 'fr_torp_f17',
        [
            _variant(
                'FR_TORP_F17', 'F17 Mod 2 torpedo', 'F17-2', 'TORP',
                '热动力重型鱼雷', 'Modern_Heavyweight', 'Cold War Late', '1980s-present',
                6,
                '游戏 T6 法国主力鱼雷：热动力推进，外形与 L5 明显不同。',
                '线导 + 声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(5.4, 0.533, 1410, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH',
                _t(features=['wire_dispenser', 'thermal', 'contra_propeller'], nose='ogive',
                   nose_len_ratio=2.0, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['FR_DEFENSE']],
            ),
        ],
    ),
    family(
        'FR_TORP_F21', 'France', 'F21', 'TORP', ['TORP'], 'fr_torp_f21',
        [
            _variant(
                'FR_TORP_F21', 'F21 Artemis torpedo', 'F21', 'TORP',
                '现代重型鱼雷', 'Modern_Heavyweight', 'Modern', '2019-present',
                9,
                '游戏 T9 法国顶级鱼雷：泵喷 + 光纤线导，尾部结构独特。',
                '光纤线导 + 主动声自导', '热动力涡轮泵喷', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.0, 0.533, 1550, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH',
                _t(features=['pumpjet', 'fiber_optic_guidance', 'wire_dispenser', 'deep_water'],
                   nose='ogive', nose_len_ratio=1.9, tail_len_ratio=1.0, fin_span_ratio=1.35,
                   propulsor='pumpjet', wire_dispenser=1, sonar_windows=3, bands=4),
                'PUBLIC', [SOURCES['FR_DEFENSE']],
            ),
        ],
    ),

    # =======================================================================
    # 中国
    # =======================================================================
    family(
        'CN_TORP_Yu1', 'China', 'Yu-1', 'TORP', ['TORP'], 'cn_torp_yu1',
        [
            _variant(
                'CN_TORP_Yu1', 'Yu-1 torpedo', 'Yu-1', 'TORP',
                '早期蒸汽鱼雷', 'Early_Heavyweight', 'Cold War', '1970s-1990s',
                2,
                '游戏 T2 中国鱼雷树起点：早期仿制蒸汽鱼雷。',
                '陀螺仪直线航行', '蒸汽推进', ['TORPEDO_TUBE'], ['anti_ship'],
                _dim(7.1, 0.533, 1700, 'ESTIMATED', '早期仿制型号，公开资料为级别近似。'),
                'LOW',
                _t(features=['wwii_blunt_tail', 'straight_running', 'twin_propeller'],
                   nose='blunt', nose_len_ratio=1.2, tail='square', fin_span_ratio=1.35,
                   propulsor='contra_propeller', sonar_windows=0, bands=2),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
        ],
    ),
    family(
        'CN_TORP_Yu3', 'China', 'Yu-3 / Yu-4', 'TORP', ['TORP'], 'cn_torp_yu3',
        [
            _variant(
                'CN_TORP_Yu3', 'Yu-3 torpedo', 'Yu-3', 'TORP',
                '电动声自导鱼雷', 'Acoustic_Homing', 'Cold War', '1980s-1990s',
                5,
                '游戏 T5 中国电动鱼雷节点：圆钝头部与电动推进。',
                '被动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_submarine'],
                _dim(7.0, 0.533, 1800, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM',
                _t(features=['electric', 'round_nose'], nose='blunt', nose_len_ratio=1.2, bands=2),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
            _variant(
                'CN_TORP_Yu4', 'Yu-4 torpedo', 'Yu-4', 'TORP',
                '热动力鱼雷', 'Heavyweight', 'Cold War', '1970s-1990s',
                4,
                '游戏 T4 热动力分支：与电动族同代但推进段不同。',
                '声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.0, 0.533, 1900, 'ESTIMATED', '公开资料为级别近似。'),
                'LOW',
                _t(features=['thermal', 'contra_propeller'], nose='ogive', nose_len_ratio=1.7, bands=2),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
        ],
    ),
    family(
        'CN_TORP_Yu5', 'China', 'Yu-5', 'TORP', ['TORP'], 'cn_torp_yu5',
        [
            _variant(
                'CN_TORP_Yu5', 'Yu-5 torpedo', 'Yu-5', 'TORP',
                '线导热动力鱼雷', 'Wire_Guided', 'Modern', '1990s-2000s',
                7,
                '游戏 T7 中国线导节点：细长弹体 + 导线整流罩。',
                '线导 + 声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(6.6, 0.533, 1600, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH',
                _t(features=['wire_dispenser', 'thermal'], nose='ogive', nose_len_ratio=2.0,
                   wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
        ],
    ),
    family(
        'CN_TORP_Yu6', 'China', 'Yu-6', 'TORP', ['TORP'], 'cn_torp_yu6',
        [
            _variant(
                'CN_TORP_Yu6', 'Yu-6 torpedo', 'Yu-6', 'TORP',
                '现代重型鱼雷', 'Modern_Heavyweight', 'Modern', '2000s-present',
                8,
                '游戏 T8 中国现役主力鱼雷：大直径推进段，与 Yu-5 外形不同。',
                '线导 + 主动声自导', '热动力', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.0, 0.533, 2000, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH',
                _t(features=['wire_dispenser', 'thermal', 'contra_propeller', 'extended_propulsion'],
                   nose='ogive', nose_len_ratio=2.1, tail_len_ratio=1.3, wire_dispenser=1,
                   sonar_windows=2, bands=4),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
        ],
    ),
    family(
        'CN_TORP_Yu7', 'China', 'Yu-7', 'TORP', ['TORP'], 'cn_torp_yu7',
        [
            _variant(
                'CN_TORP_Yu7', 'Yu-7 torpedo', 'Yu-7', 'TORP',
                '轻型反潜鱼雷', 'Lightweight', 'Modern', '1990s-present',
                7,
                '游戏 T7 轻型节点：324 毫米级小弹体。',
                '主动声自导', '电池电动', ['TORPEDO_TUBE', 'AIR_LAUNCH', 'SURFACE_LAUNCH'],
                ['anti_submarine'],
                _dim(2.7, 0.324, 235, 'ESTIMATED', '公开资料为级别近似。'),
                'LOW',
                _t(features=['lightweight'], nose='blunt', nose_len_ratio=1.0, tail_len_ratio=0.8,
                   fin_span_ratio=1.6, propulsor='propeller', sonar_windows=2, bands=1),
                'PUBLIC', [SOURCES['CN_GS']],
            ),
        ],
    ),

    # =======================================================================
    # 印度
    # =======================================================================
    family(
        'IN_TORP_Varunastra', 'India', 'Varunastra', 'TORP', ['TORP'], 'in_torp_varunastra',
        [
            _variant(
                'IN_TORP_Varunastra', 'Varunastra torpedo', 'Varunastra', 'TORP',
                '重型线导鱼雷', 'Modern_Heavyweight', 'Modern', '2016-present',
                8,
                '游戏 T8 印度主力鱼雷：与俄罗斯族外形接近但尾段与标记不同。',
                '线导 + 主动声自导', '电池电动', ['TORPEDO_TUBE'], ['anti_ship', 'anti_submarine'],
                _dim(7.6, 0.533, 1500, 'ESTIMATED', '公开资料长度口径存在多个版本，取中间值并标记估计。'),
                'HIGH',
                _t(features=['wire_dispenser', 'electric', 'long_body'], nose='ogive',
                   nose_len_ratio=2.0, tail_len_ratio=1.2, wire_dispenser=1, bands=3),
                'PUBLIC', [SOURCES['IN_DRDO']],
            ),
        ],
    ),
    family(
        'IN_TORP_TAL', 'India', 'TAL / Shyena', 'TORP', ['TORP'], 'in_torp_tal',
        [
            _variant(
                'IN_TORP_TAL', 'TAL Shyena lightweight torpedo', 'TAL', 'TORP',
                '轻型反潜鱼雷', 'Lightweight', 'Modern', '2010s-present',
                7,
                '游戏 T7 轻型节点：主要作为科技树对照与反潜武器分类样本。',
                '主动声自导', '电池电动', ['SURFACE_LAUNCH', 'AIR_LAUNCH'], ['anti_submarine'],
                _dim(2.7, 0.324, 220, 'ESTIMATED', '公开资料为级别近似。'),
                'DATABASE_ONLY',
                _t(features=['lightweight'], nose='blunt', nose_len_ratio=1.0, tail_len_ratio=0.8,
                   propulsor='propeller', sonar_windows=2, bands=1),
                'PUBLIC', [SOURCES['IN_DRDO']],
                notes='公开资料为水面舰/航空投放为主，当前不建立潜艇兼容关系。',
            ),
        ],
    ),
]
