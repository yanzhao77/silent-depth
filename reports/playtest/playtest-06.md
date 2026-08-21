# Playtest 06 — Generated Merchant Pair (t-014 evidence)

- **Version**: 95d3462
- **Mission**: GEN-01 — Generated Merchant Pair (seed 2001, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 384 · fire inputs: 0 · moving ticks: 60000 · turning ticks: 0 · fire rejections (tail): 0
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

- 2926.1s sonar.passive {"source":"engine","bearingDeg":208.16995715262976}
- 2928.6s sonar.passive {"source":"engine","bearingDeg":200.1342868548596}
- 2929.1s sonar.passive {"source":"engine","bearingDeg":207.0411342899172}
- 2931.6s sonar.passive {"source":"engine","bearingDeg":200.6831432286045}
- 2932.1s sonar.passive {"source":"engine","bearingDeg":206.8691922242678}
- 2934.6s sonar.passive {"source":"engine","bearingDeg":200.82186079167758}
- 2935.1s sonar.passive {"source":"engine","bearingDeg":208.36817126917413}
- 2937.6s contact.classified {"contactId":"C-01","classification":"Cargo","confidence":65}
- 2937.6s sonar.passive {"source":"engine","bearingDeg":201.89724126364104}
- 2938.1s sonar.passive {"source":"engine","bearingDeg":207.73603216745855}
- 2940.6s sonar.passive {"source":"engine","bearingDeg":201.53311502367578}
- 2941.1s sonar.passive {"source":"engine","bearingDeg":207.99439009284376}
- 2943.6s sonar.passive {"source":"engine","bearingDeg":201.55013227677065}
- 2944.1s sonar.passive {"source":"engine","bearingDeg":208.18507720186588}
- 2946.6s sonar.passive {"source":"engine","bearingDeg":201.3178912322947}
- 2947.1s sonar.passive {"source":"engine","bearingDeg":207.02829439738562}
- 2949.6s sonar.passive {"source":"engine","bearingDeg":201.39258545368887}
- 2950.1s sonar.passive {"source":"engine","bearingDeg":206.88732874051}
- 2952.6s sonar.passive {"source":"engine","bearingDeg":201.38152111542828}
- 2953.1s sonar.passive {"source":"engine","bearingDeg":206.88354867035707}
- 2955.6s sonar.passive {"source":"engine","bearingDeg":200.83347723654677}
- 2956.1s sonar.passive {"source":"engine","bearingDeg":208.44342338608354}
- 2958.6s sonar.passive {"source":"engine","bearingDeg":199.66660331928554}
- 2959.1s sonar.passive {"source":"engine","bearingDeg":206.9572644558883}
- 2961.6s sonar.passive {"source":"engine","bearingDeg":200.34536846730205}
- 2962.1s sonar.passive {"source":"engine","bearingDeg":208.12757347046838}
- 2964.6s sonar.passive {"source":"engine","bearingDeg":200.42623065805043}
- 2965.1s sonar.passive {"source":"engine","bearingDeg":207.82395663725586}
- 2967.6s sonar.passive {"source":"engine","bearingDeg":199.7911603784768}
- 2968.1s sonar.passive {"source":"engine","bearingDeg":208.02012493334786}
- 2970.6s sonar.passive {"source":"engine","bearingDeg":200.13081328224797}
- 2971.1s sonar.passive {"source":"engine","bearingDeg":208.90434309214803}
- 2973.6s sonar.passive {"source":"engine","bearingDeg":199.91566906377756}
- 2974.1s sonar.passive {"source":"engine","bearingDeg":207.11799296188414}
- 2976.6s sonar.passive {"source":"engine","bearingDeg":200.60182508488424}
- 2977.1s sonar.passive {"source":"engine","bearingDeg":208.00664332160807}
- 2979.6s sonar.passive {"source":"engine","bearingDeg":200.17666709119067}
- 2980.1s sonar.passive {"source":"engine","bearingDeg":207.3405013449848}
- 2982.6s sonar.passive {"source":"engine","bearingDeg":199.8496786953442}
- 2983.1s sonar.passive {"source":"engine","bearingDeg":208.9471382298563}
- 2985.6s sonar.passive {"source":"engine","bearingDeg":200.33434530381706}
- 2986.1s sonar.passive {"source":"engine","bearingDeg":209.07532600023657}
- 2988.6s sonar.passive {"source":"engine","bearingDeg":199.90021750124245}
- 2989.1s sonar.passive {"source":"engine","bearingDeg":208.50677026992417}
- 2991.6s sonar.passive {"source":"engine","bearingDeg":199.3528431288814}
- 2992.1s sonar.passive {"source":"engine","bearingDeg":207.72399315064584}
- 2994.6s sonar.passive {"source":"engine","bearingDeg":198.79722043987292}
- 2995.1s sonar.passive {"source":"engine","bearingDeg":209.25991649941122}
- 2997.6s sonar.passive {"source":"engine","bearingDeg":199.08657235080278}
- 2998.1s sonar.passive {"source":"engine","bearingDeg":207.49919367044654}
