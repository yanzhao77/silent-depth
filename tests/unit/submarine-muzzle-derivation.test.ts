import { describe, expect, it } from 'vitest';
import {
  buildDirectionCandidates,
  correctedOutwardNormal,
  normalizeVector,
  scoreCandidate,
  selectBestCandidate,
  sideSignFromGeometryCenter,
  sideSignFromObjectName,
  updateTorpedoMuzzleTransform,
  validateCandidateInputs,
  type CandidateScore,
  type MuzzleDerivationCandidateInput,
} from '../../src/assets/submarineMuzzleDerivation';
import type { SubmarineAssembly } from '../../src/assets/submarineAssembly';

function candidate(
  name: string,
  normal: readonly [number, number, number],
): MuzzleDerivationCandidateInput {
  return {
    areaWeightedNormal: normal,
    boundsWorld: { max: [39, 6.4, 1.9], min: [32, 6.1, 1.3] },
    determinant: 1,
    geometryCenter: [35.5, 6.25, 1.6],
    mirrored: false,
    objectName: name,
    totalArea: 1,
    triangleCount: 2,
    vertexCount: 4,
  };
}

describe('submarine muzzle derivation rules', () => {
  it('从 BowDoor 对象名稳定推导舷侧', () => {
    expect(sideSignFromObjectName('SUB_Yasen_BowDoor_-1_2')).toBe(-1);
    expect(sideSignFromObjectName('SUB_Yasen_BowDoor_1_2')).toBe(1);
    expect(() => sideSignFromObjectName('SUB_Yasen_Hull')).toThrow('无法从对象名推导舷侧');
  });

  it('正式舷外方向使用几何中心，不使用对象名符号', () => {
    expect(sideSignFromGeometryCenter([35, 6.2, 1.6], 'SUB_Yasen_BowDoor_-1_2')).toBe(1);
    expect(sideSignFromGeometryCenter([35, -6.2, 1.6], 'SUB_Yasen_BowDoor_1_2')).toBe(-1);
  });

  it('将指向艇内的门面法线确定性翻转到舷外', () => {
    const result = correctedOutwardNormal(candidate('SUB_Yasen_BowDoor_1_0', [0.1, -1, 0]));

    expect(result.flipped).toBe(true);
    expect(result.correctedNormal[1]).toBeGreaterThan(0);
    expect(result.reason).toContain('翻转');
  });

  it('生成的发射方向归一化，并保留前向和舷外分量', () => {
    const directions = buildDirectionCandidates({
      correctedNormal: normalizeVector([0.2, 1, 0]),
      doorCenter: [35, 6.2, 1.6],
      objectName: 'SUB_Yasen_BowDoor_1_1',
      sideSign: 1,
      xRank: 1,
    });

    expect(directions.length).toBeGreaterThan(0);
    for (const direction of directions) {
      expect(Math.abs(Math.hypot(...direction.direction) - 1)).toBeLessThanOrEqual(0.000_000_001);
      expect(direction.forwardComponent).toBeGreaterThan(0);
      expect(direction.outwardComponent).toBeGreaterThan(0);
    }
  });

  it('候选评分拒绝射线或 sweep 命中的方向', () => {
    const direction = buildDirectionCandidates({
      correctedNormal: [0, 1, 0],
      doorCenter: [35, 6.2, 1.6],
      objectName: 'SUB_Yasen_BowDoor_1_1',
      sideSign: 1,
      xRank: 1,
    })[0]!;

    const score = scoreCandidate({
      correctedNormal: [0, 1, 0],
      direction,
      doorCenter: [35, 6.2, 1.6],
      minimumClearanceMeters: 1,
      objectName: 'SUB_Yasen_BowDoor_1_1',
      rayHit: true,
      sideSign: 1,
      sweepHit: false,
      xRank: 1,
    });

    expect(score.status).toBe('REJECTED');
    expect(score.reasons).toContain('短距射线命中艇体或邻近结构');
  });

  it('候选 tie-break 使用稳定对象名', () => {
    const direction = buildDirectionCandidates({
      correctedNormal: [0, 1, 0],
      doorCenter: [35, 6.2, 1.6],
      objectName: 'SUB_Yasen_BowDoor_1_1',
      sideSign: 1,
      xRank: 1,
    })[0]!;
    const scores: readonly CandidateScore[] = [
      {
        direction,
        objectName: 'SUB_Yasen_BowDoor_1_2',
        reasons: [],
        score: 10,
        status: 'ACCEPTED',
      },
      {
        direction,
        objectName: 'SUB_Yasen_BowDoor_-1_2',
        reasons: [],
        score: 10,
        status: 'ACCEPTED',
      },
    ];

    expect(selectBestCandidate(scores).objectName).toBe('SUB_Yasen_BowDoor_-1_2');
  });

  it('空候选和退化 mesh 会失败，不生成假结果', () => {
    expect(() => validateCandidateInputs([])).toThrow('候选对象列表为空');
    expect(() =>
      validateCandidateInputs([candidate('SUB_Yasen_BowDoor_1_0', [0, 0, 0])]),
    ).toThrow();
    expect(() => selectBestCandidate([])).toThrow('没有找到满足清障规则');
  });

  it('只更新稳定 torpedo_tube_01_muzzle socket，不改其他字段', () => {
    const assembly: SubmarineAssembly = {
      assetId: 'RU_SSN_Yasen',
      coordinateSystem: { forward: '+X', right: '+Y', up: '+Z' },
      hull: {
        collision: { owner: 'hull', strategy: 'simple_convex' },
        lods: {
          LOD0: 'FBX/RU_SSN_Yasen_LOD0.fbx',
          LOD1: 'FBX/RU_SSN_Yasen_LOD1.fbx',
          LOD2: 'FBX/RU_SSN_Yasen_LOD2.fbx',
          LOD3: 'FBX/RU_SSN_Yasen_LOD3.fbx',
        },
        sourceObjects: ['SUB_Yasen_Hull'],
      },
      parts: [],
      schemaVersion: 1,
      sockets: [
        {
          id: 'torpedo_tube_01_muzzle',
          parent: 'root',
          purpose: 'torpedo_muzzle',
          sourceAnchor: 'SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE',
          transform: {
            rotationDegrees: [0, 0, 0],
            scale: [1, 1, 1],
            translation: [55.799972534, 0, 7.26317358],
          },
        },
      ],
      units: 'meters',
      validation: { requiredParts: [], requiredSockets: ['torpedo_tube_01_muzzle'] },
    };

    const updated = updateTorpedoMuzzleTransform(assembly, {
      direction: [0.8, 0.6, 0],
      rotationDegrees: [0, 0, 0],
      scale: [1, 1, 1],
      sourceObject: 'SUB_Yasen_BowDoor_1_2',
      translation: [40, 6.8, 1.6],
    });

    expect(updated.sockets[0]?.transform.translation).toEqual([40, 6.8, 1.6]);
    expect(updated.sockets[0]?.transform.translation).not.toEqual([55.799972534, 0, 7.26317358]);
  });
});
