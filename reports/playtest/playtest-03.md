# Playtest 03 — Convoy Attack (t-014 evidence)

- **Version**: 95d3462
- **Mission**: M03 — Convoy Attack (seed 1003, difficulty 3/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 833.4 s (16667 ticks)

## Actions

- pings: 28 · fire inputs: 0 · moving ticks: 16667 · turning ticks: 16625 · fire rejections (tail): 0
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

- 804.5s sonar.passive {"source":"engine","bearingDeg":281.5550512123919}
- 804.8s sonar.passive {"source":"propeller","bearingDeg":65.61596715347157}
- 805.7s sonar.passive {"source":"engine","bearingDeg":273.36665431616046}
- 806.7s sonar.passive {"source":"engine","bearingDeg":279.34467662016095}
- 807.5s sonar.passive {"source":"engine","bearingDeg":272.5339930176706}
- 807.6s sonar.passive {"source":"engine","bearingDeg":279.9890016009407}
- 807.8s sonar.passive {"source":"propeller","bearingDeg":52.95439378429937}
- 808.8s sonar.passive {"source":"engine","bearingDeg":273.2884772940082}
- 809.7s sonar.passive {"source":"engine","bearingDeg":279.03131776008956}
- 810.5s sonar.passive {"source":"engine","bearingDeg":272.6445365197315}
- 810.6s sonar.passive {"source":"engine","bearingDeg":281.50480599983416}
- 810.9s sonar.passive {"source":"propeller","bearingDeg":41.095750626352356}
- 811.8s sonar.passive {"source":"engine","bearingDeg":273.1160866964189}
- 812.8s sonar.passive {"source":"engine","bearingDeg":279.5117823829172}
- 813.6s sonar.passive {"source":"engine","bearingDeg":272.2255454435237}
- 813.7s sonar.passive {"source":"engine","bearingDeg":281.52258251513604}
- 813.9s sonar.passive {"source":"propeller","bearingDeg":29.25757957126781}
- 814.9s sonar.passive {"source":"engine","bearingDeg":273.6518140171477}
- 815.8s sonar.passive {"source":"engine","bearingDeg":280.1338673196829}
- 816.6s sonar.passive {"source":"engine","bearingDeg":273.2704243779531}
- 816.7s sonar.passive {"source":"engine","bearingDeg":281.47207809200233}
- 817.0s sonar.passive {"source":"propeller","bearingDeg":18.908599888324815}
- 817.9s sonar.passive {"source":"engine","bearingDeg":272.8118031131285}
- 818.9s sonar.passive {"source":"engine","bearingDeg":280.9557928569591}
- 819.7s sonar.passive {"source":"engine","bearingDeg":273.74476781495616}
- 819.8s sonar.passive {"source":"engine","bearingDeg":281.8132852329578}
- 820.0s sonar.passive {"source":"propeller","bearingDeg":8.416625516374623}
- 821.0s sonar.passive {"source":"engine","bearingDeg":274.181602587063}
- 821.9s sonar.passive {"source":"engine","bearingDeg":280.4158166670314}
- 822.7s sonar.passive {"source":"engine","bearingDeg":273.57420217039083}
- 822.8s sonar.passive {"source":"engine","bearingDeg":281.88154831617646}
- 823.1s sonar.passive {"source":"propeller","bearingDeg":359.35848290000513}
- 824.0s sonar.passive {"source":"engine","bearingDeg":273.18071543104514}
- 825.0s sonar.passive {"source":"engine","bearingDeg":279.81896209025166}
- 825.8s sonar.passive {"source":"engine","bearingDeg":273.79436833109276}
- 825.9s sonar.passive {"source":"engine","bearingDeg":281.4890460960303}
- 826.1s sonar.passive {"source":"propeller","bearingDeg":353.4683856547691}
- 827.1s sonar.passive {"source":"engine","bearingDeg":274.17142045783066}
- 828.0s sonar.passive {"source":"engine","bearingDeg":280.33389179566365}
- 828.8s sonar.passive {"source":"engine","bearingDeg":273.79840152105413}
- 828.9s sonar.passive {"source":"engine","bearingDeg":282.19666135198327}
- 829.2s sonar.passive {"source":"propeller","bearingDeg":350.9154921986328}
- 830.1s sonar.passive {"source":"engine","bearingDeg":274.78991604842633}
- 831.1s sonar.passive {"source":"engine","bearingDeg":281.39316201010536}
- 831.9s sonar.passive {"source":"engine","bearingDeg":273.60386937171177}
- 832.0s sonar.passive {"source":"engine","bearingDeg":282.3884360918994}
- 832.2s sonar.passive {"source":"propeller","bearingDeg":351.5129273263839}
- 833.2s sonar.passive {"source":"engine","bearingDeg":273.92936649211754}
- 833.4s sub.damaged {"source":"collision","amount":11,"hullLeft":0}
- 833.4s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":0,"...
