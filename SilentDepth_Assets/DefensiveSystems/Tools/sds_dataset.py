#!/usr/bin/env python3
"""Single source of truth for the SILENT DEPTH global submarine defensive system tree.

Scope and policy
----------------
This is a *game technology tree*: families, tiers, visual assets, sockets and
platform compatibility. It deliberately contains no real electronic-attack
parameters, no frequencies, no jamming power, no deception logic, no torpedo
evasion procedure and no engagement tactics. Combat-relevant numbers belong to
the gameplay balance phase, not to this asset library.

Public-source discipline
------------------------
Every variant may carry an ``anchor`` (the real-world system it visually and
narratively stands for). An anchor is only recorded when a public source was
actually read; otherwise the variant is explicitly ``GAMEPLAY`` (a game
construction) or ``UNKNOWN``. Missing research never turns into a guess.

Research merge
--------------
``Documentation/defensive_system_research.json`` (produced by the research pass)
is merged on import. It can raise a variant/row from UNKNOWN to PROBABLE or
CONFIRMED, and it supplies the ``sources`` lists. It can never remove an entry.
"""
from __future__ import annotations

from sds_common import COUNTRY_CODE, DOC_DIR, load_json

COUNTRIES = ('USA', 'Russia', 'UK', 'France', 'China', 'India')

# --------------------------------------------------------------------------
# 1. Branches (top level of the tree; section 18 of the requirement)
# --------------------------------------------------------------------------
BRANCHES = [
    {'branch_id': 'ESM', 'label': 'ESM', 'label_zh': '电子支援措施',
     'summary_zh': '被动截获、分类与整合的电子支援措施谱系。',
     'target_dir': 'ESM'},
    {'branch_id': 'THREAT_WARNING', 'label': 'Threat Warning', 'label_zh': '威胁告警',
     'summary_zh': '雷达告警、电子威胁告警、主动声呐告警、鱼雷告警与声学威胁分类。',
     'target_dir': 'ThreatWarning'},
    {'branch_id': 'ACOUSTIC_COUNTERMEASURE', 'label': 'Acoustic Countermeasure', 'label_zh': '声学对抗',
     'summary_zh': '噪声弹、声学诱饵、鱼雷诱饵、机动诱饵到整合声学防御。',
     'target_dir': 'AcousticCountermeasure'},
    {'branch_id': 'DECOY', 'label': 'Decoy', 'label_zh': '诱饵',
     'summary_zh': '被动、主动、声学、鱼雷、机动与先进诱饵谱系。',
     'target_dir': 'Decoys'},
    {'branch_id': 'NOISE_MAKER', 'label': 'Noise Maker', 'label_zh': '噪声弹',
     'summary_zh': '早期到先进的噪声源谱系。',
     'target_dir': 'NoiseMakers'},
    {'branch_id': 'TORPEDO_DEFENSE', 'label': 'Torpedo Defense', 'label_zh': '鱼雷防御',
     'summary_zh': '告警—对抗—先进对抗—整合鱼雷防御。',
     'target_dir': 'TorpedoDefense'},
    {'branch_id': 'LAUNCHER', 'label': 'Countermeasure Launcher', 'label_zh': '对抗发射装置',
     'summary_zh': '外部发射器、对抗管、声学装置发射器到整合发射系统。',
     'target_dir': 'Launchers'},
    {'branch_id': 'DEFENSIVE_CONTROL', 'label': 'Defensive Control', 'label_zh': '防御控制',
     'summary_zh': '控制台、整合控制、自动化防御控制。',
     'target_dir': 'Control'},
    {'branch_id': 'INTEGRATED_DEFENSE', 'label': 'Integrated Defense', 'label_zh': '整合防御',
     'summary_zh': '把上述分支整合为单一防御系统身份。',
     'target_dir': 'Control'},
]

BRANCH_BY_ID = {branch['branch_id']: branch for branch in BRANCHES}

# --------------------------------------------------------------------------
# 2. Families. tier_min/tier_max place the family on the T1-T10 ladder.
#    ``anchor_hint`` is a candidate real-world identity; research may promote it
#    to a published anchor with sources.
# --------------------------------------------------------------------------
FAMILIES = [
    # --- ESM -------------------------------------------------------------
    {'family_id': 'ESM-BASIC-DETECTION', 'branch': 'ESM', 'label': 'Basic Signal Detection',
     'label_zh': '基础信号截获', 'tier_min': 1, 'tier_max': 2, 'era': '1960s-1970s',
     'summary_zh': '最基础的艇载电子信号截获，只提供“有信号”级别的告警。',
     'anchor_hint': None},
    {'family_id': 'ESM-IMPROVED-DETECTION', 'branch': 'ESM', 'label': 'Improved Detection',
     'label_zh': '改进型截获', 'tier_min': 2, 'tier_max': 3, 'era': '1970s',
     'summary_zh': '提高截获灵敏度与方位覆盖的改进代。', 'anchor_hint': None},
    {'family_id': 'ESM-CLASSIFICATION', 'branch': 'ESM', 'label': 'Signal Classification',
     'label_zh': '信号分类', 'tier_min': 3, 'tier_max': 4, 'era': '1970s-1980s',
     'summary_zh': '引入信号分类能力，把“有信号”提升为“某种威胁”。', 'anchor_hint': None},
    {'family_id': 'ESM-DIGITAL', 'branch': 'ESM', 'label': 'Digital ESM',
     'label_zh': '数字式 ESM', 'tier_min': 4, 'tier_max': 6, 'era': '1980s-1990s',
     'summary_zh': '数字接收与处理架构的 ESM 世代。',
     'anchor_hint': {'USA': 'AN/BLQ-10'}},
    {'family_id': 'ESM-MULTIBAND', 'branch': 'ESM', 'label': 'Multi-Band ESM',
     'label_zh': '多频段 ESM', 'tier_min': 5, 'tier_max': 7, 'era': '1990s-2000s',
     'summary_zh': '覆盖多频段的截获与测向能力。', 'anchor_hint': None},
    {'family_id': 'ESM-INTEGRATED', 'branch': 'ESM', 'label': 'Integrated ESM',
     'label_zh': '整合式 ESM', 'tier_min': 6, 'tier_max': 8, 'era': '2000s',
     'summary_zh': 'ESM 与艇载其他传感器共享同一处理与显控链路。', 'anchor_hint': None},
    {'family_id': 'ESM-ADVANCED-THREAT-WARNING', 'branch': 'ESM', 'label': 'Advanced Threat Warning',
     'label_zh': '先进威胁告警', 'tier_min': 7, 'tier_max': 9, 'era': '2000s-2010s',
     'summary_zh': '以 ESM 为核心的先进威胁告警层。', 'anchor_hint': None},
    {'family_id': 'ESM-MULTISENSOR-FUSION', 'branch': 'ESM', 'label': 'Multi-Sensor Fusion',
     'label_zh': '多传感器融合', 'tier_min': 8, 'tier_max': 10, 'era': '2010s',
     'summary_zh': '电子支援与声学、光电信息的融合层。', 'anchor_hint': None},
    {'family_id': 'ESM-ADVANCED-EW', 'branch': 'ESM', 'label': 'Advanced Integrated EW',
     'label_zh': '先进整合电子战', 'tier_min': 9, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '整合式电子战套件的游戏身份。', 'anchor_hint': None},
    {'family_id': 'ESM-NEXTGEN', 'branch': 'ESM', 'label': 'Next Generation Defensive Electronic System',
     'label_zh': '下一代防御电子系统', 'tier_min': 10, 'tier_max': 10, 'era': '2020s+',
     'summary_zh': '下一代软件定义防御电子系统的游戏身份。', 'anchor_hint': None},
    # --- Threat warning ---------------------------------------------------
    {'family_id': 'TW-RADAR-WARNING', 'branch': 'THREAT_WARNING', 'label': 'Radar Warning',
     'label_zh': '雷达告警', 'tier_min': 1, 'tier_max': 4, 'era': '1960s-1980s',
     'summary_zh': '对雷达照射的告警接收。',
     # The earlier AN/WLR-9 candidate was checked against a public source and
     # turned out to be an acoustic intercept receiver, not radar warning, so
     # this family keeps no public anchor until one is actually documented.
     'anchor_hint': None},
    {'family_id': 'TW-ELECTRONIC-WARNING', 'branch': 'THREAT_WARNING', 'label': 'Electronic Threat Warning',
     'label_zh': '电子威胁告警', 'tier_min': 3, 'tier_max': 6, 'era': '1970s-1990s',
     'summary_zh': '把电子截获结果升格为威胁等级告警。', 'anchor_hint': None},
    {'family_id': 'TW-ACTIVE-SONAR-WARNING', 'branch': 'THREAT_WARNING', 'label': 'Active Sonar Warning',
     'label_zh': '主动声呐告警', 'tier_min': 4, 'tier_max': 7, 'era': '1980s-2000s',
     'summary_zh': '对主动声呐照射的截获与告警（声学截获接收机）。',
     'anchor_hint': {'USA': 'AN/WLR-9'}},
    {'family_id': 'TW-TORPEDO-WARNING', 'branch': 'THREAT_WARNING', 'label': 'Torpedo Warning',
     'label_zh': '鱼雷告警', 'tier_min': 5, 'tier_max': 9, 'era': '1980s-2010s',
     'summary_zh': '对来袭鱼雷的告警层（不包含任何规避战术）。', 'anchor_hint': None},
    {'family_id': 'TW-ACOUSTIC-CLASSIFICATION', 'branch': 'THREAT_WARNING',
     'label': 'Acoustic Threat Classification', 'label_zh': '声学威胁分类',
     'tier_min': 6, 'tier_max': 10, 'era': '1990s-2020s',
     'summary_zh': '对水声接触的分类与威胁判定。', 'anchor_hint': None},
    # --- Acoustic countermeasure -----------------------------------------
    {'family_id': 'ACM-NOISE-MAKER', 'branch': 'ACOUSTIC_COUNTERMEASURE', 'label': 'Noise Maker',
     'label_zh': '噪声弹', 'tier_min': 1, 'tier_max': 4, 'era': '1960s-1990s',
     'summary_zh': '投放式噪声源，制造声学背景。', 'anchor_hint': None},
    {'family_id': 'ACM-ACOUSTIC-DECOY', 'branch': 'ACOUSTIC_COUNTERMEASURE', 'label': 'Acoustic Decoy',
     'label_zh': '声学诱饵', 'tier_min': 2, 'tier_max': 6, 'era': '1970s-2000s',
     'summary_zh': '模拟本艇声学特征的诱饵。', 'anchor_hint': {'USA': 'ADC Mk 2'}},
    {'family_id': 'ACM-TORPEDO-DECOY', 'branch': 'ACOUSTIC_COUNTERMEASURE', 'label': 'Torpedo Decoy',
     'label_zh': '鱼雷诱饵', 'tier_min': 4, 'tier_max': 8, 'era': '1980s-2010s',
     'summary_zh': '针对鱼雷声自导的专用诱饵。', 'anchor_hint': None},
    {'family_id': 'ACM-MOBILE-DECOY', 'branch': 'ACOUSTIC_COUNTERMEASURE',
     'label': 'Mobile Acoustic Decoy', 'label_zh': '机动声学诱饵',
     'tier_min': 5, 'tier_max': 9, 'era': '1990s-2010s',
     'summary_zh': '自带航行能力的机动声学诱饵。', 'anchor_hint': None},
    {'family_id': 'ACM-ADVANCED', 'branch': 'ACOUSTIC_COUNTERMEASURE',
     'label': 'Advanced Acoustic Countermeasure', 'label_zh': '先进声学对抗',
     'tier_min': 7, 'tier_max': 10, 'era': '2000s-2020s',
     'summary_zh': '可编程、可协同的先进声学对抗。', 'anchor_hint': None},
    {'family_id': 'ACM-INTEGRATED', 'branch': 'ACOUSTIC_COUNTERMEASURE',
     'label': 'Integrated Acoustic Defense', 'label_zh': '整合声学防御',
     'tier_min': 8, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '声学对抗与告警、控制的整合层。', 'anchor_hint': None},
    # --- Decoy ------------------------------------------------------------
    {'family_id': 'DEC-PASSIVE', 'branch': 'DECOY', 'label': 'Passive Decoy',
     'label_zh': '被动诱饵', 'tier_min': 1, 'tier_max': 3, 'era': '1960s-1970s',
     'summary_zh': '无源反射或散射体诱饵。', 'anchor_hint': None},
    {'family_id': 'DEC-ACTIVE', 'branch': 'DECOY', 'label': 'Active Decoy',
     'label_zh': '主动诱饵', 'tier_min': 3, 'tier_max': 6, 'era': '1970s-1990s',
     'summary_zh': '主动发射声学信号的诱饵。', 'anchor_hint': None},
    {'family_id': 'DEC-ACOUSTIC', 'branch': 'DECOY', 'label': 'Acoustic Decoy',
     'label_zh': '声学诱饵', 'tier_min': 2, 'tier_max': 6, 'era': '1970s-2000s',
     'summary_zh': '以声学特征欺骗为主的诱饵（与声学对抗分支共用厂牌）。', 'anchor_hint': None},
    {'family_id': 'DEC-TORPEDO', 'branch': 'DECOY', 'label': 'Torpedo Decoy',
     'label_zh': '鱼雷诱饵', 'tier_min': 4, 'tier_max': 8, 'era': '1980s-2010s',
     'summary_zh': '面向鱼雷自导的诱饵族。', 'anchor_hint': None},
    {'family_id': 'DEC-MOBILE', 'branch': 'DECOY', 'label': 'Mobile Decoy',
     'label_zh': '机动诱饵', 'tier_min': 5, 'tier_max': 9, 'era': '1990s-2010s',
     'summary_zh': '可自主航行的诱饵族。', 'anchor_hint': None},
    {'family_id': 'DEC-ADVANCED', 'branch': 'DECOY', 'label': 'Advanced Decoy',
     'label_zh': '先进诱饵', 'tier_min': 7, 'tier_max': 10, 'era': '2000s-2020s',
     'summary_zh': '可编程多模式诱饵。', 'anchor_hint': None},
    # --- Noise maker ------------------------------------------------------
    {'family_id': 'NM-EARLY', 'branch': 'NOISE_MAKER', 'label': 'Early Noise Maker',
     'label_zh': '早期噪声弹', 'tier_min': 1, 'tier_max': 2, 'era': '1960s',
     'summary_zh': '最早期的机械或化学噪声源。', 'anchor_hint': None},
    {'family_id': 'NM-IMPROVED', 'branch': 'NOISE_MAKER', 'label': 'Improved Noise Maker',
     'label_zh': '改进型噪声弹', 'tier_min': 3, 'tier_max': 5, 'era': '1970s-1980s',
     'summary_zh': '提高持续时间的改进代。', 'anchor_hint': None},
    {'family_id': 'NM-MODERN', 'branch': 'NOISE_MAKER', 'label': 'Modern Noise Maker',
     'label_zh': '现代噪声弹', 'tier_min': 6, 'tier_max': 8, 'era': '1990s-2000s',
     'summary_zh': '可调制的现代噪声源。', 'anchor_hint': None},
    {'family_id': 'NM-ADVANCED', 'branch': 'NOISE_MAKER', 'label': 'Advanced Acoustic Countermeasure',
     'label_zh': '先进声学对抗（噪声源）', 'tier_min': 8, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '与先进声学对抗合并的噪声源世代。', 'anchor_hint': None},
    # --- Torpedo defense --------------------------------------------------
    {'family_id': 'TD-WARNING', 'branch': 'TORPEDO_DEFENSE', 'label': 'Torpedo Warning',
     'label_zh': '鱼雷告警', 'tier_min': 4, 'tier_max': 6, 'era': '1980s-1990s',
     'summary_zh': '鱼雷防御链的第一级：告警。', 'anchor_hint': None},
    {'family_id': 'TD-COUNTERMEASURE', 'branch': 'TORPEDO_DEFENSE', 'label': 'Countermeasure',
     'label_zh': '对抗', 'tier_min': 5, 'tier_max': 8, 'era': '1980s-2000s',
     'summary_zh': '鱼雷对抗链的第二级：对抗器材投放。', 'anchor_hint': None},
    {'family_id': 'TD-ADVANCED', 'branch': 'TORPEDO_DEFENSE', 'label': 'Advanced Countermeasure',
     'label_zh': '先进对抗', 'tier_min': 7, 'tier_max': 9, 'era': '2000s-2010s',
     'summary_zh': '先进对抗器材与协同投放。', 'anchor_hint': None},
    {'family_id': 'TD-INTEGRATED', 'branch': 'TORPEDO_DEFENSE', 'label': 'Integrated Torpedo Defense',
     'label_zh': '整合鱼雷防御', 'tier_min': 9, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '告警、对抗与控制的整合鱼雷防御系统。', 'anchor_hint': None},
    # --- Launcher ---------------------------------------------------------
    {'family_id': 'CML-EXTERNAL', 'branch': 'LAUNCHER', 'label': 'External Launcher',
     'label_zh': '外部发射器', 'tier_min': 2, 'tier_max': 4, 'era': '1960s-1980s',
     'summary_zh': '耐压壳外的诱饵或对抗器材发射器。', 'anchor_hint': None},
    {'family_id': 'CML-TUBE', 'branch': 'LAUNCHER', 'label': 'Countermeasure Tube',
     'label_zh': '对抗管', 'tier_min': 3, 'tier_max': 6, 'era': '1970s-1990s',
     'summary_zh': '专用对抗器材发射管。', 'anchor_hint': None},
    {'family_id': 'CML-ACOUSTIC-DEVICE', 'branch': 'LAUNCHER', 'label': 'Acoustic Device Launcher',
     'label_zh': '声学装置发射器', 'tier_min': 4, 'tier_max': 7, 'era': '1980s-2000s',
     'summary_zh': '面向声学对抗器材的发射装置。', 'anchor_hint': None},
    {'family_id': 'CML-ADVANCED', 'branch': 'LAUNCHER', 'label': 'Advanced Launcher',
     'label_zh': '先进发射器', 'tier_min': 7, 'tier_max': 9, 'era': '2000s-2010s',
     'summary_zh': '可编程多用途发射器。', 'anchor_hint': None},
    {'family_id': 'CML-INTEGRATED', 'branch': 'LAUNCHER', 'label': 'Integrated Launcher',
     'label_zh': '整合发射系统', 'tier_min': 8, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '与防御控制系统整合的发射系统。', 'anchor_hint': None},
    # --- Defensive control ------------------------------------------------
    {'family_id': 'DC-CONSOLE', 'branch': 'DEFENSIVE_CONTROL', 'label': 'Defensive Control Console',
     'label_zh': '防御控制台', 'tier_min': 2, 'tier_max': 5, 'era': '1970s-1990s',
     'summary_zh': '独立的防御战位控制台。', 'anchor_hint': None},
    {'family_id': 'DC-INTEGRATED-CONTROL', 'branch': 'DEFENSIVE_CONTROL',
     'label': 'Integrated Defensive Control', 'label_zh': '整合防御控制',
     'tier_min': 6, 'tier_max': 8, 'era': '1990s-2010s',
     'summary_zh': '防御控制并入战斗情报中心。', 'anchor_hint': None},
    {'family_id': 'DC-AUTOMATED', 'branch': 'DEFENSIVE_CONTROL', 'label': 'Automated Defensive Control',
     'label_zh': '自动化防御控制', 'tier_min': 8, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '自动威胁排序与对抗建议（游戏层）。', 'anchor_hint': None},
    # --- Integrated defense ----------------------------------------------
    {'family_id': 'IDS-CORE', 'branch': 'INTEGRATED_DEFENSE', 'label': 'Integrated Defensive System',
     'label_zh': '整合防御系统', 'tier_min': 6, 'tier_max': 8, 'era': '1990s-2010s',
     'summary_zh': '把 ESM、告警、对抗与发射整合为单一系统身份。', 'anchor_hint': None},
    {'family_id': 'IDS-ADVANCED', 'branch': 'INTEGRATED_DEFENSE',
     'label': 'Next Generation Defensive System', 'label_zh': '下一代防御系统',
     'tier_min': 9, 'tier_max': 10, 'era': '2010s-2020s',
     'summary_zh': '下一代整合防御系统身份。', 'anchor_hint': None},
]

FAMILY_BY_ID = {family['family_id']: family for family in FAMILIES}

# --------------------------------------------------------------------------
# 3. T1-T10 game tier ladder (section 17 of the requirement).
# --------------------------------------------------------------------------
TIER_LADDER = {
    1: {'label': 'Basic Warning', 'label_zh': '基础告警',
        'families': ['TW-RADAR-WARNING', 'ESM-BASIC-DETECTION', 'ACM-NOISE-MAKER',
                     'DEC-PASSIVE', 'NM-EARLY']},
    2: {'label': 'Basic Acoustic Countermeasure', 'label_zh': '基础声学对抗',
        'families': ['ESM-BASIC-DETECTION', 'ESM-IMPROVED-DETECTION', 'ACM-ACOUSTIC-DECOY',
                     'DEC-ACOUSTIC', 'CML-EXTERNAL', 'DC-CONSOLE', 'NM-EARLY']},
    3: {'label': 'Improved Decoy', 'label_zh': '改进型诱饵',
        'families': ['ESM-IMPROVED-DETECTION', 'ESM-CLASSIFICATION', 'DEC-PASSIVE', 'DEC-ACTIVE',
                     'ACM-NOISE-MAKER', 'CML-TUBE', 'NM-IMPROVED', 'TW-ELECTRONIC-WARNING']},
    4: {'label': 'Improved Threat Warning', 'label_zh': '改进型威胁告警',
        'families': ['TW-RADAR-WARNING', 'TW-ELECTRONIC-WARNING', 'TW-ACTIVE-SONAR-WARNING',
                     'ESM-CLASSIFICATION', 'ESM-DIGITAL', 'ACM-ACOUSTIC-DECOY', 'ACM-TORPEDO-DECOY',
                     'DEC-TORPEDO', 'CML-EXTERNAL', 'CML-TUBE', 'CML-ACOUSTIC-DEVICE', 'TD-WARNING',
                     'NM-IMPROVED', 'DC-CONSOLE']},
    5: {'label': 'Digital ESM', 'label_zh': '数字式 ESM',
        'families': ['ESM-DIGITAL', 'ESM-MULTIBAND', 'TW-TORPEDO-WARNING', 'ACM-TORPEDO-DECOY',
                     'ACM-MOBILE-DECOY', 'DEC-ACTIVE', 'DEC-ACOUSTIC', 'DEC-TORPEDO', 'DEC-MOBILE',
                     'NM-IMPROVED', 'CML-ACOUSTIC-DEVICE', 'TD-COUNTERMEASURE', 'DC-CONSOLE']},
    6: {'label': 'Integrated Countermeasure', 'label_zh': '整合对抗',
        'families': ['ESM-INTEGRATED', 'ESM-MULTIBAND', 'TW-ELECTRONIC-WARNING',
                     'TW-ACOUSTIC-CLASSIFICATION', 'ACM-ACOUSTIC-DECOY', 'ACM-TORPEDO-DECOY',
                     'DEC-TORPEDO', 'NM-MODERN', 'CML-TUBE', 'TD-WARNING', 'TD-COUNTERMEASURE',
                     'DC-INTEGRATED-CONTROL', 'IDS-CORE']},
    7: {'label': 'Advanced Acoustic Defense', 'label_zh': '先进声学防御',
        'families': ['ESM-ADVANCED-THREAT-WARNING', 'ESM-MULTIBAND', 'TW-ACTIVE-SONAR-WARNING',
                     'TW-TORPEDO-WARNING', 'ACM-TORPEDO-DECOY', 'ACM-ADVANCED', 'DEC-ADVANCED',
                     'DEC-TORPEDO', 'NM-MODERN', 'CML-ADVANCED', 'TD-ADVANCED', 'TD-COUNTERMEASURE',
                     'DC-INTEGRATED-CONTROL', 'IDS-CORE']},
    8: {'label': 'Multi-Sensor Threat Fusion', 'label_zh': '多传感器威胁融合',
        'families': ['ESM-MULTISENSOR-FUSION', 'ESM-INTEGRATED', 'ESM-ADVANCED-THREAT-WARNING',
                     'TW-TORPEDO-WARNING', 'TW-ACOUSTIC-CLASSIFICATION', 'ACM-ADVANCED',
                     'ACM-INTEGRATED', 'DEC-ADVANCED', 'DEC-MOBILE', 'NM-ADVANCED', 'CML-ADVANCED',
                     'CML-INTEGRATED', 'TD-COUNTERMEASURE', 'TD-ADVANCED', 'DC-AUTOMATED', 'IDS-CORE']},
    9: {'label': 'Integrated Defensive Warfare', 'label_zh': '整合防御作战',
        'families': ['ESM-ADVANCED-EW', 'ESM-MULTISENSOR-FUSION', 'TW-TORPEDO-WARNING',
                     'TW-ACOUSTIC-CLASSIFICATION', 'ACM-MOBILE-DECOY', 'ACM-ADVANCED',
                     'ACM-INTEGRATED', 'DEC-ADVANCED', 'DEC-MOBILE', 'NM-ADVANCED', 'CML-ADVANCED',
                     'CML-INTEGRATED', 'TD-INTEGRATED', 'TD-ADVANCED', 'DC-AUTOMATED',
                     'IDS-ADVANCED']},
    10: {'label': 'Next Generation Defensive System', 'label_zh': '下一代防御系统',
         'families': ['ESM-NEXTGEN', 'ESM-ADVANCED-EW', 'ESM-MULTISENSOR-FUSION',
                      'TW-ACOUSTIC-CLASSIFICATION', 'ACM-INTEGRATED', 'ACM-ADVANCED', 'DEC-ADVANCED',
                      'NM-ADVANCED', 'CML-INTEGRATED', 'TD-INTEGRATED', 'DC-AUTOMATED', 'IDS-ADVANCED']},
}

# --------------------------------------------------------------------------
# 4. 3D assets. One asset = one owned directory with the full
#    Blend/FBX/LOD/Collision/Preview/Documentation/Validation pipeline.
#    Dimensions are game-representative exterior envelopes in metres; they are
#    NOT measurements of real hardware.
# --------------------------------------------------------------------------
ASSETS = [
    {
        'asset_id': 'US_EW_ESM_GENERIC', 'category': 'ESM', 'branch': 'ESM',
        'family_id': 'ESM-DIGITAL', 'country': 'USA', 'priority': 'HIGH',
        'label': 'Generic ESM mast assembly', 'label_zh': '通用 ESM 桅杆组件',
        'geometry': 'esm_mast',
        'dimensions_m': {'height': 9.4, 'diameter': 0.34},
        'sockets': ['SOCKET_EW_MAST', 'SOCKET_EW_ANTENNA'],
        'materials': ['Metal', 'DarkMetal', 'Composite', 'AntennaMaterial', 'Rubber'],
        'geometry_notes_zh': '桅杆本体加可升降头部与顶部天线阵，头部与桅杆同轴，便于 UE 内整体升降。',
    },
    {
        'asset_id': 'US_EW_BLQ10', 'category': 'ESM', 'branch': 'ESM',
        'family_id': 'ESM-DIGITAL', 'country': 'USA', 'priority': 'HIGH',
        'label': 'AN/BLQ-10 class integrated ESM mast', 'label_zh': 'AN/BLQ-10 级整合 ESM 桅杆',
        'geometry': 'esm_mast_integrated',
        'dimensions_m': {'height': 10.2, 'diameter': 0.40},
        'sockets': ['SOCKET_EW_MAST', 'SOCKET_EW_ANTENNA'],
        'materials': ['Metal', 'DarkMetal', 'Composite', 'AntennaMaterial', 'Rubber'],
        'geometry_notes_zh': '在通用桅杆基础上增加环绕式天线罩与两片刀形天线，作为数字式 ESM 世代的识别特征。',
    },
    {
        'asset_id': 'UK_EW_ASTUTE', 'category': 'ESM', 'branch': 'ESM',
        'family_id': 'ESM-MULTIBAND', 'country': 'UK', 'priority': 'MEDIUM',
        'label': 'UK SSN ESM mast', 'label_zh': '英国攻击核潜艇 ESM 桅杆',
        'geometry': 'esm_mast_blade',
        'dimensions_m': {'height': 9.8, 'diameter': 0.36},
        'sockets': ['SOCKET_EW_MAST'],
        'materials': ['Metal', 'DarkMetal', 'Composite', 'AntennaMaterial'],
        'geometry_notes_zh': '宽断面桅杆配双侧刀形天线，轮廓与圆柱桅杆明显区分。',
    },
    {
        'asset_id': 'RU_EW_AKULA', 'category': 'ESM', 'branch': 'ESM',
        'family_id': 'ESM-CLASSIFICATION', 'country': 'Russia', 'priority': 'MEDIUM',
        'label': 'Russian SSN ESM mast', 'label_zh': '俄制攻击核潜艇 ESM 桅杆',
        'geometry': 'esm_mast_rugged',
        'dimensions_m': {'height': 8.6, 'diameter': 0.42},
        'sockets': ['SOCKET_EW_MAST'],
        'materials': ['Metal', 'DarkMetal', 'Rubber', 'AntennaMaterial'],
        'geometry_notes_zh': '粗壮桅杆配块状天线基座，表面带密封环带。',
    },
    {
        'asset_id': 'CN_EW_TYPE093', 'category': 'ESM', 'branch': 'ESM',
        'family_id': 'ESM-MULTIBAND', 'country': 'China', 'priority': 'MEDIUM',
        'label': 'Chinese SSN ESM mast', 'label_zh': '中国攻击核潜艇 ESM 桅杆',
        'geometry': 'esm_mast_slim',
        'dimensions_m': {'height': 8.0, 'diameter': 0.30},
        'sockets': ['SOCKET_EW_MAST'],
        'materials': ['Metal', 'DarkMetal', 'Composite', 'AntennaMaterial'],
        'geometry_notes_zh': '细长桅杆配多段式天线组，顶部为低矮盘状阵面。',
    },
    {
        'asset_id': 'GEN_EW_ANTENNA_ARRAY', 'category': 'ANTENNA', 'branch': 'ESM',
        'family_id': 'ESM-MULTIBAND', 'country': 'USA', 'priority': 'HIGH',
        'label': 'Conformal ESM antenna array', 'label_zh': '共形 ESM 天线阵面板',
        'geometry': 'antenna_array',
        'dimensions_m': {'length': 3.2, 'width': 0.62, 'thickness': 0.18},
        'sockets': ['SOCKET_EW_ANTENNA'],
        'materials': ['Composite', 'DarkMetal', 'Glass', 'AntennaMaterial', 'Rubber'],
        'geometry_notes_zh': '围壳或艇体共形安装的面板阵，含介质盖板与安装导轨。',
    },
    {
        'asset_id': 'US_ACM_TORPEDO_DECOY', 'category': 'ACOUSTIC_COUNTERMEASURE',
        'branch': 'ACOUSTIC_COUNTERMEASURE', 'family_id': 'ACM-TORPEDO-DECOY', 'country': 'USA',
        'priority': 'HIGH',
        'label': 'Acoustic device countermeasure (ADC family)', 'label_zh': '声学装置对抗器材（ADC 族）',
        'geometry': 'decoy_canister',
        'dimensions_m': {'length': 1.05, 'diameter': 0.15},
        'sockets': ['SOCKET_COUNTERMEASURE_01', 'SOCKET_COUNTERMEASURE_02'],
        'materials': ['Metal', 'Rubber', 'Composite', 'Paint'],
        'geometry_notes_zh': '圆柱弹体加尾段环形释放结构与首端换能器窗口，作为鱼雷诱饵分支的基准器材。',
    },
    {
        'asset_id': 'US_ACM_MOBILE_DECOY', 'category': 'DECOY', 'branch': 'DECOY',
        'family_id': 'DEC-MOBILE', 'country': 'USA', 'priority': 'MEDIUM',
        'label': 'Mobile acoustic decoy', 'label_zh': '机动声学诱饵',
        'geometry': 'decoy_mobile',
        'dimensions_m': {'length': 1.9, 'diameter': 0.32},
        'sockets': ['SOCKET_COUNTERMEASURE_01'],
        'materials': ['Metal', 'Rubber', 'Composite', 'Paint'],
        'geometry_notes_zh': '带尾锥与四片尾舵的自主航行诱饵，与圆柱弹体在轮廓上区分。',
    },
    {
        'asset_id': 'GEN_ACM_NOISE_MAKER', 'category': 'NOISE_MAKER', 'branch': 'NOISE_MAKER',
        'family_id': 'NM-MODERN', 'country': 'USA', 'priority': 'MEDIUM',
        'label': 'Noise maker canister', 'label_zh': '噪声弹发射筒',
        'geometry': 'noise_maker',
        'dimensions_m': {'length': 0.78, 'diameter': 0.20},
        'sockets': ['SOCKET_COUNTERMEASURE_02'],
        'materials': ['Metal', 'Rubber', 'Paint'],
        'geometry_notes_zh': '带端盖开孔与浮力段的短筒体，含两道投放导轨。',
    },
    {
        'asset_id': 'US_CML_DECOY_LAUNCHER', 'category': 'LAUNCHER', 'branch': 'LAUNCHER',
        'family_id': 'CML-ADVANCED', 'country': 'USA', 'priority': 'HIGH',
        'label': 'External countermeasure launcher housing', 'label_zh': '外部对抗器材发射器',
        'geometry': 'launcher_external',
        'dimensions_m': {'length': 1.60, 'width': 0.92, 'height': 0.72},
        'sockets': ['SOCKET_DECOY_LAUNCHER_01', 'SOCKET_DECOY_LAUNCHER_02'],
        'materials': ['Metal', 'DarkMetal', 'Rubber', 'Paint'],
        'geometry_notes_zh': '流线整流罩加两排发射口，侧面带维护舱口与管缆接口。',
    },
    {
        'asset_id': 'GEN_CML_TUBE', 'category': 'LAUNCHER', 'branch': 'LAUNCHER',
        'family_id': 'CML-TUBE', 'country': 'USA', 'priority': 'MEDIUM',
        'label': 'Countermeasure tube', 'label_zh': '对抗器材发射管',
        'geometry': 'launcher_tube',
        'dimensions_m': {'length': 1.30, 'diameter': 0.26},
        'sockets': ['SOCKET_COUNTERMEASURE_01', 'SOCKET_COUNTERMEASURE_02'],
        'materials': ['Metal', 'DarkMetal', 'Rubber'],
        'geometry_notes_zh': '单管发射装置，含前端铰链舱盖与后端固定法兰。',
    },
    {
        'asset_id': 'GEN_TW_TORPEDO_WARNING_SENSOR', 'category': 'TORPEDO_DEFENSE',
        'branch': 'TORPEDO_DEFENSE', 'family_id': 'TD-WARNING', 'country': 'USA', 'priority': 'HIGH',
        'label': 'Torpedo warning sensor', 'label_zh': '鱼雷告警传感器',
        'geometry': 'torpedo_warning_sensor',
        'dimensions_m': {'length': 1.40, 'width': 0.52, 'height': 0.36},
        'sockets': ['SOCKET_EW_ANTENNA'],
        'materials': ['Composite', 'Metal', 'Rubber', 'AntennaMaterial'],
        'geometry_notes_zh': '流线整流罩内含三单元换能器窗口，侧面为穿舱连接器面板。',
    },
    {
        'asset_id': 'US_DCM_CONSOLE', 'category': 'CONTROL', 'branch': 'DEFENSIVE_CONTROL',
        'family_id': 'DC-INTEGRATED-CONTROL', 'country': 'USA', 'priority': 'HIGH',
        'label': 'Defensive control console module', 'label_zh': '防御控制台模块',
        'geometry': 'control_console',
        'dimensions_m': {'length': 1.80, 'width': 0.90, 'height': 1.20},
        'sockets': [],
        'materials': ['Metal', 'DarkMetal', 'Glass', 'Composite', 'Paint'],
        'geometry_notes_zh': '双席控制台：斜面显控区、键盘托面与下方设备柜，用于艇内防御战位。',
        'interior': True,
    },
]

ASSET_BY_ID = {asset['asset_id']: asset for asset in ASSETS}

# --------------------------------------------------------------------------
# 5. Family -> 3D asset binding. Families absent from this table are
#    DATABASE_ONLY (no geometry is fabricated for them).
# --------------------------------------------------------------------------
ESM_COUNTRY_ASSET = {
    'USA': 'US_EW_ESM_GENERIC', 'Russia': 'RU_EW_AKULA', 'UK': 'UK_EW_ASTUTE',
    'France': 'US_EW_ESM_GENERIC', 'China': 'CN_EW_TYPE093', 'India': 'US_EW_ESM_GENERIC',
}
LAUNCHER_COUNTRY_ASSET = {
    'USA': 'US_CML_DECOY_LAUNCHER', 'Russia': 'US_CML_DECOY_LAUNCHER', 'UK': 'US_CML_DECOY_LAUNCHER',
    'France': 'US_CML_DECOY_LAUNCHER', 'China': 'US_CML_DECOY_LAUNCHER', 'India': 'US_CML_DECOY_LAUNCHER',
}
TUBE_COUNTRY_ASSET = {country: 'GEN_CML_TUBE' for country in COUNTRIES}
SENSOR_COUNTRY_ASSET = {country: 'GEN_TW_TORPEDO_WARNING_SENSOR' for country in COUNTRIES}
DECOY_COUNTRY_ASSET = {country: 'US_ACM_TORPEDO_DECOY' for country in COUNTRIES}
MOBILE_COUNTRY_ASSET = {country: 'US_ACM_MOBILE_DECOY' for country in COUNTRIES}
NOISE_COUNTRY_ASSET = {country: 'GEN_ACM_NOISE_MAKER' for country in COUNTRIES}
CONSOLE_COUNTRY_ASSET = {country: 'US_DCM_CONSOLE' for country in COUNTRIES}

FAMILY_ASSET_BINDING = {
    'ESM-BASIC-DETECTION': ESM_COUNTRY_ASSET,
    'ESM-IMPROVED-DETECTION': ESM_COUNTRY_ASSET,
    'ESM-CLASSIFICATION': ESM_COUNTRY_ASSET,
    'ESM-DIGITAL': {'USA': 'US_EW_BLQ10', 'Russia': 'RU_EW_AKULA', 'UK': 'UK_EW_ASTUTE',
                    'France': 'US_EW_ESM_GENERIC', 'China': 'CN_EW_TYPE093', 'India': 'US_EW_ESM_GENERIC'},
    'ESM-MULTIBAND': {**ESM_COUNTRY_ASSET, 'USA': 'GEN_EW_ANTENNA_ARRAY'},
    'ESM-INTEGRATED': ESM_COUNTRY_ASSET,
    'ESM-ADVANCED-THREAT-WARNING': ESM_COUNTRY_ASSET,
    'ESM-MULTISENSOR-FUSION': ESM_COUNTRY_ASSET,
    'ESM-ADVANCED-EW': ESM_COUNTRY_ASSET,
    'ESM-NEXTGEN': ESM_COUNTRY_ASSET,
    'TW-TORPEDO-WARNING': SENSOR_COUNTRY_ASSET,
    'ACM-NOISE-MAKER': NOISE_COUNTRY_ASSET,
    'ACM-ACOUSTIC-DECOY': DECOY_COUNTRY_ASSET,
    'ACM-TORPEDO-DECOY': DECOY_COUNTRY_ASSET,
    'ACM-MOBILE-DECOY': MOBILE_COUNTRY_ASSET,
    'ACM-ADVANCED': MOBILE_COUNTRY_ASSET,
    'ACM-INTEGRATED': MOBILE_COUNTRY_ASSET,
    'DEC-ACOUSTIC': DECOY_COUNTRY_ASSET,
    'DEC-ACTIVE': DECOY_COUNTRY_ASSET,
    'DEC-TORPEDO': DECOY_COUNTRY_ASSET,
    'DEC-MOBILE': MOBILE_COUNTRY_ASSET,
    'DEC-ADVANCED': MOBILE_COUNTRY_ASSET,
    'NM-EARLY': NOISE_COUNTRY_ASSET,
    'NM-IMPROVED': NOISE_COUNTRY_ASSET,
    'NM-MODERN': NOISE_COUNTRY_ASSET,
    'NM-ADVANCED': NOISE_COUNTRY_ASSET,
    'TD-WARNING': SENSOR_COUNTRY_ASSET,
    'TD-COUNTERMEASURE': DECOY_COUNTRY_ASSET,
    'TD-ADVANCED': MOBILE_COUNTRY_ASSET,
    'TD-INTEGRATED': MOBILE_COUNTRY_ASSET,
    'CML-EXTERNAL': LAUNCHER_COUNTRY_ASSET,
    'CML-TUBE': TUBE_COUNTRY_ASSET,
    'CML-ACOUSTIC-DEVICE': LAUNCHER_COUNTRY_ASSET,
    'CML-ADVANCED': LAUNCHER_COUNTRY_ASSET,
    'CML-INTEGRATED': LAUNCHER_COUNTRY_ASSET,
    'DC-CONSOLE': CONSOLE_COUNTRY_ASSET,
    'DC-INTEGRATED-CONTROL': CONSOLE_COUNTRY_ASSET,
    'DC-AUTOMATED': CONSOLE_COUNTRY_ASSET,
    'IDS-CORE': CONSOLE_COUNTRY_ASSET,
    'IDS-ADVANCED': CONSOLE_COUNTRY_ASSET,
}

# --------------------------------------------------------------------------
# 6. Compatibility policy.
#    * Explicit rows below are the only way a platform/system pair becomes
#      CONFIRMED or PROBABLE.
#    * Everything else is derived by the tier rule and stays GAMEPLAY (game
#      construction) or UNKNOWN (outside the platform's era window).
#    * Installation of a real system is never inferred from "it looks like it
#      should have one".
# --------------------------------------------------------------------------
COMPATIBILITY_POLICY = {
    'confirmed_requires_source': True,
    'probable_requires_source': True,
    'tier_window_slack': 1,
    'gameplay_label_zh': '游戏内设定：该艇按科技层级可装配，不代表真实装备关系。',
    'unknown_label_zh': '公开资料不足，不做推断。',
    'tier_window_rule_zh': '平台层级 T 可装配 tier_min <= T 的防御系统族；tier_min == T+1 记为 GAMEPLAY 预备列装，超出则 UNKNOWN。',
    'hardware_modification_zh': '本库只做数据与附加展示层资产，不修改任何既有潜艇模型。',
}

# Platform-specific rows. ``status`` must be CONFIRMED or PROBABLE, and the
# research file must supply a source; otherwise the builder demotes the row.
COMPATIBILITY_SEED = [
    {'submarine': 'US_SSN_Virginia', 'family_id': 'ESM-DIGITAL', 'status': 'CONFIRMED',
     'system': 'AN/BLQ-10', 'note_zh': '公开资料常见的弗吉尼亚级 ESM 型号记载。'},
    {'submarine': 'US_SSN_Seawolf', 'family_id': 'ESM-DIGITAL', 'status': 'CONFIRMED',
     'system': 'AN/BLQ-10', 'note_zh': '公开资料常见的海狼级 ESM 型号记载。'},
    {'submarine': 'US_SSBN_Ohio', 'family_id': 'ESM-DIGITAL', 'status': 'CONFIRMED',
     'system': 'AN/BLQ-10', 'note_zh': '公开资料常见的俄亥俄级 ESM 型号记载。'},
    {'submarine': 'US_SSN_LosAngeles', 'family_id': 'ESM-DIGITAL', 'status': 'PROBABLE',
     'system': 'AN/BLQ-10', 'note_zh': '688i 改进批次公开资料记载，早期批次存疑。'},
]

# --------------------------------------------------------------------------
# 7. Loadout template. Declarative: the compatibility matrix decides whether a
#    platform may actually mount a slot.
# --------------------------------------------------------------------------
LOADOUT_SLOTS = [
    {'slot': 'ESM', 'branch': 'ESM', 'socket': 'SOCKET_EW_MAST', 'required': True,
     'label_zh': '电子支援桅杆与阵面'},
    {'slot': 'THREAT_WARNING', 'branch': 'THREAT_WARNING', 'socket': 'SOCKET_EW_ANTENNA',
     'required': False, 'label_zh': '威胁告警传感器'},
    {'slot': 'ACOUSTIC_COUNTERMEASURE', 'branch': 'ACOUSTIC_COUNTERMEASURE',
     'socket': 'SOCKET_COUNTERMEASURE_01', 'required': True, 'label_zh': '声学对抗器材'},
    {'slot': 'DECOY', 'branch': 'DECOY', 'socket': 'SOCKET_COUNTERMEASURE_02', 'required': False,
     'label_zh': '诱饵'},
    {'slot': 'NOISE_MAKER', 'branch': 'NOISE_MAKER', 'socket': 'SOCKET_COUNTERMEASURE_02',
     'required': False, 'label_zh': '噪声弹'},
    {'slot': 'TORPEDO_DEFENSE', 'branch': 'TORPEDO_DEFENSE', 'socket': 'SOCKET_DECOY_LAUNCHER_02',
     'required': False, 'label_zh': '鱼雷防御器材'},
    {'slot': 'LAUNCHER', 'branch': 'LAUNCHER', 'socket': 'SOCKET_DECOY_LAUNCHER_01',
     'required': True, 'label_zh': '对抗发射装置'},
    {'slot': 'DEFENSIVE_CONTROL', 'branch': 'DEFENSIVE_CONTROL', 'socket': '',
     'required': True, 'label_zh': '防御控制'},
    {'slot': 'INTEGRATED_DEFENSE', 'branch': 'INTEGRATED_DEFENSE', 'socket': '',
     'required': False, 'label_zh': '整合防御'},
]


# --------------------------------------------------------------------------
# Research merge
# --------------------------------------------------------------------------
def _load_research() -> dict:
    path = DOC_DIR / 'defensive_system_research.json'
    if not path.is_file():
        return {}
    try:
        return load_json(path)
    except Exception:
        return {}


def research_claims() -> dict:
    """Variant-level claims with source keys resolved to full source records."""
    research = _load_research()
    catalogue = research.get('sources') or {}
    resolved = {}
    for variant_id, claim in (research.get('variants') or {}).items():
        entries = []
        for key in claim.get('sources') or []:
            if isinstance(key, dict):
                entries.append(key)
            else:
                record = catalogue.get(key)
                entries.append({'key': key, **(record or {'title': key})})
        resolved[variant_id] = {**claim, 'sources': entries}
    return resolved


def research_compatibility() -> dict:
    """Compatibility claims keyed by ``f'{submarine}|{family_id}'``."""
    research = _load_research()
    catalogue = research.get('sources') or {}
    resolved = {}
    for key, claim in (research.get('compatibility') or {}).items():
        entries = []
        for source_key in claim.get('sources') or []:
            if isinstance(source_key, dict):
                entries.append(source_key)
            else:
                record = catalogue.get(source_key)
                entries.append({'key': source_key, **(record or {'title': source_key})})
        resolved[key] = {**claim, 'sources': entries}
    return resolved


def variants() -> list[dict]:
    """Family x country variant records with merged research claims."""
    claims = research_claims()
    rows = []
    for family in FAMILIES:
        for country in COUNTRIES:
            vid = f"{family['family_id']}-{COUNTRY_CODE[country]}"
            claim = claims.get(vid, {})
            hint = (family.get('anchor_hint') or {}).get(country)
            verified_anchor = claim.get('anchor')
            status = claim.get('status')
            if not status:
                # A candidate identity only becomes an anchor once research
                # supplies sources; otherwise it stays a game identity.
                status = 'PROBABLE' if verified_anchor and claim.get('sources') else 'GAMEPLAY'
            if status in ('CONFIRMED', 'PROBABLE') and not claim.get('sources'):
                status = 'GAMEPLAY'
            if status == 'GAMEPLAY':
                verified_anchor = verified_anchor if claim.get('sources') else None
            binding = FAMILY_ASSET_BINDING.get(family['family_id'], {})
            rows.append({
                'variant_id': vid,
                'family_id': family['family_id'],
                'branch': family['branch'],
                'country': country,
                'label': f"{family['label']} ({COUNTRY_CODE[country]})",
                'label_zh': f"{family['label_zh']}（{country}）",
                'tier_min': family['tier_min'],
                'tier_max': family['tier_max'],
                'anchor': verified_anchor,
                'candidate_anchor': hint,
                'verification': status,
                'sources': claim.get('sources', []),
                'note_zh': claim.get('note_zh', ''),
                'asset_id': binding.get(country),
                'game_identity': status == 'GAMEPLAY',
            })
    return rows


def loadout_plan(submarine_tier: int) -> dict:
    """Tier-driven slot plan for one platform (compatibility still gates it)."""
    plan = {}
    for family in FAMILIES:
        if family['tier_min'] <= submarine_tier:
            plan.setdefault(family['branch'], []).append(family['family_id'])
    return plan
