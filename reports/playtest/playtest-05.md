# Playtest 05 — Silent Hunter (t-014 evidence)

- **Version**: 19a428b
- **Mission**: M05 — Silent Hunter (seed 1005, difficulty 5/5)
- **Agent**: scripted-brain-sink-and-escape (Sink then escape (M05 best effort))
- **Result**: **DEFEAT** after 1410.9 s (28217 ticks)

## Actions

- pings: 90 · fire inputs: 0 · moving ticks: 28217 · turning ticks: 26977 · fire rejections (tail): 0
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

- 1391.5s sonar.passive {"source":"engine","bearingDeg":64.04793455843654}
- 1391.8s sonar.passive {"source":"engine","bearingDeg":67.92314595346691}
- 1391.9s sonar.passive {"source":"propeller","bearingDeg":46.361478440015276}
- 1391.9s sonar.passive {"source":"propeller","bearingDeg":46.38369321551991}
- 1392.5s sonar.passive {"source":"engine","bearingDeg":77.79144618073217}
- 1393.1s sonar.passive {"source":"engine","bearingDeg":79.88968423468846}
- 1394.2s sonar.passive {"source":"propeller","bearingDeg":85.64041173827924}
- 1394.5s sonar.passive {"source":"engine","bearingDeg":63.32016040542376}
- 1394.9s sonar.passive {"source":"engine","bearingDeg":66.98697298056115}
- 1395.0s sonar.passive {"source":"propeller","bearingDeg":56.71644474320156}
- 1395.0s sonar.passive {"source":"propeller","bearingDeg":56.6069090177018}
- 1395.6s sonar.passive {"source":"engine","bearingDeg":77.61206745395567}
- 1396.1s sonar.passive {"source":"engine","bearingDeg":79.0593587494453}
- 1397.2s sonar.passive {"source":"propeller","bearingDeg":86.0020442689498}
- 1397.6s sonar.passive {"source":"engine","bearingDeg":63.12601337872331}
- 1397.9s sonar.passive {"source":"engine","bearingDeg":67.93050735436431}
- 1398.0s sonar.passive {"source":"propeller","bearingDeg":63.60013476726089}
- 1398.0s sonar.passive {"source":"propeller","bearingDeg":63.8444581266752}
- 1398.6s sonar.passive {"source":"engine","bearingDeg":77.20681817226091}
- 1399.2s sonar.passive {"source":"engine","bearingDeg":79.84766240069546}
- 1400.3s sonar.passive {"source":"propeller","bearingDeg":85.33485198437249}
- 1400.6s sonar.passive {"source":"engine","bearingDeg":61.846194160083435}
- 1401.0s sonar.passive {"source":"engine","bearingDeg":67.68480651840106}
- 1401.1s sonar.passive {"source":"propeller","bearingDeg":68.53007259398967}
- 1401.1s sonar.passive {"source":"propeller","bearingDeg":68.37469301953284}
- 1401.7s sonar.passive {"source":"engine","bearingDeg":76.66802423259068}
- 1402.2s sonar.passive {"source":"engine","bearingDeg":79.06429719079061}
- 1403.3s sonar.passive {"source":"propeller","bearingDeg":84.88941535424246}
- 1403.7s sonar.passive {"source":"engine","bearingDeg":61.852775867061276}
- 1404.0s sonar.passive {"source":"engine","bearingDeg":67.62146576141315}
- 1404.1s sonar.passive {"source":"propeller","bearingDeg":67.31952232013202}
- 1404.1s sonar.passive {"source":"propeller","bearingDeg":66.82819540791124}
- 1404.7s sonar.passive {"source":"engine","bearingDeg":75.69117831743522}
- 1405.3s sonar.passive {"source":"engine","bearingDeg":78.43780120155901}
- 1405.8s sub.damaged {"source":"collision","amount":14,"hullLeft":3}
- 1406.4s sonar.passive {"source":"propeller","bearingDeg":85.24954913629378}
- 1406.7s sonar.passive {"source":"engine","bearingDeg":61.66774672802525}
- 1407.1s sonar.passive {"source":"engine","bearingDeg":66.52078567839978}
- 1407.2s sonar.passive {"source":"propeller","bearingDeg":65.84713051474205}
- 1407.2s sonar.passive {"source":"propeller","bearingDeg":65.2317639245284}
- 1407.8s sonar.passive {"source":"engine","bearingDeg":75.32102474194467}
- 1408.3s sonar.passive {"source":"engine","bearingDeg":78.46667012691626}
- 1409.4s sonar.passive {"source":"propeller","bearingDeg":84.68672616003563}
- 1409.8s sonar.passive {"source":"engine","bearingDeg":62.16969854019083}
- 1410.1s sonar.passive {"source":"engine","bearingDeg":66.06614522925338}
- 1410.2s sonar.passive {"source":"propeller","bearingDeg":255.15458892104925}
- 1410.2s sonar.passive {"source":"propeller","bearingDeg":272.71278852429737}
- 1410.8s sonar.passive {"source":"engine","bearingDeg":76.56684858521574}
- 1410.9s sub.damaged {"source":"collision","amount":16,"hullLeft":0}
- 1410.9s mission.defeat {"scoreParts":{"objective":150,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":5...
