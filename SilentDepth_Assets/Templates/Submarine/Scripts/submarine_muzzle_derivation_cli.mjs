#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MUZZLE_DERIVATION_CONSTANTS,
  assertAssemblyForMuzzleDerivation,
  updateTorpedoMuzzleTransform,
} from './lib/submarineMuzzleDerivation.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const WORKER = resolve(SCRIPT_DIR, 'submarine_muzzle_derivation_worker.py');
const VALUE_FLAGS = new Set([
  '--master',
  '--assembly',
  '--output',
  '--summary-output',
  '--blender',
  '--candidates',
]);
const BOOLEAN_FLAGS = new Set(['--dry-run', '--help', '-h']);

function printHelp() {
  console.log(`SilentDepth 潜艇鱼雷 muzzle 几何推导器

用法：
  node --experimental-strip-types SilentDepth_Assets/Templates/Submarine/Scripts/submarine_muzzle_derivation_cli.mjs \\
    --master /abs/path/RU_SSN_Yasen_MASTER.blend \\
    --assembly /abs/path/RU_SSN_Yasen_ASSEMBLY.json \\
    --output /abs/path/RU_SSN_Yasen_TORPEDO_MUZZLE_DERIVATION.json \\
    --summary-output /abs/path/RU_SSN_Yasen_TORPEDO_MUZZLE_DERIVATION.md

参数：
  --master           必需，正式 MASTER .blend 绝对路径
  --assembly         必需，Assembly JSON 路径
  --output           必需，JSON 推导报告输出路径
  --summary-output   可选，Markdown 摘要输出路径
  --candidates       可选，逗号分隔候选对象；默认 Yasen BowDoor 六件
  --dry-run          只生成推导报告，不更新 Assembly
  --blender          可选，Blender 5.2.1 CLI 路径；默认 ${DEFAULT_BLENDER}
  --help             显示帮助`);
}

function parseArgs(argv) {
  const options = { dryRun: false, help: false };
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (BOOLEAN_FLAGS.has(token)) {
      if (token === '--dry-run') options.dryRun = true;
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
      const key = token.slice(2).replaceAll('-', '_');
      options[key] = value;
      continue;
    }
    errors.push(`未知参数：${token}`);
  }
  if (!options.help) {
    for (const flag of ['master', 'assembly', 'output']) {
      if (options[flag] === undefined) errors.push(`缺少必需参数 --${flag.replaceAll('_', '-')}`);
    }
  }
  return { errors, options };
}

function sha256(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function fingerprint(path) {
  const stat = statSync(path);
  return {
    mtimeMs: stat.mtimeMs,
    path: resolve(path),
    sha256: sha256(path),
    sizeBytes: stat.size,
  };
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map((item) => sortDeep(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, sortDeep(value[key])]),
    );
  }
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sortDeep(data), null, 2)}\n`, 'utf-8');
}

function validatePath(path, label, extension) {
  if (!isAbsolute(path)) throw new Error(`${label} 必须是绝对路径`);
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`${label} 不存在：${resolved}`);
  if (!resolved.endsWith(extension)) throw new Error(`${label} 必须指向 ${extension} 文件`);
  return resolved;
}

function blenderVersion(blenderPath) {
  const output = execFileSync(blenderPath, ['--version'], { encoding: 'utf-8' });
  return output.split('\n').slice(0, 16).join('\n').trim();
}

function runBlender(inputs, before) {
  const blenderPath = inputs.blender ?? DEFAULT_BLENDER;
  if (!existsSync(blenderPath)) throw new Error(`找不到 Blender 可执行文件：${blenderPath}`);
  const versionText = blenderVersion(blenderPath);
  if (!versionText.startsWith('Blender 5.2.1 LTS'))
    throw new Error(`Blender 版本不是 5.2.1 LTS：\n${versionText}`);
  const args = [
    '--background',
    inputs.master,
    '--python',
    WORKER,
    '--',
    '--master',
    inputs.master,
    '--assembly',
    inputs.assembly,
    '--output',
    inputs.output,
    '--expected-sha256',
    before.sha256,
    '--candidates',
    inputs.candidates.join(','),
    '--radius',
    String(MUZZLE_DERIVATION_CONSTANTS.envelopeRadiusMeters),
    '--margin',
    String(MUZZLE_DERIVATION_CONSTANTS.clearanceMarginMeters),
    '--ray-distance',
    String(MUZZLE_DERIVATION_CONSTANTS.rayDistanceMeters),
    '--sweep-distance',
    String(MUZZLE_DERIVATION_CONSTANTS.sweepDistanceMeters),
    '--sweep-samples',
    String(MUZZLE_DERIVATION_CONSTANTS.sweepSampleCount),
  ];
  const result = spawnSync(blenderPath, args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 64 });
  if (result.status !== 0) {
    throw new Error(
      `Blender muzzle 推导失败，退出码 ${result.status ?? 'unknown'}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`,
    );
  }
  return { blenderPath, versionText };
}

function selectedTransform(report) {
  const selected = report.selected;
  return {
    direction: selected.direction.direction,
    rotationDegrees: [0, 0, 0],
    scale: [1, 1, 1],
    sourceObject: selected.objectName,
    translation: selected.muzzleOrigin,
  };
}

function writeSummary(path, report, before, after, dryRun) {
  mkdirSync(dirname(path), { recursive: true });
  const selected = report.selected;
  const lines = [
    '# RU_SSN_Yasen Torpedo Muzzle Derivation',
    '',
    '- 状态：GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY',
    '- 真实测量声明：NOT REAL-WORLD MEASUREMENT',
    `- dry-run：${dryRun ? 'true' : 'false'}`,
    `- MASTER 相对路径：${relative(process.cwd(), before.path)}`,
    `- MASTER SHA-256：${before.sha256}`,
    `- MASTER 只读：${before.sha256 === after.sha256 && before.sizeBytes === after.sizeBytes && before.mtimeMs === after.mtimeMs ? 'PASS' : 'ERROR'}`,
    `- 候选 BowDoor：${report.deterministicParameters.candidateObjects.join(', ')}`,
    `- 最终对象：${selected.objectName}`,
    `- muzzle translation：${JSON.stringify(selected.muzzleOrigin)}`,
    `- launch direction：${JSON.stringify(selected.direction.direction)}`,
    `- score：${selected.score}`,
    `- clearance envelope：radius ${report.deterministicParameters.envelopeRadiusMeters}m, length ${report.deterministicParameters.envelopeLengthMeters}m`,
    `- raycast hit：${selected.raycast.hit}`,
    `- sweep hit：${selected.sweep.hit}`,
    `- minimum sweep clearance：${selected.sweep.minimum?.distance ?? 'unknown'}`,
    '',
    '## 旧 SOCKET_TORPEDO_01 拒绝原因',
    '',
    ...report.legacySocketRejection.reasons.map((reason) => `- ${reason}`),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.options.help) {
    printHelp();
    process.exit(parsed.errors.length > 0 ? 2 : 0);
  }
  if (parsed.errors.length > 0) {
    console.error(parsed.errors.join('\n'));
    process.exit(2);
  }
  try {
    const master = validatePath(parsed.options.master, '--master', '.blend');
    const assembly = validatePath(parsed.options.assembly, '--assembly', '.json');
    const output = resolve(parsed.options.output);
    const summaryOutput =
      parsed.options.summary_output === undefined
        ? undefined
        : resolve(parsed.options.summary_output);
    const candidates =
      parsed.options.candidates === undefined
        ? [...MUZZLE_DERIVATION_CONSTANTS.bowDoorObjectNames]
        : parsed.options.candidates
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    const assemblyData = assertAssemblyForMuzzleDerivation(readJson(assembly));
    const before = fingerprint(master);
    runBlender({ assembly, blender: parsed.options.blender, candidates, master, output }, before);
    const rawReport = readJson(output);
    const after = fingerprint(master);
    const report = {
      ...rawReport,
      assembly: {
        ...rawReport.assembly,
        repositoryRelativePath: relative(process.cwd(), assembly),
      },
      blenderIntegrity: {
        after,
        before,
        unchanged:
          before.sha256 === after.sha256 &&
          before.sizeBytes === after.sizeBytes &&
          before.mtimeMs === after.mtimeMs,
      },
      master: { ...rawReport.master, repositoryRelativePath: relative(process.cwd(), master) },
    };
    writeJson(output, report);
    if (!parsed.options.dryRun) {
      const updated = updateTorpedoMuzzleTransform(assemblyData, selectedTransform(report));
      writeJson(assembly, updated);
    }
    if (summaryOutput !== undefined)
      writeSummary(summaryOutput, report, before, after, parsed.options.dryRun);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
