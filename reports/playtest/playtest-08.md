# Playtest 08 — Generated Tanker Escort (t-014 evidence)

- **Version**: ea49653
- **Mission**: GEN-03 — Generated Tanker Escort (seed 2003, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **TIMEOUT** after 3000.1 s (60000 ticks)

## Actions

- pings: 397 · fire inputs: 0 · moving ticks: 60000 · turning ticks: 2248 · fire rejections (tail): 0
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

- 129.5s sonar.ping {"bearingDeg":271.89820941003677}
- 129.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 133.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 137.0s sonar.ping {"bearingDeg":272.0581552812722}
- 137.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 141.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 144.5s sonar.ping {"bearingDeg":272.29588468206407}
- 144.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 148.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 152.1s sonar.ping {"bearingDeg":272.565300668413}
- 152.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 156.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 159.6s sonar.ping {"bearingDeg":272.84579439372317}
- 159.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 163.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 167.1s sonar.ping {"bearingDeg":273.1284308297311}
- 167.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 171.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 174.6s sonar.ping {"bearingDeg":273.40929570118146}
- 174.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 178.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 182.1s sonar.ping {"bearingDeg":273.6865428009402}
- 182.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
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
- 305.5s sonar.ping {"bearingDeg":275.50499456802015}
- 305.5s sub.speedChanged {"band":"SILENT","speedKt":3,"noise":0}
- 310.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 313.0s sonar.ping {"bearingDeg":275.44457836979393}
- 313.0s sub.speedChanged {"band":"SILENT","speedKt":7.1999999999999895,"noise":8.399999999999977}
- 317.6s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 320.5s sonar.ping {"bearingDeg":275.3657198049809}
- 320.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 324.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 328.0s sonar.ping {"bearingDeg":275.27109338800415}
- 328.0s battery.low {"battery":8.570000000000212}
- 328.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 338.3s sub.depthChanged {"layer":"Shallow"}
- 342.2s detection.threshold {"detection":39.99999999999794,"band":"Suspicious"}
- 382.2s detection.threshold {"detection":19.999999999999076,"band":"Unaware"}
