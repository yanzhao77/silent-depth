import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import { validateSubmarineAssembly, type SubmarineAssembly } from './submarineAssembly.ts';

export type AuditMode = 'inventory-only' | 'assembly';
export type AuditStatus = 'PASS' | 'WARNING' | 'ERROR' | 'SKIPPED' | 'NOT_VERIFIED';

export const SUBMARINE_AUDIT_REPORT_VERSION = 1;

export const SUBMARINE_AUDIT_THRESHOLDS = {
  zeroLengthEdgeMeters: 1e-6,
  degenerateFaceAreaSquareMeters: 1e-10,
  nearZeroScale: 1e-6,
  unappliedScaleTolerance: 1e-4,
  normalizedAxisTolerance: 0.001,
  farAnchorHullDiagonalMultiplier: 2,
  exampleLimit: 12,
} as const;

export const SUBMARINE_AUDIT_EXIT_CODES = {
  ok: 0,
  auditIssues: 1,
  inputError: 2,
  assemblyInvalid: 3,
  blenderOpenFailed: 4,
  internalError: 5,
} as const;

export interface SubmarineAuditCliOptions {
  readonly master: string;
  readonly assembly?: string;
  readonly output: string;
  readonly summaryOutput?: string;
  readonly inventoryOnly: boolean;
  readonly failOnWarning: boolean;
  readonly blender?: string;
  readonly help: boolean;
}

export interface CliParseResult {
  readonly options?: SubmarineAuditCliOptions;
  readonly errors: readonly string[];
}

export interface ValidatedAuditInputs {
  readonly master: string;
  readonly assembly?: string;
  readonly output: string;
  readonly summaryOutput?: string;
  readonly mode: AuditMode;
  readonly failOnWarning: boolean;
  readonly blender?: string;
  readonly assemblyData?: SubmarineAssembly;
}

export interface FileFingerprint {
  readonly path: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

export interface AuditIssue {
  readonly ruleId: string;
  readonly status: AuditStatus;
  readonly objectName?: string;
  readonly collectionName?: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly blocksExport: boolean;
}

export interface AuditSceneObject {
  readonly name: string;
  readonly type: string;
  readonly parent?: string | null;
  readonly collections?: readonly string[];
  readonly hidden?: boolean;
  readonly hideRender?: boolean;
}

export interface AuditSceneCollection {
  readonly name: string;
  readonly path: string;
  readonly objects: readonly string[];
}

export interface AuditSceneSnapshot {
  readonly objects: readonly AuditSceneObject[];
  readonly collections: readonly AuditSceneCollection[];
}

export interface ObjectMatchResult {
  readonly owner: string;
  readonly reference: string;
  readonly matchedObjects: readonly string[];
  readonly status: AuditStatus;
  readonly message: string;
}

export interface OwnershipAuditResult {
  readonly matches: readonly ObjectMatchResult[];
  readonly issues: readonly AuditIssue[];
}

export interface SubmarineAuditAssemblyInput {
  readonly hull: {
    readonly sourceObjects: readonly string[];
    readonly sourceCollections?: readonly string[];
    readonly collision: { readonly sourceObjects?: readonly string[] };
  };
  readonly parts: readonly {
    readonly id: string;
    readonly sourceObjects?: readonly string[];
    readonly sourceCollections?: readonly string[];
    readonly pivotAnchor: string;
    readonly motion: { readonly axis: readonly [number, number, number] };
  }[];
  readonly sockets: readonly {
    readonly id: string;
    readonly sourceAnchor: string;
    readonly parent: string;
  }[];
}

export interface MeshVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MeshFixture {
  readonly objectName: string;
  readonly vertices: readonly MeshVertex[];
  readonly edges: readonly (readonly [number, number])[];
  readonly faces: readonly (readonly number[])[];
  readonly materialSlots: readonly (string | null)[];
  readonly faceMaterialIndices: readonly number[];
  readonly scale: readonly [number, number, number];
  readonly meshDataName?: string;
}

export interface MeshQualityResult {
  readonly issues: readonly AuditIssue[];
}

type MutableCliOptions = {
  master?: string;
  assembly?: string;
  output?: string;
  summaryOutput?: string;
  inventoryOnly: boolean;
  failOnWarning: boolean;
  blender?: string;
  help: boolean;
};

const VALUE_FLAGS = new Set(['--master', '--assembly', '--output', '--summary-output', '--blender']);
const BOOLEAN_FLAGS = new Set(['--inventory-only', '--fail-on-warning', '--help', '-h']);

export function parseSubmarineAuditArgs(argv: readonly string[]): CliParseResult {
  const errors: string[] = [];
  const options: MutableCliOptions = {
    inventoryOnly: false,
    failOnWarning: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (BOOLEAN_FLAGS.has(token)) {
      if (token === '--inventory-only') options.inventoryOnly = true;
      if (token === '--fail-on-warning') options.failOnWarning = true;
      if (token === '--help' || token === '-h') options.help = true;
      continue;
    }
    if (VALUE_FLAGS.has(token)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        errors.push(`${token} 缺少参数值`);
        continue;
      }
      index += 1;
      if (token === '--master') options.master = value;
      if (token === '--assembly') options.assembly = value;
      if (token === '--output') options.output = value;
      if (token === '--summary-output') options.summaryOutput = value;
      if (token === '--blender') options.blender = value;
      continue;
    }
    errors.push(`未知参数：${token}`);
  }

  if (options.help) {
    return {
      errors,
      options: {
        master: options.master ?? '',
        assembly: options.assembly,
        output: options.output ?? '',
        summaryOutput: options.summaryOutput,
        inventoryOnly: options.inventoryOnly,
        failOnWarning: options.failOnWarning,
        blender: options.blender,
        help: true,
      },
    };
  }

  if (options.master === undefined) errors.push('缺少必需参数 --master');
  if (options.output === undefined) errors.push('缺少必需参数 --output');
  if (!options.inventoryOnly && options.assembly === undefined) {
    errors.push('完整 Assembly 审计必须提供 --assembly；没有真实 Assembly 时请使用 --inventory-only');
  }

  if (errors.length > 0 || options.master === undefined || options.output === undefined) {
    return { errors };
  }

  return {
    errors: [],
    options: {
      master: options.master,
      assembly: options.assembly,
      output: options.output,
      summaryOutput: options.summaryOutput,
      inventoryOnly: options.inventoryOnly,
      failOnWarning: options.failOnWarning,
      blender: options.blender,
      help: false,
    },
  };
}

export function assertPathHasNoTraversal(pathValue: string, label: string): void {
  const normalized = resolve(pathValue);
  const segments = normalized.split(/[\\/]+/);
  if (segments.includes('..')) throw new Error(`${label} 规范化后仍包含目录穿越`);
}

export function validateSubmarineAuditInputs(options: SubmarineAuditCliOptions): ValidatedAuditInputs {
  if (options.help) {
    throw new Error('help 模式不需要校验输入');
  }
  const master = resolve(options.master);
  const output = resolve(options.output);
  const summaryOutput = options.summaryOutput === undefined ? undefined : resolve(options.summaryOutput);
  const blender = options.blender === undefined ? undefined : resolve(options.blender);
  const mode: AuditMode = options.inventoryOnly ? 'inventory-only' : 'assembly';

  assertPathHasNoTraversal(master, '--master');
  assertPathHasNoTraversal(output, '--output');
  if (summaryOutput !== undefined) assertPathHasNoTraversal(summaryOutput, '--summary-output');

  if (!isAbsolute(options.master)) throw new Error('--master 必须是绝对路径');
  if (!existsSync(master)) throw new Error(`MASTER 不存在：${master}`);
  if (extname(master) !== '.blend') throw new Error('--master 必须指向 .blend 文件');

  let assembly: string | undefined;
  let assemblyData: SubmarineAssembly | undefined;
  if (mode === 'assembly') {
    if (options.assembly === undefined) throw new Error('完整 Assembly 审计必须提供 --assembly');
    assembly = resolve(options.assembly);
    assertPathHasNoTraversal(assembly, '--assembly');
    if (!existsSync(assembly)) throw new Error(`Assembly 不存在：${assembly}`);
    if (extname(assembly) !== '.json') throw new Error('--assembly 必须指向 JSON 文件');
    assemblyData = loadAndValidateAssembly(assembly);
    const expectedMasterName = `${assemblyData.assetId}_MASTER.blend`;
    if (basename(master) !== expectedMasterName) {
      throw new Error(`Assembly assetId 与 MASTER 文件名不匹配：期望 ${expectedMasterName}`);
    }
  }

  return {
    master,
    assembly,
    output,
    summaryOutput,
    mode,
    failOnWarning: options.failOnWarning,
    blender,
    assemblyData,
  };
}

export function loadAndValidateAssembly(pathValue: string): SubmarineAssembly {
  const parsed = JSON.parse(readFileSync(pathValue, 'utf-8')) as unknown;
  const issues = validateSubmarineAssembly(parsed);
  if (issues.length > 0) {
    const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new AssemblyValidationError(`Assembly 契约无效：\n${details}`);
  }
  return parsed as SubmarineAssembly;
}

export class AssemblyValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AssemblyValidationError';
  }
}

export function statFingerprintWithoutHash(pathValue: string): Omit<FileFingerprint, 'sha256'> {
  const stat = statSync(pathValue);
  return {
    path: resolve(pathValue),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export function compareFingerprints(before: FileFingerprint, after: FileFingerprint): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (before.sha256 !== after.sha256) {
    issues.push(makeIssue('SUBMOD-READONLY-SHA256', 'ERROR', 'MASTER SHA-256 在审计前后发生变化', {
      before: before.sha256,
      after: after.sha256,
    }));
  }
  if (before.sizeBytes !== after.sizeBytes) {
    issues.push(makeIssue('SUBMOD-READONLY-SIZE', 'ERROR', 'MASTER 文件大小在审计前后发生变化', {
      before: before.sizeBytes,
      after: after.sizeBytes,
    }));
  }
  if (before.mtimeMs !== after.mtimeMs) {
    issues.push(makeIssue('SUBMOD-READONLY-MTIME', 'ERROR', 'MASTER 修改时间在审计前后发生变化', {
      before: before.mtimeMs,
      after: after.mtimeMs,
    }));
  }
  return issues;
}

export function auditAssemblyOwnership(
  scene: AuditSceneSnapshot,
  assembly: SubmarineAuditAssemblyInput,
): OwnershipAuditResult {
  const objectsByName = new Map(scene.objects.map((object) => [object.name, object]));
  const collectionsByPath = new Map(scene.collections.map((collection) => [collection.path, collection]));
  const matches: ObjectMatchResult[] = [];
  const issues: AuditIssue[] = [];
  const ownersByObject = new Map<string, string>();

  const addOwnerMatches = (owner: string, references: readonly string[] | undefined): readonly string[] => {
    const matchedOwnedObjects: string[] = [];
    for (const reference of references ?? []) {
      const matchedObjects = matchObjectReference(reference, objectsByName);
      const hasWildcard = /[*?[\]]/.test(reference);
      matches.push({
        owner,
        reference,
        matchedObjects,
        status: matchedObjects.length > 0 ? (hasWildcard ? 'WARNING' : 'PASS') : 'ERROR',
        message:
          matchedObjects.length > 0
            ? hasWildcard
              ? '源对象使用通配匹配，后续正式 Assembly 应优先使用精确对象名'
              : '源对象匹配成功'
            : '源对象匹配为空',
      });
      if (matchedObjects.length === 0) {
        issues.push(makeIssue('SUBMOD-021-EMPTY_OBJECT_MATCH', 'ERROR', '源对象匹配为空', {
          owner,
          reference,
        }));
      }
      if (hasWildcard) {
        issues.push(makeIssue('SUBMOD-021-WILDCARD_OBJECT_MATCH', 'WARNING', '源对象使用通配匹配', {
          owner,
          reference,
          matchedObjects,
        }));
      }
      for (const objectName of matchedObjects) matchedOwnedObjects.push(objectName);
    }
    return matchedOwnedObjects;
  };

  const addCollectionMatches = (owner: string, references: readonly string[] | undefined): readonly string[] => {
    const matchedOwnedObjects: string[] = [];
    for (const reference of references ?? []) {
      const collection = collectionsByPath.get(reference);
      const matchedObjects = collection === undefined ? [] : stableSortStrings(collection.objects);
      matches.push({
        owner,
        reference,
        matchedObjects,
        status: matchedObjects.length > 0 ? 'PASS' : 'ERROR',
        message: matchedObjects.length > 0 ? 'Collection 匹配成功' : 'Collection 匹配为空或不存在',
      });
      if (matchedObjects.length === 0) {
        issues.push(makeIssue('SUBMOD-021-EMPTY_COLLECTION_MATCH', 'ERROR', 'Collection 匹配为空或不存在', {
          owner,
          reference,
        }));
      }
      for (const objectName of matchedObjects) matchedOwnedObjects.push(objectName);
    }
    return matchedOwnedObjects;
  };

  const registerOwnership = (owner: string, objectNames: readonly string[]): void => {
    for (const objectName of objectNames) {
      const existingOwner = ownersByObject.get(objectName);
      if (existingOwner !== undefined && existingOwner !== owner) {
        issues.push(makeIssue('SUBMOD-021-DUPLICATE_OWNERSHIP', 'ERROR', '同一源对象被重复拥有', {
          objectName,
          firstOwner: existingOwner,
          owner,
        }));
      }
      ownersByObject.set(objectName, owner);
    }
  };

  const hullObjects = [
    ...addOwnerMatches('hull', assembly.hull.sourceObjects),
    ...addCollectionMatches('hull', assembly.hull.sourceCollections),
  ];
  registerOwnership('hull', hullObjects);

  if (assembly.hull.collision.sourceObjects !== undefined) {
    for (const objectName of addOwnerMatches('hull.collision', assembly.hull.collision.sourceObjects)) {
      const sceneObject = objectsByName.get(objectName);
      if (sceneObject !== undefined && sceneObject.type !== 'MESH') {
        issues.push(makeIssue('SUBMOD-021-COLLISION_TYPE', 'ERROR', 'Hull Collision 源对象必须是 Mesh', {
          objectName,
          type: sceneObject.type,
        }));
      }
    }
  }

  for (const part of stableSortBy(assembly.parts, (partItem) => partItem.id)) {
    const owner = `part:${part.id}`;
    const partObjects = [
      ...addOwnerMatches(owner, part.sourceObjects),
      ...addCollectionMatches(owner, part.sourceCollections),
    ];
    registerOwnership(owner, partObjects);
    for (const objectName of partObjects) {
      const sceneObject = objectsByName.get(objectName);
      if (sceneObject === undefined) continue;
      if (sceneObject.type !== 'MESH') {
        issues.push(makeIssue('SUBMOD-021-SOURCE_OBJECT_TYPE', 'ERROR', 'Part 源对象必须是 Mesh', {
          owner,
          objectName,
          type: sceneObject.type,
        }));
      }
      if (isCollisionName(objectName)) {
        issues.push(makeIssue('SUBMOD-021-COLLISION_VISUAL_OWNERSHIP', 'ERROR', 'Collision 对象被可视 Part 错误拥有', {
          owner,
          objectName,
        }));
      }
    }
    const pivot = objectsByName.get(part.pivotAnchor);
    if (pivot === undefined) {
      issues.push(makeIssue('SUBMOD-023-PIVOT_MISSING', 'ERROR', 'Part Pivot Anchor 不存在', {
        partId: part.id,
        pivotAnchor: part.pivotAnchor,
      }));
    } else if (pivot.type !== 'EMPTY') {
      issues.push(makeIssue('SUBMOD-023-PIVOT_TYPE', 'WARNING', 'Part Pivot Anchor 推荐使用 Empty', {
        partId: part.id,
        pivotAnchor: part.pivotAnchor,
        type: pivot.type,
      }));
    }
    issues.push(...auditAxis(part.id, part.motion.axis));
  }

  const knownPartIds = new Set(assembly.parts.map((part) => part.id));
  for (const socket of stableSortBy(assembly.sockets, (socketItem) => socketItem.id)) {
    const anchor = objectsByName.get(socket.sourceAnchor);
    if (anchor === undefined) {
      issues.push(makeIssue('SUBMOD-023-SOCKET_MISSING', 'ERROR', 'Socket Anchor 不存在', {
        socketId: socket.id,
        sourceAnchor: socket.sourceAnchor,
      }));
    }
    if (socket.parent !== 'root' && !knownPartIds.has(socket.parent)) {
      issues.push(makeIssue('SUBMOD-023-SOCKET_PARENT_MISSING', 'ERROR', 'Socket parent 不存在', {
        socketId: socket.id,
        parent: socket.parent,
      }));
    }
  }

  const sortedMatches = stableSortBy(matches, (match) => `${match.owner}:${match.reference}`);
  return { matches: sortedMatches, issues: stableSortIssues(issues) };
}

export function auditMeshFixtures(meshes: readonly MeshFixture[]): MeshQualityResult {
  const issues: AuditIssue[] = [];
  const meshUsers = new Map<string, string[]>();

  for (const mesh of stableSortBy(meshes, (meshItem) => meshItem.objectName)) {
    if (mesh.meshDataName !== undefined) {
      const users = meshUsers.get(mesh.meshDataName) ?? [];
      users.push(mesh.objectName);
      meshUsers.set(mesh.meshDataName, users);
    }

    if (mesh.vertices.length === 0) {
      issues.push(objectIssue('SUBMOD-022-NO_VERTICES', 'ERROR', mesh.objectName, 'Mesh 没有顶点', {}));
    }
    if (mesh.faces.length === 0) {
      issues.push(objectIssue('SUBMOD-022-NO_FACES', 'WARNING', mesh.objectName, '可视 Mesh 没有面', {}));
    }
    const nonFiniteVertices = limitedIndices(
      mesh.vertices
        .map((vertex, index) => ({ vertex, index }))
        .filter(({ vertex }) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z))
        .map(({ index }) => index),
    );
    if (nonFiniteVertices.length > 0) {
      issues.push(
        objectIssue('SUBMOD-022-NON_FINITE_VERTEX', 'ERROR', mesh.objectName, 'Mesh 存在非有限顶点坐标', {
          vertexIndices: nonFiniteVertices,
        }),
      );
    }
    const zeroLengthEdges = limitedIndices(
      mesh.edges
        .map((edge, index) => ({ edge, index }))
        .filter(({ edge }) => edgeLength(mesh.vertices, edge) <= SUBMARINE_AUDIT_THRESHOLDS.zeroLengthEdgeMeters)
        .map(({ index }) => index),
    );
    if (zeroLengthEdges.length > 0) {
      issues.push(
        objectIssue('SUBMOD-022-ZERO_LENGTH_EDGE', 'WARNING', mesh.objectName, 'Mesh 存在零长度边', {
          edgeIndices: zeroLengthEdges,
        }),
      );
    }
    const degenerateFaces = limitedIndices(
      mesh.faces
        .map((face, index) => ({ face, index }))
        .filter(({ face }) => polygonArea(mesh.vertices, face) <= SUBMARINE_AUDIT_THRESHOLDS.degenerateFaceAreaSquareMeters)
        .map(({ index }) => index),
    );
    if (degenerateFaces.length > 0) {
      issues.push(
        objectIssue('SUBMOD-022-DEGENERATE_FACE', 'WARNING', mesh.objectName, 'Mesh 存在退化面或接近零面积面', {
          faceIndices: degenerateFaces,
        }),
      );
    }
    if (mesh.materialSlots.length === 0) {
      issues.push(objectIssue('SUBMOD-022-NO_MATERIAL_SLOT', 'WARNING', mesh.objectName, 'Mesh 未分配材质槽', {}));
    }
    const emptyMaterialFaces = limitedIndices(
      mesh.faceMaterialIndices
        .map((materialIndex, faceIndex) => ({ materialIndex, faceIndex }))
        .filter(({ materialIndex }) => materialIndex < 0 || mesh.materialSlots[materialIndex] == null)
        .map(({ faceIndex }) => faceIndex),
    );
    if (emptyMaterialFaces.length > 0) {
      issues.push(
        objectIssue('SUBMOD-022-EMPTY_MATERIAL_SLOT_FACE', 'WARNING', mesh.objectName, '面引用空材质槽', {
          faceIndices: emptyMaterialFaces,
        }),
      );
    }
    const negativeAxes = ['x', 'y', 'z'].filter((_, index) => mesh.scale[index] !== undefined && mesh.scale[index]! < 0);
    if (negativeAxes.length > 0) {
      issues.push(objectIssue('SUBMOD-022-NEGATIVE_SCALE', 'WARNING', mesh.objectName, '对象存在负尺度', { axes: negativeAxes }));
    }
    const nearZeroAxes = ['x', 'y', 'z'].filter(
      (_, index) => mesh.scale[index] !== undefined && Math.abs(mesh.scale[index]!) <= SUBMARINE_AUDIT_THRESHOLDS.nearZeroScale,
    );
    if (nearZeroAxes.length > 0) {
      issues.push(objectIssue('SUBMOD-022-NEAR_ZERO_SCALE', 'ERROR', mesh.objectName, '对象存在接近零的缩放', { axes: nearZeroAxes }));
    }
    const unappliedAxes = ['x', 'y', 'z'].filter(
      (_, index) => mesh.scale[index] !== undefined && Math.abs(Math.abs(mesh.scale[index]!) - 1) > SUBMARINE_AUDIT_THRESHOLDS.unappliedScaleTolerance,
    );
    if (unappliedAxes.length > 0) {
      issues.push(objectIssue('SUBMOD-022-UNAPPLIED_SCALE', 'WARNING', mesh.objectName, '对象存在未应用的非单位缩放', { axes: unappliedAxes }));
    }
  }

  for (const [meshDataName, users] of meshUsers) {
    if (users.length > 1) {
      issues.push(makeIssue('SUBMOD-022-DUPLICATE_MESH_DATABLOCK', 'WARNING', '重复 Mesh 数据块实例', {
        meshDataName,
        objects: stableSortStrings(users),
      }));
    }
  }

  return { issues: stableSortIssues(issues) };
}

export function makeInventoryOnlyAssemblySkippedIssue(): AuditIssue {
  return makeIssue('SUBMOD-021-025-SKIPPED_MISSING_ASSEMBLY', 'SKIPPED', '缺少真实 Assembly，Assembly 相关检查已跳过', {
    reason: 'SKIPPED_MISSING_ASSEMBLY',
  });
}

export function summarizeStatuses(issues: readonly AuditIssue[]): { readonly errors: number; readonly warnings: number; readonly skipped: number; readonly notVerified: number } {
  return {
    errors: issues.filter((issue) => issue.status === 'ERROR').length,
    warnings: issues.filter((issue) => issue.status === 'WARNING').length,
    skipped: issues.filter((issue) => issue.status === 'SKIPPED').length,
    notVerified: issues.filter((issue) => issue.status === 'NOT_VERIFIED').length,
  };
}

function matchObjectReference(reference: string, objectsByName: ReadonlyMap<string, AuditSceneObject>): readonly string[] {
  if (!/[*?[\]]/.test(reference)) return objectsByName.has(reference) ? [reference] : [];
  const pattern = globToRegExp(reference);
  return stableSortStrings([...objectsByName.keys()].filter((name) => pattern.test(name)));
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
  return new RegExp(`^${escaped}$`);
}

function isCollisionName(objectName: string): boolean {
  return objectName.startsWith('UCX_') || objectName.startsWith('UBX_') || objectName.startsWith('USP_') || objectName.startsWith('UCP_');
}

function auditAxis(partId: string, axis: readonly [number, number, number]): readonly AuditIssue[] {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length <= SUBMARINE_AUDIT_THRESHOLDS.zeroLengthEdgeMeters) {
    return [makeIssue('SUBMOD-023-ZERO_LENGTH_AXIS', 'ERROR', '运动轴为零长度', { partId, axis, length })];
  }
  if (Math.abs(length - 1) > SUBMARINE_AUDIT_THRESHOLDS.normalizedAxisTolerance) {
    return [makeIssue('SUBMOD-023-NON_NORMALIZED_AXIS', 'WARNING', '运动轴未归一化', { partId, axis, length })];
  }
  return [];
}

function edgeLength(vertices: readonly MeshVertex[], edge: readonly [number, number]): number {
  const first = vertices[edge[0]];
  const second = vertices[edge[1]];
  if (first === undefined || second === undefined) return 0;
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function polygonArea(vertices: readonly MeshVertex[], face: readonly number[]): number {
  if (face.length < 3) return 0;
  const originIndex = face[0];
  if (originIndex === undefined) return 0;
  const origin = vertices[originIndex];
  if (origin === undefined) return 0;
  let area = 0;
  for (let index = 1; index < face.length - 1; index += 1) {
    const secondIndex = face[index];
    const thirdIndex = face[index + 1];
    if (secondIndex === undefined || thirdIndex === undefined) return 0;
    const second = vertices[secondIndex];
    const third = vertices[thirdIndex];
    if (second === undefined || third === undefined) return 0;
    const ax = second.x - origin.x;
    const ay = second.y - origin.y;
    const az = second.z - origin.z;
    const bx = third.x - origin.x;
    const by = third.y - origin.y;
    const bz = third.z - origin.z;
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    area += Math.hypot(cx, cy, cz) * 0.5;
  }
  return area;
}

function limitedIndices(indices: readonly number[]): readonly number[] {
  return indices.slice(0, SUBMARINE_AUDIT_THRESHOLDS.exampleLimit);
}

function makeIssue(
  ruleId: string,
  status: AuditStatus,
  message: string,
  context: Readonly<Record<string, unknown>>,
): AuditIssue {
  return { ruleId, status, message, context, blocksExport: status === 'ERROR' };
}

function objectIssue(
  ruleId: string,
  status: AuditStatus,
  objectName: string,
  message: string,
  context: Readonly<Record<string, unknown>>,
): AuditIssue {
  return { ruleId, status, objectName, message, context, blocksExport: status === 'ERROR' };
}

function stableSortBy<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), 'en'));
}

function stableSortStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

function stableSortIssues(issues: readonly AuditIssue[]): readonly AuditIssue[] {
  return stableSortBy(issues, (issue) => `${issue.ruleId}:${issue.objectName ?? ''}:${issue.collectionName ?? ''}:${issue.message}`);
}
