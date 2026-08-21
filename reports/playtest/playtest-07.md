# Playtest 07 — Generated Cargo Pair (t-014 evidence)

- **Version**: 95d3462
- **Mission**: GEN-02 — Generated Cargo Pair (seed 2002, difficulty 1/5)
- **Agent**: scripted-brain-generic-hunter (Generic hunter (generated missions))
- **Result**: **VICTORY** after 1393.4 s (27867 ticks)

## Actions

- pings: 85 · fire inputs: 2 · moving ticks: 27867 · turning ticks: 25151 · fire rejections (tail): 0
- strategy: Silent approach (SILENT band, Medium), ping to acquire range, fire at the nearest TRACKED-or-better contact ≤ 1.5 km; evade when detection ≥ 45 or an escort escalates inside 5 km.

## Result

- outcome: **VICTORY** · score 696.1202813262968 (Good) · hull 100 · battery 0.0% · detection 0.0
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
- objective 400 · damage 60 · stealth 0 · torpedoEfficiency 100 · time 86.1202813262968 · survival 50 · total 696.1202813262968 · grade Good

### Stats
- torpedoes fired 4 · hit 2 · remaining 0 · peak detection 100 · damage dealt 110.0

### Key events (tail)

- 1356.6s sonar.passive {"source":"torpedo","bearingDeg":99.49542733151874}
- 1357.7s sonar.passive {"source":"engine","bearingDeg":358.8803796205059}
- 1358.4s sonar.passive {"source":"engine","bearingDeg":70.08921270269008}
- 1360.7s sonar.passive {"source":"engine","bearingDeg":0.4348563933713194}
- 1361.5s sonar.passive {"source":"engine","bearingDeg":70.56929686796484}
- 1361.7s sonar.passive {"source":"torpedo","bearingDeg":99.56960753746638}
- 1361.7s sonar.passive {"source":"torpedo","bearingDeg":99.56960753746638}
- 1363.8s sonar.passive {"source":"engine","bearingDeg":358.95726340665954}
- 1364.5s sonar.passive {"source":"engine","bearingDeg":69.09895646318701}
- 1366.7s sonar.passive {"source":"torpedo","bearingDeg":99.64082209817997}
- 1366.7s sonar.passive {"source":"torpedo","bearingDeg":99.64082209817997}
- 1366.8s sonar.passive {"source":"engine","bearingDeg":359.4091068174702}
- 1367.6s sonar.passive {"source":"engine","bearingDeg":68.53244885950427}
- 1369.9s sonar.passive {"source":"engine","bearingDeg":0.27248207194674023}
- 1370.4s torpedo.expired {"torpedoId":"TP-02","targetShipId":"E-02"}
- 1370.4s torpedo.expired {"torpedoId":"TP-01","targetShipId":"E-02"}
- 1370.4s torpedo.ready {"tubeId":"T-03","targetContactId":"C-02"}
- 1370.4s torpedo.fired {"tubeId":"T-03","targetContactId":"C-02"}
- 1370.4s torpedo.ready {"tubeId":"T-04","targetContactId":"C-02"}
- 1370.4s torpedo.fired {"tubeId":"T-04","targetContactId":"C-02"}
- 1370.5s sonar.passive {"source":"torpedo","bearingDeg":357.788206839386}
- 1370.5s sonar.passive {"source":"torpedo","bearingDeg":357.788206839386}
- 1370.6s sonar.passive {"source":"engine","bearingDeg":68.23244983958476}
- 1372.9s sonar.passive {"source":"engine","bearingDeg":359.121225990083}
- 1373.4s sub.depthChanged {"layer":"Deep"}
- 1373.7s sonar.passive {"source":"engine","bearingDeg":66.88333210954107}
- 1375.5s sonar.passive {"source":"torpedo","bearingDeg":357.4827729661163}
- 1375.5s sonar.passive {"source":"torpedo","bearingDeg":357.4827729661163}
- 1376.0s sonar.passive {"source":"engine","bearingDeg":0.19850205219466943}
- 1376.7s sonar.passive {"source":"engine","bearingDeg":66.55951314588206}
- 1379.0s sonar.passive {"source":"engine","bearingDeg":358.98714803836714}
- 1379.8s sonar.passive {"source":"engine","bearingDeg":64.54284058137908}
- 1380.6s sonar.passive {"source":"torpedo","bearingDeg":357.18193109878365}
- 1380.6s sonar.passive {"source":"torpedo","bearingDeg":357.18193109878365}
- 1382.1s sonar.passive {"source":"engine","bearingDeg":359.61862912915785}
- 1382.8s sonar.passive {"source":"engine","bearingDeg":64.59879133417002}
- 1385.1s sonar.passive {"source":"engine","bearingDeg":358.88023873140617}
- 1385.6s sonar.passive {"source":"torpedo","bearingDeg":356.88870716376476}
- 1385.6s sonar.passive {"source":"torpedo","bearingDeg":356.88870716376476}
- 1385.9s sonar.passive {"source":"engine","bearingDeg":63.097091462620945}
- 1388.2s sonar.passive {"source":"engine","bearingDeg":356.7484204440174}
- 1388.9s sonar.passive {"source":"engine","bearingDeg":61.3586792755406}
- 1390.7s sonar.passive {"source":"torpedo","bearingDeg":356.605996492818}
- 1390.7s sonar.passive {"source":"torpedo","bearingDeg":356.605996492818}
- 1391.2s sonar.passive {"source":"engine","bearingDeg":355.58311471166155}
- 1392.0s sonar.passive {"source":"engine","bearingDeg":60.374753196091746}
- 1393.4s torpedo.hit {"torpedoId":"TP-04","targetShipId":"E-02","distM":40}
- 1393.4s ship.sunk {"shipId":"E-02","shipClass":"Cargo"}
- 1393.4s torpedo.hit {"torpedoId":"TP-03","targetShipId":"E-02","distM":40}
- 1393.4s mission.victory {"scoreParts":{"objective":400,"damage":60,"stealth":0,"torpedoEfficiency":100,"time":86.1202813262968,"survival":50,...
