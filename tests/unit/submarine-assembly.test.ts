import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSubmarineAssembly,
  validateSubmarineAssembly,
  validateSubmarineAssemblyContract,
  validateSubmarineAssemblySchema,
  type SubmarineAssembly,
  type SubmarineAssemblyValidationIssue,
} from '../../src/assets/submarineAssembly';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };
type JsonPathSegment = string | number;

const ROOT = resolve(__dirname, '../..');
const TEMPLATE_DIR = resolve(ROOT, 'SilentDepth_Assets/Templates/Submarine');

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (!isJsonObject(parsed)) throw new Error(`${path} 必须是 JSON 对象`);
  return parsed;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
}

function cloneJsonObject(value: unknown): JsonObject {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonObject(cloned)) throw new Error('克隆结果必须是 JSON 对象');
  return cloned;
}

function getPath(root: JsonValue, path: readonly JsonPathSegment[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isJsonObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function parentAt(root: JsonObject, path: readonly JsonPathSegment[]): JsonObject | JsonValue[] {
  let current: JsonValue = root;
  for (const segment of path.slice(0, -1)) {
    let next: JsonValue | undefined;
    if (typeof segment === 'number') {
      next = Array.isArray(current) ? current[segment] : undefined;
    } else {
      next = isJsonObject(current) ? current[segment] : undefined;
    }
    if (!isJsonObject(next) && !Array.isArray(next)) {
      throw new Error(`路径不存在：${path.join('.')}`);
    }
    current = next;
  }
  if (!isJsonObject(current) && !Array.isArray(current)) {
    throw new Error(`路径父级不是容器：${path.join('.')}`);
  }
  return current;
}

function setPath(root: JsonObject, path: readonly JsonPathSegment[], value: JsonValue): void {
  const parent = parentAt(root, path);
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('路径不能为空');
  if (typeof key === 'number') {
    if (!Array.isArray(parent)) throw new Error('数字路径只能写入数组');
    parent[key] = value;
    return;
  }
  if (!isJsonObject(parent)) throw new Error('字符串路径只能写入对象');
  parent[key] = value;
}

function deletePath(root: JsonObject, path: readonly JsonPathSegment[]): void {
  const parent = parentAt(root, path);
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('路径不能为空');
  if (typeof key === 'number') {
    if (!Array.isArray(parent)) throw new Error('数字路径只能删除数组项');
    parent.splice(key, 1);
    return;
  }
  if (!isJsonObject(parent)) throw new Error('字符串路径只能删除对象属性');
  delete parent[key];
}

function pushPath(root: JsonObject, path: readonly JsonPathSegment[], value: JsonValue): void {
  const target = getPath(root, path);
  if (!Array.isArray(target)) throw new Error(`路径不是数组：${path.join('.')}`);
  target.push(value);
}

function issueText(issues: readonly SubmarineAssemblyValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.source}:${issue.keyword ?? 'custom'}:${issue.path}:${issue.message}`)
    .join('\n');
}

function expectIssue(
  issues: readonly SubmarineAssemblyValidationIssue[],
  expectedText: string,
): void {
  expect(
    issues.some((issue) =>
      `${issue.source}:${issue.keyword ?? 'custom'}:${issue.path}:${issue.message}`.includes(
        expectedText,
      ),
    ),
    issueText(issues),
  ).toBe(true);
}

function expectSchemaInvalid(mutator: (assembly: JsonObject) => void, expectedText: string): void {
  const assembly = cloneJsonObject(minimalExample);
  mutator(assembly);
  const issues = validateSubmarineAssemblySchema(assembly);
  expectIssue(issues, expectedText);
}

function expectContractInvalid(
  mutator: (assembly: JsonObject) => void,
  expectedText: string,
): void {
  const assembly = cloneJsonObject(minimalExample);
  mutator(assembly);
  const issues = validateSubmarineAssemblyContract(assembly);
  expectIssue(issues, expectedText);
}

function expectFormalInvalid(mutator: (assembly: JsonObject) => void, expectedText: string): void {
  const assembly = cloneJsonObject(minimalExample);
  mutator(assembly);
  const issues = validateSubmarineAssembly(assembly);
  expectIssue(issues, expectedText);
}

const schema = readJsonObject(resolve(TEMPLATE_DIR, 'submarine_assembly.schema.json'));
const assetTemplate = readJsonObject(
  resolve(TEMPLATE_DIR, 'SilentDepth_Submarine_Asset_Template.json'),
);
const validationRules = readJsonObject(
  resolve(TEMPLATE_DIR, 'SilentDepth_Submarine_Validation_Rules.json'),
);
const assemblyTemplate = readJson(resolve(TEMPLATE_DIR, 'submarine_assembly.template.json'));
const minimalExample = readJson(
  resolve(TEMPLATE_DIR, 'Examples/Minimal/Documentation/TEMPLATE_SUB_MINIMAL_ASSEMBLY.json'),
);
const completeExample = readJson(
  resolve(TEMPLATE_DIR, 'Examples/Complete/Documentation/TEMPLATE_SUB_COMPLETE_ASSEMBLY.json'),
);

describe('潜艇 Assembly Schema 和模板契约', () => {
  it('Schema 声明必需的 Assembly 表面', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toEqual([
      'schemaVersion',
      'assetId',
      'units',
      'coordinateSystem',
      'hull',
      'parts',
      'sockets',
      'validation',
    ]);
    expect(getPath(schema, ['properties', 'hull', 'properties', 'lods', 'required'])).toEqual([
      'LOD0',
      'LOD1',
      'LOD2',
      'LOD3',
    ]);
    expect(getPath(schema, ['$defs', 'motion', 'properties', 'type', 'enum'])).toEqual([
      'static',
      'rotate',
      'translate',
      'rotate_translate',
    ]);
  });

  it('资产模板指向 Assembly Schema 和 v1.1 语义分组', () => {
    expect(assetTemplate.version).toBe('v1.1.0');
    expect(assetTemplate.assembly_schema).toBe('submarine_assembly.schema.json');
    expect(assetTemplate.assembly_template).toBe('submarine_assembly.template.json');
    expect(getPath(assetTemplate, ['collection_policy', 'runtime_semantic_groups'])).toEqual([
      '10_STATIC',
      '20_MOVABLE',
      '30_SOCKETS',
      '40_COLLISION',
      '50_LOD_SOURCE',
      '90_EXPORT_PREVIEW',
    ]);
    expect(getPath(assetTemplate, ['runtime_assembly_rules', 'hull_part_exclusivity'])).toContain(
      '一个源对象不能同时属于 Hull 和活动 Part',
    );
    expect(getPath(assetTemplate, ['weapon_boundary_rules', 'torpedo_body'])).toContain(
      '鱼雷本体是独立武器资产',
    );
  });

  it('验证规则要求 COMPLETE 潜艇提供 Assembly 交付物，并允许 required 数组为空', () => {
    expect(validationRules.version).toBe('v1.1.0');
    expect(validationRules.required_complete_files).toEqual(
      expect.arrayContaining([
        'Blend/[ASSET_ID]_MASTER.blend',
        'FBX/[ASSET_ID]_LOD0.fbx',
        'FBX/[ASSET_ID]_LOD1.fbx',
        'FBX/[ASSET_ID]_LOD2.fbx',
        'FBX/[ASSET_ID]_LOD3.fbx',
        'Documentation/[ASSET_ID]_ASSEMBLY.json',
        'Validation/[ASSET_ID]_ASSEMBLY_AUDIT.json',
        'Validation/[ASSET_ID]_EXPORT_REPORT.json',
        'Collision/[ASSET_ID]_COLLISION.fbx',
        'Documentation/[ASSET_ID]_SPEC.json',
        'Documentation/[ASSET_ID]_README.md',
        'Validation/[ASSET_ID]_VALIDATION.json',
      ]),
    );
    expect(
      getPath(validationRules, [
        'conditional_part_validation',
        'torpedo_doors',
        'not_required_for_every_submarine',
      ]),
    ).toBe(true);
    expect(
      getPath(validationRules, [
        'conditional_part_validation',
        'vls_doors',
        'not_required_for_every_submarine',
      ]),
    ).toBe(true);

    const emptyRequired = cloneJsonObject(minimalExample);
    setPath(emptyRequired, ['validation', 'requiredParts'], []);
    setPath(emptyRequired, ['validation', 'requiredSockets'], []);
    expect(validateSubmarineAssemblySchema(emptyRequired)).toEqual([]);
    expect(validateSubmarineAssemblyContract(emptyRequired)).toEqual([]);
  });
});

describe('潜艇 Assembly 正式校验入口接受官方示例', () => {
  it('Node ESM 可以直接加载正式校验入口', () => {
    const moduleUrl = `file://${resolve(ROOT, 'src/assets/submarineAssembly.ts')}`;
    const script = `const module = await import(${JSON.stringify(moduleUrl)}); console.log(typeof module.validateSubmarineAssemblySchema);`;
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script],
      { encoding: 'utf-8' },
    ).trim();

    expect(output).toBe('function');
  });

  it('模板、最小示例和完整示例同时通过 JSON Schema 与跨字段校验', () => {
    for (const candidate of [assemblyTemplate, minimalExample, completeExample]) {
      expect(validateSubmarineAssemblySchema(candidate)).toEqual([]);
      expect(validateSubmarineAssemblyContract(candidate)).toEqual([]);
      expect(validateSubmarineAssembly(candidate)).toEqual([]);
    }
  });

  it('接受明确的 Part 碰撞策略合法组合', () => {
    const ownedUcx = cloneJsonObject(minimalExample);
    setPath(ownedUcx, ['parts', 0, 'collision'], {
      owner: 'part',
      strategy: 'owned_ucx',
      sourceObjects: ['UCX_SUB_ZZ_MINIMAL_PROPULSOR_01'],
    });
    expect(validateSubmarineAssembly(ownedUcx)).toEqual([]);

    const generatedConvex = cloneJsonObject(minimalExample);
    setPath(generatedConvex, ['parts', 0, 'collision'], {
      owner: 'part',
      strategy: 'simple_convex',
    });
    expect(validateSubmarineAssembly(generatedConvex)).toEqual([]);
  });

  it('接受明确的 Hull 碰撞策略合法组合', () => {
    const embeddedUcx = cloneJsonObject(minimalExample);
    setPath(embeddedUcx, ['hull', 'collision'], {
      owner: 'hull',
      strategy: 'ucx_embedded',
      sourceObjects: ['UCX_SUB_ZZ_MINIMAL_HULL_01'],
    });
    expect(validateSubmarineAssembly(embeddedUcx)).toEqual([]);

    const generatedConvex = cloneJsonObject(minimalExample);
    setPath(generatedConvex, ['hull', 'collision'], {
      owner: 'hull',
      strategy: 'simple_convex',
    });
    expect(validateSubmarineAssembly(generatedConvex)).toEqual([]);
  });

  it('assertSubmarineAssembly 只在 Schema 与跨字段校验共同通过后收窄类型', () => {
    const validCandidate: unknown = minimalExample;
    assertSubmarineAssembly(validCandidate);
    const typedCandidate: SubmarineAssembly = validCandidate;
    expect(typedCandidate.hull.lods.LOD3).toContain('LOD3');

    const invalidCandidate = cloneJsonObject(minimalExample);
    deletePath(invalidCandidate, ['hull', 'lods', 'LOD3']);
    expect(() => assertSubmarineAssembly(invalidCandidate)).toThrow('Invalid submarine assembly');
  });
});

describe('潜艇 Assembly JSON Schema 拒绝结构错误', () => {
  it('拒绝 additionalProperties', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['unexpected'], 'bad');
    }, 'additionalProperties');
  });

  it('拒绝未知 semanticGroup', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'semanticGroup'], '20_MOVABLE/UNKNOWN');
    }, 'enum');
  });

  it('拒绝未知 collision strategy', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'triangle_mesh');
    }, 'enum');
  });

  it('拒绝 collision owner/strategy 非法组合', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['parts', 0, 'collision', 'owner'], 'none');
    setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'owned_ucx');

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(validateSubmarineAssembly(assembly), 'oneOf');
  });

  it('拒绝 none/none collision 携带 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['parts', 0, 'collision', 'sourceObjects'], ['UCX_ORPHAN_COLLISION']);

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'none/none collision 不得声明 sourceObjects',
    );
  });

  it('拒绝 hull/inherit_hull collision 在 Part 声明 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['parts', 0, 'collision', 'owner'], 'hull');
    setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'inherit_hull');
    setPath(assembly, ['parts', 0, 'collision', 'sourceObjects'], ['UCX_PART_HULL_INHERIT']);

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'hull/inherit_hull collision 不得在 Part 声明 sourceObjects',
    );
  });

  it('拒绝 part/owned_ucx collision 缺少 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['parts', 0, 'collision', 'owner'], 'part');
    setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'owned_ucx');

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'part/owned_ucx collision 必须声明 sourceObjects',
    );
  });

  it('拒绝 part/simple_convex collision 携带 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['parts', 0, 'collision', 'owner'], 'part');
    setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'simple_convex');
    setPath(assembly, ['parts', 0, 'collision', 'sourceObjects'], ['UCX_SIMPLE_CONVEX_PART']);

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'part/simple_convex collision 由工具生成，不得声明 sourceObjects',
    );
  });

  it('拒绝未知 lodPolicy.fallback', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'lodPolicy', 'fallback'], 'invent_new_lod');
    }, 'enum');
  });

  it('拒绝错误的可选字段类型', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'lodPolicy', 'hideBeyondMeters'], 'far');
    }, 'type');
  });

  it('拒绝空 parts', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['parts'], []);
    }, 'minItems');
  });

  it('拒绝空 sockets', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['sockets'], []);
    }, 'minItems');
  });

  it('拒绝缺少必需属性', () => {
    expectSchemaInvalid((assembly) => {
      deletePath(assembly, ['parts', 0, 'motion']);
    }, 'required');
  });

  it('拒绝 separate_fbx Hull collision 缺少 path', () => {
    const assembly = cloneJsonObject(minimalExample);
    deletePath(assembly, ['hull', 'collision', 'path']);

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'separate_fbx Hull collision 必须声明 path',
    );
  });

  it('拒绝 ucx_embedded Hull collision 携带 path', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['hull', 'collision', 'strategy'], 'ucx_embedded');

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'ucx_embedded Hull collision 不得声明独立 path',
    );
  });

  it('拒绝 ucx_embedded Hull collision 缺少 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['hull', 'collision'], {
      owner: 'hull',
      strategy: 'ucx_embedded',
    });

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'ucx_embedded Hull collision 必须声明 sourceObjects',
    );
  });

  it('拒绝 simple_convex Hull collision 携带 path 或 sourceObjects', () => {
    const assembly = cloneJsonObject(minimalExample);
    setPath(assembly, ['hull', 'collision', 'strategy'], 'simple_convex');

    expectIssue(validateSubmarineAssemblySchema(assembly), 'oneOf');
    expectIssue(
      validateSubmarineAssemblyContract(assembly),
      'simple_convex Hull collision 由工具生成',
    );
  });

  it('拒绝 Hull collision path 不在标准 Collision 输出目录', () => {
    expectSchemaInvalid((assembly) => {
      setPath(assembly, ['hull', 'collision', 'path'], 'FBX/ZZ_SSN_MinimalTemplate_COLLISION.fbx');
    }, 'pattern');
  });
});

describe('潜艇 Assembly 跨字段校验拒绝不安全或含糊的契约', () => {
  it('拒绝 assetId 与现有 Hull LOD、Part 导出名和碰撞文件前缀不一致', () => {
    expectFormalInvalid((assembly) => {
      setPath(assembly, ['assetId'], 'US_SSN_Unrelated');
    }, 'US_SSN_Unrelated_LOD0.fbx');
  });

  it('拒绝 Hull LOD 文件名与 assetId 不一致', () => {
    expectFormalInvalid((assembly) => {
      setPath(assembly, ['hull', 'lods', 'LOD2'], 'FBX/US_SSN_Unrelated_LOD2.fbx');
    }, '文件名必须为 ZZ_SSN_MinimalTemplate_LOD2.fbx');
  });

  it('拒绝 Part exportName 前缀与 assetId 不一致', () => {
    expectFormalInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'exportName'], 'US_SSN_Unrelated_PROPULSOR_01');
    }, 'exportName 前缀必须与 assetId ZZ_SSN_MinimalTemplate 一致');
  });

  it('拒绝碰撞文件前缀与 assetId 不一致', () => {
    expectFormalInvalid((assembly) => {
      setPath(assembly, ['hull', 'collision', 'path'], 'Collision/US_SSN_Unrelated_COLLISION.fbx');
    }, '路径必须为 Collision/ZZ_SSN_MinimalTemplate_COLLISION.fbx');
  });

  it('拒绝碰撞文件名只匹配 assetId 前缀但不是标准输出名', () => {
    expectFormalInvalid((assembly) => {
      setPath(
        assembly,
        ['hull', 'collision', 'path'],
        'Collision/ZZ_SSN_MinimalTemplate_COLLISION_EXTRA.fbx',
      );
    }, '路径必须为 Collision/ZZ_SSN_MinimalTemplate_COLLISION.fbx');
  });

  it('拒绝重复 Part ID', () => {
    const firstPartId = getPath(cloneJsonObject(minimalExample), ['parts', 0, 'id']);
    expectContractInvalid((assembly) => {
      if (typeof firstPartId !== 'string') throw new Error('Part ID 必须是字符串');
      setPath(assembly, ['parts', 1, 'id'], firstPartId);
    }, '重复');
  });

  it('拒绝重复 Socket ID', () => {
    expectContractInvalid((assembly) => {
      const firstSocket = getPath(assembly, ['sockets', 0]);
      if (!isJsonObject(firstSocket)) throw new Error('Socket 必须是对象');
      pushPath(assembly, ['sockets'], cloneJsonObject(firstSocket));
    }, '重复');
  });

  it('拒绝重复 Part exportName', () => {
    const firstExportName = getPath(cloneJsonObject(minimalExample), ['parts', 0, 'exportName']);
    expectFormalInvalid((assembly) => {
      if (typeof firstExportName !== 'string') throw new Error('Part exportName 必须是字符串');
      setPath(assembly, ['parts', 1, 'exportName'], firstExportName);
    }, 'exportName 与 Part propulsor_01 重复');
  });

  it('拒绝空 ID', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'id'], '');
    }, '不能为空');
  });

  it('拒绝空源对象匹配', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'sourceObjects'], []);
    }, '至少需要一项');
  });

  it('拒绝绝对路径', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['hull', 'lods', 'LOD0'], '/tmp/ZZ_SSN_MinimalTemplate_LOD0.fbx');
    }, '相对路径');
  });

  it('拒绝路径穿越', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['hull', 'lods', 'LOD1'], '../FBX/ZZ_SSN_MinimalTemplate_LOD1.fbx');
    }, '.. 穿越');
  });

  it('拒绝零长度运动轴', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'motion', 'axis'], [0.0, 0.0, 0.0]);
    }, '零长度');
  });

  it('拒绝反转的 min/max 范围', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 1, 'motion', 'rotationRangeDegrees'], { min: 30.0, max: -30.0 });
    }, 'min 不得大于 max');
  });

  it('拒绝连续旋转同时声明有限旋转范围', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'motion', 'rotationRangeDegrees'], {
        min: -180.0,
        max: 180.0,
      });
    }, 'continuousRotation 不能同时声明有限旋转范围');
  });

  it('拒绝未知 motion type', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'motion', 'type'], 'spin_forever');
    }, '不支持的 motion type');
  });

  it('拒绝未知 stateSource', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'motion', 'stateSource'], 'made_up_state');
    }, '不支持的 stateSource');
  });

  it('拒绝缺失必需 Hull LOD', () => {
    expectContractInvalid((assembly) => {
      deletePath(assembly, ['hull', 'lods', 'LOD3']);
    }, 'hull.lods.LOD3');
  });

  it('拒绝 Hull 和 Part 拥有同一源对象', () => {
    expectContractInvalid((assembly) => {
      const hullSource = getPath(assembly, ['hull', 'sourceObjects', 0]);
      if (typeof hullSource !== 'string') throw new Error('Hull 源对象必须是字符串');
      setPath(assembly, ['parts', 0, 'sourceObjects', 0], hullSource);
    }, '不能重复属于 Hull 和活动 Part');
  });

  it('拒绝 collision owner/strategy 跨字段非法组合', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'collision', 'owner'], 'none');
      setPath(assembly, ['parts', 0, 'collision', 'strategy'], 'owned_ucx');
    }, 'collision owner/strategy 组合非法');
  });

  it('拒绝 Part parent 引用不存在的 Part', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'parent'], 'missing_part');
    }, 'Part parent 必须是 root 或已存在的 Part ID');
  });

  it('拒绝 Part parent 引用自身', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'parent'], 'propulsor_01');
    }, 'Part parent 禁止引用自身');
  });

  it('拒绝 Part 父级循环', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['parts', 0, 'parent'], 'rudder_01');
      setPath(assembly, ['parts', 1, 'parent'], 'propulsor_01');
    }, 'Part 父级禁止形成循环');
  });

  it('拒绝 Socket parent 引用不存在的 Part', () => {
    expectContractInvalid((assembly) => {
      setPath(assembly, ['sockets', 0, 'parent'], 'missing_part');
    }, 'Socket parent 必须是 root 或已存在的 Part ID');
  });
});
