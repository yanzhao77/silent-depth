# Playtest 04 — Heavy Escort (t-014 evidence)

- **Version**: 126cd83
- **Mission**: M04 — Heavy Escort (seed 1004, difficulty 4/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 2785.9 s (55717 ticks)

## Actions

- pings: 292 · fire inputs: 0 · moving ticks: 55717 · turning ticks: 13273 · fire rejections (tail): 0
- strategy: Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.

## Result

- outcome: **DEFEAT** · score 75.4170900785731 (Failed) · hull 0 · battery 0.0% · detection 0.0
- sunk: none · damage dealt: 0.0 hull points

## Failure

DESTROYED_BY_ESCORT — Player hull reached 0 (escort depth charges / deck gun or collision).

## Difficulty

4/5

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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 75.37959007857309 · survival 0 · total 75.4170900785731 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2762.0s sonar.passive {"source":"propeller","bearingDeg":31.373497636080334}
- 2763.4s sonar.passive {"source":"engine","bearingDeg":140.83293518164731}
- 2763.7s sonar.passive {"source":"engine","bearingDeg":134.92845238365345}
- 2764.1s sonar.passive {"source":"engine","bearingDeg":130.14757651236314}
- 2764.4s sonar.passive {"source":"engine","bearingDeg":136.83769662402628}
- 2764.9s sonar.passive {"source":"propeller","bearingDeg":42.92276766421671}
- 2765.0s sonar.passive {"source":"propeller","bearingDeg":43.7558878484154}
- 2766.4s sonar.passive {"source":"engine","bearingDeg":140.05958377547532}
- 2766.7s sonar.passive {"source":"engine","bearingDeg":134.18531116834922}
- 2767.1s sonar.passive {"source":"engine","bearingDeg":130.9026035448921}
- 2767.4s sonar.passive {"source":"engine","bearingDeg":136.68303529751756}
- 2767.9s sonar.passive {"source":"propeller","bearingDeg":54.573272550845054}
- 2768.0s sonar.passive {"source":"propeller","bearingDeg":53.825753658729134}
- 2769.4s sonar.passive {"source":"engine","bearingDeg":140.16638223620362}
- 2769.7s sonar.passive {"source":"engine","bearingDeg":134.36260123986565}
- 2770.1s sonar.passive {"source":"engine","bearingDeg":129.7576733761}
- 2770.4s sonar.passive {"source":"engine","bearingDeg":135.89171937469848}
- 2770.9s sonar.passive {"source":"propeller","bearingDeg":64.26591832187931}
- 2771.0s sonar.passive {"source":"propeller","bearingDeg":64.94049132718368}
- 2772.4s sonar.passive {"source":"engine","bearingDeg":139.992307502244}
- 2772.7s sonar.passive {"source":"engine","bearingDeg":134.46681630419846}
- 2773.1s sonar.passive {"source":"engine","bearingDeg":129.4727728471405}
- 2773.4s sonar.passive {"source":"engine","bearingDeg":135.6765635233832}
- 2773.9s sonar.passive {"source":"propeller","bearingDeg":73.73435790640082}
- 2774.0s sonar.passive {"source":"propeller","bearingDeg":73.20714896641293}
- 2775.4s sonar.passive {"source":"engine","bearingDeg":140.0631740015943}
- 2775.7s sonar.passive {"source":"engine","bearingDeg":134.53487292895525}
- 2776.1s sonar.passive {"source":"engine","bearingDeg":129.71960004264974}
- 2776.4s sonar.passive {"source":"engine","bearingDeg":134.93955994798912}
- 2776.9s sonar.passive {"source":"propeller","bearingDeg":81.72680607154182}
- 2777.0s sonar.passive {"source":"propeller","bearingDeg":82.09006184519122}
- 2778.4s sonar.passive {"source":"engine","bearingDeg":140.2292592713808}
- 2778.7s sonar.passive {"source":"engine","bearingDeg":134.7911966086748}
- 2779.1s sonar.passive {"source":"engine","bearingDeg":128.8332644232575}
- 2779.4s sonar.passive {"source":"engine","bearingDeg":134.23431299017625}
- 2779.9s sonar.passive {"source":"propeller","bearingDeg":87.25944144546489}
- 2780.0s sonar.passive {"source":"propeller","bearingDeg":87.00927274663968}
- 2781.4s sonar.passive {"source":"engine","bearingDeg":139.77210072126095}
- 2781.7s sonar.passive {"source":"engine","bearingDeg":134.6295592541144}
- 2782.1s sonar.passive {"source":"engine","bearingDeg":129.7263166585426}
- 2782.4s sonar.passive {"source":"engine","bearingDeg":134.58165894860556}
- 2782.9s sonar.passive {"source":"propeller","bearingDeg":87.11660593976097}
- 2783.0s sonar.passive {"source":"propeller","bearingDeg":87.0746720238594}
- 2784.4s sonar.passive {"source":"engine","bearingDeg":139.43491860770735}
- 2784.7s sonar.passive {"source":"engine","bearingDeg":133.9358647787408}
- 2785.1s sonar.passive {"source":"engine","bearingDeg":128.3446823670335}
- 2785.4s sonar.passive {"source":"engine","bearingDeg":133.89930723058882}
- 2785.9s sonar.passive {"source":"propeller","bearingDeg":86.45137114518668}
- 2785.9s sub.damaged {"source":"collision","amount":23,"hullLeft":0}
- 2785.9s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":75.37959007857309,...
