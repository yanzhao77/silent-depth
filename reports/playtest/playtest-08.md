# Playtest 08 — Generated Tanker Escort (t-014 evidence)

- **Version**: 0be1659
- **Mission**: GEN-03 — Generated Tanker Escort (seed 2003, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 397 · fire inputs: 0 · moving ticks: 60000 · turning ticks: 2843 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **TIMEOUT** · score 190.03683334441564 (Failed) · hull 100 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

SINK_OBJECTIVE_NOT_MET — 1 sink(s) required; 0 sunk within the tick budget.

## Difficulty

2/5

## Bugs (observed anomalies)

- Shared detection peaked at 99.975 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Detection peaked at 99.975 — escorts escalated (SUSPICIOUS→ALERT→HUNTING) and engaged the player.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 39.99933334441562 · survival 50 · total 190.03683334441564 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 186.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 189.6s sonar.ping {"bearingDeg":273.95906622855136}
- 189.6s battery.low {"battery":9.246000000004244}
- 189.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 203.7s detection.threshold {"detection":39.99999999999924,"band":"Suspicious"}
- 243.8s detection.threshold {"detection":19.975000000000378,"band":"Unaware"}
- 278.8s sub.forcedSurface
- 278.8s detection.threshold {"detection":99.975,"band":"Located"}
- 290.8s sub.depthChanged {"layer":"Deep"}
- 290.8s detection.threshold {"detection":66.97499999999931,"band":"Hunting"}
- 295.4s detection.threshold {"detection":59.99999999999905,"band":"Searching"}
- 305.5s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 305.5s sonar.ping {"bearingDeg":275.50840417003064}
- 305.5s sub.speedChanged {"band":"SILENT","speedKt":3,"noise":0}
- 310.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 313.0s sonar.ping {"bearingDeg":275.4458617135872}
- 313.0s sub.speedChanged {"band":"SILENT","speedKt":7.1999999999999895,"noise":8.399999999999977}
- 317.6s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 320.5s sonar.ping {"bearingDeg":275.3663402020486}
- 320.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 324.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 328.0s sonar.ping {"bearingDeg":275.27146063452733}
- 328.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 332.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 335.5s sonar.ping {"bearingDeg":275.1638581769587}
- 335.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 339.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 343.0s sonar.ping {"bearingDeg":275.0483088957676}
- 343.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 347.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 350.5s sonar.ping {"bearingDeg":274.9259877245222}
- 350.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 354.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 358.0s sonar.ping {"bearingDeg":274.7988994857965}
- 358.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 362.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 365.5s sonar.ping {"bearingDeg":274.6682886100042}
- 365.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 369.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 373.0s sonar.ping {"bearingDeg":274.53506711408454}
- 373.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 377.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 380.5s sonar.ping {"bearingDeg":274.4000137184513}
- 380.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 384.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 385.9s battery.low {"battery":9.995499999998483}
- 385.9s sub.speedChanged {"band":"SILENT","speedKt":5.199999999999997,"noise":9.399999999999993}
- 390.7s sub.depthChanged {"layer":"Shallow"}
- 394.7s detection.threshold {"detection":39.999999999996895,"band":"Suspicious"}
- 434.7s detection.threshold {"detection":19.999999999998032,"band":"Unaware"}
