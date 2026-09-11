#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AssemblyValidationError,
  SUBMARINE_AUDIT_EXIT_CODES,
  SUBMARINE_AUDIT_REPORT_VERSION,
  compareFingerprints,
  parseSubmarineAuditArgs,
  summarizeStatuses,
  validateSubmarineAuditInputs,
} from '../../../../src/assets/submarineBlenderAudit.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const WORKER = resolve(SCRIPT_DIR, 'submarine_blender_audit_worker.py');

function printHelp() {
  console.log(`SilentDepth 潜艇 Blender 只读审计器

用法：
  node --experimental-strip-types SilentDepth_Assets/Templates/Submarine/Scripts/submarine_blender_audit_cli.mjs \\
    --master /abs/path/[ASSET_ID]_MASTER.blend \\
    --output /abs/path/[ASSET_ID]_MASTER_AUDIT.json \\
    --inventory-only [--summary-output /abs/path/summary.md]

完整 Assembly 审计：
  ... --master /abs/path/[ASSET_ID]_MASTER.blend --assembly /abs/path/[ASSET_ID]_ASSEMBLY.json --output /abs/path/audit.json

参数：
  --master           必需，正式 MASTER .blend 绝对路径
  --assembly         完整 Assembly 审计需要，Assembly JSON 路径
  --output           必需，JSON 报告输出路径
  --summary-output   可选，Markdown 摘要输出路径
  --inventory-only   没有真实 Assembly 时只做母版库存和通用 Mesh 审计
  --fail-on-warning  警告也作为失败退出
  --blender          可选，Blender 5.2.1 CLI 路径；默认 ${DEFAULT_BLENDER}
  --help             显示帮助`);
}

function sha256(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function fingerprint(path) {
  const stat = statSync(path);
  return {
    path: resolve(path),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(path),
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

function writeSummary(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  const summary = report.summary ?? {};
  const lines = [
    `# ${report.master?.assetId ?? report.master?.path ?? '潜艇 MASTER'} 只读审计摘要`,
    '',
    `- 报告格式版本：${report.reportFormatVersion}`,
    `- 审计模式：${report.auditMode}`,
    `- MASTER：${report.master?.path ?? ''}`,
    `- MASTER SHA-256：${report.master?.sha256 ?? ''}`,
    `- Blender：${report.environment?.blender?.versionString ?? ''}`,
    `- Python：${report.environment?.python?.version ?? ''}`,
    `- 平台：${report.environment?.platform?.platform ?? ''}`,
    `- 错误：${summary.errorCount ?? 0}`,
    `- 警告：${summary.warningCount ?? 0}`,
    `- 跳过：${summary.skippedCount ?? 0}`,
    '',
    '## Assembly 审计状态',
    '',
    report.auditMode === 'inventory-only'
      ? '当前为 inventory-only 审计。缺少真实 Assembly 时，活动件对象归属、Hull 排他、Pivot/Socket 正式关系均标记为 SKIPPED_MISSING_ASSEMBLY，不能视为完整 Assembly 验证通过。'
      : '当前为完整 Assembly 审计。',
    '',
    '## 只读校验',
    '',
    `- 审计前 SHA-256：${report.fileIntegrity?.before?.sha256 ?? ''}`,
    `- 审计后 SHA-256：${report.fileIntegrity?.after?.sha256 ?? ''}`,
    `- 只读状态：${report.fileIntegrity?.unchanged === true ? 'PASS' : 'ERROR'}`,
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function blenderVersion(blenderPath) {
  const output = execFileSync(blenderPath, ['--version'], { encoding: 'utf-8' });
  return output.split('\n').slice(0, 16).join('\n').trim();
}

function runBlender(inputs, before) {
  const blenderPath = inputs.blender ?? DEFAULT_BLENDER;
  if (!existsSync(blenderPath)) {
    throw new Error(`找不到 Blender 可执行文件：${blenderPath}`);
  }
  const versionText = blenderVersion(blenderPath);
  if (!versionText.startsWith('Blender 5.2.1 LTS')) {
    throw new Error(`Blender 版本不是 5.2.1 LTS：\n${versionText}`);
  }

  const tempDir = resolve(dirname(inputs.output), `.submarine-audit-tmp-${process.pid}`);
  mkdirSync(tempDir, { recursive: true });
  const workerOutput = resolve(tempDir, 'worker-report.json');
  const args = [
    '--background',
    inputs.master,
    '--python',
    WORKER,
    '--',
    '--master',
    inputs.master,
    '--output',
    workerOutput,
    '--mode',
    inputs.mode,
    '--expected-sha256',
    before.sha256,
  ];
  if (inputs.assembly !== undefined) args.push('--assembly', inputs.assembly);

  const result = spawnSync(blenderPath, args, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32 });
  if (result.status !== 0) {
    throw new BlenderRunError(
      `Blender 审计失败，退出码 ${result.status ?? 'unknown'}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`,
    );
  }
  const report = readJson(workerOutput);
  rmSync(tempDir, { recursive: true, force: true });
  return { report, blenderPath, versionText };
}

class BlenderRunError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlenderRunError';
  }
}

function finalExitCode(report, failOnWarning) {
  const summary = report.summary ?? {};
  if ((summary.errorCount ?? 0) > 0) return SUBMARINE_AUDIT_EXIT_CODES.auditIssues;
  if (failOnWarning && (summary.warningCount ?? 0) > 0) return SUBMARINE_AUDIT_EXIT_CODES.auditIssues;
  return SUBMARINE_AUDIT_EXIT_CODES.ok;
}

function main() {
  const parsed = parseSubmarineAuditArgs(process.argv.slice(2));
  if (parsed.options?.help === true) {
    printHelp();
    process.exit(parsed.errors.length > 0 ? SUBMARINE_AUDIT_EXIT_CODES.inputError : SUBMARINE_AUDIT_EXIT_CODES.ok);
  }
  if (parsed.errors.length > 0 || parsed.options === undefined) {
    console.error(parsed.errors.join('\n'));
    process.exit(SUBMARINE_AUDIT_EXIT_CODES.inputError);
  }

  let inputs;
  try {
    inputs = validateSubmarineAuditInputs(parsed.options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof AssemblyValidationError ? SUBMARINE_AUDIT_EXIT_CODES.assemblyInvalid : SUBMARINE_AUDIT_EXIT_CODES.inputError);
  }

  const before = fingerprint(inputs.master);
  let report;
  try {
    const { report: workerReport, blenderPath, versionText } = runBlender(inputs, before);
    const after = fingerprint(inputs.master);
    const integrityIssues = compareFingerprints(before, after);
    const issues = [...(workerReport.issues ?? []), ...integrityIssues];
    const statusSummary = summarizeStatuses(issues);
    report = {
      ...workerReport,
      reportFormatVersion: SUBMARINE_AUDIT_REPORT_VERSION,
      auditMode: inputs.mode,
      blenderExecutable: blenderPath,
      blenderVersionCommand: versionText,
      fileIntegrity: {
        before,
        after,
        unchanged: integrityIssues.length === 0,
      },
      issues,
      summary: {
        ...(workerReport.summary ?? {}),
        errorCount: statusSummary.errors,
        warningCount: statusSummary.warnings,
        skippedCount: statusSummary.skipped,
        notVerifiedCount: statusSummary.notVerified,
      },
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof BlenderRunError ? SUBMARINE_AUDIT_EXIT_CODES.blenderOpenFailed : SUBMARINE_AUDIT_EXIT_CODES.internalError);
  }

  writeJson(inputs.output, report);
  if (inputs.summaryOutput !== undefined) writeSummary(inputs.summaryOutput, report);
  process.exit(finalExitCode(report, inputs.failOnWarning));
}

main();
