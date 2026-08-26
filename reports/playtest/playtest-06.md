# Playtest 06 — Generated Merchant Pair (t-014 evidence)

- **Version**: 56a3133
- **Mission**: GEN-01 — Generated Merchant Pair (seed 2001, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 396 · fire inputs: 0 · moving ticks: 60000 · turning ticks: 0 · fire rejections (tail): 0
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

- 2926.7s sonar.passive {"source":"engine","bearingDeg":199.80924254422743}
- 2927.2s sonar.passive {"source":"engine","bearingDeg":206.38001095091045}
- 2929.7s sonar.passive {"source":"engine","bearingDeg":200.03382883693206}
- 2930.2s sonar.passive {"source":"engine","bearingDeg":204.77714345472612}
- 2932.7s sonar.passive {"source":"engine","bearingDeg":198.90968132395594}
- 2933.2s sonar.passive {"source":"engine","bearingDeg":205.57562811793824}
- 2935.7s sonar.passive {"source":"engine","bearingDeg":200.54343798053768}
- 2936.2s sonar.passive {"source":"engine","bearingDeg":206.70839821985552}
- 2938.7s sonar.passive {"source":"engine","bearingDeg":199.39306678738492}
- 2939.2s sonar.passive {"source":"engine","bearingDeg":204.8897554842296}
- 2941.7s sonar.passive {"source":"engine","bearingDeg":200.31377416688}
- 2942.2s sonar.passive {"source":"engine","bearingDeg":205.19020837997343}
- 2944.7s sonar.passive {"source":"engine","bearingDeg":200.45076572463128}
- 2945.2s sonar.passive {"source":"engine","bearingDeg":206.1293019297709}
- 2947.7s sonar.passive {"source":"engine","bearingDeg":199.9829267583077}
- 2948.2s sonar.passive {"source":"engine","bearingDeg":205.87003653576875}
- 2950.7s sonar.passive {"source":"engine","bearingDeg":198.95724022991402}
- 2951.2s sonar.passive {"source":"engine","bearingDeg":205.49634546146186}
- 2953.7s sonar.passive {"source":"engine","bearingDeg":199.0634891904676}
- 2954.2s sonar.passive {"source":"engine","bearingDeg":205.62979767423647}
- 2956.7s sonar.passive {"source":"engine","bearingDeg":199.1807455572949}
- 2957.2s sonar.passive {"source":"engine","bearingDeg":206.29475552737065}
- 2959.7s sonar.passive {"source":"engine","bearingDeg":199.26487593780578}
- 2960.2s sonar.passive {"source":"engine","bearingDeg":206.93969689726202}
- 2962.7s sonar.passive {"source":"engine","bearingDeg":200.43830141101273}
- 2963.2s sonar.passive {"source":"engine","bearingDeg":206.06757284053884}
- 2965.7s sonar.passive {"source":"engine","bearingDeg":200.6782880774673}
- 2966.2s sonar.passive {"source":"engine","bearingDeg":205.54604241547906}
- 2968.7s sonar.passive {"source":"engine","bearingDeg":199.54268764476478}
- 2969.2s sonar.passive {"source":"engine","bearingDeg":205.35124546813876}
- 2971.7s sonar.passive {"source":"engine","bearingDeg":199.37029019738407}
- 2972.2s sonar.passive {"source":"engine","bearingDeg":206.76963900276687}
- 2974.7s sonar.passive {"source":"engine","bearingDeg":200.06240778808098}
- 2975.2s sonar.passive {"source":"engine","bearingDeg":205.57723814477936}
- 2977.7s sonar.passive {"source":"engine","bearingDeg":199.32342434267775}
- 2978.2s sonar.passive {"source":"engine","bearingDeg":207.07031274517792}
- 2980.7s sonar.passive {"source":"engine","bearingDeg":199.54176673792222}
- 2981.2s sonar.passive {"source":"engine","bearingDeg":207.24870368724442}
- 2983.7s sonar.passive {"source":"engine","bearingDeg":199.43099060782063}
- 2984.2s sonar.passive {"source":"engine","bearingDeg":206.61413172238974}
- 2986.7s sonar.passive {"source":"engine","bearingDeg":201.14715033958555}
- 2987.2s sonar.passive {"source":"engine","bearingDeg":206.16359078843377}
- 2989.7s sonar.passive {"source":"engine","bearingDeg":199.65920562402184}
- 2990.2s sonar.passive {"source":"engine","bearingDeg":207.23863949628904}
- 2992.7s sonar.passive {"source":"engine","bearingDeg":200.67922834204984}
- 2993.2s sonar.passive {"source":"engine","bearingDeg":206.4915221660728}
- 2995.7s sonar.passive {"source":"engine","bearingDeg":201.02990768857495}
- 2996.2s sonar.passive {"source":"engine","bearingDeg":206.17787997143859}
- 2998.7s sonar.passive {"source":"engine","bearingDeg":201.31441651508217}
- 2999.2s sonar.passive {"source":"engine","bearingDeg":206.8241824370754}
