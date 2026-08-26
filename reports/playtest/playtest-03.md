# Playtest 03 — Convoy Attack (t-014 evidence)

- **Version**: 4402fe1
- **Mission**: M03 — Convoy Attack (seed 1003, difficulty 3/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 832.1 s (16642 ticks)

## Actions

- pings: 28 · fire inputs: 0 · moving ticks: 16642 · turning ticks: 16602 · fire rejections (tail): 0
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

- 803.4s sonar.passive {"source":"propeller","bearingDeg":172.22479634635968}
- 804.0s sonar.passive {"source":"engine","bearingDeg":276.7735175725633}
- 804.3s sonar.passive {"source":"engine","bearingDeg":268.91835985956124}
- 806.3s sonar.passive {"source":"engine","bearingDeg":268.4909551925253}
- 806.4s sonar.passive {"source":"engine","bearingDeg":276.20202570988647}
- 806.4s sonar.passive {"source":"propeller","bearingDeg":184.4883092755501}
- 807.1s sonar.passive {"source":"engine","bearingDeg":276.4741332434319}
- 807.4s sonar.passive {"source":"engine","bearingDeg":270.0511362727821}
- 809.4s sonar.passive {"source":"engine","bearingDeg":268.3377448551812}
- 809.4s sonar.passive {"source":"engine","bearingDeg":275.56925245541527}
- 809.5s sonar.passive {"source":"propeller","bearingDeg":197.16015681479587}
- 810.1s sonar.passive {"source":"engine","bearingDeg":276.44449997185365}
- 810.4s sonar.passive {"source":"engine","bearingDeg":269.18618276956994}
- 812.4s sonar.passive {"source":"engine","bearingDeg":268.8685286181718}
- 812.5s sonar.passive {"source":"engine","bearingDeg":276.651956067202}
- 812.5s sonar.passive {"source":"propeller","bearingDeg":209.32661656507162}
- 813.2s sonar.passive {"source":"engine","bearingDeg":277.4763065173022}
- 813.5s sonar.passive {"source":"engine","bearingDeg":268.3883250238022}
- 815.5s sonar.passive {"source":"engine","bearingDeg":269.9556887211496}
- 815.5s sonar.passive {"source":"engine","bearingDeg":276.2780995893075}
- 815.6s sonar.passive {"source":"propeller","bearingDeg":220.27461314081899}
- 816.2s sonar.passive {"source":"engine","bearingDeg":277.5433836743052}
- 816.5s sonar.passive {"source":"engine","bearingDeg":268.72177883383085}
- 818.5s sonar.passive {"source":"engine","bearingDeg":268.68013804182385}
- 818.6s sonar.passive {"source":"engine","bearingDeg":276.5351009724591}
- 818.6s sonar.passive {"source":"propeller","bearingDeg":231.34447118245504}
- 819.3s sonar.passive {"source":"engine","bearingDeg":276.7463636854691}
- 819.6s sonar.passive {"source":"engine","bearingDeg":269.98075082951357}
- 821.6s sonar.passive {"source":"engine","bearingDeg":269.02146766839473}
- 821.6s sonar.passive {"source":"engine","bearingDeg":276.1937459987307}
- 821.7s sonar.passive {"source":"propeller","bearingDeg":240.46688152053088}
- 822.3s sonar.passive {"source":"engine","bearingDeg":277.0655317526521}
- 822.6s sonar.passive {"source":"engine","bearingDeg":268.88896821738393}
- 824.6s sonar.passive {"source":"engine","bearingDeg":269.57312932637205}
- 824.7s sonar.passive {"source":"engine","bearingDeg":276.63521414632487}
- 824.7s sonar.passive {"source":"propeller","bearingDeg":247.97018986795123}
- 825.4s sonar.passive {"source":"engine","bearingDeg":276.6181460476462}
- 825.7s sonar.passive {"source":"engine","bearingDeg":269.3953082824332}
- 827.7s sonar.passive {"source":"engine","bearingDeg":268.9995745106915}
- 827.7s sonar.passive {"source":"engine","bearingDeg":276.1838191111249}
- 827.8s sonar.passive {"source":"propeller","bearingDeg":253.8425605373851}
- 828.4s sonar.passive {"source":"engine","bearingDeg":276.1168203629869}
- 828.7s sonar.passive {"source":"engine","bearingDeg":268.9339306428936}
- 830.7s sonar.passive {"source":"engine","bearingDeg":268.75157530859195}
- 830.8s sonar.passive {"source":"engine","bearingDeg":275.21128975735525}
- 830.8s sonar.passive {"source":"propeller","bearingDeg":253.164894307863}
- 831.5s sonar.passive {"source":"engine","bearingDeg":277.3572990735288}
- 831.8s sonar.passive {"source":"engine","bearingDeg":268.6288679670289}
- 832.1s sub.damaged {"source":"collision","amount":11,"hullLeft":0}
- 832.1s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":0,"...
