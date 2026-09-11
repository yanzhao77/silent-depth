#!/usr/bin/env python3
"""水雷 / 诱饵对抗 / 特种载荷分册。

只记录公开资料中的身份、类别、时代与外形轮廓；不含任何装药、引信、声学对抗
算法或特种作战方法信息。所有条目都是游戏中可见的装备资产。
"""
from __future__ import annotations

from weapon_records import SOURCES, dim, family, geo, variant


def _entry(
    weapon_id, display_name, short_name, category, role, subrole, era, years, tier,
    tier_reason, guidance, propulsion, launch_methods, role_tags, length, dia, mass,
    priority, kind, features, sources, scale_source='ESTIMATED',
    scale_note='公开资料仅有量级信息，按近似尺寸建模。', status='UNKNOWN', notes='',
    variant_of=None, **params
):
    """构造水雷/诱饵/特种载荷条目；这些类别默认按估计尺寸记录。"""
    return variant(
        weapon_id, display_name, short_name, category, role, subrole, era, years,
        tier, tier_reason, guidance, propulsion, launch_methods, role_tags,
        dim(length, dia, mass, scale_source, scale_note), priority,
        geo(kind, features, **params), 'PUBLIC', sources, status=status, notes=notes,
        variant_of=variant_of,
    )


# ---------------------------------------------------------------------------
# 水雷
# ---------------------------------------------------------------------------
MINE_FAMILIES = [
    family(
        'US_MINE_Mk67_SLMM', 'USA', 'Mk 67 SLMM', 'MINE', ['MINE'], 'us_mine_mk67_slmm',
        [
            _entry(
                'US_MINE_Mk67_SLMM', 'Mk 67 SLMM', 'Mk67-SLMM', 'MINE',
                '潜艇布放机动水雷', 'Submarine_Deployable_Mine', 'Cold War Late', '1980s-present',
                6, '游戏 T6 现代水雷节点：由鱼雷管布放，外形沿用鱼雷弹体便于识别。',
                '预置目标探测', '自航', ['TORPEDO_TUBE'], ['mine_warfare', 'area_denial'],
                4.83, 0.483, 700, 'MEDIUM', 'mine', ['torpedo_shaped_body', 'launch_canister'],
                [SOURCES['US_NAVY'], SOURCES['US_FAS']],
                scale_source='ESTIMATED', scale_note='公开资料沿用 Mk 37 鱼雷弹体量级。',
                status='ACTIVE', body='torpedo_shaped', horns=0, rails=2, fins=4, bands=2,
            ),
        ],
    ),
    family(
        'US_MINE_Mk60_CAPTOR', 'USA', 'Mk 60 CAPTOR', 'MINE', ['MINE'], 'us_mine_mk60_captor',
        [
            _entry(
                'US_MINE_Mk60_CAPTOR', 'Mk 60 CAPTOR', 'Mk60', 'MINE',
                '封装式反潜水雷', 'Submarine_Deployable_Mine', 'Cold War Late', '1979-1990s',
                5, '游戏 T5 冷战后期反潜水雷：外部为封闭运载筒，视觉上与普通水雷区分明显。',
                '声学触发', '无', ['TORPEDO_TUBE'], ['mine_warfare', 'anti_submarine'],
                4.0, 0.533, 1100, 'LOW', 'mine', ['canister_body', 'cylindrical'],
                [SOURCES['US_FAS']],
                status='RETIRED', body='cylindrical', canister=1, rails=2, bands=2,
                notes='外部运载筒为可见特征，内部载荷不作建模。',
            ),
        ],
    ),
    family(
        'UK_MINE_SeaUrchin', 'UK', 'Sea Urchin', 'MINE', ['MINE'], 'uk_mine_sea_urchin',
        [
            _entry(
                'UK_MINE_SeaUrchin', 'Sea Urchin', 'SeaUrchin', 'MINE',
                '潜艇布放水雷', 'Historical_Mine', 'Cold War', '1950s-1970s',
                3, '游戏 T3 冷战早期英国水雷：圆柱弹体 + 外部触点柱，早期布雷节点。',
                '触发式', '无', ['TORPEDO_TUBE'], ['mine_warfare', 'area_denial'],
                1.6, 0.53, 500, 'LOW', 'mine', ['contact_horns', 'cylindrical'],
                [SOURCES['UK_RN']],
                status='RETIRED', body='cylindrical', horns=8, bands=1,
            ),
        ],
    ),
    family(
        'RU_MINE_PMR2', 'Russia', 'PMR-2', 'MINE', ['MINE'], 'ru_mine_pmr2',
        [
            _entry(
                'RU_MINE_PMR2', 'PMR-2', 'PMR-2', 'MINE',
                '潜艇布放系留水雷', 'Submarine_Deployable_Mine', 'Cold War Late', '1970s-present',
                5, '游戏 T5 冷战后期系留水雷：系留索具是主要可见特征。',
                '触发/声学', '无', ['TORPEDO_TUBE'], ['mine_warfare', 'area_denial'],
                1.8, 0.53, 600, 'LOW', 'mine', ['mooring', 'cylindrical'],
                [SOURCES['RU_SHIPS']],
                status='ACTIVE', body='cylindrical', mooring=1, horns=8, bands=2,
            ),
        ],
    ),
    family(
        'RU_MINE_MDM6', 'Russia', 'MDM-6', 'MINE', ['MINE'], 'ru_mine_mdm6',
        [
            _entry(
                'RU_MINE_MDM6', 'MDM-6', 'MDM-6', 'MINE',
                '潜艇布放沉底水雷', 'Submarine_Deployable_Mine', 'Cold War Late', '1970s-present',
                5, '游戏 T5 沉底雷节点：体量更大、外形更宽，与系留雷区分。',
                '声学/磁感应', '无', ['TORPEDO_TUBE'], ['mine_warfare', 'area_denial'],
                2.4, 0.7, 1100, 'LOW', 'mine', ['wide_body', 'cylindrical'],
                [SOURCES['RU_SHIPS']],
                status='ACTIVE', body='cylindrical', horns=12, rails=2, bands=2,
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# 诱饵与对抗装置
# ---------------------------------------------------------------------------
DECOY_FAMILIES = [
    family(
        'US_DECOY_Mk70_MOSS', 'USA', 'Mk 70 MOSS', 'DECOY', ['DECOY'], 'us_decoy_mk70_moss',
        [
            _entry(
                'US_DECOY_Mk70_MOSS', 'Mk 70 MOSS', 'MOSS', 'DECOY',
                '潜艇模拟器', 'Acoustic_Decoy', 'Cold War Late', '1976-present',
                6, '游戏 T6 现代诱饵节点：细长胶囊外形，可由鱼雷管投放。',
                '预置声学模拟', '自航', ['TORPEDO_TUBE'], ['countermeasure', 'survivability'],
                1.0, 0.2, 40, 'MEDIUM', 'decoy', ['capsule_body', 'dispenser_rings'],
                [SOURCES['US_NAVY'], SOURCES['US_FAS']],
                status='ACTIVE', body='capsule', capsule_ratio=3.0, rings=3, dispenser=1,
                fins=4, tail='conical', bands=2,
            ),
        ],
    ),
    family(
        'US_DECOY_ADC', 'USA', 'ADC Mk 4 / Mk 5', 'DECOY', ['DECOY'], 'us_decoy_adc',
        [
            _entry(
                'US_DECOY_ADC_Mk4', 'ADC Mk 4', 'ADC-Mk4', 'DECOY',
                '声学对抗装置', 'Acoustic_Decoy', 'Modern', '1990s-present',
                7, '游戏 T7 成熟声学对抗节点：短胶囊外形，可多枚连续投放。',
                '声学对抗', '电池', ['TORPEDO_TUBE'], ['countermeasure', 'survivability'],
                0.7, 0.15, 20, 'MEDIUM', 'decoy', ['short_capsule', 'dispenser_rings'],
                [SOURCES['US_NAVY']],
                status='ACTIVE', body='capsule', capsule_ratio=2.4, rings=2, dispenser=1, bands=2,
            ),
            _entry(
                'US_DECOY_ADC_Mk5', 'ADC Mk 5', 'ADC-Mk5', 'DECOY',
                '声学对抗装置', 'Acoustic_Decoy', 'Modern', '2010s-present',
                8, '游戏 T8 先进声学对抗节点：与 Mk 4 同几何，换代数据节点。',
                '声学对抗', '电池', ['TORPEDO_TUBE'], ['countermeasure', 'survivability'],
                0.7, 0.15, 20, 'LOW', 'decoy', ['short_capsule', 'dispenser_rings'],
                [SOURCES['US_NAVY']],
                status='ACTIVE', body='capsule', capsule_ratio=2.4, rings=2, dispenser=1, bands=2,
                variant_of='US_DECOY_ADC_Mk4',
            ),
        ],
    ),
    family(
        'RU_DECOY_MG74', 'Russia', 'MG-74', 'DECOY', ['DECOY'], 'ru_decoy_mg74',
        [
            _entry(
                'RU_DECOY_MG74', 'MG-74', 'MG-74', 'DECOY',
                '声学诱饵', 'Acoustic_Decoy', 'Cold War Late', '1970s-present',
                6, '游戏 T6 苏联/俄罗斯诱饵节点：桶形弹体，与美制胶囊外形明显不同。',
                '声学模拟', '自航', ['TORPEDO_TUBE'], ['countermeasure', 'survivability'],
                1.4, 0.3, 110, 'MEDIUM', 'decoy', ['barrel_body', 'dispenser_rings'],
                [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']],
                status='ACTIVE', body='cylinder', nose='blunt', nose_len_ratio=0.3,
                rings=3, dispenser=1, tail='conical', bands=2,
            ),
        ],
    ),
    family(
        'UK_DECOY_SSE_Mk3', 'UK', 'SSE Mk 3', 'DECOY', ['DECOY'], 'uk_decoy_sse_mk3',
        [
            _entry(
                'UK_DECOY_SSE_Mk3', 'SSE Mk 3', 'SSE-Mk3', 'DECOY',
                '潜用信号发射器', 'Historical_Decoy', 'Cold War', '1960s-1980s',
                3, '游戏 T3 冷战早期英国对抗节点：小尺寸圆柱体，作为诱饵树起点。',
                '信号模拟', '无', ['TORPEDO_TUBE'], ['countermeasure', 'survivability'],
                0.6, 0.2, 25, 'LOW', 'decoy', ['short_cylinder', 'simple_body'],
                [SOURCES['UK_RN']],
                status='RETIRED', body='cylinder', rings=1, bands=1,
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# 特种载荷
# ---------------------------------------------------------------------------
SPECIAL_FAMILIES = [
    family(
        'US_SPECIAL_DDS', 'USA', 'Dry Deck Shelter', 'SPECIAL', ['SPECIAL'], 'us_special_dds',
        [
            _entry(
                'US_SPECIAL_DDS', 'Dry Deck Shelter', 'DDS', 'SPECIAL',
                '干式甲板掩体', 'Dry_Deck_Shelter', 'Cold War Late', '1980s-present',
                8, '游戏 T8 特种载荷节点：箱形外挂结构，是潜艇外壳上最显眼的附加体。',
                '无', '无', ['SWIM_OUT_DOCK'], ['special_operations', 'payload'],
                11.6, 2.7, 30000, 'HIGH', 'shelter', ['boxy_hull', 'hatch_rings', 'rails'],
                [SOURCES['US_NAVY']],
                status='ACTIVE', hatch_rings=2, runner_rails=1, bands=1,
            ),
        ],
    ),
    family(
        'US_SPECIAL_ASDS', 'USA', 'Advanced SEAL Delivery System', 'SPECIAL', ['SPECIAL'], 'us_special_asds',
        [
            _entry(
                'US_SPECIAL_ASDS', 'Advanced SEAL Delivery System', 'ASDS', 'SPECIAL',
                '先进水下输送载具', 'SDV', 'Modern', '2000s-2009',
                8, '游戏 T8 特种输送载具：长圆柱 + 驾驶舱罩 + 尾部导管推进器。',
                '无', '电池', ['SWIM_OUT_DOCK'], ['special_operations', 'payload'],
                19.8, 2.1, 55000, 'MEDIUM', 'sdv', ['long_body', 'canopy', 'shrouded_propulsor'],
                [SOURCES['US_NAVY']],
                scale_source='PUBLIC_REFERENCE', scale_note='公开资料给出整体量级尺寸。',
                status='RETIRED', nose='blunt', nose_len_ratio=1.2, canopy=1,
                propulsor='shrouded', fins=4, docking_collar=1, bands=2,
            ),
        ],
    ),
    family(
        'US_SPECIAL_SDV_Mk8', 'USA', 'Mk 8 SEAL Delivery Vehicle', 'SPECIAL', ['SPECIAL'], 'us_special_sdv_mk8',
        [
            _entry(
                'US_SPECIAL_SDV_Mk8', 'Mk 8 SEAL Delivery Vehicle', 'SDV-Mk8', 'SPECIAL',
                '水下输送载具', 'SDV', 'Cold War Late', '1980s-present',
                7, '游戏 T7 特种输送载具：短而宽的开式载具，与 ASDS 外形区分明显。',
                '无', '电池', ['SWIM_OUT_DOCK'], ['special_operations', 'payload'],
                6.4, 1.5, 3500, 'MEDIUM', 'sdv', ['short_body', 'open_frame', 'shrouded_propulsor'],
                [SOURCES['US_NAVY']],
                status='ACTIVE', nose='blunt', nose_len_ratio=1.0, canopy=0,
                propulsor='shrouded', fins=4, docking_collar=1, bands=1,
            ),
        ],
    ),
    family(
        'RU_SPECIAL_SDV_Sirena', 'Russia', 'Sirena', 'SPECIAL', ['SPECIAL'], 'ru_special_sdv_sirena',
        [
            _entry(
                'RU_SPECIAL_SDV_Sirena', 'Sirena', 'Sirena', 'SPECIAL',
                '水下输送载具', 'SDV', 'Cold War Late', '1980s-present',
                6, '游戏 T6 苏联/俄罗斯特种输送载具节点：外形与美制 SDV 明显不同。',
                '无', '电池', ['SWIM_OUT_DOCK'], ['special_operations', 'payload'],
                8.0, 1.6, 6000, 'MEDIUM', 'sdv', ['long_body', 'shrouded_propulsor'],
                [SOURCES['RU_SHIPS']],
                status='ACTIVE', nose='blunt', nose_len_ratio=1.1, canopy=1,
                propulsor='shrouded', fins=4, bands=1,
            ),
        ],
    ),
    family(
        'UK_SPECIAL_DDS', 'UK', 'Dry Deck Shelter', 'SPECIAL', ['SPECIAL'], 'uk_special_dds',
        [
            _entry(
                'UK_SPECIAL_DDS', 'UK Dry Deck Shelter', 'DDS-UK', 'SPECIAL',
                '干式甲板掩体', 'Dry_Deck_Shelter', 'Cold War Late', '1990s-present',
                8, '游戏 T8 英国特种载荷节点：与美制 DDS 同类的箱形外挂结构。',
                '无', '无', ['SWIM_OUT_DOCK'], ['special_operations', 'payload'],
                10.0, 2.5, 25000, 'LOW', 'shelter', ['boxy_hull', 'hatch_rings'],
                [SOURCES['UK_RN']],
                status='ACTIVE', hatch_rings=2, runner_rails=1, bands=1,
            ),
        ],
    ),
]


SUPPORT_FAMILIES = MINE_FAMILIES + DECOY_FAMILIES + SPECIAL_FAMILIES
