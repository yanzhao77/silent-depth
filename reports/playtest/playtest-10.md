# Playtest 10 — Generated Heavy Convoy (t-014 evidence)

- **Version**: 95d3462
- **Mission**: GEN-05 — Generated Heavy Convoy (seed 2005, difficulty 3/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 843.6 s (16871 ticks)

## Actions

- pings: 110 · fire inputs: 0 · moving ticks: 16871 · turning ticks: 1830 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **DEFEAT** · score 250.03750000000002 (Failed) · hull 100 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

OUT_OF_BOUNDS — Player spent 60 s outside the map square.

## Difficulty

3/5

## Bugs (observed anomalies)

- Shared detection peaked at 99.975 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Detection peaked at 99.975 — escorts escalated (SUSPICIOUS→ALERT→HUNTING) and engaged the player.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 100 · survival 50 · total 250.03750000000002 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 114.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 120.5s sub.depthChanged {"layer":"Deep"}
- 120.5s detection.threshold {"detection":31.12499999999957,"band":"Suspicious"}
- 120.6s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 122.0s sonar.ping {"bearingDeg":325.2000000000189}
- 122.0s detection.threshold {"detection":42.37499999999961,"band":"Searching"}
- 126.5s sub.depthChanged {"layer":"Shallow"}
- 126.8s detection.threshold {"detection":39.999999999999744,"band":"Suspicious"}
- 129.5s sonar.ping {"bearingDeg":325.2000000000189}
- 129.5s detection.threshold {"detection":50.62499999999982,"band":"Searching"}
- 129.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 133.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 137.0s sonar.ping {"bearingDeg":313.9500000000206}
- 137.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 143.0s sub.depthChanged {"layer":"Deep"}
- 143.0s detection.threshold {"detection":31.12499999999938,"band":"Suspicious"}
- 143.1s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 144.5s sonar.ping {"bearingDeg":295.95000000002335}
- 144.5s detection.threshold {"detection":42.374999999999424,"band":"Searching"}
- 149.0s sub.depthChanged {"layer":"Shallow"}
- 149.3s detection.threshold {"detection":39.99999999999956,"band":"Suspicious"}
- 152.1s sonar.ping {"bearingDeg":295.95000000002335}
- 152.1s detection.threshold {"detection":50.62499999999964,"band":"Searching"}
- 152.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 155.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 159.6s sonar.ping {"bearingDeg":285.15949227542524}
- 159.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 165.6s sub.depthChanged {"layer":"Deep"}
- 165.6s detection.threshold {"detection":31.124999999999194,"band":"Suspicious"}
- 165.6s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 167.1s sonar.ping {"bearingDeg":277.3001306072597}
- 167.1s detection.threshold {"detection":42.37499999999924,"band":"Searching"}
- 171.6s sub.depthChanged {"layer":"Shallow"}
- 171.8s detection.threshold {"detection":39.999999999999375,"band":"Suspicious"}
- 174.6s sonar.ping {"bearingDeg":277.3001306072597}
- 174.6s detection.threshold {"detection":50.62499999999945,"band":"Searching"}
- 174.6s battery.low {"battery":9.35799999999753}
- 174.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 188.3s detection.threshold {"detection":39.999999999999524,"band":"Suspicious"}
- 228.4s detection.threshold {"detection":19.975000000000662,"band":"Unaware"}
- 258.3s escape.escaped {"missionId":"GEN-05","durationSeconds":30}
- 265.3s sub.forcedSurface
- 265.3s detection.threshold {"detection":99.975,"band":"Located"}
- 277.3s sub.depthChanged {"layer":"Deep"}
- 277.3s detection.threshold {"detection":66.97499999999931,"band":"Hunting"}
- 281.9s detection.threshold {"detection":59.99999999999905,"band":"Searching"}
- 297.9s sub.depthChanged {"layer":"Shallow"}
- 301.9s detection.threshold {"detection":39.999999999998764,"band":"Suspicious"}
- 341.9s detection.threshold {"detection":19.9999999999999,"band":"Unaware"}
- 843.6s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":100,"survival":5...
