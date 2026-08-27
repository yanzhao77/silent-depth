# Playtest 07 — Generated Cargo Pair (t-014 evidence)

- **Version**: 0be1659
- **Mission**: GEN-02 — Generated Cargo Pair (seed 2002, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **VICTORY** after 1375.1 s (27502 ticks)

## Actions

- pings: 83 · fire inputs: 2 · moving ticks: 27502 · turning ticks: 23990 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **VICTORY** · score 697.2632076501192 (Good) · hull 100 · battery 0.0% · detection 0.0
- sunk: E-02 (Cargo) · damage dealt: 110.0 hull points

## Failure

none — Objective met — mission completed.

## Difficulty

1/5

## Bugs (observed anomalies)

- Torpedo efficiency 2/4 (50%) — 2 torpedo(es) missed or expired without a hit at the effective fire range.
- Shared detection peaked at 100 (≥ 40) — merchants ALERT-scatter (turn 30°, speed to 11 kt for 60 s), which invalidates the lead estimate of in-flight fire solutions.
- Battery pressure: 0% remaining — ping cost (2 %/ping) and CRUISE drain (0.3 %/s) close off long approach-and-fire sequences.
- Detection pegged at 100 despite victory — with no escorts the meter had no combat consequence, but the stealth score component is zeroed: ping self-exposure (+12/ping) accumulates with no silent-running sink over a long session.

## Recommendations

- Balance (t-015): merchant ALERT threshold at detection 40 makes every long shot unreliable after any ping exposure; consider 50+, or a shorter/faster scatter so fire solutions stay predictive.
- Balance (t-015): battery budget — repeated range pings plus CRUISE approach drain make long missions battery-starved; consider a cheaper ping or lower CRUISE drain.
- Balance (t-015): add an ambient detection sink when silent running is off (STOPPED/Medium), so long no-escort sessions do not silently zero the stealth component.

## Evidence

### Score parts
- objective 400 · damage 60 · stealth 0 · torpedoEfficiency 100 · time 87.26320765011914 · survival 50 · total 697.2632076501192 · grade Good

### Stats
- torpedoes fired 4 · hit 2 · remaining 0 · peak detection 100 · damage dealt 110.0

### Key events (tail)

- 1339.7s sonar.passive {"source":"torpedo","bearingDeg":99.99445338020548}
- 1340.6s sonar.passive {"source":"engine","bearingDeg":0.18842081035739966}
- 1341.6s sonar.passive {"source":"engine","bearingDeg":70.61518784823221}
- 1343.7s sonar.passive {"source":"engine","bearingDeg":359.8600995487518}
- 1344.6s sonar.passive {"source":"engine","bearingDeg":70.23923175147634}
- 1344.7s sonar.passive {"source":"torpedo","bearingDeg":100.06921317846052}
- 1344.7s sonar.passive {"source":"torpedo","bearingDeg":100.06921317846052}
- 1346.7s sonar.passive {"source":"engine","bearingDeg":0.20434946042769297}
- 1347.7s sonar.passive {"source":"engine","bearingDeg":68.38116765768379}
- 1349.8s sonar.passive {"source":"engine","bearingDeg":359.13613357905325}
- 1349.8s sonar.passive {"source":"torpedo","bearingDeg":100.14094032052849}
- 1349.8s sonar.passive {"source":"torpedo","bearingDeg":100.14094032052849}
- 1350.7s sonar.passive {"source":"engine","bearingDeg":69.24372058563083}
- 1352.8s sonar.passive {"source":"engine","bearingDeg":358.9988686921139}
- 1353.4s torpedo.expired {"torpedoId":"TP-02","targetShipId":"E-02"}
- 1353.4s torpedo.expired {"torpedoId":"TP-01","targetShipId":"E-02"}
- 1353.5s torpedo.ready {"tubeId":"T-03","targetContactId":"C-02"}
- 1353.5s torpedo.fired {"tubeId":"T-03","targetContactId":"C-02"}
- 1353.5s torpedo.ready {"tubeId":"T-04","targetContactId":"C-02"}
- 1353.5s torpedo.fired {"tubeId":"T-04","targetContactId":"C-02"}
- 1353.5s sonar.passive {"source":"torpedo","bearingDeg":358.2327749836528}
- 1353.5s sonar.passive {"source":"torpedo","bearingDeg":358.2327749836528}
- 1353.8s sonar.passive {"source":"engine","bearingDeg":67.15476840452092}
- 1355.9s sonar.passive {"source":"engine","bearingDeg":358.8349070888825}
- 1356.5s sub.depthChanged {"layer":"Deep"}
- 1356.8s sonar.passive {"source":"engine","bearingDeg":65.87375496314797}
- 1358.6s sonar.passive {"source":"torpedo","bearingDeg":357.92698597141043}
- 1358.6s sonar.passive {"source":"torpedo","bearingDeg":357.92698597141043}
- 1358.9s sonar.passive {"source":"engine","bearingDeg":359.91837824402285}
- 1359.9s sonar.passive {"source":"engine","bearingDeg":65.91767165861764}
- 1362.0s sonar.passive {"source":"engine","bearingDeg":0.0925119839774311}
- 1362.9s sonar.passive {"source":"engine","bearingDeg":64.67984599830781}
- 1363.6s sonar.passive {"source":"torpedo","bearingDeg":357.62542707623913}
- 1363.6s sonar.passive {"source":"torpedo","bearingDeg":357.62542707623913}
- 1365.0s sonar.passive {"source":"engine","bearingDeg":358.087724693376}
- 1366.0s sonar.passive {"source":"engine","bearingDeg":64.71962599890699}
- 1368.1s sonar.passive {"source":"engine","bearingDeg":358.9625205406538}
- 1368.7s sonar.passive {"source":"torpedo","bearingDeg":357.3311356754628}
- 1368.7s sonar.passive {"source":"torpedo","bearingDeg":357.3311356754628}
- 1369.0s sonar.passive {"source":"engine","bearingDeg":64.04563429581296}
- 1371.1s sonar.passive {"source":"engine","bearingDeg":357.5125324582977}
- 1372.1s sonar.passive {"source":"engine","bearingDeg":61.38648431009912}
- 1373.7s sonar.passive {"source":"torpedo","bearingDeg":357.0470240894913}
- 1373.7s sonar.passive {"source":"torpedo","bearingDeg":357.0470240894913}
- 1374.2s sonar.passive {"source":"engine","bearingDeg":356.3323246842227}
- 1375.1s sonar.passive {"source":"engine","bearingDeg":61.55999037317266}
- 1375.1s torpedo.hit {"torpedoId":"TP-04","targetShipId":"E-02","distM":55}
- 1375.1s ship.sunk {"shipId":"E-02","shipClass":"Cargo"}
- 1375.1s torpedo.hit {"torpedoId":"TP-03","targetShipId":"E-02","distM":55}
- 1375.1s mission.victory {"scoreParts":{"objective":400,"damage":60,"stealth":0,"torpedoEfficiency":100,"time":87.26320765011914,"survival":50...
