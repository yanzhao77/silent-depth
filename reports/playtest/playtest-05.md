# Playtest 05 — Silent Hunter (t-014 evidence)

- **Version**: b3ef948
- **Mission**: M05 — Silent Hunter (seed 1005, difficulty 5/5)
- **Agent**: scripted-brain-sink-and-escape (Sink then escape (M05 best effort))
- **Result**: **DEFEAT** after 1405.5 s (28110 ticks)

## Actions

- pings: 90 · fire inputs: 0 · moving ticks: 28110 · turning ticks: 26870 · fire rejections (tail): 0
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

- 1386.9s sonar.passive {"source":"propeller","bearingDeg":154.42617728347923}
- 1386.9s sonar.passive {"source":"propeller","bearingDeg":154.0515161159987}
- 1387.0s sonar.passive {"source":"engine","bearingDeg":68.64958791681451}
- 1387.1s sonar.passive {"source":"engine","bearingDeg":83.97264577232936}
- 1387.1s sonar.passive {"source":"propeller","bearingDeg":92.89758449830623}
- 1387.5s sonar.passive {"source":"engine","bearingDeg":70.79009783139739}
- 1389.5s sonar.passive {"source":"engine","bearingDeg":83.92712754937706}
- 1390.0s sonar.passive {"source":"propeller","bearingDeg":146.25739696782873}
- 1390.0s sonar.passive {"source":"propeller","bearingDeg":146.20201618604645}
- 1390.1s sonar.passive {"source":"engine","bearingDeg":67.5557472956767}
- 1390.1s sonar.passive {"source":"engine","bearingDeg":85.13899133901585}
- 1390.1s sonar.passive {"source":"propeller","bearingDeg":93.93735178306338}
- 1390.5s sonar.passive {"source":"engine","bearingDeg":71.37435019902998}
- 1392.6s sonar.passive {"source":"engine","bearingDeg":83.8075373516309}
- 1393.0s sonar.passive {"source":"propeller","bearingDeg":138.24379343200258}
- 1393.0s sonar.passive {"source":"propeller","bearingDeg":137.62256445585405}
- 1393.1s sonar.passive {"source":"engine","bearingDeg":66.93506129069404}
- 1393.2s sonar.passive {"source":"engine","bearingDeg":83.90468979463564}
- 1393.2s sonar.passive {"source":"propeller","bearingDeg":94.32705351528905}
- 1393.6s sonar.passive {"source":"engine","bearingDeg":71.21813562905072}
- 1395.6s sonar.passive {"source":"engine","bearingDeg":83.45547130265886}
- 1396.1s sonar.passive {"source":"propeller","bearingDeg":135.79772654030293}
- 1396.1s sonar.passive {"source":"propeller","bearingDeg":135.69533752901117}
- 1396.2s sonar.passive {"source":"engine","bearingDeg":68.64497667987659}
- 1396.2s sonar.passive {"source":"engine","bearingDeg":83.55540870171357}
- 1396.2s sonar.passive {"source":"propeller","bearingDeg":94.48176602460806}
- 1396.6s sonar.passive {"source":"engine","bearingDeg":72.62737997933235}
- 1398.7s sonar.passive {"source":"engine","bearingDeg":82.87063727981835}
- 1399.1s sonar.passive {"source":"propeller","bearingDeg":136.96730437998536}
- 1399.1s sonar.passive {"source":"propeller","bearingDeg":136.4102610859111}
- 1399.2s sonar.passive {"source":"engine","bearingDeg":67.4926004606585}
- 1399.3s sonar.passive {"source":"engine","bearingDeg":84.493978495375}
- 1399.3s sonar.passive {"source":"propeller","bearingDeg":94.09634636473626}
- 1399.7s sonar.passive {"source":"engine","bearingDeg":70.7915256402362}
- 1400.5s sub.damaged {"source":"collision","amount":14,"hullLeft":3}
- 1401.7s sonar.passive {"source":"engine","bearingDeg":84.08697635888898}
- 1402.2s sonar.passive {"source":"propeller","bearingDeg":137.7542966940673}
- 1402.2s sonar.passive {"source":"propeller","bearingDeg":138.78235470951296}
- 1402.3s sonar.passive {"source":"engine","bearingDeg":66.90583575649009}
- 1402.3s sonar.passive {"source":"engine","bearingDeg":84.57498613973681}
- 1402.3s sonar.passive {"source":"propeller","bearingDeg":94.6774830892763}
- 1402.7s sonar.passive {"source":"engine","bearingDeg":71.41335485043768}
- 1404.8s sonar.passive {"source":"engine","bearingDeg":84.31001061775147}
- 1405.2s sonar.passive {"source":"propeller","bearingDeg":306.55520343690637}
- 1405.2s sonar.passive {"source":"propeller","bearingDeg":319.05191486359547}
- 1405.3s sonar.passive {"source":"engine","bearingDeg":67.1735076430727}
- 1405.4s sonar.passive {"source":"engine","bearingDeg":83.73890197158491}
- 1405.4s sonar.passive {"source":"propeller","bearingDeg":95.48015053180679}
- 1405.5s sub.damaged {"source":"collision","amount":16,"hullLeft":0}
- 1405.5s mission.defeat {"scoreParts":{"objective":150,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":5...
