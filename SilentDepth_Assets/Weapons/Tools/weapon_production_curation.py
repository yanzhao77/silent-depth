#!/usr/bin/env python3
"""3D 资产生产决策表。

数据层允许作者标注意图优先级（asset_priority），但「这一轮实际建模哪些武器」
是一个独立的取舍：武器库里 118 个变体全部建模会造成资产爆炸（规范第 97 条明确
禁止），因此这里显式声明本轮进入 3D 生产的集合，并给出理由。

落选的高价值武器标记为 DEFERRED（后续批次），DATABASE_ONLY 保持不建模。
"""
from __future__ import annotations

# 本轮进入 3D 生产的武器（覆盖 T1-T10 主线与用户点名的高优先级型号）
MODEL_NOW: dict[str, str] = {
    # 鱼雷：鱼雷树的层级骨架 + 用户点名型号
    'US_TORP_Mk14': '鱼雷树 T1 起点节点，早期蒸汽鱼雷外形代表。',
    'US_TORP_Mk37': 'T3 冷战早期美国反潜鱼雷，覆盖早期 SSN 与 SSBN 自卫武器。',
    'US_TORP_Mk48_ADCAP': '用户点名；美国核潜艇现役主力鱼雷的代表型号。',
    'US_TORP_Mk48_Mod7': 'Mk 48 家族最新变体，与 ADCAP 共享弹体但标记与控制段不同。',
    'RU_TORP_TEST71': '用户点名；苏联线导鱼雷代表，覆盖多型俄罗斯潜艇。',
    'RU_TORP_UGST': '用户点名；俄罗斯现代热动力重型鱼雷。',
    'RU_TORP_5365K': '尾流自导反舰鱼雷，俄罗斯反舰分支的视觉代表。',
    'RU_TORP_6576': '650 毫米大口径分支，Akula/Sierra 平台差异化的关键资产。',
    'RU_TORP_Shkval': '超空泡火箭鱼雷，外形与常规鱼雷完全不同。',
    'UK_TORP_Spearfish': '用户点名；英国泵喷推进鱼雷代表。',
    'FR_TORP_F21': '用户点名；法国现代重型鱼雷（光纤线导 + 泵喷）。',
    'CN_TORP_Yu6': '用户点名的代表性中国潜艇鱼雷。',
    'IN_TORP_Varunastra': '用户点名；印度主力重型鱼雷。',
    # 反舰导弹
    'RU_ASM_P700': '用户点名；大型超音速反舰导弹，外形最具辨识度。',
    'RU_ASM_Oniks': '用户点名；俄罗斯现役通用反舰导弹。',
    'RU_ASM_Kalibr_3M54': '用户点名；Kalibr 家族反舰变体。',
    'US_ASM_Harpoon': '用户点名；潜射 Harpoon 代表型号。',
    'CN_ASM_YJ18': '中国潜射/垂直发射反舰导弹代表。',
    # 对陆攻击
    'US_LAM_Tomahawk_BlockIV': '用户点名；现代核潜艇主力巡航导弹。',
    'US_LAM_Tomahawk_BlockV': 'Tomahawk 最新批次，与 Block IV 共享几何、标记不同。',
    'FR_LAM_MdCN': '法国海基巡航导弹，覆盖 Suffren 级核心打击手段。',
    # 反潜导弹
    'US_ASW_SUBROC': '反潜导弹类别的唯一高价值历史资产。',
    # 弹道导弹
    'US_SLBM_Trident_D5': '用户点名 Trident II；美国/英国 SSBN 通用武器。',
    'RU_SLBM_R39': 'Typhoon/Project 941 的核心武器，与既有 Typhoon 资产直接配套。',
    'RU_SLBM_R30_Bulava': '用户点名；Borei 级主力 SLBM。',
    'CN_SLBM_JL2': '中国 SSBN 现役 SLBM。',
    'CN_SLBM_JL3': '用户点名；中国新一代 SLBM。',
    'IN_SLBM_K4': '用户点名；印度 K-4。',
    # 其他类别代表
    'US_MINE_Mk67_SLMM': '水雷类别中可直接由潜艇布放的代表资产。',
    'US_DECOY_Mk70_MOSS': '诱饵类别中视觉与玩法价值最高的资产。',
    'US_SPECIAL_DDS': '特种载荷类别的核心外形资产（干式甲板掩蔽舱）。',
    # 第二批：SLBM 与远程导弹的层级骨架（覆盖 T1-T9 的 SSBN 主线与 ASM 远程分支）
    'US_SLBM_Polaris_A3': 'Polaris 家族代表，覆盖第一代美国 SSBN 与英国 Resolution 级。',
    'US_SLBM_Poseidon_C3': 'Poseidon C3，连接 Polaris 与 Trident 的中间层级节点。',
    'US_SLBM_Trident_C4': 'Trident I，用于区分 C4 与 D5 两代弹体长度。',
    'RU_SLBM_R13': '苏联第一代液体燃料 SLBM，Hotel 级配套武器。',
    'RU_SLBM_R27': 'Yankee 级主力 SLBM。',
    'RU_SLBM_R29R': 'Delta III 级 SLBM。',
    'RU_SLBM_R29RM': 'Delta IV 级 SLBM。',
    'RU_SLBM_R29RMU2_Sineva': 'Delta IV 现代化批次使用的 SLBM。',
    'FR_SLBM_M4': '法国第二代 SLBM，Le Redoutable 级后期武器。',
    'FR_SLBM_M51': '法国现役 SLBM，Le Triomphant 与 SNLE 3G 的核心武器。',
    'CN_SLBM_JL1': '中国第一代 SLBM，Type 092 配套武器。',
    'IN_SLBM_K15': '印度歼敌者级的初始武器。',
    'RU_ASM_P500': '冷战大型超音速反舰导弹，与 P-700 形成层级对照。',
    'RU_ASM_Zircon': '新一代高超音速反舰导弹，科技树 T9-T10 分支。',
    'UK_TORP_Tigerfish': '英国线导鱼雷一代，连接 Mk 8 与 Spearfish。',
}


MODEL_EXTENDED_REASON = (
    '第二批：数据完整且与既有潜艇平台存在兼容关系的非数据库条目，'
    '在第一批完成后按同一管线补建，避免资产库出现只存在于表里的空洞。'
)


def decision_for(weapon_id: str, asset_priority: str) -> str:
    if asset_priority == 'DATABASE_ONLY':
        return 'DATABASE_ONLY'
    if weapon_id in MODEL_NOW:
        return 'MODEL_NOW'
    return 'MODEL_EXTENDED'


def reason_for(weapon_id: str) -> str:
    return MODEL_NOW.get(weapon_id, MODEL_EXTENDED_REASON)


def production_set() -> tuple[str, ...]:
    """本轮实际建模的全部武器（第一批 + 第二批），由数据集显式声明，不依赖磁盘状态。"""
    from weapon_dataset import VARIANTS_BY_ID

    return tuple(sorted(
        weapon_id for weapon_id, variant in VARIANTS_BY_ID.items()
        if variant.get('production_decision') in ('MODEL_NOW', 'MODEL_EXTENDED')
    ))
