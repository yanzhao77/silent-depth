// SILENT DEPTH — menus pure-helper tests (tests/unit/menus.test.ts)
// ---------------------------------------------------------------------------
// menus.ts is @pure-at-import (DOM touched only inside createMenus) but the
// whole module reported 0% because nothing imported it. These tests target the
// exported pure helpers (gradeClass / formatPar / weatherChain / convoyReport)
// that build the menu content strings — no DOM needed.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { convoyReport, formatPar, gradeClass, weatherChain } from '../../src/ui/menus';
import type { Translator } from '../../src/ui/i18n';
import type { MissionDef } from '../../src/core/types';

/** A Translator double that renders `<key>[k=v,...]` for assertions. */
function tt(key: string, vars?: Record<string, unknown>): string {
  if (vars === undefined) return key;
  const pairs = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${key}[${pairs}]`;
}
const translator = tt as Translator;

function makeDef(spawnTypes: string[]): MissionDef {
  return {
    id: 'M-T',
    spawns: spawnTypes.map((type, i) => ({
      type,
      x: i,
      y: i,
      headingDeg: 0,
    })),
    // MissionDef requires several other fields — pad with minimal values.
    name: 'Test',
    parTimeS: 1,
    seed: 1,
    weather: 'Clear',
    difficulty: 1,
  } as unknown as MissionDef;
}

describe('menus — gradeClass', () => {
  it('maps each grade to its CSS class', () => {
    expect(gradeClass('Perfect')).toBe('grade-perfect');
    expect(gradeClass('Excellent')).toBe('grade-excellent');
    expect(gradeClass('Good')).toBe('grade-good');
    expect(gradeClass('Poor')).toBe('grade-poor');
    expect(gradeClass('Failed')).toBe('grade-failed');
  });
});

describe('menus — formatPar', () => {
  it('formats seconds as MM:SS, zero-padded', () => {
    expect(formatPar(0)).toBe('00:00');
    expect(formatPar(59)).toBe('00:59');
    expect(formatPar(60)).toBe('01:00');
    expect(formatPar(125)).toBe('02:05');
    expect(formatPar(600)).toBe('10:00');
  });

  it('floors fractional seconds and clamps negatives to zero', () => {
    expect(formatPar(61.9)).toBe('01:01');
    expect(formatPar(-5)).toBe('00:00');
  });
});

describe('menus — weatherChain', () => {
  it('splits a -> chain and localizes each segment', () => {
    expect(weatherChain('Clear->Cloudy', translator)).toBe('weather.Clear → weather.Cloudy');
  });

  it('handles a single-weather spec and trims whitespace', () => {
    expect(weatherChain('Storm', translator)).toBe('weather.Storm');
    expect(weatherChain('Clear -> Fog', translator)).toBe('weather.Clear → weather.Fog');
  });
});

describe('menus — convoyReport', () => {
  it('aggregates merchant + escort counts into the report line', () => {
    const def = makeDef(['Tanker', 'Cargo', 'Destroyer', 'Frigate']);
    const report = convoyReport(def, translator);
    expect(report).toContain('intel.report[merchants=2,escorts=2]');
    expect(report).toContain('intel.infoLevel');
  });

  it('reports an all-merchant fleet with zero escorts', () => {
    const def = makeDef(['Cargo', 'Cargo', 'Cargo']);
    const report = convoyReport(def, translator);
    expect(report).toContain('intel.report[merchants=3,escorts=0]');
  });

  it('returns intel.none when there is no traffic', () => {
    expect(convoyReport(makeDef([]), translator)).toBe('intel.none');
  });
});
