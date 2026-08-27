# Playtest 04 — Heavy Escort (t-014 evidence)

- **Version**: dbb2afa
- **Mission**: M04 — Heavy Escort (seed 1004, difficulty 4/5)
- **Agent**: scripted-brain-convoy-attack (Convoy attack (M03/M04 best effort))
- **Result**: **DEFEAT** after 2788.3 s (55764 ticks)

## Actions

- pings: 292 · fire inputs: 0 · moving ticks: 55764 · turning ticks: 14251 · fire rejections (tail): 0
- strategy: Approach the convoy at CRUISE, SILENT inside 2.5 km, ping for range, fire at the nearest ranged merchant contact ≤ fire range with a fresh ping; evade (Deep + silent + decoy) when detection is hot or an escort escalates.

## Result

- outcome: **DEFEAT** · score 75.35355845957007 (Failed) · hull 0 · battery 0.0% · detection 0.0
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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 0 · time 75.31605845957006 · survival 0 · total 75.35355845957007 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 4 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2764.9s sonar.passive {"source":"engine","bearingDeg":135.93799192271908}
- 2765.2s sonar.passive {"source":"engine","bearingDeg":142.68948934348134}
- 2766.1s sonar.passive {"source":"engine","bearingDeg":145.4743398912903}
- 2766.8s sonar.passive {"source":"propeller","bearingDeg":93.5657990980598}
- 2766.8s sonar.passive {"source":"propeller","bearingDeg":94.95488442420424}
- 2767.1s sonar.passive {"source":"engine","bearingDeg":138.74627594817883}
- 2767.9s sonar.passive {"source":"engine","bearingDeg":135.8480005440043}
- 2768.2s sonar.passive {"source":"engine","bearingDeg":142.28067026493574}
- 2769.1s sonar.passive {"source":"engine","bearingDeg":146.63443541648073}
- 2769.8s sonar.passive {"source":"propeller","bearingDeg":105.52736314641275}
- 2769.8s sonar.passive {"source":"propeller","bearingDeg":105.58371733081177}
- 2770.1s sonar.passive {"source":"engine","bearingDeg":139.14005707143377}
- 2770.9s sonar.passive {"source":"engine","bearingDeg":135.37071742395142}
- 2771.2s sonar.passive {"source":"engine","bearingDeg":141.36235362518767}
- 2772.1s sonar.passive {"source":"engine","bearingDeg":145.37307030242994}
- 2772.8s sonar.passive {"source":"propeller","bearingDeg":116.32356761309858}
- 2772.8s sonar.passive {"source":"propeller","bearingDeg":117.25763973864697}
- 2773.1s sonar.passive {"source":"engine","bearingDeg":139.67240975699968}
- 2773.9s sonar.passive {"source":"engine","bearingDeg":134.27009361396688}
- 2774.2s sonar.passive {"source":"engine","bearingDeg":140.64847208564777}
- 2775.1s sonar.passive {"source":"engine","bearingDeg":146.24383513492867}
- 2775.8s sonar.passive {"source":"propeller","bearingDeg":126.75764734103694}
- 2775.8s sonar.passive {"source":"propeller","bearingDeg":127.10701471938812}
- 2776.1s sonar.passive {"source":"engine","bearingDeg":139.69415414102545}
- 2776.9s sonar.passive {"source":"engine","bearingDeg":134.0519953552417}
- 2777.2s sonar.passive {"source":"engine","bearingDeg":140.40151963014577}
- 2778.1s sonar.passive {"source":"engine","bearingDeg":145.96787378471197}
- 2778.8s sonar.passive {"source":"propeller","bearingDeg":134.02779556260822}
- 2778.8s sonar.passive {"source":"propeller","bearingDeg":135.244802899092}
- 2779.1s sonar.passive {"source":"engine","bearingDeg":138.35867930234699}
- 2779.9s sonar.passive {"source":"engine","bearingDeg":133.76617362724082}
- 2780.2s sonar.passive {"source":"engine","bearingDeg":141.03869324827508}
- 2781.1s sonar.passive {"source":"engine","bearingDeg":146.1385245494103}
- 2781.8s sonar.passive {"source":"propeller","bearingDeg":141.57709470186498}
- 2781.8s sonar.passive {"source":"propeller","bearingDeg":141.83281909669026}
- 2782.1s sonar.passive {"source":"engine","bearingDeg":138.11704347788708}
- 2782.9s sonar.passive {"source":"engine","bearingDeg":133.7225318071098}
- 2783.2s sonar.passive {"source":"engine","bearingDeg":140.4892090750758}
- 2784.1s sonar.passive {"source":"engine","bearingDeg":145.31275811343707}
- 2784.8s sonar.passive {"source":"propeller","bearingDeg":141.83986317572135}
- 2784.8s sonar.passive {"source":"propeller","bearingDeg":142.33898512295235}
- 2785.1s sonar.passive {"source":"engine","bearingDeg":139.36564909352117}
- 2785.9s sonar.passive {"source":"engine","bearingDeg":134.12570018870215}
- 2786.2s sonar.passive {"source":"engine","bearingDeg":141.50734528775118}
- 2787.1s sonar.passive {"source":"engine","bearingDeg":144.7541952397034}
- 2787.8s sonar.passive {"source":"propeller","bearingDeg":141.94763586552975}
- 2787.8s sonar.passive {"source":"propeller","bearingDeg":141.32990780481344}
- 2788.1s sonar.passive {"source":"engine","bearingDeg":138.10547986829988}
- 2788.3s sub.damaged {"source":"collision","amount":23,"hullLeft":0}
- 2788.3s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":75.31605845957006,...
