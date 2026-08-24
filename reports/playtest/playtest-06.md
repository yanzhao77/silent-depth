# Playtest 06 — Generated Merchant Pair (t-014 evidence)

- **Version**: 750cc0b
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

- 2925.6s sonar.passive {"source":"engine","bearingDeg":199.20395158349686}
- 2926.0s sonar.passive {"source":"engine","bearingDeg":206.0086122557615}
- 2928.6s sonar.passive {"source":"engine","bearingDeg":200.21277165483525}
- 2929.0s sonar.passive {"source":"engine","bearingDeg":205.03186975048303}
- 2931.6s sonar.passive {"source":"engine","bearingDeg":198.83259983906277}
- 2932.0s sonar.passive {"source":"engine","bearingDeg":204.85714085602248}
- 2934.6s sonar.passive {"source":"engine","bearingDeg":200.5317008112812}
- 2935.0s sonar.passive {"source":"engine","bearingDeg":206.09423588839837}
- 2937.6s sonar.passive {"source":"engine","bearingDeg":199.5934600901498}
- 2938.0s sonar.passive {"source":"engine","bearingDeg":205.75620677305355}
- 2940.6s sonar.passive {"source":"engine","bearingDeg":200.48116712472532}
- 2941.0s sonar.passive {"source":"engine","bearingDeg":205.49565639720313}
- 2943.6s sonar.passive {"source":"engine","bearingDeg":200.2584728550577}
- 2944.0s sonar.passive {"source":"engine","bearingDeg":206.50361279583046}
- 2946.6s sonar.passive {"source":"engine","bearingDeg":199.01884796250843}
- 2947.0s sonar.passive {"source":"engine","bearingDeg":206.66812894654637}
- 2949.6s sonar.passive {"source":"engine","bearingDeg":199.69537363285}
- 2950.0s sonar.passive {"source":"engine","bearingDeg":206.81938694233884}
- 2952.6s sonar.passive {"source":"engine","bearingDeg":199.90981993679574}
- 2953.0s sonar.passive {"source":"engine","bearingDeg":205.07848059056238}
- 2955.6s sonar.passive {"source":"engine","bearingDeg":200.25095362322378}
- 2956.0s sonar.passive {"source":"engine","bearingDeg":206.6907194810288}
- 2958.6s sonar.passive {"source":"engine","bearingDeg":200.33216319733467}
- 2959.0s sonar.passive {"source":"engine","bearingDeg":206.26798525704172}
- 2961.6s sonar.passive {"source":"engine","bearingDeg":199.52172199041732}
- 2962.0s sonar.passive {"source":"engine","bearingDeg":206.0242410235862}
- 2964.6s sonar.passive {"source":"engine","bearingDeg":199.8401038776446}
- 2965.0s sonar.passive {"source":"engine","bearingDeg":206.18919171017453}
- 2967.6s sonar.passive {"source":"engine","bearingDeg":200.35456197479604}
- 2968.0s sonar.passive {"source":"engine","bearingDeg":205.92492968901934}
- 2970.6s sonar.passive {"source":"engine","bearingDeg":200.80051495023451}
- 2971.0s sonar.passive {"source":"engine","bearingDeg":205.4609631219585}
- 2973.6s sonar.passive {"source":"engine","bearingDeg":199.82509069311934}
- 2974.0s sonar.passive {"source":"engine","bearingDeg":206.85330012417208}
- 2976.6s sonar.passive {"source":"engine","bearingDeg":199.6025054485597}
- 2977.0s sonar.passive {"source":"engine","bearingDeg":205.7198696157024}
- 2979.6s sonar.passive {"source":"engine","bearingDeg":199.92876247725374}
- 2980.0s sonar.passive {"source":"engine","bearingDeg":206.00797979014786}
- 2982.6s sonar.passive {"source":"engine","bearingDeg":201.0724761415137}
- 2983.0s sonar.passive {"source":"engine","bearingDeg":206.25932129853697}
- 2985.6s sonar.passive {"source":"engine","bearingDeg":199.2662130286527}
- 2986.0s sonar.passive {"source":"engine","bearingDeg":207.10256071984168}
- 2988.6s sonar.passive {"source":"engine","bearingDeg":200.08182054629933}
- 2989.0s sonar.passive {"source":"engine","bearingDeg":205.94034301820815}
- 2991.6s sonar.passive {"source":"engine","bearingDeg":200.0972873822656}
- 2992.0s sonar.passive {"source":"engine","bearingDeg":207.2647944994843}
- 2994.6s sonar.passive {"source":"engine","bearingDeg":200.69514854602994}
- 2995.0s sonar.passive {"source":"engine","bearingDeg":206.80293104998802}
- 2997.6s sonar.passive {"source":"engine","bearingDeg":200.17905921473562}
- 2998.0s sonar.passive {"source":"engine","bearingDeg":207.44370153723023}
