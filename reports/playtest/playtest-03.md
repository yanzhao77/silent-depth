# Playtest 03 — Convoy Attack (t-014 evidence)

- **Version**: ed9227c
- **Mission**: M03 — Convoy Attack (seed 1003, difficulty 3/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 829.0 s (16580 ticks)

## Actions

- pings: 28 · fire inputs: 0 · moving ticks: 16580 · turning ticks: 16540 · fire rejections (tail): 0
- strategy: Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.

## Result

- outcome: **DEFEAT** · score 100.03750000000001 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

3/5

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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 100 · survival 0 · total 100.03750000000001 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 799.9s sonar.passive {"source":"engine","bearingDeg":279.0072236723415}
- 800.3s sonar.passive {"source":"propeller","bearingDeg":181.42972341511103}
- 801.1s sonar.passive {"source":"engine","bearingDeg":271.1420758487942}
- 802.0s sonar.passive {"source":"engine","bearingDeg":271.3397245695836}
- 802.4s sonar.passive {"source":"engine","bearingDeg":279.06123380162154}
- 802.9s sonar.passive {"source":"engine","bearingDeg":279.72439409837096}
- 803.4s sonar.passive {"source":"propeller","bearingDeg":194.82019533878048}
- 804.2s sonar.passive {"source":"engine","bearingDeg":271.5545766237058}
- 805.1s sonar.passive {"source":"engine","bearingDeg":272.14092913226006}
- 805.4s sonar.passive {"source":"engine","bearingDeg":277.8668093413501}
- 806.0s sonar.passive {"source":"engine","bearingDeg":278.9604479607114}
- 806.4s sonar.passive {"source":"propeller","bearingDeg":205.96825374907354}
- 807.2s sonar.passive {"source":"engine","bearingDeg":270.8227540905971}
- 808.1s sonar.passive {"source":"engine","bearingDeg":271.24772959140864}
- 808.5s sonar.passive {"source":"engine","bearingDeg":277.715217641446}
- 809.0s sonar.passive {"source":"engine","bearingDeg":279.6656200097627}
- 809.5s sonar.passive {"source":"propeller","bearingDeg":217.23493377409116}
- 810.3s sonar.passive {"source":"engine","bearingDeg":270.96524375142087}
- 811.2s sonar.passive {"source":"engine","bearingDeg":272.13268583633584}
- 811.5s sonar.passive {"source":"engine","bearingDeg":278.98294885934223}
- 812.1s sonar.passive {"source":"engine","bearingDeg":279.69364922695127}
- 812.5s sonar.passive {"source":"propeller","bearingDeg":228.3345502769931}
- 813.3s sonar.passive {"source":"engine","bearingDeg":271.771990544735}
- 814.2s sonar.passive {"source":"engine","bearingDeg":270.918725741063}
- 814.6s sonar.passive {"source":"engine","bearingDeg":277.9697889352043}
- 815.1s sonar.passive {"source":"engine","bearingDeg":279.80337213504333}
- 815.6s sonar.passive {"source":"propeller","bearingDeg":239.03736325452658}
- 816.4s sonar.passive {"source":"engine","bearingDeg":271.74067557452287}
- 817.3s sonar.passive {"source":"engine","bearingDeg":271.67026807657606}
- 817.6s sonar.passive {"source":"engine","bearingDeg":277.40756666066767}
- 818.2s sonar.passive {"source":"engine","bearingDeg":278.7980769726432}
- 818.6s sonar.passive {"source":"propeller","bearingDeg":248.34239847729714}
- 819.4s sonar.passive {"source":"engine","bearingDeg":270.5868024962874}
- 820.3s sonar.passive {"source":"engine","bearingDeg":270.5483580472869}
- 820.7s sonar.passive {"source":"engine","bearingDeg":278.7117720161597}
- 821.2s sonar.passive {"source":"engine","bearingDeg":278.5504168933199}
- 821.7s sonar.passive {"source":"propeller","bearingDeg":253.76933589333112}
- 822.5s sonar.passive {"source":"engine","bearingDeg":270.14486359170223}
- 823.4s sonar.passive {"source":"engine","bearingDeg":271.77047167181956}
- 823.7s sonar.passive {"source":"engine","bearingDeg":277.3951107878478}
- 824.3s sonar.passive {"source":"engine","bearingDeg":278.68715337419053}
- 824.7s sonar.passive {"source":"propeller","bearingDeg":257.56793234108557}
- 825.5s sonar.passive {"source":"engine","bearingDeg":270.7130189973442}
- 826.4s sonar.passive {"source":"engine","bearingDeg":270.0865024925049}
- 826.8s sonar.passive {"source":"engine","bearingDeg":277.3234209656141}
- 827.3s sonar.passive {"source":"engine","bearingDeg":278.87987539925484}
- 827.8s sonar.passive {"source":"propeller","bearingDeg":256.57730932926785}
- 828.6s sonar.passive {"source":"engine","bearingDeg":270.78108819425915}
- 829.0s sub.damaged {"source":"collision","amount":11,"hullLeft":0}
- 829.0s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":0,"...
