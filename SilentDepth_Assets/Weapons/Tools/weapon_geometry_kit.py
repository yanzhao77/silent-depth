#!/usr/bin/env python3
"""武器几何工具包（纯 Python，不依赖 Blender）。

输入 weapon manifest 中的 geometry/dimensions 数据，输出可直接写入 mesh 的
顶点、面、材质槽与部件分组。所有型号按自身公开外形特征生成几何：
不同武器由不同剖面、尾段、弹翼、推进形式组合而来，绝不复制改名。

坐标约定与潜艇资产一致：弹头朝向 +X，Y 为左右，Z 为上；单位米。
"""
from __future__ import annotations

import hashlib
import math

TAU = math.pi * 2.0

# 部件分组（同时用于文档与验证）
PART_BODY = 'Body'
PART_NOSE = 'Nose'
PART_TAIL = 'Tail'
PART_FINS = 'Fins'
PART_WINGS = 'Wings'
PART_PROPULSOR = 'Propulsor'
PART_DETAIL = 'Detail'
PART_MARKING = 'Marking'
PART_SEEKER = 'Seeker'
PART_SHELL = 'Shell'

MATERIAL_BODY = 'WPN_MAT_Body'
MATERIAL_NOSE = 'WPN_MAT_Nose'
MATERIAL_FIN = 'WPN_MAT_Fin'
MATERIAL_METAL = 'WPN_MAT_Metal'
MATERIAL_SEEKER = 'WPN_MAT_Seeker'
MATERIAL_MARKING = 'WPN_MAT_Marking'
MATERIAL_SHELL = 'WPN_MAT_Shell'

MATERIAL_LIBRARY = {
    MATERIAL_BODY: {'base_color': (0.32, 0.34, 0.36, 1.0), 'metallic': 0.35, 'roughness': 0.55},
    MATERIAL_NOSE: {'base_color': (0.18, 0.19, 0.21, 1.0), 'metallic': 0.45, 'roughness': 0.42},
    MATERIAL_FIN: {'base_color': (0.24, 0.25, 0.27, 1.0), 'metallic': 0.65, 'roughness': 0.35},
    MATERIAL_METAL: {'base_color': (0.55, 0.56, 0.58, 1.0), 'metallic': 0.85, 'roughness': 0.28},
    MATERIAL_SEEKER: {'base_color': (0.05, 0.07, 0.09, 1.0), 'metallic': 0.10, 'roughness': 0.15},
    MATERIAL_MARKING: {'base_color': (0.78, 0.72, 0.42, 1.0), 'metallic': 0.05, 'roughness': 0.60},
    MATERIAL_SHELL: {'base_color': (0.28, 0.31, 0.30, 1.0), 'metallic': 0.25, 'roughness': 0.62},
}

MATERIAL_ORDER = (
    MATERIAL_BODY, MATERIAL_NOSE, MATERIAL_FIN, MATERIAL_METAL,
    MATERIAL_SEEKER, MATERIAL_MARKING, MATERIAL_SHELL,
)


class Part:
    """累积顶点/面的最小网格容器。"""

    def __init__(self) -> None:
        self.vertices: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.face_materials: list[str] = []
        self.face_groups: list[str] = []

    def add_vertex(self, x: float, y: float, z: float) -> int:
        self.vertices.append((x, y, z))
        return len(self.vertices) - 1

    def add_face(self, indices, material: str, group: str) -> None:
        if len(indices) < 3:
            return
        self.faces.append(tuple(indices))
        self.face_materials.append(material)
        self.face_groups.append(group)

    def stats(self) -> dict:
        return {
            'vertices': len(self.vertices),
            'faces': len(self.faces),
            'triangles': sum(len(face) - 2 for face in self.faces),
        }

    def bounds(self) -> dict:
        if not self.vertices:
            return {}
        xs = [v[0] for v in self.vertices]
        ys = [v[1] for v in self.vertices]
        zs = [v[2] for v in self.vertices]
        return {
            'x': [min(xs), max(xs)],
            'y': [min(ys), max(ys)],
            'z': [min(zs), max(zs)],
            'dimensions_m': [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
        }


# ---------------------------------------------------------------------------
# 基础形体
# ---------------------------------------------------------------------------
def _nose_profile(nose_x: float, radius: float, length: float, kind: str, steps: int):
    points = []
    for index in range(steps + 1):
        t = index / steps
        x = nose_x - length * t
        if kind == 'blunt':
            r = radius * math.sin(t * math.pi * 0.5) ** 0.55
        elif kind == 'cavitator':
            r = radius * (0.35 + 0.65 * t ** 0.6)
        elif kind == 'sharp':
            r = radius * t ** 0.75
        else:
            r = radius * math.sin(t * math.pi * 0.5) ** 0.72
        points.append((x, max(r, radius * 0.012)))
    return points


def body_profile(length: float, radius: float, params: dict, steps: int):
    """按 kind/params 生成回转体剖面，从弹头到弹尾。"""
    nose_kind = params.get('nose', 'ogive')
    if params.get('nose_len_fraction'):
        # 家族级剖面比例：头部/尾段占全长比例，用于拉开同尺寸不同家族的轮廓差异。
        nose_len = min(length * 0.42, length * float(params['nose_len_fraction']))
    else:
        nose_len = min(length * 0.45, radius * float(params.get('nose_len_ratio', 2.0)))
    tail_kind = params.get('tail', 'conical')
    if params.get('tail_len_fraction'):
        tail_len = min(length * 0.34, length * float(params['tail_len_fraction']))
    else:
        tail_len = min(length * 0.35, radius * float(params.get('tail_len_ratio', 1.2)))
    steps = max(4, min(int(steps), 14))

    nose_x = length * 0.5
    tail_x = length * 0.5 - nose_len - tail_len
    profile = list(_nose_profile(nose_x, radius, nose_len, nose_kind, steps))
    if tail_x > nose_x - nose_len:
        profile.append((tail_x, radius))
    if tail_kind == 'boat_tail':
        for index in range(1, steps + 1):
            t = index / steps
            profile.append((tail_x - tail_len * t, radius * (1.0 - 0.55 * t ** 1.5)))
    elif tail_kind == 'skirt':
        profile.append((tail_x - tail_len * 0.35, radius * 0.98))
        profile.append((tail_x - tail_len, radius * 0.94))
    elif tail_kind == 'square':
        profile.append((tail_x - tail_len, radius * 0.96))
    else:
        for index in range(1, steps + 1):
            t = index / steps
            profile.append((tail_x - tail_len * t, radius * (1.0 - 0.9 * t ** 1.2)))
    profile.sort(key=lambda item: -item[0])
    return profile


def lathe(part: Part, profile, segments: int, material: str, group: str,
          cap_nose: bool = True, cap_tail: bool = True) -> None:
    """回转体：绕 X 轴旋转剖面。"""
    rings = []
    for x, radius in profile:
        if radius <= 1e-5:
            rings.append([part.add_vertex(x, 0.0, 0.0)])
            continue
        ring = []
        for step in range(segments):
            angle = TAU * step / segments
            ring.append(part.add_vertex(x, radius * math.cos(angle), radius * math.sin(angle)))
        rings.append(ring)

    for index in range(len(rings) - 1):
        current, following = rings[index], rings[index + 1]
        if len(current) == 1 and len(following) > 1:
            for step in range(segments):
                part.add_face([current[0], following[step], following[(step + 1) % segments]], material, group)
        elif len(following) == 1 and len(current) > 1:
            for step in range(segments):
                part.add_face([current[step], current[(step + 1) % segments], following[0]], material, group)
        elif len(current) > 1 and len(following) > 1:
            for step in range(segments):
                nxt = (step + 1) % segments
                part.add_face([current[step], current[nxt], following[nxt], following[step]], material, group)

    if cap_nose and len(rings[0]) > 1:
        centre = part.add_vertex(profile[0][0], 0.0, 0.0)
        for step in range(segments):
            part.add_face([centre, rings[0][(step + 1) % segments], rings[0][step]], material, group)
    if cap_tail and len(rings[-1]) > 1:
        centre = part.add_vertex(profile[-1][0], 0.0, 0.0)
        for step in range(segments):
            part.add_face([centre, rings[-1][step], rings[-1][(step + 1) % segments]], material, group)


def add_box(part: Part, centre, size, material: str, group: str, roll: float = 0.0) -> None:
    cx, cy, cz = centre
    half = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    corners = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1):
                px, py, pz = dx * half[0], dy * half[1], dz * half[2]
                ry = py * math.cos(roll) - pz * math.sin(roll)
                rz = py * math.sin(roll) + pz * math.cos(roll)
                corners.append(part.add_vertex(cx + px, cy + ry, cz + rz))
    index = lambda a, b, c: a * 4 + b * 2 + c  # noqa: E731
    quads = (
        (index(0, 0, 0), index(0, 0, 1), index(0, 1, 1), index(0, 1, 0)),
        (index(1, 0, 0), index(1, 1, 0), index(1, 1, 1), index(1, 0, 1)),
        (index(0, 0, 0), index(1, 0, 0), index(1, 0, 1), index(0, 0, 1)),
        (index(0, 1, 0), index(0, 1, 1), index(1, 1, 1), index(1, 1, 0)),
        (index(0, 0, 0), index(0, 1, 0), index(1, 1, 0), index(1, 0, 0)),
        (index(0, 0, 1), index(1, 0, 1), index(1, 1, 1), index(0, 1, 1)),
    )
    for quad in quads:
        part.add_face([corners[i] for i in quad], material, group)


def add_plate(part: Part, root_x: float, root_radius: float, span: float, chord_root: float,
              chord_tip: float, thickness: float, roll: float, sweep: float,
              material: str, group: str) -> None:
    """弹翼/尾鳍：根部在弹体表面，沿 +Z 展开后按 roll 绕 X 轴阵列。"""
    cos_r, sin_r = math.cos(roll), math.sin(roll)

    def place(x_local: float, y_local: float, z_local: float) -> int:
        y = y_local * cos_r - z_local * sin_r
        z = y_local * sin_r + z_local * cos_r
        return part.add_vertex(x_local, y, z)

    base_z = root_radius
    tip_z = root_radius + span
    half = thickness * 0.5
    tip_x = root_x - sweep
    lower = [
        place(root_x + chord_root * 0.5, -half, base_z),
        place(root_x - chord_root * 0.5, -half, base_z),
        place(tip_x - chord_tip * 0.5, -half, tip_z),
        place(tip_x + chord_tip * 0.5, -half, tip_z),
    ]
    upper = [
        place(root_x + chord_root * 0.5, half, base_z),
        place(root_x - chord_root * 0.5, half, base_z),
        place(tip_x - chord_tip * 0.5, half, tip_z),
        place(tip_x + chord_tip * 0.5, half, tip_z),
    ]
    part.add_face([lower[0], lower[1], lower[2], lower[3]], material, group)
    part.add_face([upper[3], upper[2], upper[1], upper[0]], material, group)
    part.add_face([lower[0], lower[3], upper[3], upper[0]], material, group)
    part.add_face([lower[1], upper[1], upper[2], lower[2]], material, group)
    part.add_face([lower[0], upper[0], upper[1], lower[1]], material, group)
    part.add_face([lower[3], lower[2], upper[2], upper[3]], material, group)


def add_ring(part: Part, x: float, radius: float, width: float, segments: int,
             material: str, group: str, thickness: float = 0.008) -> None:
    inner = max(radius - thickness, radius * 0.6)
    profile = [
        (x + width * 0.5, radius),
        (x + width * 0.5, inner),
        (x - width * 0.5, inner),
        (x - width * 0.5, radius),
    ]
    lathe(part, profile, segments, material, group, cap_nose=False, cap_tail=False)


def add_propeller(part: Part, x: float, hub_radius: float, blade_radius: float,
                  blades: int, material: str, group: str, tilt: float = 0.5) -> None:
    add_ring(part, x, hub_radius, hub_radius * 1.1, max(6, blades * 2), material, group,
             thickness=hub_radius * 0.9)
    for blade in range(blades):
        roll = TAU * blade / blades
        add_plate(part, x, hub_radius * 0.9, blade_radius - hub_radius * 0.9,
                  hub_radius * 0.9, hub_radius * 0.5, hub_radius * 0.22,
                  roll, hub_radius * tilt, material, group)


def add_pumpjet(part: Part, x: float, radius: float, length: float, blades: int,
                material: str, group: str) -> None:
    shroud_radius = radius * 0.98
    profile = [
        (x + length * 0.5, radius * 0.9),
        (x + length * 0.5, shroud_radius),
        (x - length * 0.5, shroud_radius),
        (x - length * 0.5, radius * 0.86),
    ]
    lathe(part, profile, max(8, blades * 3), material, group, cap_nose=False, cap_tail=False)
    add_ring(part, x, radius * 0.55, radius * 0.4, max(8, blades * 2), MATERIAL_METAL, PART_PROPULSOR,
             thickness=radius * 0.36)
    for blade in range(blades):
        roll = TAU * blade / blades
        add_plate(part, x, radius * 0.6, radius * 0.3, radius * 0.32, radius * 0.22,
                  radius * 0.08, roll, 0.0, material, group)


def add_fin_set(part: Part, x: float, radius: float, count: int, span_ratio: float,
                chord_ratio: float, sweep_ratio: float, thickness_ratio: float,
                material: str, group: str) -> None:
    if count <= 0:
        return
    offset = 0.0 if count % 2 == 0 else math.pi * 0.5 / max(count, 1)
    for blade in range(count):
        roll = TAU * blade / count + offset
        add_plate(part, x, radius * 0.96, radius * (span_ratio - 1.0),
                  radius * chord_ratio, radius * chord_ratio * 0.62,
                  radius * thickness_ratio, roll, radius * sweep_ratio, material, group)


def add_strakes(part: Part, x_from: float, x_to: float, radius: float, count: int,
                height: float, material: str, group: str) -> None:
    length = x_from - x_to
    mid = (x_from + x_to) * 0.5
    for index in range(count):
        roll = TAU * index / count
        add_plate(part, mid, radius * 0.99, height, length, length * 0.85,
                  radius * 0.06, roll, 0.0, material, group)


def add_accent_detail(part: Part, length: float, radius: float, params: dict,
                      segments: int, medium: bool) -> None:
    """家族区分特征：不同 Family 得到不同的可辨识细节。"""
    accent = int(params.get('accent', 0) or 0)
    if accent == 1:
        add_plate(part, length * 0.06, radius * 0.96, radius * 0.55,
                  length * 0.14, length * 0.08, radius * 0.07,
                  math.pi * 0.5, length * 0.04, MATERIAL_FIN, PART_DETAIL)
    elif accent == 2 and medium:
        add_ring(part, -length * 0.26, radius * 1.03, radius * 0.22, segments,
                 MATERIAL_MARKING, PART_MARKING, thickness=radius * 0.05)
    elif accent == 3:
        for roll in (0.0, math.pi):
            add_plate(part, length * 0.02, radius * 0.97, radius * 0.42,
                      length * 0.34, length * 0.2, radius * 0.06,
                      roll, length * 0.06, MATERIAL_FIN, PART_DETAIL)


# ---------------------------------------------------------------------------
# 按武器类型生成完整几何
# ---------------------------------------------------------------------------
def _segments(detail: int) -> int:
    """LOD0=48, LOD1=24, LOD2=16, LOD3=10。"""
    return {0: 48, 1: 24, 2: 16, 3: 10}.get(detail, 48)


def _intake_count(value) -> int:
    """把数据层的进气形式描述转换成数量。"""
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value or '').lower()
    if text in ('none', '', '0'):
        return 0
    if text in ('four', '4', 'quad'):
        return 4
    if text in ('two', 'twin', '2', 'dual'):
        return 2
    if text in ('nose', 'single', '1'):
        return 1
    return 2


def family_shape_signature(token: str) -> dict:
    """由家族几何标识派生的确定性外形签名。

    数据层允许同一 Family 内的变体共享基础几何（规范第 20 条），但不同 Family
    必须是不同外形（规范第 66-67 条：禁止复制改名）。当两个家族的数据恰好得出
    相同参数时，用家族标识派生的有界偏移把它们区分开：

    - **结构性差异优先**：头部剖面样式、尾段样式、控制面数量与后掠是不同的
      离散配置，而不是同一外形上的微小抖动——否则同尺寸武器在游戏镜头下仍是
      同一个外形。
    - 只在数据层使用通用默认值时才做替换（例如 nose='ogive' / tail='conical'），
      数据层明确写出的特征（如 Shkval 的 cavitator、鱼雷的 pumpjet）保持不变。
    - 偏移只作用于不影响声明长度/直径的特征，模型不会偏离该型号的公开尺寸级别。
    """
    if not token:
        return {'nose_scale': 1.0, 'tail_scale': 1.0, 'fin_span_scale': 1.0,
                'fin_chord_scale': 1.0, 'sweep_scale': 1.0, 'band_phase': 0.0, 'accent': 0,
                'nose_style': None, 'tail_style': None, 'fin_count': None, 'blade_count': 0,
                'nose_frac': 0.0, 'tail_frac': 0.0}
    digest = hashlib.sha1(token.encode('utf-8')).digest()
    unit = [byte / 255.0 for byte in digest[:12]]
    nose_styles = ('ogive', 'blunt', 'sharp', 'ogive', 'sharp', 'blunt')
    tail_styles = ('conical', 'boat_tail', 'square', 'conical', 'boat_tail', 'square')
    fin_counts = (4, 4, 3, 6, 4, 3, 6, 4)
    return {
        'nose_scale': 0.72 + 0.62 * unit[0],
        'tail_scale': 0.70 + 0.60 * unit[1],
        'fin_span_scale': 0.78 + 0.55 * unit[2],
        'fin_chord_scale': 0.72 + 0.66 * unit[3],
        'sweep_scale': 0.25 + 1.35 * unit[4],
        'band_phase': unit[5],
        'accent': int(digest[6] % 4),
        'nose_style': nose_styles[int(digest[7] % len(nose_styles))],
        'tail_style': tail_styles[int(digest[8] % len(tail_styles))],
        'fin_count': fin_counts[int(digest[9] % len(fin_counts))],
        'blade_count': 5 + int(digest[10] % 4),
        'nose_frac': 0.12 + 0.17 * unit[11],
        'tail_frac': 0.08 + 0.14 * unit[6],
    }


def normalize_params(params: dict, features, kind: str, radius: float,
                     family_token: str | None = None) -> tuple[dict, set]:
    """把数据层的几何参数词表归一化为几何工具内部词表。

    数据分册使用与潜艇管线一致的参数命名（fin_count / tail_count / wing_pairs ...），
    这里统一映射，避免每个分册都要了解建模细节。
    """
    raw = dict(params or {})
    feature_set = {str(item) for item in (features or [])}

    def pick(*names, default=None):
        for name in names:
            if name in raw and raw[name] is not None:
                return raw[name]
        return default

    def number(*names, default=0.0):
        value = pick(*names, default=default)
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    out: dict = {}
    out['nose'] = str(pick('nose', default='ogive'))
    out['nose_len_ratio'] = number('nose_len_ratio', default=2.0)
    out['tail'] = str(pick('tail', default='conical'))
    out['tail_len_ratio'] = number('tail_len_ratio', default=1.2)
    out['fin_count'] = int(number('fin_count', 'fins', 'tail_count', default=4))
    out['fin_span_ratio'] = number('fin_span_ratio', 'tail_span_ratio', default=1.45)
    out['fin_chord_ratio'] = number('fin_chord_ratio', 'tail_chord_ratio', default=1.1)
    out['wire_dispenser'] = bool(number('wire_dispenser', default=0))
    out['sonar_windows'] = int(number('sonar_windows', 'windows', default=0))
    out['bands'] = int(number('bands', default=0))
    out['strakes'] = int(number('strakes', default=0))
    out['cable_trays'] = int(number('cable_trays', default=0))
    out['horns'] = int(number('horns', default=0))
    out['rails'] = bool(number('rails', 'runner_rails', default=0))
    out['mooring'] = bool(number('mooring', default=0)) or 'mooring' in feature_set
    out['hatch_rings'] = int(number('hatch_rings', default=0))
    out['rings'] = int(number('rings', default=0))
    out['dispenser'] = bool(number('dispenser', default=0)) or 'dispenser_rings' in feature_set
    out['canister'] = bool(number('canister', default=0))
    out['stage_rings'] = int(number('stage_rings', default=0))
    out['tail_skirt'] = bool(number('tail_skirt', default=0)) or 'tail_skirt' in feature_set
    out['base_cover'] = bool(number('base_cover', default=0))

    nozzle = pick('nozzle', default=None)
    out['nozzle'] = bool(nozzle) if nozzle is not None else True

    wing_pairs = number('wing_pairs', default=0)
    wing_type = str(pick('wing_type', default='none')).lower()
    explicit_wing_count = pick('wing_count')
    if explicit_wing_count is not None:
        wing_count = int(number('wing_count', default=0))
    elif wing_type not in ('none', '', '0') and wing_pairs:
        wing_count = int(wing_pairs * 2)
    else:
        wing_count = 0
    out['wing_count'] = wing_count
    if wing_count:
        out['wing_span_m'] = radius * number('wing_span_ratio', default=3.2)
        out['wing_x_ratio'] = number('wing_position', default=0.32)
        out['wing_sweep_ratio'] = number('wing_sweep_deg', default=30.0) / 90.0
    else:
        out['wing_span_m'] = 0.0
        out['wing_x_ratio'] = number('wing_position', default=0.32)
        out['wing_sweep_ratio'] = 0.0

    explicit_booster = pick('booster')
    out['booster'] = bool(number('booster', default=0)) or 'solid_booster' in feature_set \
        or 'ring_booster' in feature_set or explicit_booster is True
    out['booster_len_ratio'] = number('booster_len_ratio', default=0.24)
    out['intakes'] = _intake_count(pick('intake_type', default=0))
    if out['intakes'] == 0 and ('twin_intakes' in feature_set or 'ramjet' in feature_set):
        out['intakes'] = 2
    out['propulsor'] = str(pick('propulsor', default=''))
    if not out['propulsor']:
        if 'pumpjet' in feature_set or 'shrouded_propulsor' in feature_set:
            out['propulsor'] = 'pumpjet'
        elif 'rocket_nozzle' in feature_set:
            out['propulsor'] = 'rocket_nozzle'
        elif 'twin_propeller' in feature_set or 'contra_propeller' in feature_set:
            out['propulsor'] = 'contra_propeller'
        else:
            out['propulsor'] = 'contra_propeller'
    if number('propulsor_shroud', default=0) and out['propulsor'] in ('', 'propeller'):
        out['propulsor'] = 'pumpjet'
    feature_set.update({
        'pumpjet' if out['propulsor'] == 'pumpjet' else '',
        'rocket_nozzle' if out['propulsor'] == 'rocket_nozzle' else '',
        'wire_dispenser' if out['wire_dispenser'] else '',
        'mooring' if out['mooring'] else '',
        'dispenser_rings' if out['dispenser'] else '',
        'canister_launch' if out['canister'] else '',
        'booster' if out['booster'] else '',
        'tail_skirt' if out['tail_skirt'] else '',
        'ramjet' if out['intakes'] else '',
        'supercavitating' if 'cavitator' in feature_set or out['nose'] == 'cavitator' else '',
    })
    feature_set.discard('')
    signature = family_shape_signature(family_token or '')
    # 结构性差异：仅在数据层使用通用默认值时替换，保持已声明的特殊外形。
    if signature.get('nose_style') and out['nose'] == 'ogive':
        out['nose'] = signature['nose_style']
    if signature.get('tail_style') and out['tail'] == 'conical':
        out['tail'] = signature['tail_style']
    if signature.get('fin_count') and out['fin_count'] in (4,):
        out['fin_count'] = signature['fin_count']
    out['nose_len_ratio'] = max(0.6, out['nose_len_ratio'] * signature['nose_scale'])
    out['tail_len_ratio'] = max(0.4, out['tail_len_ratio'] * signature['tail_scale'])
    if out['fin_count']:
        out['fin_span_ratio'] = max(1.05, out['fin_span_ratio'] * signature['fin_span_scale'])
        out['fin_chord_ratio'] = max(0.5, out['fin_chord_ratio'] * signature['fin_chord_scale'])
    if out['wing_count']:
        out['wing_span_m'] = out['wing_span_m'] * signature['fin_span_scale']
        out['wing_sweep_ratio'] = out['wing_sweep_ratio'] * signature['sweep_scale']
    out['band_phase'] = signature['band_phase']
    out['accent'] = signature['accent']
    out['blade_count'] = signature['blade_count']
    # 剖面比例按全长百分比给出：同尺寸不同家族的控制段长度明显不同，
    # 而全长与最大直径仍然严格等于声明的公开尺寸。
    out['nose_len_fraction'] = signature['nose_frac']
    out['tail_len_fraction'] = signature['tail_frac']
    return out, feature_set


def build_geometry(spec: dict, detail: int = 0) -> Part:
    geometry = spec['geometry']
    length = float(spec['dimensions']['length_m'])
    diameter = float(spec.get('body_diameter_m') or spec['dimensions'].get('diameter_m') or 0.533)
    radius = max(diameter * 0.5, 0.02)
    kind = geometry['kind']
    params, features = normalize_params(
        geometry.get('params'), geometry.get('features'), kind, radius,
        spec.get('family_id') or spec.get('base_geometry'),
    )

    part = Part()
    segments = _segments(detail)
    fine = detail == 0
    medium = detail <= 1

    if kind == 'torpedo':
        profile = body_profile(length, radius, params, 12 if fine else 6)
        lathe(part, profile, segments, MATERIAL_BODY, PART_BODY)
        _torpedo_details(part, length, radius, params, features, segments, fine, medium)
    elif kind in ('cruise_missile', 'supersonic_missile'):
        profile = body_profile(length, radius, params, 12 if fine else 6)
        lathe(part, profile, segments, MATERIAL_BODY, PART_BODY)
        _missile_details(part, length, radius, params, features, segments, fine, medium, kind)
    elif kind == 'slbm':
        profile = body_profile(length, radius, params, 10 if fine else 5)
        lathe(part, profile, segments, MATERIAL_SHELL, PART_BODY)
        _slbm_details(part, length, radius, params, features, segments, fine, medium)
    elif kind == 'glide_body':
        _glide_body(part, length, radius, params, segments, fine)
    elif kind == 'mine':
        _mine(part, length, radius, params, features, segments, fine)
    elif kind == 'decoy':
        _decoy(part, length, radius, params, features, segments, fine)
    elif kind == 'shelter':
        _shelter(part, length, radius, params, features, fine, detail)
    elif kind == 'sdv':
        _sdv(part, length, radius, params, features, segments, fine)
    elif kind == 'rocket_payload':
        profile = body_profile(length, radius, params, 10 if fine else 5)
        lathe(part, profile, segments, MATERIAL_BODY, PART_BODY)
        _rocket_details(part, length, radius, params, features, segments, fine, medium)
    else:  # pragma: no cover - schema validation prevents this
        raise ValueError(f'unsupported geometry kind: {kind}')
    add_accent_detail(part, length, radius, params, segments, medium)
    return part


def _torpedo_details(part: Part, length: float, radius: float, params: dict, features,
                     segments: int, fine: bool, medium: bool) -> None:
    nose_x = length * 0.5
    tail_x = -length * 0.5
    fin_count = int(params.get('fin_count', 4))
    if fin_count:
        add_fin_set(part, tail_x + radius * 0.9, radius, fin_count,
                    float(params.get('fin_span_ratio', 1.45)),
                    float(params.get('fin_chord_ratio', 1.1)),
                    0.55, 0.16, MATERIAL_FIN, PART_FINS)
    propulsor = params.get('propulsor', 'contra_propeller')
    blades = int(params.get('blade_count') or max(4, fin_count))
    if propulsor == 'pumpjet':
        add_pumpjet(part, tail_x + radius * 1.5, radius, radius * 3.0,
                    max(7, blades + 3), MATERIAL_METAL, PART_PROPULSOR)
    elif propulsor == 'propeller':
        add_propeller(part, tail_x + radius * 0.6, radius * 0.34, radius * 0.95,
                      max(3, blades), MATERIAL_METAL, PART_PROPULSOR)
    elif propulsor == 'rocket_nozzle':
        nozzle = [
            (tail_x + radius * 1.4, radius * 0.72),
            (tail_x + radius * 0.2, radius * 0.62),
            (tail_x + radius * 0.05, radius * 0.48),
        ]
        lathe(part, nozzle, segments, MATERIAL_METAL, PART_PROPULSOR)
    else:
        add_propeller(part, tail_x + radius * 1.0, radius * 0.3, radius * 0.9,
                      max(6, blades * 2), MATERIAL_METAL, PART_PROPULSOR)
    if 'supercavitating' in features or params.get('nose') == 'cavitator':
        disc = [
            (nose_x - radius * 0.15, radius * 0.30),
            (nose_x - radius * 0.55, radius * 0.95),
            (nose_x - radius * 0.75, radius * 0.95),
        ]
        lathe(part, disc, segments, MATERIAL_METAL, PART_NOSE)
    if params.get('wire_dispenser'):
        add_box(part, (tail_x + radius * 2.6, 0.0, radius * 0.92),
                (radius * 2.0, radius * 0.5, radius * 0.5), MATERIAL_METAL, PART_DETAIL)
    windows = int(params.get('sonar_windows', 0) or 0)
    if windows and fine:
        for index in range(windows):
            angle = math.pi * (0.15 + 0.7 * (index / max(windows - 1, 1)) if windows > 1 else 0.5)
            wx = nose_x - radius * (1.2 + 0.5 * index)
            if abs(wx) < length * 0.5:
                add_box(part, (wx, radius * 0.98 * math.cos(angle), radius * 0.98 * math.sin(angle)),
                        (radius * 0.9, radius * 0.3, radius * 0.45), MATERIAL_SEEKER, PART_SEEKER,
                        roll=angle)
    bands = int(params.get('bands', 0) or 0)
    if medium and bands:
        for index in range(bands):
            bx = length * 0.5 - length * (0.32 + 0.14 * index)
            if bx > -length * 0.5 + radius:
                add_ring(part, bx, radius * 1.01, radius * 0.32, segments, MATERIAL_MARKING, PART_MARKING)
    if fine and 'thermal' in features:
        add_box(part, (length * 0.5 - length * 0.30, 0.0, radius * 1.02),
                (radius * 1.6, radius * 0.5, radius * 0.26), MATERIAL_METAL, PART_DETAIL)
    if params.get('strakes'):
        add_strakes(part, nose_x - length * 0.30, tail_x + length * 0.24, radius,
                    int(params['strakes']), radius * 0.2, MATERIAL_FIN, PART_FINS)


def _missile_details(part: Part, length: float, radius: float, params: dict, features,
                     segments: int, fine: bool, medium: bool, kind: str) -> None:
    nose_x = length * 0.5
    tail_x = -length * 0.5
    fin_count = int(params.get('fin_count', 4))
    wing_count = int(params.get('wing_count', 2))
    wing_span = float(params.get('wing_span_m', radius * 3.4))
    if wing_count:
        wing_x = tail_x + length * float(params.get('wing_x_ratio', 0.32))
        for index in range(wing_count):
            roll = (0.0 if wing_count == 2 else TAU * index / wing_count)
            add_plate(part, wing_x, radius * 0.98, wing_span, radius * 3.2, radius * 1.5,
                      radius * 0.14, roll, radius * 0.9, MATERIAL_FIN, PART_WINGS)
    if fin_count:
        add_fin_set(part, tail_x + radius * 1.1, radius, fin_count,
                    float(params.get('fin_span_ratio', 1.9)), 1.4, 0.5, 0.14,
                    MATERIAL_FIN, PART_FINS)
    if 'booster' in features or params.get('booster'):
        booster_len = length * 0.22
        booster = [
            (tail_x + booster_len, radius * 0.98),
            (tail_x + booster_len * 0.5, radius * 1.42),
            (tail_x, radius * 1.42),
            (tail_x, radius * 1.05),
        ]
        lathe(part, booster, segments, MATERIAL_METAL, PART_TAIL)
    if 'pumpjet' in features:
        add_pumpjet(part, tail_x + radius * 1.3, radius, radius * 2.2,
                    max(6, fin_count + 2), MATERIAL_METAL, PART_PROPULSOR)
    intakes = int(params.get('intakes', 0) or 0)
    if intakes and fine:
        for index in range(intakes):
            angle = TAU * index / intakes
            add_box(part, (nose_x - length * 0.30, radius * 1.05 * math.cos(angle),
                           radius * 1.05 * math.sin(angle)),
                    (length * 0.22, radius * 0.7, radius * 0.7), MATERIAL_METAL, PART_DETAIL,
                    roll=angle)
    if 'pop_out_wings' in features and medium:
        add_ring(part, nose_x - length * 0.42, radius * 1.02, radius * 0.5, segments,
                 MATERIAL_METAL, PART_DETAIL, thickness=radius * 0.08)
    if medium and params.get('bands', 0):
        for index in range(int(params['bands'])):
            add_ring(part, length * 0.5 - length * (0.34 + 0.15 * index), radius * 1.02,
                     radius * 0.3, segments, MATERIAL_MARKING, PART_MARKING)
    if kind == 'supersonic_missile' and intakes:
        for index in range(intakes):
            angle = TAU * index / intakes
            add_box(part, (nose_x - length * 0.34, radius * 1.38 * math.cos(angle),
                           radius * 1.38 * math.sin(angle)),
                    (length * 0.3, radius * 0.22, radius * 0.9), MATERIAL_SHELL, PART_NOSE,
                    roll=angle)


def _slbm_details(part: Part, length: float, radius: float, params: dict, features,
                  segments: int, fine: bool, medium: bool) -> None:
    nose_x = length * 0.5
    tail_x = -length * 0.5
    if (params.get('nose') in ('shroud', 'dome') or 'nose_shroud' in features) and fine:
        shroud = [
            (nose_x, radius * 0.16),
            (nose_x - radius * 1.6, radius * 0.55),
            (nose_x - radius * 2.4, radius * 0.98),
            (nose_x - radius * 2.6, radius * 0.98),
        ]
        lathe(part, shroud, segments, MATERIAL_NOSE, PART_NOSE)
    if params.get('tail_skirt') or 'tail_skirt' in features:
        skirt = [
            (tail_x + radius * 2.4, radius * 0.98),
            (tail_x + radius * 0.6, radius * 1.02),
            (tail_x, radius * 0.80),
        ]
        lathe(part, skirt, segments, MATERIAL_SHELL, PART_TAIL)
    if params.get('nozzle', True) or 'nozzle' in features:
        nozzle = [
            (tail_x + radius * 0.8, radius * 0.66),
            (tail_x, radius * 0.52),
            (tail_x + radius * 0.05, radius * 0.72),
        ]
        lathe(part, nozzle, segments, MATERIAL_METAL, PART_PROPULSOR)
    fin_count = int(params.get('fin_count', 0) or 0)
    if fin_count:
        add_fin_set(part, tail_x + radius * 1.3, radius, fin_count,
                    float(params.get('fin_span_ratio', 1.2)),
                    float(params.get('fin_chord_ratio', 0.8)),
                    0.45, 0.12, MATERIAL_FIN, PART_FINS)
    if 'strakes' in features or params.get('strakes'):
        add_strakes(part, nose_x - length * 0.32, tail_x + length * 0.22, radius, 4,
                    radius * 0.22, MATERIAL_FIN, PART_FINS)
    for index in range(int(params.get('stage_rings', 0) or 0)):
        ring_x = nose_x - length * (0.24 + 0.2 * index)
        if ring_x > tail_x + radius * 2.0:
            add_ring(part, ring_x, radius * 1.05, radius * 0.5, segments,
                     MATERIAL_METAL, PART_DETAIL, thickness=radius * 0.1)
    for index in range(int(params.get('cable_trays', 0) or 0)):
        roll = TAU * index / max(int(params.get('cable_trays', 1)), 1)
        add_box(part, (nose_x - length * 0.5, radius * 1.02 * math.cos(roll),
                       radius * 1.02 * math.sin(roll)),
                (length * 0.7, radius * 0.16, radius * 0.26), MATERIAL_METAL, PART_DETAIL,
                roll=roll)
    if 'gas_generator' in features:
        for index in range(4):
            roll = TAU * index / 4.0
            add_box(part, (tail_x + length * 0.06, radius * 0.86 * math.cos(roll),
                           radius * 0.86 * math.sin(roll)),
                    (length * 0.05, radius * 0.34, radius * 0.34), MATERIAL_METAL, PART_DETAIL,
                    roll=roll)
    if medium and params.get('bands', 0):
        for index in range(int(params['bands'])):
            add_ring(part, nose_x - length * (0.2 + 0.12 * index), radius * 1.01,
                     radius * 0.3, segments, MATERIAL_MARKING, PART_MARKING)


def _glide_body(part: Part, length: float, radius: float, params: dict, segments: int, fine: bool) -> None:
    profile = [
        (length * 0.5, radius * 0.12),
        (length * 0.28, radius * 0.62),
        (length * 0.05, radius * 0.98),
        (-length * 0.22, radius * 0.86),
        (-length * 0.5, radius * 0.42),
    ]
    lathe(part, profile, segments, MATERIAL_SHELL, PART_BODY)
    fin_count = int(params.get('fin_count', 2) or 0)
    if fine and fin_count:
        for index in range(fin_count):
            roll = math.pi * index
            add_plate(part, length * 0.05, radius * 0.9,
                      radius * float(params.get('fin_span_ratio', 1.6)), length * 0.34,
                      length * 0.2, radius * 0.1, roll, length * 0.1, MATERIAL_FIN, PART_WINGS)


def _mine(part: Part, length: float, radius: float, params: dict, features, segments: int, fine: bool) -> None:
    blunt = str(params.get('nose', 'hemispherical')) in ('hemispherical', 'dome', 'blunt')
    if blunt:
        profile = [
            (length * 0.5, 0.0),
            (length * 0.44, radius * 0.66),
            (length * 0.36, radius * 0.92),
            (length * 0.28, radius),
            (-length * 0.28, radius),
            (-length * 0.42, radius * 0.72),
            (-length * 0.5, 0.0),
        ]
    else:
        profile = [
            (length * 0.5, radius * 0.2),
            (length * 0.36, radius * 0.85),
            (length * 0.2, radius),
            (-length * 0.28, radius),
            (-length * 0.42, radius * 0.72),
            (-length * 0.5, 0.0),
        ]
    lathe(part, profile, segments, MATERIAL_SHELL, PART_BODY)
    if 'flotation_collar' in features or params.get('mooring'):
        add_ring(part, 0.0, radius * 1.06, radius * 0.55, segments, MATERIAL_METAL, PART_DETAIL,
                 thickness=radius * 0.16)
    if params.get('mooring') or 'mooring' in features:
        add_box(part, (0.0, 0.0, radius * 1.25), (radius * 0.3, radius * 0.3, radius * 0.9),
                MATERIAL_METAL, PART_DETAIL)
    for index in range(int(params.get('horns', 0) or 0)):
        roll = TAU * index / max(int(params.get('horns', 1)), 1)
        add_box(part, (length * 0.32, radius * 0.92 * math.cos(roll), radius * 0.92 * math.sin(roll)),
                (length * 0.08, radius * 0.3, radius * 0.3), MATERIAL_METAL, PART_DETAIL, roll=roll)
    if params.get('rails'):
        for side in (1, -1):
            add_box(part, (0.0, 0.0, side * radius * 0.4),
                    (length * 0.9, radius * 1.9, radius * 0.12), MATERIAL_METAL, PART_DETAIL)
    if params.get('fin_count'):
        add_fin_set(part, -length * 0.3, radius, int(params['fin_count']),
                    float(params.get('fin_span_ratio', 1.2)), float(params.get('fin_chord_ratio', 0.7)),
                    0.4, 0.12, MATERIAL_FIN, PART_FINS)
    if 'canister' in features or params.get('canister'):
        for index in range(2):
            add_box(part, (0.0, radius * (1.0 if index == 0 else -1.0), 0.0),
                    (length, radius * 0.22, radius * 0.5), MATERIAL_METAL, PART_DETAIL)
    if fine:
        for index in range(4):
            roll = TAU * index / 4.0
            add_box(part, (length * 0.2, radius * 0.96 * math.cos(roll), radius * 0.96 * math.sin(roll)),
                    (length * 0.1, radius * 0.3, radius * 0.3), MATERIAL_MARKING, PART_MARKING, roll=roll)


def _decoy(part: Part, length: float, radius: float, params: dict, features, segments: int, fine: bool) -> None:
    capsule = str(params.get('body', 'capsule')) == 'capsule'
    if capsule:
        profile = [
            (length * 0.5, 0.0),
            (length * 0.42, radius * 0.7),
            (length * 0.24, radius),
            (-length * 0.24, radius),
            (-length * 0.42, radius * 0.7),
            (-length * 0.5, 0.0),
        ]
    else:
        profile = [
            (length * 0.5, radius * 0.3),
            (length * 0.34, radius * 0.95),
            (length * 0.2, radius),
            (-length * 0.3, radius),
            (-length * 0.42, radius * 0.8),
            (-length * 0.5, 0.0),
        ]
    lathe(part, profile, segments, MATERIAL_BODY, PART_BODY)
    ring_count = int(params.get('rings', 0) or 0)
    if ring_count or 'dispenser_rings' in features or params.get('dispenser'):
        total = max(ring_count, 2)
        for index in range(total):
            offset = 0.18 - 0.28 * (index / max(total - 1, 1))
            add_ring(part, length * offset, radius * 1.08, radius * 0.36,
                     segments, MATERIAL_METAL, PART_DETAIL, thickness=radius * 0.12)
    if 'flotation_collar' in features:
        add_ring(part, 0.0, radius * 1.2, radius * 0.7, segments, MATERIAL_SHELL, PART_DETAIL,
                 thickness=radius * 0.22)
    if params.get('fin_count'):
        add_fin_set(part, -length * 0.3, radius, int(params['fin_count']),
                    float(params.get('fin_span_ratio', 1.2)), float(params.get('fin_chord_ratio', 0.6)),
                    0.3, 0.1, MATERIAL_FIN, PART_FINS)
    if fine:
        for index in range(3):
            add_box(part, (-length * 0.1 + length * 0.28 * index, radius * 0.9, 0.0),
                    (length * 0.06, radius * 0.22, radius * 0.5), MATERIAL_SEEKER, PART_SEEKER)


def _shelter(part: Part, length: float, radius: float, params: dict, features, fine: bool,
             detail: int = 0) -> None:
    width = radius * 2.0
    add_box(part, (0.0, 0.0, 0.0), (length, width, width * 0.92), MATERIAL_SHELL, PART_BODY)
    hatch_count = int(params.get('hatch_rings', 0) or 0) or (2 if 'hatch_rings' in features else 0)
    ring_segments = {0: 28, 1: 16, 2: 10, 3: 6}.get(detail, 28)
    if hatch_count:
        for index in range(hatch_count):
            x = -length * 0.22 + (length * 0.44 / max(hatch_count - 1, 1)) * index
            ring_profile = [
                (x + width * 0.16, width * 0.36),
                (x + width * 0.16, width * 0.30),
                (x - width * 0.16, width * 0.30),
                (x - width * 0.16, width * 0.36),
            ]
            lathe(part, ring_profile, ring_segments, MATERIAL_METAL, PART_DETAIL,
                  cap_nose=False, cap_tail=False)
            lathe(part, list(reversed(ring_profile)), ring_segments, MATERIAL_METAL, PART_DETAIL,
                  cap_nose=False, cap_tail=False)
    if params.get('rails') or 'skids' in features or 'runner_rails' in features:
        for side in (1, -1):
            add_box(part, (0.0, side * width * 0.52, -width * 0.52),
                    (length * 0.86, width * 0.22, width * 0.16), MATERIAL_METAL, PART_DETAIL)
    if 'adapter_collar' in features:
        add_box(part, (length * 0.5, 0.0, 0.0), (length * 0.06, width * 0.7, width * 0.7),
                MATERIAL_METAL, PART_TAIL)
    if detail == 0:
        # LOD0 额外结构：端框与外壳加强条，保证高模与低模有可辨识差异。
        for side in (1, -1):
            add_box(part, (side * length * 0.46, 0.0, 0.0), (length * 0.05, width * 0.96, width * 0.88),
                    MATERIAL_METAL, PART_DETAIL)
        for index in range(3):
            x = length * (-0.28 + 0.28 * index)
            add_box(part, (x, 0.0, width * 0.46), (width * 0.12, width * 1.0, width * 0.08),
                    MATERIAL_METAL, PART_DETAIL)
    elif detail <= 1:
        for side in (1, -1):
            add_box(part, (side * length * 0.46, 0.0, 0.0), (length * 0.05, width * 0.96, width * 0.88),
                    MATERIAL_METAL, PART_DETAIL)


def _sdv(part: Part, length: float, radius: float, params: dict, features, segments: int, fine: bool) -> None:
    profile = [
        (length * 0.5, radius * 0.10),
        (length * 0.34, radius * 0.72),
        (length * 0.10, radius * 0.95),
        (-length * 0.20, radius),
        (-length * 0.4, radius * 0.7),
        (-length * 0.5, radius * 0.34),
    ]
    lathe(part, profile, segments, MATERIAL_BODY, PART_BODY)
    if params.get('canopy', 1) or 'canopy' in features:
        add_box(part, (length * 0.06, 0.0, radius * 0.92), (length * 0.24, radius * 0.7, radius * 0.5),
                MATERIAL_SHELL, PART_SHELL)
    if params.get('fin_count'):
        add_fin_set(part, -length * 0.36, radius * 0.86, int(params['fin_count']),
                    float(params.get('fin_span_ratio', 1.3)), float(params.get('fin_chord_ratio', 0.8)),
                    0.35, 0.12, MATERIAL_FIN, PART_FINS)
    if params.get('docking_collar') or 'docking_collar' in features:
        add_ring(part, length * 0.42, radius * 1.08, radius * 0.3, segments, MATERIAL_METAL,
                 PART_DETAIL, thickness=radius * 0.14)
    if params.get('propulsor') == 'shrouded' or 'shrouded_propulsor' in features:
        add_pumpjet(part, -length * 0.46, radius * 0.5, radius * 0.7, 6, MATERIAL_METAL,
                    PART_PROPULSOR)
    elif fine:
        add_propeller(part, -length * 0.46, radius * 0.22, radius * 0.6, 6, MATERIAL_METAL,
                      PART_PROPULSOR)


def _rocket_details(part: Part, length: float, radius: float, params: dict, features,
                    segments: int, fine: bool, medium: bool) -> None:
    nose_x = length * 0.5
    tail_x = -length * 0.5
    fin_count = int(params.get('fin_count', 0) or 0)
    if fin_count:
        add_fin_set(part, tail_x + radius * 1.4, radius, fin_count,
                    float(params.get('fin_span_ratio', 1.3)), float(params.get('fin_chord_ratio', 0.9)),
                    0.45, 0.15, MATERIAL_FIN, PART_FINS)
    if 'payload_section' in features or params.get('payload_shape'):
        section = [
            (nose_x - length * 0.26, radius * 0.98),
            (nose_x - length * 0.30, radius * 1.16),
            (nose_x - length * 0.40, radius * 1.16),
            (nose_x - length * 0.44, radius * 0.98),
        ]
        lathe(part, section, segments, MATERIAL_METAL, PART_NOSE)
    if 'rocket_motor' in features or params.get('booster_len_ratio'):
        motor = [
            (tail_x + length * 0.34, radius * 1.02),
            (tail_x + length * 0.12, radius * 1.12),
            (tail_x + length * 0.06, radius * 1.1),
            (tail_x + length * 0.02, radius * 0.92),
        ]
        lathe(part, motor, segments, MATERIAL_SHELL, PART_TAIL)
    nozzle = [
        (tail_x + radius * 0.8, radius * 0.6),
        (tail_x, radius * 0.46),
        (tail_x + radius * 0.05, radius * 0.62),
    ]
    lathe(part, nozzle, segments, MATERIAL_METAL, PART_PROPULSOR)
    if medium and params.get('bands', 0):
        for index in range(int(params['bands'])):
            add_ring(part, nose_x - length * (0.24 + 0.12 * index), radius * 1.03,
                     radius * 0.3, segments, MATERIAL_MARKING, PART_MARKING)


# ---------------------------------------------------------------------------
# 碰撞体：低模凸包分段
# ---------------------------------------------------------------------------
def build_collision(spec: dict) -> list[dict]:
    """返回若干个盒子凸包：中轴分段 + 尾翼包络。"""
    geometry = spec['geometry']
    length = float(spec['dimensions']['length_m'])
    diameter = float(spec.get('body_diameter_m') or spec['dimensions'].get('diameter_m') or 0.533)
    radius = diameter * 0.5
    params, _ = normalize_params(
        geometry.get('params'), geometry.get('features'), geometry['kind'], radius,
        spec.get('family_id') or spec.get('base_geometry'),
    )

    if geometry['kind'] in ('shelter',):
        width = radius * 2.0
        return [{
            'name': 'SEG_00',
            'centre': (0.0, 0.0, 0.0),
            'size': (length, width, width * 0.92),
        }]
    if geometry['kind'] in ('mine', 'decoy'):
        return [
            {'name': 'SEG_00', 'centre': (-length * 0.22, 0.0, 0.0), 'size': (length * 0.56, radius * 2.0, radius * 2.0)},
            {'name': 'SEG_01', 'centre': (length * 0.2, 0.0, 0.0), 'size': (length * 0.6, radius * 1.5, radius * 1.5)},
        ]

    segments = [
        {'name': 'SEG_00', 'centre': (length * 0.36, 0.0, 0.0), 'size': (length * 0.28, radius * 0.7, radius * 0.7)},
        {'name': 'SEG_01', 'centre': (length * 0.10, 0.0, 0.0), 'size': (length * 0.24, radius * 2.0, radius * 2.0)},
        {'name': 'SEG_02', 'centre': (-length * 0.20, 0.0, 0.0), 'size': (length * 0.36, radius * 2.0, radius * 2.0)},
    ]
    fin_span_m = radius * float(params.get('fin_span_ratio', 1.6)) if params.get('fin_count', 1) else radius
    wing_span_m = float(params.get('wing_span_m') or 0.0) if params.get('wing_count') else 0.0
    span = max(fin_span_m, wing_span_m, radius)
    segments.append({
        'name': 'SEG_03',
        'centre': (-length * 0.42, 0.0, 0.0),
        'size': (length * 0.16, span * 2.0, span * 2.0),
    })
    return segments
