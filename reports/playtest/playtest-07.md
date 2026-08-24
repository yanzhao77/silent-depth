# Playtest 07 — Generated Cargo Pair (t-014 evidence)

- **Version**: ea49653
- **Mission**: GEN-02 — Generated Cargo Pair (seed 2002, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 83 · fire inputs: 2 · moving ticks: 60000 · turning ticks: 57608 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **TIMEOUT** · score 189.99933334441562 (Failed) · hull 100 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

SINK_OBJECTIVE_NOT_MET — 1 sink(s) required; 0 sunk within the tick budget.

## Difficulty

1/5

## Bugs (observed anomalies)

- Torpedo efficiency 0/4 (0%) — 4 torpedo(es) missed or expired without a hit at the effective fire range.
- Shared detection peaked at 100 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): verify the lead fire solution at the scripted fire range — hit band is 40 m / near-miss 120 m; consider widening the hit band or tightening the heading-estimate floor (±5 % / ±9°).
- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0 · torpedoEfficiency 100 · time 39.99933334441562 · survival 50 · total 189.99933334441562 · grade Failed

### Stats
- torpedoes fired 4 · hit 0 · remaining 0 · peak detection 100 · damage dealt 0.0

### Key events (tail)

- 2212.2s sonar.passive {"source":"engine","bearingDeg":273.0646169929531}
- 2213.2s sonar.passive {"source":"engine","bearingDeg":268.07820737968325}
- 2215.2s sonar.passive {"source":"engine","bearingDeg":272.9837404667838}
- 2216.2s sonar.passive {"source":"engine","bearingDeg":268.4832121693156}
- 2219.2s sonar.passive {"source":"engine","bearingDeg":268.47218317699065}
- 2222.2s sonar.passive {"source":"engine","bearingDeg":268.5135676447586}
- 2225.2s sonar.passive {"source":"engine","bearingDeg":268.70252751708074}
- 2228.2s sonar.passive {"source":"engine","bearingDeg":268.32298699028246}
- 2231.2s sonar.passive {"source":"engine","bearingDeg":267.9828545962745}
- 2234.2s sonar.passive {"source":"engine","bearingDeg":267.66812521194265}
- 2237.2s sonar.passive {"source":"engine","bearingDeg":269.25989973521996}
- 2240.2s sonar.passive {"source":"engine","bearingDeg":268.04541299143466}
- 2243.2s sonar.passive {"source":"engine","bearingDeg":268.5077304047689}
- 2246.2s sonar.passive {"source":"engine","bearingDeg":268.29009300304926}
- 2249.2s sonar.passive {"source":"engine","bearingDeg":267.7800127661199}
- 2252.2s sonar.passive {"source":"engine","bearingDeg":268.2119103070553}
- 2255.2s sonar.passive {"source":"engine","bearingDeg":268.63312658635067}
- 2258.2s sonar.passive {"source":"engine","bearingDeg":268.7189896432712}
- 2261.2s sonar.passive {"source":"engine","bearingDeg":269.1470748399812}
- 2264.2s sonar.passive {"source":"engine","bearingDeg":268.8997319468094}
- 2267.2s sonar.passive {"source":"engine","bearingDeg":268.4203625414219}
- 2270.2s sonar.passive {"source":"engine","bearingDeg":268.9098151549893}
- 2273.2s sonar.passive {"source":"engine","bearingDeg":267.9847385303642}
- 2276.2s sonar.passive {"source":"engine","bearingDeg":268.50497580873633}
- 2279.2s sonar.passive {"source":"engine","bearingDeg":269.0283452907161}
- 2282.2s sonar.passive {"source":"engine","bearingDeg":267.2655686330634}
- 2285.2s sonar.passive {"source":"engine","bearingDeg":268.0109561370853}
- 2288.2s sonar.passive {"source":"engine","bearingDeg":267.6131061592781}
- 2291.2s sonar.passive {"source":"engine","bearingDeg":268.53494446322884}
- 2294.2s sonar.passive {"source":"engine","bearingDeg":269.1262507485719}
- 2297.2s sonar.passive {"source":"engine","bearingDeg":269.0038821024912}
- 2300.2s sonar.passive {"source":"engine","bearingDeg":267.900681067265}
- 2303.2s sonar.passive {"source":"engine","bearingDeg":268.7915784763754}
- 2306.2s sonar.passive {"source":"engine","bearingDeg":268.9461768123304}
- 2309.2s sonar.passive {"source":"engine","bearingDeg":268.0376467957484}
- 2312.2s sonar.passive {"source":"engine","bearingDeg":267.6101242666633}
- 2315.2s sonar.passive {"source":"engine","bearingDeg":267.20107275453455}
- 2318.2s sonar.passive {"source":"engine","bearingDeg":269.0296712650106}
- 2321.2s sonar.passive {"source":"engine","bearingDeg":268.67064548486906}
- 2324.2s sonar.passive {"source":"engine","bearingDeg":268.47324158252536}
- 2327.2s sonar.passive {"source":"engine","bearingDeg":268.860811727399}
- 2330.2s sonar.passive {"source":"engine","bearingDeg":268.76322088839356}
- 2333.2s sonar.passive {"source":"engine","bearingDeg":268.4143072091961}
- 2336.2s sonar.passive {"source":"engine","bearingDeg":268.0432533021143}
- 2339.2s sonar.passive {"source":"engine","bearingDeg":268.83004956714564}
- 2342.2s sonar.passive {"source":"engine","bearingDeg":267.6727755107654}
- 2345.2s sonar.passive {"source":"engine","bearingDeg":268.1900396969162}
- 2348.2s sonar.passive {"source":"engine","bearingDeg":267.9862218535013}
- 2351.2s sonar.passive {"source":"engine","bearingDeg":268.3754261538694}
- 2354.2s sonar.passive {"source":"engine","bearingDeg":267.9630316014586}
