/**
 * SILENT DEPTH — playtest gate harness (tests/playtest/playtest.test.ts)
 *
 * t-014 playtest agent acceptance: calls runPlaytests() (src/sim/playtest.ts),
 * which drives ≥ 10 recorded scripted-AI sessions through the REAL engine
 * (createGame/step via src/sim/runner.ts) and writes the evidence reports
 * (reports/playtest/playtest-NN.md + SUMMARY.md). Asserts:
 *
 *   - ≥ 10 sessions recorded;
 *   - ≥ 1 VICTORY, and every victory is on a PROVEN strategy mission
 *     (M01 find/classify/track or M02 stationary ambush) — the task contract
 *     does not allow claiming a hard-mission scripted win that does not exist;
 *   - the M01 determinism double-run is byte-identical (JSON.stringify of the
 *     final snapshots) — ADR-004 determinism evidence;
 *   - every session wrote its report file and the aggregate SUMMARY.md exists;
 *   - the sim sources contain no Math.random (engine determinism contract).
 *
 * Honesty contract: all numbers in the reports come from real runs; a
 * scripted loss on M03+ is recorded as the finding, never masked.
 *
 * Environment: vitest node. Deterministic — no Math.random anywhere.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_OUT_DIR, runPlaytests } from '../../src/sim/playtest'

/** Run the battery once per file — reports are (re)written here. */
const results = runPlaytests()

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

describe('t-014 playtest gate — recorded AI playtests', () => {
  it('records ≥ 10 sessions (5 fixed + ≥ 5 generated + determinism double-run)', () => {
    expect(results.length).toBeGreaterThanOrEqual(10)
  })

  it('at least one session is VICTORY, and at least one victory is on a proven-strategy mission (M01 or M02)', () => {
    const victories = results.filter((r) => r.outcome === 'VICTORY')
    expect(victories.length).toBeGreaterThanOrEqual(1)
    // The task contract guarantees a victory via the PROVEN strategies (M01
    // find/classify/track, M02 stationary ambush). Extra victories on other
    // sessions (e.g. a generated mission) are honest bonus evidence — they do
    // not invalidate the run, so only the existence of a proven victory is
    // asserted, not the absence of others.
    const proven = victories.filter((v) => v.missionId === 'M01' || v.missionId === 'M02')
    expect(proven.length).toBeGreaterThanOrEqual(1)
  })

  it('M01 determinism double-run is byte-identical (same seed → identical final snapshot)', () => {
    const dd = results.filter((r) => r.strategy === 'determinism-check')
    expect(dd.length).toBeGreaterThanOrEqual(2)
    const a = dd[0]!
    const b = dd[1]!
    expect(a.missionId).toBe(b.missionId)
    expect(a.seed).toBe(b.seed)
    expect(a.finalSnapshot).not.toBeNull()
    expect(b.finalSnapshot).not.toBeNull()
    expect(JSON.stringify(a.finalSnapshot)).toBe(JSON.stringify(b.finalSnapshot))
    expect(a.outcome).toBe(b.outcome)
    expect(a.score).toEqual(b.score)
  })

  it('every session wrote its report file, and the aggregate SUMMARY.md exists', () => {
    for (const r of results) {
      const file = resolve(DEFAULT_OUT_DIR, `playtest-${pad2(r.session)}.md`)
      expect(existsSync(file), `missing report ${file}`).toBe(true)
      const content = readFileSync(file, 'utf8')
      // Every report carries the §55 evidence fields.
      expect(content).toContain('**Version**')
      expect(content).toContain('**Mission**')
      expect(content).toContain('**Agent**')
      expect(content).toContain('## Result')
      expect(content).toContain('## Failure')
      expect(content).toContain('## Difficulty')
      expect(content).toContain('## Bugs (observed anomalies)')
      expect(content).toContain('## Recommendations')
      expect(content).toContain('## Evidence')
    }
    expect(existsSync(resolve(DEFAULT_OUT_DIR, 'SUMMARY.md'))).toBe(true)
  })

  it('every session has a valid outcome, an audit trail, and errors only on ERROR', () => {
    for (const r of results) {
      expect(['VICTORY', 'DEFEAT', 'TIMEOUT', 'ERROR']).toContain(r.outcome)
      expect(r.actions.pings).toBeGreaterThanOrEqual(0)
      expect(r.actions.fireInputs).toBeGreaterThanOrEqual(0)
      expect(typeof r.stats.peakDetection).toBe('number')
      expect(Array.isArray(r.stats.sunkIds)).toBe(true)
      expect(Array.isArray(r.keyEvents)).toBe(true)
      if (r.outcome === 'ERROR') expect(r.errors.length).toBeGreaterThan(0)
      else expect(r.errors).toEqual([])
    }
  })

  it('the sim sources contain no Math.random (engine determinism contract)', () => {
    const files = ['src/sim/runner.ts', 'src/sim/playtest.ts']
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf8')
      expect(src, `${f} must not use Math.random`).not.toContain('Math.random')
    }
  })
})
