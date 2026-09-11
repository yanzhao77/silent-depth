#!/usr/bin/env python3
"""潜艇 ↔ 武器兼容矩阵数据：54 艘 SSN / SSBN 全覆盖。

这是潜艇科技树与武器科技树之间唯一的连接层。规则：
  * 只有公开资料可确认的关系才使用 CONFIRMED；
  * 有公开依据但不完全确定使用 PROBABLE；
  * 纯为游戏可玩性补充的关系使用 GAMEPLAY，并在 reason 写明；
  * 资料不足或明确不适用时使用 UNKNOWN / INCOMPATIBLE。

结构：
  SUBMARINE_FITS[submarine_id] = [{'weapon','compatibility','reason','source','slot'}, ...]
  SUBMARINE_LAUNCH_INTERFACES[submarine_id] = 发射接口（发射管/垂直发射/挂点命名）

武器引用必须来自 WEAPON_ID_ROSTER.md 的 ID 契约，不得自行造名。
本文件只描述数据与表现层挂点命名，不修改任何既有潜艇模型。
"""
from __future__ import annotations

from sdw_common import TODAY

# ---------------------------------------------------------------------------
# 公开来源表
# ---------------------------------------------------------------------------
SUBMARINE_FIT_SOURCES = {
    'US_NAVY': {
        'name': 'US Navy Fact File / public submarine class references',
        'url': 'https://www.navy.mil/Resources/Fact-Files/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'US_FAS': {
        'name': 'FAS / public US submarine weapon loadout references',
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
        'name': 'FAS / public Russian submarine weapon references',
        'url': 'https://nuke.fas.org/guide/russia/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'UK_RN': {
        'name': 'Royal Navy public submarine equipment pages',
        'url': 'https://www.royalnavy.mod.uk/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'FR_DEFENSE': {
        'name': 'French Ministry of Armed Forces public submarine equipment pages',
        'url': 'https://www.defense.gouv.fr/',
        'source_type': 'public/open',
        'accessed': TODAY,
    },
    'CN_GS': {
        'name': 'Public open-source summaries of Chinese submarine weapons',
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
    'GAME_DESIGN': {
        'name': 'Silent Depth 游戏性补充（非历史事实）',
        'url': None,
        'source_type': 'gameplay',
        'accessed': TODAY,
    },
}

VALID_COMPATIBILITY = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'INCOMPATIBLE', 'UNKNOWN')


def _fit(weapon, compatibility, source, slot, reason):
    if compatibility not in VALID_COMPATIBILITY:
        raise ValueError(f'{weapon}: invalid compatibility {compatibility!r}')
    if source not in SUBMARINE_FIT_SOURCES:
        raise ValueError(f'{weapon}: unknown source key {source!r}')
    return {
        'weapon': weapon,
        'compatibility': compatibility,
        'reason': reason,
        'source': source,
        'slot': slot,
    }


def _fits(rows):
    return [_fit(*row) for row in rows]


# (weapon_id, compatibility, source_key, slot, reason)
FITS_RAW: dict[str, list[tuple]] = {
    # ===================================================================
    # 美国 SSN
    # ===================================================================
    'US_SSN_Skipjack': [
        ('US_TORP_Mk14', 'CONFIRMED', 'US_FAS', 'TORPEDO', '服役初期的主力蒸汽鱼雷。'),
        ('US_TORP_Mk16', 'PROBABLE', 'US_FAS', 'TORPEDO', '同代高速蒸汽鱼雷，公开资料未逐艇列出。'),
        ('US_TORP_Mk37', 'CONFIRMED', 'US_FAS', 'TORPEDO', '冷战早期核潜艇标准电动反潜鱼雷。'),
        ('US_TORP_Mk48', 'PROBABLE', 'US_NAVY', 'TORPEDO', '退役前的后期改装批次可能换装 Mk 48。'),
    ],
    'US_SSN_Sturgeon': [
        ('US_TORP_Mk37', 'CONFIRMED', 'US_FAS', 'TORPEDO', '服役初期主力鱼雷。'),
        ('US_TORP_Mk45', 'PROBABLE', 'US_FAS', 'TORPEDO', '同代特种反潜鱼雷，逐艇资料不完整。'),
        ('US_TORP_Mk48', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '冷战后期换装 Mk 48。'),
        ('US_ASW_SUBROC', 'CONFIRMED', 'US_FAS', 'MISSILE', '冷战时期美国核潜艇标准远程反潜武器。'),
        ('US_ASM_Harpoon', 'PROBABLE', 'US_FAS', 'MISSILE', '部分艇只改装过潜射鱼叉。'),
        ('US_LAM_Tomahawk_BlockIII', 'PROBABLE', 'US_FAS', 'MISSILE', '冷战末期部分艇只获得对陆攻击能力。'),
    ],
    'US_SSN_LosAngeles': [
        ('US_TORP_Mk48', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '全寿命主力鱼雷。'),
        ('US_TORP_Mk48_ADCAP', 'CONFIRMED', 'US_NAVY', 'TORPEDO', 'ADCAP 批次为现役标准配置。'),
        ('US_TORP_Mk48_Mod6', 'PROBABLE', 'US_NAVY', 'TORPEDO', '后期批次随 Mod 6 一起换装。'),
        ('US_ASW_SUBROC', 'CONFIRMED', 'US_FAS', 'MISSILE', '早期批次具备反潜火箭发射能力。'),
        ('US_ASM_Harpoon', 'CONFIRMED', 'US_FAS', 'MISSILE', '经发射管布放的潜射鱼叉。'),
        ('US_LAM_Tomahawk_BlockIII', 'CONFIRMED', 'US_NAVY', 'VLS', '后期批次带垂直发射装置。'),
        ('US_LAM_Tomahawk_BlockIV', 'CONFIRMED', 'US_NAVY', 'VLS', '现役批次换装战术战斧。'),
        ('US_MINE_Mk67_SLMM', 'PROBABLE', 'US_NAVY', 'TORPEDO', '发射管布放机动水雷。'),
        ('US_MINE_Mk60_CAPTOR', 'PROBABLE', 'US_NAVY', 'TORPEDO', '发射管布放封装水雷。'),
        ('US_DECOY_Mk70_MOSS', 'PROBABLE', 'US_NAVY', 'TORPEDO', '经发射管布放的声学诱饵。'),
    ],
    'US_SSN_Seawolf': [
        ('US_TORP_Mk48_Mod6', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '现役标准重型鱼雷。'),
        ('US_TORP_Mk48_Mod7', 'PROBABLE', 'US_NAVY', 'TORPEDO', '最新批次鱼雷。'),
        ('US_LAM_Tomahawk_BlockIV', 'CONFIRMED', 'US_NAVY', 'MISSILE', '经大口径发射管布放。'),
        ('US_MINE_Mk60_CAPTOR', 'PROBABLE', 'US_NAVY', 'TORPEDO', '大口径发射管可布放封装水雷。'),
        ('US_MINE_Mk67_SLMM', 'PROBABLE', 'US_NAVY', 'TORPEDO', '发射管布放机动水雷。'),
        ('US_DECOY_Mk70_MOSS', 'PROBABLE', 'US_NAVY', 'TORPEDO', '经发射管布放声学诱饵。'),
        ('US_DECOY_ADC_Mk4', 'PROBABLE', 'US_NAVY', 'TORPEDO', '现役声学对抗装置，逐艇资料不完整。'),
    ],
    'US_SSN_Virginia': [
        ('US_TORP_Mk48_Mod6', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '现役标准重型鱼雷。'),
        ('US_TORP_Mk48_Mod7', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '新批次鱼雷，公开资料已确认。'),
        ('US_TORP_Mk48_ADCAP', 'PROBABLE', 'US_NAVY', 'TORPEDO', '早期批次携带 ADCAP 级别鱼雷。'),
        ('US_LAM_Tomahawk_BlockIV', 'CONFIRMED', 'US_NAVY', 'VLS', '垂直发射装置的标准载荷。'),
        ('US_LAM_Tomahawk_BlockV', 'CONFIRMED', 'US_NAVY', 'VLS', 'Block V 及后续批次配套弹药。'),
        ('US_MINE_Mk60_CAPTOR', 'PROBABLE', 'US_NAVY', 'TORPEDO', '发射管布放水雷任务。'),
        ('US_MINE_Mk67_SLMM', 'PROBABLE', 'US_NAVY', 'TORPEDO', '发射管布放机动水雷。'),
        ('US_DECOY_ADC_Mk4', 'PROBABLE', 'US_NAVY', 'TORPEDO', '现役声学对抗装置。'),
        ('US_DECOY_ADC_Mk5', 'PROBABLE', 'US_NAVY', 'TORPEDO', '现役声学对抗装置后续批次。'),
        ('US_DECOY_Mk70_MOSS', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '现役诱饵型号未完全公开，游戏内以该型代表该类载荷。'),
        ('US_SPECIAL_DDS', 'PROBABLE', 'US_NAVY', 'SPECIAL', '部分艇只有干式遮蔽舱任务记录。'),
        ('US_SPECIAL_SDV_Mk8', 'PROBABLE', 'US_NAVY', 'SPECIAL', '配合遮蔽舱使用的输送载具。'),
        ('US_SPECIAL_ASDS', 'PROBABLE', 'US_NAVY', 'SPECIAL', '先进输送系统，公开资料显示服役期有限。'),
    ],

    # ===================================================================
    # 美国 SSBN
    # ===================================================================
    'US_SSBN_GeorgeWashington': [
        ('US_SLBM_Polaris_A1', 'CONFIRMED', 'US_FAS', 'SLBM', '首艇批次携带北极星 A1。'),
        ('US_SLBM_Polaris_A3', 'CONFIRMED', 'US_FAS', 'SLBM', '后期换装 A3。'),
        ('US_TORP_Mk14', 'CONFIRMED', 'US_FAS', 'TORPEDO', '自卫鱼雷。'),
        ('US_TORP_Mk37', 'PROBABLE', 'US_FAS', 'TORPEDO', '后期批次换装电动反潜鱼雷。'),
    ],
    'US_SSBN_EthanAllen': [
        ('US_SLBM_Polaris_A3', 'CONFIRMED', 'US_FAS', 'SLBM', '后期统一换装 A3。'),
        ('US_SLBM_Polaris_A1', 'PROBABLE', 'US_FAS', 'SLBM', '早期批次使用 A1。'),
        ('US_TORP_Mk14', 'CONFIRMED', 'US_FAS', 'TORPEDO', '自卫鱼雷。'),
        ('US_TORP_Mk37', 'PROBABLE', 'US_FAS', 'TORPEDO', '后期批次换装。'),
    ],
    'US_SSBN_Lafayette': [
        ('US_SLBM_Polaris_A3', 'CONFIRMED', 'US_FAS', 'SLBM', '服役初期携带北极星 A3。'),
        ('US_SLBM_Poseidon_C3', 'CONFIRMED', 'US_FAS', 'SLBM', '部分艇只改装为海神 C3。'),
        ('US_TORP_Mk37', 'CONFIRMED', 'US_FAS', 'TORPEDO', '自卫鱼雷。'),
        ('US_TORP_Mk48', 'PROBABLE', 'US_NAVY', 'TORPEDO', '后期改装批次可能携带 Mk 48。'),
    ],
    'US_SSBN_JamesMadison': [
        ('US_SLBM_Poseidon_C3', 'CONFIRMED', 'US_FAS', 'SLBM', '改装后主力战略武器。'),
        ('US_SLBM_Trident_C4', 'CONFIRMED', 'US_FAS', 'SLBM', '部分艇只进一步改装为三叉戟 I。'),
        ('US_TORP_Mk37', 'CONFIRMED', 'US_FAS', 'TORPEDO', '自卫鱼雷。'),
    ],
    'US_SSBN_BenjaminFranklin': [
        ('US_SLBM_Poseidon_C3', 'CONFIRMED', 'US_FAS', 'SLBM', '改装后主力战略武器。'),
        ('US_SLBM_Trident_C4', 'PROBABLE', 'US_FAS', 'SLBM', '部分艇只改装三叉戟 I，公开资料不完整。'),
        ('US_TORP_Mk37', 'CONFIRMED', 'US_FAS', 'TORPEDO', '自卫鱼雷。'),
    ],
    'US_SSBN_Ohio': [
        ('US_SLBM_Trident_C4', 'CONFIRMED', 'US_FAS', 'SLBM', '早期批次携带三叉戟 I。'),
        ('US_SLBM_Trident_D5', 'CONFIRMED', 'US_NAVY', 'SLBM', '改装后现役战略武器。'),
        ('US_SLBM_Trident_D5LE', 'CONFIRMED', 'US_NAVY', 'SLBM', '延寿批次。'),
        ('US_TORP_Mk48_ADCAP', 'CONFIRMED', 'US_NAVY', 'TORPEDO', '自卫鱼雷。'),
        ('US_DECOY_Mk70_MOSS', 'PROBABLE', 'US_NAVY', 'TORPEDO', '自卫诱饵。'),
    ],
    'US_SSBN_Columbia': [
        ('US_SLBM_Trident_D5LE', 'CONFIRMED', 'US_NAVY', 'SLBM', '公开资料确认将搭载 D5LE。'),
        ('US_TORP_Mk48_Mod7', 'PROBABLE', 'US_NAVY', 'TORPEDO', '预计沿用现役鱼雷。'),
        ('US_DECOY_ADC_Mk4', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '公开资料未细化，游戏内以现役对抗装置代表该类载荷。'),
    ],

    # ===================================================================
    # 俄罗斯 SSN
    # ===================================================================
    'RU_SSN_November': [
        ('RU_TORP_SET53', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '早期电动反潜鱼雷。'),
        ('RU_TORP_SET65', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '后期批次换装。'),
        ('RU_TORP_5365', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '同代反舰鱼雷，逐艇资料不完整。'),
    ],
    'RU_SSN_Victor': [
        ('RU_TORP_SET65', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '主力电动鱼雷。'),
        ('RU_TORP_5365K', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '反舰尾流自导鱼雷。'),
        ('RU_TORP_TEST71', 'CONFIRMED', 'RU_FAS', 'TORPEDO', '线导反潜鱼雷。'),
        ('RU_TORP_USET80', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '后期批次换装通用鱼雷。'),
        ('RU_TORP_6576', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '部分艇只有 650 毫米发射管。'),
        ('RU_ASM_P70', 'PROBABLE', 'RU_SHIPS', 'MISSILE', '公开资料显示后期批次可用发射管布放该型反舰导弹。'),
        ('RU_ASW_Vodopad', 'PROBABLE', 'RU_FAS', 'MISSILE', '后期批次具备反潜导弹能力。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自航式声学诱饵。'),
    ],
    'RU_SSN_Sierra': [
        ('RU_TORP_USET80', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '主力通用鱼雷。'),
        ('RU_TORP_TEST71M', 'CONFIRMED', 'RU_FAS', 'TORPEDO', '线导反潜鱼雷。'),
        ('RU_TORP_6576', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '650 毫米重型鱼雷。'),
        ('RU_TORP_UGST', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '现代化改装后可能换装。'),
        ('RU_TORP_Shkval', 'PROBABLE', 'RU_FAS', 'TORPEDO', '公开资料显示部分艇只有该型高速鱼雷。'),
        ('RU_ASW_Vodopad', 'CONFIRMED', 'RU_FAS', 'MISSILE', '反潜导弹发射能力。'),
        ('RU_ASM_P700', 'PROBABLE', 'RU_SHIPS', 'MISSILE', '后期批次反舰导弹能力，公开资料不完整。'),
    ],
    'RU_SSN_Akula': [
        ('RU_TORP_USET80', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '主力通用鱼雷。'),
        ('RU_TORP_TEST71M', 'CONFIRMED', 'RU_FAS', 'TORPEDO', '线导反潜鱼雷。'),
        ('RU_TORP_6576', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '650 毫米重型鱼雷。'),
        ('RU_TORP_UGST', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '现代化改装批次。'),
        ('RU_TORP_Shkval', 'PROBABLE', 'RU_FAS', 'TORPEDO', '公开资料显示具备该型鱼雷发射能力。'),
        ('RU_ASW_Vodopad', 'CONFIRMED', 'RU_FAS', 'MISSILE', '反潜导弹发射能力。'),
        ('RU_LAM_Granat', 'PROBABLE', 'RU_FAS', 'MISSILE', '经发射管布放的早期对陆攻击巡航导弹。'),
        ('RU_ASM_Kalibr_3M54', 'PROBABLE', 'RU_SHIPS', 'MISSILE', '改进批次可经发射管布放巡航导弹。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自航式声学诱饵。'),
    ],
    'RU_SSN_Yasen': [
        ('RU_TORP_UGST', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '现役主力重型鱼雷。'),
        ('RU_TORP_USET80K', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '同代通用鱼雷。'),
        ('RU_TORP_Fizik', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '新一代鱼雷，公开资料仍在更新。'),
        ('RU_TORP_Shkval', 'PROBABLE', 'RU_FAS', 'TORPEDO', '发射管兼容性公开资料有限。'),
        ('RU_ASM_Kalibr_3M54', 'CONFIRMED', 'RU_SHIPS', 'VLS', '垂直发射系统的标准载荷。'),
        ('RU_LAM_Kalibr_3M14', 'CONFIRMED', 'RU_SHIPS', 'VLS', '对陆攻击巡航导弹。'),
        ('RU_ASM_Oniks', 'CONFIRMED', 'RU_SHIPS', 'VLS', '超音速反舰导弹。'),
        ('RU_ASM_Zircon', 'PROBABLE', 'RU_FAS', 'VLS', '公开资料显示该级参与过新型高超音速导弹试验。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自航式声学诱饵。'),
    ],
    'RU_SSN_YasenM': [
        ('RU_TORP_UGST_M', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '改进型重型鱼雷。'),
        ('RU_TORP_Fizik', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '新一代鱼雷。'),
        ('RU_ASM_Kalibr_3M54', 'CONFIRMED', 'RU_SHIPS', 'VLS', '垂直发射系统载荷。'),
        ('RU_LAM_Kalibr_3M14', 'CONFIRMED', 'RU_SHIPS', 'VLS', '对陆攻击巡航导弹。'),
        ('RU_ASM_Oniks', 'CONFIRMED', 'RU_SHIPS', 'VLS', '超音速反舰导弹。'),
        ('RU_ASM_Zircon', 'PROBABLE', 'RU_FAS', 'VLS', '新一代高超音速导弹，逐艇资料仍在更新。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自航式声学诱饵。'),
    ],

    # ===================================================================
    # 俄罗斯 SSBN
    # ===================================================================
    'RU_SSBN_Hotel': [
        ('RU_SLBM_R13', 'CONFIRMED', 'RU_FAS', 'SLBM', '首代苏联潜射弹道导弹。'),
        ('RU_SLBM_R21', 'PROBABLE', 'RU_FAS', 'SLBM', '后期改装批次使用 R-21。'),
        ('RU_TORP_SET53', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
    ],
    'RU_SSBN_Yankee': [
        ('RU_SLBM_R27', 'CONFIRMED', 'RU_FAS', 'SLBM', '该级主力战略武器。'),
        ('RU_SLBM_R29', 'UNKNOWN', 'RU_FAS', 'SLBM', '部分艇只改装为其他用途，武器对应关系不确定。'),
        ('RU_TORP_SET65', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_TORP_5365K', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫反舰鱼雷。'),
    ],
    'RU_SSBN_DeltaI': [
        ('RU_SLBM_R29', 'CONFIRMED', 'RU_FAS', 'SLBM', '该级主力战略武器。'),
        ('RU_TORP_SET65', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
    ],
    'RU_SSBN_DeltaII': [
        ('RU_SLBM_R29', 'CONFIRMED', 'RU_FAS', 'SLBM', '早期批次武器。'),
        ('RU_SLBM_R29R', 'PROBABLE', 'RU_FAS', 'SLBM', '后期批次分导式型号。'),
        ('RU_TORP_SET65', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_TORP_5365K', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫反舰鱼雷。'),
    ],
    'RU_SSBN_DeltaIII': [
        ('RU_SLBM_R29R', 'CONFIRMED', 'RU_FAS', 'SLBM', '该级主力战略武器。'),
        ('RU_SLBM_R29RM', 'PROBABLE', 'RU_FAS', 'SLBM', '后期批次改装更远程型号。'),
        ('RU_TORP_USET80', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_ASW_Vodopad', 'PROBABLE', 'RU_FAS', 'MISSILE', '自卫反潜导弹。'),
    ],
    'RU_SSBN_DeltaIV': [
        ('RU_SLBM_R29RM', 'CONFIRMED', 'RU_FAS', 'SLBM', '该级主力战略武器。'),
        ('RU_SLBM_R29RMU2_Sineva', 'CONFIRMED', 'RU_FAS', 'SLBM', '换装改进型。'),
        ('RU_SLBM_R29RMU2_Liner', 'PROBABLE', 'RU_FAS', 'SLBM', '同族后续批次。'),
        ('RU_TORP_USET80', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_TORP_TEST71M', 'PROBABLE', 'RU_FAS', 'TORPEDO', '自卫线导鱼雷。'),
        ('RU_ASW_Vodopad', 'PROBABLE', 'RU_FAS', 'MISSILE', '自卫反潜导弹。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫诱饵。'),
    ],
    'RU_SSBN_Typhoon': [
        ('RU_SLBM_R29RM', 'PROBABLE', 'RU_FAS', 'SLBM', '该级真实主力型号 R-39 尚未进入武器库，当前以同代 R-29RM 作为科技树占位并标记 PROBABLE。'),
        ('RU_TORP_SET65', 'CONFIRMED', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_TORP_USET80', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '后期换装通用鱼雷。'),
        ('RU_TORP_Shkval', 'PROBABLE', 'RU_FAS', 'TORPEDO', '公开资料显示具备该型鱼雷发射能力。'),
        ('RU_ASW_Vodopad', 'CONFIRMED', 'RU_FAS', 'MISSILE', '自卫反潜导弹。'),
    ],
    'RU_SSBN_Borei': [
        ('RU_SLBM_R30_Bulava', 'CONFIRMED', 'RU_SHIPS', 'SLBM', '该级唯一战略武器。'),
        ('RU_TORP_USET80K', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫鱼雷。'),
        ('RU_TORP_UGST', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫重型鱼雷。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫诱饵。'),
    ],
    'RU_SSBN_BoreiA': [
        ('RU_SLBM_R30_Bulava', 'CONFIRMED', 'RU_SHIPS', 'SLBM', '该级唯一战略武器。'),
        ('RU_TORP_UGST_M', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫重型鱼雷。'),
        ('RU_TORP_Fizik', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '新一代自卫鱼雷。'),
        ('RU_DECOY_MG74', 'PROBABLE', 'RU_SHIPS', 'TORPEDO', '自卫诱饵。'),
    ],

    # ===================================================================
    # 英国
    # ===================================================================
    'UK_SSN_Dreadnought': [
        ('UK_TORP_Mk8', 'CONFIRMED', 'UK_RN', 'TORPEDO', '服役初期主力鱼雷。'),
        ('UK_TORP_Tigerfish', 'PROBABLE', 'UK_RN', 'TORPEDO', '后期换装线导鱼雷。'),
    ],
    'UK_SSN_Valiant': [
        ('UK_TORP_Mk8', 'CONFIRMED', 'UK_RN', 'TORPEDO', '早期主力鱼雷。'),
        ('UK_TORP_Tigerfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '换装线导鱼雷。'),
        ('UK_TORP_Spearfish', 'PROBABLE', 'UK_RN', 'TORPEDO', '退役前的后期改装。'),
        ('US_ASM_Harpoon', 'PROBABLE', 'UK_RN', 'MISSILE', '公开资料显示部分艇只携带潜射鱼叉。'),
    ],
    'UK_SSN_Swiftsure': [
        ('UK_TORP_Tigerfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '主力线导鱼雷。'),
        ('UK_TORP_Spearfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '换装重型鱼雷。'),
        ('US_ASM_Harpoon', 'PROBABLE', 'UK_RN', 'MISSILE', '潜射反舰导弹。'),
        ('US_LAM_Tomahawk_BlockIII', 'PROBABLE', 'UK_RN', 'MISSILE', '部分艇只获得对陆攻击能力。'),
        ('UK_DECOY_SSE_Mk3', 'PROBABLE', 'UK_RN', 'TORPEDO', '潜用信号发射器。'),
    ],
    'UK_SSN_Trafalgar': [
        ('UK_TORP_Spearfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '主力重型鱼雷。'),
        ('UK_TORP_Tigerfish', 'PROBABLE', 'UK_RN', 'TORPEDO', '早期批次仍携带线导鱼雷。'),
        ('US_LAM_Tomahawk_BlockIII', 'CONFIRMED', 'UK_RN', 'MISSILE', '对陆攻击巡航导弹。'),
        ('US_LAM_Tomahawk_BlockIV', 'PROBABLE', 'UK_RN', 'MISSILE', '后期换装批次。'),
        ('US_ASM_Harpoon', 'PROBABLE', 'UK_RN', 'MISSILE', '潜射反舰导弹。'),
        ('UK_DECOY_SSE_Mk3', 'PROBABLE', 'UK_RN', 'TORPEDO', '潜用信号发射器。'),
        ('UK_MINE_SeaUrchin', 'PROBABLE', 'UK_RN', 'TORPEDO', '潜艇布放水雷。'),
        ('UK_TORP_StingRay', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '公开资料以反潜机与水面舰为主，潜艇发射为游戏内假设。'),
    ],
    'UK_SSN_Astute': [
        ('UK_TORP_Spearfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '现役主力重型鱼雷。'),
        ('UK_TORP_Spearfish_Mod1', 'CONFIRMED', 'UK_RN', 'TORPEDO', '现役升级批次。'),
        ('US_LAM_Tomahawk_BlockIV', 'CONFIRMED', 'UK_RN', 'MISSILE', '现役对陆攻击巡航导弹。'),
        ('US_LAM_Tomahawk_BlockIII', 'PROBABLE', 'UK_RN', 'MISSILE', '早期批次。'),
        ('US_LAM_Tomahawk_BlockV', 'PROBABLE', 'UK_RN', 'MISSILE', '后续采购批次。'),
        ('UK_DECOY_SSE_Mk3', 'PROBABLE', 'UK_RN', 'TORPEDO', '潜用信号发射器。'),
        ('UK_TORP_StingRay', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '公开资料以反潜机与水面舰为主，潜艇发射为游戏内假设。'),
    ],
    'UK_SSN_AUKUS': [
        ('UK_TORP_Spearfish_Mod1', 'PROBABLE', 'UK_RN', 'TORPEDO', '预计沿用现役鱼雷。'),
        ('US_LAM_Tomahawk_BlockV', 'PROBABLE', 'UK_RN', 'MISSILE', '预计与现役批次同族。'),
        ('UK_TORP_StingRay', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '计划型号，游戏内补充轻型反潜选项。'),
    ],
    'UK_SSBN_Resolution': [
        ('US_SLBM_Polaris_A3', 'CONFIRMED', 'UK_RN', 'SLBM', '英国使用美制北极星 A3（A3TK 构型），共用同一武器 ID。'),
        ('UK_TORP_Mk8', 'CONFIRMED', 'UK_RN', 'TORPEDO', '自卫鱼雷。'),
        ('UK_TORP_Tigerfish', 'PROBABLE', 'UK_RN', 'TORPEDO', '后期换装。'),
    ],
    'UK_SSBN_Vanguard': [
        ('US_SLBM_Trident_D5', 'CONFIRMED', 'UK_RN', 'SLBM', '英国使用美制三叉戟 II D5，共用同一武器 ID。'),
        ('US_SLBM_Trident_D5LE', 'PROBABLE', 'UK_RN', 'SLBM', '延寿批次。'),
        ('UK_TORP_Spearfish', 'CONFIRMED', 'UK_RN', 'TORPEDO', '自卫鱼雷。'),
        ('UK_TORP_StingRay', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '游戏内补充轻型反潜选项。'),
    ],
    'UK_SSBN_Dreadnought': [
        ('US_SLBM_Trident_D5LE', 'CONFIRMED', 'UK_RN', 'SLBM', '公开资料确认将搭载延寿型三叉戟，共用美制武器 ID。'),
        ('UK_TORP_Spearfish_Mod1', 'PROBABLE', 'UK_RN', 'TORPEDO', '预计沿用现役鱼雷。'),
        ('UK_DECOY_SSE_Mk3', 'PROBABLE', 'UK_RN', 'TORPEDO', '自卫对抗装置。'),
    ],

    # ===================================================================
    # 法国
    # ===================================================================
    'FR_SSN_Rubis': [
        ('FR_TORP_L5_Mod3', 'CONFIRMED', 'FR_DEFENSE', 'TORPEDO', '服役初期主力鱼雷。'),
        ('FR_TORP_L5_Mod4', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '后期换装改进型。'),
        ('FR_TORP_F17', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '重型热动力鱼雷。'),
        ('FR_TORP_F21', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '现代化改装批次。'),
        ('FR_ASM_Exocet_SM39', 'CONFIRMED', 'FR_DEFENSE', 'MISSILE', '经发射管布放的潜射反舰导弹。'),
    ],
    'FR_SSN_Suffren': [
        ('FR_TORP_F21', 'CONFIRMED', 'FR_DEFENSE', 'TORPEDO', '现役主力重型鱼雷。'),
        ('FR_ASM_Exocet_SM39', 'CONFIRMED', 'FR_DEFENSE', 'MISSILE', '潜射反舰导弹。'),
        ('FR_TORP_F17', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '同代重型鱼雷。'),
        ('FR_LAM_MdCN', 'CONFIRMED', 'FR_DEFENSE', 'MISSILE', '现役对陆攻击巡航导弹，经发射管布放。'),
    ],
    'FR_SSBN_LeRedoutable': [
        ('FR_SLBM_M4', 'CONFIRMED', 'FR_DEFENSE', 'SLBM', '该级后期主力战略武器。'),
        ('FR_SLBM_M20', 'PROBABLE', 'FR_DEFENSE', 'SLBM', '早期批次战略武器。'),
        ('FR_SLBM_M45', 'UNKNOWN', 'FR_DEFENSE', 'SLBM', 'M45 主要与后一级配套，对应关系不确定。'),
        ('FR_TORP_L5_Mod3', 'CONFIRMED', 'FR_DEFENSE', 'TORPEDO', '自卫鱼雷。'),
        ('FR_ASM_Exocet_SM39', 'PROBABLE', 'FR_DEFENSE', 'MISSILE', '自卫反舰导弹。'),
    ],
    'FR_SSBN_LeTriomphant': [
        ('FR_SLBM_M45', 'CONFIRMED', 'FR_DEFENSE', 'SLBM', '早期批次战略武器。'),
        ('FR_SLBM_M51', 'CONFIRMED', 'FR_DEFENSE', 'SLBM', '换装后现役战略武器。'),
        ('FR_TORP_F21', 'CONFIRMED', 'FR_DEFENSE', 'TORPEDO', '自卫鱼雷。'),
        ('FR_TORP_F17', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '早期批次自卫鱼雷。'),
        ('FR_ASM_Exocet_SM39', 'PROBABLE', 'FR_DEFENSE', 'MISSILE', '自卫反舰导弹。'),
    ],
    'FR_SSBN_SNLE3G': [
        ('FR_SLBM_M51', 'CONFIRMED', 'FR_DEFENSE', 'SLBM', '公开资料确认将搭载 M51 系列导弹。'),
        ('FR_TORP_F21', 'PROBABLE', 'FR_DEFENSE', 'TORPEDO', '预计沿用现役鱼雷。'),
        ('FR_ASM_Exocet_SM39', 'PROBABLE', 'FR_DEFENSE', 'MISSILE', '预计沿用现役反舰导弹。'),
    ],

    # ===================================================================
    # 中国
    # ===================================================================
    'CN_SSN_Type091': [
        ('CN_TORP_Yu1', 'PROBABLE', 'CN_GS', 'TORPEDO', '早期仿制蒸汽鱼雷，逐艇资料不完整。'),
        ('CN_TORP_Yu3', 'CONFIRMED', 'CN_GS', 'TORPEDO', '主力电动声自导鱼雷。'),
        ('CN_TORP_Yu4', 'PROBABLE', 'CN_GS', 'TORPEDO', '同代热动力鱼雷。'),
    ],
    'CN_SSN_Type093': [
        ('CN_TORP_Yu3', 'CONFIRMED', 'CN_GS', 'TORPEDO', '主力鱼雷。'),
        ('CN_TORP_Yu4', 'PROBABLE', 'CN_GS', 'TORPEDO', '同代热动力鱼雷。'),
        ('CN_TORP_Yu6', 'PROBABLE', 'CN_GS', 'TORPEDO', '后期批次换装现代鱼雷。'),
        ('CN_ASM_YJ8', 'PROBABLE', 'CN_GS', 'MISSILE', '公开资料显示早期批次具备潜射反舰导弹能力。'),
        ('CN_ASW_CY1', 'PROBABLE', 'CN_GS', 'MISSILE', '公开资料显示具备潜射反潜导弹能力。'),
    ],
    'CN_SSN_Type093A': [
        ('CN_TORP_Yu6', 'CONFIRMED', 'CN_GS', 'TORPEDO', '现役主力鱼雷。'),
        ('CN_ASM_YJ8', 'CONFIRMED', 'CN_GS', 'MISSILE', '潜射反舰巡航导弹。'),
        ('CN_ASM_YJ18', 'PROBABLE', 'CN_GS', 'MISSILE', '公开资料显示后续批次具备该型导弹能力。'),
        ('CN_ASW_CY1', 'PROBABLE', 'CN_GS', 'MISSILE', '潜射反潜导弹。'),
    ],
    'CN_SSN_Type093B': [
        ('CN_TORP_Yu6', 'CONFIRMED', 'CN_GS', 'TORPEDO', '现役主力鱼雷。'),
        ('CN_ASM_YJ18', 'CONFIRMED', 'CN_GS', 'VLS', '垂直发射系统载荷。'),
        ('CN_LAM_YJ18_LandAttack', 'PROBABLE', 'CN_GS', 'VLS', '对陆攻击分支。'),
        ('CN_TORP_Yu7', 'PROBABLE', 'CN_GS', 'TORPEDO', '轻型反潜鱼雷。'),
    ],
    'CN_SSN_Type095': [
        ('CN_TORP_Yu6', 'PROBABLE', 'CN_GS', 'TORPEDO', '现役鱼雷的延续型号。'),
        ('CN_ASM_YJ18', 'GAMEPLAY', 'GAME_DESIGN', 'VLS', '计划型号，游戏内按现役同类武器配置。'),
        ('CN_LAM_YJ18_LandAttack', 'GAMEPLAY', 'GAME_DESIGN', 'VLS', '计划型号，游戏内按现役同类武器配置。'),
    ],
    'CN_SSBN_Type092': [
        ('CN_SLBM_JL1', 'CONFIRMED', 'CN_GS', 'SLBM', '该级战略武器。'),
        ('CN_TORP_Yu3', 'CONFIRMED', 'CN_GS', 'TORPEDO', '自卫鱼雷。'),
    ],
    'CN_SSBN_Type094': [
        ('CN_SLBM_JL2', 'CONFIRMED', 'CN_GS', 'SLBM', '该级战略武器。'),
        ('CN_TORP_Yu6', 'PROBABLE', 'CN_GS', 'TORPEDO', '自卫鱼雷。'),
        ('CN_TORP_Yu7', 'PROBABLE', 'CN_GS', 'TORPEDO', '自卫轻型反潜鱼雷。'),
    ],
    'CN_SSBN_Type094A': [
        ('CN_SLBM_JL2', 'CONFIRMED', 'CN_GS', 'SLBM', '该级战略武器。'),
        ('CN_TORP_Yu6', 'PROBABLE', 'CN_GS', 'TORPEDO', '自卫鱼雷。'),
        ('CN_TORP_Yu7', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '游戏内补充轻型反潜选项。'),
    ],
    'CN_SSBN_Type096': [
        ('CN_SLBM_JL3', 'CONFIRMED', 'CN_GS', 'SLBM', '公开资料显示该级配套新一代潜射弹道导弹。'),
        ('CN_TORP_Yu7', 'GAMEPLAY', 'GAME_DESIGN', 'TORPEDO', '计划型号，游戏内补充轻型反潜选项。'),
    ],

    # ===================================================================
    # 印度
    # ===================================================================
    'IN_SSBN_Arihant': [
        ('IN_SLBM_K15', 'CONFIRMED', 'IN_DRDO', 'SLBM', '首艇批次战略武器。'),
        ('IN_SLBM_K4', 'PROBABLE', 'IN_DRDO', 'SLBM', '后续批次换装中程型号。'),
        ('IN_TORP_TAL', 'PROBABLE', 'IN_DRDO', 'TORPEDO', '自卫鱼雷。'),
        ('IN_TORP_Varunastra', 'PROBABLE', 'IN_DRDO', 'TORPEDO', '国产重型鱼雷。'),
    ],
    'IN_SSBN_Arighaat': [
        ('IN_SLBM_K4', 'CONFIRMED', 'IN_DRDO', 'SLBM', '该级战略武器。'),
        ('IN_SLBM_K15', 'PROBABLE', 'IN_DRDO', 'SLBM', '早期批次。'),
        ('IN_TORP_Varunastra', 'PROBABLE', 'IN_DRDO', 'TORPEDO', '自卫鱼雷。'),
    ],
    'IN_SSBN_S4': [
        ('IN_SLBM_K4', 'CONFIRMED', 'IN_DRDO', 'SLBM', '该级战略武器。'),
        ('IN_TORP_Varunastra', 'PROBABLE', 'IN_DRDO', 'TORPEDO', '自卫鱼雷。'),
        ('IN_SLBM_K5', 'GAMEPLAY', 'GAME_DESIGN', 'SLBM', '下一代计划型号，游戏内作为进阶节点。'),
    ],
    'IN_SSBN_S5': [
        ('IN_SLBM_K5', 'GAMEPLAY', 'GAME_DESIGN', 'SLBM', '计划型号，游戏内作为顶级战略节点。'),
        ('IN_SLBM_K4', 'PROBABLE', 'IN_DRDO', 'SLBM', '过渡批次。'),
        ('IN_TORP_Varunastra', 'PROBABLE', 'IN_DRDO', 'TORPEDO', '自卫鱼雷。'),
    ],
}

SUBMARINE_FITS: dict[str, list[dict]] = {
    submarine: _fits(rows) for submarine, rows in FITS_RAW.items()
}


# ---------------------------------------------------------------------------
# 发射接口：公开资料中的发射管与垂直发射数据。
# 每条记录：(鱼雷管数量, 口径mm, 置信度, SLBM 筒数量, 垂直发射单元, 备注)
# ---------------------------------------------------------------------------
INTERFACE_RAW: dict[str, tuple] = {
    'US_SSN_Skipjack': (6, 533, 'PUBLIC', None, 0, ''),
    'US_SSN_Sturgeon': (4, 533, 'PUBLIC', None, 0, ''),
    'US_SSN_LosAngeles': (4, 533, 'PUBLIC', None, 12, '后期批次带 12 单元垂直发射装置。'),
    'US_SSN_Seawolf': (8, 660, 'PUBLIC', None, 0, '大口径发射管；对陆攻击导弹经发射管布放。'),
    'US_SSN_Virginia': (4, 533, 'PUBLIC', None, 12, 'Block I-III 为 12 单元；Block V 增加大型载荷管。'),
    'US_SSBN_GeorgeWashington': (4, 533, 'PUBLIC', 16, 0, ''),
    'US_SSBN_EthanAllen': (4, 533, 'PUBLIC', 16, 0, ''),
    'US_SSBN_Lafayette': (4, 533, 'PUBLIC', 16, 0, ''),
    'US_SSBN_JamesMadison': (4, 533, 'PUBLIC', 16, 0, ''),
    'US_SSBN_BenjaminFranklin': (4, 533, 'PUBLIC', 16, 0, ''),
    'US_SSBN_Ohio': (4, 533, 'PUBLIC', 24, 0, '改装后部分发射管转为其他载荷。'),
    'US_SSBN_Columbia': (4, 533, 'ESTIMATED', 16, 0, ''),
    'RU_SSN_November': (6, 533, 'PUBLIC', None, 0, ''),
    'RU_SSN_Victor': (6, 533, 'PUBLIC', None, 0, '部分艇混装 650 毫米发射管。'),
    'RU_SSN_Sierra': (6, 533, 'PUBLIC', None, 0, '包含 650 毫米发射管。'),
    'RU_SSN_Akula': (8, 533, 'PUBLIC', None, 0, '含 650 毫米大口径发射管。'),
    'RU_SSN_Yasen': (10, 533, 'PUBLIC', None, 32, '垂直发射装置的单元数量为公开报道的级别。'),
    'RU_SSN_YasenM': (10, 533, 'ESTIMATED', None, 32, ''),
    'RU_SSBN_Hotel': (6, 533, 'PUBLIC', 3, 0, ''),
    'RU_SSBN_Yankee': (6, 533, 'PUBLIC', 16, 0, ''),
    'RU_SSBN_DeltaI': (6, 533, 'PUBLIC', 12, 0, ''),
    'RU_SSBN_DeltaII': (6, 533, 'PUBLIC', 16, 0, ''),
    'RU_SSBN_DeltaIII': (6, 533, 'PUBLIC', 16, 0, ''),
    'RU_SSBN_DeltaIV': (4, 533, 'PUBLIC', 16, 0, ''),
    'RU_SSBN_Typhoon': (6, 533, 'PUBLIC', 20, 0, ''),
    'RU_SSBN_Borei': (6, 533, 'PUBLIC', 16, 0, ''),
    'RU_SSBN_BoreiA': (6, 533, 'ESTIMATED', 16, 0, ''),
    'UK_SSN_Dreadnought': (6, 533, 'PUBLIC', None, 0, ''),
    'UK_SSN_Valiant': (6, 533, 'PUBLIC', None, 0, ''),
    'UK_SSN_Swiftsure': (5, 533, 'PUBLIC', None, 0, ''),
    'UK_SSN_Trafalgar': (5, 533, 'PUBLIC', None, 0, ''),
    'UK_SSN_Astute': (6, 533, 'PUBLIC', None, 0, '对陆攻击导弹经发射管布放，无独立垂直发射装置。'),
    'UK_SSN_AUKUS': (6, 533, 'ESTIMATED', None, 0, ''),
    'UK_SSBN_Resolution': (6, 533, 'PUBLIC', 16, 0, ''),
    'UK_SSBN_Vanguard': (4, 533, 'PUBLIC', 16, 0, ''),
    'UK_SSBN_Dreadnought': (4, 533, 'ESTIMATED', 12, 0, '发射筒数量为公开报道的级别近似。'),
    'FR_SSN_Rubis': (4, 533, 'PUBLIC', None, 0, ''),
    'FR_SSN_Suffren': (4, 533, 'PUBLIC', None, 0, '巡航导弹经发射管布放。'),
    'FR_SSBN_LeRedoutable': (4, 533, 'PUBLIC', 16, 0, ''),
    'FR_SSBN_LeTriomphant': (4, 533, 'PUBLIC', 16, 0, ''),
    'FR_SSBN_SNLE3G': (4, 533, 'ESTIMATED', 16, 0, ''),
    'CN_SSN_Type091': (6, 533, 'PUBLIC', None, 0, ''),
    'CN_SSN_Type093': (6, 533, 'PUBLIC', None, 0, ''),
    'CN_SSN_Type093A': (6, 533, 'PUBLIC', None, 0, ''),
    'CN_SSN_Type093B': (6, 533, 'PUBLIC', None, 12, '垂直发射单元数量为公开报道的级别近似。'),
    'CN_SSN_Type095': (6, 533, 'ESTIMATED', None, 12, ''),
    'CN_SSBN_Type092': (6, 533, 'PUBLIC', 12, 0, ''),
    'CN_SSBN_Type094': (6, 533, 'PUBLIC', 12, 0, ''),
    'CN_SSBN_Type094A': (6, 533, 'PUBLIC', 12, 0, ''),
    'CN_SSBN_Type096': (6, 533, 'ESTIMATED', 16, 0, ''),
    'IN_SSBN_Arihant': (6, 533, 'ESTIMATED', 4, 0, ''),
    'IN_SSBN_Arighaat': (6, 533, 'ESTIMATED', 4, 0, ''),
    'IN_SSBN_S4': (6, 533, 'ESTIMATED', 4, 0, ''),
    'IN_SSBN_S5': (6, 533, 'ESTIMATED', 4, 0, ''),
}


def _socket_prefix(kind: str) -> str:
    return {
        'TORPEDO_TUBE': 'TORPEDO',
        'MISSILE_TUBE': 'MISSILE',
        'SLBM_TUBE': 'SLBM',
        'VLS': 'VLS',
    }[kind]


# 大口径（650 毫米）发射管：公开资料可确认的补充接口。
# Akula / Sierra 的 650 毫米发射管为公开资料确认；Victor 仅部分批次（671RTM）具备，
# 因此标记为 PROBABLE。这一项用于消除"650 毫米鱼雷被标为兼容、但接口里没有 650 毫米插座"
# 的数据矛盾（审查结论 P1-5）。
LARGE_TUBE_RAW = {
    'RU_SSN_Akula': (4, 650, 'PUBLIC'),
    'RU_SSN_Sierra': (2, 650, 'PUBLIC'),
    'RU_SSN_Victor': (2, 650, 'PROBABLE'),
}


def _socket_block(kind, count, diameter_mm, location, confidence, sources):
    block = []
    for index in range(1, int(count) + 1):
        block.append({
            'socket': f'SOCKET_{_socket_prefix(kind)}_{index:02d}',
            'kind': kind,
            'location': location,
            'diameter_mm': diameter_mm,
            'confidence': confidence,
            'sources': list(sources),
        })
    return block


def _interface(country_sources, raw, submarine=None):
    tubes, diameter, confidence, slbm_tubes, vls_cells, note = raw
    sockets = _socket_block('TORPEDO_TUBE', tubes, diameter, 'bow', confidence, country_sources)
    large_tubes = LARGE_TUBE_RAW.get(submarine or '')
    if large_tubes:
        large_count, large_diameter, large_confidence = large_tubes
        sockets.extend(_socket_block('TORPEDO_TUBE', large_count, large_diameter, 'bow',
                                     large_confidence, country_sources))
    if slbm_tubes:
        sockets.extend(_socket_block('SLBM_TUBE', slbm_tubes, None, 'sail', confidence, country_sources))
    if vls_cells:
        sockets.extend(_socket_block('VLS', vls_cells, None, 'hull', confidence, country_sources))
    # 封装导弹同样由鱼雷发射管发射：为具备管射导弹适配关系的平台补出 MISSILE 插座，
    # 与 build_loadout.py 的 MISSILE 槽位对应。
    missile_sockets = []
    for row in FITS_RAW.get(submarine or '', []):
        if len(row) >= 4 and row[3] == 'MISSILE':
            missile_sockets = _socket_block('MISSILE_TUBE', tubes, diameter, 'bow', confidence, country_sources)
            break
    sockets.extend(missile_sockets)
    return {
        'torpedo_tubes': {
            'count': tubes,
            'diameter_mm': diameter,
            'confidence': confidence,
            'sources': list(country_sources),
        },
        'missile_tubes': {
            'count': vls_cells or None,
            'diameter_mm': None,
            'confidence': confidence if vls_cells else 'UNKNOWN',
            'sources': list(country_sources) if vls_cells else [],
        },
        'vertical_launch': {
            'present': bool(vls_cells),
            'cells': vls_cells or None,
            'confidence': confidence if vls_cells else 'UNKNOWN',
            'sources': list(country_sources) if vls_cells else [],
        },
        'slbm_tubes': slbm_tubes,
        'large_tubes': (
            {'count': large_tubes[0], 'diameter_mm': large_tubes[1], 'confidence': large_tubes[2]}
            if large_tubes else None
        ),
        'tube_diameters_mm': sorted({diameter} | ({large_tubes[1]} if large_tubes else set())),
        'payload_modules': [],
        'weapon_sockets': sockets,
        'notes': note,
    }


_SUBMARINE_SOURCE_KEYS: dict[str, list[str]] = {}
for _submarine, _rows in FITS_RAW.items():
    _keys = []
    for _row in _rows:
        if _row[2] not in _keys:
            _keys.append(_row[2])
    _SUBMARINE_SOURCE_KEYS[_submarine] = _keys or ['GAME_DESIGN']

SUBMARINE_LAUNCH_INTERFACES: dict[str, dict] = {
    submarine: _interface(_SUBMARINE_SOURCE_KEYS[submarine], raw, submarine)
    for submarine, raw in INTERFACE_RAW.items()
}


def fit_summary() -> dict:
    levels = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'INCOMPATIBLE', 'UNKNOWN')
    relations = [entry for rows in SUBMARINE_FITS.values() for entry in rows]
    return {
        'submarines': len(SUBMARINE_FITS),
        'relations': len(relations),
        'by_level': {level: sum(1 for e in relations if e['compatibility'] == level) for level in levels},
        'by_slot': {
            slot: sum(1 for e in relations if e['slot'] == slot)
            for slot in sorted({e['slot'] for e in relations})
        },
    }
