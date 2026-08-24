# Playtest 04 — Heavy Escort (t-014 evidence)

- **Version**: b739063
- **Mission**: M04 — Heavy Escort (seed 1004, difficulty 4/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 2786.4 s (55727 ticks)

## Actions

- pings: 292 · fire inputs: 0 · moving ticks: 55727 · turning ticks: 13661 · fire rejections (tail): 0
- strategy: Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.

## Result

- outcome: **DEFEAT** · score 75.40356373811967 (Failed) · hull 0 · battery 0.0% · detection 0.0
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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 75.36606373811966 · survival 0 · total 75.40356373811967 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2762.9s sonar.passive {"source":"engine","bearingDeg":139.1411079746587}
- 2763.0s sonar.passive {"source":"engine","bearingDeg":140.5595391349592}
- 2763.2s sonar.passive {"source":"engine","bearingDeg":133.0197959496725}
- 2764.6s sonar.passive {"source":"propeller","bearingDeg":231.18055277456963}
- 2764.7s sonar.passive {"source":"propeller","bearingDeg":95.5758599935843}
- 2764.9s sonar.passive {"source":"engine","bearingDeg":145.5606043928169}
- 2765.9s sonar.passive {"source":"engine","bearingDeg":137.76075534181422}
- 2766.0s sonar.passive {"source":"engine","bearingDeg":140.44674130405272}
- 2766.2s sonar.passive {"source":"engine","bearingDeg":133.69995015697418}
- 2767.6s sonar.passive {"source":"propeller","bearingDeg":218.40505582465542}
- 2767.7s sonar.passive {"source":"propeller","bearingDeg":108.78902858992168}
- 2767.9s sonar.passive {"source":"engine","bearingDeg":144.3776344786944}
- 2768.9s sonar.passive {"source":"engine","bearingDeg":138.26996696790982}
- 2769.0s sonar.passive {"source":"engine","bearingDeg":140.98281775741134}
- 2769.2s sonar.passive {"source":"engine","bearingDeg":134.12515729984858}
- 2770.6s sonar.passive {"source":"propeller","bearingDeg":205.15579231413636}
- 2770.7s sonar.passive {"source":"propeller","bearingDeg":121.25651398224713}
- 2770.9s sonar.passive {"source":"engine","bearingDeg":144.8078911637445}
- 2771.9s sonar.passive {"source":"engine","bearingDeg":137.15839422634787}
- 2772.0s sonar.passive {"source":"engine","bearingDeg":140.79286264782334}
- 2772.2s sonar.passive {"source":"engine","bearingDeg":132.86560386982367}
- 2773.6s sonar.passive {"source":"propeller","bearingDeg":193.70013457863317}
- 2773.7s sonar.passive {"source":"propeller","bearingDeg":132.68711470999884}
- 2773.9s sonar.passive {"source":"engine","bearingDeg":144.74363125150913}
- 2774.9s sonar.passive {"source":"engine","bearingDeg":137.90773146470386}
- 2775.0s sonar.passive {"source":"engine","bearingDeg":140.02561273307103}
- 2775.2s sonar.passive {"source":"engine","bearingDeg":134.22366422331885}
- 2776.6s sonar.passive {"source":"propeller","bearingDeg":182.7506508921335}
- 2776.7s sonar.passive {"source":"propeller","bearingDeg":142.9941331166565}
- 2776.9s sonar.passive {"source":"engine","bearingDeg":144.91219607936665}
- 2777.9s sonar.passive {"source":"engine","bearingDeg":137.95672097314267}
- 2778.0s sonar.passive {"source":"engine","bearingDeg":138.72288105799484}
- 2778.2s sonar.passive {"source":"engine","bearingDeg":132.974523311819}
- 2779.6s sonar.passive {"source":"propeller","bearingDeg":172.853320399403}
- 2779.7s sonar.passive {"source":"propeller","bearingDeg":153.62841443288164}
- 2779.9s sonar.passive {"source":"engine","bearingDeg":144.5212572911028}
- 2780.9s sonar.passive {"source":"engine","bearingDeg":136.78525008654879}
- 2781.0s sonar.passive {"source":"engine","bearingDeg":139.22203734329}
- 2781.2s sonar.passive {"source":"engine","bearingDeg":133.99896764619433}
- 2782.6s sonar.passive {"source":"propeller","bearingDeg":165.18101061779413}
- 2782.7s sonar.passive {"source":"propeller","bearingDeg":161.3837090405296}
- 2782.9s sonar.passive {"source":"engine","bearingDeg":144.80069434165148}
- 2783.9s sonar.passive {"source":"engine","bearingDeg":137.51419027613923}
- 2784.0s sonar.passive {"source":"engine","bearingDeg":139.99561030990915}
- 2784.2s sonar.passive {"source":"engine","bearingDeg":133.47149165574842}
- 2785.6s sonar.passive {"source":"propeller","bearingDeg":162.14050990730806}
- 2785.7s sonar.passive {"source":"propeller","bearingDeg":161.7627938911673}
- 2785.9s sonar.passive {"source":"engine","bearingDeg":143.15678011909193}
- 2786.4s sub.damaged {"source":"collision","amount":23,"hullLeft":0}
- 2786.4s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":75.36606373811966,...
