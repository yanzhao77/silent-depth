# Playtest 03 — Convoy Attack (t-014 evidence)

- **Version**: dbb2afa
- **Mission**: M03 — Convoy Attack (seed 1003, difficulty 3/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 832.4 s (16647 ticks)

## Actions

- pings: 28 · fire inputs: 0 · moving ticks: 16647 · turning ticks: 16604 · fire rejections (tail): 0
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

- 803.4s sonar.passive {"source":"propeller","bearingDeg":18.07364831193928}
- 804.3s sonar.passive {"source":"engine","bearingDeg":278.3732419698117}
- 804.3s sonar.passive {"source":"engine","bearingDeg":271.03942109793184}
- 805.0s sonar.passive {"source":"engine","bearingDeg":277.9823012736763}
- 805.3s sonar.passive {"source":"engine","bearingDeg":270.7449730588436}
- 806.4s sonar.passive {"source":"propeller","bearingDeg":4.940261182510395}
- 807.3s sonar.passive {"source":"engine","bearingDeg":276.9755292077498}
- 807.3s sonar.passive {"source":"engine","bearingDeg":271.4087585872315}
- 808.0s sonar.passive {"source":"engine","bearingDeg":277.6909216842593}
- 808.4s sonar.passive {"source":"engine","bearingDeg":270.6319327416031}
- 809.5s sonar.passive {"source":"propeller","bearingDeg":352.8409549298327}
- 810.4s sonar.passive {"source":"engine","bearingDeg":278.5916256006566}
- 810.4s sonar.passive {"source":"engine","bearingDeg":270.9280934254925}
- 811.1s sonar.passive {"source":"engine","bearingDeg":277.70961400103766}
- 811.4s sonar.passive {"source":"engine","bearingDeg":270.3550636273278}
- 812.5s sonar.passive {"source":"propeller","bearingDeg":340.7890501334166}
- 813.4s sonar.passive {"source":"engine","bearingDeg":277.12732303092986}
- 813.4s sonar.passive {"source":"engine","bearingDeg":269.7936495064465}
- 814.1s sonar.passive {"source":"engine","bearingDeg":278.89844596041996}
- 814.5s sonar.passive {"source":"engine","bearingDeg":271.1503958619938}
- 815.6s sonar.passive {"source":"propeller","bearingDeg":328.1314534473181}
- 816.5s sonar.passive {"source":"engine","bearingDeg":277.9641232292199}
- 816.5s sonar.passive {"source":"engine","bearingDeg":270.7595032383597}
- 817.2s sonar.passive {"source":"engine","bearingDeg":279.05955195109}
- 817.5s sonar.passive {"source":"engine","bearingDeg":271.1136213707266}
- 818.6s sonar.passive {"source":"propeller","bearingDeg":317.8997585797215}
- 819.5s sonar.passive {"source":"engine","bearingDeg":278.63090671009456}
- 819.5s sonar.passive {"source":"engine","bearingDeg":270.4269929287798}
- 820.2s sonar.passive {"source":"engine","bearingDeg":278.84293414861395}
- 820.6s sonar.passive {"source":"engine","bearingDeg":270.38287846573473}
- 821.7s sonar.passive {"source":"propeller","bearingDeg":309.34773393428117}
- 822.6s sonar.passive {"source":"engine","bearingDeg":278.9347948939091}
- 822.6s sonar.passive {"source":"engine","bearingDeg":271.73658609407937}
- 823.3s sonar.passive {"source":"engine","bearingDeg":279.5772744381106}
- 823.6s sonar.passive {"source":"engine","bearingDeg":270.96511142605306}
- 824.7s sonar.passive {"source":"propeller","bearingDeg":302.13733970595774}
- 825.6s sonar.passive {"source":"engine","bearingDeg":278.8722423754324}
- 825.6s sonar.passive {"source":"engine","bearingDeg":271.3025519186317}
- 826.3s sonar.passive {"source":"engine","bearingDeg":278.4211090097159}
- 826.7s sonar.passive {"source":"engine","bearingDeg":270.5599058555415}
- 827.8s sonar.passive {"source":"propeller","bearingDeg":296.9128328282676}
- 828.7s sonar.passive {"source":"engine","bearingDeg":277.61871776998936}
- 828.7s sonar.passive {"source":"engine","bearingDeg":270.7619855504976}
- 829.4s sonar.passive {"source":"engine","bearingDeg":278.7261817779239}
- 829.7s sonar.passive {"source":"engine","bearingDeg":270.19722261720096}
- 830.8s sonar.passive {"source":"propeller","bearingDeg":297.78099783762264}
- 831.7s sonar.passive {"source":"engine","bearingDeg":278.26493067247554}
- 831.7s sonar.passive {"source":"engine","bearingDeg":271.1677496628456}
- 832.4s sub.damaged {"source":"collision","amount":11,"hullLeft":0}
- 832.4s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":0,"...
