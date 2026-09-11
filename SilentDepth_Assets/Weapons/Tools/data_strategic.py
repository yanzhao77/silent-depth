#!/usr/bin/env python3
"""战略级武器与补齐的 SLBM 条目。

包含三部分：
1. STRAT 分类：战略巡航/战略级武器（与 LAM/ASM 家族在数据层区分）。
2. 补齐的 SLBM：R-39（SS-N-20，Typhoon/Project 941 的核心武器）。
3. 英国 Polaris A3TK（Chevaline）历史条目，用于 Resolution 级兼容关系。

只记录公开资料中的身份、类别、时代与外形尺寸级别。
"""
from __future__ import annotations

from weapon_records import SOURCES, dim, family, geo, variant

_US = [SOURCES['US_NAVY'], SOURCES['US_FAS']]
_RU = [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']]
_UK = [SOURCES['UK_RN']]


STRATEGIC_SLBM_FAMILIES = [
    family(
        'RU_SLBM_R39', 'Russia', 'R-39 (SS-N-20)', 'SLBM', ['SLBM'], 'ru_slbm_r39',
        [
            variant(
                'RU_SLBM_R39', 'R-39 (SS-N-20 Sturgeon)', 'R-39', 'SLBM',
                '潜射弹道导弹（固体燃料）', 'Late_Cold_War_SLBM', 'Cold War Late', '1983-2004',
                9,
                '游戏 T9 末期冷战 SLBM：Project 941（Typhoon）专用大型固体燃料导弹，'
                '弹体尺寸显著大于前代，是 Typhoon 资产的核心配套武器节点。',
                '惯性 + 天文修正', '三级固体燃料', ['SLBM_TUBE'], ['strategic_deterrent'],
                dim(16.0, 2.4, 84000, 'PUBLIC_REFERENCE',
                    '公开资料常见数据，取级别近似值；长度与直径按米级取整。'),
                'HIGH',
                geo('slbm', ['nose_shroud', 'tail_skirt', 'nozzle', 'three_stage', 'large_diameter'],
                    nose='shroud', nose_len_ratio=1.4, shroud_shape='blunt', stage_rings=2,
                    tail_skirt=1, skirt_flare_ratio=1.2, nozzle='single', nozzle_len_ratio=0.8,
                    fins=0, bands=3, canister=1),
                'PUBLIC', _RU, 'HISTORICAL',
                notes='Typhoon/Project 941 每艇可搭载 20 枚，是 SSBN 科技树的高端节点。',
            ),
            variant(
                'RU_SLBM_R39M', 'R-39M (Bark)', 'R-39M', 'SLBM',
                '潜射弹道导弹（取消项目）', 'Planned_SLBM', 'Cold War Late', '1990s（取消）',
                9,
                '游戏 T9 规划节点：项目取消的历史分支，与 R-39 共享基础几何。',
                '惯性 + 制导更新', '三级固体燃料', ['SLBM_TUBE'], ['strategic_deterrent'],
                dim(16.0, 2.4, 84000, 'ESTIMATED', '同一发射筒体系下的改进方案，尺寸沿用近似值。'),
                'LOW',
                geo('slbm', ['nose_shroud', 'tail_skirt', 'nozzle', 'planned_project'],
                    nose='shroud', nose_len_ratio=1.5, shroud_shape='pointed', stage_rings=2,
                    tail_skirt=1, nozzle='single', fins=0, bands=3, canister=1),
                'ESTIMATED', _RU, 'PLANNED',
                notes='公开资料有限，标记为 ESTIMATED。',
            ),
        ],
        notes='Project 941（Typhoon）的核心战略武器家族。',
    ),
    family(
        'UK_SLBM_Polaris_A3TK', 'UK', 'Polaris A3TK (Chevaline)', 'SLBM', ['SLBM'], 'uk_slbm_polaris_a3tk',
        [
            variant(
                'UK_SLBM_Polaris_A3TK', 'Polaris A3TK (Chevaline)', 'A3TK', 'SLBM',
                '潜射弹道导弹（英国改进型）', 'Late_Cold_War_SLBM', 'Cold War Late', '1982-1996',
                7,
                '游戏 T7 英国 SSBN 节点：在英国 Polaris A3 基础上改进，服役至 Trident 换装。',
                '惯性制导', '两级固体燃料', ['SLBM_TUBE'], ['strategic_deterrent'],
                dim(9.8, 1.37, 16000, 'PUBLIC_REFERENCE', '公开资料常见 Polaris A3 级别尺寸。'),
                'HIGH',
                geo('slbm', ['nose_shroud', 'tail_skirt', 'nozzle', 'penetration_aids'],
                    nose='shroud', nose_len_ratio=1.8, shroud_shape='pointed', stage_rings=1,
                    tail_skirt=1, nozzle='single', fins=0, bands=3),
                'PUBLIC', _UK, 'HISTORICAL',
                notes='英国 Resolution 级 SSBN 的武器，用于与美制 Polaris 家族区分。',
            ),
        ],
    ),
]


STRATEGIC_FAMILIES = [
    family(
        'US_STRAT_RegulusII', 'USA', 'SSM-N-8B Regulus II', 'STRAT', ['STRAT'], 'us_strat_regulus2',
        [
            variant(
                'US_STRAT_RegulusII', 'SSM-N-8B Regulus II', 'Regulus II', 'STRAT',
                '潜射战略巡航导弹（取消项目）', 'Early_Strategic', 'Cold War', '1958（取消）',
                4,
                '游戏 T4 战略巡航节点：取消的历史项目，用于展示早期战略巡航武器分支。',
                '无线电指令 + 惯性', '涡轮喷气 + 固体助推', ['TORPEDO_TUBE', 'CANISTER'],
                ['strategic_deterrent', 'land_attack'],
                dim(17.5, 1.5, 10400, 'ESTIMATED', '取消项目，公开资料尺寸为级别近似值。'),
                'LOW',
                geo('cruise_missile', ['large_fixed_wing', 'canister_body', 'cancelled_project',
                                       'solid_booster', 'supersonic_body'],
                    nose='pointed', nose_len_ratio=3.4, body_shape='cylinder', wing_type='fixed',
                    wing_pairs=1, wing_span_ratio=4.4, wing_chord_ratio=1.2, wing_position=0.42,
                    wing_sweep_deg=45.0, tail_type='cruciform', tail_count=4, tail_span_ratio=2.0,
                    intake_type='nose', booster=1, booster_len_ratio=0.28, booster_fins=4,
                    bands=2, canister=1),
                'ESTIMATED', _US, 'PLANNED',
                notes='项目取消，仅作为科技树历史节点保留，资料不足处标记 ESTIMATED。',
            ),
        ],
    ),
    family(
        'US_STRAT_TLAM_N', 'USA', 'BGM-109A TLAM-N', 'STRAT', ['STRAT'], 'us_strat_tlam_n',
        [
            variant(
                'US_STRAT_TLAM_N', 'BGM-109A Tomahawk TLAM-N', 'TLAM-N', 'STRAT',
                '潜射战略巡航导弹', 'Modern_Strategic', 'Cold War Late', '1984-2010s',
                8,
                '游戏 T8 战略巡航节点：与 Tomahawk 家族共享基础几何，仅在数据层区分战略角色。',
                '惯性 + 地形匹配 + GPS', '涡轮风扇 + 固体助推', ['TORPEDO_TUBE', 'VLS'],
                ['strategic_deterrent', 'land_attack'],
                dim(6.25, 0.52, 1500, 'PUBLIC_REFERENCE', '公开资料 Tomahawk 级别尺寸。'),
                'MEDIUM',
                geo('cruise_missile', ['popout_wing', 'solid_booster', 'land_attack_kit', 'canister'],
                    nose='ogive', nose_len_ratio=3.0, body_shape='cylinder', wing_type='popout',
                    wing_pairs=1, wing_span_ratio=3.2, wing_chord_ratio=1.1, wing_position=0.45,
                    wing_sweep_deg=35.0, tail_type='x_config', tail_count=4, tail_span_ratio=2.4,
                    intake_type='none', booster=1, booster_len_ratio=0.24, booster_fins=4,
                    dorsal=0, bands=2, canister=1),
                'PUBLIC', _US, 'HISTORICAL',
                notes='与 US_LAM_Tomahawk 家族共享几何，数据层通过 weapon_role 区分。',
            ),
        ],
    ),
    family(
        'RU_STRAT_Meteorit', 'Russia', 'P-750 Meteorit', 'STRAT', ['STRAT'], 'ru_strat_meteorit',
        [
            variant(
                'RU_STRAT_Meteorit', 'P-750 Meteorit (SS-N-24)', 'Meteorit', 'STRAT',
                '潜射战略巡航导弹', 'Late_Cold_War_Strategic', 'Cold War Late', '1980s-1990s',
                8,
                '游戏 T8 苏联战略巡航节点：由改进型 SSBN 发射筒搭载，外形为大型巡航导弹。',
                '惯性 + 地形匹配', '涡轮风扇 + 固体助推', ['SLBM_TUBE', 'CANISTER'],
                ['strategic_deterrent', 'land_attack'],
                dim(12.0, 0.9, 6000, 'ESTIMATED', '公开资料不足，尺寸为级别估计。'),
                'MEDIUM',
                geo('cruise_missile', ['large_fixed_wing', 'canister_body', 'solid_booster',
                                       'long_range', 'underwater_launch'],
                    nose='pointed', nose_len_ratio=3.6, body_shape='cylinder', wing_type='fixed',
                    wing_pairs=1, wing_span_ratio=3.8, wing_chord_ratio=1.3, wing_position=0.4,
                    wing_sweep_deg=52.0, tail_type='cruciform', tail_count=4, tail_span_ratio=2.2,
                    intake_type='none', booster=1, booster_len_ratio=0.3, booster_fins=4,
                    bands=2, canister=1),
                'ESTIMATED', _RU, 'HISTORICAL',
                notes='公开资料有限，几何按可确认的巡航导弹外形特征建模。',
            ),
        ],
    ),
]


ALL_STRATEGIC_FAMILIES = STRATEGIC_FAMILIES
