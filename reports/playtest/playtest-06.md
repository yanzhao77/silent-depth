# Playtest 06 — Generated Merchant Pair (t-014 evidence)

- **Version**: dbb2afa
- **Mission**: GEN-01 — Generated Merchant Pair (seed 2001, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 395 · fire inputs: 0 · moving ticks: 60000 · turning ticks: 0 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **TIMEOUT** · score 189.99933334441562 (Failed) · hull 100 · battery 0.0% · detection 45.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

SINK_OBJECTIVE_NOT_MET — 1 sink(s) required; 0 sunk within the tick budget.

## Difficulty

1/5

## Bugs (observed anomalies)

- Shared detection peaked at 100 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0 · torpedoEfficiency 100 · time 39.99933334441562 · survival 50 · total 189.99933334441562 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 100 · damage dealt 0.0

### Key events (tail)

- 2925.9s sonar.passive {"source":"engine","bearingDeg":199.39619513312294}
- 2926.3s sonar.passive {"source":"engine","bearingDeg":205.7828697599521}
- 2928.9s sonar.passive {"source":"engine","bearingDeg":200.23764374347078}
- 2929.3s sonar.passive {"source":"engine","bearingDeg":206.0208079987651}
- 2931.9s sonar.passive {"source":"engine","bearingDeg":198.82218669354722}
- 2932.3s sonar.passive {"source":"engine","bearingDeg":205.30570165899414}
- 2934.9s sonar.passive {"source":"engine","bearingDeg":199.65385438315442}
- 2935.3s sonar.passive {"source":"engine","bearingDeg":205.4944429199485}
- 2937.9s sonar.passive {"source":"engine","bearingDeg":199.01701160234228}
- 2938.3s sonar.passive {"source":"engine","bearingDeg":205.4276095860261}
- 2940.9s sonar.passive {"source":"engine","bearingDeg":199.74786667542526}
- 2941.3s sonar.passive {"source":"engine","bearingDeg":206.74202287948737}
- 2943.9s sonar.passive {"source":"engine","bearingDeg":200.8317277815391}
- 2944.3s sonar.passive {"source":"engine","bearingDeg":205.23240336261352}
- 2946.9s sonar.passive {"source":"engine","bearingDeg":198.98469391290396}
- 2947.3s sonar.passive {"source":"engine","bearingDeg":206.400929274105}
- 2949.9s sonar.passive {"source":"engine","bearingDeg":200.63063008672665}
- 2950.3s sonar.passive {"source":"engine","bearingDeg":206.04683134495627}
- 2952.9s sonar.passive {"source":"engine","bearingDeg":200.4485143613959}
- 2953.3s sonar.passive {"source":"engine","bearingDeg":205.6480733317636}
- 2955.9s sonar.passive {"source":"engine","bearingDeg":200.84619685718945}
- 2956.3s sonar.passive {"source":"engine","bearingDeg":206.49194814363798}
- 2958.9s sonar.passive {"source":"engine","bearingDeg":200.5077097505355}
- 2959.3s sonar.passive {"source":"engine","bearingDeg":206.87984957885942}
- 2961.9s sonar.passive {"source":"engine","bearingDeg":199.5075460385053}
- 2962.3s sonar.passive {"source":"engine","bearingDeg":205.53512912688547}
- 2964.9s sonar.passive {"source":"engine","bearingDeg":200.66466102505115}
- 2965.3s sonar.passive {"source":"engine","bearingDeg":205.5013626819694}
- 2967.9s sonar.passive {"source":"engine","bearingDeg":199.25288259001326}
- 2968.3s sonar.passive {"source":"engine","bearingDeg":207.27234031667908}
- 2970.9s sonar.passive {"source":"engine","bearingDeg":200.22131871096752}
- 2971.3s sonar.passive {"source":"engine","bearingDeg":206.95267254884544}
- 2973.9s sonar.passive {"source":"engine","bearingDeg":199.92175647300118}
- 2974.3s sonar.passive {"source":"engine","bearingDeg":206.47398695496724}
- 2976.9s sonar.passive {"source":"engine","bearingDeg":200.3329556052498}
- 2977.3s sonar.passive {"source":"engine","bearingDeg":207.25242445585363}
- 2979.9s sonar.passive {"source":"engine","bearingDeg":201.32556412698182}
- 2980.3s sonar.passive {"source":"engine","bearingDeg":206.9500110488665}
- 2982.9s sonar.passive {"source":"engine","bearingDeg":199.75835470276644}
- 2983.3s sonar.passive {"source":"engine","bearingDeg":205.77982170178728}
- 2985.9s sonar.passive {"source":"engine","bearingDeg":199.73194012038857}
- 2986.3s sonar.passive {"source":"engine","bearingDeg":206.19004749829125}
- 2988.9s sonar.passive {"source":"engine","bearingDeg":199.87078723103963}
- 2989.3s sonar.passive {"source":"engine","bearingDeg":206.98022529411816}
- 2991.9s sonar.passive {"source":"engine","bearingDeg":199.68434080271203}
- 2992.3s sonar.passive {"source":"engine","bearingDeg":207.1243732695532}
- 2994.9s sonar.passive {"source":"engine","bearingDeg":200.7752899526283}
- 2995.3s sonar.passive {"source":"engine","bearingDeg":206.49705687944814}
- 2997.9s sonar.passive {"source":"engine","bearingDeg":200.52142884659162}
- 2998.3s sonar.passive {"source":"engine","bearingDeg":206.241310710869}
