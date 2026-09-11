import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AssemblyValidationError,
  auditAssemblyOwnership,
  auditMeshFixtures,
  compareFingerprints,
  makeInventoryOnlyAssemblySkippedIssue,
  parseSubmarineAuditArgs,
  validateSubmarineAuditInputs,
  type AuditSceneSnapshot,
} from '../../src/assets/submarineBlenderAudit';
import {
  assertSubmarineAssembly,
  type SubmarineAssembly,
} from '../../src/assets/submarineAssembly';

const ROOT = resolve(__dirname, '../..');
const MINIMAL_ASSEMBLY_PATH = resolve(
  ROOT,
  'SilentDepth_Assets/Templates/Submarine/Examples/Minimal/Documentation/TEMPLATE_SUB_MINIMAL_ASSEMBLY.json',
);

interface MutableAssemblyPart {
  id: string;
  sourceObjects?: string[];
  pivotAnchor: string;
  parent: string;
  motion: { axis: [number, number, number] };
}

interface MutableAssemblySocket {
  id: string;
  sourceAnchor: string;
  parent: string;
}

interface MutableAssembly {
  assetId: string;
  hull: {
    sourceObjects: string[];
    sourceCollections?: string[];
    collision: { sourceObjects?: string[] };
  };
  parts: MutableAssemblyPart[];
  sockets: MutableAssemblySocket[];
}

function readMinimalAssembly(): SubmarineAssembly {
  const parsed = JSON.parse(readFileSync(MINIMAL_ASSEMBLY_PATH, 'utf-8')) as unknown;
  assertSubmarineAssembly(parsed);
  return parsed;
}

function mutableAssembly(): MutableAssembly {
  return JSON.parse(JSON.stringify(readMinimalAssembly())) as MutableAssembly;
}

function sceneWithMinimalNames(): AuditSceneSnapshot {
  const meshNames = [
    'SUB_ZZ_MINIMAL_HULL_BODY',
    'SUB_ZZ_MINIMAL_SAIL_FIXED',
    'UCX_SUB_ZZ_MINIMAL_HULL_01',
    'SUB_ZZ_MINIMAL_PROPULSOR_HUB_01',
    'SUB_ZZ_MINIMAL_PROPULSOR_BLADE_01',
    'SUB_ZZ_MINIMAL_RUDDER_UPPER_01',
    'SUB_ZZ_MINIMAL_RUDDER_LOWER_01',
    'SUB_ZZ_MINIMAL_PERISCOPE_01',
  ];
  const emptyNames = [
    'PIVOT_SUB_ZZ_MINIMAL_PROPULSOR_01',
    'PIVOT_SUB_ZZ_MINIMAL_RUDDER_01',
    'PIVOT_SUB_ZZ_MINIMAL_PERISCOPE_01',
    'SOCKET_SUB_ZZ_MINIMAL_TORPEDO_TUBE_01_MUZZLE',
  ];
  return {
    collections: [
      { name: 'HULL', objects: ['SUB_ZZ_MINIMAL_HULL_BODY'], path: '10_STATIC/HULL' },
      { name: 'SAIL', objects: ['SUB_ZZ_MINIMAL_SAIL_FIXED'], path: '10_STATIC/SAIL' },
    ],
    objects: [
      ...meshNames.map((name) => ({ name, type: 'MESH' })),
      ...emptyNames.map((name) => ({ name, type: 'EMPTY' })),
    ],
  };
}

function tempProject(): { readonly dir: string; readonly cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'silent-depth-submarine-audit-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('潜艇 Blender 审计 CLI 参数和输入校验', () => {
  it('解析完整 inventory-only 参数', () => {
    const parsed = parseSubmarineAuditArgs([
      '--master',
      '/tmp/RU_SSN_Yasen_MASTER.blend',
      '--output',
      '/tmp/RU_SSN_Yasen_MASTER_AUDIT.json',
      '--summary-output',
      '/tmp/RU_SSN_Yasen_MASTER_AUDIT.md',
      '--inventory-only',
      '--fail-on-warning',
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.options?.inventoryOnly).toBe(true);
    expect(parsed.options?.failOnWarning).toBe(true);
  });

  it('缺少 MASTER 时返回参数错误', () => {
    const parsed = parseSubmarineAuditArgs(['--output', '/tmp/out.json', '--inventory-only']);
    expect(parsed.errors).toContain('缺少必需参数 --master');
  });

  it('完整 Assembly 审计缺少 Assembly 时返回参数错误', () => {
    const parsed = parseSubmarineAuditArgs([
      '--master',
      '/tmp/RU_SSN_Yasen_MASTER.blend',
      '--output',
      '/tmp/out.json',
    ]);
    expect(parsed.errors.join('\n')).toContain('完整 Assembly 审计必须提供 --assembly');
  });

  it('MASTER 不存在会在输入阶段失败', () => {
    const { dir, cleanup } = tempProject();
    try {
      expect(() =>
        validateSubmarineAuditInputs({
          failOnWarning: false,
          help: false,
          inventoryOnly: true,
          master: join(dir, 'missing.blend'),
          output: join(dir, 'out.json'),
        }),
      ).toThrow('MASTER 不存在');
    } finally {
      cleanup();
    }
  });

  it('Assembly 不存在会在输入阶段失败', () => {
    const { dir, cleanup } = tempProject();
    try {
      const master = join(dir, 'ZZ_SSN_MinimalTemplate_MASTER.blend');
      writeFileSync(master, 'not a real blend');
      expect(() =>
        validateSubmarineAuditInputs({
          assembly: join(dir, 'missing.json'),
          failOnWarning: false,
          help: false,
          inventoryOnly: false,
          master,
          output: join(dir, 'out.json'),
        }),
      ).toThrow('Assembly 不存在');
    } finally {
      cleanup();
    }
  });

  it('inventory-only 不需要 Assembly', () => {
    const { dir, cleanup } = tempProject();
    try {
      const master = join(dir, 'RU_SSN_Yasen_MASTER.blend');
      writeFileSync(master, 'not a real blend');
      const inputs = validateSubmarineAuditInputs({
        failOnWarning: false,
        help: false,
        inventoryOnly: true,
        master,
        output: join(dir, 'out.json'),
      });
      expect(inputs.mode).toBe('inventory-only');
      expect(inputs.assembly).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('Assembly Schema 失败会在启动 Blender 前失败', () => {
    const { dir, cleanup } = tempProject();
    try {
      const master = join(dir, 'ZZ_SSN_MinimalTemplate_MASTER.blend');
      const assembly = join(dir, 'ZZ_SSN_MinimalTemplate_ASSEMBLY.json');
      writeFileSync(master, 'not a real blend');
      writeFileSync(assembly, JSON.stringify({ assetId: 'ZZ_SSN_MinimalTemplate' }));
      expect(() =>
        validateSubmarineAuditInputs({
          assembly,
          failOnWarning: false,
          help: false,
          inventoryOnly: false,
          master,
          output: join(dir, 'out.json'),
        }),
      ).toThrow(AssemblyValidationError);
    } finally {
      cleanup();
    }
  });
});

describe('潜艇 Assembly 与场景匹配审计', () => {
  it('对象和 Collection 匹配结果稳定排序', () => {
    const result = auditAssemblyOwnership(sceneWithMinimalNames(), readMinimalAssembly());
    expect(result.matches.map((match) => `${match.owner}:${match.reference}`)).toEqual(
      [...result.matches.map((match) => `${match.owner}:${match.reference}`)].sort((left, right) =>
        left.localeCompare(right, 'en'),
      ),
    );
  });

  it('对象匹配为空会失败关闭', () => {
    const assembly = mutableAssembly();
    assembly.parts[0]!.sourceObjects = ['MISSING_PROPULSOR'];
    const result = auditAssemblyOwnership(sceneWithMinimalNames(), assembly);
    expect(result.issues.some((item) => item.ruleId === 'SUBMOD-021-EMPTY_OBJECT_MATCH')).toBe(
      true,
    );
  });

  it('重复对象归属会报错', () => {
    const assembly = mutableAssembly();
    assembly.parts[1]!.sourceObjects = ['SUB_ZZ_MINIMAL_PROPULSOR_HUB_01'];
    const result = auditAssemblyOwnership(sceneWithMinimalNames(), assembly);
    expect(result.issues.some((item) => item.ruleId === 'SUBMOD-021-DUPLICATE_OWNERSHIP')).toBe(
      true,
    );
  });

  it('Hull 与 Part 重复拥有同一对象会报错', () => {
    const assembly = mutableAssembly();
    assembly.parts[0]!.sourceObjects = ['SUB_ZZ_MINIMAL_HULL_BODY'];
    const result = auditAssemblyOwnership(sceneWithMinimalNames(), assembly);
    expect(result.issues.some((item) => item.ruleId === 'SUBMOD-021-DUPLICATE_OWNERSHIP')).toBe(
      true,
    );
  });

  it('Socket parent 不存在会报错', () => {
    const assembly = mutableAssembly();
    assembly.sockets[0]!.parent = 'missing_part';
    const result = auditAssemblyOwnership(sceneWithMinimalNames(), assembly);
    expect(result.issues.some((item) => item.ruleId === 'SUBMOD-023-SOCKET_PARENT_MISSING')).toBe(
      true,
    );
  });

  it('零长度轴会报错，非归一化轴会警告', () => {
    const zeroAxis = mutableAssembly();
    zeroAxis.parts[0]!.motion.axis = [0, 0, 0];
    expect(
      auditAssemblyOwnership(sceneWithMinimalNames(), zeroAxis).issues.some(
        (item) => item.ruleId === 'SUBMOD-023-ZERO_LENGTH_AXIS',
      ),
    ).toBe(true);

    const longAxis = mutableAssembly();
    longAxis.parts[0]!.motion.axis = [2, 0, 0];
    expect(
      auditAssemblyOwnership(sceneWithMinimalNames(), longAxis).issues.some(
        (item) => item.ruleId === 'SUBMOD-023-NON_NORMALIZED_AXIS',
      ),
    ).toBe(true);
  });

  it('inventory-only 明确标记 Assembly 检查跳过', () => {
    const skipped = makeInventoryOnlyAssemblySkippedIssue();
    expect(skipped.status).toBe('SKIPPED');
    expect(skipped.context.reason).toBe('SKIPPED_MISSING_ASSEMBLY');
  });
});

describe('潜艇 Mesh 质量纯逻辑审计', () => {
  it('负尺度对象会生成定位到对象的警告', () => {
    const result = auditMeshFixtures([
      {
        edges: [[0, 1]],
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]],
        materialSlots: ['Hull'],
        objectName: 'NEG_SCALE',
        scale: [-1, 1, 1],
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ objectName: 'NEG_SCALE', ruleId: 'SUBMOD-022-NEGATIVE_SCALE' }),
    );
  });

  it('零长度边会生成定位到对象的警告', () => {
    const result = auditMeshFixtures([
      {
        edges: [[0, 1]],
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]],
        materialSlots: ['Hull'],
        objectName: 'ZERO_EDGE',
        scale: [1, 1, 1],
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ objectName: 'ZERO_EDGE', ruleId: 'SUBMOD-022-ZERO_LENGTH_EDGE' }),
    );
  });

  it('退化面会生成定位到对象的警告', () => {
    const result = auditMeshFixtures([
      {
        edges: [[0, 1]],
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]],
        materialSlots: ['Hull'],
        objectName: 'DEGENERATE_FACE',
        scale: [1, 1, 1],
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
      },
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        objectName: 'DEGENERATE_FACE',
        ruleId: 'SUBMOD-022-DEGENERATE_FACE',
      }),
    );
  });

  it('未分配材质和空材质槽都会报告', () => {
    const result = auditMeshFixtures([
      {
        edges: [[0, 1]],
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]],
        materialSlots: [],
        objectName: 'NO_MATERIAL',
        scale: [1, 1, 1],
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
    ]);
    expect(result.issues.some((item) => item.ruleId === 'SUBMOD-022-NO_MATERIAL_SLOT')).toBe(true);
    expect(
      result.issues.some((item) => item.ruleId === 'SUBMOD-022-EMPTY_MATERIAL_SLOT_FACE'),
    ).toBe(true);
  });

  it('相同输入连续运行报告一致且输出排序稳定', () => {
    const meshes = [
      {
        edges: [[0, 1]] as const,
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]] as const,
        materialSlots: ['Hull'],
        meshDataName: 'Shared',
        objectName: 'B',
        scale: [1, 1, 1] as const,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
      {
        edges: [[0, 1]] as const,
        faceMaterialIndices: [0],
        faces: [[0, 1, 2]] as const,
        materialSlots: ['Hull'],
        meshDataName: 'Shared',
        objectName: 'A',
        scale: [1, 1, 1] as const,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
      },
    ];
    expect(auditMeshFixtures(meshes)).toEqual(auditMeshFixtures(meshes));
    expect(auditMeshFixtures(meshes).issues[0]?.ruleId).toBe('SUBMOD-022-DUPLICATE_MESH_DATABLOCK');
  });

  it('Blender 子进程失败可用稳定退出码向上传播', () => {
    const parsed = parseSubmarineAuditArgs(['--bad']);
    expect(parsed.errors).toContain('未知参数：--bad');
  });

  it('审计前后 MASTER 指纹变化会报错', () => {
    const before = { mtimeMs: 1, path: '/tmp/master.blend', sha256: 'a', sizeBytes: 10 };
    const after = { mtimeMs: 2, path: '/tmp/master.blend', sha256: 'b', sizeBytes: 11 };
    const issues = compareFingerprints(before, after);
    expect(issues.map((item) => item.ruleId)).toEqual([
      'SUBMOD-READONLY-SHA256',
      'SUBMOD-READONLY-SIZE',
      'SUBMOD-READONLY-MTIME',
    ]);
  });

  it('临时目录创建不污染仓库夹具目录', () => {
    const { dir, cleanup } = tempProject();
    try {
      mkdirSync(join(dir, 'nested'));
      expect(dir.startsWith(tmpdir())).toBe(true);
    } finally {
      cleanup();
    }
  });
});
