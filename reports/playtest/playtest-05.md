# Playtest 05 — Silent Hunter (t-014 evidence)

- **Version**: 0be1659
- **Mission**: M05 — Silent Hunter (seed 1005, difficulty 5/5)
- **Agent**: scripted-brain-sink-and-escape (Sink then escape (M05 best effort))
- **Result**: **DEFEAT** after 1407.7 s (28154 ticks)

## Actions

- pings: 90 · fire inputs: 0 · moving ticks: 28154 · turning ticks: 26913 · fire rejections (tail): 0
- strategy: Phase 1: convoy-attack behavior until the first ship is sunk; Phase 2: Deep + silent running, creep away from the nearest escort to satisfy F9 (detection < 20, escorts > 3 km for 30 s).

## Result

- outcome: **DEFEAT** · score 300.0375 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

5/5

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
- objective 150 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 100 · survival 50 · total 300.0375 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 1387.0s sonar.passive {"source":"engine","bearingDeg":75.44558336591255}
- 1387.0s sonar.passive {"source":"engine","bearingDeg":67.64178433820959}
- 1387.6s sonar.passive {"source":"engine","bearingDeg":78.63527519240243}
- 1388.4s sonar.passive {"source":"propeller","bearingDeg":124.5048644145039}
- 1388.4s sonar.passive {"source":"propeller","bearingDeg":52.305778072138594}
- 1389.7s sonar.passive {"source":"propeller","bearingDeg":86.64125303107787}
- 1389.7s sonar.passive {"source":"engine","bearingDeg":62.59322315324533}
- 1390.1s sonar.passive {"source":"engine","bearingDeg":76.49164508967533}
- 1390.1s sonar.passive {"source":"engine","bearingDeg":67.1353753568076}
- 1390.6s sonar.passive {"source":"engine","bearingDeg":78.30292926103778}
- 1391.5s sonar.passive {"source":"propeller","bearingDeg":113.5165150188403}
- 1391.5s sonar.passive {"source":"propeller","bearingDeg":63.66946487608473}
- 1392.7s sonar.passive {"source":"propeller","bearingDeg":86.93618875486837}
- 1392.8s sonar.passive {"source":"engine","bearingDeg":61.212442394572804}
- 1393.1s sonar.passive {"source":"engine","bearingDeg":76.19379739050494}
- 1393.1s sonar.passive {"source":"engine","bearingDeg":65.95193290977248}
- 1393.7s sonar.passive {"source":"engine","bearingDeg":78.67313661126207}
- 1394.5s sonar.passive {"source":"propeller","bearingDeg":102.09707257279807}
- 1394.5s sonar.passive {"source":"propeller","bearingDeg":75.27064074834846}
- 1395.8s sonar.passive {"source":"propeller","bearingDeg":87.39925636169211}
- 1395.8s sonar.passive {"source":"engine","bearingDeg":61.07214309403263}
- 1396.2s sonar.passive {"source":"engine","bearingDeg":76.2429490275142}
- 1396.2s sonar.passive {"source":"engine","bearingDeg":66.67305667581148}
- 1396.7s sonar.passive {"source":"engine","bearingDeg":78.4958200263989}
- 1397.6s sonar.passive {"source":"propeller","bearingDeg":91.95662855179755}
- 1397.6s sonar.passive {"source":"propeller","bearingDeg":83.67523392986668}
- 1398.8s sonar.passive {"source":"propeller","bearingDeg":86.63849575356173}
- 1398.9s sonar.passive {"source":"engine","bearingDeg":62.75770382278527}
- 1399.2s sonar.passive {"source":"engine","bearingDeg":75.14737711420874}
- 1399.2s sonar.passive {"source":"engine","bearingDeg":66.39627879197634}
- 1399.8s sonar.passive {"source":"engine","bearingDeg":77.46851980189828}
- 1400.6s sonar.passive {"source":"propeller","bearingDeg":89.00009516879437}
- 1400.6s sonar.passive {"source":"propeller","bearingDeg":89.07728740843243}
- 1401.9s sonar.passive {"source":"propeller","bearingDeg":86.57865780155734}
- 1401.9s sonar.passive {"source":"engine","bearingDeg":61.524146188395896}
- 1402.3s sonar.passive {"source":"engine","bearingDeg":75.65577266749705}
- 1402.3s sonar.passive {"source":"engine","bearingDeg":66.89144043331675}
- 1402.7s sub.damaged {"source":"collision","amount":14,"hullLeft":3}
- 1402.8s sonar.passive {"source":"engine","bearingDeg":77.91404353059315}
- 1403.7s sonar.passive {"source":"propeller","bearingDeg":88.94992224681621}
- 1403.7s sonar.passive {"source":"propeller","bearingDeg":87.84104903439845}
- 1404.9s sonar.passive {"source":"propeller","bearingDeg":87.34185202863591}
- 1405.0s sonar.passive {"source":"engine","bearingDeg":61.30810097528794}
- 1405.3s sonar.passive {"source":"engine","bearingDeg":75.94468852145906}
- 1405.3s sonar.passive {"source":"engine","bearingDeg":65.49348599536003}
- 1405.9s sonar.passive {"source":"engine","bearingDeg":77.31845609762559}
- 1406.7s sonar.passive {"source":"propeller","bearingDeg":86.24966670164477}
- 1406.7s sonar.passive {"source":"propeller","bearingDeg":86.29174804107444}
- 1407.7s sub.damaged {"source":"collision","amount":16,"hullLeft":0}
- 1407.7s mission.defeat {"scoreParts":{"objective":150,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":5...
