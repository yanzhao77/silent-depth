#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLENDER = process.env.BLENDER_BIN ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const CLI = resolve(
  ROOT,
  'SilentDepth_Assets/Templates/Submarine/Scripts/submarine_blender_audit_cli.mjs',
);

function sha256(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function createFixtureBlend(blendPath) {
  const script = `
import bpy
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
mesh = bpy.data.meshes.new('AuditFixtureMesh')
mesh.from_pydata([(0,0,0),(0,0,0),(1,0,0),(2,0,0)], [(0,1),(1,2)], [(1,2,3)])
mesh.update()
obj = bpy.data.objects.new('AUDIT_NEG_SCALE_ZERO_EDGE', mesh)
obj.scale = (-1.0, 1.0, 1.0)
bpy.context.scene.collection.objects.link(obj)
empty = bpy.data.objects.new('SOCKET_AUDIT_CANDIDATE', None)
empty.empty_display_type = 'ARROWS'
bpy.context.scene.collection.objects.link(empty)
bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blendPath)})
`;
  const result = spawnSync(
    BLENDER,
    ['--background', '--factory-startup', '--python-expr', script],
    {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 16,
    },
  );
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function main() {
  assert.ok(existsSync(BLENDER), `找不到 Blender：${BLENDER}`);
  const version = execFileSync(BLENDER, ['--version'], { encoding: 'utf-8' });
  assert.ok(version.startsWith('Blender 5.2.1 LTS'), `Blender 版本不是 5.2.1 LTS：\n${version}`);

  const dir = mkdtempSync(join(tmpdir(), 'silent-depth-submarine-audit-blender-'));
  try {
    const master = join(dir, 'ZZ_SSN_AuditFixture_MASTER.blend');
    const output = join(dir, 'ZZ_SSN_AuditFixture_MASTER_AUDIT.json');
    const summary = join(dir, 'ZZ_SSN_AuditFixture_MASTER_AUDIT.md');
    createFixtureBlend(master);
    const beforeHash = sha256(master);
    const beforeStat = statSync(master);
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        CLI,
        '--master',
        master,
        '--output',
        output,
        '--summary-output',
        summary,
        '--inventory-only',
        '--blender',
        BLENDER,
      ],
      { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 16 },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const afterHash = sha256(master);
    const afterStat = statSync(master);
    assert.equal(afterHash, beforeHash, '审计不得修改 fixture MASTER SHA-256');
    assert.equal(afterStat.size, beforeStat.size, '审计不得修改 fixture MASTER 大小');
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs, '审计不得修改 fixture MASTER 修改时间');

    const report = JSON.parse(readFileSync(output, 'utf-8'));
    assert.equal(report.auditMode, 'inventory-only');
    assert.equal(report.fileIntegrity.unchanged, true);
    assert.equal(report.assemblyAudit.status, 'SKIPPED_MISSING_ASSEMBLY');
    assert.ok(report.issues.some((item) => item.ruleId === 'SUBMOD-022-ZERO_LENGTH_EDGE'));
    assert.ok(report.issues.some((item) => item.ruleId === 'SUBMOD-022-DEGENERATE_FACE'));
    assert.ok(report.issues.some((item) => item.ruleId === 'SUBMOD-022-NO_MATERIAL_SLOT'));
    assert.ok(report.issues.some((item) => item.ruleId === 'SUBMOD-022-NEGATIVE_SCALE'));
    assert.ok(
      report.assemblyAudit.anchorReports.some((item) => item.name === 'SOCKET_AUDIT_CANDIDATE'),
    );
    console.log(`Blender 集成审计通过：${BLENDER}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
