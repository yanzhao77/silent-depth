import { validateSubmarineAssembly, type SubmarineAssembly } from './submarineAssembly.ts';

export const MUZZLE_DERIVATION_REPORT_VERSION = 1;

export const MUZZLE_DERIVATION_CONSTANTS = {
  bowDoorObjectNames: [
    'SUB_Yasen_BowDoor_-1_0',
    'SUB_Yasen_BowDoor_-1_1',
    'SUB_Yasen_BowDoor_-1_2',
    'SUB_Yasen_BowDoor_1_0',
    'SUB_Yasen_BowDoor_1_1',
    'SUB_Yasen_BowDoor_1_2',
  ],
  envelopeRadiusMeters: 0.35,
  envelopeLengthMeters: 7.0,
  clearanceMarginMeters: 0.18,
  minimumForwardComponent: 0.52,
  minimumOutwardComponent: 0.24,
  rayDistanceMeters: 8.0,
  sweepDistanceMeters: 3.2,
  sweepSampleCount: 7,
  scoreWeights: {
    clearance: 1.5,
    forward: 1.0,
    outward: 0.85,
    xPosition: 0.35,
  },
} as const;

export type Vector3 = readonly [number, number, number];

export interface Bounds3 {
  readonly min: Vector3;
  readonly max: Vector3;
}

export interface MuzzleDerivationCandidateInput {
  readonly objectName: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly totalArea: number;
  readonly boundsWorld: Bounds3;
  readonly geometryCenter: Vector3;
  readonly areaWeightedNormal: Vector3;
  readonly determinant: number;
  readonly mirrored: boolean;
}

export interface DirectionSearchInput {
  readonly objectName: string;
  readonly correctedNormal: Vector3;
  readonly sideSign: -1 | 1;
  readonly doorCenter: Vector3;
  readonly xRank: number;
}

export interface DirectionCandidate {
  readonly direction: Vector3;
  readonly forwardComponent: number;
  readonly outwardComponent: number;
  readonly weights: readonly [number, number];
}

export interface CandidateScoreInput extends DirectionSearchInput {
  readonly minimumClearanceMeters: number;
  readonly rayHit: boolean;
  readonly sweepHit: boolean;
  readonly direction: DirectionCandidate;
}

export interface CandidateScore {
  readonly objectName: string;
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly score: number;
  readonly reasons: readonly string[];
  readonly direction: DirectionCandidate;
}

export interface DerivedMuzzleTransform {
  readonly translation: Vector3;
  readonly rotationDegrees: Vector3;
  readonly scale: Vector3;
  readonly direction: Vector3;
  readonly sourceObject: string;
}

export class MuzzleDerivationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MuzzleDerivationError';
  }
}

export function assertAssemblyForMuzzleDerivation(assembly: unknown): SubmarineAssembly {
  const issues = validateSubmarineAssembly(assembly);
  if (issues.length > 0) {
    const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new MuzzleDerivationError(`Assembly 契约无效：\n${details}`);
  }
  return assembly as SubmarineAssembly;
}

export function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-9) throw new MuzzleDerivationError('不能归一化零长度向量');
  return [round9(vector[0] / length), round9(vector[1] / length), round9(vector[2] / length)];
}

export function vectorDot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function vectorAdd(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function vectorScale(vector: Vector3, scale: number): Vector3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

export function round9(value: number): number {
  if (!Number.isFinite(value)) throw new MuzzleDerivationError('几何计算产生非有限数字');
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function sideSignFromObjectName(objectName: string): -1 | 1 {
  if (objectName.includes('BowDoor_-1_')) return -1;
  if (objectName.includes('BowDoor_1_')) return 1;
  throw new MuzzleDerivationError(`无法从对象名推导舷侧：${objectName}`);
}

export function sideSignFromGeometryCenter(center: Vector3, objectName: string): -1 | 1 {
  if (center[1] > 0) return 1;
  if (center[1] < 0) return -1;
  throw new MuzzleDerivationError(`候选对象位于艇体中心线，不能推导舷外方向：${objectName}`);
}

export function correctedOutwardNormal(input: MuzzleDerivationCandidateInput): {
  readonly correctedNormal: Vector3;
  readonly originalNormal: Vector3;
  readonly flipped: boolean;
  readonly reason: string;
  readonly sideSign: -1 | 1;
} {
  const sideSign = sideSignFromGeometryCenter(input.geometryCenter, input.objectName);
  const original = normalizeVector(input.areaWeightedNormal);
  const sideOutward: Vector3 = [0, sideSign, 0];
  const sideDot = vectorDot(original, sideOutward);
  if (sideDot >= 0) {
    return {
      correctedNormal: original,
      flipped: false,
      originalNormal: original,
      reason: '面积加权法线已具有正确舷外分量',
      sideSign,
    };
  }
  return {
    correctedNormal: normalizeVector([-original[0], -original[1], -original[2]]),
    flipped: true,
    originalNormal: original,
    reason: '面积加权法线指向艇体中心线，按门面所在舷侧翻转',
    sideSign,
  };
}

export function buildDirectionCandidates(input: DirectionSearchInput): readonly DirectionCandidate[] {
  const forward: Vector3 = [1, 0, 0];
  const side: Vector3 = [0, input.sideSign, 0];
  const normal = input.correctedNormal;
  const mixes: readonly (readonly [number, number, Vector3])[] = [
    [0.76, 0.24, side],
    [0.66, 0.34, side],
    [0.56, 0.44, side],
    [0.72, 0.28, normal],
    [0.62, 0.38, normal],
    [0.52, 0.48, normal],
  ];
  const candidates = mixes.map(([forwardWeight, outwardWeight, outward]) => {
    const direction = normalizeVector(vectorAdd(vectorScale(forward, forwardWeight), vectorScale(outward, outwardWeight)));
    return {
      direction,
      forwardComponent: round9(vectorDot(direction, forward)),
      outwardComponent: round9(vectorDot(direction, side)),
      weights: [forwardWeight, outwardWeight] as const,
    };
  });
  return stableUniqueDirections(candidates);
}

export function scoreCandidate(input: CandidateScoreInput): CandidateScore {
  const reasons: string[] = [];
  if (input.direction.forwardComponent < MUZZLE_DERIVATION_CONSTANTS.minimumForwardComponent) {
    reasons.push('发射方向 +X 分量不足');
  }
  if (input.direction.outwardComponent < MUZZLE_DERIVATION_CONSTANTS.minimumOutwardComponent) {
    reasons.push('发射方向舷外分量不足');
  }
  if (input.rayHit) reasons.push('短距射线命中艇体或邻近结构');
  if (input.sweepHit) reasons.push('保守 sweep 命中艇体或邻近结构');
  if (input.minimumClearanceMeters < MUZZLE_DERIVATION_CONSTANTS.envelopeRadiusMeters) {
    reasons.push('最小清障距离小于 gameplay envelope 半径');
  }

  const score = round9(
    input.minimumClearanceMeters * MUZZLE_DERIVATION_CONSTANTS.scoreWeights.clearance +
      input.direction.forwardComponent * MUZZLE_DERIVATION_CONSTANTS.scoreWeights.forward +
      input.direction.outwardComponent * MUZZLE_DERIVATION_CONSTANTS.scoreWeights.outward +
      input.xRank * MUZZLE_DERIVATION_CONSTANTS.scoreWeights.xPosition,
  );
  return {
    direction: input.direction,
    objectName: input.objectName,
    reasons,
    score,
    status: reasons.length === 0 ? 'ACCEPTED' : 'REJECTED',
  };
}

export function selectBestCandidate(scores: readonly CandidateScore[]): CandidateScore {
  const accepted = scores.filter((candidate) => candidate.status === 'ACCEPTED');
  if (accepted.length === 0) throw new MuzzleDerivationError('没有找到满足清障规则的 BowDoor 发射候选');
  return [...accepted].sort(compareScores)[0]!;
}

export function compareScores(left: CandidateScore, right: CandidateScore): number {
  if (right.score !== left.score) return right.score - left.score;
  if (right.direction.forwardComponent !== left.direction.forwardComponent) {
    return right.direction.forwardComponent - left.direction.forwardComponent;
  }
  if (right.direction.outwardComponent !== left.direction.outwardComponent) {
    return right.direction.outwardComponent - left.direction.outwardComponent;
  }
  return left.objectName.localeCompare(right.objectName, 'en');
}

export function validateCandidateInputs(candidates: readonly MuzzleDerivationCandidateInput[]): void {
  if (candidates.length === 0) throw new MuzzleDerivationError('候选对象列表为空');
  for (const candidate of candidates) {
    if (candidate.vertexCount <= 0) throw new MuzzleDerivationError(`${candidate.objectName} 没有顶点`);
    if (candidate.triangleCount <= 0) throw new MuzzleDerivationError(`${candidate.objectName} 没有三角面`);
    if (candidate.totalArea <= 1e-9) throw new MuzzleDerivationError(`${candidate.objectName} 面积退化`);
    normalizeVector(candidate.areaWeightedNormal);
  }
}

export function updateTorpedoMuzzleTransform(
  assembly: SubmarineAssembly,
  transform: DerivedMuzzleTransform,
): SubmarineAssembly {
  return {
    ...assembly,
    sockets: assembly.sockets.map((socket) => {
      if (socket.id !== 'torpedo_tube_01_muzzle') return socket;
      return {
        ...socket,
        transform: {
          rotationDegrees: transform.rotationDegrees,
          scale: transform.scale,
          translation: transform.translation,
        },
      };
    }),
  };
}

function stableUniqueDirections(candidates: readonly DirectionCandidate[]): readonly DirectionCandidate[] {
  const result: DirectionCandidate[] = [];
  const keys = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.direction.join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(candidate);
  }
  return result;
}
