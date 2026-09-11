import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditAssemblyOwnership,
  type AuditIssue,
  type AuditSceneSnapshot,
} from '../../src/assets/submarineBlenderAudit';
import {
  assertSubmarineAssembly,
  validateSubmarineAssemblyContract,
  validateSubmarineAssemblySchema,
  type SubmarineAssembly,
} from '../../src/assets/submarineAssembly';

const ROOT = resolve(__dirname, '../..');
const YASEN_DIR = resolve(ROOT, 'SilentDepth_Assets/Submarines/SSN/Russia/Yasen');
const ASSEMBLY_PATH = resolve(YASEN_DIR, 'Documentation/RU_SSN_Yasen_ASSEMBLY.json');
const MASTER_AUDIT_PATH = resolve(YASEN_DIR, 'Validation/RU_SSN_Yasen_MASTER_AUDIT.json');
const MUZZLE_DERIVATION_PATH = resolve(YASEN_DIR, 'Validation/RU_SSN_Yasen_TORPEDO_MUZZLE_DERIVATION.json');
const NOTES_PATH = resolve(YASEN_DIR, 'Documentation/RU_SSN_Yasen_ASSEMBLY_NOTES.md');

interface InventoryObject {
  readonly name: string;
  readonly type: string;
  readonly collections?: readonly string[];
}

interface InventoryCollection {
  readonly name: string;
  readonly path: string;
  readonly objects: readonly string[];
}

interface InventoryReport {
  readonly scene: {
    readonly objects: readonly InventoryObject[];
    readonly collections: readonly InventoryCollection[];
  };
}

function readAssembly(): SubmarineAssembly {
  const parsed = JSON.parse(readFileSync(ASSEMBLY_PATH, 'utf-8')) as unknown;
  assertSubmarineAssembly(parsed);
  return parsed;
}

function readInventoryReport(): InventoryReport {
  return JSON.parse(readFileSync(MASTER_AUDIT_PATH, 'utf-8')) as InventoryReport;
}

interface MuzzleDerivationReport {
  readonly semanticStatus: string;
  readonly notRealWorldMeasurement: boolean;
  readonly selected: {
    readonly objectName: string;
    readonly muzzleOrigin: readonly [number, number, number];
    readonly direction: {
      readonly direction: readonly [number, number, number];
      readonly forwardComponent: number;
      readonly outwardComponent: number;
    };
    readonly raycast: { readonly hit: boolean };
    readonly sweep: {
      readonly hit: boolean;
      readonly minimum: { readonly distance: number };
    };
    readonly status: string;
  };
  readonly legacySocketRejection: {
    readonly oldTranslation: readonly [number, number, number];
    readonly reasons: readonly string[];
  };
}

function readMuzzleDerivationReport(): MuzzleDerivationReport {
  return JSON.parse(readFileSync(MUZZLE_DERIVATION_PATH, 'utf-8')) as MuzzleDerivationReport;
}

function sceneFromInventory(): AuditSceneSnapshot {
  const report = readInventoryReport();
  return {
    collections: report.scene.collections.map((collection) => ({
      name: collection.name,
      path: collection.path,
      objects: collection.objects,
    })),
    objects: report.scene.objects.map((object) => ({
      collections: object.collections,
      name: object.name,
      type: object.type,
    })),
  };
}

function partSourceObjects(assembly: SubmarineAssembly): readonly string[] {
  return assembly.parts.flatMap((part) => [...(part.sourceObjects ?? [])]);
}

function allAssemblySourceObjects(assembly: SubmarineAssembly): readonly string[] {
  return [
    ...assembly.hull.sourceObjects,
    ...partSourceObjects(assembly),
    ...(assembly.hull.collision.sourceObjects ?? []),
  ];
}

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right, 'en'));
}

function issueRules(issues: readonly AuditIssue[]): readonly string[] {
  return [...new Set(issues.map((issue) => issue.ruleId))].sort((left, right) => left.localeCompare(right, 'en'));
}

const EXPECTED_UCX = [
  'UCX_RU_SSN_Yasen_LOD0_00',
  'UCX_RU_SSN_Yasen_LOD0_01',
  'UCX_RU_SSN_Yasen_LOD0_02',
  'UCX_RU_SSN_Yasen_LOD0_03',
  'UCX_RU_SSN_Yasen_LOD0_04',
  'UCX_RU_SSN_Yasen_LOD0_05',
  'UCX_RU_SSN_Yasen_LOD0_06',
  'UCX_RU_SSN_Yasen_LOD0_07',
  'UCX_RU_SSN_Yasen_LOD0_08',
] as const;

const EXPECTED_ANCHOR_ERRORS = [
  'SUBMOD-023-PIVOT_MISSING',
  'SUBMOD-023-SOCKET_MISSING',
] as const;

describe('Yasen SUBMOD-030 Assembly 配置', () => {
  it('JSON 可解析并通过 Draft 2020-12 Schema 与 TypeScript 契约', () => {
    const parsed = JSON.parse(readFileSync(ASSEMBLY_PATH, 'utf-8')) as unknown;

    expect(validateSubmarineAssemblySchema(parsed)).toEqual([]);
    expect(validateSubmarineAssemblyContract(parsed)).toEqual([]);
    expect(() => assertSubmarineAssembly(parsed)).not.toThrow();
  });

  it('assetId、LOD 和 Collision 路径绑定 Yasen 正式资产', () => {
    const assembly = readAssembly();

    expect(assembly.assetId).toBe('RU_SSN_Yasen');
    expect(assembly.hull.lods).toEqual({
      LOD0: 'FBX/RU_SSN_Yasen_LOD0.fbx',
      LOD1: 'FBX/RU_SSN_Yasen_LOD1.fbx',
      LOD2: 'FBX/RU_SSN_Yasen_LOD2.fbx',
      LOD3: 'FBX/RU_SSN_Yasen_LOD3.fbx',
    });
    expect(assembly.hull.collision).toEqual({
      owner: 'hull',
      strategy: 'separate_fbx',
      path: 'Collision/RU_SSN_Yasen_COLLISION.fbx',
      sourceObjects: EXPECTED_UCX,
    });
  });

  it('Part exportName 唯一且使用 assetId 前缀', () => {
    const assembly = readAssembly();
    const exportNames = assembly.parts.map((part) => part.exportName);

    expect(duplicateValues(exportNames)).toEqual([]);
    expect(exportNames.every((name) => name.startsWith('RU_SSN_Yasen_'))).toBe(true);
  });

  it('所有源对象都使用精确名称，不含通配符或宽 Collection 匹配', () => {
    const assembly = readAssembly();
    const sourceObjects = allAssemblySourceObjects(assembly);

    expect(sourceObjects.every((name) => !/[*?[\]]/.test(name))).toBe(true);
    expect(assembly.hull.sourceCollections).toBeUndefined();
    expect(assembly.parts.every((part) => part.sourceCollections === undefined)).toBe(true);
  });

  it('Hull、Part、Collision 没有重复拥有', () => {
    const assembly = readAssembly();

    expect(duplicateValues(allAssemblySourceObjects(assembly))).toEqual([]);
  });

  it('requiredParts 和 requiredSockets 只引用已声明 ID', () => {
    const assembly = readAssembly();
    const partIds = new Set(assembly.parts.map((part) => part.id));
    const socketIds = new Set(assembly.sockets.map((socket) => socket.id));

    expect(assembly.validation.requiredParts.every((id) => partIds.has(id))).toBe(true);
    expect(assembly.validation.requiredSockets.every((id) => socketIds.has(id))).toBe(true);
  });

  it('运动轴均为非零归一化轴，活动件碰撞策略保持只表现', () => {
    const assembly = readAssembly();

    for (const part of assembly.parts) {
      const length = Math.hypot(part.motion.axis[0], part.motion.axis[1], part.motion.axis[2]);
      expect(length).toBeGreaterThan(0);
      expect(Math.abs(length - 1)).toBeLessThanOrEqual(0.001);
      expect(part.collision).toEqual({ owner: 'none', strategy: 'none' });
    }
  });

  it('torpedo_tube_01_muzzle 使用 BowDoor 几何推导结果，不再使用旧中线 Socket 坐标', () => {
    const assembly = readAssembly();
    const socket = assembly.sockets.find((item) => item.id === 'torpedo_tube_01_muzzle');

    expect(socket).toBeDefined();
    expect(socket?.sourceAnchor).toBe('SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE');
    expect(socket?.transform.translation).toEqual([38.599311829, -6.763348579, 1.751911044]);
    expect(socket?.transform.translation).not.toEqual([55.799972534, 0, 7.26317358]);
    expect(Math.abs(socket?.transform.translation[1] ?? 0)).toBeGreaterThan(6);
    expect(socket?.transform.translation[2]).toBeLessThan(2.5);
  });

  it('torpedo muzzle 推导报告记录 gameplay 几何来源、方向和 BVH 清障', () => {
    const report = readMuzzleDerivationReport();
    const direction = report.selected.direction.direction;

    expect(report.semanticStatus).toBe('GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY');
    expect(report.notRealWorldMeasurement).toBe(true);
    expect(report.selected.status).toBe('ACCEPTED');
    expect(report.selected.objectName).toBe('SUB_Yasen_BowDoor_1_2');
    expect(report.selected.muzzleOrigin).toEqual([38.599311829, -6.763348579, 1.751911044]);
    expect(Math.abs(Math.hypot(...direction) - 1)).toBeLessThanOrEqual(0.000_000_01);
    expect(report.selected.direction.forwardComponent).toBeGreaterThan(0.5);
    expect(report.selected.direction.outwardComponent).toBeGreaterThan(0.2);
    expect(report.selected.raycast.hit).toBe(false);
    expect(report.selected.sweep.hit).toBe(false);
    expect(report.selected.sweep.minimum.distance).toBeGreaterThan(0.35);
    expect(report.legacySocketRejection.oldTranslation).toEqual([55.799972534, 0, 7.26317358]);
  });

  it('Assembly Notes 明确限制 gameplay 映射语义，避免真实舰艇身份误表述', () => {
    const notes = readFileSync(NOTES_PATH, 'utf-8');

    expect(notes).toContain('GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY');
    expect(notes).toContain('Mast_2');
    expect(notes).toContain('gameplay periscope 映射');
    expect(notes).toContain('不是实艇武器技术参数');
    expect(notes).toContain('不得将该旧 transform 复制为新的 Anchor transform');
    expect(notes).not.toContain('真实 Yasen 潜望镜已确认');
    expect(notes).not.toContain('真实设备型号已确认');
  });

  it('没有相机、灯光、STUDIO、派生 LOD、鱼雷或导弹本体进入 Assembly', () => {
    const assembly = readAssembly();
    const sourceObjects = allAssemblySourceObjects(assembly);

    expect(sourceObjects.some((name) => name.startsWith('CAM_'))).toBe(false);
    expect(sourceObjects.some((name) => ['Key', 'Fill', 'Rim'].includes(name))).toBe(false);
    expect(sourceObjects.some((name) => /^RU_SSN_Yasen_LOD[0-3]$/.test(name))).toBe(false);
    expect(sourceObjects.some((name) => /Torpedo|Missile|Weapon|VLS_.*Body/i.test(name))).toBe(false);
  });

  it('所有可视源对象都存在于 P2 MASTER 库存中', () => {
    const assembly = readAssembly();
    const inventoryNames = new Set(readInventoryReport().scene.objects.map((object) => object.name));

    expect([...assembly.hull.sourceObjects, ...partSourceObjects(assembly)].every((name) => inventoryNames.has(name))).toBe(true);
  });

  it('固定与活动对象分类结果稳定', () => {
    const assembly = readAssembly();

    expect(assembly.hull.sourceObjects).toHaveLength(54);
    expect(assembly.parts.map((part) => [part.id, part.sourceObjects ?? []])).toEqual([
      [
        'propulsor_01',
        [
          'SUB_Yasen_PropellerBlade_00',
          'SUB_Yasen_PropellerBlade_01',
          'SUB_Yasen_PropellerBlade_02',
          'SUB_Yasen_PropellerBlade_03',
          'SUB_Yasen_PropellerBlade_04',
          'SUB_Yasen_PropellerBlade_05',
          'SUB_Yasen_PropellerBlade_06',
          'SUB_Yasen_PropellerHub',
        ],
      ],
      ['rudder_01', ['SUB_Yasen_Tail_01', 'SUB_Yasen_Tail_03']],
      ['stern_planes_01', ['SUB_Yasen_Tail_00', 'SUB_Yasen_Tail_02']],
      ['bow_planes_01', ['SUB_Yasen_ForwardPlane_00', 'SUB_Yasen_ForwardPlane_01']],
      ['periscope_01', ['SUB_Yasen_Mast_2', 'SUB_Yasen_MastHead_2']],
    ]);
  });

  it('完整匹配审计除预期缺失 Anchor 外没有对象匹配或 Hull 排他错误', () => {
    const result = auditAssemblyOwnership(sceneFromInventory(), readAssembly());
    const rules = issueRules(result.issues);

    expect(rules).toEqual(EXPECTED_ANCHOR_ERRORS);
    expect(result.issues).toHaveLength(6);
    expect(result.matches.every((match) => match.status === 'PASS')).toBe(true);
    expect(result.issues.some((issue) => issue.ruleId === 'SUBMOD-021-EMPTY_OBJECT_MATCH')).toBe(false);
    expect(result.issues.some((issue) => issue.ruleId === 'SUBMOD-021-WILDCARD_OBJECT_MATCH')).toBe(false);
    expect(result.issues.some((issue) => issue.ruleId === 'SUBMOD-021-DUPLICATE_OWNERSHIP')).toBe(false);
  });
});
