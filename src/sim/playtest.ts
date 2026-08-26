/**
 * SILENT DEPTH — playtest orchestration + report writer (src/sim/playtest.ts)
 *
 * t-014 playtest agent. Runs ≥ 10 recorded AI playtest sessions through the
 * headless runner (src/sim/runner.ts) and writes the evidence reports:
 *
 *   - reports/playtest/playtest-NN.md  (one per session, master prompt §55)
 *   - reports/playtest/SUMMARY.md      (aggregate table + balance findings)
 *
 * Session plan (12 ≥ 10):
 *   01 M01 ping-until-track (seed 1001)          — proven find/classify/track
 *   02 M02 stationary-ambush (seed 1002)         — proven torpedo victory
 *   03 M03 convoy-attack (seed 1003)             — best-effort hard mission
 *   04 M04 convoy-attack (seed 1004)             — best-effort hard mission
 *   05 M05 sink-and-escape (seed 1005)           — best-effort hardest mission
 *   06-10 GEN-01..GEN-05 generic-hunter          — generated, difficulty 1-3
 *   11-12 M01 determinism double-run (seed 1001) — byte-identical evidence
 *
 * All numbers in the reports come from the actual engine runs (runScripted's
 * audit trail) — nothing is fabricated. If a hard mission cannot be won by a
 * script, that IS the finding: it is recorded with evidence and flagged for
 * the t-015 balance gate.
 *
 * DESIGN DECISIONS:
 *  - The runner stays pure; this module owns all I/O (fs/path) and the
 *    version string. Version = short git hash, falling back to 'v1.0-build'
 *    (cosmetic only — the report format §55 requires a Version line).
 *  - The only node built-ins used are fs/path/child_process; the ambient
 *    declarations in src/sim/node-io.d.ts cover them for tsc (no new
 *    dependencies, per t-014 constraints).
 *  - No PRNG, no Date.now: the same config always yields the same
 *    session results and the same report text (modulo the version string).
 *
 * @pure-browser — node-only (fs/path); zero DOM; no PRNG.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MissionDef, ShipClass } from '../core/types';
import { generateMission, type GeneratorInput } from '../missions/generator';
import { getMissionDef } from '../missions/missions';
import {
  makeBrain,
  requiredSinks,
  runScripted,
  sunkCount,
  STRATEGIES,
  type PlaytestResult,
  type StrategyId,
} from './runner';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Default report output directory (workspace-relative; vitest cwd = workspace). */
export const DEFAULT_OUT_DIR = resolve(process.cwd(), 'reports/playtest');

export interface PlaytestConfig {
  /** Where playtest-NN.md + SUMMARY.md are written. */
  outDir?: string;
  /** Write the report files (the harness asserts they exist). */
  writeReports?: boolean;
  /** Version string override (default: short git hash or 'v1.0-build'). */
  version?: string;
  /** Per-strategy tick budgets (override defaults). */
  maxTicks?: Partial<Record<StrategyId, number>>;
}

interface SessionPlan {
  session: number;
  def: MissionDef;
  seed: number;
  strategy: StrategyId;
  brainId: string;
  maxTicks: number;
  /** Extra label shown in the report Mission line (e.g. determinism run A). */
  note?: string;
}

/** Default tick budgets per strategy (sim ticks @ 0.05 s = 20 Hz). */
const DEFAULT_MAX_TICKS: Record<StrategyId, number> = {
  'ping-until-track': 24_000, // 1200 s
  'stationary-ambush': 120_000, // 6000 s (proven t-020 budget)
  'convoy-attack': 60_000, // 3000 s
  'generic-hunter': 60_000, // 3000 s
  'sink-and-escape': 60_000, // 3000 s
  'determinism-check': 24_000, // 1200 s
};

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Short git hash of the workspace checkout, or 'v1.0-build' outside git. */
export function resolveVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (hash.length > 0) return hash;
  } catch {
    // Not a git checkout — fall through to the stable fallback.
  }
  return 'v1.0-build';
}

// ---------------------------------------------------------------------------
// Generated missions (difficulty 1-3, seeds 2001-2005)
// ---------------------------------------------------------------------------

/**
 * Build a generated MissionDef for the playtest pool: single sink-N objective
 * (generic brain target), composition/difficulty varying per session.
 * Deterministic: generateMission(input, seed) — no PRNG.
 */
function buildGeneratedDef(
  id: string,
  name: string,
  enemies: Record<string, number>,
  escorts: ShipClass[],
  torpedoes: number,
  weather: string,
  difficulty: number,
  seed: number,
): MissionDef {
  const lead = (Object.keys(enemies).find((k) => (enemies[k] ?? 0) > 0) ?? 'Cargo') as ShipClass;
  const input: GeneratorInput = {
    id,
    name,
    enemies,
    escorts,
    weather,
    visibility: 'medium',
    torpedoes,
    battery: 100,
    objective: {
      kind: 'sink_ge1_merchants',
      params: { targetClass: lead, count: 1 },
      subgoals: [{ id: 'sink-1', weight: 400, desc: `sink one ${lead}` }],
    },
    parMinutes: 20,
    difficulty,
    unlock: null,
  };
  return generateMission(input, seed);
}

// ---------------------------------------------------------------------------
// Session plan
// ---------------------------------------------------------------------------

function buildPlan(cfg: PlaytestConfig): SessionPlan[] {
  const maxTicks = (s: StrategyId): number => cfg.maxTicks?.[s] ?? DEFAULT_MAX_TICKS[s];
  const m01 = getMissionDef('M01');
  const m02 = getMissionDef('M02');
  const m03 = getMissionDef('M03');
  const m04 = getMissionDef('M04');
  const m05 = getMissionDef('M05');

  const gen = [
    buildGeneratedDef(
      'GEN-01',
      'Generated Merchant Pair',
      { Merchant: 2 },
      [],
      4,
      'Clear',
      1,
      2001,
    ),
    buildGeneratedDef(
      'GEN-02',
      'Generated Cargo Pair',
      { Cargo: 2 },
      [],
      4,
      'Clear->Cloudy',
      1,
      2002,
    ),
    buildGeneratedDef(
      'GEN-03',
      'Generated Tanker Escort',
      { Tanker: 2 },
      ['Frigate'],
      4,
      'Cloudy',
      2,
      2003,
    ),
    buildGeneratedDef(
      'GEN-04',
      'Generated Convoy + Destroyer',
      { Cargo: 3 },
      ['Destroyer'],
      5,
      'Cloudy->Storm',
      2,
      2004,
    ),
    buildGeneratedDef(
      'GEN-05',
      'Generated Heavy Convoy',
      { Cargo: 3, Tanker: 1 },
      ['Destroyer', 'Frigate'],
      5,
      'Storm',
      3,
      2005,
    ),
  ];

  const plan: SessionPlan[] = [
    {
      session: 1,
      def: m01,
      seed: m01.seed,
      strategy: 'ping-until-track',
      brainId: 'scripted-brain-ping-until-track',
      maxTicks: maxTicks('ping-until-track'),
    },
    {
      session: 2,
      def: m02,
      seed: m02.seed,
      strategy: 'stationary-ambush',
      brainId: 'scripted-brain-stationary-ambush',
      maxTicks: maxTicks('stationary-ambush'),
    },
    {
      session: 3,
      def: m03,
      seed: m03.seed,
      strategy: 'convoy-attack',
      brainId: 'scripted-brain-convoy-attack',
      maxTicks: maxTicks('convoy-attack'),
    },
    {
      session: 4,
      def: m04,
      seed: m04.seed,
      strategy: 'convoy-attack',
      brainId: 'scripted-brain-convoy-attack',
      maxTicks: maxTicks('convoy-attack'),
    },
    {
      session: 5,
      def: m05,
      seed: m05.seed,
      strategy: 'sink-and-escape',
      brainId: 'scripted-brain-sink-and-escape',
      maxTicks: maxTicks('sink-and-escape'),
    },
    ...gen.map((def, i) => ({
      session: 6 + i,
      def,
      seed: def.seed,
      strategy: 'generic-hunter' as StrategyId,
      brainId: 'scripted-brain-generic-hunter',
      maxTicks: maxTicks('generic-hunter'),
    })),
    {
      session: 11,
      def: m01,
      seed: m01.seed,
      strategy: 'determinism-check',
      brainId: 'scripted-brain-ping-until-track',
      maxTicks: maxTicks('determinism-check'),
      note: 'determinism run A',
    },
    {
      session: 12,
      def: m01,
      seed: m01.seed,
      strategy: 'determinism-check',
      brainId: 'scripted-brain-ping-until-track',
      maxTicks: maxTicks('determinism-check'),
      note: 'determinism run B',
    },
  ];
  return plan;
}

// ---------------------------------------------------------------------------
// Findings (bugs + recommendations) — honest, data-derived
// ---------------------------------------------------------------------------

export interface SessionFindings {
  bugs: string[];
  recommendations: string[];
}

function collectFindings(r: PlaytestResult, def: MissionDef): SessionFindings {
  const bugs: string[] = [];
  const recommendations: string[] = [];
  const { stats, actions, outcome } = r;
  const hasMerchants = def.spawns.some(
    (s) => s.type === 'Cargo' || s.type === 'Merchant' || s.type === 'Tanker',
  );
  const hasEscorts = def.spawns.some((s) => s.type === 'Destroyer' || s.type === 'Frigate');

  if (stats.torpedoesFired > 0) {
    const eff = stats.torpedoesHit / stats.torpedoesFired;
    if (eff < 1) {
      bugs.push(
        `Torpedo efficiency ${stats.torpedoesHit}/${stats.torpedoesFired} (${(eff * 100).toFixed(0)}%) — ${stats.torpedoesFired - stats.torpedoesHit} torpedo(es) missed or expired without a hit at the effective fire range.`,
      );
    }
    if (eff < 0.5) {
      recommendations.push(
        'Balance (t-015): verify the lead fire solution at the scripted fire range — hit band is 40 m / near-miss 120 m; consider widening the hit band or tightening the heading-estimate floor (±5 % / ±9°).',
      );
    }
  } else if (actions.fireInputs > 0) {
    bugs.push(
      'Fire inputs were sent but no torpedo ever launched (engine rejections / no ready tubes).',
    );
  }
  if (actions.fireRejections > 0) {
    bugs.push(
      `Engine rejected ${actions.fireRejections} fire input(s) in the event tail (stale contact id or not-ready) — the brain requested an invalid launch.`,
    );
  }
  if (hasMerchants && stats.peakDetection >= 40) {
    bugs.push(
      `Shared detection peaked at ${stats.peakDetection} (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.`,
    );
    recommendations.push(
      'Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.',
    );
  }
  if (hasEscorts && stats.peakDetection >= 40) {
    bugs.push(
      `Detection peaked at ${stats.peakDetection} — escorts escalated (SUSPICIOUS→ALERT→HUNTING) and engaged the player.`,
    );
  }
  if (hasEscorts && stats.finalHull < 100 && outcome !== 'VICTORY') {
    bugs.push(
      `Escort attack damaged the player to hull ${stats.finalHull} (depth charges / deck gun).`,
    );
    recommendations.push(
      'Balance (t-015): escort passive detection (F3 base 0.05 %/s over 6 km, any noise ≥ 1) escalates before a scripted ambush can form; consider a noise floor or slower escalation at SUSPICIOUS.',
    );
  }
  if (stats.finalBattery < 15) {
    bugs.push(
      `Battery pressure: ${stats.finalBattery}% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.`,
    );
    recommendations.push(
      'Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.',
    );
  }
  if (stats.peakDetection >= 90 && !hasEscorts && outcome === 'VICTORY') {
    bugs.push(
      `Detection pegged at ${stats.peakDetection} despite victory — with no escorts the meter had no combat consequence, but the stealth score component is zeroed: ping self-exposure (+12/ping) accumulates with no silent-running sink over a long session.`,
    );
    recommendations.push(
      'Balance (t-015): add an ambient detection sink when silent running is off (STOPPED/Medium), so long no-escort sessions do not silently zero the stealth component.',
    );
  }
  if (r.missionId === 'M05' && stats.sunkIds.length >= 1 && outcome !== 'VICTORY') {
    bugs.push(
      'A ship was sunk but the F9 escape window (detection < 20, nearest escort > 3 km, sustained 30 s) was never satisfied afterwards.',
    );
    recommendations.push(
      'Balance (t-015): the post-kill detection (+20 from torpedo fired) plus escorts closing makes the F9 window nearly unreachable right after a kill; consider easing the window or reducing torpedo-fired detection.',
    );
  }
  if (bugs.length === 0 && outcome !== 'VICTORY') {
    bugs.push(
      'No isolated anomaly — the session simply did not meet the objective within the tick budget (honest result).',
    );
  }
  if (recommendations.length === 0 && outcome !== 'VICTORY') {
    recommendations.push(
      'Review the mission difficulty target vs. the scripted ceiling evidenced above.',
    );
  }
  return { bugs, recommendations };
}

// ---------------------------------------------------------------------------
// Report writers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function compactPayload(payload: Record<string, unknown> | undefined): string {
  if (payload === undefined || Object.keys(payload).length === 0) return '';
  const json = JSON.stringify(payload);
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

function eventLine(e: {
  simTime: number;
  type: string;
  payload?: Record<string, unknown>;
}): string {
  return `- ${e.simTime.toFixed(1)}s ${e.type}${compactPayload(e.payload) ? ` ${compactPayload(e.payload)}` : ''}`;
}

function failureNarrative(r: PlaytestResult, def: MissionDef): string {
  switch (r.failure) {
    case 'none':
      return 'Objective met — mission completed.';
    case 'SCRIPT_ERROR':
      return 'The scripted brain or runner hit an engine error (see Errors below).';
    case 'DESTROYED':
    case 'DESTROYED_BY_ESCORT':
      return 'Player hull reached 0 (escort depth charges / deck gun or collision).';
    case 'OUT_OF_BOUNDS':
      return 'Player spent 60 s outside the map square.';
    case 'MISSION_DEFEAT':
      return 'Mission ended in DEFEAT through the objectives system.';
    case 'ESCAPE_FAILED':
      return 'Sink objective met but the F9 escape condition was never satisfied.';
    case 'SURVIVE_FAILED':
      return 'Sinks met but the survive condition was lost (player destroyed).';
    case 'VICTORY_CONDITION_TIMED_OUT':
      return 'All sink-N subgoals met but the remaining victory condition did not resolve in the tick budget.';
    case 'SINK_OBJECTIVE_NOT_MET':
      return `${requiredSinks(def)} sink(s) required; ${sunkCount(r.finalSnapshot)} sunk within the tick budget.`;
    default:
      return r.failure;
  }
}

function writeSessionReport(
  outDir: string,
  version: string,
  r: PlaytestResult,
  def: MissionDef,
  note?: string,
): void {
  const findings = collectFindings(r, def);
  const lines: string[] = [];
  lines.push(`# Playtest ${pad2(r.session)} — ${r.missionName} (t-014 evidence)`);
  lines.push('');
  lines.push(`- **Version**: ${version}`);
  lines.push(
    `- **Mission**: ${r.missionId} — ${r.missionName} (seed ${r.seed}, difficulty ${r.difficulty}/5)${note ? ` — ${note}` : ''}`,
  );
  lines.push(`- **Agent**: ${r.brainId} (${STRATEGIES[r.strategy as StrategyId].label})`);
  lines.push(`- **Result**: **${r.outcome}** after ${r.simTime.toFixed(1)} s (${r.ticks} ticks)`);
  lines.push('');
  lines.push('## Actions');
  lines.push('');
  lines.push(
    `- pings: ${r.actions.pings} · fire inputs: ${r.actions.fireInputs} · moving ticks: ${r.actions.movingTicks} · turning ticks: ${r.actions.turningTicks} · fire rejections (tail): ${r.actions.fireRejections}`,
  );
  lines.push(`- strategy: ${STRATEGIES[r.strategy as StrategyId].description}`);
  lines.push('');
  lines.push('## Result');
  lines.push('');
  lines.push(
    `- outcome: **${r.outcome}** · score ${r.score.total} (${r.score.grade}) · hull ${r.stats.finalHull} · battery ${r.stats.finalBattery.toFixed(1)}% · detection ${r.stats.finalDetection.toFixed(1)}`,
  );
  lines.push(
    `- sunk: ${r.stats.sunkIds.length > 0 ? `${r.stats.sunkIds.join(', ')} (${r.stats.sunkClasses.join(', ')})` : 'none'} · damage dealt: ${r.stats.damageDealt.toFixed(1)} hull points`,
  );
  lines.push('');
  lines.push('## Failure');
  lines.push('');
  lines.push(`${r.failure} — ${failureNarrative(r, def)}`);
  if (r.errors.length > 0) {
    lines.push('');
    lines.push('### Errors');
    for (const e of r.errors) lines.push(`- ${e}`);
  }
  lines.push('');
  lines.push('## Difficulty');
  lines.push('');
  lines.push(`${r.difficulty}/5`);
  lines.push('');
  lines.push('## Bugs (observed anomalies)');
  lines.push('');
  if (findings.bugs.length === 0) lines.push('- none observed');
  for (const b of findings.bugs) lines.push(`- ${b}`);
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  if (findings.recommendations.length === 0) lines.push('- none');
  for (const rec of findings.recommendations) lines.push(`- ${rec}`);
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  lines.push('### Score parts');
  lines.push(
    `- objective ${r.score.objective} · damage ${r.score.damage} · stealth ${r.score.stealth} · torpedoEfficiency ${r.score.torpedoEfficiency} · time ${r.score.time} · survival ${r.score.survival} · total ${r.score.total} · grade ${r.score.grade}`,
  );
  lines.push('');
  lines.push('### Stats');
  lines.push(
    `- torpedoes fired ${r.stats.torpedoesFired} · hit ${r.stats.torpedoesHit} · remaining ${r.stats.torpedoesRemaining} · peak detection ${r.stats.peakDetection} · damage dealt ${r.stats.damageDealt.toFixed(1)}`,
  );
  lines.push('');
  lines.push('### Key events (tail)');
  lines.push('');
  if (r.keyEvents.length === 0) lines.push('- (none)');
  for (const e of r.keyEvents) lines.push(eventLine(e));
  lines.push('');
  writeFileSync(resolve(outDir, `playtest-${pad2(r.session)}.md`), lines.join('\n'), 'utf8');
}

function writeSummary(outDir: string, version: string, results: PlaytestResult[]): void {
  const rows: string[] = [];
  rows.push(
    '| # | Mission | Seed | Diff | Strategy | Outcome | Duration (s) | Damage | Peak det | Torp hit/fired | Score | Grade |',
  );
  rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const eff =
      r.stats.torpedoesFired > 0 ? `${r.stats.torpedoesHit}/${r.stats.torpedoesFired}` : '—';
    rows.push(
      `| ${pad2(r.session)} | ${r.missionId} | ${r.seed} | ${r.difficulty} | ${STRATEGIES[r.strategy as StrategyId].label} | **${r.outcome}** | ${r.simTime.toFixed(0)} | ${r.stats.damageDealt.toFixed(0)} | ${r.stats.peakDetection} | ${eff} | ${r.score.total} | ${r.score.grade} |`,
    );
  }
  const victories = results.filter((r) => r.outcome === 'VICTORY');
  const fired = results.reduce((s, r) => s + r.stats.torpedoesFired, 0);
  const hit = results.reduce((s, r) => s + r.stats.torpedoesHit, 0);
  const damage = results.reduce((s, r) => s + r.stats.damageDealt, 0);
  const dd = results.filter((r) => r.strategy === 'determinism-check');
  const ddIdentical =
    dd.length >= 2 &&
    dd[0]!.finalSnapshot !== null &&
    dd[1]!.finalSnapshot !== null &&
    JSON.stringify(dd[0]!.finalSnapshot) === JSON.stringify(dd[1]!.finalSnapshot);

  const lines: string[] = [];
  lines.push('# SILENT DEPTH 《深海猎手》 — Playtest SUMMARY (t-014)');
  lines.push('');
  lines.push(`**Version:** ${version}`);
  lines.push(
    `**Sessions:** ${results.length} recorded (5 fixed + 5 generated + M01 determinism double-run)`,
  );
  lines.push(
    `**Victories:** ${victories.length} (${victories.map((v) => v.missionId).join(', ') || 'none'})`,
  );
  lines.push(
    `**Torpedoes:** ${hit} hits / ${fired} fired (${fired > 0 ? ((hit / fired) * 100).toFixed(0) : '—'}%) · **total damage dealt:** ${damage.toFixed(0)} hull points`,
  );
  lines.push(
    `**Determinism double-run (M01, seed ${results.find((r) => r.strategy === 'determinism-check')?.seed ?? 1001}):** ${ddIdentical ? 'PASS — final snapshots byte-identical' : 'FAIL or incomplete'}`,
  );
  lines.push('');
  lines.push('## Aggregate results');
  lines.push('');
  rows.forEach((row) => lines.push(row));
  lines.push('');
  lines.push('## Identified balance/UX issues (evidence for t-015)');
  lines.push('');
  // Aggregated cross-session patterns; per-session detail lives in the
  // playtest-NN.md files (written by writeSessionReport).
  const issueBuckets = aggregateIssues(results);
  if (issueBuckets.length === 0) lines.push('- none observed across sessions');
  for (const { issue, evidence } of issueBuckets) {
    lines.push(`- **${issue}**`);
    for (const e of evidence) lines.push(`  - ${e}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- Reports are regenerated by `npm test` (tests/playtest/playtest.test.ts calls runPlaytests()).',
  );
  lines.push(
    '- All numbers are measured from real engine runs (createGame/step, FIXED_DT); no fabricated values.',
  );
  lines.push(
    '- Hard missions (M03+) use best-effort scripts; a scripted loss is recorded as the finding, not masked.',
  );
  lines.push('');
  writeFileSync(resolve(outDir, 'SUMMARY.md'), lines.join('\n'), 'utf8');
}

/** Cross-session issue aggregation with per-session evidence citations. */
function aggregateIssues(results: PlaytestResult[]): { issue: string; evidence: string[] }[] {
  const buckets: { issue: string; evidence: string[] }[] = [];
  const add = (issue: string, evidence: string): void => {
    const b = buckets.find((x) => x.issue === issue);
    if (b !== undefined) b.evidence.push(evidence);
    else buckets.push({ issue, evidence: [evidence] });
  };
  for (const r of results) {
    const s = pad2(r.session);
    if (r.outcome === 'ERROR')
      add('Script/engine error in session', `session ${s}: ${r.errors.join('; ')}`);
    if (r.actions.fireRejections > 0)
      add(
        'Fire inputs rejected (stale/no-target)',
        `session ${s}: ${r.actions.fireRejections} rejections in event tail`,
      );
    if (r.stats.torpedoesFired > 0 && r.stats.torpedoesHit < r.stats.torpedoesFired) {
      add(
        'Torpedo efficiency < 100 % (misses at effective fire range)',
        `session ${s} (${r.missionId}): ${r.stats.torpedoesHit}/${r.stats.torpedoesFired} hits at ≤ fire range`,
      );
    }
    if (r.stats.peakDetection >= 40) {
      add(
        'Detection reaches the ≥ 40 band (merchant ALERT / escort escalation threshold)',
        `session ${s} (${r.missionId}): peak detection ${r.stats.peakDetection}`,
      );
    }
    if (r.stats.finalHull < 100 && r.outcome !== 'VICTORY') {
      add(
        'Escort pressure damages the player (depth charges / deck gun)',
        `session ${s} (${r.missionId}): final hull ${r.stats.finalHull}`,
      );
    }
    if (r.stats.finalBattery < 15) {
      add(
        'Battery budget pressure (ping 2 % + CRUISE 0.3 %/s)',
        `session ${s} (${r.missionId}): ${r.stats.finalBattery.toFixed(0)}% remaining`,
      );
    }
    if (r.missionId === 'M05' && r.stats.sunkIds.length >= 1 && r.outcome !== 'VICTORY') {
      add(
        'M05 post-kill F9 escape window unreachable',
        `session ${s}: 1+ sunk, escape condition never met`,
      );
    }
    if (r.outcome === 'TIMEOUT' && r.stats.sunkIds.length === 0) {
      add('Sink objective not met within the tick budget', `session ${s} (${r.missionId}): 0 sunk`);
    }
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// runPlaytests — the entry point the harness calls
// ---------------------------------------------------------------------------

/**
 * Run the full playtest battery and (by default) write the evidence reports.
 * Returns the session results (audit trail) for the harness assertions.
 */
export function runPlaytests(config: PlaytestConfig = {}): PlaytestResult[] {
  const outDir = config.outDir ?? DEFAULT_OUT_DIR;
  const version = config.version ?? resolveVersion();
  const writeReports = config.writeReports ?? true;
  const plan = buildPlan(config);

  const results: PlaytestResult[] = [];
  for (const item of plan) {
    const brain = makeBrain(item.strategy, item.def);
    const result = runScripted(item.def, item.seed, brain, item.maxTicks, {
      session: item.session,
      strategy: item.strategy,
      brainId: item.brainId,
    });
    results.push(result);
  }

  if (writeReports) {
    mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < plan.length; i++) {
      writeSessionReport(outDir, version, results[i]!, plan[i]!.def, plan[i]!.note);
    }
    writeSummary(outDir, version, results);
  }

  return results;
}
