#!/usr/bin/env node
/**
 * 潜艇资产管线的轻量校验（不需要 Blender，也不需要 UE 编辑器）。
 *
 * 覆盖三类可以在任何机器上复现的失败：
 *   1. 两个资产管线 CLI 的契约（--help / 未知参数 / 缺必需参数）；
 *   2. 潜艇清单（SilentDepth_Assets/Manifest/submarine_manifest.json）的结构与已声明哈希；
 *   3. 清单与 UE 平台资产表（Config/SilentDepth/platform_assets.json）的交叉引用。
 *
 * 用法：
 *   node tools/ue4/check-asset-pipeline.mjs            # 有错误 → 退出码 1
 *   node tools/ue4/check-asset-pipeline.mjs --strict   # 警告也视为失败
 *   node tools/ue4/check-asset-pipeline.mjs --no-hash  # 跳过哈希比对（只查结构与交叉引用）
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSET_ROOT = join(ROOT, 'SilentDepth_Assets');
const SUBMARINE_MANIFEST = join(ASSET_ROOT, 'Manifest', 'submarine_manifest.json');
const PLATFORM_ASSETS = join(
  ROOT,
  'ue4',
  'SilentDepthUE',
  'Config',
  'SilentDepth',
  'platform_assets.json',
);
const AUDIT_CLI = join(
  ASSET_ROOT,
  'Templates',
  'Submarine',
  'Scripts',
  'submarine_blender_audit_cli.mjs',
);
const MUZZLE_CLI = join(
  ASSET_ROOT,
  'Templates',
  'Submarine',
  'Scripts',
  'submarine_muzzle_derivation_cli.mjs',
);

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const skipHash = argv.includes('--no-hash');

const errors = [];
const warnings = [];
let passes = 0;

function pass(label) {
  passes += 1;
  console.log(`  通过  ${label}`);
}

function fail(label) {
  errors.push(label);
  console.log(`  错误  ${label}`);
}

function warn(label) {
  warnings.push(label);
  console.log(`  警告  ${label}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function runCli(path, args) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', path, ...args],
    { encoding: 'utf-8', timeout: 60_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function checkCliContract(name, path, helpNeedle) {
  if (!existsSync(path)) {
    fail(`${name}：脚本不存在 ${path}`);
    return;
  }
  pass(`${name}：脚本存在`);

  const help = runCli(path, ['--help']);
  if (help.status === 0 && help.output.includes(helpNeedle)) {
    pass(`${name}：--help 退出码 0 并打印用法`);
  } else {
    fail(`${name}：--help 期望退出码 0 且包含"${helpNeedle}"，实际 ${help.status}`);
  }

  const bogus = runCli(path, ['--silent-depth-not-a-flag']);
  if (bogus.status === 2) {
    pass(`${name}：未知参数退出码 2`);
  } else {
    fail(`${name}：未知参数期望退出码 2，实际 ${bogus.status}`);
  }
}

/**
 * 无效 Assembly 必须在启动 Blender 之前被 schema 拒绝（退出码 3）。
 * 这条同时守住 submarineAssembly.ts 的 ajv 依赖：依赖缺失时会变成导入失败而不是 3。
 */
function checkAssemblyContractGate() {
  const dir = mkdtempSync(join(tmpdir(), 'sd-asset-pipeline-'));
  try {
    const master = join(dir, 'ZZ_TEST_MASTER.blend');
    const assembly = join(dir, 'ZZ_TEST_ASSEMBLY.json');
    writeFileSync(master, 'not a blend');
    writeFileSync(assembly, JSON.stringify({ assetId: 'ZZ_TEST' }));

    const result = runCli(AUDIT_CLI, [
      '--master',
      master,
      '--assembly',
      assembly,
      '--output',
      join(dir, 'out.json'),
    ]);
    if (result.status === 3 && result.output.includes('Assembly 契约无效')) {
      pass('潜艇审计 CLI：无效 Assembly 在启动 Blender 前以退出码 3 拒绝');
    } else {
      fail(
        `潜艇审计 CLI：无效 Assembly 期望退出码 3 且报"Assembly 契约无效"，实际 ${result.status}`,
      );
    }
    if (existsSync(join(dir, 'out.json'))) {
      fail('潜艇审计 CLI：被拒绝的 Assembly 不应产生报告文件');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 清单里的路径分隔符混用（macOS 用 /，Windows 用 \），统一后再解析。 */
function toRelativeSegments(key) {
  return key.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

/**
 * 清单到磁盘目录只有一条规则，与 tools/assets/update_submarine_manifest.py 相同：
 * 用 asset_id 找 <hull>/Documentation/<asset_id>_SPEC.json，它所在的目录就是艇目录。
 * class 只是给人看的显示名（可以含空格，例如 "Los Angeles"），不参与路径解析；
 * 目录名用下划线（Los_Angeles），也不参与匹配。
 */
function resolveHullRoot(entry) {
  const parent = join(ASSET_ROOT, 'Submarines', entry.type, entry.country);
  if (!existsSync(parent)) {
    return { folder: null, reason: `目录不存在 ${parent}` };
  }
  const specName = `${entry.asset_id}_SPEC.json`;
  const all = readdirSync(parent, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => existsSync(join(parent, name, 'Documentation', specName)));
  // 历史副本（_previous_ / _archive / _backup / _old）不参与解析：它们是本地留档，
  // 但会带一份同名 SPEC，从而让"asset_id 定位艇目录"这条规则出现两个答案。
  const historical = all.filter((name) => /(_previous_|_archive|_backup|_old)/i.test(name));
  const matches = all.filter((name) => !historical.includes(name));
  if (matches.length === 1) {
    return { folder: join(parent, matches[0]), reason: null, historical };
  }
  if (matches.length === 0) {
    return {
      folder: null,
      historical,
      reason:
        all.length > 0
          ? `在 ${parent} 只有历史副本包含 Documentation/${specName}：${historical.join(', ')}`
          : `在 ${parent} 找不到包含 Documentation/${specName} 的艇目录`,
    };
  }
  return {
    folder: null,
    historical,
    reason: `在 ${parent} 有多个目录包含 ${specName}：${matches.join(', ')}`,
  };
}

function checkManifest() {
  if (!existsSync(SUBMARINE_MANIFEST)) {
    fail(`潜艇清单不存在 ${SUBMARINE_MANIFEST}`);
    return { assetIds: new Set() };
  }

  let manifest;
  try {
    manifest = readJson(SUBMARINE_MANIFEST);
  } catch (error) {
    fail(`潜艇清单无法解析：${error.message}`);
    return { assetIds: new Set() };
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    fail('潜艇清单缺少非空 assets 数组');
    return { assetIds: new Set() };
  }
  pass(`潜艇清单解析成功（${manifest.assets.length} 条）`);

  const assetIds = new Set();
  let hashedFiles = 0;
  let hashMismatches = 0;
  let missingFiles = 0;

  for (const [index, entry] of manifest.assets.entries()) {
    const label = entry?.asset_id ?? `#${index}`;
    if (typeof label !== 'string' || label.trim() === '') {
      fail(`第 ${index} 条缺少 asset_id`);
      continue;
    }
    if (assetIds.has(label)) {
      fail(`asset_id 重复：${label}`);
      continue;
    }
    assetIds.add(label);

    for (const field of ['country', 'type', 'class']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        fail(`${label}：缺少 ${field}`);
      }
    }
    if (!Number.isInteger(entry.tier) || entry.tier <= 0) {
      fail(`${label}：tier 必须是正整数，实际 ${JSON.stringify(entry.tier)}`);
    }

    const declared = entry.sha256;
    const hasHashes =
      declared !== null && typeof declared === 'object' && Object.keys(declared).length > 0;
    if (!hasHashes) {
      if (entry.status === 'PLANNED') {
        continue;
      }
      warn(`${label}：status=${entry.status} 但没有 sha256 清单`);
      const located = resolveHullRoot(entry);
      if (located.folder === null) {
        fail(`${label}：${located.reason}`);
      } else if (located.historical?.length > 0) {
        warn(`${label}：忽略了历史副本目录 ${located.historical.join(', ')}`);
      }
      continue;
    }

    const located = resolveHullRoot(entry);
    if (located.folder === null) {
      fail(`${label}：${located.reason}`);
      continue;
    }
    if (located.historical?.length > 0) {
      warn(`${label}：忽略了历史副本目录 ${located.historical.join(', ')}`);
    }

    for (const [key, expected] of Object.entries(declared)) {
      const file = join(located.folder, ...toRelativeSegments(key));
      if (!existsSync(file) || !statSync(file).isFile()) {
        fail(`${label}：清单声明的文件不存在 ${key}`);
        missingFiles += 1;
        continue;
      }
      if (skipHash) {
        hashedFiles += 1;
        continue;
      }
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
      if (actual === expected) {
        hashedFiles += 1;
      } else {
        fail(`${label}：sha256 不匹配 ${key}`);
        hashMismatches += 1;
      }
    }
  }

  if (hashedFiles > 0 && hashMismatches === 0 && missingFiles === 0) {
    pass(
      skipHash
        ? `清单声明的 ${hashedFiles} 个文件都存在（已跳过哈希比对）`
        : `清单声明的 ${hashedFiles} 个文件哈希全部匹配`,
    );
  }
  return { assetIds };
}

function checkPlatformAssets(assetIds) {
  if (!existsSync(PLATFORM_ASSETS)) {
    fail(`UE 平台资产表不存在 ${PLATFORM_ASSETS}`);
    return;
  }

  let table;
  try {
    table = readJson(PLATFORM_ASSETS);
  } catch (error) {
    fail(`UE 平台资产表无法解析：${error.message}`);
    return;
  }

  const platforms = table.platforms ?? {};
  const ids = Object.keys(platforms);
  if (ids.length === 0) {
    fail('UE 平台资产表没有任何平台条目');
    return;
  }
  pass(`UE 平台资产表解析成功（${ids.length} 个平台）`);

  if (typeof table.fallbackPlatform !== 'string' || !platforms[table.fallbackPlatform]) {
    fail(`fallbackPlatform "${table.fallbackPlatform}" 不在 platforms 里`);
  } else {
    pass(`fallbackPlatform 有对应条目：${table.fallbackPlatform}`);
  }

  for (const id of ids) {
    if (!assetIds.has(id)) {
      fail(`UE 平台资产表引用了清单里不存在的平台：${id}`);
    }
    for (const [part, path] of Object.entries(platforms[id] ?? {})) {
      // 表里除了资产路径，还有 partOffsetsCm 这类数值字段；只有字符串才是路径。
      if (path !== null && typeof path === 'object') {
        continue;
      }
      if (typeof path !== 'string' || !path.startsWith('/Game/')) {
        fail(`${id}.${part} 必须是 /Game/ 路径，实际 ${JSON.stringify(path)}`);
      }
    }
  }
}

console.log('潜艇资产管线轻量校验');

console.log('\n[1/3] 资产管线 CLI 契约');
checkCliContract('潜艇审计 CLI', AUDIT_CLI, '用法');
checkCliContract('muzzle 推导 CLI', MUZZLE_CLI, '用法');
const noMaster = runCli(AUDIT_CLI, ['--output', join(ROOT, 'unused.json')]);
if (noMaster.status === 2) {
  pass('潜艇审计 CLI：缺少 --master 退出码 2');
} else {
  fail(`潜艇审计 CLI：缺少 --master 期望退出码 2，实际 ${noMaster.status}`);
}
checkAssemblyContractGate();

console.log('\n[2/3] 潜艇清单完整性与哈希');
const { assetIds } = checkManifest();

console.log('\n[3/3] 清单与 UE 平台资产表交叉引用');
checkPlatformAssets(assetIds);

const effectiveErrors = errors.length + (strict ? warnings.length : 0);
console.log(
  `\n结果：${passes} 通过 / ${warnings.length} 警告 / ${errors.length} 错误` +
    (skipHash ? '（已跳过哈希比对）' : ''),
);
if (effectiveErrors > 0) {
  console.log('校验失败。');
  process.exit(1);
}
console.log('校验通过。');
