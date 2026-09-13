import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import submarineAssemblySchema from '../../submarine_assembly.schema.json' with { type: 'json' };

export type AssemblyMotionType = 'static' | 'rotate' | 'translate' | 'rotate_translate';

export type AssemblyStateSource =
  | 'none'
  | 'propulsor_rpm'
  | 'rudder_angle'
  | 'bow_planes_angle'
  | 'stern_planes_angle'
  | 'periscope_extension'
  | 'mast_extension'
  | 'torpedo_door_open'
  | 'vls_door_open'
  | 'damage_state'
  | 'mission_script'
  | 'camera_mode'
  | 'audio_state'
  | 'vfx_state';

export type AssemblyCollisionOwner = 'hull' | 'part' | 'none';

export type AssemblySemanticGroup =
  | '20_MOVABLE/PROPULSOR'
  | '20_MOVABLE/RUDDER'
  | '20_MOVABLE/BOW_PLANES'
  | '20_MOVABLE/STERN_PLANES'
  | '20_MOVABLE/MASTS'
  | '20_MOVABLE/PERISCOPES'
  | '20_MOVABLE/TORPEDO_DOORS'
  | '20_MOVABLE/VLS_DOORS'
  | '20_MOVABLE/OTHER_HATCHES';

export type HullCollisionStrategy = 'ucx_embedded' | 'separate_fbx' | 'simple_convex';

export type PartCollisionStrategy = 'none' | 'simple_convex' | 'owned_ucx' | 'inherit_hull';

export type AssemblyLodLevel = 'LOD0' | 'LOD1' | 'LOD2' | 'LOD3';

export type AssemblyLodFallback = 'hide' | 'merge_to_hull_lod3' | 'keep_last_lod';

export type AssemblySocketPurpose =
  | 'torpedo_muzzle'
  | 'vls_muzzle'
  | 'decoy_launcher'
  | 'sensor_mount'
  | 'defense_mount'
  | 'propulsion_mount'
  | 'vfx_anchor'
  | 'audio_anchor'
  | 'camera_anchor';

export interface AssemblyRange {
  readonly min: number;
  readonly max: number;
}

export interface AssemblyTransform {
  readonly translation: readonly [number, number, number];
  readonly rotationDegrees: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

export interface AssemblyMotion {
  readonly type: AssemblyMotionType;
  readonly axis: readonly [number, number, number];
  readonly rotationRangeDegrees?: AssemblyRange;
  readonly translationRangeMeters?: AssemblyRange;
  readonly continuousRotation?: boolean;
  readonly stateSource: AssemblyStateSource;
}

export interface AssemblyPart {
  readonly id: string;
  readonly semanticGroup: AssemblySemanticGroup;
  readonly exportName: string;
  readonly sourceObjects?: readonly string[];
  readonly sourceCollections?: readonly string[];
  readonly pivotAnchor: string;
  readonly parent: string;
  readonly mountTransform: AssemblyTransform;
  readonly motion: AssemblyMotion;
  readonly collision: {
    readonly owner: AssemblyCollisionOwner;
    readonly strategy: PartCollisionStrategy;
    readonly sourceObjects?: readonly string[];
  };
  readonly lodPolicy: {
    readonly levels: readonly AssemblyLodLevel[];
    readonly visibleDistanceMeters: readonly [number, number];
    readonly hideBeyondMeters?: number;
    readonly fallback?: AssemblyLodFallback;
  };
}

export interface AssemblySocket {
  readonly id: string;
  readonly sourceAnchor: string;
  readonly purpose: AssemblySocketPurpose;
  readonly transform: AssemblyTransform;
  readonly parent: string;
}

export interface SubmarineAssembly {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly templateNotice?: string;
  readonly units: 'meters';
  readonly coordinateSystem: {
    readonly forward: '+X';
    readonly up: '+Z';
    readonly right: '+Y' | '-Y';
    readonly unrealConversion?: '1 Blender meter = 100 Unreal Units';
  };
  readonly hull: {
    readonly sourceObjects: readonly string[];
    readonly sourceCollections?: readonly string[];
    readonly lods: {
      readonly LOD0: string;
      readonly LOD1: string;
      readonly LOD2: string;
      readonly LOD3: string;
    };
    readonly collision: {
      readonly owner: 'hull';
      readonly strategy: HullCollisionStrategy;
      readonly path?: string;
      readonly sourceObjects?: readonly string[];
    };
  };
  readonly parts: readonly AssemblyPart[];
  readonly sockets: readonly AssemblySocket[];
  readonly validation: {
    readonly requiredParts: readonly string[];
    readonly requiredSockets: readonly string[];
  };
}

export interface SubmarineAssemblyValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly source: 'schema' | 'contract';
  readonly keyword?: string;
}

type JsonRecord = Record<string, unknown>;
type JsonSchemaError = ErrorObject<string, Record<string, unknown>, unknown>;

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const EXPORT_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const ASSET_ID_PATTERN = /^[A-Z]{2}_[A-Z0-9]+_[A-Za-z0-9_]+$/;
const MOTION_TYPES: readonly AssemblyMotionType[] = [
  'static',
  'rotate',
  'translate',
  'rotate_translate',
];
const STATE_SOURCES: readonly AssemblyStateSource[] = [
  'none',
  'propulsor_rpm',
  'rudder_angle',
  'bow_planes_angle',
  'stern_planes_angle',
  'periscope_extension',
  'mast_extension',
  'torpedo_door_open',
  'vls_door_open',
  'damage_state',
  'mission_script',
  'camera_mode',
  'audio_state',
  'vfx_state',
];
const SOCKET_PURPOSES: readonly AssemblySocketPurpose[] = [
  'torpedo_muzzle',
  'vls_muzzle',
  'decoy_launcher',
  'sensor_mount',
  'defense_mount',
  'propulsion_mount',
  'vfx_anchor',
  'audio_anchor',
  'camera_anchor',
];
const SEMANTIC_GROUPS: readonly AssemblySemanticGroup[] = [
  '20_MOVABLE/PROPULSOR',
  '20_MOVABLE/RUDDER',
  '20_MOVABLE/BOW_PLANES',
  '20_MOVABLE/STERN_PLANES',
  '20_MOVABLE/MASTS',
  '20_MOVABLE/PERISCOPES',
  '20_MOVABLE/TORPEDO_DOORS',
  '20_MOVABLE/VLS_DOORS',
  '20_MOVABLE/OTHER_HATCHES',
];
const COLLISION_OWNERS: readonly AssemblyCollisionOwner[] = ['hull', 'part', 'none'];
const HULL_COLLISION_STRATEGIES: readonly HullCollisionStrategy[] = [
  'ucx_embedded',
  'separate_fbx',
  'simple_convex',
];
const PART_COLLISION_STRATEGIES: readonly PartCollisionStrategy[] = [
  'none',
  'simple_convex',
  'owned_ucx',
  'inherit_hull',
];
const LOD_KEYS: readonly AssemblyLodLevel[] = ['LOD0', 'LOD1', 'LOD2', 'LOD3'];
const LOD_FALLBACKS: readonly AssemblyLodFallback[] = [
  'hide',
  'merge_to_hull_lod3',
  'keep_last_lod',
];
const AXIS_EPSILON = 1e-6;
const NORMALIZED_AXIS_TOLERANCE = 0.001;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(submarineAssemblySchema);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushIssue(
  issues: SubmarineAssemblyValidationIssue[],
  path: string,
  message: string,
  source: SubmarineAssemblyValidationIssue['source'] = 'contract',
  keyword?: string,
): void {
  issues.push({ path, message, source, keyword });
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((candidate) => candidate === value);
}

function formatSchemaPath(instancePath: string): string {
  if (instancePath.length === 0) return '$';
  return instancePath.replace(/^\//, '').replaceAll('/', '.');
}

function schemaParamString(
  params: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function appendSchemaPath(path: string, child: string): string {
  return path === '$' ? child : `${path}.${child}`;
}

function schemaIssuePath(error: JsonSchemaError): string {
  const basePath = formatSchemaPath(error.instancePath);
  if (error.keyword === 'required') {
    const missingProperty = schemaParamString(error.params, 'missingProperty');
    return missingProperty === null ? basePath : appendSchemaPath(basePath, missingProperty);
  }
  if (error.keyword === 'additionalProperties') {
    const additionalProperty = schemaParamString(error.params, 'additionalProperty');
    return additionalProperty === null ? basePath : appendSchemaPath(basePath, additionalProperty);
  }
  return basePath;
}

function schemaIssueMessage(error: JsonSchemaError): string {
  if (error.keyword === 'additionalProperties') return '包含 Schema 不允许的额外属性';
  if (error.keyword === 'required') return '缺少 Schema 必需属性';
  if (error.keyword === 'enum' || error.keyword === 'const') return '值不在 Schema 允许范围内';
  if (error.keyword === 'type') return '字段类型不符合 Schema';
  if (error.keyword === 'minItems') return '数组项数量少于 Schema 要求';
  if (error.keyword === 'minLength') return '字符串长度少于 Schema 要求';
  return `Schema 校验失败：${error.message ?? error.keyword}`;
}

export function validateSubmarineAssemblySchema(
  data: unknown,
): readonly SubmarineAssemblyValidationIssue[] {
  const valid = validateSchema(data);
  if (valid) return [];

  return (validateSchema.errors ?? []).map((error: JsonSchemaError) => ({
    path: schemaIssuePath(error),
    message: schemaIssueMessage(error),
    source: 'schema' as const,
    keyword: error.keyword,
  }));
}

function getRecord(
  parent: JsonRecord,
  key: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): JsonRecord | null {
  const value = parent[key];
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是对象');
    return null;
  }
  return value;
}

function getString(
  parent: JsonRecord,
  key: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): string | null {
  const value = parent[key];
  if (typeof value !== 'string') {
    pushIssue(issues, path, '必须是字符串');
    return null;
  }
  if (value.trim().length === 0) {
    pushIssue(issues, path, '不能为空');
    return null;
  }
  return value;
}

function getOptionalString(parent: JsonRecord, key: string): string | null {
  const value = parent[key];
  return typeof value === 'string' ? value : null;
}

function getArray(
  parent: JsonRecord,
  key: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): readonly unknown[] | null {
  const value = parent[key];
  if (!Array.isArray(value)) {
    pushIssue(issues, path, '必须是数组');
    return null;
  }
  return value;
}

function validateStringArray(
  parent: JsonRecord,
  key: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
  options: { readonly required: boolean; readonly pathLike?: boolean } = { required: true },
): readonly string[] | null {
  const raw = parent[key];
  if (raw === undefined && !options.required) return null;
  const values = getArray(parent, key, path, issues);
  if (values === null) return null;
  if (values.length === 0) pushIssue(issues, path, '至少需要一项');

  const parsed: string[] = [];
  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof value !== 'string' || value.trim().length === 0) {
      pushIssue(issues, itemPath, '必须是非空字符串');
      return;
    }
    if (options.pathLike === true) validateRelativePath(value, itemPath, issues);
    parsed.push(value);
  });
  return parsed;
}

function fileNameFromRelativePath(pathValue: string): string {
  const segments = pathValue.split(/[\\/]+/);
  return segments[segments.length - 1] ?? pathValue;
}

function validateAssetFileName(
  pathValue: string,
  expectedFileName: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (fileNameFromRelativePath(pathValue) !== expectedFileName) {
    pushIssue(issues, path, `文件名必须为 ${expectedFileName}`);
  }
}

function validateAssetPath(
  pathValue: string,
  expectedPath: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (pathValue !== expectedPath) {
    pushIssue(issues, path, `路径必须为 ${expectedPath}`);
  }
}

function validateExportNamePrefix(
  exportName: string,
  assetId: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (!exportName.startsWith(`${assetId}_`)) {
    pushIssue(issues, path, `exportName 前缀必须与 assetId ${assetId} 一致`);
  }
}

function validateStringReferenceArray(
  parent: JsonRecord,
  key: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): readonly string[] | null {
  const values = getArray(parent, key, path, issues);
  if (values === null) return null;

  const parsed: string[] = [];
  values.forEach((value, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof value !== 'string' || value.trim().length === 0) {
      pushIssue(issues, itemPath, '必须是非空字符串');
      return;
    }
    parsed.push(value);
  });
  return parsed;
}

function validateNumberTuple3(
  value: unknown,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    pushIssue(issues, path, '必须是包含 3 个数字的数组');
    return null;
  }

  const tuple: number[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      pushIssue(issues, `${path}[${index}]`, '必须是有限数字');
      return;
    }
    tuple.push(item);
  });

  return tuple.length === 3 ? [tuple[0]!, tuple[1]!, tuple[2]!] : null;
}

function validateNumberTuple2(
  value: unknown,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    pushIssue(issues, path, '必须是包含 2 个数字的数组');
    return null;
  }
  if (typeof value[0] !== 'number' || !Number.isFinite(value[0])) {
    pushIssue(issues, `${path}[0]`, '必须是有限数字');
    return null;
  }
  if (typeof value[1] !== 'number' || !Number.isFinite(value[1])) {
    pushIssue(issues, `${path}[1]`, '必须是有限数字');
    return null;
  }
  if (value[0] > value[1]) pushIssue(issues, path, 'min 不得大于 max');
  return [value[0], value[1]];
}

function validateRelativePath(
  pathValue: string,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue)) {
    pushIssue(issues, path, '路径必须是资产目录内的相对路径');
  }
  if (pathValue.includes('://')) {
    pushIssue(issues, path, '路径不得使用协议或远程 URL');
  }
  const segments = pathValue.split(/[\\/]+/);
  if (segments.includes('..')) {
    pushIssue(issues, path, '路径不得包含 .. 穿越');
  }
  if (segments.some((segment) => segment.trim().length === 0)) {
    pushIssue(issues, path, '路径不得包含空段');
  }
}

function validateTransform(
  value: unknown,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是 transform 对象');
    return;
  }
  validateNumberTuple3(value.translation, `${path}.translation`, issues);
  validateNumberTuple3(value.rotationDegrees, `${path}.rotationDegrees`, issues);
  if (value.scale !== undefined) validateNumberTuple3(value.scale, `${path}.scale`, issues);
}

function validateRange(
  value: unknown,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): AssemblyRange | null {
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是范围对象');
    return null;
  }
  const min = value.min;
  const max = value.max;
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    pushIssue(issues, `${path}.min`, '必须是有限数字');
    return null;
  }
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    pushIssue(issues, `${path}.max`, '必须是有限数字');
    return null;
  }
  if (min > max) pushIssue(issues, path, 'min 不得大于 max');
  return { min, max };
}

function validateAxis(
  axis: readonly [number, number, number] | null,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (axis === null) return;
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length <= AXIS_EPSILON) {
    pushIssue(issues, path, '运动轴不得为零长度');
    return;
  }
  if (Math.abs(length - 1) > NORMALIZED_AXIS_TOLERANCE) {
    pushIssue(issues, path, '运动轴必须归一化');
  }
}

function validateUniqueIds(
  ids: readonly string[],
  basePath: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const seen = new Map<string, number>();
  ids.forEach((id, index) => {
    const firstIndex = seen.get(id);
    if (firstIndex !== undefined) {
      pushIssue(issues, `${basePath}[${index}].id`, `ID 与 ${basePath}[${firstIndex}].id 重复`);
      return;
    }
    seen.set(id, index);
  });
}

function validateRequiredReferences(
  ids: readonly string[],
  knownIds: ReadonlySet<string>,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  validateUniqueStringValues(ids, path, issues);
  ids.forEach((id, index) => {
    if (!knownIds.has(id)) pushIssue(issues, `${path}[${index}]`, '引用的 ID 不存在');
  });
}

function validateUniqueStringValues(
  values: readonly string[],
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const firstIndex = seen.get(value);
    if (firstIndex !== undefined) {
      pushIssue(issues, `${path}[${index}]`, `值与 ${path}[${firstIndex}] 重复`);
      return;
    }
    seen.set(value, index);
  });
}

function validateSourceOwnership(
  sourceObjectsByOwner: ReadonlyMap<string, readonly string[]>,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const ownersBySource = new Map<string, string>();
  for (const [owner, sourceObjects] of sourceObjectsByOwner) {
    for (const sourceObject of sourceObjects) {
      const existingOwner = ownersBySource.get(sourceObject);
      if (existingOwner !== undefined) {
        pushIssue(
          issues,
          owner,
          `源对象 ${sourceObject} 已被 ${existingOwner} 拥有，不能重复属于 Hull 和活动 Part`,
        );
        continue;
      }
      ownersBySource.set(sourceObject, owner);
    }
  }
}

function validateMotion(
  value: unknown,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是 motion 对象');
    return;
  }

  const type = getString(value, 'type', `${path}.type`, issues);
  if (type !== null && !isOneOf(type, MOTION_TYPES)) {
    pushIssue(issues, `${path}.type`, '不支持的 motion type');
  }

  const axis = validateNumberTuple3(value.axis, `${path}.axis`, issues);
  validateAxis(axis, `${path}.axis`, issues);

  const stateSource = getString(value, 'stateSource', `${path}.stateSource`, issues);
  if (stateSource !== null && !isOneOf(stateSource, STATE_SOURCES)) {
    pushIssue(issues, `${path}.stateSource`, '不支持的 stateSource');
  }

  const rotationRange =
    value.rotationRangeDegrees === undefined
      ? null
      : validateRange(value.rotationRangeDegrees, `${path}.rotationRangeDegrees`, issues);
  const translationRange =
    value.translationRangeMeters === undefined
      ? null
      : validateRange(value.translationRangeMeters, `${path}.translationRangeMeters`, issues);
  const continuousRotation = value.continuousRotation === true;

  if (continuousRotation && rotationRange !== null) {
    pushIssue(issues, path, 'continuousRotation 不能同时声明有限旋转范围');
  }
  if (type === 'rotate' && rotationRange === null && !continuousRotation) {
    pushIssue(issues, path, 'rotate 运动必须声明 rotationRangeDegrees 或 continuousRotation');
  }
  if (type === 'translate' && translationRange === null) {
    pushIssue(issues, path, 'translate 运动必须声明 translationRangeMeters');
  }
  if (type === 'rotate_translate' && (rotationRange === null || translationRange === null)) {
    pushIssue(issues, path, 'rotate_translate 运动必须同时声明旋转和平移范围');
  }
}

function validatePartCollisionCombination(
  owner: AssemblyCollisionOwner,
  strategy: PartCollisionStrategy,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const validCombination =
    (owner === 'none' && strategy === 'none') ||
    (owner === 'part' && (strategy === 'simple_convex' || strategy === 'owned_ucx')) ||
    (owner === 'hull' && strategy === 'inherit_hull');

  if (!validCombination) {
    pushIssue(issues, path, 'collision owner/strategy 组合非法');
  }
}

function validatePartCollisionSourceObjects(
  owner: AssemblyCollisionOwner,
  strategy: PartCollisionStrategy,
  hasSourceObjects: boolean,
  path: string,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (owner === 'none' && strategy === 'none' && hasSourceObjects) {
    pushIssue(issues, path, 'none/none collision 不得声明 sourceObjects');
  }
  if (owner === 'hull' && strategy === 'inherit_hull' && hasSourceObjects) {
    pushIssue(issues, path, 'hull/inherit_hull collision 不得在 Part 声明 sourceObjects');
  }
  if (owner === 'part' && strategy === 'owned_ucx' && !hasSourceObjects) {
    pushIssue(issues, path, 'part/owned_ucx collision 必须声明 sourceObjects');
  }
  if (owner === 'part' && strategy === 'simple_convex' && hasSourceObjects) {
    pushIssue(issues, path, 'part/simple_convex collision 由工具生成，不得声明 sourceObjects');
  }
}

function validateHullCollisionRules(
  strategy: HullCollisionStrategy,
  hasPath: boolean,
  hasSourceObjects: boolean,
  issues: SubmarineAssemblyValidationIssue[],
): void {
  if (strategy === 'separate_fbx' && !hasPath) {
    pushIssue(issues, 'hull.collision.path', 'separate_fbx Hull collision 必须声明 path');
  }
  if (strategy === 'ucx_embedded' && hasPath) {
    pushIssue(issues, 'hull.collision.path', 'ucx_embedded Hull collision 不得声明独立 path');
  }
  if (strategy === 'ucx_embedded' && !hasSourceObjects) {
    pushIssue(issues, 'hull.collision.sourceObjects', 'ucx_embedded Hull collision 必须声明 sourceObjects');
  }
  if (strategy === 'simple_convex' && hasPath) {
    pushIssue(issues, 'hull.collision.path', 'simple_convex Hull collision 由工具生成，不得声明 path');
  }
  if (strategy === 'simple_convex' && hasSourceObjects) {
    pushIssue(issues, 'hull.collision.sourceObjects', 'simple_convex Hull collision 由工具生成，不得声明 sourceObjects');
  }
}

function validatePart(
  value: unknown,
  index: number,
  assetId: string | null,
  issues: SubmarineAssemblyValidationIssue[],
  sourceObjectsByOwner: Map<string, readonly string[]>,
): { readonly id: string; readonly parent: string; readonly exportName: string } | null {
  const path = `parts[${index}]`;
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是 Part 对象');
    return null;
  }

  const id = getString(value, 'id', `${path}.id`, issues);
  if (id !== null && !ID_PATTERN.test(id)) pushIssue(issues, `${path}.id`, '必须是稳定非空小写 ID');

  const semanticGroup = getString(value, 'semanticGroup', `${path}.semanticGroup`, issues);
  if (semanticGroup !== null && !isOneOf(semanticGroup, SEMANTIC_GROUPS)) {
    pushIssue(issues, `${path}.semanticGroup`, '不支持的 semanticGroup');
  }
  const exportName = getString(value, 'exportName', `${path}.exportName`, issues);
  if (exportName !== null && !EXPORT_NAME_PATTERN.test(exportName)) {
    pushIssue(issues, `${path}.exportName`, '只能包含字母、数字和下划线');
  }
  if (exportName !== null && assetId !== null) {
    validateExportNamePrefix(exportName, assetId, `${path}.exportName`, issues);
  }
  getString(value, 'pivotAnchor', `${path}.pivotAnchor`, issues);
  const parent = getString(value, 'parent', `${path}.parent`, issues);
  validateTransform(value.mountTransform, `${path}.mountTransform`, issues);
  validateMotion(value.motion, `${path}.motion`, issues);

  const sourceObjects = validateStringArray(value, 'sourceObjects', `${path}.sourceObjects`, issues, {
    required: false,
  });
  const sourceCollections = validateStringArray(
    value,
    'sourceCollections',
    `${path}.sourceCollections`,
    issues,
    { required: false, pathLike: true },
  );
  if (sourceObjects === null && sourceCollections === null) {
    pushIssue(issues, path, '必须声明 sourceObjects 或 sourceCollections');
  }
  if (sourceObjects !== null) sourceObjectsByOwner.set(`${path}.sourceObjects`, sourceObjects);

  const collision = getRecord(value, 'collision', `${path}.collision`, issues);
  if (collision !== null) {
    const owner = getString(collision, 'owner', `${path}.collision.owner`, issues);
    const ownerValid = owner !== null && isOneOf(owner, COLLISION_OWNERS);
    if (owner !== null && !ownerValid) {
      pushIssue(issues, `${path}.collision.owner`, '不支持的 collision owner');
    }
    const strategy = getString(collision, 'strategy', `${path}.collision.strategy`, issues);
    const strategyValid = strategy !== null && isOneOf(strategy, PART_COLLISION_STRATEGIES);
    if (strategy !== null && !strategyValid) {
      pushIssue(issues, `${path}.collision.strategy`, '不支持的 collision strategy');
    }
    const hasCollisionSourceObjects = collision.sourceObjects !== undefined;
    if (ownerValid && strategyValid) {
      validatePartCollisionCombination(owner, strategy, `${path}.collision`, issues);
      validatePartCollisionSourceObjects(
        owner,
        strategy,
        hasCollisionSourceObjects,
        `${path}.collision`,
        issues,
      );
    }
    const collisionSourceObjects = validateStringArray(collision, 'sourceObjects', `${path}.collision.sourceObjects`, issues, {
      required: false,
    });
    if (collisionSourceObjects !== null) {
      sourceObjectsByOwner.set(`${path}.collision.sourceObjects`, collisionSourceObjects);
    }
  }

  const lodPolicy = getRecord(value, 'lodPolicy', `${path}.lodPolicy`, issues);
  if (lodPolicy !== null) {
    const levels = validateStringArray(lodPolicy, 'levels', `${path}.lodPolicy.levels`, issues);
    if (levels !== null) {
      for (const level of levels) {
        if (!isOneOf(level, LOD_KEYS)) {
          pushIssue(issues, `${path}.lodPolicy.levels`, 'LOD 只能使用 LOD0-LOD3');
        }
      }
    }
    validateNumberTuple2(
      lodPolicy.visibleDistanceMeters,
      `${path}.lodPolicy.visibleDistanceMeters`,
      issues,
    );
    const hideBeyondMeters = lodPolicy.hideBeyondMeters;
    if (
      hideBeyondMeters !== undefined &&
      (typeof hideBeyondMeters !== 'number' || !Number.isFinite(hideBeyondMeters))
    ) {
      pushIssue(issues, `${path}.lodPolicy.hideBeyondMeters`, '必须是有限数字');
    }
    const fallback = getOptionalString(lodPolicy, 'fallback');
    if (fallback !== null && !isOneOf(fallback, LOD_FALLBACKS)) {
      pushIssue(issues, `${path}.lodPolicy.fallback`, '不支持的 lodPolicy.fallback');
    }
  }

  return id !== null && parent !== null && exportName !== null ? { id, parent, exportName } : null;
}

function validateSocket(
  value: unknown,
  index: number,
  issues: SubmarineAssemblyValidationIssue[],
): { readonly id: string; readonly parent: string } | null {
  const path = `sockets[${index}]`;
  if (!isRecord(value)) {
    pushIssue(issues, path, '必须是 Socket 对象');
    return null;
  }
  const id = getString(value, 'id', `${path}.id`, issues);
  if (id !== null && !ID_PATTERN.test(id)) pushIssue(issues, `${path}.id`, '必须是稳定非空小写 ID');
  getString(value, 'sourceAnchor', `${path}.sourceAnchor`, issues);
  const purpose = getString(value, 'purpose', `${path}.purpose`, issues);
  if (purpose !== null && !isOneOf(purpose, SOCKET_PURPOSES)) {
    pushIssue(issues, `${path}.purpose`, '不支持的 Socket purpose');
  }
  validateTransform(value.transform, `${path}.transform`, issues);
  const parent = getString(value, 'parent', `${path}.parent`, issues);
  return id !== null && parent !== null ? { id, parent } : null;
}

function validateParentReferences(
  parts: readonly { readonly id: string; readonly parent: string; readonly exportName: string }[],
  sockets: readonly { readonly id: string; readonly parent: string }[],
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const partIds = new Set(parts.map((part) => part.id));

  for (const part of parts) {
    if (part.parent === part.id) {
      pushIssue(issues, `parts.${part.id}.parent`, 'Part parent 禁止引用自身');
      continue;
    }
    if (part.parent !== 'root' && !partIds.has(part.parent)) {
      pushIssue(issues, `parts.${part.id}.parent`, 'Part parent 必须是 root 或已存在的 Part ID');
    }
  }

  const parentByPart = new Map(parts.map((part) => [part.id, part.parent]));
  for (const part of parts) {
    const visiting = new Set<string>();
    let current: string | undefined = part.id;
    while (current !== undefined) {
      if (visiting.has(current)) {
        pushIssue(issues, `parts.${part.id}.parent`, 'Part 父级禁止形成循环');
        break;
      }
      visiting.add(current);
      const parent = parentByPart.get(current);
      if (parent === undefined || parent === 'root') break;
      current = parent;
    }
  }

  for (const socket of sockets) {
    if (socket.parent !== 'root' && !partIds.has(socket.parent)) {
      pushIssue(issues, `sockets.${socket.id}.parent`, 'Socket parent 必须是 root 或已存在的 Part ID');
    }
  }
}

function validateUniqueExportNames(
  parts: readonly { readonly id: string; readonly exportName: string }[],
  issues: SubmarineAssemblyValidationIssue[],
): void {
  const seen = new Map<string, string>();
  for (const part of parts) {
    const firstPartId = seen.get(part.exportName);
    if (firstPartId !== undefined) {
      pushIssue(
        issues,
        `parts.${part.id}.exportName`,
        `exportName 与 Part ${firstPartId} 重复`,
      );
      continue;
    }
    seen.set(part.exportName, part.id);
  }
}

export function validateSubmarineAssemblyContract(
  data: unknown,
): readonly SubmarineAssemblyValidationIssue[] {
  const issues: SubmarineAssemblyValidationIssue[] = [];
  if (!isRecord(data)) {
    return [{ path: '$', message: 'Assembly JSON 必须是对象', source: 'contract' }];
  }

  if (data.schemaVersion !== 1) pushIssue(issues, 'schemaVersion', '当前只支持 schemaVersion 1');

  const assetId = getString(data, 'assetId', 'assetId', issues);
  if (assetId !== null && !ASSET_ID_PATTERN.test(assetId)) {
    pushIssue(issues, 'assetId', 'assetId 必须使用 [COUNTRY]_[TYPE]_[CLASS]');
  }
  const units = getString(data, 'units', 'units', issues);
  if (units !== null && units !== 'meters') pushIssue(issues, 'units', 'units 必须是 meters');

  const coordinateSystem = getRecord(data, 'coordinateSystem', 'coordinateSystem', issues);
  if (coordinateSystem !== null) {
    if (coordinateSystem.forward !== '+X') pushIssue(issues, 'coordinateSystem.forward', '舰艏必须为 +X');
    if (coordinateSystem.up !== '+Z') pushIssue(issues, 'coordinateSystem.up', '上方向必须为 +Z');
    if (coordinateSystem.right !== '+Y' && coordinateSystem.right !== '-Y') {
      pushIssue(issues, 'coordinateSystem.right', '横向轴必须声明 +Y 或 -Y');
    }
  }

  const sourceObjectsByOwner = new Map<string, readonly string[]>();
  const hull = getRecord(data, 'hull', 'hull', issues);
  if (hull !== null) {
    const hullSources = validateStringArray(hull, 'sourceObjects', 'hull.sourceObjects', issues);
    if (hullSources !== null) sourceObjectsByOwner.set('hull.sourceObjects', hullSources);
    validateStringArray(hull, 'sourceCollections', 'hull.sourceCollections', issues, {
      required: false,
      pathLike: true,
    });

    const lods = getRecord(hull, 'lods', 'hull.lods', issues);
    if (lods !== null) {
      for (const lodKey of LOD_KEYS) {
        const lodPath = getString(lods, lodKey, `hull.lods.${lodKey}`, issues);
        if (lodPath !== null) {
          validateRelativePath(lodPath, `hull.lods.${lodKey}`, issues);
          if (assetId !== null) {
            validateAssetFileName(lodPath, `${assetId}_${lodKey}.fbx`, `hull.lods.${lodKey}`, issues);
          }
        }
      }
    }

    const collision = getRecord(hull, 'collision', 'hull.collision', issues);
    if (collision !== null) {
      if (collision.owner !== 'hull') pushIssue(issues, 'hull.collision.owner', 'Hull 碰撞所有者必须是 hull');
      const strategy = getString(collision, 'strategy', 'hull.collision.strategy', issues);
      const strategyValid = strategy !== null && isOneOf(strategy, HULL_COLLISION_STRATEGIES);
      if (strategy !== null && !strategyValid) {
        pushIssue(issues, 'hull.collision.strategy', '不支持的 Hull collision strategy');
      }
      const collisionPath = getOptionalString(collision, 'path');
      if (collisionPath !== null) {
        validateRelativePath(collisionPath, 'hull.collision.path', issues);
        if (assetId !== null) {
          validateAssetPath(
            collisionPath,
            `Collision/${assetId}_COLLISION.fbx`,
            'hull.collision.path',
            issues,
          );
        }
      }
      const hullCollisionSources = validateStringArray(collision, 'sourceObjects', 'hull.collision.sourceObjects', issues, {
        required: false,
      });
      if (strategyValid) {
        validateHullCollisionRules(
          strategy,
          collision.path !== undefined,
          collision.sourceObjects !== undefined,
          issues,
        );
      }
      if (hullCollisionSources !== null) {
        sourceObjectsByOwner.set('hull.collision.sourceObjects', hullCollisionSources);
      }
    }
  }

  const rawParts = getArray(data, 'parts', 'parts', issues) ?? [];
  const partIds: string[] = [];
  const parts: { readonly id: string; readonly parent: string; readonly exportName: string }[] = [];
  rawParts.forEach((part, index) => {
    const result = validatePart(part, index, assetId, issues, sourceObjectsByOwner);
    if (result !== null) {
      partIds.push(result.id);
      parts.push(result);
    }
  });
  validateUniqueIds(partIds, 'parts', issues);
  validateUniqueExportNames(parts, issues);

  const rawSockets = getArray(data, 'sockets', 'sockets', issues) ?? [];
  const socketIds: string[] = [];
  const sockets: { readonly id: string; readonly parent: string }[] = [];
  rawSockets.forEach((socket, index) => {
    const result = validateSocket(socket, index, issues);
    if (result !== null) {
      socketIds.push(result.id);
      sockets.push(result);
    }
  });
  validateUniqueIds(socketIds, 'sockets', issues);
  validateParentReferences(parts, sockets, issues);

  const validation = getRecord(data, 'validation', 'validation', issues);
  if (validation !== null) {
    const requiredParts = validateStringReferenceArray(
      validation,
      'requiredParts',
      'validation.requiredParts',
      issues,
    );
    const requiredSockets = validateStringReferenceArray(
      validation,
      'requiredSockets',
      'validation.requiredSockets',
      issues,
    );
    if (requiredParts !== null) {
      validateRequiredReferences(requiredParts, new Set(partIds), 'validation.requiredParts', issues);
    }
    if (requiredSockets !== null) {
      validateRequiredReferences(
        requiredSockets,
        new Set(socketIds),
        'validation.requiredSockets',
        issues,
      );
    }
  }

  validateSourceOwnership(sourceObjectsByOwner, issues);
  return issues;
}

export function validateSubmarineAssembly(data: unknown): readonly SubmarineAssemblyValidationIssue[] {
  return [...validateSubmarineAssemblySchema(data), ...validateSubmarineAssemblyContract(data)];
}

export function assertSubmarineAssembly(data: unknown): asserts data is SubmarineAssembly {
  const issues = validateSubmarineAssembly(data);
  if (issues.length > 0) {
    const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Invalid submarine assembly:\n${summary}`);
  }
}
