#!/usr/bin/env python3
"""核心传感器 3D 资产计划（§21、§32）。

资产分两类，绝不含糊：

* `geometry_source="PUBLIC_FORM"`：外形结构由公开资料可确认（如球形艇艏阵、
  大型孔径艇艏阵、光电桅杆）。只建外形，不建内部结构（§9）。
* `geometry_source="GAMEPLAY_FORM"`：游戏科技树占位件的代表性外形，明示为非
  现实复刻，用于表现科技树层级差异。

尺寸是用于 UE4 场景的代表性外形尺寸（米），不是任何现实系统的性能参数。
"""
from __future__ import annotations

# 共享材质集（传感器工厂专用，与潜艇材质集分离）。
MATERIALS = (
    {'material_id': 'SEN_MAT_ArrayFace', 'label': '声呐阵面', 'base_color': [0.05, 0.07, 0.08, 1.0], 'metallic': 0.1, 'roughness': 0.55},
    {'material_id': 'SEN_MAT_Hull', 'label': '传感器壳体', 'base_color': [0.10, 0.12, 0.14, 1.0], 'metallic': 0.25, 'roughness': 0.60},
    {'material_id': 'SEN_MAT_DarkMetal', 'label': '深色金属', 'base_color': [0.06, 0.06, 0.07, 1.0], 'metallic': 0.85, 'roughness': 0.35},
    {'material_id': 'SEN_MAT_Mast', 'label': '桅杆涂层', 'base_color': [0.13, 0.15, 0.16, 1.0], 'metallic': 0.15, 'roughness': 0.65},
    {'material_id': 'SEN_MAT_Glass', 'label': '光学窗口', 'base_color': [0.05, 0.10, 0.12, 1.0], 'metallic': 0.0, 'roughness': 0.05},
    {'material_id': 'SEN_MAT_Composite', 'label': '复合罩壳', 'base_color': [0.16, 0.17, 0.18, 1.0], 'metallic': 0.0, 'roughness': 0.75},
    {'material_id': 'SEN_MAT_Cable', 'label': '拖缆', 'base_color': [0.04, 0.04, 0.05, 1.0], 'metallic': 0.0, 'roughness': 0.85},
    {'material_id': 'SEN_MAT_Rack', 'label': '处理机柜', 'base_color': [0.12, 0.13, 0.15, 1.0], 'metallic': 0.55, 'roughness': 0.45},
    {'material_id': 'SEN_MAT_RadarFace', 'label': '雷达天线面', 'base_color': [0.18, 0.19, 0.20, 1.0], 'metallic': 0.30, 'roughness': 0.50},
    {'material_id': 'SEN_MAT_ESM', 'label': '电子支援天线', 'base_color': [0.09, 0.10, 0.11, 1.0], 'metallic': 0.70, 'roughness': 0.30},
)

# 每种外形的默认外形尺寸（米），资产条目可覆盖。
FORM_FACTORS = {
    'hydrophone_pair': {'length': 1.2, 'diameter': 0.35, 'note': '舷侧水听器对'},
    'bow_dome_sphere': {'length': 3.6, 'diameter': 4.6, 'note': '艇艏球形阵'},
    'bow_dome_cylinder': {'length': 2.4, 'diameter': 4.4, 'note': '艇艏柱形阵'},
    'bow_water_backed': {'length': 2.8, 'diameter': 4.4, 'note': '水背衬柱形阵'},
    'bow_large_aperture': {'length': 1.6, 'diameter': 7.6, 'note': '大型孔径艇艏阵'},
    'flank_panel': {'length': 12.0, 'diameter': 0.5, 'note': '侧舷平面阵板'},
    'flank_conformal': {'length': 14.0, 'diameter': 0.35, 'note': '共形侧阵'},
    'towed_housing': {'length': 3.2, 'diameter': 0.9, 'note': '拖曳阵收放舱'},
    'towed_line': {'length': 24.0, 'diameter': 0.09, 'note': '拖曳线列阵与拖缆'},
    'hf_dome': {'length': 1.4, 'diameter': 1.5, 'note': '高频声呐导流罩'},
    'mine_head': {'length': 1.6, 'diameter': 1.2, 'note': '探雷声呐头部'},
    'dvl_probe': {'length': 1.0, 'diameter': 0.7, 'note': '多普勒测速换能器'},
    'distributed_pod': {'length': 2.2, 'diameter': 0.8, 'note': '分布式阵节点'},
    'mast_periscope': {'length': 9.5, 'diameter': 0.28, 'note': '潜望镜'},
    'mast_photonics': {'length': 10.5, 'diameter': 0.42, 'note': '光电桅杆'},
    'eo_turret': {'length': 1.1, 'diameter': 0.75, 'note': '光电/红外转塔'},
    'radar_dish': {'length': 1.6, 'diameter': 1.8, 'note': '雷达天线'},
    'esm_mast': {'length': 2.4, 'diameter': 0.30, 'note': '电子支援天线组'},
    'processor_rack': {'length': 1.0, 'diameter': 2.0, 'note': '处理机柜'},
}


def _asset(sensor_id: str, form_factor: str, branch: str, geometry_source: str,
           socket: str, source_note: str, scale: dict | None = None) -> dict:
    spec = dict(FORM_FACTORS[form_factor])
    if scale:
        spec.update(scale)
    return {
        'sensor_id': sensor_id,
        'form_factor': form_factor,
        'branch': branch,
        'geometry_source': geometry_source,
        'socket': socket,
        'source_note': source_note,
        'dimensions_m': {
            'length': spec['length'],
            'diameter': spec['diameter'],
            'height': spec.get('height', spec['diameter']),
        },
    }


# 核心资产表：每个分支至少 2 件，覆盖 §21 要求的完整资产包。
CORE_ASSETS = (
    # 被动声呐
    _asset('GEN_SONAR_PSV_T1', 'hydrophone_pair', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_L',
           '游戏科技树 T1 被动听音件，代表性外形。'),
    _asset('GEN_SONAR_PSV_T3', 'bow_dome_cylinder', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '游戏科技树 T3 艇艏被动阵，代表性外形。'),
    _asset('GEN_SONAR_PSV_T5', 'flank_panel', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_R',
           '游戏科技树 T5 侧阵件，代表性外形。'),
    _asset('GEN_SONAR_PSV_T6', 'towed_housing', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_TOWED_ARRAY',
           '游戏科技树 T6 拖曳阵收放舱，代表性外形。'),
    _asset('GEN_SONAR_PSV_T7', 'towed_line', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_TOWED_ARRAY',
           '游戏科技树 T7 低频拖曳阵，代表性外形。'),
    _asset('GEN_SONAR_PSV_T8', 'distributed_pod', 'PASSIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_R',
           '游戏科技树 T8 分布式阵节点，代表性外形。'),
    # 主动声呐
    _asset('GEN_SONAR_ACT_T3', 'bow_dome_cylinder', 'ACTIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '游戏科技树 T3 中频主动阵，代表性外形。'),
    _asset('GEN_SONAR_ACT_T5', 'bow_dome_sphere', 'ACTIVE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '游戏科技树 T5 主被动综合阵，代表性外形。'),
    # 艇艏阵（现实外形）
    _asset('US_SONAR_BQQ5', 'bow_dome_sphere', 'BOW', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '公开资料确认的艇艏球形阵外形（AN/BQQ-5）。'),
    _asset('US_SONAR_BQQ6', 'bow_dome_cylinder', 'BOW', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '公开资料记载的柱形艇艏阵外形（AN/BQQ-6）。'),
    _asset('US_SONAR_BQQ10', 'bow_dome_sphere', 'BOW', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '公开资料记载的综合声呐艇艏阵外形（AN/BQQ-10）。'),
    _asset('US_SONAR_LAB', 'bow_large_aperture', 'BOW', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '任务书 §7：Virginia Block III 大型孔径艇艏阵，外形为宽孔径而非球形。',
           {'length': 1.6, 'diameter': 7.6}),
    _asset('GEN_SONAR_BOW_T4', 'bow_water_backed', 'BOW', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '水背衬柱形阵外形（任务书 §7 结构项）。'),
    # 侧阵
    _asset('GEN_SONAR_FLK_T2', 'flank_panel', 'FLANK', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_L',
           '早期侧阵代表性外形。'),
    _asset('GEN_SONAR_FLK_T4', 'flank_panel', 'FLANK', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_R',
           '现代侧阵代表性外形，阵板更长。', {'length': 16.0}),
    _asset('GEN_SONAR_FLK_T6', 'flank_conformal', 'FLANK', 'GAMEPLAY_FORM', 'SOCKET_SONAR_FLANK_R',
           '共形侧阵代表性外形。'),
    # 拖曳阵
    _asset('US_SONAR_TB16', 'towed_housing', 'TOWED', 'PUBLIC_FORM', 'SOCKET_TOWED_ARRAY',
           '公开资料记载的早期拖曳阵收放舱外形。'),
    _asset('US_SONAR_TB29', 'towed_line', 'TOWED', 'PUBLIC_FORM', 'SOCKET_TOWED_ARRAY',
           '公开资料记载的细线拖曳阵外形，只建外形与接口。'),
    _asset('GEN_SONAR_TWD_T6', 'towed_line', 'TOWED', 'GAMEPLAY_FORM', 'SOCKET_TOWED_ARRAY',
           '低频拖曳阵代表性外形。', {'length': 30.0}),
    # 高频 / 探雷 / 导航
    _asset('GEN_SONAR_HF_T3', 'hf_dome', 'HF', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '艇壳高频声呐代表性外形。'),
    _asset('US_SONAR_BQS15', 'hf_dome', 'HF', 'PUBLIC_FORM', 'SOCKET_SONAR_BOW',
           '任务书 §10：公开历史系统 AN/BQS-15，只建外形。'),
    _asset('GEN_SONAR_HF_T4', 'mine_head', 'HF', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '探雷声呐头部代表性外形。'),
    _asset('GEN_SONAR_MINE_T4', 'mine_head', 'MINE', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '高分辨率探雷声呐头部代表性外形。'),
    _asset('GEN_SONAR_NAV_T4', 'dvl_probe', 'NAV', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '多普勒测速换能器代表性外形。'),
    _asset('GEN_SONAR_NAV_T5', 'hf_dome', 'NAV', 'GAMEPLAY_FORM', 'SOCKET_SONAR_BOW',
           '冰下导航声呐代表性外形。'),
    # 潜望镜 / 光电桅杆
    _asset('GEN_MAST_PHO_T1', 'mast_periscope', 'PHOTONICS', 'PUBLIC_FORM', 'SOCKET_PERISCOPE',
           '光学潜望镜外形（任务书 §11 T1）。'),
    _asset('GEN_MAST_PHO_T3', 'mast_periscope', 'PHOTONICS', 'PUBLIC_FORM', 'SOCKET_PERISCOPE',
           '攻击潜望镜外形，镜筒更细。', {'diameter': 0.22}),
    _asset('GEN_MAST_PHO_T4', 'mast_periscope', 'PHOTONICS', 'PUBLIC_FORM', 'SOCKET_PERISCOPE',
           '电子潜望镜外形，顶部加装传感器头。'),
    _asset('US_PHO_Virginia', 'mast_photonics', 'PHOTONICS', 'PUBLIC_FORM', 'SOCKET_PHOTONICS_MAST',
           '任务书 §11 指定资产：Virginia 级光电桅杆外形。'),
    _asset('UK_PHO_CM010', 'mast_photonics', 'PHOTONICS', 'PUBLIC_FORM', 'SOCKET_PHOTONICS_MAST',
           '英国潜艇光电桅杆公开称谓对应外形。', {'length': 10.0, 'diameter': 0.38}),
    # 光电/红外
    _asset('GEN_EOIR_T5', 'eo_turret', 'EOIR', 'GAMEPLAY_FORM', 'SOCKET_PHOTONICS_MAST',
           '热成像转塔代表性外形。'),
    _asset('GEN_EOIR_T6', 'eo_turret', 'EOIR', 'GAMEPLAY_FORM', 'SOCKET_PHOTONICS_MAST',
           '综合光电/红外转塔代表性外形，多窗口。'),
    # 雷达
    _asset('GEN_RADAR_T3', 'radar_dish', 'RADAR', 'GAMEPLAY_FORM', 'SOCKET_RADAR',
           '导航雷达天线代表性外形。'),
    _asset('US_RADAR_BPS16', 'radar_dish', 'RADAR', 'PUBLIC_FORM', 'SOCKET_RADAR',
           '公开资料记载的潜艇对海搜索雷达天线外形。'),
    # 电子支援
    _asset('GEN_ESM_T6', 'esm_mast', 'ESM', 'GAMEPLAY_FORM', 'SOCKET_ESM',
           '电子支援天线组代表性外形。'),
    _asset('US_ESM_BLQ10', 'esm_mast', 'ESM', 'PUBLIC_FORM', 'SOCKET_ESM',
           '公开资料记载的电子支援天线组外形。', {'length': 2.8}),
    # 声学处理（软件层的机柜化表现）
    _asset('GEN_PROC_T3', 'processor_rack', 'PROCESSING', 'GAMEPLAY_FORM', '',
           '数字处理机柜代表性外形。', {'length': 1.0, 'diameter': 1.9}),
    _asset('GEN_PROC_T7', 'processor_rack', 'PROCESSING', 'GAMEPLAY_FORM', '',
           '多阵融合处理机柜代表性外形。', {'length': 1.2, 'diameter': 2.2}),
    _asset('GEN_PROC_T9', 'processor_rack', 'PROCESSING', 'GAMEPLAY_FORM', '',
           'AI 辅助处理机柜代表性外形（游戏概念，不对应现实系统）。', {'length': 1.4, 'diameter': 2.4}),
)

CORE_ASSET_BY_ID = {asset['sensor_id']: asset for asset in CORE_ASSETS}
