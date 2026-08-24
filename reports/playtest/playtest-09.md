# Playtest 09 — Generated Convoy + Destroyer (t-014 evidence)

- **Version**: 750cc0b
- **Mission**: GEN-04 — Generated Convoy + Destroyer (seed 2004, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 2704.1 s (54081 ticks)

## Actions

- pings: 287 · fire inputs: 0 · moving ticks: 54081 · turning ticks: 12364 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **DEFEAT** · score 144.41455706148162 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

2/5

## Bugs (observed anomalies)

- Shared detection peaked at 99.975 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Detection peaked at 99.975 — escorts escalated (SUSPICIOUS→ALERT→HUNTING) and engaged the player.
- Escort attack damaged the player to hull 0 (depth charges / deck gun).
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): escort passive detection (F3 base 0.05 %/s over 6 km, any noise ≥ 1) escalates before a scripted ambush can form; consider a noise floor or slower escalation at SUSPICIOUS.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.

## Evidence

### Score parts
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 44.377057061481615 · survival 0 · total 144.41455706148162 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2668.7s sonar.passive {"source":"engine","bearingDeg":151.32538309867886}
- 2668.7s sonar.passive {"source":"propeller","bearingDeg":82.04559909792843}
- 2669.0s sonar.passive {"source":"engine","bearingDeg":148.21429824752903}
- 2671.2s sonar.passive {"source":"engine","bearingDeg":140.7931788223129}
- 2671.7s sonar.passive {"source":"engine","bearingDeg":152.0163807234412}
- 2671.7s sonar.passive {"source":"propeller","bearingDeg":94.00106305597943}
- 2672.0s sonar.passive {"source":"engine","bearingDeg":147.49819688240865}
- 2674.2s sonar.passive {"source":"engine","bearingDeg":140.15554126573343}
- 2674.7s sonar.passive {"source":"engine","bearingDeg":152.74378018615081}
- 2674.7s sonar.passive {"source":"propeller","bearingDeg":106.34503224710717}
- 2675.0s sonar.passive {"source":"engine","bearingDeg":148.1721337498674}
- 2677.2s sonar.passive {"source":"engine","bearingDeg":139.98432179497112}
- 2677.7s sonar.passive {"source":"engine","bearingDeg":151.54989718329284}
- 2677.7s sonar.passive {"source":"propeller","bearingDeg":119.33481096798906}
- 2678.0s sonar.passive {"source":"engine","bearingDeg":148.38711713810576}
- 2680.2s sonar.passive {"source":"engine","bearingDeg":139.72462710287303}
- 2680.7s sonar.passive {"source":"engine","bearingDeg":151.6885633953314}
- 2680.7s sonar.passive {"source":"propeller","bearingDeg":130.21710353397202}
- 2681.0s sonar.passive {"source":"engine","bearingDeg":147.14575929342578}
- 2683.2s sonar.passive {"source":"engine","bearingDeg":140.0011315924201}
- 2683.7s sonar.passive {"source":"engine","bearingDeg":152.43749180165793}
- 2683.7s sonar.passive {"source":"propeller","bearingDeg":142.4152682623887}
- 2684.0s sonar.passive {"source":"engine","bearingDeg":147.06006191251777}
- 2686.2s sonar.passive {"source":"engine","bearingDeg":139.668671541654}
- 2686.7s sonar.passive {"source":"engine","bearingDeg":152.30265245053354}
- 2686.7s sonar.passive {"source":"propeller","bearingDeg":151.48731336193234}
- 2687.0s sonar.passive {"source":"engine","bearingDeg":148.2454507361823}
- 2689.2s sonar.passive {"source":"engine","bearingDeg":140.0554143346812}
- 2689.7s sonar.passive {"source":"engine","bearingDeg":150.4900486504836}
- 2689.7s sonar.passive {"source":"propeller","bearingDeg":162.3025523419174}
- 2690.0s sonar.passive {"source":"engine","bearingDeg":147.66073797361165}
- 2692.2s sonar.passive {"source":"engine","bearingDeg":140.63770762642935}
- 2692.7s sonar.passive {"source":"engine","bearingDeg":151.092171141566}
- 2692.7s sonar.passive {"source":"propeller","bearingDeg":168.34068084586661}
- 2693.0s sonar.passive {"source":"engine","bearingDeg":147.3070399090297}
- 2695.2s sonar.passive {"source":"engine","bearingDeg":138.84618649688517}
- 2695.7s sonar.passive {"source":"engine","bearingDeg":151.57902821126135}
- 2695.7s sonar.passive {"source":"propeller","bearingDeg":171.4766440045944}
- 2696.0s sonar.passive {"source":"engine","bearingDeg":146.98909687913107}
- 2698.2s sonar.passive {"source":"engine","bearingDeg":139.175829375445}
- 2698.7s sonar.passive {"source":"engine","bearingDeg":150.44852539660172}
- 2698.7s sonar.passive {"source":"propeller","bearingDeg":169.3803215098049}
- 2699.0s sonar.passive {"source":"engine","bearingDeg":147.27387089852274}
- 2699.1s sub.damaged {"source":"collision","amount":18,"hullLeft":15}
- 2701.2s sonar.passive {"source":"engine","bearingDeg":138.75773672320793}
- 2701.7s sonar.passive {"source":"engine","bearingDeg":149.95703321251082}
- 2701.7s sonar.passive {"source":"propeller","bearingDeg":169.0471766027465}
- 2702.0s sonar.passive {"source":"engine","bearingDeg":147.60106656575581}
- 2704.1s sub.damaged {"source":"collision","amount":19,"hullLeft":0}
- 2704.1s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":44.3770570614816...
