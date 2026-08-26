# Playtest 10 — Generated Heavy Convoy (t-014 evidence)

- **Version**: 56a3133
- **Mission**: GEN-05 — Generated Heavy Convoy (seed 2005, difficulty 3/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 950.6 s (19011 ticks)

## Actions

- pings: 124 · fire inputs: 0 · moving ticks: 19011 · turning ticks: 2248 · fire rejections (tail): 0
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

- 129.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 133.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 137.0s sonar.ping {"bearingDeg":350.5500000000151}
- 137.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 141.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 144.5s sonar.ping {"bearingDeg":337.800000000017}
- 144.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 148.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 152.1s sonar.ping {"bearingDeg":325.05000000001894}
- 152.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 156.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 159.6s sonar.ping {"bearingDeg":312.3000000000209}
- 159.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 163.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 167.1s sonar.ping {"bearingDeg":299.5500000000228}
- 167.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 171.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 174.6s sonar.ping {"bearingDeg":286.9418218420401}
- 174.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 178.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 182.1s sonar.ping {"bearingDeg":279.624934251485}
- 182.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 186.4s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 189.6s sonar.ping {"bearingDeg":276.65897651757564}
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
- 305.5s sonar.ping {"bearingDeg":274.72766918549564}
- 305.5s sub.speedChanged {"band":"SILENT","speedKt":3,"noise":0}
- 310.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 313.0s sonar.ping {"bearingDeg":274.63566370407614}
- 313.0s sub.speedChanged {"band":"SILENT","speedKt":7.1999999999999895,"noise":8.399999999999977}
- 317.6s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 320.5s sonar.ping {"bearingDeg":274.535547412941}
- 320.5s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 324.9s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":7}
- 328.0s sonar.ping {"bearingDeg":274.42309195050143}
- 328.0s battery.low {"battery":8.570000000000212}
- 328.0s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":9.8}
- 338.3s sub.depthChanged {"layer":"Shallow"}
- 342.2s detection.threshold {"detection":39.99999999999794,"band":"Suspicious"}
- 382.2s detection.threshold {"detection":19.999999999999076,"band":"Unaware"}
- 950.6s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":100,"survival":5...
