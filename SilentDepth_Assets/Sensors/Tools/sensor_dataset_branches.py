#!/usr/bin/env python3
"""传感器科技树的分支与层级定义（§4–§15、§24、§25）。

两级编号约定，避免歧义：

* `TIER_LADDER`（全局代际阶梯 T1–T10）：跨分支的代际叙述，来自任务书 §24，
  用于报告与矩阵的“代际”列。
* `BRANCHES[].tiers`（分支内 T1–T10）：每个分支自身的演进序列，来自
  任务书 §25「每个分支：T1-T10」。

分支内层级的 `source` 字段区分来源：任务书明确列出的写 `spec`，
为补满 T1–T10 而按公开代际逻辑扩展的写 `gameplay`，明确标注为游戏设定。

本模块是纯数据，不含副作用。
"""
from __future__ import annotations

# §24 全局代际阶梯。
TIER_LADDER = (
    {'tier': 'T1', 'label_zh': '基础被动听音', 'label_en': 'Basic Passive Listening'},
    {'tier': 'T2', 'label_zh': '改进型被动阵列', 'label_en': 'Improved Passive Array'},
    {'tier': 'T3', 'label_zh': '基础主动/被动综合', 'label_en': 'Basic Active/Passive Integration'},
    {'tier': 'T4', 'label_zh': '艇艏阵', 'label_en': 'Bow Array'},
    {'tier': 'T5', 'label_zh': '侧阵', 'label_en': 'Flank Array'},
    {'tier': 'T6', 'label_zh': '拖曳阵', 'label_en': 'Towed Array'},
    {'tier': 'T7', 'label_zh': '低频/分布式阵列', 'label_en': 'Low Frequency / Distributed Array'},
    {'tier': 'T8', 'label_zh': '大型孔径阵', 'label_en': 'Large Aperture Array'},
    {'tier': 'T9', 'label_zh': '多阵融合', 'label_en': 'Multi-Array Fusion'},
    {'tier': 'T10', 'label_zh': '下一代综合水声系统', 'label_en': 'Next Generation Integrated Acoustic System'},
)


def _tier(tier: int, name: str, name_zh: str, source: str = 'gameplay', note: str = '') -> dict:
    return {'tier': tier, 'name': name, 'name_zh': name_zh, 'source': source, 'note': note}


# 分支内 T1–T10 演进序列。
BRANCHES = (
    {
        'branch_id': 'PASSIVE',
        'label_zh': '被动声呐',
        'label_en': 'Passive Sonar',
        'category_label': 'Passive Sonar',
        'description_zh': '不主动辐射声波的听音与阵列分支，是潜艇隐蔽探测的基础。',
        'sockets': ['SOCKET_SONAR_BOW', 'SOCKET_SONAR_FLANK_L', 'SOCKET_SONAR_FLANK_R', 'SOCKET_TOWED_ARRAY'],
        'sub_categories': ['Hydrophone', 'Bow Passive Array', 'Flank Array', 'Towed Array', 'Distributed Array'],
        'tiers': (
            _tier(1, 'Early Passive Hydrophone', '早期被动水听器', 'spec', '任务书 §5 T1'),
            _tier(2, 'Improved Hydrophone', '改进型水听器', 'spec', '任务书 §5 T2'),
            _tier(3, 'Bow Passive Array', '艇艏被动阵', 'spec', '任务书 §5 T3'),
            _tier(4, 'Advanced Bow Array', '先进艇艏阵', 'spec', '任务书 §5 T4'),
            _tier(5, 'Flank Array', '侧阵', 'spec', '任务书 §5 T5'),
            _tier(6, 'Towed Array', '拖曳阵', 'spec', '任务书 §5 T6'),
            _tier(7, 'Low Frequency Towed Array', '低频拖曳阵', 'spec', '任务书 §5 T7'),
            _tier(8, 'Advanced Distributed Array', '先进分布式阵列', 'spec', '任务书 §5 T8'),
            _tier(9, 'Integrated Multi-Array Sonar', '综合多阵声呐', 'spec', '任务书 §5 T9'),
            _tier(10, 'Next Generation Integrated Acoustic System', '下一代综合水声系统', 'spec', '任务书 §5 T10'),
        ),
    },
    {
        'branch_id': 'ACTIVE',
        'label_zh': '主动声呐',
        'label_en': 'Active Sonar',
        'category_label': 'Active Sonar',
        'description_zh': '主动发射并接收回波的分支，暴露自身，只用于必要的测距与搜索。',
        'sockets': ['SOCKET_SONAR_BOW'],
        'sub_categories': ['Active Search', 'Mid-Frequency Active', 'Integrated Active/Passive'],
        'tiers': (
            _tier(1, 'Early Active Sonar', '早期主动声呐', 'spec', '任务书 §6'),
            _tier(2, 'Improved Active Sonar', '改进型主动声呐', 'spec', '任务书 §6'),
            _tier(3, 'Mid-Frequency Active Sonar', '中频主动声呐', 'spec', '任务书 §6'),
            _tier(4, 'Advanced Active Sonar', '先进主动声呐', 'spec', '任务书 §6'),
            _tier(5, 'Integrated Active/Passive Sonar', '主被动综合声呐', 'spec', '任务书 §6'),
            _tier(6, 'Modern Integrated Sonar', '现代综合声呐', 'spec', '任务书 §6'),
            _tier(7, 'Next Generation Acoustic System', '下一代水声系统', 'spec', '任务书 §6'),
            _tier(8, 'Active Bow Aperture Integration', '主动艇艏孔径综合'),
            _tier(9, 'Cooperative Active Processing', '协同主动处理', 'gameplay', '游戏科技树概念，不对应任何现实作战系统'),
            _tier(10, 'Next Generation Active Suite', '下一代主动声呐套件'),
        ),
    },
    {
        'branch_id': 'BOW',
        'label_zh': '艇艏声呐阵',
        'label_en': 'Bow Sonar',
        'category_label': 'Bow Sonar',
        'description_zh': '艇艏孔径结构分支，覆盖球形阵、柱形阵、大型孔径阵等公开可确认的结构演进。',
        'sockets': ['SOCKET_SONAR_BOW'],
        'sub_categories': ['Spherical Array', 'Cylindrical Array', 'Large Aperture Bow', 'Water-backed Array', 'Conformal Array'],
        'tiers': (
            _tier(1, 'Early Bow Dome Sonar', '早期艇艏导流罩声呐'),
            _tier(2, 'Spherical Bow Array', '球形艇艏阵', 'spec', '任务书 §7'),
            _tier(3, 'Cylindrical Bow Array', '柱形艇艏阵', 'spec', '任务书 §7'),
            _tier(4, 'Water-backed Cylindrical Array', '水背衬柱形阵', 'spec', '任务书 §7'),
            _tier(5, 'Large Aperture Bow', '大型孔径艇艏阵', 'spec', '任务书 §7；公开资料确认 Virginia Block III 采用'),
            _tier(6, 'Wide Aperture Conformal Bow', '宽孔径共形艇艏阵'),
            _tier(7, 'Bow Array with Flank Integration', '艇艏/侧阵综合'),
            _tier(8, 'Distributed Bow Aperture', '分布式艇艏孔径'),
            _tier(9, 'Bow Multi-Array Fusion', '艇艏多阵融合'),
            _tier(10, 'Next Generation Bow Aperture System', '下一代艇艏孔径系统'),
        ),
    },
    {
        'branch_id': 'FLANK',
        'label_zh': '侧阵',
        'label_en': 'Flank Array',
        'category_label': 'Flank Array',
        'description_zh': '沿艇体两舷布置的被动孔径，长基线带来优于艇艏阵的测向精度。',
        'sockets': ['SOCKET_SONAR_FLANK_L', 'SOCKET_SONAR_FLANK_R'],
        'sub_categories': ['Early Flank', 'Modern Flank', 'Conformal Flank', 'Integrated Flank'],
        'tiers': (
            _tier(1, 'Experimental Flank Hydrophone', '试验性侧舷水听器'),
            _tier(2, 'Early Flank Array', '早期侧阵', 'spec', '任务书 §8'),
            _tier(3, 'Improved Flank Array', '改进型侧阵'),
            _tier(4, 'Modern Flank Array', '现代侧阵', 'spec', '任务书 §8'),
            _tier(5, 'Large Flank Aperture', '大型侧舷孔径'),
            _tier(6, 'Conformal Flank Array', '共形侧阵', 'spec', '任务书 §8'),
            _tier(7, 'Distributed Flank Array', '分布式侧阵'),
            _tier(8, 'Integrated Flank Array', '综合侧阵', 'spec', '任务书 §8'),
            _tier(9, 'Flank and Towed Fusion', '侧阵与拖曳阵融合'),
            _tier(10, 'Next Generation Flank Aperture', '下一代侧舷孔径'),
        ),
    },
    {
        'branch_id': 'TOWED',
        'label_zh': '拖曳阵',
        'label_en': 'Towed Array',
        'category_label': 'Towed Array',
        'description_zh': '拖曳线列阵分支。只表现公开可见的外形与接口，不制作真实内部结构。',
        'sockets': ['SOCKET_TOWED_ARRAY'],
        'sub_categories': ['Legacy Towed Array', 'Modern Towed Array', 'Low Frequency Towed Array', 'Advanced Towed Array'],
        'tiers': (
            _tier(1, 'Towed Array Housing', '拖曳阵收放舱'),
            _tier(2, 'Legacy Towed Array', '早期拖曳阵', 'spec', '任务书 §9'),
            _tier(3, 'Improved Towed Array', '改进型拖曳阵'),
            _tier(4, 'Modern Towed Array', '现代拖曳阵', 'spec', '任务书 §9'),
            _tier(5, 'Thin-Line Towed Array', '细线拖曳阵'),
            _tier(6, 'Low Frequency Towed Array', '低频拖曳阵', 'spec', '任务书 §9'),
            _tier(7, 'Wide Aperture Towed Array', '宽孔径拖曳阵'),
            _tier(8, 'Advanced Towed Array', '先进拖曳阵', 'spec', '任务书 §9'),
            _tier(9, 'Distributed Towed and Hull Fusion', '拖曳阵与艇壳融合'),
            _tier(10, 'Next Generation Towed System', '下一代拖曳系统'),
        ),
    },
    {
        'branch_id': 'HF',
        'label_zh': '高频声呐',
        'label_en': 'High Frequency Sonar',
        'category_label': 'High Frequency Sonar',
        'description_zh': '高频、近距离声呐分支，覆盖探雷、导航、冰下与近程测距。',
        'sockets': ['SOCKET_SONAR_BOW'],
        'sub_categories': ['Mine Detection', 'Navigation', 'Under Ice', 'Close Range'],
        'tiers': (
            _tier(1, 'Early High Frequency Sonar', '早期高频声呐'),
            _tier(2, 'Improved High Frequency Sonar', '改进型高频声呐'),
            _tier(3, 'Hull-Mounted High Frequency Sonar', '艇壳高频声呐'),
            _tier(4, 'Mine Detection Sonar', '探雷声呐', 'spec', '任务书 §10'),
            _tier(5, 'Navigation Sonar', '导航声呐', 'spec', '任务书 §10'),
            _tier(6, 'Under-Ice Sonar', '冰下声呐', 'spec', '任务书 §10'),
            _tier(7, 'Close Range High Frequency Sonar', '近程高频声呐', 'spec', '任务书 §10'),
            _tier(8, 'Forward-Looking High Frequency Array', '前视高频阵'),
            _tier(9, 'Multi-Function High Frequency Suite', '多功能高频套件'),
            _tier(10, 'Next Generation High Frequency System', '下一代高频系统'),
        ),
    },
    {
        'branch_id': 'MINE',
        'label_zh': '探雷声呐',
        'label_en': 'Mine Detection Sonar',
        'category_label': 'Mine Detection Sonar',
        'description_zh': '水雷规避与探雷分支，强调近距离高分辨率成像与分类。',
        'sockets': ['SOCKET_SONAR_BOW'],
        'sub_categories': ['Mine Detection', 'Mine Classification', 'Mine Avoidance'],
        'tiers': (
            _tier(1, 'Visual Mine Watch', '目视水雷警戒', 'gameplay', '游戏科技树起点'),
            _tier(2, 'Early Mine Detection Sonar', '早期探雷声呐'),
            _tier(3, 'Hull Mine Detection Sonar', '艇壳探雷声呐'),
            _tier(4, 'High Resolution Mine Sonar', '高分辨率探雷声呐'),
            _tier(5, 'Forward-Looking Mine Sonar', '前视探雷声呐'),
            _tier(6, 'Wideband Mine Classification', '宽带水雷分类'),
            _tier(7, 'Synthetic Aperture Mine Sonar', '合成孔径探雷声呐'),
            _tier(8, 'Autonomous Mine Detection', '自主探雷'),
            _tier(9, 'Mine and Navigation Fusion', '探雷/导航融合'),
            _tier(10, 'Next Generation Mine Detection', '下一代探雷系统'),
        ),
    },
    {
        'branch_id': 'NAV',
        'label_zh': '导航声呐',
        'label_en': 'Navigation Sonar',
        'category_label': 'Navigation Sonar',
        'description_zh': '艇用导航声呐分支：测深、测速、冰下导航与导航融合。',
        'sockets': ['SOCKET_SONAR_BOW'],
        'sub_categories': ['Echo Sounder', 'Doppler Velocity Log', 'Under-Ice Navigation', 'Navigation Fusion'],
        'tiers': (
            _tier(1, 'Echo Sounder', '测深仪'),
            _tier(2, 'Improved Echo Sounder', '改进型测深仪'),
            _tier(3, 'Navigation Sonar', '导航声呐'),
            _tier(4, 'Doppler Velocity Log', '多普勒测速仪'),
            _tier(5, 'Under-Ice Navigation Sonar', '冰下导航声呐'),
            _tier(6, 'Navigation and Mine Avoidance', '导航与避雷综合'),
            _tier(7, 'Digital Navigation Suite', '数字化导航套件'),
            _tier(8, 'Terrain-Aided Navigation', '地形辅助导航'),
            _tier(9, 'Navigation Fusion', '组合导航融合'),
            _tier(10, 'Next Generation Navigation System', '下一代导航系统'),
        ),
    },
    {
        'branch_id': 'PHOTONICS',
        'label_zh': '潜望镜与光电桅杆',
        'label_en': 'Periscope and Photonics Mast',
        'category_label': 'Photonics Mast',
        'description_zh': '潜望镜 → 光电桅杆分支（任务书 §11）。',
        'sockets': ['SOCKET_PERISCOPE', 'SOCKET_PHOTONICS_MAST'],
        'sub_categories': ['Optical Periscope', 'Attack Periscope', 'Electronic Periscope', 'Photonics Mast'],
        'tiers': (
            _tier(1, 'Optical Periscope', '光学潜望镜', 'spec', '任务书 §11'),
            _tier(2, 'Improved Periscope', '改进型潜望镜', 'spec', '任务书 §11'),
            _tier(3, 'Attack Periscope', '攻击潜望镜', 'spec', '任务书 §11'),
            _tier(4, 'Electronic Periscope', '电子潜望镜', 'spec', '任务书 §11'),
            _tier(5, 'Optronic Periscope', '光电潜望镜'),
            _tier(6, 'Photonics Mast', '光电桅杆', 'spec', '任务书 §11；公开资料确认 Virginia 级使用'),
            _tier(7, 'Advanced Photonics Mast', '先进光电桅杆', 'spec', '任务书 §11'),
            _tier(8, 'Multi-Sensor Mast', '多传感器桅杆'),
            _tier(9, 'Integrated Mast Suite', '综合桅杆套件'),
            _tier(10, 'Next Generation Mast System', '下一代桅杆系统'),
        ),
    },
    {
        'branch_id': 'EOIR',
        'label_zh': '光电/红外',
        'label_en': 'Electro-Optical / Infrared',
        'category_label': 'EOIR',
        'description_zh': '光电与红外传感器分支，定位为传感器系统而非武器（任务书 §12）。',
        'sockets': ['SOCKET_PHOTONICS_MAST'],
        'sub_categories': ['Electro Optical', 'Infrared', 'Digital Camera', 'Low Light', 'Thermal', 'Integrated EO/IR'],
        'tiers': (
            _tier(1, 'Electro Optical', '光电观瞄', 'spec', '任务书 §12'),
            _tier(2, 'Infrared', '红外', 'spec', '任务书 §12'),
            _tier(3, 'Digital Camera', '数字相机', 'spec', '任务书 §12'),
            _tier(4, 'Low Light', '微光', 'spec', '任务书 §12'),
            _tier(5, 'Thermal', '热成像', 'spec', '任务书 §12'),
            _tier(6, 'Integrated EO/IR', '综合光电/红外', 'spec', '任务书 §12'),
            _tier(7, 'High Definition EO/IR', '高清光电/红外'),
            _tier(8, 'Multi-Spectral EO/IR', '多光谱光电/红外'),
            _tier(9, 'EO/IR Mast Fusion', '光电/桅杆融合'),
            _tier(10, 'Next Generation EO/IR', '下一代光电/红外'),
        ),
    },
    {
        'branch_id': 'RADAR',
        'label_zh': '潜艇雷达',
        'label_en': 'Submarine Radar',
        'category_label': 'Submarine Radar',
        'description_zh': '只记录潜艇使用的公开雷达分支，不复制水面舰艇雷达树（任务书 §13）。',
        'sockets': ['SOCKET_RADAR'],
        'sub_categories': ['Surface Search Radar', 'Navigation Radar', 'Periscope Radar', 'Mast Radar'],
        'tiers': (
            _tier(1, 'Early Surface Search Radar', '早期对海搜索雷达'),
            _tier(2, 'Improved Surface Search Radar', '改进型对海搜索雷达'),
            _tier(3, 'Navigation Radar', '导航雷达', 'spec', '任务书 §13'),
            _tier(4, 'Periscope Radar', '潜望镜雷达', 'spec', '任务书 §13'),
            _tier(5, 'Mast Radar', '桅杆雷达', 'spec', '任务书 §13'),
            _tier(6, 'Frequency Agile Surface Search', '频率捷变对海搜索'),
            _tier(7, 'Low Probability of Intercept Radar', '低截获概率雷达', 'gameplay', '游戏科技树概念'),
            _tier(8, 'Digital Mast Radar', '数字化桅杆雷达'),
            _tier(9, 'Radar and ESM Fusion', '雷达/电子支援融合'),
            _tier(10, 'Next Generation Submarine Radar', '下一代潜艇雷达'),
        ),
    },
    {
        'branch_id': 'ESM',
        'label_zh': '电子支援措施',
        'label_en': 'Electronic Support Measures',
        'category_label': 'ESM',
        'description_zh': '电子支援措施分支：探测、测向、分类与态势感知；电子攻击属于电子战树，不在此处（任务书 §14）。',
        'sockets': ['SOCKET_ESM'],
        'sub_categories': ['Detection', 'Direction Finding', 'Classification', 'Signal Awareness'],
        'tiers': (
            _tier(1, 'Basic Signal Detection', '基础信号探测'),
            _tier(2, 'Improved Signal Detection', '改进型信号探测'),
            _tier(3, 'Radar Warning Receiver', '雷达告警接收机'),
            _tier(4, 'Direction Finding', '测向'),
            _tier(5, 'Classification Library', '信号分类库'),
            _tier(6, 'Modern ESM', '现代电子支援措施'),
            _tier(7, 'Digital ESM', '数字电子支援措施'),
            _tier(8, 'Wideband ESM', '宽带电子支援措施'),
            _tier(9, 'ESM and EO/IR Fusion', '电子支援/光电融合'),
            _tier(10, 'Next Generation ESM', '下一代电子支援措施'),
        ),
    },
    {
        'branch_id': 'PROCESSING',
        'label_zh': '声学处理',
        'label_en': 'Acoustic Processing',
        'category_label': 'Acoustic Processing',
        'description_zh': '声呐科技树的软件层分支（任务书 §15）。AI 仅作为游戏科技树概念，不声称对应任何现实系统。',
        'sockets': [],
        'sub_categories': ['Basic Processing', 'Digital Processing', 'Integrated Processing', 'Beamforming', 'Multi-Array Fusion', 'AI-Assisted', 'Environmental'],
        'tiers': (
            _tier(1, 'Basic Processing', '基础处理', 'spec', '任务书 §15'),
            _tier(2, 'Analog Processing', '模拟处理'),
            _tier(3, 'Digital Processing', '数字处理', 'spec', '任务书 §15'),
            _tier(4, 'Integrated Processing', '综合处理', 'spec', '任务书 §15'),
            _tier(5, 'Advanced Beamforming', '先进波束形成', 'spec', '任务书 §15'),
            _tier(6, 'Broadband Processing', '宽带处理'),
            _tier(7, 'Multi-Array Fusion', '多阵融合', 'spec', '任务书 §15'),
            _tier(8, 'Adaptive Processing', '自适应处理'),
            _tier(9, 'AI-Assisted Acoustic Processing', 'AI 辅助声学处理', 'spec', '任务书 §15；仅作为游戏科技树概念'),
            _tier(10, 'Next Generation Acoustic Processing', '下一代声学处理'),
        ),
    },
)


BRANCH_BY_ID = {branch['branch_id']: branch for branch in BRANCHES}


def branch_tier_name(branch_id: str, tier: int) -> str:
    branch = BRANCH_BY_ID[branch_id]
    for entry in branch['tiers']:
        if entry['tier'] == tier:
            return entry['name']
    raise KeyError(f'{branch_id} T{tier} 未定义')
