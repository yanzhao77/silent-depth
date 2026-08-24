# Playtest 10 — Generated Heavy Convoy (t-014 evidence)

- **Version**: 1c87353
- **Mission**: GEN-05 — Generated Heavy Convoy (seed 2005, difficulty 3/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 954.1 s (19082 ticks)

## Actions

- pings: 124 · fire inputs: 0 · moving ticks: 19082 · turning ticks: 1876 · fire rejections (tail): 0
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

- 99.5s sonar.ping {"bearingDeg":54.150000000005434}
- 99.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 103.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 107.0s sonar.ping {"bearingDeg":41.550000000007344}
- 107.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 111.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 114.5s sonar.ping {"bearingDeg":28.800000000009277}
- 114.6s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 118.8s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 122.0s sonar.ping {"bearingDeg":16.05000000001121}
- 122.1s sub.speedChanged {"band":"SILENT","speedKt":7.9,"noise":14.8}
- 126.3s sub.speedChanged {"band":"CRUISE","speedKt":3.1,"noise":12}
- 129.5s sonar.ping {"bearingDeg":3.300000000013142}
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
- 311.4s sub.depthChanged {"layer":"Shallow"}
- 315.4s detection.threshold {"detection":39.999999999998764,"band":"Suspicious"}
- 355.4s detection.threshold {"detection":19.9999999999999,"band":"Unaware"}
- 954.1s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":100,"survival":5...
