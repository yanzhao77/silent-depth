#!/usr/bin/env python3
"""潜射弹道导弹分册：Family -> Variant 数据表。

ID 严格遵循 WEAPON_ID_ROSTER.md：英国 SSBN 通过兼容矩阵引用 US_SLBM_*，
不为英国单独新建 ID。几何参数只能使用 weapon_records.GEOMETRY_DEFAULTS 的
slbm 字段，保证 Blender 工厂可直接消费。
"""
from __future__ import annotations

from weapon_records import SOURCES, dim, family, geo, variant


def _entry(
    weapon_id, display_name, short_name, category, role, subrole, era, years, tier,
    tier_reason, guidance, propulsion, launch_methods, role_tags, dims, priority,
    kind, features, sources, status, notes='', **params
):
    return variant(
        weapon_id, display_name, short_name, category, role, subrole, era, years,
        tier, tier_reason, guidance, propulsion, launch_methods, role_tags, dims,
        priority, geo(kind, features, **params), 'PUBLIC', sources, status, notes=notes,
    )


SLBM_FAMILIES = [
    # ===================================================================
    # 美国
    # ===================================================================
    family(
        'US_SLBM_Polaris', 'USA', 'Polaris', 'SLBM', ['SLBM'], 'us_slbm_polaris',
        [
            _entry(
                'US_SLBM_Polaris_A1', 'Polaris A1', 'Polaris A1', 'SLBM',
                '第一代潜射弹道导弹', 'Early_SLBM', 'Cold War', '1960-1965',
                2,
                '游戏 T2 潜射弹道导弹起点：短钝整流罩、单喷管，是 SSBN 科技树的开端节点。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(8.5, 1.37, 12800, 'PUBLIC_REFERENCE', '公开资料长度约 8.5 米。'),
                'MEDIUM', 'slbm', ['early_generation', 'dome_shroud'],
                [SOURCES['US_NAVY'], SOURCES['US_FAS']], 'HISTORICAL',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.2,
                nozzle='single', nozzle_len_ratio=0.5, fins=0, cable_trays=0, bands=1,
            ),
            _entry(
                'US_SLBM_Polaris_A3', 'Polaris A3', 'Polaris A3', 'SLBM',
                '潜射弹道导弹改进型', 'Early_SLBM', 'Cold War', '1964-1980s',
                3,
                '游戏 T3 改进型：与 A1 共享弹体级别，弹体加长、整流罩形状更新。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(9.9, 1.37, 16000, 'PUBLIC_REFERENCE', '公开资料长度约 9.9 米。'),
                'MEDIUM', 'slbm', ['dome_shroud', 'extended_body'],
                [SOURCES['US_FAS']], 'HISTORICAL',
                nose='shroud', shroud_shape='hemispherical', nose_len_ratio=1.8,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.22,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'US_SLBM_Poseidon', 'USA', 'Poseidon', 'SLBM', ['SLBM'], 'us_slbm_poseidon',
        [
            _entry(
                'US_SLBM_Poseidon_C3', 'Poseidon C3', 'Poseidon C3', 'SLBM',
                '多弹头潜射弹道导弹', 'Cold_War_SLBM', 'Cold War', '1971-1990s',
                4,
                '游戏 T4 冷战中段节点：弹体明显加粗加长，尾裙结构清晰，与北极星外形差异大。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.4, 1.88, 34000, 'PUBLIC_REFERENCE', '公开资料长度约 10.4 米。'),
                'MEDIUM', 'slbm', ['wider_body', 'tail_skirt'],
                [SOURCES['US_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.5,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.28,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'US_SLBM_Trident', 'USA', 'Trident', 'SLBM', ['SLBM'], 'us_slbm_trident',
        [
            _entry(
                'US_SLBM_Trident_C4', 'Trident I C4', 'Trident C4', 'SLBM',
                '远程潜射弹道导弹', 'Late_Cold_War_SLBM', 'Cold War Late', '1979-2000s',
                5,
                '游戏 T5 远程节点：细长三级弹体，是 SSBN 科技树从早期转向现代的关键节点。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(10.4, 1.88, 33000, 'PUBLIC_REFERENCE', '公开资料长度约 10.4 米。'),
                'HIGH', 'slbm', ['three_stage', 'slim_shroud'],
                [SOURCES['US_NAVY'], SOURCES['US_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.7,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.25,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=0, bands=2,
            ),
            _entry(
                'US_SLBM_Trident_D5', 'Trident II D5', 'Trident D5', 'SLBM',
                '现役主力潜射弹道导弹', 'Modern_SLBM', 'Modern', '1990-present',
                8,
                '游戏 T8 现役主力：更粗更长的三级弹体，是 SSBN 科技树的核心节点。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(13.6, 2.11, 58500, 'PUBLIC_REFERENCE', '公开资料长度约 13.6 米、直径约 2.1 米。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'tail_skirt'],
                [SOURCES['US_NAVY']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.65, fins=0, cable_trays=0, bands=2,
            ),
            _entry(
                'US_SLBM_Trident_D5LE', 'Trident II D5LE', 'D5LE', 'SLBM',
                '延寿型潜射弹道导弹', 'Modern_SLBM', 'Modern', '2010s-present',
                9,
                '游戏 T9 延寿批次：与 D5 共享弹体几何，仅在数据层区分批次与标识。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(13.6, 2.11, 58500, 'PUBLIC_REFERENCE', '与 D5 同级尺寸。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'life_extended'],
                [SOURCES['US_NAVY']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.65, fins=0, cable_trays=1, bands=3,
            ),
        ],
        notes='三叉戟是家族：C4/D5/D5LE 共享弹体级别，仅数据层区分批次。',
    ),

    # ===================================================================
    # 俄罗斯 / 苏联
    # ===================================================================
    family(
        'RU_SLBM_R13', 'Russia', 'R-13', 'SLBM', ['SLBM'], 'ru_slbm_r13',
        [
            _entry(
                'RU_SLBM_R13', 'R-13 (SS-N-4)', 'R-13', 'SLBM',
                '第一代潜射弹道导弹', 'Early_SLBM', 'Cold War', '1961-1970s',
                2,
                '游戏 T2 苏联战略分支起点：水面发射、弹体短、整流罩钝。',
                '惯性', '固体单级', ['SLBM_TUBE', 'SURFACE_LAUNCH'],
                ['strategic', 'strategic_deterrent'],
                dim(11.8, 1.3, 13700, 'ESTIMATED', '公开资料存在多个版本，取级别近似值。'),
                'MEDIUM', 'slbm', ['early_generation', 'surface_launch', 'blunt_shroud'],
                [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.1,
                stage_rings=0, tail_skirt=1, skirt_flare_ratio=1.18,
                nozzle='single', nozzle_len_ratio=0.5, fins=0, cable_trays=0, bands=1,
            ),
        ],
    ),
    family(
        'RU_SLBM_R21', 'Russia', 'R-21', 'SLBM', ['SLBM'], 'ru_slbm_r21',
        [
            _entry(
                'RU_SLBM_R21', 'R-21 (SS-N-5)', 'R-21', 'SLBM',
                '水下发射早期潜射弹道导弹', 'Early_SLBM', 'Cold War', '1963-1970s',
                3,
                '游戏 T3 水下发射节点：首个可在水下发射的苏联型号，弹体加长。',
                '惯性', '固体单级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(13.0, 1.4, 16700, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['underwater_launch', 'dome_shroud'],
                [SOURCES['RU_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='hemispherical', nose_len_ratio=1.4,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.2,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'RU_SLBM_R27', 'Russia', 'R-27', 'SLBM', ['SLBM'], 'ru_slbm_r27',
        [
            _entry(
                'RU_SLBM_R27', 'R-27 (SS-N-6)', 'R-27', 'SLBM',
                '紧凑型潜射弹道导弹', 'Cold_War_SLBM', 'Cold War', '1968-1980s',
                4,
                '游戏 T4 节点：为紧凑发射管设计，弹体短而粗，尾裙比例明显。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(9.0, 1.5, 14200, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['compact_body', 'tail_skirt'],
                [SOURCES['RU_SHIPS']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.2,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.32,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'RU_SLBM_R29', 'Russia', 'R-29 family', 'SLBM', ['SLBM'], 'ru_slbm_r29',
        [
            _entry(
                'RU_SLBM_R29', 'R-29 (SS-N-8)', 'R-29', 'SLBM',
                '远程潜射弹道导弹', 'Late_Cold_War_SLBM', 'Cold War', '1970s-1980s',
                5,
                '游戏 T5 远程分支：明显加长的两级弹体，是 Delta 级 SSBN 的主力武器。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(13.0, 1.8, 33300, 'PUBLIC_REFERENCE', '公开资料长度约 13 米。'),
                'HIGH', 'slbm', ['long_body', 'tail_skirt'],
                [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.6,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.28,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=0, bands=2,
            ),
            _entry(
                'RU_SLBM_R29R', 'R-29R (SS-N-18)', 'R-29R', 'SLBM',
                '多弹头远程潜射弹道导弹', 'Late_Cold_War_SLBM', 'Cold War Late', '1978-2000s',
                6,
                '游戏 T6 分导式分支：与 R-29 同族，整流罩与弹体比例不同。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.1, 1.8, 34000, 'PUBLIC_REFERENCE', '公开资料长度约 14 米。'),
                'HIGH', 'slbm', ['long_body', 'mirv_bus', 'tail_skirt'],
                [SOURCES['RU_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.7,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.28,
                nozzle='single', nozzle_len_ratio=0.62, fins=0, cable_trays=0, bands=3,
            ),
            _entry(
                'RU_SLBM_R29RM', 'R-29RM', 'R-29RM', 'SLBM',
                '现代化潜射弹道导弹', 'Modern_SLBM', 'Modern', '1986-present',
                7,
                '游戏 T7 现代化节点：三级弹体、尾部结构更复杂，是 Delta IV 的主力武器。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.8, 1.9, 40300, 'PUBLIC_REFERENCE', '公开资料长度约 14.8 米。'),
                'HIGH', 'slbm', ['three_stage', 'mirv_bus', 'tail_skirt'],
                [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.62, fins=0, cable_trays=0, bands=3,
            ),
            _entry(
                'RU_SLBM_R29RMU2_Sineva', 'R-29RMU2 Sineva', 'Sineva', 'SLBM',
                '现役潜射弹道导弹', 'Modern_SLBM', 'Modern', '2007-present',
                8,
                '游戏 T8 俄罗斯现役主力之一：与 R-29RM 共享弹体几何，数据层区分批次与制导代次。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.8, 1.9, 40300, 'PUBLIC_REFERENCE', '与 R-29RM 同级尺寸。'),
                'HIGH', 'slbm', ['three_stage', 'mirv_bus', 'modern_avionics'],
                [SOURCES['RU_FAS']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.64, fins=0, cable_trays=1, bands=3,
            ),
            _entry(
                'RU_SLBM_R29RMU2_Liner', 'R-29RMU2.1 Liner', 'Liner', 'SLBM',
                '改进型潜射弹道导弹', 'Modern_SLBM', 'Modern', '2010s-present',
                8,
                '游戏 T8 改进批次：与 Sineva 共享几何，仅数据层区分布置与批次。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.8, 1.9, 40300, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM', 'slbm', ['three_stage', 'improved_bus', 'life_extended'],
                [SOURCES['RU_FAS']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.6,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.64, fins=0, cable_trays=1, bands=4,
            ),
        ],
        notes='R-29 系列是游戏里俄罗斯 SSBN 树的主干：同族共享弹体级别，仅数据层区分。',
    ),
    family(
        'RU_SLBM_R30', 'Russia', 'R-30 Bulava', 'SLBM', ['SLBM'], 'ru_slbm_r30',
        [
            _entry(
                'RU_SLBM_R30_Bulava', 'R-30 Bulava', 'Bulava', 'SLBM',
                '现役潜射弹道导弹', 'Modern_SLBM', 'Modern', '2018-present',
                9,
                '游戏 T9 俄罗斯现役主力：Borei 级的核心武器，弹体粗短、整流罩圆钝。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent'],
                dim(12.1, 2.0, 36800, 'PUBLIC_REFERENCE', '公开资料长度约 12 米级。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'dome_shroud'],
                [SOURCES['RU_SHIPS'], SOURCES['RU_FAS']], 'ACTIVE',
                nose='shroud', shroud_shape='hemispherical', nose_len_ratio=1.4,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.62, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),

    # ===================================================================
    # 法国
    # ===================================================================
    family(
        'FR_SLBM_M1', 'France', 'M1', 'SLBM', ['SLBM'], 'fr_slbm_m1',
        [
            _entry(
                'FR_SLBM_M1', 'M1', 'M1', 'SLBM',
                '第一代潜射弹道导弹', 'Early_SLBM', 'Cold War', '1971-1970s',
                3,
                '游戏 T3 法国战略分支起点：两级弹体、整流罩较尖，与美苏早期型号比例不同。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.4, 1.5, 18000, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['two_stage', 'pointed_shroud'],
                [SOURCES['FR_DEFENSE']], 'RETIRED',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.8,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.2,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'FR_SLBM_M2', 'France', 'M2 / M20', 'SLBM', ['SLBM'], 'fr_slbm_m2',
        [
            _entry(
                'FR_SLBM_M2', 'M2', 'M2', 'SLBM',
                '改进型潜射弹道导弹', 'Cold_War_SLBM', 'Cold War', '1974-1980s',
                4,
                '游戏 T4 改进型：与 M1 同族级别，弹体加长、制导代次提升。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.7, 1.5, 20000, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['two_stage', 'extended_body'],
                [SOURCES['FR_DEFENSE']], 'RETIRED',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.8,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.22,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
            _entry(
                'FR_SLBM_M20', 'M20', 'M20', 'SLBM',
                '热核弹头潜射弹道导弹', 'Cold_War_SLBM', 'Cold War', '1977-1990s',
                5,
                '游戏 T5 节点：与 M2 共享弹体几何，弹头与突防配置不同。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.7, 1.5, 20000, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM', 'slbm', ['two_stage', 'mirv_bus'],
                [SOURCES['FR_DEFENSE']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.7,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.24,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=3,
            ),
        ],
        notes='M20 属于 M2 家族，共享基础几何。',
    ),
    family(
        'FR_SLBM_M4', 'France', 'M4 / M45', 'SLBM', ['SLBM'], 'fr_slbm_m4',
        [
            _entry(
                'FR_SLBM_M4', 'M4', 'M4', 'SLBM',
                '多弹头潜射弹道导弹', 'Late_Cold_War_SLBM', 'Cold War Late', '1985-1990s',
                6,
                '游戏 T6 法国战略主力：细长三级弹体，与 M2 家族外形差异明显。',
                '惯性', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(11.0, 1.93, 35000, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['three_stage', 'slim_shroud'],
                [SOURCES['FR_DEFENSE']], 'RETIRED',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.9,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.26,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=0, bands=2,
            ),
            _entry(
                'FR_SLBM_M45', 'M45', 'M45', 'SLBM',
                '改进型潜射弹道导弹', 'Modern_SLBM', 'Modern', '1996-2010s',
                7,
                '游戏 T7 改进型：与 M4 共享弹体几何，数据层区分制导与弹头配置。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(11.0, 1.93, 35000, 'ESTIMATED', '沿用同族近似。'),
                'MEDIUM', 'slbm', ['three_stage', 'improved_bus'],
                [SOURCES['FR_DEFENSE']], 'RETIRED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.8,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.26,
                nozzle='single', nozzle_len_ratio=0.6, fins=0, cable_trays=1, bands=3,
            ),
        ],
        notes='M45 属于 M4 家族，共享基础几何。',
    ),
    family(
        'FR_SLBM_M51', 'France', 'M51', 'SLBM', ['SLBM'], 'fr_slbm_m51',
        [
            _entry(
                'FR_SLBM_M51', 'M51', 'M51', 'SLBM',
                '现役潜射弹道导弹', 'Modern_SLBM', 'Modern', '2010-present',
                8,
                '游戏 T8 法国现役主力：弹体更粗、三级结构清晰，尾裙比例明显。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(12.0, 2.3, 52000, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'tail_skirt'],
                [SOURCES['FR_DEFENSE']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.5,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.28,
                nozzle='single', nozzle_len_ratio=0.65, fins=0, cable_trays=1, bands=3,
            ),
        ],
    ),

    # ===================================================================
    # 中国
    # ===================================================================
    family(
        'CN_SLBM_JL1', 'China', 'JL-1', 'SLBM', ['SLBM'], 'cn_slbm_jl1',
        [
            _entry(
                'CN_SLBM_JL1', 'JL-1', 'JL-1', 'SLBM',
                '第一代潜射弹道导弹', 'Early_SLBM', 'Cold War', '1980s-1990s',
                4,
                '游戏 T4 中国战略分支起点：两级弹体、整体比例比同期美苏型号更短。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.7, 1.4, 14200, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['two_stage', 'dome_shroud'],
                [SOURCES['CN_GS']], 'RETIRED',
                nose='shroud', shroud_shape='hemispherical', nose_len_ratio=1.4,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.2,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'CN_SLBM_JL2', 'China', 'JL-2', 'SLBM', ['SLBM'], 'cn_slbm_jl2',
        [
            _entry(
                'CN_SLBM_JL2', 'JL-2', 'JL-2', 'SLBM',
                '远程潜射弹道导弹', 'Modern_SLBM', 'Modern', '2010s-present',
                7,
                '游戏 T7 中国现役主力：三级远程弹体，是 Type 094 的核心武器。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(13.0, 2.0, 42000, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'tail_skirt'],
                [SOURCES['CN_GS']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.5,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.28,
                nozzle='single', nozzle_len_ratio=0.62, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'CN_SLBM_JL3', 'China', 'JL-3', 'SLBM', ['SLBM'], 'cn_slbm_jl3',
        [
            _entry(
                'CN_SLBM_JL3', 'JL-3', 'JL-3', 'SLBM',
                '新一代远程潜射弹道导弹', 'Modern_SLBM', 'Modern', '2020s-present',
                9,
                '游戏 T9 新一代节点：更长更粗的三级弹体，对应 Type 096 科技树。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.0, 2.2, 55000, 'ESTIMATED', '公开资料有限，取公开报道的级别近似值。'),
                'HIGH', 'slbm', ['three_stage', 'wide_body', 'long_body', 'tail_skirt'],
                [SOURCES['CN_GS']], 'ACTIVE',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.5,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.65, fins=0, cable_trays=1, bands=3,
            ),
        ],
    ),

    # ===================================================================
    # 印度
    # ===================================================================
    family(
        'IN_SLBM_K15', 'India', 'K-15 Sagarika', 'SLBM', ['SLBM'], 'in_slbm_k15',
        [
            _entry(
                'IN_SLBM_K15', 'K-15 Sagarika', 'K-15', 'SLBM',
                '近程潜射弹道导弹', 'Modern_SLBM', 'Modern', '2010s-present',
                6,
                '游戏 T6 印度战略分支起点：短粗两级弹体，与同代美俄型号外形差异明显。',
                '惯性', '固体两级', ['SLBM_TUBE'], ['strategic', 'strategic_deterrent'],
                dim(10.0, 0.74, 7000, 'ESTIMATED', '公开资料为级别近似。'),
                'MEDIUM', 'slbm', ['two_stage', 'compact_body', 'slim_shroud'],
                [SOURCES['IN_DRDO']], 'ACTIVE',
                nose='shroud', shroud_shape='pointed', nose_len_ratio=1.7,
                stage_rings=1, tail_skirt=1, skirt_flare_ratio=1.15,
                nozzle='single', nozzle_len_ratio=0.5, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'IN_SLBM_K4', 'India', 'K-4', 'SLBM', ['SLBM'], 'in_slbm_k4',
        [
            _entry(
                'IN_SLBM_K4', 'K-4', 'K-4', 'SLBM',
                '中程潜射弹道导弹', 'Modern_SLBM', 'Modern', '2020s-present',
                8,
                '游戏 T8 印度主力节点：两级弹体，长度明显大于 K-15。',
                '惯性 + 星光修正', '固体两级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent'],
                dim(12.0, 1.3, 17000, 'ESTIMATED', '公开资料为级别近似。'),
                'HIGH', 'slbm', ['two_stage', 'long_body', 'dome_shroud'],
                [SOURCES['IN_DRDO']], 'ACTIVE',
                nose='shroud', shroud_shape='hemispherical', nose_len_ratio=1.5,
                stage_rings=2, tail_skirt=1, skirt_flare_ratio=1.22,
                nozzle='single', nozzle_len_ratio=0.55, fins=0, cable_trays=0, bands=2,
            ),
        ],
    ),
    family(
        'IN_SLBM_K5', 'India', 'K-5', 'SLBM', ['SLBM'], 'in_slbm_k5',
        [
            _entry(
                'IN_SLBM_K5', 'K-5', 'K-5', 'SLBM',
                '计划中的远程潜射弹道导弹', 'Future_SLBM', 'Future', 'planned',
                10,
                '游戏 T10 计划节点：公开资料不足，仅按公开描述的三级远程弹体入数据库，不产出 3D 资产。',
                '惯性 + 星光修正', '固体三级', ['SLBM_TUBE'],
                ['strategic', 'strategic_deterrent', 'long_range'],
                dim(14.0, 2.0, 50000, 'GAMEPLAY_SCALE', '公开资料缺乏，按同级远程型号的级别近似。'),
                'DATABASE_ONLY', 'slbm', ['planned_project', 'three_stage', 'wide_body'],
                [SOURCES['IN_DRDO']], 'PLANNED',
                nose='shroud', shroud_shape='blunt', nose_len_ratio=1.5,
                stage_rings=3, tail_skirt=1, skirt_flare_ratio=1.3,
                nozzle='single', nozzle_len_ratio=0.65, fins=0, cable_trays=1, bands=3,
            ),
        ],
    ),
]


# 战略（STRAT）分支不单独新建武器 ID：按需求 §15，它与弹道导弹共享几何，
# 只在数据层通过 role_tags 中的 'strategic' 标签区分（见 dataset_index.strategic_variants）。
STRATEGIC_FAMILIES: list[dict] = []
