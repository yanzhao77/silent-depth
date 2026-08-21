# Playtest 09 — Generated Convoy + Destroyer (t-014 evidence)

- **Version**: 95d3462
- **Mission**: GEN-04 — Generated Convoy + Destroyer (seed 2004, difficulty 2/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **DEFEAT** after 2735.1 s (54701 ticks)

## Actions

- pings: 292 · fire inputs: 0 · moving ticks: 54701 · turning ticks: 12320 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **DEFEAT** · score 143.91158138640196 (Failed) · hull 0 · battery 0.0% · detection 0.0
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
- objective 0 · damage 0 · stealth 0.03750000000001252 · torpedoEfficiency 100 · time 43.87408138640197 · survival 0 · total 143.91158138640196 · grade Failed

### Stats
- torpedoes fired 0 · hit 0 · remaining 5 · peak detection 99.975 · damage dealt 0.0

### Key events (tail)

- 2701.3s sonar.passive {"source":"engine","bearingDeg":140.9693225801021}
- 2701.3s sonar.passive {"source":"engine","bearingDeg":152.07051856163233}
- 2702.1s sonar.passive {"source":"engine","bearingDeg":147.0128578036781}
- 2702.6s sonar.passive {"source":"propeller","bearingDeg":95.73616257601498}
- 2704.3s sonar.passive {"source":"engine","bearingDeg":141.56068949053332}
- 2704.3s sonar.passive {"source":"engine","bearingDeg":151.55472026519027}
- 2705.1s sonar.passive {"source":"engine","bearingDeg":147.795761743611}
- 2705.6s sonar.passive {"source":"propeller","bearingDeg":107.98387647996749}
- 2707.3s sonar.passive {"source":"engine","bearingDeg":141.0883559331285}
- 2707.3s sonar.passive {"source":"engine","bearingDeg":151.09907133144105}
- 2708.1s sonar.passive {"source":"engine","bearingDeg":147.05927326054626}
- 2708.6s sonar.passive {"source":"propeller","bearingDeg":118.86401114017363}
- 2710.3s sonar.passive {"source":"engine","bearingDeg":140.6387460855442}
- 2710.3s sonar.passive {"source":"engine","bearingDeg":151.5300134714413}
- 2711.1s sonar.passive {"source":"engine","bearingDeg":146.7975103044558}
- 2711.6s sonar.passive {"source":"propeller","bearingDeg":130.6320268471658}
- 2713.3s sonar.passive {"source":"engine","bearingDeg":140.49381010703613}
- 2713.3s sonar.passive {"source":"engine","bearingDeg":150.95281941205317}
- 2714.1s sonar.passive {"source":"engine","bearingDeg":146.8711008323133}
- 2714.6s sonar.passive {"source":"propeller","bearingDeg":141.56842152725466}
- 2716.3s sonar.passive {"source":"engine","bearingDeg":140.77496544431176}
- 2716.3s sonar.passive {"source":"engine","bearingDeg":149.8204950488716}
- 2717.1s sonar.passive {"source":"engine","bearingDeg":146.4414106679704}
- 2717.6s sonar.passive {"source":"propeller","bearingDeg":152.782910886393}
- 2719.3s sonar.passive {"source":"engine","bearingDeg":139.04884361996903}
- 2719.3s sonar.passive {"source":"engine","bearingDeg":150.98133117812353}
- 2720.1s sonar.passive {"source":"engine","bearingDeg":147.27639567359182}
- 2720.6s sonar.passive {"source":"propeller","bearingDeg":162.69119703619702}
- 2722.3s sonar.passive {"source":"engine","bearingDeg":140.64273489342992}
- 2722.3s sonar.passive {"source":"engine","bearingDeg":149.7838743473597}
- 2723.1s sonar.passive {"source":"engine","bearingDeg":146.74102941244482}
- 2723.6s sonar.passive {"source":"propeller","bearingDeg":168.08117199775674}
- 2725.3s sonar.passive {"source":"engine","bearingDeg":140.01363003782376}
- 2725.3s sonar.passive {"source":"engine","bearingDeg":150.25090239396297}
- 2726.1s sonar.passive {"source":"engine","bearingDeg":147.11265796650164}
- 2726.6s sonar.passive {"source":"propeller","bearingDeg":170.48394452143165}
- 2728.3s sonar.passive {"source":"engine","bearingDeg":140.10216359740895}
- 2728.3s sonar.passive {"source":"engine","bearingDeg":151.22653233061465}
- 2729.1s sonar.passive {"source":"engine","bearingDeg":145.67365794788185}
- 2729.6s sonar.passive {"source":"propeller","bearingDeg":169.81281129278486}
- 2730.1s sub.damaged {"source":"collision","amount":18,"hullLeft":15}
- 2731.3s sonar.passive {"source":"engine","bearingDeg":138.5995628311441}
- 2731.3s sonar.passive {"source":"engine","bearingDeg":149.8183640792319}
- 2732.1s sonar.passive {"source":"engine","bearingDeg":145.7611504594632}
- 2732.6s sonar.passive {"source":"propeller","bearingDeg":168.09484564645672}
- 2734.3s sonar.passive {"source":"engine","bearingDeg":138.16724695400657}
- 2734.3s sonar.passive {"source":"engine","bearingDeg":149.87623017339698}
- 2735.1s sonar.passive {"source":"engine","bearingDeg":145.86646297091437}
- 2735.1s sub.damaged {"source":"collision","amount":19,"hullLeft":0}
- 2735.1s mission.defeat {"scoreParts":{"objective":0,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":100,"time":43.8740813864019...
