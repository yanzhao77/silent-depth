# Playtest 05 — Silent Hunter (t-014 evidence)

- **Version**: 95d3462
- **Mission**: M05 — Silent Hunter (seed 1005, difficulty 5/5)
- **Agent**: scripted-brain-sink-and-escape (Sink then escape (M05 best effort))
- **Result**: **DEFEAT** after 1413.9 s (28278 ticks)

## Actions

- pings: 91 · fire inputs: 0 · moving ticks: 28278 · turning ticks: 27268 · fire rejections (tail): 0
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

- 1395.1s sonar.passive {"source":"engine","bearingDeg":84.47170467025259}
- 1395.3s sonar.passive {"source":"propeller","bearingDeg":93.77897951584167}
- 1395.4s sonar.passive {"source":"engine","bearingDeg":72.32607077779411}
- 1395.4s sonar.passive {"source":"propeller","bearingDeg":153.97164368456257}
- 1395.4s sonar.passive {"source":"propeller","bearingDeg":154.82996005909774}
- 1397.6s sonar.passive {"source":"engine","bearingDeg":82.63333061507079}
- 1398.0s sonar.passive {"source":"engine","bearingDeg":69.5146069994612}
- 1398.2s sonar.passive {"source":"engine","bearingDeg":83.63944787687171}
- 1398.4s sonar.passive {"source":"propeller","bearingDeg":93.07770293114118}
- 1398.4s sonar.passive {"source":"engine","bearingDeg":71.92929616351768}
- 1398.4s sonar.passive {"source":"propeller","bearingDeg":144.68331781104763}
- 1398.4s sonar.passive {"source":"propeller","bearingDeg":145.548077612635}
- 1400.6s sonar.passive {"source":"engine","bearingDeg":83.55103741869785}
- 1401.0s sonar.passive {"source":"engine","bearingDeg":69.0777442055395}
- 1401.2s sonar.passive {"source":"engine","bearingDeg":83.8570502591281}
- 1401.4s sonar.passive {"source":"propeller","bearingDeg":94.62539299479359}
- 1401.5s sonar.passive {"source":"engine","bearingDeg":71.94402756039682}
- 1401.5s sonar.passive {"source":"propeller","bearingDeg":138.04650824290982}
- 1401.5s sonar.passive {"source":"propeller","bearingDeg":137.2153560827894}
- 1403.7s sonar.passive {"source":"engine","bearingDeg":83.92531931550111}
- 1404.1s sonar.passive {"source":"engine","bearingDeg":68.03782818337214}
- 1404.3s sonar.passive {"source":"engine","bearingDeg":83.94689058648343}
- 1404.5s sonar.passive {"source":"propeller","bearingDeg":94.6464825948428}
- 1404.5s sonar.passive {"source":"engine","bearingDeg":71.31402327438848}
- 1404.5s sonar.passive {"source":"propeller","bearingDeg":134.97489504466415}
- 1404.5s sonar.passive {"source":"propeller","bearingDeg":135.82787565983153}
- 1406.7s sonar.passive {"source":"engine","bearingDeg":83.21048367007559}
- 1407.1s sonar.passive {"source":"engine","bearingDeg":69.2964724586854}
- 1407.3s sonar.passive {"source":"engine","bearingDeg":84.28395040545476}
- 1407.5s sonar.passive {"source":"propeller","bearingDeg":94.85694282858327}
- 1407.6s sonar.passive {"source":"engine","bearingDeg":71.89028011717454}
- 1407.6s sonar.passive {"source":"propeller","bearingDeg":136.59564927912615}
- 1407.6s sonar.passive {"source":"propeller","bearingDeg":137.41652201837783}
- 1408.9s sub.damaged {"source":"collision","amount":14,"hullLeft":3}
- 1409.8s sonar.passive {"source":"engine","bearingDeg":83.69551212947695}
- 1410.2s sonar.passive {"source":"engine","bearingDeg":69.18507527210834}
- 1410.4s sonar.passive {"source":"engine","bearingDeg":84.66377126710893}
- 1410.6s sonar.passive {"source":"propeller","bearingDeg":94.61855244917115}
- 1410.6s sonar.passive {"source":"engine","bearingDeg":71.5735928720019}
- 1410.6s sonar.passive {"source":"propeller","bearingDeg":138.71996723212825}
- 1410.6s sonar.passive {"source":"propeller","bearingDeg":138.5275678204119}
- 1412.8s sonar.passive {"source":"engine","bearingDeg":83.71688640344064}
- 1413.2s sonar.passive {"source":"engine","bearingDeg":68.87601394965968}
- 1413.4s sonar.passive {"source":"engine","bearingDeg":84.2997290330917}
- 1413.6s sonar.passive {"source":"propeller","bearingDeg":96.75234648765401}
- 1413.7s sonar.passive {"source":"engine","bearingDeg":72.34254841849213}
- 1413.7s sonar.passive {"source":"propeller","bearingDeg":305.7097822411751}
- 1413.7s sonar.passive {"source":"propeller","bearingDeg":319.95351084939495}
- 1413.9s sub.damaged {"source":"collision","amount":16,"hullLeft":0}
- 1413.9s mission.defeat {"scoreParts":{"objective":150,"damage":0,"stealth":0.03750000000001252,"torpedoEfficiency":0,"time":100,"survival":5...
